import { Request, Response, NextFunction } from 'express';
import model from '../models/voucherTemplateModel.js';
import memberVoucherModel from '../models/memberVoucherModel.js';

// Convert Date objects to ISO 8601 string format
const convertDateToISO = (dateValue: any): string | null => {
  if (!dateValue) return null;
  try {
    if (dateValue instanceof Date) {
      return dateValue.toISOString();
    }
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
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

// Get all voucher templates with filters and pagination
const getAllVoucherTemplates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date_utc, end_date_utc } = req.session;

    const {
      page = '1',
      limit = '10',
      startDate_utc,
      endDate_utc,
      createdBy,
      search,
      status
    } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const pageLimit = parseInt(limit as string);

    const result = await model.getAllVoucherTemplates(
      offset,
      pageLimit,
      startDate_utc as string,
      endDate_utc as string,
      createdBy as string,
      search as string,
      status as string,
      start_date_utc!,
      end_date_utc!
    );

    // Transform camelCase to snake_case and ensure dates are ISO strings
    const transformedTemplates = result.voucherTemplates.map((template: any) => ({
      id: template.id,
      voucher_template_name: template.voucherTemplateName,
      default_starting_balance: template.defaultStartingBalance,
      default_free_of_charge: template.defaultFreeOfCharge,
      default_total_price: template.defaultTotalPrice,
      remarks: template.remarks,
      status: template.status,
      created_by: template.createdBy,
      last_updated_by: template.lastUpdatedBy,
      created_at: convertDateToISO(template.createdAt),
      updated_at: convertDateToISO(template.updatedAt),
      created_by_name: template.createdByEmployee?.employeeName || 'N/A',
      updated_by_name: template.updatedByEmployee?.employeeName || 'N/A',
    }));

    res.status(200).json({
      data: transformedTemplates,
      pageInfo: {
        currentPage: parseInt(page as string),
        totalPages: result.totalPages,
        totalCount: transformedTemplates.length,
        limit: pageLimit
      }
    });
  } catch (error) {
    console.error('Error in getAllVoucherTemplates:', error);
    next(error);
  }
};
// Create a new voucher template
const createVoucherTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await model.createVoucherTemplate(req.body);
    const template = result.template;
    
    const transformedTemplate = {
      id: template.id,
      voucher_template_name: template.voucherTemplateName,
      default_starting_balance: template.defaultStartingBalance,
      default_free_of_charge: template.defaultFreeOfCharge,
      default_total_price: template.defaultTotalPrice,
      remarks: template.remarks,
      status: template.status,
      created_by: template.createdBy,
      last_updated_by: template.lastUpdatedBy,
      created_at: convertDateToISO(template.createdAt),
      updated_at: convertDateToISO(template.updatedAt),
      details: result.details,
    };
    
    res.status(201).json(transformedTemplate);
  } catch (error) {
    console.error('Error in createVoucherTemplate:', error);
  }
};

// Update an existing voucher template
const updateVoucherTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await model.updateVoucherTemplate({
      ...req.body,
      id: id,
    });

    const template = result.template;
    const transformedTemplate = {
      id: template.id,
      voucher_template_name: template.voucherTemplateName,
      default_starting_balance: template.defaultStartingBalance,
      default_free_of_charge: template.defaultFreeOfCharge,
      default_total_price: template.defaultTotalPrice,
      remarks: template.remarks,
      status: template.status,
      created_by: template.createdBy,
      last_updated_by: template.lastUpdatedBy,
      created_at: convertDateToISO(template.createdAt),
      updated_at: convertDateToISO(template.updatedAt),
      details: result.details,
    };

    res.status(200).json(transformedTemplate);
  } catch (error) {
    console.error('Error in updateVoucherTemplate:', error);
    res.status(500).json({ message: 'Failed to update voucher template' });
  }
};

// Delete a voucher template by ID
const deleteVoucherTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await model.deleteVoucherTemplate(id);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in deleteVoucherTemplate:', error);
    res.status(500).json({ message: 'Failed to delete voucher template' });
  }
};

// Get a single voucher template by ID
const getVoucherTemplateById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { start_date_utc, end_date_utc } = req.session;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ message: 'Invalid voucher template ID' });
      return;
    }

    const voucherTemplate = await model.getVoucherTemplateById(id, start_date_utc!, end_date_utc!);

    if (!voucherTemplate) {
      res.status(404).json({ message: 'Voucher template not found' });
      return;
    }

    const transformedTemplate = {
      id: voucherTemplate.id,
      voucher_template_name: voucherTemplate.voucherTemplateName,
      default_starting_balance: voucherTemplate.defaultStartingBalance,
      default_free_of_charge: voucherTemplate.defaultFreeOfCharge,
      default_total_price: voucherTemplate.defaultTotalPrice,
      remarks: voucherTemplate.remarks,
      status: voucherTemplate.status,
      created_by: voucherTemplate.createdBy,
      last_updated_by: voucherTemplate.lastUpdatedBy,
      created_at: convertDateToISO(voucherTemplate.createdAt),
      updated_at: convertDateToISO(voucherTemplate.updatedAt),
      created_by_name: voucherTemplate.createdByEmployee?.employeeName || 'N/A',
      updated_by_name: voucherTemplate.updatedByEmployee?.employeeName || 'N/A',
      details: voucherTemplate.details || voucherTemplate.voucherTemplateDetails,
    };

    res.status(200).json(transformedTemplate);
  } catch (error) {
    console.error('Error in getVoucherTemplateById:', error);
    next(error);
  }
};

const getAllVoucherTemplatesForDropdown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { start_date_utc, end_date_utc } = req.session;
    const templates = await model.getAllVoucherTemplatesForDropdown(start_date_utc as string | undefined, end_date_utc as string | undefined);
    
    // Transform camelCase to snake_case for API response
    const transformedTemplates = templates.map((template: any) => ({
      id: template.id,
      voucher_template_name: template.voucherTemplateName,
      default_starting_balance: template.defaultStartingBalance,
    }));
    
    res.status(200).json(transformedTemplates);
  } catch (error) {
    console.error('Error in getAllVoucherTemplatesForDropdown:', error);
    next(error);
  }
};

const getVoucherTemplatesDetailsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    console.log('Received query:', req.query);

    const name = req.query.name;

    const voucherName = name?.toString();

    const templatesDetails = await model.getVoucherTemplatesDetails(voucherName);

    res.status(200).json({ data: templatesDetails });
  } catch (error) {
    console.error("Error fetching voucher templates details:", error);
    res.status(500).json({ error: "Failed to fetch voucher templates details" });
  }
};


const getVoucherTemplateNamesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const names = await model.getAllVoucherTemplateNames();

    res.status(200).json({
      success: true,
      data: names,
    });
  } catch (error) {
    console.error("Error fetching voucher template names:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch voucher template names",
    });
  }
};
// Export all handlers in the same pattern
export default {
  getAllVoucherTemplates,
  getVoucherTemplateById,
  createVoucherTemplate,
  updateVoucherTemplate,
  deleteVoucherTemplate,
  getAllVoucherTemplatesForDropdown,
  getVoucherTemplatesDetailsHandler,
  getVoucherTemplateNamesHandler

};