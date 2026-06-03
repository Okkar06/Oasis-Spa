/**
 * Revenue Service - Prisma Implementation
 * Replaces SQL revenue calculation and reporting functions
 */

 
import { prisma } from '../lib/prisma.js';

/**
 * Get sales history grouped by product for a specific period
 */
export async function getSalesHistoryForEachProduct(year: number, month: number) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const saleItems = await prisma.saleTransactionItem.findMany({
      where: {
        saleTransaction: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        }
      }
    });

    // Group by product name
    const groupedData: Record<string, any> = {};
    
    saleItems.forEach((item: any) => {
      const key = item.productName || 'Unknown';
      if (!groupedData[key]) {
        groupedData[key] = {
          productName: key,
          totalQuantity: 0,
          totalRevenue: 0,
          transactionCount: 0
        };
      }
      groupedData[key].totalQuantity += Number(item.quantity || 0);
      groupedData[key].totalRevenue += Number(item.amount || 0);
      groupedData[key].transactionCount += 1;
    });

    return {
      period: { year, month },
      data: Object.values(groupedData),
      summary: {
        totalProducts: Object.keys(groupedData).length,
        totalQuantity: Object.values(groupedData).reduce((sum: number, p: any) => sum + p.totalQuantity, 0),
        totalRevenue: Object.values(groupedData).reduce((sum: number, p: any) => sum + p.totalRevenue, 0)
      }
    };
  } catch (error) {
    console.error('Error getting sales history for each product:', error);
    throw error;
  }
}

/**
 * Get daily revenue summary for a date range
 */
export async function getDailyRevenueSummary(startDate: Date, endDate: Date) {
  try {
    const transactions = await prisma.saleTransaction.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    // Group by date
    const groupedByDate: Record<string, any> = {};
    
    transactions.forEach((tx: any) => {
      const dateKey = tx.createdAt ? tx.createdAt.toISOString().split('T')[0] : 'Unknown';
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = {
          date: dateKey,
          totalRevenue: 0,
          transactionCount: 0,
          totalPaid: 0,
          outstanding: 0
        };
      }
      groupedByDate[dateKey].totalRevenue += Number(tx.totalPaidAmount || 0);
      groupedByDate[dateKey].totalPaid += Number(tx.totalPaidAmount || 0);
      groupedByDate[dateKey].outstanding += Number(tx.outstandingTotalPaymentAmount || 0);
      groupedByDate[dateKey].transactionCount += 1;
    });

    const data = Object.values(groupedByDate);

    return {
      period: { startDate, endDate },
      data,
      summary: {
        totalDays: data.length,
        totalRevenue: data.reduce((sum: number, d: any) => sum + d.totalRevenue, 0),
        totalTransactions: data.reduce((sum: number, d: any) => sum + d.transactionCount, 0),
        averageDailyRevenue: data.length > 0 ? data.reduce((sum: number, d: any) => sum + d.totalRevenue, 0) / data.length : 0
      }
    };
  } catch (error) {
    console.error('Error getting daily revenue summary:', error);
    throw error;
  }
}

/**
 * Get commission breakdown by employee for a specific period
 */
export async function getCommissionBreakdown(year: number, month: number) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const transactions = await prisma.saleTransaction.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    // Group by employee
    const groupedByEmployee: Record<string, any> = {};

    transactions.forEach((tx: any) => {
      const employeeId = tx.handledBy || 'Unknown';
      if (!groupedByEmployee[employeeId]) {
        groupedByEmployee[employeeId] = {
          employeeId,
          totalRevenue: 0,
          transactionCount: 0,
          commission: 0
        };
      }
      groupedByEmployee[employeeId].totalRevenue += Number(tx.totalPaidAmount || 0);
      groupedByEmployee[employeeId].transactionCount += 1;
      // Assuming 5% commission rate - adjust as needed
      groupedByEmployee[employeeId].commission += (Number(tx.totalPaidAmount || 0) * 0.05);
    });

    const data = Object.values(groupedByEmployee);

    return {
      period: { year, month },
      data,
      summary: {
        totalEmployees: data.length,
        totalCommission: data.reduce((sum: number, e: any) => sum + e.commission, 0),
        totalRevenue: data.reduce((sum: number, e: any) => sum + e.totalRevenue, 0),
        averageCommission: data.length > 0 ? data.reduce((sum: number, e: any) => sum + e.commission, 0) / data.length : 0
      }
    };
  } catch (error) {
    console.error('Error getting commission breakdown:', error);
    throw error;
  }
}

export default {
  getSalesHistoryForEachProduct,
  getDailyRevenueSummary,
  getCommissionBreakdown
};
