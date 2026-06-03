 
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';

/**
 * Get or create default system roles
 */
export async function getOrCreateRoles() {
  try {
    // Get all existing roles
    const roles = await prisma.role.findMany();
    return roles;
  } catch (error) {
    console.error('Error getting or creating roles:', error);
    throw error;
  }
}

/**
 * Get or create default statuses
 */
export async function getOrCreateStatus() {
  try {
    // Get all existing statuses
    const statuses = await prisma.status.findMany();
    return statuses;
  } catch (error) {
    console.error('Error getting or creating status:', error);
    throw error;
  }
}

/**
 * Set simulation mode setting
 */
export async function setSimulation(enabled: boolean) {
  try {
    return null;
  } catch (error) {
    console.error('Error setting simulation:', error);
    throw error;
  }
}

/**
 * Create temporary super user for testing
 */
export async function createTempSuperUser() {
  try {
    return null;
  } catch (error) {
    console.error('Error creating temp super user:', error);
    throw error;
  }
}

/**
 * Get maximum duration from start time
 */
export async function getMaxDurationFromStartTimeRaw() {
  try {
    // Get all services
    const services = await prisma.service.findMany();

    if (services.length === 0) {
      return 0;
    }

    // Find max duration by comparing all service records
    const maxDuration = Math.max(
      ...services.map((s: any) => Number(s.serviceDuration || 0))
    );

    return maxDuration;
  } catch (error) {
    console.error('Error getting max duration from start time:', error);
    throw error;
  }
}

export default {
  getOrCreateRoles,
  getOrCreateStatus,
  setSimulation,
  createTempSuperUser,
  getMaxDurationFromStartTimeRaw
};
