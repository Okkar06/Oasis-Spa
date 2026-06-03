import express from 'express';
const router = express.Router();

import isAuthenticated from '../middlewares/authMiddleware.js';

import {
  getMVMonthlyReport,
  getMCPMonthlyReport,
  getAdHocMonthlyReport,
  getTransactionDateRange,
  getMVDeferredRevenue,
  getMCPDeferredRevenue,
  getCellBreakdown,
  updateCellValue,
} from '../controllers/revenueController.js';

// =========================
// Public routes
// =========================

// =========================
// Private routes
// =========================
router.use(isAuthenticated);

router.get('/mrr/mv', getMVMonthlyReport);
router.get('/mrr/mcp', getMCPMonthlyReport);
router.get('/mrr/adhoc', getAdHocMonthlyReport);
router.get('/range', getTransactionDateRange);

router.get('/dr/mv', getMVDeferredRevenue);
router.get('/dr/mcp', getMCPDeferredRevenue);

router.get('/cell-breakdown', getCellBreakdown);
router.post('/cell-update', updateCellValue);

export default router;
   
