import { prisma } from '../lib/prisma.js';
import { format } from 'date-fns';
import { Decimal } from '@prisma/client/runtime/library.js';
import { CreateVoucherTemplateInput, UpdateVoucherTemplateInput } from '../types/voucherTemplate.types.js';

import { VoucherTemplate, VoucherTemplateDetail, MemberName, MemberVouchers } from '../types/model.types.js';

const normalizeBigInts = (data: any): any =>
  JSON.parse(JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value)));

const getAllVoucherTemplates = async (
  offset: number,
  limit: number,
  startDate_utc?: string, // query-level filter
  endDate_utc?: string,
  createdBy?: string,
  search?: string,
  status?: string,
  sessionStartDate_utc?: string, // simulation constraint
  sessionEndDate_utc?: string
) => {
  try {
    const whereConditions: any = {
      createdAt: {
        gte: new Date(sessionStartDate_utc || '0001-01-01T00:00:00Z'),
        lte: new Date(sessionEndDate_utc || '9999-12-31T23:59:59Z'),
      },
    };

    // Apply additional filter only if query range is specified
    if (startDate_utc && endDate_utc) {
      whereConditions.createdAt = {
        gte: new Date(startDate_utc),
        lte: new Date(endDate_utc),
      };
    }

    if (createdBy) {
      const employee = await prisma.employee.findFirst({
        where: {
          employeeName: { contains: createdBy, mode: 'insensitive' },
        },
      });

      if (employee) {
        whereConditions.createdBy = BigInt(employee.id);
      } else {
        return { voucherTemplates: [], totalPages: 0 };
      }
    }

    if (search) {
      whereConditions.OR = [
        { voucherTemplateName: { contains: search, mode: 'insensitive' } },
        { remarks: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      whereConditions.status = status;
    }

    const voucherTemplates = await prisma.voucherTemplate.findMany({
      where: whereConditions,
      include: {
        createdByEmployee: true,
        updatedByEmployee: true,
      },
      orderBy: { id: 'asc' },
      skip: offset,
      take: limit,
    });

    const total = await prisma.voucherTemplate.count({
      where: whereConditions,
    });

    const totalPages = Math.ceil(total / limit);

    const enrichedVoucherTemplates = voucherTemplates.map((template: any) => ({
      ...template,
      created_at: template.createdAt ? format(new Date(template.createdAt), 'dd MMM yyyy, hh:mm a') : null,
      updated_at: template.updatedAt ? format(new Date(template.updatedAt), 'dd MMM yyyy, hh:mm a') : null,
    }));

    return {
      voucherTemplates: enrichedVoucherTemplates,
      totalPages,
    };
  } catch (error) {
    console.error('Error fetching voucher templates:', error);
    throw new Error('Error fetching voucher templates');
  }
};

const getVoucherTemplatesDetails = async (name: string | null = null): Promise<any[]> => {
  try {
    const templates = await prisma.voucherTemplate.findMany({
      where: name ? {
        voucherTemplateName: { equals: name, mode: 'insensitive' },
      } : undefined,
      include: {
        voucherTemplateDetails: {
          select: {
            serviceId: true,
            serviceName: true,
            originalPrice: true,
            customPrice: true,
            discount: true,
            finalPrice: true,
            duration: true,
          },
        },
      },
    });

    const result = templates.map((template: any) => ({
      ...template,
      details: template.voucherTemplateDetails,
    }));

    console.log('Voucher Templates Details Result: ', result);
    return result;
  } catch (error) {
    console.error('Error fetching voucher templates:', error);
    throw new Error('Failed to fetch voucher templates');
  }
};

const createVoucherTemplate = async ({
  voucher_template_name,
  default_starting_balance,
  default_free_of_charge,
  default_total_price,
  remarks,
  status,
  created_by,
  created_at,
  updated_at,
  details = [],
}: CreateVoucherTemplateInput) => {
  try {
    // 1. Create voucher template
    const newTemplate = await prisma.voucherTemplate.create({
      data: {
        voucherTemplateName: voucher_template_name || '',
        defaultStartingBalance: new Decimal(default_starting_balance || 0),
        defaultFreeOfCharge: new Decimal(default_free_of_charge || 0),
        defaultTotalPrice: new Decimal(default_total_price || 0),
        remarks,
        status,
        createdBy: BigInt(created_by || 0),
        lastUpdatedBy: BigInt(created_by || 0),
        createdAt: new Date(created_at || new Date()),
        updatedAt: new Date(updated_at || new Date()),
      },
    });

    // 2. Create voucher template details if provided
    const insertedDetails = [];
    if (details.length > 0) {
      for (const detail of details) {
        const createData: any = {
          voucherTemplateId: newTemplate.id,
          serviceName: detail.service_name || '',
          originalPrice: new Decimal(detail.original_price || 0),
          customPrice: new Decimal(detail.custom_price || 0),
          discount: new Decimal(detail.discount || 0),
          finalPrice: new Decimal(detail.final_price || 0),
          duration: detail.duration,
        };

        // Only add serviceId if it's a valid non-zero value
        const serviceId = Number(detail.service_id);
        if (serviceId && serviceId !== 0) {
          createData.serviceId = BigInt(serviceId);
        }

        // Only add serviceCategoryId if it's a valid non-zero value
        const serviceCategoryId = Number(detail.service_category_id);
        if (serviceCategoryId && serviceCategoryId !== 0) {
          createData.serviceCategoryId = BigInt(serviceCategoryId);
        }

        const insertedDetail = await prisma.voucherTemplateDetail.create({
          data: createData,
        });
        insertedDetails.push(insertedDetail);
      }
    }

    return {
      template: newTemplate,
      details: insertedDetails,
    };
  } catch (error) {
    console.error('Error creating voucher template:', error);
    throw new Error('Error creating voucher template');
  }
};

const updateVoucherTemplate = async ({
  id,
  voucher_template_name,
  default_starting_balance,
  default_free_of_charge,
  default_total_price,
  remarks,
  status,
  last_updated_by,
  created_at,
  updated_at,
  details,
}: UpdateVoucherTemplateInput) => {
  try {
    const updateData: any = {};

    if (voucher_template_name !== undefined) updateData.voucherTemplateName = voucher_template_name;
    if (default_starting_balance !== undefined) updateData.defaultStartingBalance = new Decimal(default_starting_balance);
    if (default_free_of_charge !== undefined) updateData.defaultFreeOfCharge = new Decimal(default_free_of_charge);
    if (default_total_price !== undefined) updateData.defaultTotalPrice = new Decimal(default_total_price);
    if (remarks !== undefined) updateData.remarks = remarks;
    if (status !== undefined) updateData.status = status;
    if (last_updated_by !== undefined) updateData.lastUpdatedBy = BigInt(last_updated_by);
    if (created_at !== undefined) updateData.createdAt = new Date(created_at);
    if (updated_at !== undefined) updateData.updatedAt = new Date(updated_at);

    // Update template
    const updatedTemplate = await prisma.voucherTemplate.update({
      where: { id: BigInt(id || 0) },
      data: updateData,
    });

    // Update details if provided
    let updatedDetails: any[] = [];
    if (details && details.length > 0) {
      // Delete existing details
      await prisma.voucherTemplateDetail.deleteMany({
        where: { voucherTemplateId: updatedTemplate.id },
      });

      // Insert new details
      for (const detail of details) {
        const insertedDetail = await prisma.voucherTemplateDetail.create({
          data: {
            voucherTemplateId: updatedTemplate.id,
            serviceId: BigInt(detail.service_id || 0),
            serviceName: detail.service_name || '',
            originalPrice: new Decimal(detail.original_price || 0),
            customPrice: new Decimal(detail.custom_price || 0),
            discount: new Decimal(detail.discount || 0),
            finalPrice: new Decimal(detail.final_price || 0),
            duration: detail.duration,
            serviceCategoryId: BigInt(detail.service_category_id || 0),
          },
        });
        updatedDetails.push(insertedDetail);
      }
    }

    return {
      template: updatedTemplate,
      details: updatedDetails,
    };
  } catch (error) {
    console.error('Error updating voucher template:', error);
    throw new Error('Could not update voucher template');
  }
};

const deleteVoucherTemplate = async (templateId: string) => {
  try {
    // Delete related voucher template details
    await prisma.voucherTemplateDetail.deleteMany({
      where: { voucherTemplateId: BigInt(templateId) },
    });

    // Delete voucher template
    const deletedTemplate = await prisma.voucherTemplate.delete({
      where: { id: BigInt(templateId) },
    });

    if (!deletedTemplate) {
      throw new Error('Voucher template not found');
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting voucher template:', error);
    throw new Error('Could not delete voucher template');
  }
};

const getVoucherTemplateById = async (id: number, sessionStartDate_utc?: string, sessionEndDate_utc?: string) => {
  try {
    const sessionStart = new Date(sessionStartDate_utc || '0001-01-01T00:00:00Z');
    const sessionEnd = new Date(sessionEndDate_utc || '9999-12-31T23:59:59Z');

    const template = await prisma.voucherTemplate.findFirst({
      where: {
        id: BigInt(id),
        createdAt: {
          gte: sessionStart,
          lte: sessionEnd,
        },
      },
      include: {
        createdByEmployee: true,
        updatedByEmployee: true,
        voucherTemplateDetails: {
          include: {
            service: true,
            serviceCategory: true,
          },
        },
      },
    });

    if (!template) {
      throw new Error('Voucher template not found or out of session range');
    }

    return {
      ...template,
      created_at: template.createdAt ? format(new Date(template.createdAt), 'dd MMM yyyy, hh:mm a') : null,
      updated_at: template.updatedAt ? format(new Date(template.updatedAt), 'dd MMM yyyy, hh:mm a') : null,
      details: template.voucherTemplateDetails,
    };
  } catch (error) {
    console.error('Error fetching voucher template by ID:', error);
    throw new Error('Error fetching voucher template by ID');
  }
};

const getAllVoucherTemplatesForDropdown = async (sessionStartDate_utc?: string, sessionEndDate_utc?: string) => {
  try {
    // Get all voucher templates regardless of status for the dropdown
    // The dropdown should show all templates, not just enabled ones
    const whereClause: any = {};

    // Only apply date range filter if both dates are provided and valid
    if (sessionStartDate_utc && sessionEndDate_utc) {
      const sessionStart = new Date(sessionStartDate_utc);
      const sessionEnd = new Date(sessionEndDate_utc);

      // Only include the date filter if dates are valid
      if (!isNaN(sessionStart.getTime()) && !isNaN(sessionEnd.getTime())) {
        whereClause.createdAt = {
          gte: sessionStart,
          lte: sessionEnd,
        };
      }
    }

    const templates = await prisma.voucherTemplate.findMany({
      where: whereClause,
      select: {
        id: true,
        voucherTemplateName: true,
        defaultStartingBalance: true,
      },
      orderBy: { voucherTemplateName: 'asc' },
    });

    return templates;
  } catch (error) {
    console.error('Error fetching all voucher templates for dropdown:', error);
    throw new Error('Error fetching all voucher templates for dropdown');
  }
};

const getAllVoucherTemplateNames = async (): Promise<any[]> => {
  try {
    const templates = await prisma.voucherTemplate.findMany({
      orderBy: { id: 'asc' },
    });

    return templates;
  } catch (error) {
    console.error('Error fetching voucher template names:', error);
    throw new Error('Failed to fetch voucher template names');
  }
};

export default {
  getAllVoucherTemplates,
  getVoucherTemplateById,
  createVoucherTemplate,
  updateVoucherTemplate,
  deleteVoucherTemplate,
  getAllVoucherTemplatesForDropdown,
  getVoucherTemplatesDetails,
  getAllVoucherTemplateNames,
};
