import express from 'express';
import isAuthenticated from '../middlewares/authMiddleware.js';
import dashboardController from '../controllers/dashboardController.js';

const router = express.Router();

router.use(isAuthenticated);

router.get('/stats', dashboardController.getDashboardStats);

export default router;
