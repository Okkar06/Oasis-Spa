import express from 'express';
const router = express.Router();

import { comparePassword, hashPassword } from '../middlewares/bcryptMiddleware.js';
import isAuthenticated from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';

import authController from '../controllers/authController.js';
import employeeController from '../controllers/employeeController.js';
// import { hashPassword, validatePassword } from '../middlewares/validatePassword.js';

// // =========================
// // Public routes
// // =========================
router.post('/login', authController.getAuthUser, comparePassword, authController.login);
router.post('/logout', authController.logout);

router.get('/status', authController.isAuthenticated);

router.post('/initsu/:token', authController.decodeSuperUserToken, hashPassword, authController.setUpSuperUser);

router.post('/verify', authController.verifyInviteURL);
router.post('/invites', authController.acceptInvitation, hashPassword, authController.updateUserPassword);

// Regenerate invitation link
router.post('/regenerate-invite', authController.regenerateInvitationLink);
router.post('/regenerate-uri', authController.regenerateInvitationLink); // Alias for frontend compatibility

// =========================
// Private routes
// =========================
router.use(isAuthenticated);

// Get current user profile (must be before parameterized routes)
router.get('/profile', authController.getCurrentUserProfile);

// Get all users (with pagination and search)
router.get('/users', authController.getUsers); // Get all users with pagination
router.get('/user/:id', authController.getUserById); // Get single user (singular)
router.get('/users/:id', authController.getUserById); // Get single user (plural - for frontend compatibility)

// Update user
router.put('/user/:id', authController.updateUser); // Update user (singular)

router.post('/create', roleMiddleware.hasRole('super_admin'), authController.createAndInviteUser);
router.put('/users/:id', authController.updateUser); // Update user (plural - for frontend compatibility)

// Delete user
router.delete('/user/:id', authController.deleteUser); // Delete user (singular)
router.delete('/users/:id', authController.deleteUser); // Delete user (plural - for frontend compatibility)

router.get('/roles', employeeController.getAllRolesForDropdown);

export default router;
