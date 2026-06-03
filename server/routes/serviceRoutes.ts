import express from 'express';

import isAuthenticated from '../middlewares/authMiddleware.js';

import serviceController from '../controllers/serviceController.js';

const router = express.Router();

// =========================
// Public routes
// =========================

// =========================
// Private routes
// =========================
router.use(isAuthenticated);

// Get services with pagination and filter (MUST come before /:id)
router.get('/all-page-filter', serviceController.getServicesPaginationFilter);

// Get all services
router.get('/', serviceController.getAllServices);

// for service dropdown
router.get('/dropdown', serviceController.getAllServicesForDropdown);

// SERVICE CATEGORIES ROUTES - Static routes first
//  get all service categories
router.get('/service-cat', serviceController.getServiceCategories);

// Get service categories with pagination and search filter (MUST come before /:catId)
router.get('/service-cat/page-filter', serviceController.getServiceCategoriesPaginationFilter);

// get enabled service by id
router.get('/enabled-id/:id', serviceController.getEnabledServiceById);

// Get services by category
router.get('/all-by-cat/:category_id', serviceController.getServicesByCategory);

// create a new service
router.post('/create-service', serviceController.validateServiceData, serviceController.createService);

// update service
router.put('/update-service/:id', serviceController.validateServiceData, serviceController.updateService);

// update service sequence
router.put('/reorder-service', serviceController.reorderService);

// update service status
router.put('/service-status/:id', serviceController.changeServiceStatus);

//  create a new service category
router.post('/create-service-cat', serviceController.createServiceCategory);

//  update service category by id
router.put('/update-service-cat/:catId', serviceController.updateServiceCategory);

//  reorder service category sequence number
router.put('/reorder-service-cat', serviceController.reorderServiceCategory);

// get sales history by service id, selected month and year
router.get('/sales-history/:serviceId', serviceController.getSalesHistoryByServiceId);

// DYNAMIC ROUTES - MUST come last
// get service by id
router.get('/:id', serviceController.getServiceById);

export default router;
