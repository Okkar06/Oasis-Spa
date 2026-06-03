import { getPrisma } from '../lib/prisma.js';
import { PaginatedOptions, PaginatedReturn } from '../types/common.types.js';
import {
  MemberVouchers,
  MemberVoucherServices,
  MemberVoucherTransactionLogs,
  MemberVoucherTransactionLogCreateData,
  MemberName,
  MemberVoucherTransactionLogUpdateData,
  Employees,
} from '../types/model.types.js';
import { encodeCursor } from '../utils/cursorUtils.js';
import {
  PaymentMethodRequest,
  SingleItemTransactionCreationResult,
  SingleItemTransactionRequestData,
} from '../types/SaleTransactionTypes.js';

const roundTo2Decimals = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
const normalizeBigInts = (data: any): any =>
  JSON.parse(JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value)));

const getPaginatedVouchers = async (
  limit: number,
  options: PaginatedOptions = {},
  start_date_utc: string | undefined | null,
  end_date_utc: string
): Promise<{ success: boolean; data: PaginatedReturn<MemberVouchers> | []; message: string }> => {
  const { after, before, page, searchTerm } = options;

  try {
    const prisma = getPrisma();

    const startDate = start_date_utc ? new Date(start_date_utc) : undefined;
    const endDate = end_date_utc ? new Date(end_date_utc) : undefined;

    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    if (searchTerm && searchTerm.trim().length > 0) {
      const term = searchTerm.trim();
      where.OR = [
        { memberVoucherName: { contains: term, mode: 'insensitive' } },
        { member: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

    const takeForPage = page && page > 0 ? limit : limit + 1;
    const skipForPage = page && page > 0 ? (page - 1) * limit : 0;

    if (after) {
      where.OR = [
        ...(where.OR || []),
        {
          createdAt: { lt: after.createdAt },
        },
        {
          AND: [{ createdAt: after.createdAt }, { id: { lt: BigInt(after.id) } }],
        },
      ];
    }

    if (before) {
      where.OR = [
        ...(where.OR || []),
        {
          createdAt: { gt: before.createdAt },
        },
        {
          AND: [{ createdAt: before.createdAt }, { id: { gt: BigInt(before.id) } }],
        },
      ];
    }

    const [rows, totalCount] = await Promise.all([
      prisma.memberVoucher.findMany({
        where,
        select: {
          id: true,
          memberVoucherName: true,
          voucherTemplateId: true,
          memberId: true,
          currentBalance: true,
          startingBalance: true,
          freeOfCharge: true,
          defaultTotalPrice: true,
          status: true,
          remarks: true,
          createdBy: true,
          handledBy: true,
          lastUpdatedBy: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy,
        take: takeForPage,
        skip: skipForPage,
      }),
      prisma.memberVoucher.count({ where }),
    ]);

    const hasExtra = page && page > 0 ? false : rows.length > limit;
    const sliced = hasExtra ? rows.slice(0, limit) : rows;

    const vouchers: MemberVouchers[] = sliced.map((v: any) => ({
      id: Number(v.id),
      member_voucher_name: v.memberVoucherName,
      voucher_template_id: Number(v.voucherTemplateId),
      member_id: Number(v.memberId),
      current_balance: Number(v.currentBalance || 0),
      starting_balance: Number(v.startingBalance || 0),
      free_of_charge: Number(v.freeOfCharge || 0),
      default_total_price: Number(v.defaultTotalPrice || 0),
      status: v.status || '',
      remarks: v.remarks || '',
      created_by: Number(v.createdBy || 0),
      handled_by: Number(v.handledBy || 0),
      last_updated_by: Number(v.lastUpdatedBy || 0),
      created_at: v.createdAt ? v.createdAt.toISOString() : '',
      updated_at: v.updatedAt ? v.updatedAt.toISOString() : '',
    }));

    let hasNextPage = false;
    let hasPreviousPage = false;

    if (page && page > 0) {
      hasNextPage = page * limit < totalCount;
      hasPreviousPage = page > 1;
    } else {
      if (before) {
        hasPreviousPage = rows.length > limit;
        hasNextPage = vouchers.length > 0;
      } else {
        hasNextPage = rows.length > limit;
        hasPreviousPage = !!after && vouchers.length > 0;
      }
    }

    let startCursor: string | null = null;
    let endCursor: string | null = null;
    if (vouchers.length > 0) {
      startCursor = encodeCursor(new Date(vouchers[0].created_at), vouchers[0].id ?? null);
      endCursor = encodeCursor(
        new Date(vouchers[vouchers.length - 1].created_at),
        vouchers[vouchers.length - 1].id ?? null
      );
    }

    const data = {
      data: vouchers,
      pageInfo: {
        startCursor,
        endCursor,
        hasNextPage,
        hasPreviousPage,
        totalCount,
      },
    };

    return { success: true, data: data, message: 'Successfully retrieved paginated vouchers.' };
  } catch (error) {
    console.error('Error retrieving paginated vouchers:', error);
    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }
    return { success: false, data: [], message: 'Failed to retrieve paginated vouchers due to database error.' };
  }
};

const getServicesOfMemberVoucherById = async (
  id: number
): Promise<{ success: boolean; data: MemberVoucherServices[] | []; message: string }> => {
  if (!Number.isInteger(id) || id <= 0) {
    return { success: false, data: [], message: 'id must be a positive integer' };
  }

  try {
    const prisma = getPrisma();

    const details = await prisma.memberVoucherDetail.findMany({
      where: { memberVoucherId: BigInt(id) },
      select: {
        id: true,
        serviceName: true,
        originalPrice: true,
        customPrice: true,
        discount: true,
        duration: true,
        finalPrice: true,
      },
      orderBy: { id: 'asc' },
    });

    const formattedDetails = details.map((detail: any) => ({
      id: Number(detail.id),
      service_name: detail.serviceName || '',
      original_price: Number(detail.originalPrice || 0),
      custom_price: Number(detail.customPrice || 0),
      discount: Number(detail.discount || 0),
      duration: Number(detail.duration || 0),
      final_price: Number(detail.finalPrice || 0),
    }));

    if (formattedDetails.length > 0) {
      return { success: true, data: formattedDetails, message: 'Get Services of Member Voucher By Id was successful' };
    } else {
      return { success: true, data: [], message: 'No services found for this member voucher' };
    }
  } catch (error) {
    console.error('Error retrieving services of member voucher:', error);

    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }

    return {
      success: false,
      data: [],
      message: 'Failed to retrieve services of member voucher due to database error.',
    };
  }
};

const getPurchaseDateOfMemberVoucherById = async (
  id: number
): Promise<{ success: boolean; data?: Date; message?: string }> => {
  if (!Number.isInteger(id) || id <= 0) {
    return { success: true, data: undefined, message: 'id must be a positive integer' };
  }

  try {
    const prisma = getPrisma();

    const firstLog = await prisma.memberVoucherTransactionLog.findFirst({
      where: { memberVoucherId: BigInt(id) },
      select: { serviceDate: true },
      orderBy: { id: 'asc' },
    });

    console.log('Purchase Date: ');
    console.log(firstLog?.serviceDate);

    if (firstLog) {
      return {
        success: true,
        data: firstLog.serviceDate || undefined,
        message: 'Get Purchase Date of Member Voucher By Id was successful',
      };
    } else {
      return { success: true, data: undefined, message: 'No purchase date found for this member voucher' };
    }
  } catch (error) {
    console.error('Error retrieving Purchase Date of member voucher:', error);

    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }

    return {
      success: true,
      data: undefined,
      message: 'Failed to retrieve Purchase Date of member voucher due to database error.',
    };
  }
};

const getPaginatedMemberVoucherTransactionLogs = async (
  id: number,
  limit: number,
  options: PaginatedOptions = {},
  start_date_utc: string | undefined | null,
  end_date_utc: string
): Promise<{ success: boolean; data: PaginatedReturn<MemberVoucherTransactionLogs> | []; message: string }> => {
  const { after, before, page } = options;

  try {
    const prisma = getPrisma();

    const startDate = start_date_utc ? new Date(start_date_utc) : undefined;
    const endDate = end_date_utc ? new Date(end_date_utc) : undefined;

    const where: any = {
      memberVoucherId: BigInt(id),
    };

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const takeForPage = page && page > 0 ? limit : limit + 1;
    const skipForPage = page && page > 0 ? (page - 1) * limit : 0;

    if (after) {
      where.OR = [
        { createdAt: { lt: after.createdAt } },
        { AND: [{ createdAt: after.createdAt }, { id: { lt: BigInt(after.id) } }] },
      ];
    }

    if (before) {
      where.OR = [
        { createdAt: { gt: before.createdAt } },
        { AND: [{ createdAt: before.createdAt }, { id: { gt: BigInt(before.id) } }] },
      ];
    }

    const [rows, totalCount] = await Promise.all([
      prisma.memberVoucherTransactionLog.findMany({
        where,
        select: {
          id: true,
          memberVoucherId: true,
          serviceDescription: true,
          serviceDate: true,
          currentBalance: true,
          amountChange: true,
          servicedBy: true,
          type: true,
          createdBy: true,
          lastUpdatedBy: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy,
        take: takeForPage,
        skip: skipForPage,
      }),
      prisma.memberVoucherTransactionLog.count({ where }),
    ]);

    const hasExtra = page && page > 0 ? false : rows.length > limit;
    const sliced = hasExtra ? rows.slice(0, limit) : rows;

    const transactionLogs: MemberVoucherTransactionLogs[] = sliced.map((t: any) => ({
      id: Number(t.id),
      member_voucher_id: Number(t.memberVoucherId),
      service_description: t.serviceDescription || '',
      service_date: t.serviceDate ? t.serviceDate.toISOString() : '',
      current_balance: Number(t.currentBalance || 0),
      amount_change: Number(t.amountChange || 0),
      serviced_by: Number(t.servicedBy || 0),
      type: t.type || '',
      created_by: Number(t.createdBy || 0),
      updated_by: Number(t.lastUpdatedBy || 0),
      created_at: t.createdAt ? t.createdAt.toISOString() : '',
      updated_at: t.updatedAt ? t.updatedAt.toISOString() : '',
    }));

    let hasNextPage = false;
    let hasPreviousPage = false;
    if (page && page > 0) {
      hasNextPage = page * limit < totalCount;
      hasPreviousPage = page > 1;
    } else {
      if (before) {
        hasPreviousPage = rows.length > limit;
        hasNextPage = transactionLogs.length > 0;
      } else {
        hasNextPage = rows.length > limit;
        hasPreviousPage = !!after && transactionLogs.length > 0;
      }
    }

    let startCursor: string | null = null;
    let endCursor: string | null = null;
    if (transactionLogs.length > 0) {
      startCursor = encodeCursor(new Date(transactionLogs[0].created_at), transactionLogs[0].id ?? null);
      endCursor = encodeCursor(
        new Date(transactionLogs[transactionLogs.length - 1].created_at),
        transactionLogs[transactionLogs.length - 1].id ?? null
      );
    }

    const data = {
      data: transactionLogs,
      pageInfo: {
        startCursor,
        endCursor,
        hasNextPage,
        hasPreviousPage,
        totalCount,
      },
    };

    return { success: true, data: data, message: 'Successfully retrieved paginated transaction logs.' };
  } catch (error) {
    console.error('Error retrieving paginated transaction logs:', error);
    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }
    return {
      success: false,
      data: [],
      message: 'Failed to retrieve paginated transaction logs due to database error.',
    };
  }
};

const addTransactionLogsByMemberVoucherId = async (
  data: MemberVoucherTransactionLogCreateData
): Promise<{ success: boolean; message: string }> => {
  const { id, consumptionValue, remarks, date, time, type, createdBy, handledBy, current_balance } = data;

  console.log(current_balance);

  const currentBalanceAfterDeduction = current_balance - consumptionValue;

  const negConsumptionValue = -consumptionValue;

  console.log('consumptionValue: ' + negConsumptionValue);

  const service_date = new Date(`${date}T${time}`);

  const last_updated_by = createdBy;

  const created_at = new Date();

  const updated_at = created_at;

  try {
    const prisma = getPrisma();

    // Use Prisma transaction to ensure both operations succeed or fail together
    await prisma.$transaction(async (tx) => {
      // Create transaction log
      await tx.memberVoucherTransactionLog.create({
        data: {
          memberVoucherId: BigInt(id),
          serviceDescription: remarks,
          serviceDate: service_date,
          currentBalance: currentBalanceAfterDeduction,
          amountChange: negConsumptionValue,
          servicedBy: BigInt(handledBy),
          type: type,
          createdBy: BigInt(createdBy),
          lastUpdatedBy: BigInt(last_updated_by),
          createdAt: created_at,
          updatedAt: updated_at,
        },
      });

      // Update voucher balance
      await tx.memberVoucher.update({
        where: { id: BigInt(id) },
        data: {
          currentBalance: currentBalanceAfterDeduction,
        },
      });
    });

    return {
      success: true,
      message: 'Member Voucher transaction log created and balance updated successfully.',
    };
  } catch (error) {
    console.error('Error creating Transaction Log by Member Voucher Id:', error);

    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }

    return { success: false, message: 'Failed to create Transaction Log by Member Voucher Id due to database error.' };
  }
};

const getMemberVoucherCurrentBalance = async (
  id: number,
  consumptionValue: number
): Promise<{ success: boolean; data?: number; message?: string }> => {
  if (!Number(id)) {
    return { success: false, message: 'Error 400: id must be an integer' };
  }

  if (isNaN(Number(consumptionValue))) {
    return { success: false, message: 'Error 400: consumption value must be an integer' };
  }

  try {
    const prisma = getPrisma();

    const voucher = await prisma.memberVoucher.findUnique({
      where: { id: BigInt(id) },
      select: { currentBalance: true },
    });

    if (!voucher) {
      return { success: false, message: 'Error 400: This Member Voucher does not exist' };
    }

    const current_balance = Number(voucher.currentBalance || 0);

    if (Number.isNaN(current_balance)) {
      return { success: false, message: 'Error 400: This Member Voucher does not exist' };
    }

    const balanceAfterDeduction = current_balance - consumptionValue;

    if (balanceAfterDeduction < 0) {
      return { success: false, message: 'Error 400: The Consumption Value is greater than the Current balance.' };
    } else {
      return { success: true, data: current_balance };
    }
  } catch (error) {
    console.error('Error retrieving current balance by Member Voucher Id:', error);

    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }

    return { success: false, message: 'Failed to current balance by Member Voucher Id due to database error.' };
  }
};

// const getMemberVoucherPaidCurrentBalance = async (id: number, consumptionValue: number): Promise<{ success: boolean, data?: number, message?: string }> => {
//   if (!Number(id)) {
//     return { success: false, message: "Error 400: id must be an integer" };
//   };

//   if (isNaN(Number(consumptionValue))) {
//     return { success: false, message: "Error 400: consumption value must be an integer" };
//   };

//   const client = await pool().connect();
//   try {
//     const query = `
//     SELECT st.outstanding_total_payment_amount, mv.current_balance
//     FROM sale_transactions st
//     JOIN sale_transaction_items sti ON st.id = sti.sale_transaction_id
//     JOIN member_vouchers mv ON sti.member_voucher_id = mv.id
//     WHERE sti.member_voucher_id = $1
//     ORDER BY sti.sale_transaction_id DESC
//     LIMIT 1;
//     `;

//     const results = await client.query(query, [id]);
//     console.log(results);

//     if (results.rowCount === 0) {
//       return { success: false, message: "Error 400: This Member Voucher does not exist" };
//     }

//     const current_balance = parseFloat(results.rows[0].current_balance);
//     const outstanding_total_payment_amount = parseFloat(results.rows[0].outstanding_total_payment_amount);
//     // const free_of_charge = parseFloat(results.rows[0].free_of_charge);

//     if (outstanding_total_payment_amount === 0) {
//       return { success: true, data: current_balance };
//     }

//     const paidBalance = current_balance - outstanding_total_payment_amount //- free_of_charge;

//     const paidbalanceAfterDeduction = paidBalance + consumptionValue;

//     if (paidbalanceAfterDeduction < 0) {
//       return { success: false, message: "Error 400: The Consumption Value is greater than the Paid Current balance." };
//     } else {
//       return { success: true, data: current_balance };
//     }
//   } catch (error) {
//     console.error('Error retrieving paid current balance by Member Voucher Id:', error);

//     console.error('Full error details:', {
//       error: error instanceof Error ? error.message : 'Unknown error',
//       stack: error instanceof Error ? error.stack : undefined
//     });

//     if (error instanceof Error && error.message.includes('connection')) {
//       throw new Error('Database connection failed. Please try again later.');
//     }

//     return { success: false, message: "Failed to get paid current balance by Member Voucher Id due to database error." };
//   }
// };

const getMemberNameByMemberVoucherId = async (
  id: number
): Promise<{ success: boolean; data: MemberName | null; message: string }> => {
  if (!Number.isInteger(id) || id <= 0) {
    return { success: true, data: null, message: 'id must be a positive integer' };
  }

  try {
    const prisma = getPrisma();

    const voucher = await prisma.memberVoucher.findUnique({
      where: { id: BigInt(id) },
      select: {
        member: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (voucher?.member) {
      return {
        success: true,
        data: {
          id: Number(voucher.member.id),
          member_name: voucher.member.name,
        },
        message: 'Get Member Name By Member Voucher Id was successful',
      };
    } else {
      return { success: true, data: null, message: 'No member name found for this member voucher' };
    }
  } catch (error) {
    console.error('Error retrieving Member Name By Member Voucher Id:', error);

    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }

    return { success: false, data: null, message: 'Failed to Member Name By Member Voucher Id due to database error.' };
  }
};

const setTransactionLogsAndCurrentBalanceByLogId = async (
  data: MemberVoucherTransactionLogUpdateData
): Promise<{ success: boolean; message: string }> => {
  const {
    member_voucher_id,
    transaction_log_id,
    consumptionValue,
    remarks,
    date,
    time,
    type,
    createdBy,
    handledBy,
    lastUpdatedBy,
  } = data;

  const service_date = new Date(`${date}T${time}`);

  const updated_at = new Date();

  try {
    const prisma = getPrisma();

    await prisma.$transaction(async (tx) => {
      const existingLog = await tx.memberVoucherTransactionLog.findUnique({
        where: { id: BigInt(transaction_log_id) },
        select: { amountChange: true, memberVoucherId: true },
      });

      if (!existingLog || Number(existingLog.memberVoucherId) !== member_voucher_id) {
        throw new Error('Transaction log not found or does not belong to the specified voucher');
      }

      const oldAmount = Number(existingLog.amountChange || 0);
      const adjustment = consumptionValue - oldAmount;

      const voucher = await tx.memberVoucher.findUnique({
        where: { id: BigInt(member_voucher_id) },
        select: { currentBalance: true },
      });

      const currentBalance = Number(voucher?.currentBalance || 0);
      const newVoucherBalance = currentBalance + adjustment;

      await tx.memberVoucher.update({
        where: { id: BigInt(member_voucher_id) },
        data: { currentBalance: newVoucherBalance },
      });

      const subsequentLogs = await tx.memberVoucherTransactionLog.findMany({
        where: {
          memberVoucherId: BigInt(member_voucher_id),
          id: { gte: BigInt(transaction_log_id) },
        },
        select: { id: true, currentBalance: true },
        orderBy: { id: 'asc' },
      });

      for (const log of subsequentLogs) {
        const newBalance = Number(log.currentBalance || 0) + adjustment;
        await tx.memberVoucherTransactionLog.update({
          where: { id: log.id },
          data: { currentBalance: newBalance },
        });
      }

      await tx.memberVoucherTransactionLog.update({
        where: { id: BigInt(transaction_log_id) },
        data: {
          serviceDescription: remarks,
          serviceDate: service_date,
          amountChange: consumptionValue,
          servicedBy: BigInt(handledBy),
          type,
          createdBy: BigInt(createdBy),
          lastUpdatedBy: BigInt(lastUpdatedBy),
          updatedAt: updated_at,
        },
      });
    });

    return {
      success: true,
      message: 'Member Voucher transaction log and Member Voucher balance has been updated successfully.',
    };
  } catch (error) {
    console.error(
      'Error updating Member Voucher transaction log and Member Voucher balance by Transation Log Id:',
      error
    );
    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }
    return {
      success: false,
      message:
        'Failed to update Member Voucher transaction log and Member Voucher balance Transation Log Id due to database error.',
    };
  }
};

const deleteTransactionLogsAndCurrentBalanceByLogId = async (
  transaction_log_id: number,
  member_voucher_id: number
): Promise<{ success: boolean; message: string }> => {
  try {
    const prisma = getPrisma();

    await prisma.$transaction(async (tx) => {
      const agg = await tx.memberVoucherTransactionLog.aggregate({
        _sum: { amountChange: true },
        where: {
          id: { gte: BigInt(transaction_log_id) },
          memberVoucherId: BigInt(member_voucher_id),
        },
      });

      const sumChange = Number(agg._sum.amountChange || 0);

      const voucher = await tx.memberVoucher.findUnique({
        where: { id: BigInt(member_voucher_id) },
        select: { currentBalance: true },
      });

      const currentBalance = Number(voucher?.currentBalance || 0);
      const newBalance = currentBalance - sumChange;

      await tx.memberVoucher.update({
        where: { id: BigInt(member_voucher_id) },
        data: { currentBalance: newBalance },
      });

      await tx.memberVoucherTransactionLog.deleteMany({
        where: {
          id: { gte: BigInt(transaction_log_id) },
          memberVoucherId: BigInt(member_voucher_id),
        },
      });
    });

    return {
      success: true,
      message:
        'The Member Voucher transaction log and Member Voucher balance has been respectively deleted and updated successfully.',
    };
  } catch (error) {
    console.error('Error deleting Member Voucher transaction log by Transation Log Id:', error);
    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }
    return {
      success: false,
      message: 'Failed to deleting Member Voucher transaction log by Transation Log Id due to database error.',
    };
  }
};

const createMemberVoucher = async (
  transactionData: SingleItemTransactionRequestData
): Promise<SingleItemTransactionCreationResult> => {
  try {
    const prisma = getPrisma();

    // VALIDATION MOVED TO TOP - Validate required fields first
    const {
      created_by,
      customer_type,
      handled_by,
      item,
      member_id,
      payments,
      receipt_number,
      remarks,
      created_at, // ✅ NEW: Add custom date support
      updated_at, // ✅ NEW: Add custom date support
      gstBreakdown, // ✅ NEW: Add GST breakdown support
    } = transactionData;

    // Early validation
    if (!created_by) {
      throw new Error('created_by is required');
    }

    if (!handled_by) {
      throw new Error('handled_by is required');
    }

    if (!item || item.type !== 'member-voucher') {
      throw new Error('item is required and must be of type "member-voucher"');
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      throw new Error('payments array is required and cannot be empty');
    }

    if (!member_id) {
      throw new Error('member_id is required for member voucher transactions');
    }

    // ✅ NEW: Parse and validate custom creation date/time for sale transactions
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

    console.log('✅ MV Sale Transaction Using custom date/time:', {
      created_at: customCreatedAt.toISOString(),
      updated_at: customUpdatedAt.toISOString(),
    });

    // Extract item data
    const { assignedEmployee, data, pricing, remarks: itemRemarks, type } = item;

    if (!data) {
      throw new Error('item.data is required for member voucher');
    }

    const {
      bypass_template,
      created_at: voucher_created_at,
      created_by: item_created_by,
      creation_datetime,
      free_of_charge = 0, // Default to 0
      member_voucher_details = [], // Default to empty array
      member_voucher_name,
      remarks: voucherRemarks,
      selected_template,
      starting_balance,
      status = 'active', // Default status
      total_price,
      voucher_template_id,
    } = data;

    // Validate required voucher data
    if (!member_voucher_name) {
      throw new Error('member_voucher_name is required');
    }

    if (!creation_datetime) {
      throw new Error('creation_datetime is required');
    }

    // FIXED: Better default calculation
    const default_total_price = selected_template?.default_total_price
      ? Number(selected_template.default_total_price)
      : total_price
      ? Number(total_price)
      : 0;

    const is_bypass = bypass_template === true;
    const createdAt = new Date(creation_datetime); // Keep voucher creation date separate
    const updatedAt = createdAt; // Keep voucher update date separate

    // FIXED: Proper employee ID handling
    /**
     * Original code - since we are sending an array of assigned employees from the frontend, i changed this to handle that.
     */
    // const employee_id = assignedEmployee ? Number(assignedEmployee) : Number(created_by);

    /**
     * Debugging employee_id calculation
     */
    const employee_id =
      assignedEmployee && Array.isArray(assignedEmployee) && assignedEmployee.length > 0
        ? Number(assignedEmployee[0].employeeId || assignedEmployee[0]) // Get first employee's ID for voucher creation
        : Number(created_by); // Fallback to created_by

    // Validate that employee_id is not NaN
    if (isNaN(employee_id)) {
      throw new Error(`Invalid employee ID: ${employee_id}. Check assignedEmployee data or created_by value.`);
    }

    // Database validations using Prisma
    const [memberExists, employeeExists, voucherTemplateExists] = await Promise.all([
      prisma.member.findUnique({ where: { id: BigInt(member_id) }, select: { id: true } }),
      prisma.employee.findUnique({ where: { id: BigInt(employee_id) }, select: { id: true } }),
      is_bypass || !voucher_template_id || voucher_template_id === '0'
        ? Promise.resolve(true)
        : prisma.voucherTemplate
            .findUnique({ where: { id: BigInt(voucher_template_id) }, select: { id: true } })
            .then((result) => !!result),
    ]);

    // FIXED: Proper validation checking
    if (!memberExists) {
      throw new Error(`Member with ID ${member_id} not found`);
    }

    if (!employeeExists) {
      throw new Error(`Employee with ID ${employee_id} not found`);
    }

    // FIXED: Check voucher template validation if applicable
    if (!is_bypass && voucher_template_id && voucher_template_id !== '0' && !voucherTemplateExists) {
      throw new Error(`Voucher template with ID ${voucher_template_id} not found`);
    }

    // ✅ NEW: Calculate GST amounts (same logic as MCP)
    let totalTransactionAmount: number;
    let totalGSTAmount: number;

    if (gstBreakdown) {
      totalTransactionAmount = roundTo2Decimals(gstBreakdown.inclusiveTotal || 0);
      totalGSTAmount = roundTo2Decimals(gstBreakdown.gstTotal || 0);
      console.log('✅ MV Using GST breakdown from frontend:', {
        inclusive: totalTransactionAmount,
        gst: totalGSTAmount,
      });
    } else {
      const exclusiveTotal = roundTo2Decimals(pricing?.totalLinePrice || 0);
      totalGSTAmount = roundTo2Decimals(exclusiveTotal * 0.09);
      totalTransactionAmount = roundTo2Decimals(exclusiveTotal + totalGSTAmount);
      console.log('⚠️ MV No GST breakdown provided, calculated:', {
        exclusive: exclusiveTotal,
        gst: totalGSTAmount,
        inclusive: totalTransactionAmount,
      });
    }

    // FIXED: Payment calculations using correct logic
    const PENDING_PAYMENT_METHOD_ID = 7;

    const pendingPayments = payments.filter(
      (payment: PaymentMethodRequest) => payment.methodId === PENDING_PAYMENT_METHOD_ID
    );

    const nonPendingPayments = payments.filter(
      (payment: PaymentMethodRequest) => payment.methodId !== PENDING_PAYMENT_METHOD_ID
    );

    // ✅ UPDATED: Calculate payments based on total transaction amount (inclusive of GST)
    const totalPaidAmount: number = roundTo2Decimals(
      nonPendingPayments.reduce((total: number, payment: PaymentMethodRequest) => {
        return total + (payment.amount || 0);
      }, 0)
    );

    const outstandingAmount: number = roundTo2Decimals(Math.max(0, totalTransactionAmount - totalPaidAmount));

    const transactionStatus: 'FULL' | 'PARTIAL' = outstandingAmount <= 0 ? 'FULL' : 'PARTIAL';
    const processPayment: boolean = outstandingAmount > 0;

    // ✅ UPDATED: For voucher balance calculation, use exclusive amount (like MCP)
    // ✅ UPDATED: For voucher balance calculation, subtract GST from payment
    let exclusiveAmountForBalance: number;

    if (gstBreakdown) {
      exclusiveAmountForBalance = roundTo2Decimals(gstBreakdown.exclusiveTotal || 0);
    } else {
      exclusiveAmountForBalance = roundTo2Decimals(pricing?.totalLinePrice || 0);
    }

    // ✅ NEW: Calculate net payment amount (subtract GST from payment)
    const netAmountForBalance = roundTo2Decimals(totalPaidAmount - totalGSTAmount);

    // Calculate how much should be added to voucher balance (net payment, capped at exclusive amount)
    const paidAmountForBalance = Math.max(0, Math.min(netAmountForBalance, exclusiveAmountForBalance));

    const is_fully_paid = outstandingAmount === 0;

    // ✅ UPDATED: Balance calculation using net payment amount
    const base_balance = exclusiveAmountForBalance + free_of_charge; // Use exclusive amount for balance
    const final_starting_balance = base_balance;
    const final_current_balance = is_fully_paid ? exclusiveAmountForBalance : paidAmountForBalance;

    console.log('💰 MV Balance Calculation (GST Subtracted):', {
      totalTransactionAmount, // $85.02 (what customer pays including GST)
      exclusiveAmountForBalance, // $78.00 (voucher value without GST)
      totalGSTAmount, // $7.02 (GST amount)
      totalPaidAmount, // $100 (what customer actually paid)
      netAmountForBalance, // $92.98 (payment minus GST: $100 - $7.02)
      paidAmountForBalance, // $78.00 (amount for voucher balance, capped at exclusive)
      final_current_balance, // Final voucher balance
    });

    // Use Prisma transaction to ensure all operations succeed or fail together
    const result = await prisma.$transaction(async (tx) => {
      // Insert member voucher
      const memberVoucher = await tx.memberVoucher.create({
        data: {
          memberVoucherName: member_voucher_name,
          voucherTemplateId: is_bypass ? BigInt(0) : BigInt(voucher_template_id || 0),
          memberId: BigInt(member_id),
          currentBalance: final_current_balance,
          startingBalance: final_starting_balance,
          freeOfCharge: free_of_charge,
          defaultTotalPrice: exclusiveAmountForBalance,
          status: status,
          remarks: voucherRemarks || itemRemarks || '',
          createdBy: BigInt(employee_id),
          handledBy: BigInt(employee_id),
          lastUpdatedBy: BigInt(employee_id),
          createdAt: createdAt,
          updatedAt: updatedAt,
        },
      });

      const memberVoucherId = Number(memberVoucher.id);

      // FIXED: Better service mapping with validation
      const services = member_voucher_details.map(
        (detail: { service_id?: number; name?: string; price?: number; custom_price?: number; duration?: number }) => {
          if (!detail.service_id && !is_bypass) {
            throw new Error('service_id is required for each voucher detail when not bypassing template');
          }

          return {
            id: detail.service_id || 0,
            name: detail.name || 'Unknown Service',
            original_price: Number(detail.price || 0),
            custom_price: Number(detail.custom_price ?? detail.price ?? 0),
            discount: Number(detail.price ?? 0) - Number(detail.custom_price ?? detail.price ?? 0),
            final_price: Number(detail.custom_price ?? detail.price ?? 0),
            duration: Number(detail.duration || 0),
          };
        }
      );

      // Insert voucher details using Prisma
      if (services.length > 0) {
        await tx.memberVoucherDetail.createMany({
          data: services.map((service: any) => ({
            memberVoucherId: BigInt(memberVoucherId),
            serviceId: BigInt(is_bypass ? 0 : service.id),
            serviceName: service.name,
            originalPrice: service.original_price,
            customPrice: service.custom_price,
            discount: service.discount,
            finalPrice: service.final_price,
            duration: service.duration,
            createdAt: createdAt,
            updatedAt: updatedAt,
          })),
        });
      }

      // Insert initial transaction log
      await tx.memberVoucherTransactionLog.create({
        data: {
          memberVoucherId: BigInt(memberVoucherId),
          serviceDescription: 'N.A',
          serviceDate: createdAt,
          currentBalance: final_current_balance,
          amountChange: final_current_balance,
          servicedBy: BigInt(employee_id),
          type: 'PURCHASE',
          createdBy: BigInt(employee_id),
          lastUpdatedBy: BigInt(employee_id),
          createdAt: createdAt,
          updatedAt: updatedAt,
        },
      });

      // FOC handling - only add FOC if transaction is fully paid
      if (transactionStatus === 'FULL' && free_of_charge > 0) {
        // Calculate new balance after adding FOC
        const newCurrentBalance = final_current_balance + free_of_charge;

        // Update the member voucher with new balance
        await tx.memberVoucher.update({
          where: { id: BigInt(memberVoucherId) },
          data: {
            currentBalance: newCurrentBalance,
            updatedAt: customUpdatedAt,
          },
        });

        // Insert FOC transaction log
        await tx.memberVoucherTransactionLog.create({
          data: {
            memberVoucherId: BigInt(memberVoucherId),
            serviceDescription: 'Free of Charge Addition',
            serviceDate: customCreatedAt,
            currentBalance: newCurrentBalance,
            amountChange: free_of_charge,
            servicedBy: BigInt(employee_id),
            type: 'ADD FOC',
            createdBy: BigInt(employee_id),
            lastUpdatedBy: BigInt(employee_id),
            createdAt: customCreatedAt,
            updatedAt: customUpdatedAt,
          },
        });

        console.log('FOC transaction added:', {
          memberVoucherId,
          focAmount: free_of_charge,
          newCurrentBalance,
          transactionType: 'ADD FOC',
        });
      }

      // Generate receipt number
      let finalReceiptNo: string = receipt_number || '';
      if (!finalReceiptNo) {
        const maxReceipt = await tx.saleTransaction.findFirst({
          where: {
            receiptNo: {
              startsWith: 'ST',
            },
          },
          select: { receiptNo: true },
          orderBy: { receiptNo: 'desc' },
        });

        const nextNumber = maxReceipt?.receiptNo ? parseInt(maxReceipt.receiptNo.substring(2)) + 1 : 1;
        finalReceiptNo = `ST${nextNumber.toString().padStart(6, '0')}`;
      }

      // Create sale transaction
      const saleTransaction = await tx.saleTransaction.create({
        data: {
          customerType: customer_type?.toUpperCase() || 'MEMBER',
          memberId: member_id ? BigInt(member_id) : null,
          totalPaidAmount: totalPaidAmount,
          outstandingTotalPaymentAmount: outstandingAmount,
          saleTransactionStatus: transactionStatus,
          receiptNo: finalReceiptNo,
          remarks: remarks || '',
          processPayment: processPayment,
          handledBy: BigInt(handled_by),
          createdBy: BigInt(created_by),
          createdAt: customCreatedAt,
          updatedAt: customUpdatedAt,
          gstAmount: totalGSTAmount,
        },
      });

      const saleTransactionId: number = Number(saleTransaction.id);

      console.log('Created MV sale transaction with ID:', saleTransactionId);
      console.log('🏛️ MV GST amount stored in sale_transactions.gst_amount:', totalGSTAmount);

      // Create sale transaction item
      const saleTransactionItem = await tx.saleTransactionItem.create({
        data: {
          saleTransactionId: BigInt(saleTransactionId),
          serviceName: null,
          productName: null,
          memberCarePackageId: null,
          memberVoucherId: BigInt(memberVoucherId),
          originalUnitPrice: pricing?.originalPrice || 0,
          customUnitPrice: pricing?.customPrice || 0,
          discountPercentage: pricing?.discount || 0,
          quantity: pricing?.quantity || 1,
          amount: exclusiveAmountForBalance,
          itemType: 'member voucher',
          remarks: item.remarks || '',
        },
      });

      const saleTransactionItemId: number = Number(saleTransactionItem.id);

      console.log('Created MV sale transaction item with ID:', saleTransactionItemId);

      // Create payments
      for (const payment of payments) {
        if (payment.amount > 0) {
          const paymentRecord = await tx.paymentToSaleTransaction.create({
            data: {
              saleTransactionId: BigInt(saleTransactionId),
              paymentMethodId: BigInt(payment.methodId),
              amount: payment.amount,
              remarks: payment.remark || '',
              createdBy: BigInt(handled_by),
              createdAt: customCreatedAt,
              updatedBy: BigInt(handled_by),
              updatedAt: customUpdatedAt,
            },
          });

          console.log('Created MV payment with ID:', paymentRecord.id.toString());
        }
      }

      console.log('MV Transaction committed successfully');

      // Return actual voucher data
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
        voucher_id: memberVoucherId,
        voucher_name: member_voucher_name,
        items_count: 1,
        payments_count: payments.filter((p: PaymentMethodRequest) => p.amount > 0).length,
        gst_amount: totalGSTAmount,
      };
    });

    return result;
  } catch (error) {
    console.error('Error creating MV sale transaction:', error);
    throw error;
  }
};

/**
 * Soft Delete (status changed to DISABLED)
 * @param {string} id - member_voucher ID
 */
const removeMemberVoucher = async (id: string) => {
  try {
    const prisma = getPrisma();

    const existing = await prisma.memberVoucher.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    if (!existing) {
      throw new Error(`Member voucher with id ${id} not found for removal.`);
    }

    await prisma.memberVoucher.update({
      where: { id: BigInt(id) },
      data: { status: 'disabled' },
    });

    return {
      success: true,
      message: `Member voucher with ID ${id} has been soft deleted (status set to DISABLED).`,
      updated_rows: 1,
    };
  } catch (error) {
    console.error('Error removing member voucher:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unexpected error occurred while removing member voucher.');
  }
};

const createMemberVoucherForTransfer = async (
  memberId: number,
  voucherTemplateName: string,
  voucherTemplateId: number,
  price: number,
  foc: number,
  remarks: string,
  createdBy: number,
  saleTransactionCreatedAt: string,
  isBypass?: boolean,
  serviceDetails?: any[]
): Promise<MemberVouchers> => {
  try {
    const prisma = getPrisma();

    const createdAt = new Date(saleTransactionCreatedAt);
    const updatedAt = new Date(saleTransactionCreatedAt);

    const totalBalance = price + foc;

    if (isBypass && serviceDetails && Array.isArray(serviceDetails)) {
      const newVoucher = await prisma.memberVoucher.create({
        data: {
          memberId: BigInt(memberId),
          memberVoucherName: voucherTemplateName,
          voucherTemplateId: BigInt(voucherTemplateId),
          currentBalance: totalBalance,
          startingBalance: totalBalance,
          freeOfCharge: foc,
          defaultTotalPrice: price,
          status: 'is_enabled',
          remarks: remarks,
          createdBy: createdBy ? BigInt(createdBy) : null,
          handledBy: createdBy ? BigInt(createdBy) : null,
          lastUpdatedBy: createdBy ? BigInt(createdBy) : null,
          createdAt: createdAt,
          updatedAt: updatedAt,
          memberVoucherDetails: {
            createMany: {
              data: serviceDetails.map((serviceDetail: any) => ({
                serviceId: BigInt(0), // always 0 for manual
                serviceName: serviceDetail.name,
                originalPrice: serviceDetail.price || 0,
                customPrice: serviceDetail.final_price || serviceDetail.price || 0,
                discount: serviceDetail.discount || 0,
                finalPrice: serviceDetail.final_price || serviceDetail.price || 0,
                duration: serviceDetail.duration || 0,
                createdAt: createdAt,
                updatedAt: updatedAt,
                serviceCategoryId: BigInt(0), // always 0 for manual
              })),
            },
          },
        },
      });

      console.log('Created voucher with manual service details');

      return normalizeBigInts(newVoucher) as MemberVouchers;
    } else {
      // 🔁 TEMPLATE MODE: Get template details and create voucher
      const templateDetails = await prisma.voucherTemplateDetail.findMany({
        where: { voucherTemplateId: BigInt(voucherTemplateId) },
      });

      const newVoucher = await prisma.memberVoucher.create({
        data: {
          memberId: BigInt(memberId),
          memberVoucherName: voucherTemplateName,
          voucherTemplateId: BigInt(voucherTemplateId),
          currentBalance: totalBalance,
          startingBalance: totalBalance,
          freeOfCharge: foc,
          defaultTotalPrice: price,
          status: 'is_enabled',
          remarks: remarks,
          createdBy: createdBy ? BigInt(createdBy) : null,
          handledBy: createdBy ? BigInt(createdBy) : null,
          lastUpdatedBy: createdBy ? BigInt(createdBy) : null,
          createdAt: createdAt,
          updatedAt: updatedAt,
          memberVoucherDetails: {
            createMany: {
              data: templateDetails.map((detail: any) => ({
                serviceId: detail.serviceId,
                serviceName: detail.serviceName,
                originalPrice: Number(detail.originalPrice),
                customPrice: Number(detail.customPrice),
                discount: Number(detail.discount),
                finalPrice: Number(detail.finalPrice),
                duration: Number(detail.duration),
                createdAt: createdAt,
                updatedAt: updatedAt,
                serviceCategoryId: detail.serviceCategoryId,
              })),
            },
          },
        },
      });

      console.log('Created voucher from template details');

      return normalizeBigInts(newVoucher) as MemberVouchers;
    }
  } catch (error) {
    console.error('Error adding member voucher ', error);
    throw new Error('Failed to add member voucher');
  }
};

const getMemberVoucherWithDetails = async (name: string | null = null): Promise<any[]> => {
  try {
    if (!name) {
      throw new Error('Member name is required');
    }

    const prisma = getPrisma();

    // Find member by name (case-insensitive partial match)
    const member = await prisma.member.findFirst({
      where: {
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
    });

    if (!member) {
      throw new Error(`Member with name "${name}" not found`);
    }

    // Get all enabled vouchers for this member with their details
    const vouchers = await prisma.memberVoucher.findMany({
      where: {
        memberId: member.id,
        status: 'is_enabled',
      },
      include: {
        memberVoucherDetails: {
          select: {
            serviceId: true,
            serviceName: true,
            originalPrice: true,
            customPrice: true,
            discount: true,
            finalPrice: true,
            duration: true,
          },
        },
      },
    });

    // Format the result to match expected structure
    const result = vouchers.map((voucher: any) => ({
      id: voucher.id.toString(),
      member_id: voucher.memberId.toString(),
      member_voucher_name: voucher.memberVoucherName,
      voucher_template_id: voucher.voucherTemplateId?.toString() || null,
      current_balance: Number(voucher.currentBalance || 0),
      starting_balance: Number(voucher.startingBalance || 0),
      free_of_charge: Number(voucher.freeOfCharge || 0),
      default_total_price: Number(voucher.defaultTotalPrice || 0),
      status: voucher.status,
      remarks: voucher.remarks,
      created_by: voucher.createdBy?.toString() || null,
      handled_by: voucher.handledBy?.toString() || null,
      last_updated_by: voucher.lastUpdatedBy?.toString() || null,
      created_at: voucher.createdAt,
      updated_at: voucher.updatedAt,
      details: voucher.memberVoucherDetails.map((detail: any) => ({
        service_id: detail.serviceId ? Number(detail.serviceId) : 0,
        service_name: detail.serviceName || '',
        original_price: Number(detail.originalPrice || 0),
        custom_price: Number(detail.customPrice || 0),
        discount: Number(detail.discount || 0),
        final_price: Number(detail.finalPrice || 0),
        duration: Number(detail.duration || 0),
      })),
    }));

    return result;
  } catch (error) {
    console.error('Error fetching member voucher:', error);
    throw new Error('Failed to fetch member voucher');
  }
};

const checkIfFreeOfChargeIsUsedById = async (voucher_id: number): Promise<boolean> => {
  try {
    const prisma = getPrisma();

    const voucher = await prisma.memberVoucher.findUnique({
      where: { id: BigInt(voucher_id) },
      select: {
        currentBalance: true,
        freeOfCharge: true,
      },
    });

    if (!voucher) {
      throw new Error('Voucher not found');
    }

    return Number(voucher.currentBalance || 0) > Number(voucher.freeOfCharge || 0);
  } catch (error) {
    console.error('Error checking FOC usage by ID:', error);
    throw new Error('Failed to check free of charge usage by ID');
  }
};

const removeFOCFromVoucherById = async (
  voucher_id: number,
  created_by: number,
  created_at: string
): Promise<{ voucher_id: number; newBalance: number }> => {
  try {
    const prisma = getPrisma();
    const createdAtDate = new Date(created_at);

    const result = await prisma.$transaction(async (tx) => {
      const voucher = await tx.memberVoucher.findUnique({
        where: { id: BigInt(voucher_id) },
        select: { currentBalance: true, freeOfCharge: true },
      });

      if (!voucher) {
        throw new Error('Voucher not found.');
      }

      const currentBalanceNum = Number(voucher.currentBalance || 0);
      const focNum = Number(voucher.freeOfCharge || 0);
      const newBalance = Math.max(0, currentBalanceNum - focNum);

      await tx.memberVoucher.update({
        where: { id: BigInt(voucher_id) },
        data: { currentBalance: newBalance, updatedAt: createdAtDate },
      });

      await tx.memberVoucherTransactionLog.create({
        data: {
          memberVoucherId: BigInt(voucher_id),
          serviceDescription: 'Remove Free Of Charge',
          serviceDate: createdAtDate,
          currentBalance: newBalance,
          amountChange: -focNum,
          servicedBy: BigInt(created_by),
          type: 'Remove OF FOC',
          createdBy: BigInt(created_by),
          createdAt: createdAtDate,
          updatedAt: createdAtDate,
        },
      });

      return { voucher_id, newBalance };
    });

    return result;
  } catch (error) {
    console.error('Error removing FOC by ID:', error);
    throw new Error('Failed to remove FOC by voucher ID.');
  }
};

const setMemberVoucherBalanceAfterTransferById = async (
  voucher_id: number,
  transferredBalance: number,
  created_at: string
): Promise<{ voucher_id: number; newBalance: number }> => {
  try {
    const prisma = getPrisma();
    const createdAtDate = new Date(created_at);

    const result = await prisma.$transaction(async (tx) => {
      const voucher = await tx.memberVoucher.findUnique({
        where: { id: BigInt(voucher_id) },
        select: { id: true },
      });

      if (!voucher) {
        throw new Error('Voucher not found.');
      }

      const newBalance = 0;

      await tx.memberVoucher.update({
        where: { id: BigInt(voucher_id) },
        data: { currentBalance: newBalance, updatedAt: createdAtDate, status: 'disabled' },
      });

      return { voucher_id, newBalance };
    });

    return result;
  } catch (error) {
    console.error('Error updating voucher balance by ID:', error);
    throw new Error('Failed to update voucher balance by ID');
  }
};

const getMemberVoucherCurrentBalanceById = async (voucher_id: number): Promise<number> => {
  try {
    const prisma = getPrisma();

    const voucher = await prisma.memberVoucher.findUnique({
      where: { id: BigInt(voucher_id) },
      select: { currentBalance: true },
    });

    if (!voucher) {
      throw new Error('Voucher not found');
    }

    return Number(voucher.currentBalance || 0);
  } catch (error) {
    console.error('❌ Error getting current balance by ID:', error);
    throw new Error('Failed to get current balance by ID');
  }
};

export default {
  getPaginatedVouchers,
  getServicesOfMemberVoucherById,
  getPaginatedMemberVoucherTransactionLogs,
  addTransactionLogsByMemberVoucherId,
  getMemberVoucherCurrentBalance,
  // getMemberVoucherPaidCurrentBalance,
  getPurchaseDateOfMemberVoucherById,
  getMemberNameByMemberVoucherId,
  setTransactionLogsAndCurrentBalanceByLogId,
  deleteTransactionLogsAndCurrentBalanceByLogId,
  createMemberVoucher,
  removeMemberVoucher,
  createMemberVoucherForTransfer,
  getMemberVoucherWithDetails,
  checkIfFreeOfChargeIsUsedById,
  removeFOCFromVoucherById,
  setMemberVoucherBalanceAfterTransferById,
  getMemberVoucherCurrentBalanceById,
};
