import {
  SalesTransaction,
  SalesTransactionDetail,
  PaginatedResult,
  Service,
  Product,
  TransactionRequestData,
  TransactionCreationResult,
  TransactionRequestItem,
  PaymentMethodRequest,
  SingleItemTransactionCreationResult,
  SingleItemTransactionRequestData,
  ItemPricing,
  ProcessPartialPaymentDataWithHandler,
  PartialPaymentResult,
} from '../types/SaleTransactionTypes.js';
import prisma, { getPrisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

const roundTo2Decimals = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const getSalesTransactionList = async (
  filter?: string,
  searchQuery?: string,
  memberSearchQuery?: string,
  sortField: string = 'transaction_id',
  sortDirection: string = 'desc',
  page: number = 1,
  limit: number = 10,
): Promise<PaginatedResult<SalesTransaction>> => {
  try {
    const prisma = getPrisma();
    const whereConditions: Prisma.SaleTransactionWhereInput[] = [];

    // Handle sales transaction type filter
    if (filter) {
      switch (filter.toLowerCase()) {
        case 'full':
          whereConditions.push({ saleTransactionStatus: 'FULL' });
          break;
        case 'partial':
          whereConditions.push({ saleTransactionStatus: 'PARTIAL' });
          break;
        case 'package':
          whereConditions.push({
            saleTransactionItems: {
              some: { memberCarePackageId: { not: null } },
            },
          });
          break;
        case 'service':
          whereConditions.push({
            saleTransactionItems: {
              some: {
                memberCarePackageId: null,
                memberVoucherId: null,
                serviceName: { not: null },
              },
            },
          });
          break;
        case 'product':
          whereConditions.push({
            saleTransactionItems: {
              some: {
                memberCarePackageId: null,
                memberVoucherId: null,
                productName: { not: null },
              },
            },
          });
          break;
        case 'voucher':
          whereConditions.push({
            saleTransactionItems: {
              some: { memberVoucherId: { not: null } },
            },
          });
          break;
        case 'top_up':
          whereConditions.push({
            saleTransactionItems: {
              some: { itemType: 'top_up' },
            },
          });
          break;
      }
    }

    // Handle search queries
    if (searchQuery) {
      whereConditions.push({
        receiptNo: { contains: searchQuery, mode: 'insensitive' },
      });
    }

    if (memberSearchQuery) {
      whereConditions.push({
        member: { name: { contains: memberSearchQuery, mode: 'insensitive' } },
      });
    }

    const whereClause: Prisma.SaleTransactionWhereInput = whereConditions.length > 0 ? { AND: whereConditions } : {};

    // Get total count
    const totalItems = await prisma.saleTransaction.count({ where: whereClause });

    // Calculate pagination
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(totalItems / limit);

    // Handle sorting
    let orderBy: Prisma.SaleTransactionOrderByWithRelationInput = { id: 'desc' };

    switch (sortField) {
      case 'transaction_id':
        orderBy = { id: sortDirection as 'asc' | 'desc' };
        break;
      case 'receipt_no':
        orderBy = { receiptNo: sortDirection as 'asc' | 'desc' };
        break;
      case 'member_name':
        orderBy = { member: { name: sortDirection as 'asc' | 'desc' } };
        break;
      case 'date':
        orderBy = { createdAt: sortDirection as 'asc' | 'desc' };
        break;
      case 'outstanding':
        orderBy = { outstandingTotalPaymentAmount: sortDirection as 'asc' | 'desc' };
        break;
    }

    // Main query for sales transactions
    const salesTransactions = await prisma.saleTransaction.findMany({
      where: whereClause,
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            contact: true,
          },
        },
        saleTransactionItems: {
          select: {
            serviceName: true,
            productName: true,
            memberCarePackageId: true,
            memberVoucherId: true,
            itemType: true,
          },
        },
        paymentToSaleTransactions: {
          include: {
            paymentMethod: {
              select: {
                paymentMethodName: true,
              },
            },
          },
        },
      },
      orderBy,
      skip: offset,
      take: limit,
    });

    // Transform the data
    const transformedTransactions: SalesTransaction[] = salesTransactions.map((transaction) => {
      const payments = transaction.paymentToSaleTransactions.map((payment) => ({
        amount: Number(payment.amount || 0),
        payment_method: payment.paymentMethod?.paymentMethodName || '',
      }));

      const has_services = transaction.saleTransactionItems.some(
        (item) => item.serviceName && !item.memberCarePackageId && !item.memberVoucherId,
      );
      const has_products = transaction.saleTransactionItems.some(
        (item) => item.productName && !item.memberCarePackageId && !item.memberVoucherId,
      );
      const has_care_packages = transaction.saleTransactionItems.some((item) => item.memberCarePackageId !== null);
      const has_top_ups = transaction.saleTransactionItems.some((item) => item.itemType === 'top_up');

      const totalAmount =
        Number(transaction.totalPaidAmount || 0) + Number(transaction.outstandingTotalPaymentAmount || 0);
      const paidSum = roundTo2Decimals(
        transaction.paymentToSaleTransactions.reduce((sum, p) => {
          const pid = (p as any).paymentMethodId ? Number((p as any).paymentMethodId) : undefined;
          const isPending = pid === 7;
          return sum + (isPending ? 0 : Number(p.amount || 0));
        }, 0),
      );
      const outstanding = roundTo2Decimals(Math.max(totalAmount - paidSum, 0));
      const status: 'FULL' | 'PARTIAL' = outstanding <= 0 ? 'FULL' : 'PARTIAL';

      return {
        transaction_id: transaction.id.toString(),
        transaction_display_id: transaction.receiptNo
          ? `${transaction.id.toString()} (${transaction.receiptNo})`
          : transaction.id.toString(),
        receipt_no: transaction.receiptNo || '',
        customer_type: transaction.customerType || '',
        total_transaction_amount: totalAmount,
        total_paid_amount: paidSum,
        outstanding_total_payment_amount: outstanding,
        transaction_status: status,
        transaction_created_at: transaction.createdAt ? transaction.createdAt.toISOString() : new Date().toISOString(),
        has_services,
        has_products,
        has_care_packages,
        has_top_ups,
        process_payment: transaction.processPayment || false,
        member: transaction.member
          ? {
              id: transaction.member.id.toString(),
              name: transaction.member.name,
              email: transaction.member.email || '',
              contact: transaction.member.contact || '',
            }
          : null,
        payments,
      };
    });

    return {
      items: transformedTransactions,
      total: totalItems,
      totalPages,
      currentPage: page,
    };
  } catch (error) {
    console.error('Error in getSalesTransactionList:', error);
    throw new Error('Failed to fetch sales transaction list');
  }
};

const getSalesTransactionById = async (id: string): Promise<SalesTransactionDetail | null> => {
  try {
    const prisma = getPrisma();

    // Fetch transaction with all related data
    const transaction = await prisma.saleTransaction.findUnique({
      where: { id: BigInt(id) },
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            contact: true,
          },
        },
        handledByEmployee: {
          select: {
            id: true,
            employeeCode: true,
            employeeName: true,
          },
        },
        createdByEmployee: {
          select: {
            id: true,
            employeeCode: true,
            employeeName: true,
          },
        },
        saleTransactionItems: {
          include: {
            memberVoucher: {
              select: {
                id: true,
                memberVoucherName: true,
                currentBalance: true,
                status: true,
              },
            },
            memberCarePackage: {
              select: {
                id: true,
                packageName: true,
                balance: true,
                status: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
        paymentToSaleTransactions: {
          include: {
            paymentMethod: {
              select: {
                id: true,
                paymentMethodName: true,
              },
            },
            createdByEmployee: {
              select: {
                id: true,
                employeeCode: true,
                employeeName: true,
              },
            },
            updatedByEmployee: {
              select: {
                id: true,
                employeeCode: true,
                employeeName: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!transaction) {
      return null;
    }

    // Calculate total amount
    const totalAmount = roundTo2Decimals(
      Number(transaction.totalPaidAmount || 0) + Number(transaction.outstandingTotalPaymentAmount || 0),
    );

    // Calculate item type flags
    const hasServices = transaction.saleTransactionItems.some((item) => item.serviceName !== null);
    const hasProducts = transaction.saleTransactionItems.some((item) => item.productName !== null);
    const hasCarePackages = transaction.saleTransactionItems.some((item) => item.memberCarePackageId !== null);

    const transformedTransaction: SalesTransactionDetail = {
      transaction_id: transaction.id.toString(),
      transaction_display_id: transaction.receiptNo
        ? `${transaction.id.toString()} (${transaction.receiptNo})`
        : transaction.id.toString(),
      receipt_no: transaction.receiptNo || '',
      customer_type: transaction.customerType || '',
      total_transaction_amount: totalAmount,
      total_paid_amount: roundTo2Decimals(Number(transaction.totalPaidAmount || 0)),
      outstanding_total_payment_amount: roundTo2Decimals(Number(transaction.outstandingTotalPaymentAmount || 0)),
      transaction_status: transaction.saleTransactionStatus || '',
      transaction_created_at: transaction.createdAt ? transaction.createdAt.toISOString() : new Date().toISOString(),
      transaction_updated_at: transaction.updatedAt ? transaction.updatedAt.toISOString() : new Date().toISOString(),
      transaction_remark: transaction.remarks || '',
      has_services: hasServices,
      has_products: hasProducts,
      has_care_packages: hasCarePackages,
      process_payment: transaction.processPayment,
      reference_sales_transaction_id: transaction.referenceSalesTransactionId?.toString() || null,
      gst_amount: roundTo2Decimals(Number(transaction.gstAmount || 0)),

      // Member information
      member: transaction.member
        ? {
            id: transaction.member.id.toString(),
            name: transaction.member.name,
            email: transaction.member.email || '',
            contact: transaction.member.contact || '',
          }
        : null,

      // Handler information
      handler: transaction.handledByEmployee
        ? {
            code: transaction.handledByEmployee.employeeCode,
            name: transaction.handledByEmployee.employeeName,
          }
        : null,

      // Creator information
      creator: transaction.createdByEmployee
        ? {
            code: transaction.createdByEmployee.employeeCode,
            name: transaction.createdByEmployee.employeeName,
          }
        : null,

      // Payment information
      payments: transaction.paymentToSaleTransactions.map((payment) => ({
        id: payment.id.toString(),
        amount: roundTo2Decimals(Number(payment.amount || 0)),
        payment_method: payment.paymentMethod?.paymentMethodName || '',
        created_at: payment.createdAt || new Date(),
        updated_at: payment.updatedAt || new Date(),
        remarks: payment.remarks || '',
        created_by: {
          code: payment.createdByEmployee?.employeeCode || '',
          name: payment.createdByEmployee?.employeeName || '',
        },
        updated_by: {
          code: payment.updatedByEmployee?.employeeCode || '',
          name: payment.updatedByEmployee?.employeeName || '',
        },
      })),

      // Enhanced items information with voucher and care package details
      items: transaction.saleTransactionItems.map((item) => ({
        id: item.id.toString(),
        service_name: item.serviceName || null,
        product_name: item.productName || null,
        member_care_package_id: item.memberCarePackageId?.toString() || null,
        member_voucher_id: item.memberVoucherId?.toString() || null,
        original_unit_price: roundTo2Decimals(Number(item.originalUnitPrice || 0)),
        custom_unit_price: roundTo2Decimals(Number(item.customUnitPrice || 0)),
        discount_percentage: roundTo2Decimals(Number(item.discountPercentage || 0)),
        quantity: item.quantity || 0,
        remarks: item.remarks || '',
        amount: roundTo2Decimals(Number(item.amount || 0)),
        item_type: item.itemType || '',
        // Enhanced voucher information
        member_voucher_name: item.memberVoucher?.memberVoucherName || undefined,
        voucher_balance: item.memberVoucher?.currentBalance
          ? roundTo2Decimals(Number(item.memberVoucher.currentBalance))
          : undefined,
        voucher_status: item.memberVoucher?.status as 'is_enabled' | 'is_disabled' | 'expired' | undefined,
        // Enhanced care package information
        care_package_name: item.memberCarePackage?.packageName || undefined,
        care_package_balance: item.memberCarePackage?.balance
          ? roundTo2Decimals(Number(item.memberCarePackage.balance))
          : undefined,
        care_package_status: item.memberCarePackage?.status as 'is_enabled' | 'is_disabled' | 'completed' | undefined,
      })),
    };

    return transformedTransaction;
  } catch (error) {
    console.error('Error in getSalesTransactionById:', error);
    throw new Error('Failed to fetch sales transaction');
  }
};

const searchServices = async (searchQuery: string): Promise<Service[]> => {
  try {
    const prisma = getPrisma();

    const whereClause: Prisma.ServiceWhereInput = {
      serviceIsEnabled: true,
    };

    if (searchQuery && searchQuery.trim() !== '') {
      whereClause.OR = [
        { serviceName: { contains: searchQuery.trim(), mode: 'insensitive' } },
        { serviceCategory: { serviceCategoryName: { contains: searchQuery.trim(), mode: 'insensitive' } } },
      ];
    }

    const services = await prisma.service.findMany({
      where: whereClause,
      include: {
        serviceCategory: {
          select: {
            id: true,
            serviceCategoryName: true,
            serviceCategorySequenceNo: true,
          },
        },
      },
      orderBy: [{ serviceCategory: { serviceCategorySequenceNo: 'asc' } }, { serviceSequenceNo: 'asc' }],
      take: 10,
    });

    return services.map((service) => ({
      id: `S${service.id.toString()}`,
      service_id: service.id.toString(),
      name: service.serviceName || 'Unnamed Service',
      service_name: service.serviceName || 'Unnamed Service',
      description: service.serviceDescription || '',
      remarks: service.serviceRemarks || '',
      duration: Number(service.serviceDuration) || 0,
      category: service.serviceCategory?.serviceCategoryName || 'Uncategorized',
      service_category_name: service.serviceCategory?.serviceCategoryName || 'Uncategorized',
      service_category_id: service.serviceCategory?.id.toString() || null,
      price: roundTo2Decimals(Number(service.servicePrice || 0)),
      service_default_price: roundTo2Decimals(Number(service.servicePrice || 0)),
      is_enabled: service.serviceIsEnabled || false,
      sequence_no: service.serviceSequenceNo || 0,
    }));
  } catch (error: any) {
    console.error('Detailed error in searchServices:', error);
    throw new Error(`Error searching services: ${error.message}`);
  }
};

const searchProducts = async (searchQuery: string): Promise<Product[]> => {
  try {
    const prisma = getPrisma();

    const whereClause: Prisma.ProductWhereInput = {
      productIsEnabled: true,
    };

    if (searchQuery && searchQuery.trim() !== '') {
      whereClause.OR = [
        { productName: { contains: searchQuery.trim(), mode: 'insensitive' } },
        { productCategory: { productCategoryName: { contains: searchQuery.trim(), mode: 'insensitive' } } },
      ];
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        productCategory: {
          select: {
            id: true,
            productCategoryName: true,
            productCategorySequenceNo: true,
          },
        },
      },
      orderBy: [{ productCategory: { productCategorySequenceNo: 'asc' } }, { productSequenceNo: 'asc' }],
      take: 10,
    });

    return products.map((product) => ({
      id: `P${product.id.toString()}`,
      product_id: product.id.toString(),
      name: product.productName || 'Unnamed Product',
      product_name: product.productName || 'Unnamed Product',
      description: product.productDescription || '',
      remarks: product.productRemarks || '',
      category: product.productCategory?.productCategoryName || 'Uncategorized',
      product_category_name: product.productCategory?.productCategoryName || 'Uncategorized',
      product_category_id: product.productCategory?.id.toString() || null,
      price: roundTo2Decimals(Number(product.productUnitSalePrice || 0)),
      cost_price: roundTo2Decimals(Number(product.productUnitCostPrice || 0)),
      is_enabled: product.productIsEnabled || false,
      sequence_no: product.productSequenceNo || 0,
    }));
  } catch (error: any) {
    console.error('Detailed error in searchProducts:', error);
    throw new Error(`Error searching products: ${error.message}`);
  }
};

const createServicesProductsTransaction = async (
  transactionData: TransactionRequestData,
): Promise<TransactionCreationResult> => {
  const prisma = getPrisma();

  return await prisma.$transaction(async (tx) => {
    const {
      customer_type,
      member_id,
      receipt_number,
      remarks,
      created_by,
      handled_by,
      items,
      payments,
      created_at,
      updated_at,
      gstBreakdown,
    } = transactionData;

    // Add debug logging
    console.log('📥 Received GST Breakdown:', gstBreakdown);

    if (!created_by) {
      throw new Error('created_by is required');
    }

    if (!handled_by) {
      throw new Error('handled_by is required');
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('items array is required and cannot be empty');
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      throw new Error('payments array is required and cannot be empty');
    }

    let customCreatedAt = null;
    let customUpdatedAt = null;

    if (created_at) {
      try {
        customCreatedAt = new Date(created_at);
        if (isNaN(customCreatedAt.getTime())) {
          throw new Error('Invalid created_at date format');
        }
      } catch (error) {
        console.warn('Invalid created_at format, using current time:', created_at);
        customCreatedAt = new Date();
      }
    } else {
      customCreatedAt = new Date();
    }

    if (updated_at) {
      try {
        customUpdatedAt = new Date(updated_at);
        if (isNaN(customUpdatedAt.getTime())) {
          throw new Error('Invalid updated_at date format');
        }
      } catch (error) {
        console.warn('Invalid updated_at format, using created_at time:', updated_at);
        customUpdatedAt = customCreatedAt;
      }
    } else {
      customUpdatedAt = customCreatedAt;
    }

    let totalTransactionAmount: number;
    let totalGSTAmount: number;

    if (gstBreakdown) {
      totalTransactionAmount = roundTo2Decimals(gstBreakdown.inclusiveTotal || 0);
      totalGSTAmount = roundTo2Decimals(gstBreakdown.gstTotal || 0);
      console.log('✅ Using GST breakdown from frontend:', {
        inclusive: totalTransactionAmount,
        gst: totalGSTAmount,
      });
    } else {
      const exclusiveTotal = roundTo2Decimals(
        items.reduce((total: number, item: TransactionRequestItem) => {
          return total + (item.pricing?.totalLinePrice || 0);
        }, 0),
      );
      totalGSTAmount = roundTo2Decimals(exclusiveTotal * 0.09);
      totalTransactionAmount = roundTo2Decimals(exclusiveTotal + totalGSTAmount);
      console.log('⚠️ No GST breakdown provided, calculated:', {
        exclusive: exclusiveTotal,
        gst: totalGSTAmount,
        inclusive: totalTransactionAmount,
      });
    }

    const isPendingPaymentMethod = (methodId: unknown) => {
      const idAsString = typeof methodId === 'string' ? methodId : String(methodId);
      return idAsString === '7';
    };

    const totalActualPaidAmount: number = roundTo2Decimals(
      payments.reduce((total: number, payment: PaymentMethodRequest) => {
        if (!payment || (payment.amount || 0) <= 0) return total;
        if (isPendingPaymentMethod(payment.methodId)) return total;
        return total + (payment.amount || 0);
      }, 0),
    );

    const outstandingAmount: number = roundTo2Decimals(Math.max(0, totalTransactionAmount - totalActualPaidAmount));
    const transactionStatus: 'FULL' | 'PARTIAL' = outstandingAmount > 0.01 ? 'PARTIAL' : 'FULL';
    const processPayment: boolean = outstandingAmount > 0.01;

    let finalReceiptNo: string = receipt_number || '';
    if (!finalReceiptNo) {
      const last = await tx.saleTransaction.findFirst({
        where: { receiptNo: { startsWith: 'ST' } },
        orderBy: { receiptNo: 'desc' },
        select: { receiptNo: true },
      });
      const nextNum = last?.receiptNo ? parseInt(last.receiptNo.slice(2)) + 1 : 1;
      finalReceiptNo = `ST${nextNum.toString().padStart(6, '0')}`;
    }

    const newSaleTx = await tx.saleTransaction.create({
      data: {
        customerType: customer_type?.toUpperCase() || 'MEMBER',
        memberId: member_id ? BigInt(member_id) : null,
        totalPaidAmount: new Prisma.Decimal(totalActualPaidAmount),
        outstandingTotalPaymentAmount: new Prisma.Decimal(outstandingAmount),
        saleTransactionStatus: transactionStatus,
        receiptNo: finalReceiptNo,
        remarks: remarks || '',
        processPayment,
        handledBy: BigInt(handled_by),
        createdBy: BigInt(created_by),
        createdAt: customCreatedAt,
        updatedAt: customUpdatedAt,
        gstAmount: new Prisma.Decimal(totalGSTAmount),
      },
      select: { id: true },
    });
    const saleTransactionId: number = Number(newSaleTx.id);

    console.log('Created sale transaction with ID:', saleTransactionId);

    const createdItemIds: number[] = [];

    for (const item of items) {
      const pricing: ItemPricing = item.pricing || {
        originalPrice: 0,
        customPrice: 0,
        discount: 0,
        quantity: 1,
        totalLinePrice: 0,
      };

      let itemType: string;
      let serviceName: string | null;
      let productName: string | null;

      if (item.type === 'service') {
        itemType = 'service';
        serviceName = item.data?.name || null;
        productName = null;
      } else if (item.type === 'product') {
        itemType = 'product';
        serviceName = null;
        productName = item.data?.name || null;
      } else {
        throw new Error(`Invalid item type '${item.type}' for services/products transaction.`);
      }

      const created = await tx.saleTransactionItem.create({
        data: {
          saleTransactionId: BigInt(saleTransactionId),
          serviceName,
          productName,
          memberCarePackageId: null,
          memberVoucherId: null,
          originalUnitPrice: new Prisma.Decimal(pricing.originalPrice || 0),
          customUnitPrice: new Prisma.Decimal(pricing.customPrice || 0),
          discountPercentage: new Prisma.Decimal(pricing.discount || 0),
          quantity: pricing.quantity || 1,
          amount: new Prisma.Decimal(pricing.totalLinePrice || 0),
          itemType,
          remarks: item.remarks || '',
        },
        select: { id: true },
      });

      createdItemIds.push(Number(created.id));
      console.log('Created sale transaction item with ID:', Number(created.id));
    }

    // Insert customer payments
    for (const payment of payments) {
      if (payment.amount > 0) {
        const createdPayment = await tx.paymentToSaleTransaction.create({
          data: {
            saleTransactionId: BigInt(saleTransactionId),
            paymentMethodId:
              typeof payment.methodId === 'string' ? BigInt(parseInt(payment.methodId)) : BigInt(payment.methodId),
            amount: new Prisma.Decimal(payment.amount),
            remarks: payment.remark || '',
            createdBy: BigInt(handled_by),
            createdAt: customCreatedAt,
            updatedBy: BigInt(handled_by),
            updatedAt: customUpdatedAt,
          },
          select: { id: true },
        });
        console.log('Created payment with ID:', Number(createdPayment.id));
      }
    }

    // ✅ REMOVED: No longer creating GST payment record
    // GST amount is now stored directly in sale_transactions.gst_amount column
    console.log('🏛️ GST amount stored in sale_transactions.gst_amount:', totalGSTAmount);

    console.log('Services/Products Transaction committed successfully');

    return {
      id: saleTransactionId,
      receipt_no: finalReceiptNo,
      customer_type: customer_type?.toUpperCase() || 'MEMBER',
      member_id: member_id ? member_id.toString() : null,
      total_transaction_amount: totalTransactionAmount,
      total_paid_amount: totalActualPaidAmount,
      outstanding_total_payment_amount: outstandingAmount,
      transaction_status: transactionStatus,
      remarks: remarks || '',
      created_by,
      handled_by,
      items_count: items.length,
      payments_count: payments.filter((p: PaymentMethodRequest) => p.amount > 0).length,
      createdItemIds,
    };
  });
};

const createMcpTransaction = async (
  transactionData: SingleItemTransactionRequestData,
): Promise<SingleItemTransactionCreationResult> => {
  const prisma = getPrisma();
  let mcpId: string | number | null | undefined = null;
  return await prisma.$transaction(async (tx) => {
    // Extract data from request
    const {
      customer_type,
      member_id,
      receipt_number,
      remarks,
      created_by,
      handled_by,
      item,
      payments,
      created_at,
      updated_at,
      gstBreakdown,
    } = transactionData;

    // Validate required fields
    if (!created_by) {
      throw new Error('created_by is required');
    }

    if (!handled_by) {
      throw new Error('handled_by is required');
    }

    if (!item || item.type !== 'package') {
      throw new Error('item is required and must be of type "package"');
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      throw new Error('payments array is required and cannot be empty');
    }

    let customCreatedAt = null;
    let customUpdatedAt = null;

    if (created_at) {
      try {
        customCreatedAt = new Date(created_at);
        if (isNaN(customCreatedAt.getTime())) {
          customCreatedAt = new Date();
        }
      } catch (error) {
        customCreatedAt = new Date();
      }
    } else {
      customCreatedAt = new Date();
    }

    if (updated_at) {
      try {
        customUpdatedAt = new Date(updated_at);
        if (isNaN(customUpdatedAt.getTime())) {
          customUpdatedAt = customCreatedAt;
        }
      } catch (error) {
        customUpdatedAt = customCreatedAt;
      }
    } else {
      customUpdatedAt = customCreatedAt;
    }

    mcpId = item.data?.member_care_package_id || item.data?.id;

    if (!mcpId) {
      throw new Error('member_care_package_id is required in item data');
    }

    // Validate that the MCP ID exists in the database and get current balance
    const mcpRecord = await tx.memberCarePackage.findUnique({
      where: { id: BigInt(mcpId) },
      select: { id: true, packageName: true, balance: true },
    });

    if (!mcpRecord) {
      throw new Error(`Member Care Package with ID ${mcpId} not found`);
    }

    const currentBalance = Number(mcpRecord.balance ?? 0);

    // ✅ UPDATED: Calculate GST amounts
    let totalTransactionAmount: number;
    let totalGSTAmount: number;

    if (gstBreakdown) {
      totalTransactionAmount = roundTo2Decimals(gstBreakdown.inclusiveTotal || 0);
      totalGSTAmount = roundTo2Decimals(gstBreakdown.gstTotal || 0);
      console.log('✅ MCP Using GST breakdown from frontend:', {
        inclusive: totalTransactionAmount,
        gst: totalGSTAmount,
      });
    } else {
      const exclusiveTotal = roundTo2Decimals(item.pricing?.totalLinePrice || 0);
      totalGSTAmount = roundTo2Decimals(exclusiveTotal * 0.09);
      totalTransactionAmount = roundTo2Decimals(exclusiveTotal + totalGSTAmount);
      console.log('⚠️ MCP No GST breakdown provided, calculated:', {
        exclusive: exclusiveTotal,
        gst: totalGSTAmount,
        inclusive: totalTransactionAmount,
      });
    }

    const PENDING_PAYMENT_METHOD_ID = 7;

    const pendingPayments = payments.filter(
      (payment: PaymentMethodRequest) => payment.methodId === PENDING_PAYMENT_METHOD_ID,
    );

    const nonPendingPayments = payments.filter(
      (payment: PaymentMethodRequest) => payment.methodId !== PENDING_PAYMENT_METHOD_ID,
    );

    // Keep existing total_paid_amount calculation (includes GST)
    const totalPaidAmount: number = roundTo2Decimals(
      nonPendingPayments.reduce((total: number, payment: PaymentMethodRequest) => {
        return total + (payment.amount || 0);
      }, 0),
    );

    const outstandingAmount: number = roundTo2Decimals(Math.max(0, totalTransactionAmount - totalPaidAmount));

    const transactionStatus: 'FULL' | 'PARTIAL' = outstandingAmount <= 0 ? 'FULL' : 'PARTIAL';
    const processPayment: boolean = outstandingAmount > 0;

    // Use receipt number from frontend
    let finalReceiptNo: string = receipt_number || '';
    if (!finalReceiptNo) {
      const last = await tx.saleTransaction.findFirst({
        where: { receiptNo: { startsWith: 'ST' } },
        orderBy: { receiptNo: 'desc' },
        select: { receiptNo: true },
      });
      const nextNum = last?.receiptNo ? parseInt(last.receiptNo.slice(2)) + 1 : 1;
      finalReceiptNo = `ST${nextNum.toString().padStart(6, '0')}`;
    }

    const createdTx = await tx.saleTransaction.create({
      data: {
        customerType: customer_type?.toUpperCase() || 'MEMBER',
        memberId: member_id ? BigInt(member_id) : null,
        totalPaidAmount: new Prisma.Decimal(totalPaidAmount),
        outstandingTotalPaymentAmount: new Prisma.Decimal(outstandingAmount),
        saleTransactionStatus: transactionStatus,
        receiptNo: finalReceiptNo,
        remarks: remarks || '',
        processPayment,
        handledBy: BigInt(handled_by),
        createdBy: BigInt(created_by),
        createdAt: customCreatedAt,
        updatedAt: customUpdatedAt,
        gstAmount: new Prisma.Decimal(totalGSTAmount),
      },
      select: { id: true },
    });
    const saleTransactionId: number = Number(createdTx.id);

    console.log('Created MCP sale transaction with ID:', saleTransactionId);
    console.log('🏛️ MCP GST amount stored in sale_transactions.gst_amount:', totalGSTAmount);

    // Insert package item with actual MCP ID
    const itemCreated = await tx.saleTransactionItem.create({
      data: {
        saleTransactionId: BigInt(saleTransactionId),
        serviceName: null,
        productName: null,
        memberCarePackageId: BigInt(mcpId),
        memberVoucherId: null,
        originalUnitPrice: new Prisma.Decimal(item.pricing?.originalPrice || 0),
        customUnitPrice: new Prisma.Decimal(item.pricing?.customPrice || 0),
        discountPercentage: new Prisma.Decimal(item.pricing?.discount || 0),
        quantity: item.pricing?.quantity || 1,
        amount: new Prisma.Decimal(item.pricing?.totalLinePrice || 0),
        itemType: 'member care package',
        remarks: item.remarks || '',
      },
      select: { id: true },
    });
    const saleTransactionItemId: number = Number(itemCreated.id);

    console.log('Created MCP sale transaction item with ID:', saleTransactionItemId);

    // ✅ FIXED: Calculate exclusive amount for MCP balance (without GST)
    let exclusiveAmountForBalance: number;

    if (gstBreakdown) {
      // Use breakdown provided from frontend
      exclusiveAmountForBalance = roundTo2Decimals(gstBreakdown.exclusiveTotal || 0);
    } else {
      // Calculate from item pricing (fallback)
      exclusiveAmountForBalance = roundTo2Decimals(item.pricing?.totalLinePrice || 0);
    }
    const gstAmount = totalGSTAmount;

    // Calculate net amount for MCP balance (payment minus GST)
    const netAmountForBalance = roundTo2Decimals(totalPaidAmount - gstAmount);

    console.log('💰 MCP Balance Update (GST Subtracted):', {
      totalPaidAmount, // $100 (what customer paid)
      gstAmount, // $18 (GST amount from frontend)
      netAmountForBalance, // $82 (amount to add to MCP balance)
    });

    // Update MCP balance with net amount (excluding GST completely)
    if (netAmountForBalance > 0) {
      const newBalance = currentBalance + netAmountForBalance;

      const updatedMcp = await tx.memberCarePackage.update({
        where: { id: BigInt(mcpId) },
        data: { balance: new Prisma.Decimal(newBalance), updatedAt: customUpdatedAt },
        select: { balance: true },
      });
      const updatedBalance = Number(updatedMcp.balance);

      console.log('✅ Updated MCP balance (GST completely subtracted):', {
        mcpId: mcpId,
        previousBalance: currentBalance,
        totalPaidAmount: totalPaidAmount, // $100 - recorded in sale_transactions
        gstAmount: gstAmount, // $18 - GST subtracted
        netAmountForBalance: netAmountForBalance, // $82 - added to MCP balance
        newBalance: updatedBalance,
      });
    }

    // ✅ UPDATED: Include updated_by in payment insertions
    for (const payment of payments) {
      if (payment.amount > 0) {
        const createdPayment = await tx.paymentToSaleTransaction.create({
          data: {
            saleTransactionId: BigInt(saleTransactionId),
            paymentMethodId:
              typeof payment.methodId === 'string' ? BigInt(parseInt(payment.methodId)) : BigInt(payment.methodId),
            amount: new Prisma.Decimal(payment.amount),
            remarks: payment.remark || '',
            createdBy: BigInt(handled_by),
            createdAt: customCreatedAt,
            updatedBy: BigInt(handled_by),
            updatedAt: customUpdatedAt,
          },
          select: { id: true },
        });
        console.log('Created payment with ID:', Number(createdPayment.id));
      }
    }

    console.log('MCP Transaction committed successfully');

    // Return the created transaction data
    return {
      id: saleTransactionId,
      receipt_no: finalReceiptNo,
      customer_type: customer_type?.toUpperCase() || 'MEMBER',
      member_id: member_id ? member_id.toString() : null,
      total_transaction_amount: totalTransactionAmount,
      total_paid_amount: totalPaidAmount,
      outstanding_total_payment_amount: outstandingAmount,
      transaction_status: transactionStatus,
      remarks: remarks || '',
      created_by,
      handled_by,
      package_name: mcpRecord.packageName,
      items_count: 1,
      payments_count: payments.filter((p: PaymentMethodRequest) => p.amount > 0).length,
      mcpId: mcpId,
      gst_amount: totalGSTAmount, // ✅ NEW: Include GST amount in result
    };
  });
};

const createMcpTransferTransaction = async (
  transactionData: SingleItemTransactionRequestData,
): Promise<SingleItemTransactionCreationResult> => {
  const prisma = getPrisma();

  let transferDetails;

  return await prisma.$transaction(async (tx) => {
    // Extract data from request
    const {
      customer_type,
      member_id,
      receipt_number,
      remarks,
      created_by,
      handled_by,
      item,
      payments,
      created_at,
      updated_at,
    } = transactionData;

    // Validate required fields
    if (!created_by) {
      throw new Error('created_by is required');
    }

    if (!handled_by) {
      throw new Error('handled_by is required');
    }

    if (!item || (item.type !== 'transfer' && item.type !== 'transferMCP')) {
      throw new Error('item is required and must be of type "transfer" or "transferMCP"');
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      throw new Error('payments array is required and cannot be empty');
    }

    let customCreatedAt = null;
    let customUpdatedAt = null;

    if (created_at) {
      try {
        customCreatedAt = new Date(created_at);
        if (isNaN(customCreatedAt.getTime())) {
          console.warn('Invalid created_at format, using current time:', created_at);
          customCreatedAt = new Date();
        }
      } catch (error) {
        console.warn('Error parsing created_at, using current time:', error);
        customCreatedAt = new Date();
      }
    } else {
      customCreatedAt = new Date();
    }

    if (updated_at) {
      try {
        customUpdatedAt = new Date(updated_at);
        if (isNaN(customUpdatedAt.getTime())) {
          console.warn('Invalid updated_at format, using created_at time:', updated_at);
          customUpdatedAt = customCreatedAt;
        }
      } catch (error) {
        console.warn('Error parsing updated_at, using created_at time:', error);
        customUpdatedAt = customCreatedAt;
      }
    } else {
      customUpdatedAt = customCreatedAt;
    }

    console.log('✅ MCP Transfer Using custom date/time:', {
      created_at: customCreatedAt.toISOString(),
      updated_at: customUpdatedAt.toISOString(),
    });

    // Calculate totals from single transfer item
    const totalTransactionAmount: number = roundTo2Decimals(item.pricing?.totalLinePrice || 0);
    const totalGSTAmount: number = 0; // ✅ NO GST for MCP transfers
    // For transfers, we expect full payment
    const totalPaidAmount: number = roundTo2Decimals(
      payments.reduce((total: number, payment: PaymentMethodRequest) => {
        return total + (payment.amount || 0);
      }, 0),
    );

    const outstandingAmount: number = 0;
    const transactionStatus: 'TRANSFER' | 'FULL' = 'TRANSFER';
    const processPayment: boolean = false;

    // Verification: total should match
    if (Math.abs(totalPaidAmount - totalTransactionAmount) > 0.01) {
      console.warn('MCP Transfer payment total mismatch:', {
        totalTransactionAmount,
        totalPaidAmount,
        expected: 'Amounts should be equal for transfers',
      });
    }

    // Use receipt number from frontend
    let finalReceiptNo: string = receipt_number || '';
    if (!finalReceiptNo) {
      const last = await tx.saleTransaction.findFirst({
        where: { receiptNo: { startsWith: 'ST' } },
        orderBy: { receiptNo: 'desc' },
        select: { receiptNo: true },
      });
      const nextNum = last?.receiptNo ? parseInt(last.receiptNo.slice(2)) + 1 : 1;
      finalReceiptNo = `ST${nextNum.toString().padStart(6, '0')}`;
    }

    const createdTx = await tx.saleTransaction.create({
      data: {
        customerType: customer_type?.toUpperCase() || 'MEMBER',
        memberId: member_id ? BigInt(member_id) : null,
        totalPaidAmount: new Prisma.Decimal(totalPaidAmount),
        outstandingTotalPaymentAmount: new Prisma.Decimal(outstandingAmount),
        saleTransactionStatus: transactionStatus,
        receiptNo: finalReceiptNo,
        remarks: remarks || '',
        processPayment,
        handledBy: BigInt(handled_by),
        createdBy: BigInt(created_by),
        createdAt: customCreatedAt,
        updatedAt: customUpdatedAt,
        gstAmount: new Prisma.Decimal(totalGSTAmount),
      },
      select: { id: true },
    });
    const saleTransactionId: number = Number(createdTx.id);

    console.log('Created MCP Transfer sale transaction with ID:', saleTransactionId);

    // Insert transfer item
    transferDetails = item.data || {};
    const sourceMcpId = transferDetails.mcp_id1 || null;
    const destinationMcpId = transferDetails.mcp_id2 || null;
    const transferAmount = transferDetails.amount || item.pricing?.totalLinePrice || 0;

    // Enhanced remarks with transfer metadata
    const transferRemarks = `MCP Transfer: ${transferAmount} from MCP ${sourceMcpId} to MCP ${destinationMcpId}${
      transferDetails.isNew ? ' (New Package)' : ''
    }${item.remarks ? ` - ${item.remarks}` : ''}`;

    const itemCreated = await tx.saleTransactionItem.create({
      data: {
        saleTransactionId: BigInt(saleTransactionId),
        serviceName: null,
        productName: null,
        memberCarePackageId: destinationMcpId ? BigInt(destinationMcpId) : null,
        memberVoucherId: null,
        originalUnitPrice: new Prisma.Decimal(item.pricing?.originalPrice || 0),
        customUnitPrice: new Prisma.Decimal(item.pricing?.customPrice || 0),
        discountPercentage: new Prisma.Decimal(item.pricing?.discount || 0),
        quantity: item.pricing?.quantity || 1,
        amount: new Prisma.Decimal(item.pricing?.totalLinePrice || 0),
        itemType: 'member care package',
        remarks: transferRemarks,
      },
      select: { id: true },
    });
    const saleTransactionItemId: number = Number(itemCreated.id);

    console.log('Created MCP Transfer sale transaction item with ID:', saleTransactionItemId);

    for (const payment of payments) {
      if (payment.amount > 0) {
        // Handle special "transfer" payment method
        let paymentMethodId: number;
        if (payment.methodId === 'transfer') {
          paymentMethodId = 9;
        } else {
          paymentMethodId = typeof payment.methodId === 'string' ? parseInt(payment.methodId) : payment.methodId;
        }

        const createdPayment = await tx.paymentToSaleTransaction.create({
          data: {
            saleTransactionId: BigInt(saleTransactionId),
            paymentMethodId: BigInt(paymentMethodId),
            amount: new Prisma.Decimal(payment.amount),
            remarks: payment.remark || '',
            createdBy: BigInt(created_by),
            createdAt: customCreatedAt,
            updatedAt: customUpdatedAt,
          },
          select: { id: true },
        });
        console.log('Created MCP Transfer payment with ID:', Number(createdPayment.id));
      }
    }

    console.log('MCP Transfer Transaction committed successfully');

    // Return the created transaction data
    return {
      id: saleTransactionId,
      receipt_no: finalReceiptNo,
      customer_type: customer_type?.toUpperCase() || 'MEMBER',
      member_id: member_id ? member_id.toString() : null,
      total_transaction_amount: totalTransactionAmount,
      total_paid_amount: totalPaidAmount,
      outstanding_total_payment_amount: outstandingAmount,
      transaction_status: transactionStatus,
      remarks: remarks || '',
      created_by,
      handled_by,
      mcp_id1: transferDetails.mcp_id1 || null,
      mcp_id2: transferDetails.mcp_id2 || null,
      transfer_amount: transferAmount,
      transfer_description: transferDetails.description || transferRemarks,
      items_count: 1,
      payments_count: payments.filter((p: PaymentMethodRequest) => p.amount > 0).length,
    };
  });
};

const createMvTransferTransaction = async (
  transactionData: SingleItemTransactionRequestData,
): Promise<SingleItemTransactionCreationResult> => {
  return await prisma.$transaction(async (tx) => {
    const {
      customer_type,
      member_id,
      receipt_number,
      remarks,
      created_by,
      handled_by,
      item,
      payments,
      created_at,
      updated_at,
      gstBreakdown,
    } = transactionData;

    if (!created_by) {
      throw new Error('created_by is required');
    }

    if (!handled_by) {
      throw new Error('handled_by is required');
    }

    if (!item || item.type !== 'transferMV') {
      throw new Error('item is required and must be of type "transferMV"');
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      throw new Error('payments array is required and cannot be empty');
    }

    let customCreatedAt: Date = new Date();
    let customUpdatedAt: Date = customCreatedAt;

    if (created_at) {
      try {
        const parsed = new Date(created_at);
        if (!isNaN(parsed.getTime())) {
          customCreatedAt = parsed;
          customUpdatedAt = parsed;
        } else {
          console.warn('Invalid created_at format, using current time:', created_at);
        }
      } catch (error) {
        console.warn('Error parsing created_at, using current time:', error);
      }
    }

    if (updated_at) {
      try {
        const parsedUpd = new Date(updated_at);
        if (!isNaN(parsedUpd.getTime())) {
          customUpdatedAt = parsedUpd;
        } else {
          console.warn('Invalid updated_at format, using created_at time:', updated_at);
        }
      } catch (error) {
        console.warn('Error parsing updated_at, using created_at time:', error);
      }
    }

    console.log('✅ MV Transfer Using custom date/time:', {
      created_at: customCreatedAt.toISOString(),
      updated_at: customUpdatedAt.toISOString(),
    });

    let totalTransactionAmount: number;
    let totalGSTAmount: number;

    if (gstBreakdown) {
      totalTransactionAmount = roundTo2Decimals(gstBreakdown.inclusiveTotal || 0);
      totalGSTAmount = roundTo2Decimals(gstBreakdown.gstTotal || 0);
      console.log('✅ MV Transfer Using GST breakdown from frontend:', {
        inclusive: totalTransactionAmount,
        gst: totalGSTAmount,
      });
    } else {
      const exclusiveTotal = roundTo2Decimals(item.pricing?.totalLinePrice || 0);
      totalGSTAmount = roundTo2Decimals(exclusiveTotal * 0.09);
      totalTransactionAmount = roundTo2Decimals(exclusiveTotal + totalGSTAmount);
      console.log('⚠️ MV Transfer No GST breakdown provided, calculated:', {
        exclusive: exclusiveTotal,
        gst: totalGSTAmount,
        inclusive: totalTransactionAmount,
      });
    }

    const totalPaidAmount: number = roundTo2Decimals(
      payments.reduce((total: number, payment: PaymentMethodRequest) => total + (payment.amount || 0), 0),
    );

    const outstandingAmount: number = 0;
    const transactionStatus: 'FULL' | 'PARTIAL' = 'FULL';
    const processPayment = false;

    if (Math.abs(totalPaidAmount - totalTransactionAmount) > 0.01) {
      console.warn('MV Transfer payment total mismatch:', {
        totalTransactionAmount,
        totalPaidAmount,
        expected: 'Amounts should be equal for transfers',
      });
    }

    let finalReceiptNo: string = receipt_number || '';
    if (!finalReceiptNo) {
      const last = await tx.saleTransaction.findFirst({
        where: { receiptNo: { startsWith: 'ST' } },
        orderBy: { receiptNo: 'desc' },
        select: { receiptNo: true },
      });
      const nextNum = last?.receiptNo ? parseInt(last.receiptNo.slice(2)) + 1 : 1;
      finalReceiptNo = `ST${nextNum.toString().padStart(6, '0')}`;
    }

    const createdTx = await tx.saleTransaction.create({
      data: {
        customerType: customer_type?.toUpperCase() || 'MEMBER',
        memberId: member_id ? BigInt(member_id) : null,
        totalPaidAmount: new Prisma.Decimal(totalPaidAmount),
        outstandingTotalPaymentAmount: new Prisma.Decimal(outstandingAmount),
        saleTransactionStatus: transactionStatus,
        receiptNo: finalReceiptNo,
        remarks: remarks || '',
        processPayment,
        handledBy: BigInt(handled_by),
        createdBy: BigInt(created_by),
        createdAt: customCreatedAt,
        updatedAt: customUpdatedAt,
        gstAmount: new Prisma.Decimal(totalGSTAmount),
      },
      select: { id: true },
    });
    const saleTransactionId = Number(createdTx.id);

    console.log('Created MV Transfer sale transaction with ID:', saleTransactionId);

    const itemCreated = await tx.saleTransactionItem.create({
      data: {
        saleTransactionId: BigInt(saleTransactionId),
        serviceName: null,
        productName: null,
        memberCarePackageId: null,
        memberVoucherId: transactionData.newVoucherId ? BigInt(transactionData.newVoucherId) : null,
        originalUnitPrice: new Prisma.Decimal(item.pricing?.originalPrice || 0),
        customUnitPrice: new Prisma.Decimal(item.pricing?.customPrice || 0),
        discountPercentage: new Prisma.Decimal(item.pricing?.discount || 0),
        quantity: item.pricing?.quantity || 1,
        amount: new Prisma.Decimal(item.pricing?.totalLinePrice || 0),
        itemType: 'member voucher',
        remarks: item.remarks || item.data?.description || '',
      },
      select: { id: true },
    });

    console.log('Created MV Transfer sale transaction item with ID:', Number(itemCreated.id));

    for (const payment of payments) {
      if (payment.amount > 0) {
        let paymentMethodId: number;
        if (payment.methodId === 'transfer') {
          paymentMethodId = 9;
        } else {
          paymentMethodId = typeof payment.methodId === 'string' ? parseInt(payment.methodId) : payment.methodId;
        }

        const createdPayment = await tx.paymentToSaleTransaction.create({
          data: {
            saleTransactionId: BigInt(saleTransactionId),
            paymentMethodId: BigInt(paymentMethodId),
            amount: new Prisma.Decimal(payment.amount),
            remarks: payment.remark || '',
            createdBy: BigInt(created_by),
            createdAt: customCreatedAt,
            updatedBy: BigInt(created_by),
            updatedAt: customUpdatedAt,
          },
          select: { id: true },
        });
        console.log('Created MV Transfer payment with ID:', Number(createdPayment.id));
      }
    }

    console.log('MV Transfer Transaction committed successfully');

    return {
      id: saleTransactionId,
      receipt_no: finalReceiptNo,
      customer_type: customer_type?.toUpperCase() || 'MEMBER',
      member_id: member_id ? member_id.toString() : null,
      total_transaction_amount: totalTransactionAmount,
      total_paid_amount: totalPaidAmount,
      outstanding_total_payment_amount: outstandingAmount,
      transaction_status: transactionStatus,
      remarks: remarks || '',
      created_by,
      handled_by,
      transfer_amount: item.data?.amount || totalTransactionAmount,
      transfer_description: item.data?.description || '',
      items_count: 1,
      payments_count: payments.filter((p: PaymentMethodRequest) => p.amount > 0).length,
      gst_amount: totalGSTAmount,
    };
  });
};

const createTopUpTransaction = async (
  transactionData: SingleItemTransactionRequestData,
): Promise<SingleItemTransactionCreationResult> => {
  return await prisma.$transaction(async (tx) => {
    const {
      customer_type,
      member_id,
      receipt_number,
      remarks,
      created_by,
      handled_by,
      item,
      payments,
      created_at,
      updated_at,
    } = transactionData;

    if (!member_id) throw new Error('member_id is required for top up to stored value');
    if (!created_by) throw new Error('created_by is required');
    if (!handled_by) throw new Error('handled_by is required');
    if (!item || item.type !== 'top_up') throw new Error('item is required and must be of type "top_up"');
    if (!payments || !Array.isArray(payments) || payments.length === 0) throw new Error('payments array is required');

    let customCreatedAt: Date = new Date();
    let customUpdatedAt: Date = customCreatedAt;
    if (created_at) {
      const d = new Date(created_at);
      if (!isNaN(d.getTime())) customCreatedAt = d;
    }
    if (updated_at) {
      const d = new Date(updated_at);
      if (!isNaN(d.getTime())) customUpdatedAt = d;
    }

    // Amounts
    const topUpAmount = Number(item.data.amount) || Number(item.pricing.totalLinePrice) || 0;
    const totalTransactionAmount = topUpAmount; // No GST on top up usually
    const totalGSTAmount = 0;

    const totalPaidAmount = roundTo2Decimals(
      payments.reduce((total: number, payment: PaymentMethodRequest) => total + (payment.amount || 0), 0),
    );

    let finalReceiptNo: string = receipt_number || '';
    if (!finalReceiptNo) {
      const last = await tx.saleTransaction.findFirst({
        where: { receiptNo: { startsWith: 'ST' } },
        orderBy: { receiptNo: 'desc' },
        select: { receiptNo: true },
      });
      const nextNum = last?.receiptNo ? parseInt(last.receiptNo.slice(2)) + 1 : 1;
      finalReceiptNo = `ST${nextNum.toString().padStart(6, '0')}`;
    }

    // 1. Update/Create StoredValueAccount
    let sva = await tx.storedValueAccount.findFirst({
      where: { memberId: BigInt(member_id) },
    });

    if (!sva) {
      sva = await tx.storedValueAccount.create({
        data: {
          memberId: BigInt(member_id),
          storedValue: 0,
          createdBy: BigInt(created_by),
          createdAt: customCreatedAt,
          updatedAt: customUpdatedAt,
        },
      });
    }

    // Update balance
    const newBalance = Number(sva.storedValue) + topUpAmount;
    await tx.storedValueAccount.update({
      where: { id: sva.id },
      data: {
        storedValue: newBalance,
        lastUpdatedBy: BigInt(created_by),
        updatedAt: customUpdatedAt,
      },
    });

    // Log transaction
    await tx.storedValueAccountTransactionLog.create({
      data: {
        storedValueAccountId: sva.id,
        storedValue: newBalance,
        amountChanged: topUpAmount,
        transactionDate: customCreatedAt,
        type: 'TOP_UP',
        createdBy: BigInt(created_by),
        createdAt: customCreatedAt,
        updatedAt: customUpdatedAt,
      },
    });

    // 2. Create SaleTransaction
    const createdTx = await tx.saleTransaction.create({
      data: {
        customerType: customer_type?.toUpperCase() || 'MEMBER',
        memberId: BigInt(member_id),
        totalPaidAmount: new Prisma.Decimal(totalPaidAmount),
        outstandingTotalPaymentAmount: 0,
        saleTransactionStatus: 'FULL',
        receiptNo: finalReceiptNo,
        remarks: remarks || item.data.remarks || '',
        processPayment: false,
        handledBy: BigInt(handled_by),
        createdBy: BigInt(created_by),
        createdAt: customCreatedAt,
        updatedAt: customUpdatedAt,
        gstAmount: new Prisma.Decimal(totalGSTAmount),
      },
      select: { id: true },
    });
    const saleTransactionId = Number(createdTx.id);

    // 3. Create Item
    await tx.saleTransactionItem.create({
      data: {
        saleTransactionId: BigInt(saleTransactionId),
        itemType: 'top_up',
        remarks: item.data.remarks || 'Stored Value Top Up',
        amount: new Prisma.Decimal(topUpAmount),
        quantity: 1,
      },
    });

    // 4. Payments
    for (const payment of payments) {
      if (payment.amount > 0) {
        await tx.paymentToSaleTransaction.create({
          data: {
            saleTransactionId: BigInt(saleTransactionId),
            paymentMethodId: BigInt(payment.methodId),
            amount: new Prisma.Decimal(payment.amount),
            remarks: payment.remark || '',
            createdBy: BigInt(created_by),
            createdAt: customCreatedAt,
            updatedBy: BigInt(created_by),
            updatedAt: customUpdatedAt,
          },
        });
      }
    }

    return {
      id: saleTransactionId,
      receipt_no: finalReceiptNo,
      customer_type: customer_type?.toUpperCase() || 'MEMBER',
      member_id: member_id,
      total_transaction_amount: totalTransactionAmount,
      total_paid_amount: totalPaidAmount,
      outstanding_total_payment_amount: 0,
      transaction_status: 'FULL',
      remarks: remarks || '',
      created_by,
      handled_by,
      items_count: 1,
      payments_count: payments.filter((p: PaymentMethodRequest) => p.amount > 0).length,
      gst_amount: totalGSTAmount,
    };
  });
};

/*
// LEGACY: disabled (not in use). Kept for reference.
const processPartialPaymentLegacy = async (
  transactionId: string | number,
  paymentData: ProcessPartialPaymentDataWithHandler
): Promise<PartialPaymentResult> => {
  const client = await pool().connect();

  try {
    await client.query('BEGIN');

    const { payments, general_remarks, transaction_handler_id, payment_handler_id, receipt_number, created_at } =
      paymentData;

    console.log('Processing partial payment for transaction:', transactionId);
    console.log('Payment data:', paymentData);

    // Validate input
    if (!payments || payments.length === 0) {
      throw new Error('At least one payment method is required');
    }

    if (!transaction_handler_id) {
      throw new Error('Transaction handler ID is required');
    }

    if (!payment_handler_id) {
      throw new Error('Payment handler ID is required');
    }

    // Parse and validate creation date for sale_transactions
    let customCreatedAt = null;
    if (created_at) {
      try {
        customCreatedAt = new Date(created_at);
        if (isNaN(customCreatedAt.getTime())) {
          throw new Error('Invalid creation date format');
        }
      } catch (error) {
        throw new Error('Invalid creation date format');
      }
    }

    // Get original transaction details
    const originalTransactionQuery = `
      SELECT 
        st.id,
        st.customer_type,
        st.member_id,
        st.total_paid_amount,
        st.outstanding_total_payment_amount,
        st.sale_transaction_status,
        st.remarks,
        st.receipt_no,
        st.handled_by,
        st.created_by,
        st.process_payment
      FROM sale_transactions st
      WHERE st.id = $1 AND st.process_payment = true
    `;

    const originalResult = await client.query(originalTransactionQuery, [transactionId]);

    if (originalResult.rows.length === 0) {
      throw new Error('Transaction not found or not available for payment processing');
    }

    const originalTransaction = originalResult.rows[0];

    // Calculate payment amounts - EXCLUDE pending payments from total_paid_amount
    const PENDING_PAYMENT_METHOD_ID = 7;

    const actualPayments = payments.filter((payment) => payment.payment_method_id !== PENDING_PAYMENT_METHOD_ID);
    const pendingPayments = payments.filter((payment) => payment.payment_method_id === PENDING_PAYMENT_METHOD_ID);

    const totalActualPaymentAmount = roundTo2Decimals(actualPayments.reduce((sum, payment) => sum + payment.amount, 0));
    const totalPendingAmount = roundTo2Decimals(pendingPayments.reduce((sum, payment) => sum + payment.amount, 0));
    const totalNewPaymentAmount = roundTo2Decimals(totalActualPaymentAmount + totalPendingAmount);

    // Validate payment amount doesn't exceed outstanding
    if (totalNewPaymentAmount > originalTransaction.outstanding_total_payment_amount) {
      throw new Error(
        `Payment amount (${totalNewPaymentAmount}) exceeds outstanding amount (${originalTransaction.outstanding_total_payment_amount})`
      );
    }

    // Get original transaction items to copy
    const originalItemsQuery = `
      SELECT 
        service_name, product_name, member_care_package_id, member_voucher_id,
        original_unit_price, custom_unit_price, discount_percentage, quantity,
        remarks, amount, item_type
      FROM sale_transaction_items 
      WHERE sale_transaction_id = $1
    `;

    const originalItemsResult = await client.query(originalItemsQuery, [transactionId]);
    const originalItems = originalItemsResult.rows;

    // Calculate new transaction values
    const newTotalPaidAmount = roundTo2Decimals(totalActualPaymentAmount);
    const newOutstandingAmount = roundTo2Decimals(
      originalTransaction.outstanding_total_payment_amount - totalActualPaymentAmount
    );
    const newTransactionStatus = newOutstandingAmount > 0.01 ? 'PARTIAL' : 'FULL';
    const newProcessPayment = newOutstandingAmount > 0.01;

    console.log('New transaction calculations:', {
      originalOutstandingAmount: originalTransaction.outstanding_total_payment_amount,
      newActualPaymentAmount: totalActualPaymentAmount,
      newTotalPaidAmount,
      newOutstandingAmount,
      newTransactionStatus,
      newProcessPayment,
    });

    // Determine receipt number to use
    const finalReceiptNumber = receipt_number || originalTransaction.receipt_no;
    console.log('Using receipt number:', finalReceiptNumber);

    // Create new transaction with required handlers and custom date/receipt
    const newTransactionQuery = `
      INSERT INTO sale_transactions (
        customer_type, member_id, total_paid_amount, outstanding_total_payment_amount,
        sale_transaction_status, remarks, receipt_no, reference_sales_transaction_id,
        handled_by, created_by, created_at, updated_at, process_payment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;

    const currentTime = customCreatedAt || new Date();

    const newTransactionParams = [
      originalTransaction.customer_type,
      originalTransaction.member_id,
      newTotalPaidAmount,
      newOutstandingAmount,
      newTransactionStatus,
      general_remarks || `Additional payment for receipt ${originalTransaction.receipt_no}`,
      finalReceiptNumber,
      originalTransaction.id,
      transaction_handler_id,
      payment_handler_id,
      currentTime,
      currentTime,
      newProcessPayment,
    ];

    const newTransactionResult = await client.query(newTransactionQuery, newTransactionParams);
    const newTransactionId = newTransactionResult.rows[0].id;

    const packageItems = originalItems.filter((item: any) => item.member_care_package_id);
    const voucherItems = originalItems.filter((item: any) => item.member_voucher_id);

    console.log(
      'Created new transaction with ID:',
      newTransactionId,
      'receipt number:',
      finalReceiptNumber,
      'handled by:',
      transaction_handler_id,
      'created by:',
      payment_handler_id,
      'created at:',
      customCreatedAt || 'current time'
    );

    // Copy all items from original transaction
    for (const item of originalItems) {
      const insertItemQuery = `
        INSERT INTO sale_transaction_items (
          sale_transaction_id, service_name, product_name, member_care_package_id, member_voucher_id,
          original_unit_price, custom_unit_price, discount_percentage, quantity,
          remarks, amount, item_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `;

      if (packageItems.length > 0) {
        item.item_type = 'member care package';
      } else if (voucherItems.length > 0) {
        item.item_type = 'member voucher';
      }

      const itemParams = [
        newTransactionId,
        item.service_name,
        item.product_name,
        item.member_care_package_id,
        item.member_voucher_id,
        item.original_unit_price,
        item.custom_unit_price,
        item.discount_percentage,
        item.quantity,
        item.remarks,
        item.amount,
        item.item_type,
      ];

      await client.query(insertItemQuery, itemParams);
    }

    // Create payment records
    for (const payment of payments) {
      const insertPaymentQuery = `
        INSERT INTO payment_to_sale_transactions (
          sale_transaction_id, payment_method_id, amount, remarks, 
          created_by, updated_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      const paymentParams = [
        newTransactionId,
        payment.payment_method_id,
        payment.amount,
        payment.remarks || '',
        payment.payment_handler_id,
        payment.payment_handler_id,
        currentTime,
        currentTime,
      ];

      await client.query(insertPaymentQuery, paymentParams);
    }

    // Update original transaction to disable payment processing
    await client.query('UPDATE sale_transactions SET process_payment = false WHERE id = $1', [originalTransaction.id]);

    // Update care package balances if applicable
    if (packageItems.length > 0) {
      for (const packageItem of packageItems) {
        await client.query('UPDATE member_care_packages SET balance = COALESCE(balance, 0) + $1 WHERE id = $2', [
          totalActualPaymentAmount,
          packageItem.member_care_package_id,
        ]);
      }
    }
    if (voucherItems.length > 0) {
      for (const voucherItem of voucherItems) {
        // Get current balance before update for logging
        const currentVoucherResult = await client.query('SELECT current_balance FROM member_vouchers WHERE id = $1', [
          voucherItem.member_voucher_id,
        ]);

        const currentBalance = parseFloat(currentVoucherResult.rows[0]?.current_balance) || 0;

        // Update voucher balance
        await client.query(
          'UPDATE member_vouchers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE id = $2',
          [totalActualPaymentAmount, voucherItem.member_voucher_id]
        );

        // Log the partial payment transaction
        const insertPartialPaymentLogQuery = `
      INSERT INTO member_voucher_transaction_logs (
        member_voucher_id,
        service_description,
        service_date,
        current_balance,
        amount_change,
        serviced_by,
        type,
        created_by,
        last_updated_by,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

        const newBalance = currentBalance + totalActualPaymentAmount;
        const partialPaymentLogParams = [
          voucherItem.member_voucher_id,
          `Payment received for receipt ${finalReceiptNumber}${
            newTransactionStatus === 'PARTIAL' ? ' (Partial Payment)' : ''
          }`,
          currentTime,
          newBalance,
          totalActualPaymentAmount,
          transaction_handler_id,
          newTransactionStatus === 'PARTIAL' ? 'ADD PARTIAL' : 'ADD PAYMENT',
          payment_handler_id,
          payment_handler_id,
          currentTime,
          currentTime,
        ];

        await client.query(insertPartialPaymentLogQuery, partialPaymentLogParams);

        console.log(
          `Inserted voucher transaction log for voucher ID ${
            voucherItem.member_voucher_id
          }, balance change: +${totalActualPaymentAmount} (${
            newTransactionStatus === 'PARTIAL' ? 'Partial Payment' : 'Payment'
          })`
        );
      }
    }
    // Handle voucher free-of-charge additions if transaction is fully paid
    if (voucherItems.length > 0 && newTransactionStatus === 'FULL') {
      for (const voucherItem of voucherItems) {
        const voucherResult = await client.query(
          'SELECT free_of_charge, current_balance FROM member_vouchers WHERE id = $1',
          [voucherItem.member_voucher_id]
        );

        if (voucherResult.rows.length > 0) {
          const voucher = voucherResult.rows[0];
          const freeOfCharge = parseFloat(voucher.free_of_charge) || 0;
          const currentBalance = parseFloat(voucher.current_balance) || 0;

          if (freeOfCharge > 0) {
            // Update the voucher balance
            await client.query(
              'UPDATE member_vouchers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE id = $2',
              [freeOfCharge, voucherItem.member_voucher_id]
            );

            // Insert transaction log for the fully paid voucher
            const insertVoucherLogQuery = `
              INSERT INTO member_voucher_transaction_logs (
                member_voucher_id,
                service_description,
                service_date,
                current_balance,
                amount_change,
                serviced_by,
                type,
                created_by,
                last_updated_by,
                created_at,
                updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `;

            const newBalance = currentBalance + freeOfCharge;
            const voucherLogParams = [
              voucherItem.member_voucher_id,
              `Payment completed for receipt ${finalReceiptNumber}`,
              currentTime,
              newBalance,
              freeOfCharge,
              transaction_handler_id,
              'ADD FOC',
              payment_handler_id,
              payment_handler_id,
              currentTime,
              currentTime,
            ];

            await client.query(insertVoucherLogQuery, voucherLogParams);

            console.log(
              `Inserted voucher transaction log for voucher ID ${voucherItem.member_voucher_id}, balance change: +${freeOfCharge}`
            );
          }
        }
      }
    }

    await client.query('COMMIT');

    console.log('Payment processing completed successfully');

    return {
      new_transaction: {
        id: newTransactionId,
        receipt_no: finalReceiptNumber,
        total_paid_amount: newTotalPaidAmount,
        outstanding_amount: newOutstandingAmount,
        transaction_status: newTransactionStatus,
        process_payment: newProcessPayment,
      },
      original_transaction: {
        id: originalTransaction.id,
        receipt_no: originalTransaction.receipt_no,
        process_payment: false,
      },
      payments_processed: payments.length,
      total_payment_amount: totalNewPaymentAmount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing partial payment:', error);
    throw error;
  } finally {
    client.release();
  }
};
*/

// Prisma-based implementation of partial payment processing
const processPartialPayment = async (
  transactionId: string | number,
  paymentData: ProcessPartialPaymentDataWithHandler,
): Promise<PartialPaymentResult> => {
  const prisma = getPrisma();

  return await prisma.$transaction(async (tx) => {
    const { payments, general_remarks, transaction_handler_id, payment_handler_id, receipt_number, created_at } =
      paymentData;

    if (!payments || payments.length === 0) {
      throw new Error('At least one payment method is required');
    }
    if (!transaction_handler_id) {
      throw new Error('Transaction handler ID is required');
    }
    if (!payment_handler_id) {
      throw new Error('Payment handler ID is required');
    }

    let customCreatedAt: Date | null = null;
    if (created_at) {
      const d = new Date(created_at);
      if (isNaN(d.getTime())) throw new Error('Invalid creation date format');
      customCreatedAt = d;
    }
    const currentTime = customCreatedAt || new Date();

    const original = await tx.saleTransaction.findFirst({
      where: { id: BigInt(transactionId), processPayment: true },
      select: {
        id: true,
        customerType: true,
        memberId: true,
        totalPaidAmount: true,
        outstandingTotalPaymentAmount: true,
        saleTransactionStatus: true,
        remarks: true,
        receiptNo: true,
        handledBy: true,
        createdBy: true,
      },
    });
    if (!original) {
      throw new Error('Transaction not found or not available for payment processing');
    }

    const PENDING_PAYMENT_METHOD_ID = 7;
    const actualPayments = payments.filter((p) => p.payment_method_id !== PENDING_PAYMENT_METHOD_ID);
    const pendingPayments = payments.filter((p) => p.payment_method_id === PENDING_PAYMENT_METHOD_ID);
    const totalActualPaymentAmount = roundTo2Decimals(actualPayments.reduce((s, p) => s + p.amount, 0));
    const totalPendingAmount = roundTo2Decimals(pendingPayments.reduce((s, p) => s + p.amount, 0));
    const totalNewPaymentAmount = roundTo2Decimals(totalActualPaymentAmount + totalPendingAmount);

    if (totalNewPaymentAmount > Number(original.outstandingTotalPaymentAmount || 0)) {
      throw new Error(
        `Payment amount (${totalNewPaymentAmount}) exceeds outstanding amount (${original.outstandingTotalPaymentAmount})`,
      );
    }

    const originalItems = await tx.saleTransactionItem.findMany({
      where: { saleTransactionId: BigInt(transactionId) },
      select: {
        serviceName: true,
        productName: true,
        memberCarePackageId: true,
        memberVoucherId: true,
        originalUnitPrice: true,
        customUnitPrice: true,
        discountPercentage: true,
        quantity: true,
        remarks: true,
        amount: true,
        itemType: true,
      },
    });

    const newTotalPaidAmount = roundTo2Decimals(totalActualPaymentAmount);
    const newOutstandingAmount = roundTo2Decimals(
      Number(original.outstandingTotalPaymentAmount || 0) - totalActualPaymentAmount,
    );
    const newTransactionStatus = newOutstandingAmount > 0.01 ? 'PARTIAL' : 'FULL';
    const newProcessPayment = newOutstandingAmount > 0.01;

    const finalReceiptNumber = receipt_number || original.receiptNo || '';

    const newTx = await tx.saleTransaction.create({
      data: {
        customerType: original.customerType,
        memberId: original.memberId,
        totalPaidAmount: new Prisma.Decimal(newTotalPaidAmount),
        outstandingTotalPaymentAmount: new Prisma.Decimal(newOutstandingAmount),
        saleTransactionStatus: newTransactionStatus,
        remarks: general_remarks || `Additional payment for receipt ${original.receiptNo}`,
        receiptNo: finalReceiptNumber,
        referenceSalesTransactionId: BigInt(original.id),
        handledBy: BigInt(transaction_handler_id),
        createdBy: BigInt(payment_handler_id),
        createdAt: currentTime,
        updatedAt: currentTime,
        processPayment: newProcessPayment,
      },
      select: { id: true },
    });
    const newTransactionId = Number(newTx.id);

    const packageItems = originalItems.filter((item) => item.memberCarePackageId);
    const voucherItems = originalItems.filter((item) => item.memberVoucherId);

    for (const item of originalItems) {
      let itemType = item.itemType || null;
      if (packageItems.length > 0) itemType = 'member care package';
      else if (voucherItems.length > 0) itemType = 'member voucher';

      await tx.saleTransactionItem.create({
        data: {
          saleTransactionId: BigInt(newTransactionId),
          serviceName: item.serviceName,
          productName: item.productName,
          memberCarePackageId: item.memberCarePackageId,
          memberVoucherId: item.memberVoucherId,
          originalUnitPrice: item.originalUnitPrice
            ? new Prisma.Decimal(item.originalUnitPrice as any)
            : new Prisma.Decimal(0),
          customUnitPrice: item.customUnitPrice
            ? new Prisma.Decimal(item.customUnitPrice as any)
            : new Prisma.Decimal(0),
          discountPercentage: item.discountPercentage
            ? new Prisma.Decimal(item.discountPercentage as any)
            : new Prisma.Decimal(0),
          quantity: item.quantity || 1,
          remarks: item.remarks || '',
          amount: item.amount ? new Prisma.Decimal(item.amount as any) : new Prisma.Decimal(0),
          itemType: itemType || undefined,
        },
        select: { id: true },
      });
    }

    for (const payment of payments) {
      await tx.paymentToSaleTransaction.create({
        data: {
          saleTransactionId: BigInt(newTransactionId),
          paymentMethodId: BigInt(payment.payment_method_id),
          amount: new Prisma.Decimal(payment.amount),
          remarks: payment.remarks || '',
          createdBy: BigInt(payment.payment_handler_id),
          updatedBy: BigInt(payment.payment_handler_id),
          createdAt: currentTime,
          updatedAt: currentTime,
        },
        select: { id: true },
      });
    }

    await tx.saleTransaction.update({
      where: { id: BigInt(original.id) },
      data: { processPayment: false },
    });

    if (packageItems.length > 0) {
      for (const packageItem of packageItems) {
        if (packageItem.memberCarePackageId) {
          await tx.memberCarePackage.update({
            where: { id: packageItem.memberCarePackageId },
            data: { balance: { increment: new Prisma.Decimal(totalActualPaymentAmount) } },
          });
        }
      }
    }

    if (voucherItems.length > 0) {
      for (const voucherItem of voucherItems) {
        if (voucherItem.memberVoucherId) {
          const currentVoucher = await tx.memberVoucher.findUnique({
            where: { id: voucherItem.memberVoucherId },
            select: { currentBalance: true },
          });
          const currentBal = parseFloat(String(currentVoucher?.currentBalance || 0));

          await tx.memberVoucher.update({
            where: { id: voucherItem.memberVoucherId },
            data: { currentBalance: { increment: new Prisma.Decimal(totalActualPaymentAmount) } },
          });

          const newBalance = roundTo2Decimals(currentBal + totalActualPaymentAmount);
          await tx.memberVoucherTransactionLog.create({
            data: {
              memberVoucherId: voucherItem.memberVoucherId,
              serviceDescription: `Payment received for receipt ${finalReceiptNumber}${
                newTransactionStatus === 'PARTIAL' ? ' (Partial Payment)' : ''
              }`,
              serviceDate: currentTime,
              currentBalance: new Prisma.Decimal(newBalance),
              amountChange: new Prisma.Decimal(totalActualPaymentAmount),
              servicedBy: BigInt(transaction_handler_id),
              type: newTransactionStatus === 'PARTIAL' ? 'ADD PARTIAL' : 'ADD PAYMENT',
              createdBy: BigInt(payment_handler_id),
              lastUpdatedBy: BigInt(payment_handler_id),
              createdAt: currentTime,
              updatedAt: currentTime,
            },
            select: { id: true },
          });
        }
      }
    }

    if (voucherItems.length > 0 && newTransactionStatus === 'FULL') {
      for (const voucherItem of voucherItems) {
        if (voucherItem.memberVoucherId) {
          const voucher = await tx.memberVoucher.findUnique({
            where: { id: voucherItem.memberVoucherId },
            select: { freeOfCharge: true, currentBalance: true },
          });
          const foc = parseFloat(String(voucher?.freeOfCharge || 0));
          const curBal = parseFloat(String(voucher?.currentBalance || 0));
          if (foc > 0) {
            await tx.memberVoucher.update({
              where: { id: voucherItem.memberVoucherId },
              data: { currentBalance: { increment: new Prisma.Decimal(foc) } },
            });

            const newBalance = roundTo2Decimals(curBal + foc);
            await tx.memberVoucherTransactionLog.create({
              data: {
                memberVoucherId: voucherItem.memberVoucherId,
                serviceDescription: `Payment completed for receipt ${finalReceiptNumber}`,
                serviceDate: currentTime,
                currentBalance: new Prisma.Decimal(newBalance),
                amountChange: new Prisma.Decimal(foc),
                servicedBy: BigInt(transaction_handler_id),
                type: 'ADD FOC',
                createdBy: BigInt(payment_handler_id),
                lastUpdatedBy: BigInt(payment_handler_id),
                createdAt: currentTime,
                updatedAt: currentTime,
              },
              select: { id: true },
            });
          }
        }
      }
    }

    return {
      new_transaction: {
        id: newTransactionId,
        receipt_no: finalReceiptNumber,
        total_paid_amount: newTotalPaidAmount,
        outstanding_amount: newOutstandingAmount,
        transaction_status: newTransactionStatus,
        process_payment: newProcessPayment,
      },
      original_transaction: {
        id: Number(original.id),
        receipt_no: original.receiptNo || '',
        process_payment: false,
      },
      payments_processed: payments.length,
      total_payment_amount: totalNewPaymentAmount,
    };
  });
};

export default {
  getSalesTransactionList,
  getSalesTransactionById,
  searchServices,
  searchProducts,
  createServicesProductsTransaction,
  createMcpTransaction,
  createMcpTransferTransaction,
  createMvTransferTransaction,
  createTopUpTransaction,
  processPartialPayment,
};
