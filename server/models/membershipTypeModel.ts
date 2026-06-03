import { MembershipType, NewMembershipType, UpdatedMembershipType } from '../types/model.types.js';
import { getPrisma } from '../lib/prisma.js';

const getMembershipType = async (): Promise<{ success: boolean; data: MembershipType[] | []; message: string }> => {
  try {
    const prisma = getPrisma();

    const membershipTypes = await prisma.membershipType.findMany({
      orderBy: {
        id: 'asc',
      },
    });

    if (membershipTypes.length > 0) {
      // Map to expected format with snake_case
      const mappedData = membershipTypes.map((mt) => ({
        id: Number(mt.id),
        membership_type_name: mt.membershipTypeName,
        default_percentage_discount_for_products: mt.defaultPercentageDiscountForProducts
          ? Number(mt.defaultPercentageDiscountForProducts)
          : 0,
        default_percentage_discount_for_services: mt.defaultPercentageDiscountForServices
          ? Number(mt.defaultPercentageDiscountForServices)
          : 0,
        created_at: mt.createdAt || new Date(),
        updated_at: mt.updatedAt || new Date(),
        created_by: Number(mt.createdBy),
        last_updated_by: Number(mt.lastUpdatedBy),
      }));

      return {
        success: true,
        data: mappedData as MembershipType[],
        message: 'The membership types have been retrieved successfully.',
      };
    } else {
      return { success: false, data: [], message: 'No membership types found.' };
    }
  } catch (error) {
    console.error('Error fetching membership types:', error);

    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return user-friendly message but also throw for critical errors
    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }

    return { success: false, data: [], message: 'Failed to fetch membership types due to database error.' };
  }
};

const addMembershipType = async (data: NewMembershipType): Promise<{ success: boolean; message: string }> => {
  const {
    membership_type_name,
    default_percentage_discount_for_products,
    default_percentage_discount_for_services,
    created_by,
  } = data;

  const last_updated_by = created_by;
  const created_at = new Date();
  const updated_at = created_at;

  try {
    const prisma = getPrisma();

    await prisma.membershipType.create({
      data: {
        membershipTypeName: membership_type_name,
        defaultPercentageDiscountForProducts: default_percentage_discount_for_products,
        defaultPercentageDiscountForServices: default_percentage_discount_for_services,
        createdAt: created_at,
        updatedAt: updated_at,
        createdBy: BigInt(created_by),
        lastUpdatedBy: BigInt(last_updated_by),
      },
    });

    return { success: true, message: 'The new Membership Type has been created.' };
  } catch (error) {
    console.error('Error creating membership types:', error);

    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return user-friendly message but also throw for critical errors
    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }

    return { success: false, message: 'Failed to create membership type due to database error.' };
  }
};

const setMembershipType = async (data: UpdatedMembershipType): Promise<{ success: boolean; message: string }> => {
  const {
    id,
    membership_type_name,
    default_percentage_discount_for_products,
    default_percentage_discount_for_services,
    created_by,
    last_updated_by,
  } = data;

  const updated_at = new Date();

  try {
    const prisma = getPrisma();

    const result = await prisma.membershipType.update({
      where: {
        id: BigInt(id),
      },
      data: {
        membershipTypeName: membership_type_name,
        defaultPercentageDiscountForProducts: default_percentage_discount_for_products,
        defaultPercentageDiscountForServices: default_percentage_discount_for_services,
        updatedAt: updated_at,
        createdBy: BigInt(created_by),
        lastUpdatedBy: BigInt(last_updated_by),
      },
    });

    if (result) {
      return { success: true, message: 'The Membership Type has been updated.' };
    } else {
      return { success: false, message: 'Failed to update membership type - no rows affected.' };
    }
  } catch (error) {
    console.error('Error updating membership types:', error);

    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return user-friendly message but also throw for critical errors
    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }

    return { success: false, message: 'Failed to update membership type due to database error.' };
  }
};

const deleteMembershipType = async (id: number): Promise<{ success: boolean; message: string }> => {
  try {
    const prisma = getPrisma();

    await prisma.membershipType.delete({
      where: {
        id: BigInt(id),
      },
    });

    return { success: true, message: 'The Membership Type has been deleted.' };
  } catch (error) {
    console.error('Error deleting membership types:', error);

    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return user-friendly message but also throw for critical errors
    if (error instanceof Error && error.message.includes('connection')) {
      throw new Error('Database connection failed. Please try again later.');
    }

    return { success: false, message: 'Failed to delete membership type due to database error.' };
  }
};

export default {
  getMembershipType,
  addMembershipType,
  setMembershipType,
  deleteMembershipType,
};
