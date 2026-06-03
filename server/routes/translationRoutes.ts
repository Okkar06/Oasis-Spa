import express from 'express';

import isAuthenticated from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';

import translationController from '../controllers/translationController.js';

const router = express.Router();

// =========================
// Public routes
// =========================

// =========================
// Private routes
// =========================
router.use(isAuthenticated);

// Google Translate API routes
router.post('/translate', translationController.translateSingleHandler);
router.post('/translate/batch', translationController.translateBatchHandler);
router.post('/detect-language', translationController.detectLanguageHandler);
router.get('/supported-languages', translationController.getSupportedLanguagesHandler);

// Cache version for client-side cache invalidation
router.get('/cache-version', translationController.getCacheVersionHandler);

// Custom translation management routes
router.post('/custom', isAuthenticated, translationController.createCustomTranslationHandler);
router.get('/custom', isAuthenticated, translationController.getCustomTranslationsHandler);
router.delete('/custom/:id', isAuthenticated, translationController.deleteCustomTranslationHandler);

// Superadmin-only global custom translation routes
router.post('/custom/global', isAuthenticated, roleMiddleware.hasRole('super_admin'), translationController.createGlobalCustomTranslationHandler);
router.get('/custom/global', isAuthenticated, translationController.getGlobalCustomTranslationsHandler); // Allow all users to view global translations
router.put('/custom/global/:id', isAuthenticated, roleMiddleware.hasRole('super_admin'), translationController.updateGlobalCustomTranslationHandler);
router.delete('/custom/global/:id', isAuthenticated, roleMiddleware.hasRole('super_admin'), translationController.deleteGlobalCustomTranslationHandler);

// Translation usage tracking routes
router.get('/usage/stats', isAuthenticated, roleMiddleware.hasRole('super_admin'), translationController.getTranslationUsageStatsHandler);

export default router;