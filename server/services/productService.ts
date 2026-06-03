/**
 * Product Service - Prisma Implementation
 * Replaces SQL product query functions
 */

 
import { prisma } from '../lib/prisma.js';

/**
 * Get products with pagination
 * Supports filtering by name and status
 */
export async function getProductsWithPagination(page: number = 1, limit: number = 10, nameFilter?: string, status?: boolean) {
  try {
    const pageSize = Math.max(1, limit);
    const skip = Math.max(0, (page - 1) * pageSize);

    const where: any = {};

    if (nameFilter) {
      where.productName = {
        contains: nameFilter,
        mode: 'insensitive'
      };
    }

    if (status !== undefined) {
      where.productIsEnabled = status;
    }

    // Fetch products
    const products = await prisma.product.findMany({
      where,
      skip,
      take: pageSize
    });

    const total = await prisma.product.count({ where });

    return {
      products: products.map((p: any) => ({
        id: p.id,
        productName: p.productName,
        productDescription: p.productDescription,
        unitSalePrice: p.productUnitSalePrice,
        unitCostPrice: p.productUnitCostPrice,
        isEnabled: p.productIsEnabled,
        categoryId: p.productCategoryId,
        createdBy: p.createdBy,
        updatedBy: p.updatedBy,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  } catch (error) {
    console.error('Error getting products with pagination:', error);
    throw error;
  }
}

/**
 * Get sales history for a specific product
 */
export async function getSalesHistoryForProduct(productId: bigint) {
  try {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    const endDate = new Date();

    // Get all sales transactions in the date range
    const transactions = await prisma.saleTransaction.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: { id: true }
    });

    const transactionIds = transactions.map((t: any) => t.id);

    const saleItems = await prisma.saleTransactionItem.findMany({
      where: {
        saleTransactionId: {
          in: transactionIds
        }
      }
    });

    const summary = {
      totalSold: saleItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
      totalRevenue: saleItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0),
      transactionCount: saleItems.length,
      averagePrice: saleItems.length > 0 
        ? saleItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0) / saleItems.length
        : 0
    };

    return {
      sales: saleItems.map((item: any) => ({
        quantity: item.quantity,
        itemPrice: item.amount,
        productName: item.productName
      })),
      summary
    };
  } catch (error) {
    console.error('Error getting sales history for product:', error);
    throw error;
  }
}

export default {
  getProductsWithPagination,
  getSalesHistoryForProduct
};
