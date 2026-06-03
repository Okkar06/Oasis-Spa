import { prisma } from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';
import { createServiceInput, updateServiceInput } from '../types/service.type.js';
import { pool } from '../config/database.js';

// get all services, sorted by sequence number
const getAllServices = async () => {
  try {
    const services = await prisma.service.findMany({
      include: {
        serviceCategory: true,
        createdByEmployee: {
          select: { id: true, employeeName: true },
        },
        updatedByEmployee: {
          select: { id: true, employeeName: true },
        },
      },
      orderBy: [{ serviceCategory: { serviceCategorySequenceNo: 'asc' } }, { serviceSequenceNo: 'asc' }],
    });

    return services.map((service: any) => ({
      ...service,
      created_by: service.createdByEmployee?.employeeName,
      updated_by: service.updatedByEmployee?.employeeName,
    }));
  } catch (error) {
    console.error('Error fetching all services:', error);
    throw new Error('Error fetching all services');
  }
};

const getServicesPaginationFilter = async (
  page: number,
  limit: number,
  search?: string | null,
  category?: number | null,
  status?: boolean | null
) => {
  try {
    // Use stored procedure to maintain original functionality
    const query = `
      SELECT * FROM get_services_with_pagination(
      $1::INT, 
      $2::INT,
      $3::TEXT,
      $4::BIGINT,
      $5::BOOLEAN
      );`;
    const params = [page, limit, search, category, status];

    const result = await pool().query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error in getServicesPaginationFilter:', error);
    throw new Error('Error fetching services with pagination and filter');
  }
};

// get total pages for pagination
const getTotalCount = async (search: string | null, category: number | null, status: boolean | null) => {
  try {
    const where: any = {};
    if (search != null) {
      where.serviceName = { contains: search, mode: 'insensitive' };
    }
    if (category != null) {
      where.serviceCategoryId = BigInt(category);
    }
    if (status != null) {
      where.serviceIsEnabled = status;
    }

    const count = await prisma.service.count({ where });
    return count;
  } catch (error) {
    console.error('Error in getTotalPages:', error);
    throw new Error('Error fetching total number of pages');
  }
};

// get id, service_name for dropdown, sorted by service_name
const getAllServicesForDropdown = async () => {
  try {
    const services = await prisma.service.findMany({
      where: { serviceIsEnabled: true },
      select: {
        id: true,
        serviceName: true,
        servicePrice: true,
      },
      orderBy: [{ serviceCategory: { serviceCategorySequenceNo: 'asc' } }, { serviceSequenceNo: 'asc' }],
    });
    return services.map((s: any) => ({
      id: Number(s.id),
      service_name: s.serviceName,
      service_price: s.servicePrice,
    }));
  } catch (error) {
    console.error('Error fetching service list:', error);
    throw new Error('Error fetching service list');
  }
};

// get service by id, include both enabled and disabled services
const getServiceById = async (id: number) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: BigInt(id) },
      include: {
        serviceCategory: true,
        createdByEmployee: {
          select: { id: true, employeeName: true },
        },
        updatedByEmployee: {
          select: { id: true, employeeName: true },
        },
      },
    });
    return service;
  } catch (error) {
    console.error('Error fetching service by id:', error);
    throw new Error('Error fetching service by id');
  }
};

// get service by name
const getServiceByName = async (service_name: string) => {
  try {
    const service = await prisma.service.findFirst({
      where: { serviceName: service_name },
      select: {
        id: true,
        serviceName: true,
      },
    });
    return service;
  } catch (error) {
    console.error('Error fetching service by name:', error);
    throw new Error('Error fetching service by name');
  }
};

const getEnabledServiceById = async (id: number) => {
  try {
    const service = await prisma.service.findFirst({
      where: { id: BigInt(id), serviceIsEnabled: true },
      include: {
        serviceCategory: true,
        createdByEmployee: {
          select: { id: true, employeeName: true },
        },
        updatedByEmployee: {
          select: { id: true, employeeName: true },
        },
      },
    });
    return service ? [service] : [];
  } catch (error) {
    console.error('Error fetching service list:', error);
    throw new Error('Error fetching service list');
  }
};

const getServiceSequenceNo = async (service_category_id: string | number): Promise<number> => {
  try {
    const count = await prisma.service.count({
      where: {
        serviceCategoryId: BigInt(service_category_id),
        serviceIsEnabled: true,
      },
    });
    return count + 1;
  } catch (error) {
    console.error('Error fetching service sequence no:', error);
    throw new Error('Error fetching service sequence no');
  }
};

const getServiceByCategory = async (service_category_id: number) => {
  try {
    const services = await prisma.service.findMany({
      where: {
        serviceCategoryId: BigInt(service_category_id),
        serviceIsEnabled: true,
      },
      select: {
        id: true,
        serviceName: true,
        serviceSequenceNo: true,
      },
      orderBy: { serviceSequenceNo: 'asc' },
    });
    return services;
  } catch (error) {
    console.error('Error fetching services:', error);
    throw new Error('Error fetching services');
  }
};

const createService = async ({
  service_name,
  service_description,
  service_remarks,
  service_duration,
  service_price,
  service_is_enabled,
  created_at,
  updated_at,
  service_category_id,
  service_sequence_no,
  created_by,
  updated_by,
}: createServiceInput) => {
  try {
    const service = await prisma.service.create({
      data: {
        serviceName: service_name,
        serviceDescription: service_description,
        serviceRemarks: service_remarks,
        serviceDuration: new Decimal(service_duration),
        servicePrice: new Decimal(service_price),
        serviceIsEnabled: service_is_enabled,
        createdAt: new Date(created_at),
        updatedAt: new Date(updated_at),
        serviceCategoryId: BigInt(service_category_id),
        serviceSequenceNo: service_sequence_no,
        createdBy: BigInt(created_by),
        updatedBy: BigInt(updated_by),
      },
      include: {
        serviceCategory: true,
        createdByEmployee: true,
        updatedByEmployee: true,
      },
    });
    return [service];
  } catch (error) {
    console.error('Error creating new service:', error);
    throw new Error('Error creating new service');
  }
};

const updateService = async ({
  id,
  service_name,
  service_description,
  service_remarks,
  service_duration,
  service_price,
  created_at,
  updated_at,
  service_category_id,
  service_sequence_no,
  created_by,
  updated_by,
}: Partial<updateServiceInput>) => {
  try {
    const updateData: any = {};

    if (service_name) {
      updateData.serviceName = service_name;
    }

    if (service_description != null) {
      updateData.serviceDescription = service_description;
    }

    if (service_remarks != null) {
      updateData.serviceRemarks = service_remarks;
    }

    if (service_duration) {
      updateData.serviceDuration = new Decimal(service_duration);
    }

    if (service_price) {
      updateData.servicePrice = new Decimal(service_price);
    }

    if (service_category_id) {
      updateData.serviceCategoryId = BigInt(service_category_id);
      if (service_sequence_no) {
        updateData.serviceSequenceNo = service_sequence_no;
      }
    }

    if (created_at) {
      updateData.createdAt = new Date(created_at);
    }

    if (created_by) {
      updateData.createdBy = BigInt(created_by);
    }

    // Always update updated_at and updated_by
    updateData.updatedAt = new Date(updated_at || new Date().toISOString());
    updateData.updatedBy = BigInt(updated_by || 0);

    const service = await prisma.service.update({
      where: { id: BigInt(id || 0) },
      data: updateData,
      include: {
        serviceCategory: true,
        createdByEmployee: true,
        updatedByEmployee: true,
      },
    });

    return [service];
  } catch (error) {
    console.error('Error updating service:', error);
    throw new Error('Error updating service');
  }
};

const reorderServices = async (services: { id: number; service_sequence_no: number }[]) => {
  try {
    for (const service of services) {
      await prisma.service.update({
        where: { id: BigInt(service.id) },
        data: { serviceSequenceNo: service.service_sequence_no },
      });
    }
    return { success: true, updatedCount: services.length };
  } catch (error) {
    console.error('Error updating service sequence:', error);
    throw new Error('Error updating service sequence');
  }
};

const changeServiceStatus = async (updateData: {
  id: number;
  enabled: boolean;
  updated_at: string;
  updated_by: number;
  service_sequence_no: number;
  service_remarks?: string | null;
}) => {
  try {
    const updatePayload: any = {
      serviceIsEnabled: updateData.enabled,
      serviceSequenceNo: updateData.service_sequence_no,
      updatedBy: BigInt(updateData.updated_by),
      updatedAt: new Date(updateData.updated_at),
    };

    if (updateData.service_remarks) {
      updatePayload.serviceRemarks = updateData.service_remarks;
    }

    const service = await prisma.service.update({
      where: { id: BigInt(updateData.id) },
      data: updatePayload,
      include: {
        serviceCategory: true,
        createdByEmployee: true,
        updatedByEmployee: true,
      },
    });
    return service;
  } catch (error) {
    console.error('Error enabling service sequence:', error);
    throw new Error('Error enabling service sequence');
  }
};

const getServiceCategories = async () => {
  try {
    const categories = await prisma.serviceCategory.findMany({
      include: {
        services: {
          where: { serviceIsEnabled: true },
          orderBy: { serviceSequenceNo: 'asc' },
        },
      },
      orderBy: { serviceCategorySequenceNo: 'asc' },
    });
    return categories;
  } catch (error) {
    console.error('Error fetching service categories:', error);
    throw new Error('Error fetching service categories');
  }
};

const getServiceCategoryById = async (id: number) => {
  try {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: BigInt(id) },
      include: {
        services: {
          where: { serviceIsEnabled: true },
          orderBy: { serviceSequenceNo: 'asc' },
        },
      },
    });
    return category;
  } catch (error) {
    console.error('Error fetching service category by id:', error);
    throw new Error('Error fetching service category by id');
  }
};

// get sales history by service id, selected month and year
const getSalesHistoryByServiceId = async (id: number, month: number, year: number) => {
  try {
    const salesQuery = `SELECT * FROM get_sales_history_for_each_service($1, $2, $3);`;
    const result = await pool().query(salesQuery, [id, year, month]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching sales history by service ID:', error);
    throw new Error('Error fetching sales history');
  }
};

// create a new service category
const createServiceCategory = async (name: string) => {
  try {
    const query = `SELECT * FROM create_service_category($1)`;
    const result = await pool().query(query, [name]);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating service category:', error);

    if (error instanceof Error && error.message.includes('Category already exists')) {
      throw new Error('Category already exists');
    }

    throw new Error('Error creating service category');
  }
};

// update service category by id
const updateServiceCategory = async (id: number, name: string) => {
  try {
    const result = await pool().query('SELECT * FROM update_service_category($1, $2)', [id, name]);
    return result.rows[0];
  } catch (error) {
    console.error('Error updating service category:', error);

    if (error instanceof Error && error.message.includes('does not exist')) {
      throw new Error('Category not found');
    }

    if (error instanceof Error && error.message.includes('already exists')) {
      throw new Error('Category already exists');
    }

    throw new Error('Error updating service category');
  }
};

// reorder service category sequence no
const reorderServiceCategory = async (categories: { id: number; service_category_sequence_no: number }[]) => {
  try {
    for (const { id, service_category_sequence_no } of categories) {
      await prisma.serviceCategory.update({
        where: { id: BigInt(id) },
        data: {
          serviceCategorySequenceNo: service_category_sequence_no,
          updatedAt: new Date(),
        },
      });
    }
    return { success: true, updatedCount: categories.length };
  } catch (error) {
    console.error('Error reordering service categories:', error);
    throw error;
  }
};

// get total pages for pagination
const getServiceCategoriesCount = async (search: string | null) => {
  try {
    const count = await prisma.serviceCategory.count({
      where: search
        ? {
            serviceCategoryName: { contains: search, mode: 'insensitive' },
          }
        : undefined,
    });
    return count;
  } catch (error) {
    console.error('Error in getServiceCategoriesCount:', error);
    throw new Error('Error fetching category count');
  }
};

// Get service categories with pagination and search filter
const getServiceCategoriesPaginationFilter = async (page: number, limit: number, search: string | null) => {
  try {
    const offset = (page - 1) * limit;
    const categories = await prisma.serviceCategory.findMany({
      where: search
        ? {
            serviceCategoryName: { contains: search, mode: 'insensitive' },
          }
        : undefined,
      include: {
        services: {
          where: { serviceIsEnabled: true },
        },
      },
      orderBy: { serviceCategorySequenceNo: 'asc' },
      skip: offset,
      take: limit,
    });
    return categories;
  } catch (error) {
    console.error('Error in getServiceCategoriesPaginationFilter:', error);
    throw new Error('Error fetching service categories with pagination');
  }
};

export default {
  getAllServices,
  getServicesPaginationFilter,
  getTotalCount,
  getAllServicesForDropdown,
  getServiceById,
  getServiceByName,
  getEnabledServiceById,
  getServiceSequenceNo,
  getServiceByCategory,
  createService,
  updateService,
  reorderServices,
  changeServiceStatus,
  getServiceCategories,
  getServiceCategoryById,
  getSalesHistoryByServiceId,
  createServiceCategory,
  updateServiceCategory,
  reorderServiceCategory,
  getServiceCategoriesCount,
  getServiceCategoriesPaginationFilter,
};
