 
import { prisma } from '../lib/prisma.js';
import { NewUserData, UserWithRole } from '../types/model.types.js';

// Helper function to get or create a status (replaces the SQL function)
async function getOrCreateStatus(statusName: string, tx?: any): Promise<bigint> {
  try {
    const prismaClient = tx || prisma;
    
    // Try to find existing status
    const existingStatus = await prismaClient.status.findFirst({
      where: { statusName }
    });

    if (existingStatus) {
      return existingStatus.id;
    }

    // Create new status if not found
    const newStatus = await prismaClient.status.create({
      data: {
        statusName,
        statusDescription: `Auto created status for ${statusName}`,
        createdAt: new Date()
      }
    });

    return newStatus.id;
  } catch (error) {
    console.error('Error getting or creating status:', error);
    throw new Error('Error getting or creating status');
  }
}
import { CursorPayload, PaginatedOptions, PaginatedReturn } from '../types/common.types.js';
import { encodeCursor } from '../utils/cursorUtils.js';
import validator from 'validator';

const createSuperUser = async (email: string, password_hash: string) => {
  try {
    // Create super admin user using Prisma
    await prisma.$executeRaw`CALL create_temp_su(${email}, ${password_hash})`;
    return { success: true, message: 'Super user created successfully' };
  } catch (error) {
    console.error('Error creating super user:', error);
    throw new Error('Error creating super user');
  }
};

const getUserCount = async () => {
  try {
    const count = await prisma.userAuth.count();
    return count;
  } catch (error) {
    console.error('Error getting user count:', error);
    throw new Error('Error getting user count');
  }
};

/**
 * !! USE THIS FUNCTION ONLY FOR AUTHENTICATION !!
 * This func uses productive DB to fetch login data
 * @param email
 * @returns
 */
const getAuthUser = async (identity: string) => {
  try {
    const user = await prisma.userAuth.findFirst({
      where: {
        OR: [
          { email: identity },
          { users: { some: { username: identity } } }
        ]
      },
  include: {
    users: {
      select: {
        username: true
      }
    },
    userToRoles: {
      include: {
        role: {
          select: {
            roleName: true
          }
        }
      }
    }
  }
    });

    if (!user) {
      return null;
    }

    // Format the result to match the original structure
  const formattedUser = {
    id: user.id.toString(),
    email: user.email || '',
    password: user.password,
    role_name: user.userToRoles[0]?.role.roleName.toLowerCase().replace(' ', '_'),
    username: user.users?.[0]?.username
  };

    return formattedUser;
  } catch (error) {
    console.error('Error fetching user data', error);
    throw new Error('Error fetching user data');
  }
};

const getUserData = async (identity: string) => {
  try {
    const user = await prisma.userAuth.findFirst({
      where: {
        OR: [
          { email: identity },
          { users: { some: { username: identity } } }
        ]
      },
      include: {
        users: {
          select: {
            username: true
          }
        },
        userToRoles: {
          include: {
            role: {
              select: {
                roleName: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return null;
    }

    // Format the result to match the original structure
  const formattedUser = {
    id: user.id.toString(),
    email: user.email || '',
    password: user.password,
    role_name: user.userToRoles[0]?.role.roleName.toLowerCase().replace(' ', '_'),
    username: user.users?.[0]?.username
  };

    return formattedUser;
  } catch (error) {
    console.error('Error fetching user data', error);
    throw new Error('Error fetching user data');
  }
};

const updateUserTimestamp = async (email: string) => {
  try {
    const result = await prisma.user.updateMany({
      where: { email },
      data: { updatedAt: new Date() }
    });
    return result.count > 0;
  } catch (error) {
    console.error('Error updating user timestamp:', error);
    return false;
  }
};

const updateUserPassword = async (email: string, password_hash: string, isInvite: boolean = false) => {
  try {
    const updatedAuth = await prisma.userAuth.update({
      where: { email },
      data: { 
        password: password_hash,
        updatedAt: new Date()
      }
    });

    if (isInvite) {
      await prisma.user.updateMany({
        where: { email },
        data: { 
          verifiedStatusId: await getOrCreateStatus('VERIFIED'),
          updatedAt: new Date()
        }
      });
    }

    return updatedAuth;
  } catch (error) {
    console.error('Error updating user password:', error);
    throw new Error('Error updating user password');
  }
};

const checkUserEmailExists = async (email: string) => {
  try {
    const user = await prisma.user.findFirst({
      where: { email }
    });
    return user !== null;
  } catch (error) {
    throw error;
  }
};

const checkUsernameExists = async (username: string) => {
  const user = await prisma.user.findFirst({
    where: { username }
  });
  return user !== null;
};



const createUserModel = async (data: NewUserData) => {
  try {
    // Use Prisma transaction for atomic operations
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Create user auth
      const userAuth = await tx.userAuth.create({
        data: {
          email: data.email,
          password: data.password_hash,
          createdAt: data.created_at || new Date(),
          updatedAt: data.updated_at || new Date(),
        }
      });

      // Step 2: Find or create role
      let role = await tx.role.findFirst({
        where: { roleName: data.role_name }
      });

      if (!role) {
        role = await tx.role.create({
          data: {
            roleName: data.role_name,
            description: `Auto created role for ${data.role_name}`,
            createdAt: new Date()
          }
        });
      }

      // Step 3: Create user to role relationship
      await tx.userToRole.create({
        data: {
          userAuthId: userAuth.id,
          roleId: role.id,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Step 4: Create user
      const user = await tx.user.create({
        data: {
          username: data.username,
          email: data.email,
          userAuthId: userAuth.id,
          createdAt: data.created_at || new Date(),
          updatedAt: data.updated_at || new Date(),
          verifiedStatusId: await getOrCreateStatus('UNVERIFIED', tx)
        }
      });

      return { userId: user.id.toString() };
    });

    return result;
  } catch (error) {
    console.error('Error creating user with auth:', error);
    throw new Error('Failed to create user with auth');
  }
};

const updateUserModel = async (userId: string, data: Partial<NewUserData>) => {
  try {
    let emailChanged = false;
    let newEmail = '';

    // Use Prisma transaction for atomic operations
    const result = await prisma.$transaction(async (tx) => {
      // Get user and user auth information
      const user = await tx.user.findUnique({
        where: { id: BigInt(userId) },
        include: {
          userAuth: true
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const currentEmail = user.email;

      // Validate and check email uniqueness
      if (data.email && data.email !== currentEmail) {
        if (!validator.isEmail(data.email)) {
          throw new Error('Invalid email format');
        }

        const duplicateUser = await tx.user.findFirst({
          where: {
            email: data.email,
            NOT: { id: BigInt(userId) }
          }
        });

        if (duplicateUser) {
          throw new Error('Email is already in use by another user');
        }

        emailChanged = true;
        newEmail = data.email;
      }

      // Update user auth if email changed
      if (data.email) {
        await tx.userAuth.update({
          where: { id: user.userAuthId },
          data: {
            email: data.email,
            updatedAt: new Date()
          }
        });
      }

      // Prepare user update data
      const userUpdateData: any = {
        updatedAt: new Date()
      };

      if (data.username) {
        userUpdateData.username = data.username;
      }
      if (data.email) {
        userUpdateData.email = data.email;
      }
      if (data.preferredLanguage !== undefined) {
        userUpdateData.preferredLanguage = data.preferredLanguage;
      }
      if (emailChanged) {
        userUpdateData.verifiedStatusId = await getOrCreateStatus('UNVERIFIED', tx);
      }

      // Update user
      await tx.user.update({
        where: { id: BigInt(userId) },
        data: userUpdateData
      });

      // Role update
      if (data.role_name) {
        // Find the role
        let role = await tx.role.findFirst({
          where: { roleName: data.role_name }
        });

        if (!role) {
          throw new Error(`Role '${data.role_name}' does not exist`);
        }

        // Delete existing user roles
        await tx.userToRole.deleteMany({
          where: { userAuthId: user.userAuthId }
        });

        // Create new user role relationship
        await tx.userToRole.create({
          data: {
            userAuthId: user.userAuthId,
            roleId: role.id,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
      }

      return {
        success: true,
        emailChanged,
        newEmail,
      };
    });

    return result;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};


const deleteUserModel = async (userId: string) => {
  try {
    // Use Prisma transaction for atomic operations
    const result = await prisma.$transaction(async (tx) => {
      // Get user, user auth, and role information
      const user = await tx.user.findUnique({
        where: { id: BigInt(userId) },
        include: {
          userAuth: {
            include: {
              userToRoles: {
                include: {
                  role: true
                }
              }
            }
          }
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const userAuthId = user.userAuthId;
      const roleName = user.userAuth.userToRoles[0]?.role.roleName;

      // Check if this is the only user in the system
      const userCount = await tx.userAuth.count();

      if (userCount <= 1) {
        throw new Error('Cannot delete the only user in the system');
      }

      // Check if this is a super admin deletion
      if (roleName && roleName.toLowerCase() === 'super admin') {
        // Count super admins to make sure we're not deleting the last one
        const superAdminCount = await tx.userToRole.count({
          where: {
            role: {
              roleName: 'Super Admin'
            }
          }
        });

        if (superAdminCount <= 1) {
          // Find the next eligible user to promote (most recently created, non-super admin)
          const nextUser = await tx.user.findFirst({
            where: {
              id: { not: BigInt(userId) },
              userAuth: {
                userToRoles: {
                  none: {
                    role: {
                      roleName: 'Super Admin'
                    }
                  }
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          });

          if (!nextUser) {
            throw new Error('Cannot delete the only user in the system');
          }

          // Delete existing roles for the next user
          await tx.userToRole.deleteMany({
            where: { userAuthId: nextUser.userAuthId }
          });

          // Find or create Super Admin role
          let superAdminRole = await tx.role.findFirst({
            where: { roleName: 'Super Admin' }
          });

          if (!superAdminRole) {
            superAdminRole = await tx.role.create({
              data: {
                roleName: 'Super Admin',
                description: 'Auto created Super Admin role',
                createdAt: new Date()
              }
            });
          }

          // Promote this user to super admin
          await tx.userToRole.create({
            data: {
              userAuthId: nextUser.userAuthId,
              roleId: superAdminRole.id,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });

          console.log(`Promoted user with auth ID ${nextUser.userAuthId} to Super Admin role`);
        }
      }

      // Remove role links for this user to satisfy FK constraints
      await tx.userToRole.deleteMany({
        where: { userAuthId }
      });

      // Delete the user (cascade will handle related records)
      await tx.userAuth.delete({
        where: { id: userAuthId }
      });

      return { success: true };
    });

    return result;
  } catch (error) {
    console.error('Error deleting user:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete user');
  }
};

const getUserById = async (userId: string) => {
  try {
  const user = await prisma.user.findUnique({
    where: { id: BigInt(userId) },
    include: {
      userAuth: {
        include: {
          userToRoles: {
            include: {
              role: true
            }
          }
        }
      }
    }
  });

    if (!user) {
      return null;
    }

  return {
    id: user.id.toString(),
    username: user.username,
    email: user.email,
    preferredLanguage: (user as any).preferredLanguage || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    verifiedStatusId: user.verifiedStatusId,
    userAuthId: user.userAuthId,
    roleName: user.userAuth.userToRoles[0]?.role.roleName,
    role_name: user.userAuth.userToRoles[0]?.role.roleName,
    roleId: user.userAuth.userToRoles[0]?.role.id.toString(),
    employee_name: user.username,
    is_active: true,
    email_verified: true,
    status: 'active',
    all_roles: [user.userAuth.userToRoles[0]?.role.roleName].filter(Boolean)
  };
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw new Error('Failed to get user by ID');
  }
};


const getPaginatedUsers = async (limit: number, options: any = {}) => {
  try {
    const { page = 1, search = '', after, before } = options;
    let offset = 0;
    let effectiveLimit = limit;
    let orderBy: any = { createdAt: 'desc' };

    // Handle cursor-based pagination
    if (after || before) {
      effectiveLimit = limit + 1; // Fetch one extra to determine hasNextPage
      
      if (after) {
        // Fetch records created before the cursor
        orderBy = { createdAt: 'desc' };
      } else if (before) {
        // Fetch records created after the cursor (reverse order)
        orderBy = { createdAt: 'asc' };
      }
    } else if (page > 1) {
      // Offset-based pagination
      offset = (page - 1) * limit;
    }

    // Build where conditions for search
    const whereConditions: any = {};
    if (search) {
      whereConditions.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Add cursor conditions
    if (after) {
      whereConditions.createdAt = { lt: new Date(after.createdAt) };
    } else if (before) {
      whereConditions.createdAt = { gt: new Date(before.createdAt) };
    }

    // Get users with pagination and search
  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where: whereConditions,
      include: {
        userAuth: {
          include: {
            userToRoles: {
              include: {
                role: true
              }
            }
          }
        },
        verifiedStatus: true
      },
      orderBy: orderBy,
      take: effectiveLimit,
      skip: offset
    }),
    prisma.user.count({
      where: whereConditions
    })
  ]);

    // Format the response
  const formattedUsers = users.map(user => {
    const rawStatus = user.verifiedStatus?.statusName;
    const statusLabel = rawStatus === 'VERIFIED' || rawStatus === 'ACTIVE'
      ? 'Active'
      : rawStatus === 'UNVERIFIED'
      ? 'Pending'
      : rawStatus || undefined;

    return {
      id: user.id.toString(),
      username: user.username,
      email: user.email,
      createdAt: user.createdAt?.toISOString?.() ?? new Date(user.createdAt).toISOString(),
      updatedAt: user.updatedAt?.toISOString?.() ?? new Date(user.updatedAt).toISOString(),
      created_at: user.createdAt?.toISOString?.() ?? new Date(user.createdAt).toISOString(),
      updated_at: user.updatedAt?.toISOString?.() ?? new Date(user.updatedAt).toISOString(),
      role_name: user.userAuth.userToRoles[0]?.role.roleName,
      roleName: user.userAuth.userToRoles[0]?.role.roleName, // Keep both for compatibility
      status: statusLabel,
      is_active: statusLabel === 'Active'
    };
  });

    // Handle cursor-based pagination results
    let hasNextPage = false;
    let hasPreviousPage = false;
    let startCursor = null;
    let endCursor = null;

    if (after || before) {
      hasNextPage = users.length > limit;
      hasPreviousPage = true; // Since we're using cursor, we always have previous
      
      if (users.length > limit) {
        // Remove the extra item we fetched
        if (before) {
          formattedUsers.shift(); // Remove first item (oldest)
        } else {
          formattedUsers.pop(); // Remove last item (newest)
        }
      }
      
      if (formattedUsers.length > 0) {
        startCursor = {
          createdAt: formattedUsers[0].createdAt,
          id: formattedUsers[0].id
        };
        endCursor = {
          createdAt: formattedUsers[formattedUsers.length - 1].createdAt,
          id: formattedUsers[formattedUsers.length - 1].id
        };
      }
    } else {
      // Offset-based pagination
      hasNextPage = page * limit < totalCount;
      hasPreviousPage = page > 1;
    }

    return {
      users: formattedUsers,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      hasNextPage,
      hasPreviousPage,
      startCursor,
      endCursor
    };
  } catch (error) {
    console.error('Error fetching paginated users:', error);
    throw new Error('Error fetching paginated users');
  }
};





export default {
  createSuperUser,
  getUserCount,
  getAuthUser,
  getUserData,
  updateUserTimestamp,
  updateUserPassword,
  checkUserEmailExists,
  createUserModel,
  updateUserModel,
  deleteUserModel,
  getUserById,
  getPaginatedUsers,
  checkUsernameExists
};
