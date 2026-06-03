import { prisma } from '../lib/prisma.js';

const getUserRoles = async (userId: string) => {
  try {
    // Try treating userId as Users.id first
    const user = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { userAuthId: true },
    });

    let userAuthId: bigint | null = null;
    if (user && user.userAuthId) {
      userAuthId = user.userAuthId;
    } else {
      // Fallback: treat provided id as UserAuth.id (some login flows store auth id in session)
      const auth = await prisma.userAuth.findUnique({
        where: { id: BigInt(userId) },
        select: { id: true },
      });
      if (auth) {
        userAuthId = auth.id;
      } else {
        throw new Error('User not found');
      }
    }

    const userRoles = await prisma.userToRole.findMany({
      where: { userAuthId },
      include: { role: true },
    });

    return userRoles.map((ur) => ur.role.roleName.toLowerCase().replace(/\s+/g, '_'));
  } catch (error) {
    console.error('Error fetching user roles:', error);
    throw new Error('Error fetching user roles');
  }
};

const getAllRoles = async () => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: {
        roleName: 'asc',
      },
    });

    return roles.map((role) => ({
      id: role.id.toString(),
      role_name: role.roleName,
      description: role.description || '', // Convert null to empty string
    }));
  } catch (error) {
    console.error('Error fetching all roles:', error);
    throw new Error('Error fetching all roles');
  }
};

const createRole = async (roleName: string, description?: string) => {
  try {
    const role = await prisma.role.create({
      data: {
        roleName,
        description: description ?? '',
        createdAt: new Date(),
      },
    });

    return {
      id: role.id.toString(),
      role_name: role.roleName,
      description: role.description || '',
    };
  } catch (error) {
    console.error('Error creating role:', error);
    throw new Error('Error creating role');
  }
};

const updateRole = async (roleId: string, roleName?: string, description?: string) => {
  try {
    const updateData: any = {};

    if (roleName) updateData.roleName = roleName;
    if (description !== undefined) updateData.description = description ?? '';

    const role = await prisma.role.update({
      where: { id: BigInt(roleId) },
      data: updateData,
    });

    return {
      id: role.id.toString(),
      role_name: role.roleName,
      description: role.description || '',
    };
  } catch (error) {
    console.error('Error updating role:', error);
    throw new Error('Error updating role');
  }
};

const deleteRole = async (roleId: string) => {
  try {
    // Check if any users have this role
    const usersWithRole = await prisma.userToRole.count({
      where: { roleId: BigInt(roleId) },
    });

    if (usersWithRole > 0) {
      throw new Error('Cannot delete role that is assigned to users');
    }

    await prisma.role.delete({
      where: { id: BigInt(roleId) },
    });

    return { message: 'Role deleted successfully' };
  } catch (error) {
    console.error('Error deleting role:', error);
    if (error instanceof Error && error.message.includes('Cannot delete role')) {
      throw error;
    }
    throw new Error('Error deleting role');
  }
};

export default {
  getUserRoles,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
};
