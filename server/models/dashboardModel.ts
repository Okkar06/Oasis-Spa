import { getPrisma } from '../lib/prisma.js';

const getMonthlyRevenue = async () => {
  const prisma = getPrisma();
  
  // Calculate SGT month range in UTC
  // SGT is UTC+8
  const offset = 8 * 60 * 60 * 1000; 
  const now = new Date();
  const sgtTime = new Date(now.getTime() + offset);
  
  const y = sgtTime.getUTCFullYear();
  const m = sgtTime.getUTCMonth();
  
  // Start of month in SGT (1st day, 00:00:00) converted back to UTC
  const startSGT = new Date(Date.UTC(y, m, 1, 0, 0, 0) - offset);
  // End of month in SGT (Last day of month, 23:59:59.999) converted back to UTC
  // new Date(y, m + 1, 0) gives the last day of the current month
  const endSGT = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999) - offset);

  const result = await prisma.paymentToSaleTransaction.aggregate({
    _sum: {
      amount: true,
    },
    _count: {
      id: true,
    },
    where: {
      createdAt: {
        gte: startSGT,
        lte: endSGT,
      },
      paymentMethod: {
        isIncome: true,
      },
    },
  });

  return {
    revenue: result._sum.amount || 0,
    count: result._count.id || 0,
    average: result._count.id > 0 ? Number(result._sum.amount || 0) / result._count.id : 0
  };
};

const getTopSellingServices = async (limit = 5) => {
  const prisma = getPrisma();
  
  // Last 30 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const result = await prisma.saleTransactionItem.groupBy({
    by: ['serviceName'],
    where: {
      itemType: {
        equals: 'Service',
        mode: 'insensitive',
      },
      serviceName: {
        not: null
      },
      saleTransaction: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    _sum: {
      quantity: true,
    },
    orderBy: {
      _sum: {
        quantity: 'desc',
      },
    },
    take: limit,
  });

  return result.map((r) => ({
    serviceName: r.serviceName,
    count: r._sum.quantity || 0,
  }));
};

const getRevenueTrend = async (days = 7) => {
  const prisma = getPrisma();
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Fetch individual transactions
  const transactions = await prisma.paymentToSaleTransaction.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      paymentMethod: {
        isIncome: true,
      },
    },
    select: {
      amount: true,
      createdAt: true,
    },
  });

  // Group by date (YYYY-MM-DD)
  const trend = {};
  
  // Initialize all days with 0 to ensure continuous line
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    trend[dateStr] = 0;
  }

  transactions.forEach(t => {
    // Adjust to local date string roughly or use UTC date part
    // Using ISO date part (UTC) is usually fine for trend if consistent
    const dateStr = t.createdAt.toISOString().split('T')[0]; 
    if (trend[dateStr] !== undefined) {
      trend[dateStr] += Number(t.amount);
    }
  });

  // Convert to array and sort by date
  return Object.entries(trend)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

export default {
  getMonthlyRevenue,
  getTopSellingServices,
  getRevenueTrend,
};
