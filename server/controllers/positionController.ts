import { Request, Response, NextFunction } from 'express';
import model from '../models/positionModel.js';
import validator from 'validator';

// Helper function to convert date values to ISO strings
const convertDateToISO = (dateValue: any): string | null => {
  if (!dateValue) return null;
  try {
    if (dateValue instanceof Date) return dateValue.toISOString();
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    if (dateValue && typeof dateValue === 'object' && 'toISOString' in dateValue) {
      return dateValue.toISOString();
    }
    return null;
  } catch (error) {
    console.error('Error converting date:', error);
    return null;
  }
};

// Helper function to transform a position object with date conversion
const transformPosition = (position: any): any => {
  if (!position) return null;
  return {
    ...position,
    position_created_at: convertDateToISO(position.position_created_at),
    position_updated_at: convertDateToISO(position.position_updated_at),
  };
};

const createPosition = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Normalise + trim first
    const position_name_raw        = req.body.position_name ?? '';
    const position_description_raw = req.body.position_description ?? '';

    const position_name        = position_name_raw.trim();
    const position_description = position_description_raw.trim();
    const position_is_active   = req.body.position_is_active !== undefined
      ? !!req.body.position_is_active
      : true;

    // ------------------------------------------------------------
    // 1. Required fields (after trimming)
    // ------------------------------------------------------------
    if (validator.isEmpty(position_name) || validator.isEmpty(position_description)) {
      res.status(400).json({ message: 'Position name and description are required' });
      return;
    }

    // ------------------------------------------------------------
    // 2. Length constraints
    // ------------------------------------------------------------
    if (!validator.isLength(position_name, { min: 2, max: 100 })) {
      res.status(400).json({ message: 'Position name must be between 2 and 100 characters' });
      return;
    }

    if (!validator.isLength(position_description, { min: 5, max: 500 })) {
      res.status(400).json({ message: 'Position description must be between 5 and 500 characters' });
      return;
    }

    // ------------------------------------------------------------
    // 3. Uniqueness check (case-insensitive)
    // ------------------------------------------------------------
    const exists = await model.checkPositionNameExists(position_name);
    if (exists) {
      res.status(400).json({ message: 'Position name already exists' });
      return;
    }

    // ------------------------------------------------------------
    // 4. Create record
    // ------------------------------------------------------------
    const now = new Date().toISOString();

    const newPosition = await model.createPosition({
      position_name,
      position_description,
      position_is_active,
      position_created_at: now,
      position_updated_at: now,
    });

    const transformedPosition = transformPosition(newPosition);
    res.status(201).json({
      message: 'Position created successfully',
      position: transformedPosition,
    });
  } catch (error) {
    console.error('Error creating position:', error);
    res.status(500).json({ message: 'Error creating position' });
  }
};

const getAllPositions = async (req: Request, res: Response, next: NextFunction) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = (page - 1) * limit;
  const { start_date_utc, end_date_utc } = req.session;

  try {
    const { positions, totalPages, totalCount } = await model.getAllPositions(
      offset,
      limit,
      start_date_utc!,
      end_date_utc!
    );

    // Transform positions to convert dates to ISO strings
    const transformedPositions = positions.map(transformPosition);

    res.status(200).json({
      currentPage: page,
      totalPages,
      totalCount,
      pageSize: limit,
      data: transformedPositions,
      start_date_utc: start_date_utc,
      end_date_utc: end_date_utc,
    });
  } catch (error) {
    console.error('Error getting positions:', error);
    next(error);
  }
};

const getPositionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
      res.status(400).json({ message: 'Valid position ID is required' });
      return;
    }

    const position = await model.getPositionById(id);

    if (!position) {
      res.status(404).json({ message: 'Position not found' });
      return;
    }

    const transformedPosition = transformPosition(position);
    res.status(200).json(transformedPosition);
  } catch (error) {
    console.error('Error getting position by ID:', error);
    res.status(500).json({ message: 'Error getting position' });
  }
};

const updatePosition = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { position_name, position_description, position_is_active } = req.body;

    if (!id || isNaN(id)) {
      res.status(400).json({ message: 'Valid position ID is required' });
      return;
    }

    // Validate inputs if provided
    if (position_name && !validator.isLength(position_name, { min: 2, max: 100 })) {
      res.status(400).json({ message: 'Position name must be between 2 and 100 characters' });
      return;
    }

    if (position_description && !validator.isLength(position_description, { min: 5, max: 500 })) {
      res.status(400).json({ message: 'Position description must be between 5 and 500 characters' });
      return;
    }

    // Check if new position name already exists (excluding current position)
    if (position_name) {
      const exists = await model.checkPositionNameExists(position_name);
      if (exists) {
        // Get current position to check if it's the same name
        const currentPosition = await model.getPositionById(id);
        if (currentPosition && currentPosition.position_name !== position_name) {
          res.status(400).json({ message: 'Position name already exists' });
          return;
        }
      }
    }

    const currentTime = new Date().toISOString();

    const updatedPosition = await model.updatePosition(id, {
      position_name: position_name?.trim(),
      position_description: position_description?.trim(),
      position_is_active,
      position_updated_at: currentTime,
    });

    const transformedPosition = transformPosition(updatedPosition);
    res.status(200).json({
      message: 'Position updated successfully',
      position: transformedPosition,
    });
  } catch (error) {
    console.error('Error updating position:', error);
    next(error);
  }
};

export const deletePosition = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);

    if (!id || isNaN(id)) {
      res.status(400).json({ message: 'Valid position ID is required' });
      return;
    }

    const deletedPosition = await model.deletePosition(id);

    const transformedPosition = transformPosition(deletedPosition);
    res.status(200).json({
      message: 'Position deleted successfully',
      position: transformedPosition,
    });
  } catch (error: any) {
    if (error.message === 'Cannot delete position: it is assigned to employees') {
      res.status(400).json({ message: error.message });
      return;
    }

    console.error('Error deleting position:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const togglePositionStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
      res.status(400).json({ message: 'Valid position ID is required' });
      return;
    }

    const currentTime = new Date().toISOString();
    const updatedPosition = await model.togglePositionStatus(id, currentTime);

    const transformedPosition = transformPosition(updatedPosition);
    res.status(200).json({
      message: `Position ${transformedPosition.position_is_active ? 'activated' : 'deactivated'} successfully`,
      position: transformedPosition,
    });
  } catch (error) {
    console.error('Error toggling position status:', error);
    next(error);
  }
};

const getAllPositionsForDropdown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const positions = await model.getAllPositionsForDropdown();
    res.status(200).json(positions);
  } catch (error) {
    console.error('Error in getAllPositionsForDropdown:', error);
    next(error);
  }
};

const getPositionCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = await model.getPositionCount();
    res.status(200).json({ count });
  } catch (error) {
    console.error('Error getting position count:', error);
    next(error);
  }
};

export default {
  createPosition,
  getAllPositions,
  getPositionById,
  updatePosition,
  deletePosition,
  togglePositionStatus,
  getAllPositionsForDropdown,
  getPositionCount,
};
