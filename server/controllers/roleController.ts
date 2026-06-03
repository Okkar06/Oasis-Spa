import { Request, Response, NextFunction } from 'express';
import roleModel from '../models/roleModel.js';

/**
 * Get all roles for the currently logged in user
 */
const getCurrentUserRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session || !req.session.user_id) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const roles = await roleModel.getUserRoles(req.session.user_id);
    return res.status(200).json({ roles });
  } catch (error) {
    console.error('Error fetching user roles', error);
    next(error);
  }
};

/**
 * Get all available roles (super_admin only)
 */
const getAllRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session || req.session.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied. Super admin only.' });
    }

    const roles = await roleModel.getAllRoles();
    return res.status(200).json({ roles });
  } catch (error) {
    console.error('Error fetching all roles', error);
    next(error);
  }
};

/**
 * Create a new role (super_admin only)
 */
const createRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session || req.session.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied. Super admin only.' });
    }

    const { role_name, description } = req.body;

    if (!role_name || !role_name.trim()) {
      return res.status(400).json({ message: 'Role name is required' });
    }

    const role = await roleModel.createRole(role_name.trim(), description);
    return res.status(201).json({
      message: 'Role created successfully',
      role,
    });
  } catch (error) {
    console.error('Error creating role', error);
    next(error);
  }
};

/**
 * Update an existing role (super_admin only)
 */
const updateRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session || req.session.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied. Super admin only.' });
    }

    const { id } = req.params;
    const { role_name, description } = req.body;

    if (!id) {
      return res.status(400).json({ message: 'Role ID is required' });
    }

    const role = await roleModel.updateRole(id, role_name, description);
    return res.status(200).json({
      message: 'Role updated successfully',
      role,
    });
  } catch (error) {
    console.error('Error updating role', error);
    next(error);
  }
};

/**
 * Delete a role (super_admin only)
 */
const deleteRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session || req.session.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied. Super admin only.' });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: 'Role ID is required' });
    }

    const result = await roleModel.deleteRole(id);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot delete role')) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Error deleting role', error);
    next(error);
  }
};

export default {
  getCurrentUserRoles,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
};
