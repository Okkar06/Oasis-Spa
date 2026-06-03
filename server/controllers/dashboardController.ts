import { Request, Response } from 'express';
import dashboardModel from '../models/dashboardModel.js';

const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const [monthlyStats, topServices, revenueTrend] = await Promise.all([
      dashboardModel.getMonthlyRevenue(),
      dashboardModel.getTopSellingServices(),
      dashboardModel.getRevenueTrend(),
    ]);

    res.status(200).json({
      monthlyRevenue: monthlyStats.revenue,
      avgTransactionValue: monthlyStats.average,
      topServices,
      revenueTrend,
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export default {
  getDashboardStats,
};
