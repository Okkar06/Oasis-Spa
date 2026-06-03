import { prisma } from '../lib/prisma.js';
import { CreateMemberInput, UpdateMemberInput } from '../types/member.types.js';
import { getMemberOutstandingAmounts } from '../services/paymentService.js';
import { getLastVisitedDatesForMembers } from '../services/getLastVisitedDatesForMember.js';
import { format } from 'date-fns';
import { Prisma } from '@prisma/client';

const getAllMembers = async (
  offset: number,
  limit: number,
  startDate_utc?: string,
  endDate_utc?: string,
  createdBy?: string,
  search?: string,
  sessionStartDate_utc?: string, // simulation constraint
  sessionEndDate_utc?: string
) => {
  try {
    const andConditions: Prisma.MemberWhereInput[] = [
      {
        createdAt: {
          gte: sessionStartDate_utc ? new Date(sessionStartDate_utc) : new Date('0001-01-01T00:00:00Z'),
          lte: sessionEndDate_utc ? new Date(sessionEndDate_utc) : new Date('9999-12-31T23:59:59Z'),
        },
      },
    ];

    if (startDate_utc && endDate_utc) {
      andConditions.push({
        createdAt: {
          gte: new Date(startDate_utc),
          lte: new Date(endDate_utc),
        },
      });
    }

    if (createdBy) {
      const employees = await prisma.employee.findMany({
        where: {
          employeeName: {
            contains: createdBy,
            mode: 'insensitive',
          },
        },
        select: { id: true },
      });

      const empIds = employees.map((emp) => emp.id);

      if (empIds.length > 0) {
        andConditions.push({
          createdBy: {
            in: empIds,
          },
        });
      } else {
        return { members: [], totalPages: 0, totalCount: 0 };
      }
    }

    if (search) {
      andConditions.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { contact: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.MemberWhereInput = {
      AND: andConditions,
    };

    const [members, totalCount] = await Promise.all([
      prisma.member.findMany({
        where,
        include: {
          membershipType: {
            select: {
              membershipTypeName: true,
            },
          },
          createdByEmployee: {
            select: {
              employeeName: true,
            },
          },
        },
        orderBy: { id: 'asc' },
        skip: offset,
        take: limit,
      }),
      prisma.member.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    // Get outstanding balances
    const outstandingMap = await getMemberOutstandingAmounts();
    const lastVisitedMap = await getLastVisitedDatesForMembers();

    const enrichedMembers = members.map((member) => ({
      ...member,
      id: Number(member.id),
      membership_type_name: member.membershipType?.membershipTypeName || null,
      created_by_name: member.createdByEmployee?.employeeName || null,
      total_amount_owed: outstandingMap[Number(member.id)] || 0,
      last_visit_date: lastVisitedMap[Number(member.id)]
        ? format(new Date(lastVisitedMap[Number(member.id)]), 'dd MMM yyyy, hh:mm a')
        : null,
      created_at: member.createdAt ? format(new Date(member.createdAt), 'dd MMM yyyy, hh:mm a') : null,
      updated_at: member.updatedAt ? format(new Date(member.updatedAt), 'dd MMM yyyy, hh:mm a') : null,
      dob: member.dob ? format(new Date(member.dob), 'dd MMM yyyy') : null,
    }));

    return {
      members: enrichedMembers,
      totalPages,
      totalCount,
    };
  } catch (error) {
    console.error('Error fetching members:', error);
    throw new Error('Error fetching members');
  }
};

const createMember = async ({
  name,
  email,
  contact,
  dob,
  sex,
  remarks,
  address,
  nric,
  membership_type_id,
  card_number,
  created_at,
  updated_at,
  created_by,
  role_name = 'member',
}: CreateMemberInput & { role_name?: string }) => {
  try {
    // Validation: Check if email already exists
    if (email) {
      const existingMember = await prisma.member.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingMember) {
        throw new Error('Email already exists');
      }
    }

    // Create member
    const newMember = await prisma.member.create({
      data: {
        name,
        email,
        contact,
        dob: dob ? new Date(dob) : null,
        sex,
        remarks,
        address,
        nric,
        membershipTypeId: membership_type_id ? BigInt(membership_type_id) : null,
        cardNumber: card_number,
        createdAt: created_at ? new Date(created_at) : new Date(),
        updatedAt: updated_at ? new Date(updated_at) : new Date(),
        createdBy: created_by ? BigInt(created_by) : null,
      },
    });

    return {
      member: {
        ...newMember,
        id: Number(newMember.id),
        membership_type_id: newMember.membershipTypeId ? Number(newMember.membershipTypeId) : null,
        created_by: newMember.createdBy ? Number(newMember.createdBy) : null,
      },
    };
  } catch (error) {
    console.error('Error creating member:', error);
    throw error;
  }
};

const updateMember = async ({
  id,
  name,
  email,
  contact,
  dob,
  sex,
  remarks,
  address,
  nric,
  membership_type_id,
  card_number,
  updated_at,
}: UpdateMemberInput) => {
  try {
    const updatedMember = await prisma.member.update({
      where: { id: BigInt(id) },
      data: {
        name,
        email,
        contact,
        dob: dob ? new Date(dob) : null,
        sex,
        remarks,
        address,
        nric,
        membershipTypeId: membership_type_id ? BigInt(membership_type_id) : null,
        cardNumber: card_number,
        updatedAt: updated_at ? new Date(updated_at) : new Date(),
      },
    });

    return {
      ...updatedMember,
      id: Number(updatedMember.id),
      membership_type_id: updatedMember.membershipTypeId ? Number(updatedMember.membershipTypeId) : null,
      card_number: updatedMember.cardNumber,
      created_by: updatedMember.createdBy ? Number(updatedMember.createdBy) : null,
      created_at: updatedMember.createdAt,
      updated_at: updatedMember.updatedAt,
    };
  } catch (error) {
    console.error('Error updating member:', error);
    throw error;
  }
};

const deleteMember = async (memberId: number) => {
  try {
    // Check for existing sale transactions
    const transactionCount = await prisma.saleTransaction.count({
      where: { memberId: BigInt(memberId) },
    });

    if (transactionCount > 0) {
      throw new Error(`Cannot delete member: ${transactionCount} sale transaction(s) exist for this member`);
    }

    // Delete member
    await prisma.member.delete({
      where: { id: BigInt(memberId) },
    });

    return { success: true };
  } catch (error) {
    console.error('Error deleting member:', error);

    // Re-throw the error with original message if it's our custom validation error
    if (error instanceof Error && error.message.includes('Cannot delete member:')) {
      throw error;
    }

    throw new Error('Could not delete member');
  }
};

const getMemberById = async (id: number, sessionStartDate_utc?: string, sessionEndDate_utc?: string) => {
  try {
    const sessionStart = sessionStartDate_utc ? new Date(sessionStartDate_utc) : new Date('0001-01-01T00:00:00Z');
    const sessionEnd = sessionEndDate_utc ? new Date(sessionEndDate_utc) : new Date('9999-12-31T23:59:59Z');

    const member = await prisma.member.findFirst({
      where: {
        id: BigInt(id),
        createdAt: {
          gte: sessionStart,
          lte: sessionEnd,
        },
      },
      include: {
        membershipType: {
          select: {
            membershipTypeName: true,
          },
        },
        createdByEmployee: {
          select: {
            employeeName: true,
          },
        },
      },
    });

    if (!member) {
      throw new Error('Member not found');
    }

    // Fetch last visited dates map and pick for current member
    const lastVisitedMap = await getLastVisitedDatesForMembers();
    const lastVisitedDate = lastVisitedMap[Number(id)] || null;

    return {
      ...member,
      id: Number(member.id),
      membership_type_id: member.membershipTypeId ? Number(member.membershipTypeId) : null,
      membership_type_name: member.membershipType?.membershipTypeName || null,
      created_by: member.createdBy ? Number(member.createdBy) : null,
      created_by_name: member.createdByEmployee?.employeeName || null,
      card_number: member.cardNumber,
      created_at: member.createdAt ?? null,
      updated_at: member.updatedAt ?? null,
      dob: member.dob ?? null,
      last_visit_date: lastVisitedDate ?? null,
    };
  } catch (error) {
    console.error('Error fetching member by ID:', error);
    throw new Error('Error fetching member by ID');
  }
};

const searchMemberByNameOrPhone = async (
  searchTerm: string,
  sessionStartDate_utc?: string,
  sessionEndDate_utc?: string
) => {
  try {
    const sessionStart = sessionStartDate_utc ? new Date(sessionStartDate_utc) : new Date('0001-01-01T00:00:00Z');
    const sessionEnd = sessionEndDate_utc ? new Date(sessionEndDate_utc) : new Date('9999-12-31T23:59:59Z');

    const members = await prisma.member.findMany({
      where: {
        AND: [
          {
            createdAt: {
              gte: sessionStart,
              lte: sessionEnd,
            },
          },
          {
            OR: [
              { name: { contains: searchTerm, mode: 'insensitive' } },
              { contact: { contains: searchTerm, mode: 'insensitive' } },
              { cardNumber: { contains: searchTerm, mode: 'insensitive' } },
            ],
          },
        ],
      },
      include: {
        membershipType: {
          select: {
            membershipTypeName: true,
          },
        },
        createdByEmployee: {
          select: {
            employeeName: true,
          },
        },
        memberVouchers: {
          where: { status: 'is_enabled' },
          select: { id: true },
        },
        memberCarePackages: {
          where: { status: 'ENABLED' },
          select: { id: true },
        },
      },
    });

    // Get enrichment maps
    const outstandingMap = await getMemberOutstandingAmounts();
    const lastVisitedMap = await getLastVisitedDatesForMembers();

    // Format & enrich each member
    const enrichedMembers = members.map((member) => ({
      ...member,
      id: Number(member.id),
      membership_type_id: member.membershipTypeId ? Number(member.membershipTypeId) : null,
      membership_type_name: member.membershipType?.membershipTypeName || null,
      created_by: member.createdBy ? Number(member.createdBy) : null,
      created_by_name: member.createdByEmployee?.employeeName || null,
      card_number: member.cardNumber,
      voucher_count: member.memberVouchers.length,
      member_care_package_count: member.memberCarePackages.length,
      total_amount_owed: outstandingMap[Number(member.id)] || 0,
      last_visit_date: lastVisitedMap[Number(member.id)]
        ? format(new Date(lastVisitedMap[Number(member.id)]), 'dd MMM yyyy, hh:mm a')
        : null,
      created_at: member.createdAt ? format(new Date(member.createdAt), 'dd MMM yyyy, hh:mm a') : null,
      updated_at: member.updatedAt ? format(new Date(member.updatedAt), 'dd MMM yyyy, hh:mm a') : null,
      dob: member.dob ? format(new Date(member.dob), 'dd MMM yyyy') : null,
    }));

    return {
      members: enrichedMembers,
    };
  } catch (error) {
    console.error('Error searching member by name or phone:', error);
    throw new Error('Error searching member by name or phone');
  }
};

const getMemberVouchers = async (
  memberId: number,
  offset: number,
  limit: number,
  searchTerm?: string,
  sessionStartDate_utc?: string, // simulation constraint
  sessionEndDate_utc?: string
) => {
  try {
    const sessionStart = sessionStartDate_utc ? new Date(sessionStartDate_utc) : new Date('0001-01-01T00:00:00Z');
    const sessionEnd = sessionEndDate_utc ? new Date(sessionEndDate_utc) : new Date('9999-12-31T23:59:59Z');

    const where: any = {
      memberId: BigInt(memberId),
      status: 'is_enabled',
      createdAt: { gte: sessionStart, lte: sessionEnd },
    };
    if (searchTerm && searchTerm.trim() !== '') {
      where.memberVoucherName = { contains: searchTerm.trim(), mode: 'insensitive' };
    }

    const [totalCount, rows] = await Promise.all([
      prisma.memberVoucher.count({ where }),
      prisma.memberVoucher.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const vouchersWithBalance = await Promise.all(
      rows.map(async (mv) => {
        const lastItem = await prisma.saleTransactionItem.findFirst({
          where: {
            memberVoucherId: mv.id,
            saleTransaction: {
              createdAt: { gte: sessionStart, lte: sessionEnd },
            },
          },
          include: { saleTransaction: { select: { outstandingTotalPaymentAmount: true } } },
          orderBy: { saleTransactionId: 'desc' },
        });

        const outstanding = Number(lastItem?.saleTransaction?.outstandingTotalPaymentAmount || 0);
        const currentBalance = Number(mv.currentBalance || 0);
        const current_paid_balance = outstanding > 0 ? currentBalance - outstanding : currentBalance;

        return {
          id: Number(mv.id),
          member_voucher_name: mv.memberVoucherName,
          voucher_template_id: mv.voucherTemplateId != null ? Number(mv.voucherTemplateId) : null,
          member_id: mv.memberId != null ? Number(mv.memberId) : null,
          current_balance: currentBalance,
          starting_balance: Number(mv.startingBalance || 0),
          free_of_charge: Number(mv.freeOfCharge || 0),
          default_total_price: Number(mv.defaultTotalPrice || 0),
          status: mv.status,
          remarks: mv.remarks || null,
          created_by: mv.createdBy != null ? Number(mv.createdBy) : null,
          handled_by: mv.handledBy != null ? Number(mv.handledBy) : null,
          last_updated_by: mv.lastUpdatedBy != null ? Number(mv.lastUpdatedBy) : null,
          created_at: mv.createdAt,
          updated_at: mv.updatedAt,
          current_paid_balance,
        };
      })
    );

    const totalPages = Math.ceil(totalCount / Math.max(limit, 1)) || 1;
    return { vouchers: vouchersWithBalance, totalPages, totalCount };
  } catch (error) {
    console.error('Error fetching member vouchers:', error);
    throw new Error('Error fetching member vouchers');
  }
};
const getMemberCarePackages = async (
  memberId: number,
  offset: number,
  limit: number,
  searchTerm?: string,
  sessionStartDate_utc?: string,
  sessionEndDate_utc?: string
) => {
  try {
    const sessionStart = sessionStartDate_utc ? new Date(sessionStartDate_utc) : new Date('0001-01-01T00:00:00Z');
    const sessionEnd = sessionEndDate_utc ? new Date(sessionEndDate_utc) : new Date('9999-12-31T23:59:59Z');

    const where: any = {
      memberId: BigInt(memberId),
      status: 'ENABLED',
      createdAt: { gte: sessionStart, lte: sessionEnd },
    };
    if (searchTerm && searchTerm.trim() !== '') {
      where.packageName = { contains: searchTerm.trim(), mode: 'insensitive' };
    }

    const [totalCount, rows] = await Promise.all([
      prisma.memberCarePackage.count({ where }),
      prisma.memberCarePackage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const carePackages = rows.map((mcp) => ({
      id: Number(mcp.id),
      member_id: mcp.memberId != null ? Number(mcp.memberId) : null,
      employee_id: mcp.employeeId != null ? Number(mcp.employeeId) : null,
      package_name: mcp.packageName,
      status: mcp.status,
      total_price: Number(mcp.totalPrice || 0),
      balance: Number(mcp.balance || 0),
      created_at: mcp.createdAt,
      updated_at: mcp.updatedAt,
      package_remarks: mcp.packageRemarks || null,
    }));

    const totalPages = Math.ceil(totalCount / Math.max(limit, 1)) || 1;
    return { carePackages, totalPages, totalCount };
  } catch (error) {
    console.error('Error fetching member care packages:', error);
    throw new Error('Error fetching member care packages');
  }
};

const getAllMembersForDropdown = async () => {
  try {
    const members = await prisma.member.findMany({
      select: {
        id: true,
        name: true,
        contact: true,
        cardNumber: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return members.map((member) => ({
      id: Number(member.id),
      name: member.name,
      contact: member.contact,
      card_number: member.cardNumber,
    }));
  } catch (error) {
    console.error('Error fetching member list:', error);
    throw new Error('Error fetching member list');
  }
};

export default {
  getAllMembers,
  getMemberById,
  createMember,
  updateMember,
  deleteMember,
  searchMemberByNameOrPhone,
  getMemberVouchers,
  getMemberCarePackages,
  getAllMembersForDropdown,
};
