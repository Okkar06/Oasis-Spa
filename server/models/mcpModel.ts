import { PoolClient } from 'pg';
import { getPrisma } from '../lib/prisma.js';
import { CursorPayload, FieldMapping, PaginatedOptions, PaginatedReturn } from '../types/common.types.js';
import {
  Employees,
  MemberCarePackages,
  MemberCarePackagesDetails,
  MemberCarePackageTransactionLogs,
} from '../types/model.types.js';
import { encodeCursor } from '../utils/cursorUtils.js';
import { ValidationError } from '../types/errors.js';

const getPaginatedMemberCarePackages = async (
  limit: number,
  options: PaginatedOptions = {},
  start_date_utc: string | undefined | null,
  end_date_utc: string | undefined | null,
): Promise<PaginatedReturn<MemberCarePackages>> => {
  const { searchTerm } = options;
  const after = options.after || null;
  const before = options.before || null;
  const page = options.page || undefined;

  try {
    const prisma = getPrisma();

    // Build Prisma where clause
    const where: any = { AND: [] };

    if (searchTerm) {
      where.AND.push({
        OR: [
          { packageName: { contains: searchTerm, mode: 'insensitive' } },
          { packageRemarks: { contains: searchTerm, mode: 'insensitive' } },
          { member: { name: { contains: searchTerm, mode: 'insensitive' } } },
          { employee: { employeeName: { contains: searchTerm, mode: 'insensitive' } } },
        ],
      });
    }

    if (start_date_utc) {
      where.AND.push({ createdAt: { gte: new Date(start_date_utc) } });
    }
    if (end_date_utc) {
      where.AND.push({ createdAt: { lte: new Date(end_date_utc) } });
    }

    if (after) {
      where.AND.push({
        OR: [
          { createdAt: { gt: after.createdAt } },
          { AND: [{ createdAt: after.createdAt }, { id: { gt: after.id } }] },
        ],
      });
    } else if (before) {
      where.AND.push({
        OR: [
          { createdAt: { lt: before.createdAt } },
          { AND: [{ createdAt: before.createdAt }, { id: { lt: before.id } }] },
        ],
      });
    }

    const totalCount = await prisma.memberCarePackage.count({ where });

    const effectiveLimit = page && page > 0 ? limit : limit + 1;
    const results = await prisma.memberCarePackage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page && page > 0 ? (page - 1) * limit : 0,
      take: effectiveLimit,
      include: {
        member: { select: { name: true } },
        employee: { select: { employeeName: true } },
        details: { include: { transactionLogs: true } },
      },
    });

    const actualFetchedCount = results.length;

    // Map results to the response shape
    let mapped = results.map((fp) => ({
      mcp_id: String(fp.id),
      package_name: fp.packageName,
      status: fp.status,
      balance: Number(fp.balance),
      package_remarks: fp.packageRemarks ?? '',
      member_name: fp.member?.name ?? '',
      employee_name: fp.employee?.employeeName ?? '',
      total_price: Number(fp.totalPrice),
      created_at: fp.createdAt.toISOString(),
      updated_at: fp.updatedAt.toISOString(),
      package_details: fp.details.map((mcpd) => ({
        id: String(mcpd.id),
        discount: Number(mcpd.discount),
        price: Number(mcpd.price),
        member_care_package_id: String(mcpd.memberCarePackageId),
        service_id: mcpd.serviceId != null ? String(mcpd.serviceId) : ('' as unknown as string),
        status: mcpd.status,
        quantity: mcpd.quantity,
      })),
      transaction_logs: fp.details
        .flatMap((d) => d.transactionLogs)
        .map((mcptl) => ({
          id: String(mcptl.id),
          type: mcptl.type,
          description: mcptl.description,
          transaction_date: mcptl.transactionDate.toISOString(),
          transaction_amount: Number(mcptl.transactionAmount),
          amount_changed: Number(mcptl.amountChanged),
          created_at: mcptl.createdAt.toISOString(),
          member_care_package_details_id: String(mcptl.memberCarePackageDetailsId),
          employee_id: String(mcptl.employeeId),
          service_id: mcptl.serviceId != null ? String(mcptl.serviceId) : ('' as unknown as string),
        })),
    }));

    // Pagination processing
    if (!page && before) {
      mapped = [...mapped].reverse().slice(0, limit);
    } else {
      mapped = mapped.slice(0, limit);
    }

    const hasNextPage = page && page > 0 ? page * limit < totalCount : actualFetchedCount > limit;
    const hasPreviousPage = page && page > 0 ? page > 1 : !!after || (before ? actualFetchedCount > limit : false);

    const { startCursor, endCursor } = generateCursors(mapped);

    return {
      data: mapped as any,
      pageInfo: {
        startCursor,
        endCursor,
        hasNextPage,
        hasPreviousPage,
        totalCount,
      },
    };
  } catch (error) {
    console.error('Error in CarePackageModel.getPaginatedMemberCarePackages:', error);
    throw new Error('Could not retrieve paginated care packages.');
  }
};

function buildFilterConditions(
  searchTerm: string | undefined,
  start_date_utc: string | null | undefined,
  end_date_utc: string | null | undefined,
): {
  filterWhereClause: string;
  filterParams: any[];
  paramCounter: number;
} {
  const filterConditions: string[] = [];
  const filterParams: any[] = [];
  let paramCounter = 1;

  if (searchTerm) {
    filterConditions.push(
      `(mcp.package_name ILIKE $${paramCounter} OR 
        mcp.package_remarks ILIKE $${paramCounter} OR 
        m.name ILIKE $${paramCounter} OR 
        e.employee_name ILIKE $${paramCounter})`,
    );
    filterParams.push(`%${searchTerm}%`);
    paramCounter++;
  }

  if (start_date_utc) {
    filterConditions.push(`mcp.created_at >= $${paramCounter}`);
    filterParams.push(start_date_utc);
    paramCounter++;
  }

  if (end_date_utc) {
    filterConditions.push(`mcp.created_at <= $${paramCounter}`);
    filterParams.push(end_date_utc);
    paramCounter++;
  }

  const filterWhereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';

  return { filterWhereClause, filterParams, paramCounter };
}

async function getTotalCount(client: PoolClient, filterWhereClause: string, filterParams: any[]): Promise<number> {
  const baseQuery = getBaseJoinQuery();

  const countQuery = `
    SELECT COUNT(*) 
    FROM (
      SELECT 1 
      ${baseQuery}
      ${filterWhereClause}
      GROUP BY mcp.id, m.name, e.employee_name
    ) AS count_subquery
  `;

  const { rows: countRows } = await client.query<{ count: string }>(countQuery, filterParams);
  return parseInt(countRows[0].count, 10);
}

function preparePaginationParams(
  filterWhereClause: string,
  filterParams: any[],
  paramCounter: number,
  limit: number,
  page: number | undefined,
  after: CursorPayload | null,
  before: CursorPayload | null,
): {
  finalWhereClause: string;
  cursorParams: any[];
  orderBy: string;
  effectiveLimit: number;
} {
  let finalWhereClause = filterWhereClause;
  let orderBy = 'ORDER BY mcp.created_at DESC, mcp.id DESC';
  let cursorParams = [...filterParams];
  let effectiveLimit = page && page > 0 ? limit : limit + 1;

  if (!page && (after || before)) {
    if (finalWhereClause) {
      finalWhereClause += ' AND ';
    } else {
      finalWhereClause = 'WHERE ';
    }

    if (after) {
      finalWhereClause += `(mcp.created_at > $${paramCounter} OR (mcp.created_at = $${paramCounter} AND mcp.id > $${
        paramCounter + 1
      }))`;
      cursorParams.push(after.createdAt, after.id);
    } else if (before) {
      finalWhereClause += `(mcp.created_at < $${paramCounter} OR (mcp.created_at = $${paramCounter} AND mcp.id < $${
        paramCounter + 1
      }))`;
      cursorParams.push(before.createdAt, before.id);
      orderBy = 'ORDER BY mcp.created_at DESC, mcp.id DESC';
    }
  }

  return { finalWhereClause, cursorParams, orderBy, effectiveLimit };
}

function buildDataQuery(
  finalWhereClause: string,
  orderBy: string,
  page: number | undefined,
  limit: number,
  effectiveLimit: number,
): string {
  const baseQuery = getBaseJoinQuery();
  const selectFields = getSelectFields();

  // Use a CTE for more efficient query execution
  return `
    WITH filtered_packages AS (
      SELECT 
        mcp.id,
        mcp.package_name,
        mcp.package_remarks,
        mcp.created_at,
        mcp.updated_at,
        mcp.total_price,
        mcp.balance,
        mcp.status,
        m.name AS member_name,
        e.employee_name
      ${baseQuery}
      ${finalWhereClause}
      GROUP BY mcp.id, m.name, e.employee_name
      ${orderBy}
      ${page && page > 0 ? `OFFSET ${(page - 1) * limit}` : ''}
      LIMIT ${effectiveLimit}
    )
    SELECT 
      fp.id AS mcp_id,
      fp.package_name,
      fp.status,
      fp.balance,
      fp.package_remarks,
      fp.member_name,
      fp.employee_name,
      fp.total_price,
      fp.created_at,
      fp.updated_at,
      ${selectFields}
    FROM filtered_packages fp
  `;
}

function processPaginationResults(
  rawResults: any[],
  before: CursorPayload | null,
  after: CursorPayload | null,
  page: number | undefined,
  limit: number,
  totalCount: number,
  actualFetchedCount: number,
): {
  memberCarePackages: any[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
} {
  // Process results based on pagination type
  let memberCarePackages = before && !page ? [...rawResults].reverse().slice(0, limit) : rawResults.slice(0, limit);

  let hasNextPage = false;
  let hasPreviousPage = false;

  if (page && page > 0) {
    // Offset-based pagination
    hasNextPage = page * limit < totalCount;
    hasPreviousPage = page > 1;
  } else if (before) {
    // "Before" cursor pagination
    hasNextPage = memberCarePackages.length > 0;
    hasPreviousPage = actualFetchedCount > limit;
  } else if (after) {
    // "After" cursor pagination
    hasNextPage = actualFetchedCount > limit;
    hasPreviousPage = true;
  } else {
    // Initial load (no cursor)
    hasNextPage = actualFetchedCount > limit;
    hasPreviousPage = false;
  }

  return { memberCarePackages, hasNextPage, hasPreviousPage };
}

function generateCursors(memberCarePackages: any[]): {
  startCursor: string | null;
  endCursor: string | null;
} {
  let startCursor = null;
  let endCursor = null;

  if (memberCarePackages.length > 0) {
    const firstItem = memberCarePackages[0];
    const lastItem = memberCarePackages[memberCarePackages.length - 1];

    startCursor = encodeCursor(new Date(firstItem.created_at), String(firstItem.mcp_id));
    endCursor = encodeCursor(new Date(lastItem.created_at), String(lastItem.mcp_id));
  }

  return { startCursor, endCursor };
}

function getBaseJoinQuery(): string {
  return `
    FROM member_care_packages mcp
    LEFT JOIN employees e ON mcp.member_id = e.id
    LEFT JOIN members m ON mcp.member_id = m.id
  `;
}

function getSelectFields(): string {
  return `
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', mcpd.id,
            'discount', mcpd.discount,
            'price', mcpd.price,
            'member_care_package_id', mcpd.member_care_package_id,
            'service_id', mcpd.service_id,
            'status', mcpd.status,
            'quantity', mcpd.quantity
          ) ORDER BY mcpd.id ASC
        )
        FROM member_care_package_details mcpd
        WHERE mcpd.member_care_package_id = fp.id
      ),
      '[]'::json
    ) AS package_details,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', mcptl.id,
            'type', mcptl.type,
            'description', mcptl.description,
            'transaction_date', mcptl.transaction_date,
            'transaction_amount', mcptl.transaction_amount,
            'amount_changed', mcptl.amount_changed,
            'created_at', mcptl.created_at,
            'member_care_package_details_id', mcptl.member_care_package_details_id,
            'employee_id', mcptl.employee_id,
            'service_id', mcptl.service_id
          ) ORDER BY mcptl.created_at ASC
        )
        FROM member_care_package_details mcpd2
        JOIN member_care_package_transaction_logs mcptl
          ON mcpd2.id = mcptl.member_care_package_details_id
        WHERE mcpd2.member_care_package_id = fp.id
      ),
      '[]'::json
    ) AS transaction_logs
  `;
}

interface FullMemberCarePackage {
  package: MemberCarePackages;
  details: MemberCarePackagesDetails[];
  transactionLogs: MemberCarePackageTransactionLogs[];
}

const getMemberCarePackageById = async (id: string): Promise<FullMemberCarePackage | null> => {
  try {
    const prisma = getPrisma();
    const pkg = await prisma.memberCarePackage.findUnique({
      where: { id: BigInt(id) },
      include: {
        details: {
          include: { transactionLogs: true },
        },
      },
    });

    if (!pkg) return null;

    const packageMapped: MemberCarePackages = {
      id: String(pkg.id),
      member_id: String(pkg.memberId),
      employee_id: String(pkg.employeeId),
      package_name: pkg.packageName,
      status: pkg.status as 'ENABLED' | 'DISABLED',
      total_price: Number(pkg.totalPrice),
      balance: Number(pkg.balance),
      created_at: pkg.createdAt.toISOString(),
      updated_at: pkg.updatedAt.toISOString(),
      package_remarks: pkg.packageRemarks ?? '',
    };

    const detailsMapped: MemberCarePackagesDetails[] = pkg.details.map((d) => ({
      id: String(d.id),
      service_name: d.serviceName,
      discount: Number(d.discount),
      price: Number(d.price),
      member_care_package_id: String(d.memberCarePackageId),
      service_id: d.serviceId != null ? String(d.serviceId) : ('' as unknown as string),
      status: d.status as 'ENABLED' | 'DISABLED',
      quantity: d.quantity,
    }));

    const transactionLogsMapped: MemberCarePackageTransactionLogs[] = pkg.details
      .flatMap((d) => d.transactionLogs)
      .map((log) => ({
        id: String(log.id),
        type: log.type as 'PURCHASE' | 'CONSUMPTION',
        description: log.description,
        transaction_date: log.transactionDate.toISOString(),
        transaction_amount: Number(log.transactionAmount),
        amount_changed: Number(log.amountChanged),
        member_care_package_details_id: String(log.memberCarePackageDetailsId),
        employee_id: String(log.employeeId),
        service_id: log.serviceId != null ? String(log.serviceId) : ('' as unknown as string),
        created_at: log.createdAt.toISOString(),
      }));

    return {
      package: packageMapped,
      details: detailsMapped,
      transactionLogs: transactionLogsMapped,
    };
  } catch (error) {
    console.error('Error getting member care package by id:', error);
    throw new Error('Error getting member care package by id');
  }
};

const getMemberCarePackagesForDropdown = async (memberId: string) => {
  try {
    const prisma = getPrisma();
    const rows = await prisma.memberCarePackage.findMany({
      where: { status: 'ENABLED', memberId: BigInt(memberId) },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true, packageName: true, balance: true, member: { select: { name: true } } },
    });

    return rows.map((r) => ({
      id: String(r.id),
      package_name: r.packageName,
      balance: Number(r.balance),
      member_name: r.member?.name ?? '',
    }));
  } catch (error) {
    console.error('Error in mcpModel.getMemberCarePackagesForDropdown', error);
    throw new Error('Could not retrieve all mcp for dropdown');
  }
};

interface servicePayload {
  id: string | number | null;
  name: string;
  quantity: number;
  price: number;
  finalPrice: number;
  discount: number;
}

const toBigIntId = (value: string, fieldName: string): bigint => {
  if (typeof value !== 'string' || value.trim() === '' || !/^\d+$/.test(value)) {
    throw new ValidationError(`${fieldName} must be a numeric string.`);
  }
  return BigInt(value);
};

const createMemberCarePackage = async (
  package_name: string,
  member_id: string,
  employee_id: string,
  package_remarks: string,
  package_price: number,
  services: servicePayload[],
  created_at: string,
  updated_at: string,
) => {
  const prisma = getPrisma();

  try {
    const memberIdBigInt = toBigIntId(member_id, 'member_id');
    const employeeIdBigInt = toBigIntId(employee_id, 'employee_id');

    // Validate foreign keys
    const [memberExists, employeeExists] = await Promise.all([
      prisma.member.findUnique({ where: { id: memberIdBigInt }, select: { id: true } }),
      prisma.employee.findUnique({ where: { id: employeeIdBigInt }, select: { id: true } }),
    ]);

    if (!memberExists) {
      throw new ValidationError(`Invalid member_id: ${member_id} does not exist.`);
    }
    if (!employeeExists) {
      throw new ValidationError(`Invalid employee_id: ${employee_id} does not exist.`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const newPkg = await tx.memberCarePackage.create({
        data: {
          memberId: memberIdBigInt,
          employeeId: employeeIdBigInt,
          packageName: package_name,
          packageRemarks: package_remarks || null,
          status: 'ENABLED',
          totalPrice: package_price,
          balance: 0,
          createdAt: new Date(created_at),
          updatedAt: new Date(updated_at),
        },
        select: { id: true },
      });

      for (const service of services) {
        let serviceIdBigInt: bigint | null = null;
        if (service.id !== null && service.id !== undefined && service.id !== '') {
          if (typeof service.id === 'number') {
            if (!Number.isInteger(service.id)) {
              throw new ValidationError('service.id must be an integer.');
            }
            serviceIdBigInt = BigInt(service.id);
          } else {
            const serviceIdStr = String(service.id);
            if (!/^\d+$/.test(serviceIdStr)) {
              throw new ValidationError('service.id must be a numeric string.');
            }
            serviceIdBigInt = BigInt(serviceIdStr);
          }
        }
        const detail = await tx.memberCarePackageDetail.create({
          data: {
            serviceName: service.name,
            discount: service.discount,
            price: service.price,
            memberCarePackageId: newPkg.id,
            serviceId: serviceIdBigInt,
            status: 'ENABLED',
            quantity: service.quantity,
          },
          select: { id: true },
        });

        await tx.memberCarePackageTransactionLog.create({
          data: {
            type: 'PURCHASE',
            description: service.name,
            transactionDate: new Date(created_at),
            transactionAmount: service.finalPrice * service.quantity,
            amountChanged: service.finalPrice * service.quantity,
            memberCarePackageDetailsId: detail.id,
            employeeId: employeeIdBigInt,
            serviceId: serviceIdBigInt,
            createdAt: new Date(created_at),
          },
        });
      }

      return { memberCarePackageId: String(newPkg.id) };
    });

    return result;
  } catch (error) {
    console.error('Error creating member care package:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while creating the member care package.');
  }
};

const updateMemberCarePackage = async (
  id: string,
  package_name: string,
  package_remarks: string,
  package_price: number,
  package_balance: number,
  services: servicePayload[],
  status: 'ENABLED' | 'DISABLED',
  employee_id: string,
  updated_at: string,
) => {
  const prisma = getPrisma();
  try {
    if (!id) {
      throw new Error('Payload must include an id for the member care package to update.');
    }

    // Check employee_id
    if (!employee_id) {
      throw new Error('Employee Id not found');
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.memberCarePackage.findUnique({ where: { id: BigInt(id) } });
      if (!existing) {
        throw new Error(`Member care package with id ${id} not found for update.`);
      }

      // Check if updatable: ensure no CONSUMPTION logs exist
      const consumptionCount = await tx.memberCarePackageTransactionLog.count({
        where: {
          type: 'CONSUMPTION',
          memberCarePackageDetail: { memberCarePackageId: BigInt(id) },
        },
      });
      if (consumptionCount > 0) {
        throw new Error('Member Care Package not updatable');
      }

      // Remove existing details
      await tx.memberCarePackageDetail.deleteMany({ where: { memberCarePackageId: BigInt(id) } });

      // Update package
      const updatedPkg = await tx.memberCarePackage.update({
        where: { id: BigInt(id) },
        data: {
          employeeId: BigInt(employee_id),
          packageName: package_name,
          packageRemarks: package_remarks || null,
          totalPrice: package_price,
          balance: package_balance,
          status,
          updatedAt: new Date(updated_at),
        },
      });

      // Recreate details and logs
      for (const service of services) {
        // Calculate finalPrice from price and discount
        const finalPrice = service.price * service.discount;

        const detail = await tx.memberCarePackageDetail.create({
          data: {
            serviceName: service.name,
            discount: service.discount,
            price: service.price,
            memberCarePackageId: BigInt(id),
            serviceId: service.id ? BigInt(service.id) : null,
            status,
            quantity: service.quantity,
          },
          select: { id: true },
        });

        await tx.memberCarePackageTransactionLog.create({
          data: {
            type: 'PURCHASE',
            description: service.name,
            transactionDate: existing.createdAt,
            transactionAmount: finalPrice * service.quantity,
            amountChanged: finalPrice * service.quantity,
            memberCarePackageDetailsId: detail.id,
            employeeId: BigInt(employee_id),
            serviceId: service.id ? BigInt(service.id) : null,
            createdAt: new Date(updated_at),
          },
        });
      }

      return 1;
    });

    return result;
  } catch (error) {
    console.error('Error updating member care package:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while updating the member care package.');
  }
};

/**
 * Permanent Deletion
 * @param {string} id
 */
const deleteMemberCarePackage = async (id: string) => {
  try {
    const prisma = getPrisma();
    const result = await prisma.memberCarePackage.delete({ where: { id: BigInt(id) } });
    return result;
  } catch (error) {
    console.error('Error deleting member care package:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while deleting the member care package.');
  }
};

/**
 * Soft Delete (status changed to DISABLED)
 * @param {string} id
 */
const removeMemberCarePackage = async (id: string) => {
  try {
    const prisma = getPrisma();

    const exists = await prisma.memberCarePackage.findUnique({ where: { id: BigInt(id) }, select: { id: true } });
    if (!exists) {
      throw new Error(`Member care package with id ${id} not found for remove.`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const mcp = await tx.memberCarePackage.update({
        where: { id: BigInt(id) },
        data: { status: 'DISABLED', updatedAt: new Date() },
      });
      const mcpd = await tx.memberCarePackageDetail.updateMany({
        where: { memberCarePackageId: BigInt(id) },
        data: { status: 'DISABLED' },
      });
      return { mcp, mcpd };
    });

    return result;
  } catch (error) {
    console.error('Error removing member care package:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while removing the member care package.');
  }
};

interface mcpConsumptionDetails {
  mcpd_id: string;
  mcpd_quantity: number;
  mcpd_date: string;
}

const createConsumption = async (mcp_id: string, mcp_details: mcpConsumptionDetails[], employee_id: string) => {
  const prisma = getPrisma();
  try {
    const results = await prisma.$transaction(async (tx) => {
      const mcp = await tx.memberCarePackage.findUnique({
        where: { id: BigInt(mcp_id) },
        include: { details: true },
      });

      if (!mcp) {
        throw new Error(`Member care package with id ${mcp_id} not found for updating status.`);
      }

      let currentBalance = Number(mcp.balance);
      if (currentBalance === 0) {
        throw new Error(`Member care package with id ${mcp_id} has a zero balance. No services left to consume.`);
      }

      if (!employee_id) {
        throw new Error(`Member care package with id ${mcp_id} has no employee id`);
      }

      const resultTracker: { completed: string[]; failed: string[] } = { completed: [], failed: [] };

      for (const d of mcp_details) {
        const detail = await tx.memberCarePackageDetail.findUnique({ where: { id: BigInt(d.mcpd_id) } });
        if (!detail || detail.memberCarePackageId !== mcp.id) {
          console.error(`[CONSUMPTION_ERROR] MemberCarePackagesDetails not found or mismatched for id: ${d.mcpd_id}`);
          throw new Error(`Cannot process consumption: Detail record ${d.mcpd_id} not found.`);
        }

        const baseLog = await tx.memberCarePackageTransactionLog.findFirst({
          where: {
            memberCarePackageDetailsId: BigInt(d.mcpd_id),
            transactionDate: mcp.createdAt,
          },
          orderBy: { createdAt: 'asc' },
        });

        const price = Number(detail.price) * Number(detail.discount);
        let runningAmount = Number(baseLog?.transactionAmount ?? 0);

        for (let i = 0; i < d.mcpd_quantity; i++) {
          if (price > currentBalance) {
            resultTracker.failed.push(d.mcpd_id);
            break;
          }

          currentBalance -= price;
          runningAmount -= price;

          await tx.memberCarePackageTransactionLog.create({
            data: {
              type: 'CONSUMPTION',
              description: baseLog?.description ?? detail.serviceName ?? '',
              transactionDate: new Date(d.mcpd_date),
              transactionAmount: runningAmount,
              amountChanged: -price,
              memberCarePackageDetailsId: BigInt(d.mcpd_id),
              employeeId: BigInt(employee_id),
              serviceId: detail.serviceId,
              createdAt: new Date(d.mcpd_date),
            },
          });

          resultTracker.completed.push(d.mcpd_id);
        }
      }

      await tx.memberCarePackage.update({
        where: { id: BigInt(mcp_id) },
        data: { balance: currentBalance, updatedAt: new Date() },
      });

      return resultTracker;
    });

    return results;
  } catch (error) {
    console.error('Error creating member care package consumption:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while creating the member care package consumption.');
  }
};

interface mcpServiceStatusPayload {
  id: string;
  status_name: 'ENABLED' | 'DISABLED';
}

const updateMemberCarePackageStatus = async (
  id: string,
  payload: mcpServiceStatusPayload[],
  desiredStatus?: 'ENABLED' | 'DISABLED',
) => {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const mcpData = await tx.memberCarePackage.findUnique({
        where: { id: BigInt(id) },
        include: { details: true },
      });
      if (!mcpData) {
        throw new Error(`Member care package with id ${id} not found for updating status.`);
      }

      const existingServiceIds = new Set(mcpData.details.map((d) => String(d.id)));
      for (const service of payload) {
        if (!existingServiceIds.has(service.id)) {
          throw new Error(`Service with id ${service.id} does not belong to member care package ${id}.`);
        }
        await tx.memberCarePackageDetail.update({
          where: { id: BigInt(service.id) },
          data: { status: service.status_name },
        });
      }

      const allServices = await tx.memberCarePackageDetail.findMany({
        where: { memberCarePackageId: BigInt(id) },
        select: { status: true },
      });
      let finalPackageStatus: 'ENABLED' | 'DISABLED';
      if (allServices.length === 0) {
        finalPackageStatus = desiredStatus ?? 'ENABLED';
      } else {
        const allServicesDisabled = allServices.every((s) => s.status === 'DISABLED');
        finalPackageStatus = allServicesDisabled ? 'DISABLED' : 'ENABLED';
      }

      const updatedMcp = await tx.memberCarePackage.update({
        where: { id: BigInt(id) },
        data: { status: finalPackageStatus, updatedAt: new Date() },
      });

      return { updatedMcp };
    });

    return result;
  } catch (error) {
    console.error('Error changing member care package status:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while changing the member care package status.');
  }
};

const checkMcpUpdatable = async (id: string) => {
  try {
    const prisma = getPrisma();
    const consumptionCount = await prisma.memberCarePackageTransactionLog.count({
      where: {
        type: 'CONSUMPTION',
        memberCarePackageDetail: { memberCarePackageId: BigInt(id) },
      },
    });
    return consumptionCount === 0;
  } catch (error) {
    console.error('Error checking member care package updateable', error);
    throw new Error('Error checking member care package updateable');
  }
};

const transferMemberCarePackage = async (mcp_id1: string, mcp_id2: string, amount: number) => {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const sourceMcp = await tx.memberCarePackage.findUnique({ where: { id: BigInt(mcp_id1) } });
      const destinationMcp = await tx.memberCarePackage.findUnique({ where: { id: BigInt(mcp_id2) } });

      if (!sourceMcp) {
        throw new Error(`Source package with ID ${mcp_id1} not found.`);
      }
      if (!destinationMcp) {
        throw new Error(`Destination package with ID ${mcp_id2} not found.`);
      }

      if (Number(sourceMcp.balance) < amount) {
        throw new Error(
          `Insufficient balance in source package ${sourceMcp.packageName}. Available: $${Number(
            sourceMcp.balance,
          )}, trying to transfer: $${amount}.`,
        );
      }

      if (Number(sourceMcp.balance) === amount) {
        await tx.memberCarePackageDetail.updateMany({
          where: { memberCarePackageId: BigInt(mcp_id1) },
          data: { status: 'DISABLED' },
        });
      }

      if (Number(destinationMcp.balance) === 0 && amount > 0) {
        await tx.memberCarePackageDetail.updateMany({
          where: { memberCarePackageId: BigInt(mcp_id2) },
          data: { status: 'ENABLED' },
        });
      }

      await tx.memberCarePackage.update({
        where: { id: BigInt(mcp_id1) },
        data: { balance: Number(sourceMcp.balance) - amount, updatedAt: new Date() },
      });
      await tx.memberCarePackage.update({
        where: { id: BigInt(mcp_id2) },
        data: { balance: Number(destinationMcp.balance) + amount, updatedAt: new Date() },
      });

      return { success: true, message: 'Transfer completed successfully.' };
    });

    return result;
  } catch (error) {
    console.error('Error transfering member care package:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while transfering the member care package.');
  }
};

const revertMemberCarePackageTransfer = async (mcp_id1: string, mcp_id2: string, isNew: boolean, amount: number) => {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const sourceMcp = await tx.memberCarePackage.findUnique({ where: { id: BigInt(mcp_id1) } });
      if (!sourceMcp) {
        throw new Error(`Source package with ID ${mcp_id1} not found for revert operation.`);
      }

      const updatedSource = await tx.memberCarePackage.update({
        where: { id: BigInt(mcp_id1) },
        data: { balance: Number(sourceMcp.balance) + amount, updatedAt: sourceMcp.updatedAt },
        select: { balance: true },
      });

      if (isNew) {
        await tx.memberCarePackage.delete({ where: { id: BigInt(mcp_id2) } });
      } else {
        const distMcp = await tx.memberCarePackage.findUnique({ where: { id: BigInt(mcp_id2) } });
        if (!distMcp) {
          throw new Error(`Destination package with ID ${mcp_id2} not found for revert operation.`);
        }
        await tx.memberCarePackage.update({
          where: { id: BigInt(mcp_id2) },
          data: { balance: Number(distMcp.balance) - amount, updatedAt: distMcp.updatedAt },
        });

        const destAfter = await tx.memberCarePackage.findUnique({
          where: { id: BigInt(mcp_id2) },
          select: { balance: true },
        });

        if (Number(destAfter?.balance ?? 0) <= 0) {
          await tx.memberCarePackageDetail.updateMany({
            where: { memberCarePackageId: BigInt(mcp_id2) },
            data: { status: 'DISABLED' },
          });
        }
      }

      return {
        success: true,
        message: 'Transfer reverted successfully',
        sourceBalance: Number(updatedSource.balance),
      };
    });

    return result;
  } catch (error) {
    console.error('Error reverting member care package transfer:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while reverting the member care package transfer.');
  }
};

interface emulatePayload {
  id?: string;
  package_name: string;
  member_id: string;
  employee_id?: string;
  user_id?: string;
  package_remarks: string;
  package_price: number;
  services: servicePayload[];
  status: 'ENABLED' | 'DISABLED';
  created_at: string;
  updated_at: string;
}

const emulateMemberCarePackage = async (method: string, payload: Partial<emulatePayload>) => {
  async function em_post(payload: emulatePayload) {
    try {
      const prisma = getPrisma();
      const mcp = await prisma.memberCarePackage.findMany({ orderBy: { id: 'desc' }, take: 1 });
      const lastMcp = mcp[0];
      const lastMcpId = lastMcp && lastMcp.id ? Number(lastMcp.id) : 0;

      payload.employee_id = payload.employee_id;

      const newMcp: MemberCarePackages = {
        id: (lastMcpId + 1).toString(),
        member_id: payload.member_id,
        employee_id: payload.employee_id!,
        package_name: payload.package_name,
        package_remarks: payload.package_remarks,
        status: 'ENABLED',
        total_price: payload.package_price,
        balance: 0,
        created_at: payload.created_at || new Date().toISOString(),
        updated_at: payload.updated_at || new Date().toISOString(),
      };

      let oldMcpd: MemberCarePackagesDetails[] = [];
      let oldMcptl: MemberCarePackageTransactionLogs[] = [];
      const newMcpd: MemberCarePackagesDetails[] = [];
      const newMcptl: MemberCarePackageTransactionLogs[] = [];

      if (payload.services && payload.services.length > 0) {
        const prisma = getPrisma();
        const mcpd = await prisma.memberCarePackageDetail.findMany({ orderBy: { id: 'desc' }, take: 1 });
        oldMcpd = mcpd.map((d) => ({
          id: String(d.id),
          member_care_package_id: String(d.memberCarePackageId),
          service_id: d.serviceId != null ? String(d.serviceId) : ('' as unknown as string),
          service_name: d.serviceName,
          status: d.status as 'ENABLED' | 'DISABLED',
          quantity: d.quantity,
          discount: Number(d.discount),
          price: Number(d.price),
        }));
        const lastMcpDetailsId = mcpd[0] && mcpd[0].id ? Number(mcpd[0].id) : 0;

        const mcptl = await prisma.memberCarePackageTransactionLog.findMany({ orderBy: { id: 'desc' }, take: 1 });
        oldMcptl = mcptl.map((l) => ({
          id: String(l.id),
          type: l.type as 'PURCHASE' | 'CONSUMPTION',
          description: l.description,
          transaction_date: l.transactionDate.toISOString(),
          transaction_amount: Number(l.transactionAmount),
          amount_changed: Number(l.amountChanged),
          employee_id: String(l.employeeId),
          member_care_package_details_id: String(l.memberCarePackageDetailsId),
          service_id: l.serviceId != null ? String(l.serviceId) : ('' as unknown as string),
          created_at: l.createdAt.toISOString(),
        }));
        const lastMcptlId = mcptl[0] && mcptl[0].id ? Number(mcptl[0].id) : 0;

        payload.services.forEach((service, idx) => {
          newMcpd.push({
            id: (lastMcpDetailsId + idx + 1).toString(),
            member_care_package_id: newMcp.id!,
            service_id: service.id != null ? String(service.id) : ('' as unknown as string),
            service_name: service.name,
            status: 'ENABLED',
            quantity: service.quantity,
            discount: service.discount,
            price: service.price,
          });

          newMcptl.push({
            id: (lastMcptlId + idx + 1).toString(),
            type: 'PURCHASE',
            description: service.name,
            transaction_date: payload.created_at,
            transaction_amount: service.finalPrice * service.quantity,
            amount_changed: service.finalPrice * service.quantity,
            employee_id: payload.employee_id!,
            member_care_package_details_id: newMcp.id!,
            service_id: service.id != null ? String(service.id) : ('' as unknown as string),
            created_at: payload.created_at,
          });
        });
      }

      return {
        old: {
          member_care_packages: mcp,
          member_care_package_details: oldMcpd,
          member_care_package_transaction_logs: oldMcptl,
        },
        new: {
          member_care_packages: [newMcp],
          member_care_package_details: newMcpd,
          member_care_package_transaction_logs: newMcptl,
        },
      };
    } catch (error) {
      console.error('Error emulating member create care package:', error);
      if (error instanceof Error) {
        throw new Error(`Error emulating member create care package: ${error.message}`);
      }
      throw new Error('An unknown error occurred while emulating member create care package');
    }
  }

  async function em_put(payload: emulatePayload) {
    try {
      if (!payload.id) {
        throw new Error('Payload must include an id for the member care package to update.');
      }
      const prisma = getPrisma();
      const oldMcpDb = await prisma.memberCarePackage.findUnique({ where: { id: BigInt(payload.id) } });
      if (!oldMcpDb) {
        throw new Error(`Member care package with id ${payload.id} not found for update.`);
      }
      const isUpdatable = await checkMcpUpdatable(String(oldMcpDb.id));

      if (!isUpdatable) {
        throw new Error(`Member care package with id ${payload.id} not updatable`);
      }

      const oldMcpdDb = await prisma.memberCarePackageDetail.findMany({ where: { memberCarePackageId: oldMcpDb.id } });
      const oldMcpd = oldMcpdDb.map((d) => ({
        id: String(d.id),
        member_care_package_id: String(d.memberCarePackageId),
        service_id: d.serviceId != null ? String(d.serviceId) : ('' as unknown as string),
        service_name: d.serviceName,
        status: d.status as 'ENABLED' | 'DISABLED',
        quantity: d.quantity,
        discount: Number(d.discount),
        price: Number(d.price),
      }));
      const oldMcptlDb = await prisma.memberCarePackageTransactionLog.findMany({
        where: { memberCarePackageDetailsId: oldMcpdDb[0]?.id ?? BigInt(0) },
      });
      const oldMcptl = oldMcptlDb.map((l) => ({
        id: String(l.id),
        type: l.type as 'PURCHASE' | 'CONSUMPTION',
        description: l.description,
        transaction_date: l.transactionDate.toISOString(),
        transaction_amount: Number(l.transactionAmount),
        amount_changed: Number(l.amountChanged),
        employee_id: String(l.employeeId),
        member_care_package_details_id: String(l.memberCarePackageDetailsId),
        service_id: l.serviceId != null ? String(l.serviceId) : ('' as unknown as string),
        created_at: l.createdAt.toISOString(),
      }));

      payload.employee_id = payload.employee_id;

      const mcpMapping: FieldMapping<emulatePayload, MemberCarePackages>[] = [
        { payloadKey: 'package_name', dbKey: 'package_name' },
        { payloadKey: 'package_remarks', dbKey: 'package_remarks' },
        { payloadKey: 'member_id', dbKey: 'member_id' },
        { payloadKey: 'employee_id', dbKey: 'employee_id' },
        { payloadKey: 'status', dbKey: 'status' },
        { payloadKey: 'package_price', dbKey: 'total_price' },
        { payloadKey: 'created_at', dbKey: 'created_at' },
      ];

      const updatedMcpFields: Partial<MemberCarePackages> = {};
      mcpMapping.forEach((m) => {
        if (m.payloadKey in payload) {
          const payloadValue = payload[m.payloadKey as keyof emulatePayload];
          const existingValue = (oldMcpDb as any)[m.dbKey as keyof MemberCarePackages];
          const processedPayloadValue = m.transform ? m.transform(payloadValue) : payloadValue;

          if (processedPayloadValue !== undefined && processedPayloadValue !== existingValue) {
            (updatedMcpFields as any)[m.dbKey] = processedPayloadValue;
          }
        }
      });

      const newMcp: Partial<MemberCarePackages> = {
        ...updatedMcpFields,
        updated_at: payload.updated_at || new Date().toISOString(),
      };

      const newMcpd: Partial<MemberCarePackagesDetails>[] = [];
      const newMcptl: Partial<MemberCarePackageTransactionLogs>[] = [];

      (payload.services || []).forEach((servicePayload) => {
        const tempMcpd = {
          id: oldMcpd[0].id,
          member_care_package_id: String(oldMcpDb.id!),
          service_id: servicePayload.id != null ? String(servicePayload.id) : ('' as unknown as string),
          service_name: servicePayload.name,
          quantity: servicePayload.quantity,
          discount: servicePayload.discount,
          price: servicePayload.finalPrice,
          status: oldMcpDb.status as 'ENABLED' | 'DISABLED',
        };
        newMcpd.push(tempMcpd);

        // New Logs
        newMcptl.push({
          id: oldMcptl[0].id,
          type: 'PURCHASE',
          description: tempMcpd.service_name,
          transaction_date: oldMcptl[0].transaction_date,
          transaction_amount: servicePayload.finalPrice * servicePayload.quantity,
          amount_changed: servicePayload.finalPrice * servicePayload.quantity,
          member_care_package_details_id: tempMcpd.id,
          employee_id: payload.employee_id,
          service_id: servicePayload.id != null ? String(servicePayload.id) : ('' as unknown as string),
          created_at: payload.updated_at,
        });
      });

      return {
        old: {
          member_care_packages: [
            {
              id: String(oldMcpDb.id),
              member_id: String(oldMcpDb.memberId),
              employee_id: String(oldMcpDb.employeeId),
              package_name: oldMcpDb.packageName,
              status: oldMcpDb.status as 'ENABLED' | 'DISABLED',
              total_price: Number(oldMcpDb.totalPrice),
              balance: Number(oldMcpDb.balance),
              created_at: oldMcpDb.createdAt.toISOString(),
              updated_at: oldMcpDb.updatedAt.toISOString(),
              package_remarks: oldMcpDb.packageRemarks ?? '',
            },
          ],
          member_care_package_details: oldMcpd,
          member_care_package_transaction_logs: oldMcptl,
        },
        new: {
          member_care_packages: [newMcp],
          member_care_package_details: newMcpd,
          member_care_package_transaction_logs: newMcptl,
        },
      };
    } catch (error) {
      console.error('Error emulating update member care package:', error);
      if (error instanceof Error) {
        throw new Error(`Error emulating update member care package: ${error.message}`);
      }
      throw new Error('An unknown error occurred while emulating update member care package');
    }
  }

  async function em_delete(payload: emulatePayload) {
    try {
      if (!payload.id) {
        throw new Error('Payload must include an id for the care package to delete.');
      }
      const prisma = getPrisma();
      const mcpDb = await prisma.memberCarePackage.findUnique({
        where: { id: BigInt(payload.id) },
        select: { id: true },
      });
      if (!mcpDb) {
        throw new Error(`Member care package with id ${payload.id} not found for deletion.`);
      }
      const mcpdDb = await prisma.memberCarePackageDetail.findMany({
        where: { memberCarePackageId: mcpDb.id },
        select: { id: true },
      });
      const firstDetailId = mcpdDb[0]?.id ?? BigInt(0);
      const mcptlDb = await prisma.memberCarePackageTransactionLog.findMany({
        where: { memberCarePackageDetailsId: firstDetailId },
        select: { id: true },
      });
      const mcp = [{ id: String(mcpDb.id) } as MemberCarePackages];
      const mcpd = mcpdDb.map((d) => ({ id: String(d.id) }) as MemberCarePackagesDetails);
      const mcptl = mcptlDb.map((l) => ({ id: String(l.id) }) as MemberCarePackageTransactionLogs);

      return {
        old: {
          member_care_packages: mcp,
          member_care_package_details: mcpd,
          member_care_package_transaction_logs: mcptl,
        },
        new: {
          member_care_packages: [],
          member_care_package_details: [],
          member_care_package_transaction_logs: [],
        },
      };
    } catch (error) {
      console.error('Error emulating delete member care package:', error);
      if (error instanceof Error) {
        throw new Error(`Error emulating delete member care package: ${error.message}`);
      }
      throw new Error('An unknown error occurred while emulating delete member care package');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const handlers: { [key: string]: Function } = {
    POST: em_post,
    PUT: em_put,
    DELETE: em_delete,
  };

  const upperMethod = method.toUpperCase();
  const handler = handlers[upperMethod];

  if (!handler) {
    throw new Error(`Unsupported method: ${method}`);
  }

  if (upperMethod === 'POST') {
    if (
      !payload.package_name ||
      !payload.package_remarks ||
      payload.package_price === undefined ||
      !payload.services ||
      !payload.member_id ||
      !payload.created_at ||
      !payload.updated_at
    ) {
      throw new Error('Missing required fields in payload for POST emulation.');
    }
    return em_post(payload as emulatePayload);
  } else if (upperMethod === 'PUT') {
    if (
      !payload.id ||
      !payload.package_name ||
      !payload.package_remarks ||
      payload.package_price === undefined ||
      !payload.services ||
      !payload.status ||
      !payload.updated_at
    ) {
      throw new Error('Missing required fields in payload for PUT emulation.');
    }
    return em_put(payload as emulatePayload);
  } else if (upperMethod === 'DELETE') {
    if (!payload.id) {
      throw new Error("Missing 'id' in payload for DELETE emulation.");
    }
    return em_delete(payload as emulatePayload);
  } else {
    throw new Error(`Handler dispatch error for method: ${method}`);
  }
};

export default {
  getPaginatedMemberCarePackages,
  getMemberCarePackageById,
  getMemberCarePackagesForDropdown,
  createMemberCarePackage,
  updateMemberCarePackage,
  removeMemberCarePackage,
  deleteMemberCarePackage,
  createConsumption,
  updateMemberCarePackageStatus,
  checkMcpUpdatable,
  transferMemberCarePackage,
  revertMemberCarePackageTransfer,
  emulateMemberCarePackage,
};
