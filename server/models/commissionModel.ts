import { EmployeeCommisions } from '../types/model.types.js';
import { getPrisma } from '../lib/prisma.js';

interface CommissionSettingUpdate {
  key: string;
  value: string;
  frontendKey: string;
}

// Type definitions for commission data
export interface DailyCommissionData {
  date: string; // YYYY-MM-DD format
  services: string;
  products: string;
  member_vouchers: string;
  member_care_packages: string;
  performance_total: string;
  commission_total: string;
}

export interface CommissionBreakdownRecord {
  id: number;
  item_type: string;
  item_id: string;
  commission_amount: string;
  performance_amount: string;
  commission_rate: string;
  performance_rate: string;
  remarks: string;
  created_at: string;
  item_name?: string; // Optional - for display purposes
}

export interface MonthDateRange {
  start_date: Date;
  end_date: Date;
}

// Key mapping between frontend and database
const KEY_MAPPING = {
  service: 'adhoc_service',
  product: 'adhoc_product',
  package: 'member_care_package_purchase',
  'member-voucher': 'member_voucher_purchase',
  mcpConsumption: 'member_care_package_consumption',
  mvConsumption: 'member_voucher_consumption',
  transferMCP: 'mcp_transfer',
  transferMV: 'mv_transfer',
};

const getAllCommissionSettings = async () => {
  try {
    const prisma = getPrisma();
    const settings = await prisma.setting.findMany({
      where: {
        type: 'Commission',
      },
      select: {
        id: true,
        key: true,
        value: true,
      },
    });

    // Convert BigInt to string for JSON serialization
    return settings.map((setting) => ({
      id: setting.id.toString(),
      key: setting.key,
      value: setting.value,
    }));
  } catch (error) {
    console.error('Error fetching commission settings list:', error);
    throw new Error('Error fetching commission settings list');
  }
};

const updateMultipleCommissionSettings = async (
  updates: Record<string, number>
): Promise<CommissionSettingUpdate[]> => {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const results: CommissionSettingUpdate[] = [];

    for (const [frontendKey, value] of Object.entries(updates)) {
      const dbKey = KEY_MAPPING[frontendKey as keyof typeof KEY_MAPPING];

      if (!dbKey) {
        console.warn(` Unknown commission setting key: ${frontendKey}`);
        continue;
      }

      // Validate rate (0-100%)
      if (isNaN(value) || value < 0 || value > 100) {
        throw new Error(`Invalid commission rate for ${frontendKey}: ${value}. Must be between 0 and 100.`);
      }

      // Try to update existing record using upsert (update or insert)
      const setting = await tx.setting.upsert({
        where: {
          type_key: {
            type: 'Commission',
            key: dbKey,
          },
        },
        update: {
          value: value.toFixed(2),
        },
        create: {
          type: 'Commission',
          key: dbKey,
          value: value.toFixed(2),
        },
      });

      results.push({
        key: dbKey,
        value: value.toFixed(2),
        frontendKey: frontendKey,
      });
    }
    return results;
  });
};

const validateCommissionSettings = (settings: Record<string, any>): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  for (const [key, value] of Object.entries(settings)) {
    if (!KEY_MAPPING[key as keyof typeof KEY_MAPPING]) {
      errors.push(`Unknown setting: ${key}`);
      continue;
    }

    // Convert string to number if needed
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;

    if (typeof numericValue !== 'number' || isNaN(numericValue)) {
      errors.push(`${key} must be a valid number`);
      continue;
    }

    if (numericValue < 0) {
      errors.push(`${key} cannot be negative`);
      continue;
    }

    if (numericValue > 100) {
      errors.push(`${key} cannot exceed 100%`);
      continue;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

interface commissionPayload {
  employeeId: string;
  performanceRate: number;
  performanceAmount: number;
  commissionRate: number;
  commissionAmount: number;
  remarks: string;
  itemType:
    | 'member_vouchers'
    | 'member_care_packages'
    | 'products'
    | 'services'
    | 'member_care_package_transaction_logs'
    | 'member_voucher_transaction_logs';
  itemId: string;
  created_at: string;
}

const createEmpCommission = async (data: commissionPayload) => {
  try {
    const prisma = getPrisma();

    const commission = await prisma.employeeCommission.create({
      data: {
        itemType: data.itemType,
        itemId: BigInt(data.itemId),
        employeeId: BigInt(data.employeeId),
        performanceRate: data.performanceRate,
        performanceAmount: data.performanceAmount,
        commissionRate: data.commissionRate,
        commissionAmount: data.commissionAmount,
        remarks: data.remarks,
        createdAt: new Date(data.created_at),
      },
    });

    console.log('✅ Commission record created:', {
      id: commission.id.toString(),
      itemType: data.itemType,
      itemId: data.itemId,
      employeeId: data.employeeId,
      commissionAmount: data.commissionAmount,
    });

    // Return in the same format as pool().query for backward compatibility
    return {
      rows: [
        {
          ...commission,
          id: commission.id.toString(),
          item_id: commission.itemId.toString(),
          employee_id: commission.employeeId.toString(),
          item_type: commission.itemType,
          performance_rate: commission.performanceRate,
          performance_amount: commission.performanceAmount,
          commission_rate: commission.commissionRate,
          commission_amount: commission.commissionAmount,
          created_at: commission.createdAt,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
};

// Helper function to get commission records for reporting (updated for business types)
const getCommissionsByTransaction = async (transactionId: string) => {
  try {
    const prisma = getPrisma();

    const saleItems = await prisma.saleTransactionItem.findMany({
      where: {
        saleTransactionId: BigInt(transactionId),
        itemType: { in: ['services', 'products'] },
      },
      select: {
        id: true,
        itemType: true,
        serviceName: true,
        productName: true,
      },
    });

    const itemIds = saleItems.map((si) => si.id);
    const itemLookup = new Map<string, typeof saleItems[number]>(
      saleItems.map((si) => [si.id.toString(), si])
    );

    const commissions = await prisma.employeeCommission.findMany({
      where: {
        itemId: { in: itemIds },
        itemType: { in: ['services', 'products'] },
      },
      include: {
        employee: { select: { employeeName: true, employeeCode: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return commissions.map((ec) => {
      const item = itemLookup.get(ec.itemId.toString());
      return {
        id: ec.id.toString(),
        item_type: ec.itemType,
        item_id: ec.itemId.toString(),
        employee_id: ec.employeeId.toString(),
        commission_amount: Number(ec.commissionAmount).toString(),
        performance_amount: Number(ec.performanceAmount).toString(),
        commission_rate: Number(ec.commissionRate).toString(),
        performance_rate: Number(ec.performanceRate).toString(),
        remarks: ec.remarks ?? '',
        created_at: ec.createdAt,
        employee_name: ec.employee?.employeeName,
        employee_code: ec.employee?.employeeCode,
        service_name: item?.serviceName ?? null,
        product_name: item?.productName ?? null,
        transaction_item_type: item?.itemType ?? null,
      };
    });
  } catch (error) {
    console.error('Error fetching commission records for transaction:', error);
    throw new Error('Error fetching commission records for transaction');
  }
};

/**
 * Utility function - Validate month format (YYYY-MM)
 * Following timetable module pattern
 */
const isValidMonthFormat = (month: string): boolean => {
  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  return monthRegex.test(month);
};

/**
 * Utility function - Get the start and end dates for a month
 * Following timetable module pattern exactly
 */
const getMonthDateRange = (monthInput: string): MonthDateRange => {
  const start_date = new Date(`${monthInput}-01T00:00:00Z`);
  const end_date = new Date(start_date.getFullYear(), start_date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start_date, end_date };
};

/**
 * Get monthly commission data for an employee - Daily aggregated view
 * Similar to revenue controller pattern with daily array
 */
const getEmployeeMonthlyCommission = async (employeeId: number, month: string): Promise<DailyCommissionData[]> => {
  try {
    // Validate month format
    if (!isValidMonthFormat(month)) {
      throw new Error('Invalid month format. Use YYYY-MM format.');
    }

    const { start_date, end_date } = getMonthDateRange(month);
    const year = start_date.getFullYear();
    const monthNum = start_date.getMonth() + 1;

    console.log('=== DEBUG COMMISSION QUERY ===');
    console.log('Employee ID:', employeeId);
    console.log('Month:', month);
    console.log('start_date:', start_date.toISOString());
    console.log('end_date:', end_date.toISOString());

    const prisma = getPrisma();
    const debugResult = await prisma.employeeCommission.findMany({
      where: {
        employeeId: BigInt(employeeId),
        createdAt: { gte: start_date, lt: end_date },
      },
      select: { id: true, createdAt: true, itemType: true, commissionAmount: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log('=== DEBUG: Raw commission records with timezone conversion ===');
    debugResult.forEach((row) => {
      const sgt = new Date(row.createdAt.getTime() + 8 * 60 * 60 * 1000);
      const sgtDate = `${sgt.getFullYear()}-${String(sgt.getMonth() + 1).padStart(2, '0')}-${String(
        sgt.getDate()
      ).padStart(2, '0')}`;
      console.log(
        `ID: ${row.id.toString()}, UTC: ${row.createdAt.toISOString()}, SGT: ${sgt.toISOString()}, Date: ${sgtDate}, Amount: ${row.commissionAmount}`
      );
    });

    // Get number of days in the month
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    // Create array of day objects with default values (following revenue controller pattern)
    const daysArray: DailyCommissionData[] = Array.from({ length: daysInMonth }, (_, i) => {
      const day = (i + 1).toString().padStart(2, '0');
      const date = `${year}-${monthNum.toString().padStart(2, '0')}-${day}`;

      return {
        date, // YYYY-MM-DD format
        services: '0.00',
        products: '0.00',
        member_vouchers: '0.00',
        member_care_packages: '0.00',
        performance_total: '0.00',
        commission_total: '0.00',
      };
    });

    // Fetch all commissions within range, then aggregate in JS using SGT conversion
    const records = await prisma.employeeCommission.findMany({
      where: {
        employeeId: BigInt(employeeId),
        createdAt: { gte: start_date, lt: end_date },
      },
      select: {
        createdAt: true,
        itemType: true,
        commissionAmount: true,
        performanceAmount: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    records.forEach((row) => {
      const sgt = new Date(row.createdAt.getTime() + 8 * 60 * 60 * 1000);
      const commissionDateStr = `${sgt.getFullYear()}-${String(sgt.getMonth() + 1).padStart(2, '0')}-${String(
        sgt.getDate()
      ).padStart(2, '0')}`;

      const day = parseInt(commissionDateStr.split('-')[2], 10) - 1; // 0-based index

      if (day >= 0 && day < daysInMonth) {
        const commissionAmount = Number(row.commissionAmount || 0);
        const performanceAmount = Number(row.performanceAmount || 0);

        switch (row.itemType) {
          case 'services':
            daysArray[day].services = commissionAmount.toFixed(2);
            break;
          case 'products':
            daysArray[day].products = commissionAmount.toFixed(2);
            break;
          case 'member_vouchers':
          case 'member_voucher_transaction_logs': {
            const currentMV = Number(daysArray[day].member_vouchers);
            daysArray[day].member_vouchers = (currentMV + commissionAmount).toFixed(2);
            break;
          }
          case 'member_care_packages':
          case 'member_care_package_transaction_logs': {
            const currentMCP = Number(daysArray[day].member_care_packages);
            daysArray[day].member_care_packages = (currentMCP + commissionAmount).toFixed(2);
            break;
          }
        }

        const currentPerformance = Number(daysArray[day].performance_total);
        const currentCommission = Number(daysArray[day].commission_total);

        daysArray[day].performance_total = (currentPerformance + performanceAmount).toFixed(2);
        daysArray[day].commission_total = (currentCommission + commissionAmount).toFixed(2);
      }
    });

    console.log('Processed commission data for', daysInMonth, 'days');
    return daysArray;
  } catch (error) {
    console.error('Database Error in getEmployeeMonthlyCommission:', error);
    throw new Error('Failed to fetch employee monthly commission data from the database');
  }
};

/**
 * Get detailed commission breakdown for a specific employee and date
 * Shows individual commission records for a specific day
 */
const getEmployeeCommissionBreakdown = async (
  employeeId: number,
  date: string
): Promise<CommissionBreakdownRecord[]> => {
  try {
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD format.');
    }

    console.log('=== DEBUG COMMISSION BREAKDOWN ===');
    console.log('Employee ID:', employeeId);
    console.log('Date:', date);

    console.log('Start of day (SGT):', `${date}T00:00:00+08:00`);
    console.log('End of day (SGT):', `${date}T23:59:59+08:00`);

    const prisma = getPrisma();

    const startSgt = new Date(`${date}T00:00:00+08:00`);
    const endSgt = new Date(`${date}T23:59:59+08:00`);

    const commissions = await prisma.employeeCommission.findMany({
      where: {
        employeeId: BigInt(employeeId),
        createdAt: { gte: startSgt, lt: endSgt },
      },
      orderBy: { createdAt: 'asc' },
    });

    const saleItemIds: bigint[] = [];
    const mvIds: bigint[] = [];
    const mcpIds: bigint[] = [];

    commissions.forEach((c) => {
      if (c.itemType === 'services' || c.itemType === 'products') saleItemIds.push(c.itemId);
      else if (c.itemType === 'member_vouchers') mvIds.push(c.itemId);
      else if (c.itemType === 'member_care_packages') mcpIds.push(c.itemId);
    });

    const [saleItems, mvs, mcps] = await Promise.all([
      saleItemIds.length
        ? prisma.saleTransactionItem.findMany({
            where: { id: { in: saleItemIds } },
            select: { id: true, serviceName: true, productName: true },
          })
        : Promise.resolve([]),
      mvIds.length
        ? prisma.memberVoucher.findMany({
            where: { id: { in: mvIds } },
            select: { id: true, memberVoucherName: true },
          })
        : Promise.resolve([]),
      mcpIds.length
        ? prisma.memberCarePackage.findMany({
            where: { id: { in: mcpIds } },
            select: { id: true, packageName: true },
          })
        : Promise.resolve([]),
    ]);

    const saleLookup = new Map<string, typeof saleItems[number]>(saleItems.map((s) => [s.id.toString(), s]));
    const mvLookup = new Map<string, typeof mvs[number]>(mvs.map((m) => [m.id.toString(), m]));
    const mcpLookup = new Map<string, typeof mcps[number]>(mcps.map((m) => [m.id.toString(), m]));

    const breakdownRecords: CommissionBreakdownRecord[] = commissions.map((row) => {
      let item_name = 'N/A';
      if (row.itemType === 'services') {
        const s = saleLookup.get(row.itemId.toString());
        item_name = s?.serviceName ?? 'N/A';
      } else if (row.itemType === 'products') {
        const s = saleLookup.get(row.itemId.toString());
        item_name = s?.productName ?? 'N/A';
      } else if (row.itemType === 'member_vouchers') {
        const m = mvLookup.get(row.itemId.toString());
        item_name = m?.memberVoucherName ?? 'N/A';
      } else if (row.itemType === 'member_care_packages') {
        const m = mcpLookup.get(row.itemId.toString());
        item_name = m?.packageName ?? 'N/A';
      }

      return {
        id: Number(row.id),
        item_type: row.itemType,
        item_id: row.itemId.toString(),
        commission_amount: Number(row.commissionAmount || 0).toFixed(2),
        performance_amount: Number(row.performanceAmount || 0).toFixed(2),
        commission_rate: Number(row.commissionRate || 0).toFixed(2),
        performance_rate: Number(row.performanceRate || 0).toFixed(2),
        remarks: row.remarks ?? '',
        created_at: row.createdAt as unknown as string,
        item_name,
      };
    });

    return breakdownRecords;
  } catch (error) {
    console.error('Database Error in getEmployeeCommissionBreakdown:', error);
    throw new Error('Failed to fetch employee commission breakdown from the database');
  }
};
/**
 * Future Enhancements:
 * - Add validation to ensure item exists before creating commission records.
 * - Implement error handling for cases where item or employee does not exist.
 */

// // Helper function to validate that the referenced item exists
// const validateItemExists = async (client: any, itemType: string, itemId: string) => {
//   let validationQuery = '';
//   let tableName = '';

//   switch (itemType) {
//     // For services and products, we validate against sale_transaction_items
//     case 'services':
//     case 'products':
//       validationQuery = 'SELECT id FROM sale_transaction_items WHERE id = $1';
//       tableName = 'sale_transaction_items';
//       break;
//     case 'member_care_packages':
//       validationQuery = 'SELECT id FROM member_care_packages WHERE id = $1';
//       tableName = 'member_care_packages';
//       break;
//     case 'member_vouchers':
//       validationQuery = 'SELECT id FROM member_vouchers WHERE id = $1';
//       tableName = 'member_vouchers';
//       break;
//     case 'member_care_package_transaction_logs':
//       validationQuery = 'SELECT id FROM member_care_package_transaction_logs WHERE id = $1';
//       tableName = 'member_care_package_transaction_logs';
//       break;
//     case 'member_voucher_transaction_logs':
//       validationQuery = 'SELECT id FROM member_voucher_transaction_logs WHERE id = $1';
//       tableName = 'member_voucher_transaction_logs';
//       break;
//     default:
//       throw new Error(`Unsupported item type: ${itemType}`);
//   }

//   const result = await client.query(validationQuery, [itemId]);

//   if (result.rows.length === 0) {
//     throw new Error(`Item with ID ${itemId} not found in ${tableName} for item_type ${itemType}`);
//   }

//   console.log(' Item validation passed:', { itemType, itemId, tableName });
// };

// // Helper function to validate employee exists
// const validateEmployeeExists = async (client: any, employeeId: string) => {
//   const result = await client.query(
//     'SELECT id, employee_name FROM employees WHERE id = $1',
//     [employeeId]
//   );

//   if (result.rows.length === 0) {
//     throw new Error(`Employee with ID ${employeeId} not found`);
//   }

//   console.log('Employee validation passed:', {
//     employeeId,
//     employeeName: result.rows[0].employee_name
//   });
// };

export default {
  getAllCommissionSettings,
  createEmpCommission,
  getCommissionsByTransaction,
  updateMultipleCommissionSettings,
  getEmployeeMonthlyCommission,
  getEmployeeCommissionBreakdown,
  validateCommissionSettings,
  KEY_MAPPING,
};
