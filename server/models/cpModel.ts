
import { pool } from '../config/database.js';
import { CursorPayload, FieldMapping, PaginatedOptions, PaginatedReturn } from '../types/common.types.js';
import { CarePackageItemDetails, CarePackages, Employees } from '../types/model.types.js';
import { encodeCursor } from '../utils/cursorUtils.js';
import { getPrisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

const getPaginatedCarePackages = async (
    limit: number,
    options: PaginatedOptions = {},
    start_date_utc: string | undefined | null,
    end_date_utc: string | undefined | null
): Promise<PaginatedReturn<CarePackages>> => {
    const { searchTerm } = options;
    const after = options.after || null;
    const before = options.before || null;
    const page = options.page;

    try {
        const prisma = getPrisma();

        // Build filter conditions
        const whereClause = buildCpFilterConditions(searchTerm, start_date_utc, end_date_utc);

        // Get total count
        const totalCount = await prisma.carePackage.count({ where: whereClause });

        // Build cursor/pagination query
        let query: Prisma.CarePackageFindManyArgs = {
            where: whereClause,
            orderBy: { id: 'asc' },
        };

        // Handle cursor-based pagination
        if (!page && (after || before)) {
            if (after) {
                query.where = { ...query.where, id: { gt: BigInt(after.id) } };
                query.take = limit + 1;
            } else if (before) {
                query.where = { ...query.where, id: { lt: BigInt(before.id) } };
                query.take = limit + 1;
                query.orderBy = { id: 'desc' };
            }
        } else if (page && page > 0) {
            // Handle page-based pagination
            query.skip = (page - 1) * limit;
            query.take = limit;
        } else {
            // Default: first page
            query.take = limit + 1;
        }

        const rawResults = await prisma.carePackage.findMany(query);
        const actualFetchedCount = rawResults.length;

        // Process results
        let carePackages = rawResults;

        if (before && !page) {
            carePackages = carePackages.reverse().slice(0, limit);
        } else {
            carePackages = carePackages.slice(0, limit);
        }

        // Calculate pagination info
        let hasNextPage = false;
        let hasPreviousPage = false;

        if (page && page > 0) {
            hasNextPage = page * limit < totalCount;
            hasPreviousPage = page > 1;
        } else if (before) {
            hasNextPage = carePackages.length > 0;
            hasPreviousPage = actualFetchedCount > limit;
        } else if (after) {
            hasNextPage = actualFetchedCount > limit;
            hasPreviousPage = true;
        } else {
            hasNextPage = actualFetchedCount > limit;
            hasPreviousPage = false;
        }

        // Generate cursors
        let startCursor = null;
        let endCursor = null;

        if (carePackages.length > 0) {
            const firstItem = carePackages[0];
            const lastItem = carePackages[carePackages.length - 1];
            startCursor = encodeCursor(firstItem.createdAt, firstItem.id.toString());
            endCursor = encodeCursor(lastItem.createdAt, lastItem.id.toString());
        }

        // Map to expected format (snake_case)
        const mappedData = carePackages.map((cp) => ({
            id: cp.id.toString(),
            care_package_name: cp.carePackageName,
            care_package_remarks: cp.carePackageRemarks,
            care_package_price: Number(cp.carePackagePrice),
            care_package_customizable: cp.carePackageCustomizable,
            status: cp.status,
            created_by: cp.createdBy?.toString() || null,
            last_updated_by: cp.lastUpdatedBy?.toString() || null,
            created_at: cp.createdAt.toISOString(),
            updated_at: cp.updatedAt.toISOString(),
        })) as CarePackages[];

        return {
            data: mappedData,
            pageInfo: {
                startCursor,
                endCursor,
                hasNextPage,
                hasPreviousPage,
                totalCount,
            },
        };
    } catch (error) {
        console.error('Error in CarePackageModel.getPaginatedCarePackages:', error);
        throw new Error('Could not retrieve paginated care packages.');
    }
};

function buildCpFilterConditions(
    searchTerm: string | null | undefined,
    start_date_utc: string | null | undefined,
    end_date_utc: string | null | undefined
): Prisma.CarePackageWhereInput {
    const conditions: Prisma.CarePackageWhereInput = {};
    const andConditions: Prisma.CarePackageWhereInput[] = [];

    if (searchTerm) {
        andConditions.push({
            OR: [
                { carePackageName: { contains: searchTerm, mode: 'insensitive' } },
                { carePackageRemarks: { contains: searchTerm, mode: 'insensitive' } },
            ],
        });
    }

    if (start_date_utc) {
        andConditions.push({ createdAt: { gte: new Date(start_date_utc) } });
    }

    if (end_date_utc) {
        andConditions.push({ createdAt: { lte: new Date(end_date_utc) } });
    }

    if (andConditions.length > 0) {
        conditions.AND = andConditions;
    }

    return conditions;
}

// Old helper functions removed - replaced with Prisma-based pagination in getPaginatedCarePackages

const getCarePackagesForDropdown = async (): Promise<CarePackages[]> => {
    try {
        const prisma = getPrisma();

        const carePackages = await prisma.carePackage.findMany({
            where: {
                status: 'ENABLED',
            },
            select: {
                id: true,
                carePackageName: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        // Map to match expected format with snake_case
        return carePackages.map((cp) => ({
            id: cp.id.toString(),
            care_package_name: cp.carePackageName,
        })) as CarePackages[];
    } catch (error) {
        console.error('Error in cpModel.getAllCarePackages (with details):', error);
        throw new Error('Could not retrieve all care packages with details');
    }
};

interface CarePackagePurchaseCount {
    id: string;
    care_package_name: string;
    purchase_count: string;
    is_purchased: string;
}

const getCarePackagePurchaseCount = async (): Promise<
    Record<number, { purchase_count: number; is_purchased: string }>
> => {
    try {
        const prisma = getPrisma();

        // Get all care packages
        const carePackages = await prisma.carePackage.findMany({
            select: {
                id: true,
                carePackageName: true,
            },
        });

        // Build the result map with purchase counts
        const purchaseCountsMap: Record<number, { purchase_count: number; is_purchased: string }> = {};

        // For each care package, count member care packages by matching name
        const results = await Promise.all(
            carePackages.map(async (pkg) => {
                const purchaseCount = await prisma.memberCarePackage.count({
                    where: {
                        packageName: pkg.carePackageName,
                        status: 'ENABLED',
                    },
                });

                return {
                    id: Number(pkg.id),
                    name: pkg.carePackageName,
                    purchase_count: purchaseCount,
                    is_purchased: purchaseCount > 0 ? 'Yes' : 'No',
                };
            })
        );

        // Sort by purchase count descending, then by name
        results.sort((a, b) => {
            const countDiff = b.purchase_count - a.purchase_count;
            if (countDiff !== 0) return countDiff;
            return a.name.localeCompare(b.name);
        });

        // Build the map
        results.forEach((result) => {
            purchaseCountsMap[result.id] = {
                purchase_count: result.purchase_count,
                is_purchased: result.is_purchased,
            };
        });

        return purchaseCountsMap;
    } catch (error) {
        console.error('Error in getCarePackagePurchaseCounts:', error);
        throw new Error('Could not retrieve care package purchase counts');
    }
};

interface FullCarePackage {
    package: CarePackages;
    details: CarePackageItemDetails[];
}

const getCarePackageById = async (id: string): Promise<FullCarePackage | null> => {
    try {
        const prisma = getPrisma();

        // Validate/parse id safely to avoid runtime BigInt errors
        let parsedId: bigint | null = null;
        try {
            // accept numeric strings only
            if (typeof id === 'string' && /^\d+$/.test(id)) {
                parsedId = BigInt(id);
            } else {
                // invalid id format
                return null;
            }
        } catch {
            // BigInt parsing failed
            return null;
        }

        const cp = await prisma.carePackage.findUnique({
            where: { id: parsedId! },
            include: {
                carePackageItemDetails: true,
            },
        });

        if (!cp) return null;

        const mappedPackage: CarePackages = {
            id: cp.id.toString(),
            care_package_name: cp.carePackageName,
            care_package_remarks: cp.carePackageRemarks || '',
            care_package_price: Number(cp.carePackagePrice),
            care_package_customizable: cp.carePackageCustomizable,
            status: cp.status as 'ENABLED' | 'DISABLED',
            created_by: cp.createdBy?.toString() || '',
            last_updated_by: cp.lastUpdatedBy?.toString() || '',
            created_at: cp.createdAt.toISOString(),
            updated_at: cp.updatedAt.toISOString(),
        };

        const mappedDetails: CarePackageItemDetails[] = cp.carePackageItemDetails.map((d) => ({
            id: d.id.toString(),
            care_package_item_details_quantity: d.carePackageItemDetailsQuantity,
            care_package_item_details_discount: Number(d.carePackageItemDetailsDiscount),
            care_package_item_details_price: Number(d.carePackageItemDetailsPrice),
            service_id: d.serviceId.toString(),
            care_package_id: d.carePackageId.toString(),
        }));

        return { package: mappedPackage, details: mappedDetails };
    } catch (error) {
        console.error('Error in CarePackageModel.getCarePackageById:', error);
        throw new Error('Could not retrieve care package by id');
    }
};

// NOTE: price is original price of service, finalPrice is price x discount
interface servicePayload {
    id: string;
    name: string;
    quantity: number;
    price: number;
    finalPrice: number;
    discount: number;
}

const checkPackageNameExists = async (packageName: string, excludeId?: string): Promise<boolean> => {
    try {
        const prisma = getPrisma();

        // Build where clause
        const whereClause: Prisma.CarePackageWhereInput = {
            carePackageName: {
                equals: packageName.trim(),
                mode: 'insensitive', // Case-insensitive comparison
            },
        };

        // Exclude specific ID if provided
        if (excludeId) {
            whereClause.id = {
                not: BigInt(excludeId),
            };
        }

        const count = await prisma.carePackage.count({
            where: whereClause,
        });

        return count > 0;
    } catch (error) {
        console.error('Error checking package name existence:', error);
        throw new Error('Failed to check package name uniqueness');
    }
};

const createCarePackage = async (
    package_name: string,
    package_remarks: string,
    package_price: number,
    services: servicePayload[],
    is_customizable: boolean,
    employee_id: string,
    created_at: string,
    updated_at: string
) => {
    try {
        const prisma = getPrisma();

        // Use Prisma transaction
        const result = await prisma.$transaction(async (tx) => {
            // Validate employee exists
            const employee = await tx.employee.findUnique({
                where: { id: BigInt(employee_id) },
                select: { id: true },
            });

            if (!employee) {
                throw new Error(`Invalid employee_id: ${employee_id} does not exist.`);
            }

            // Create care package with nested service items
            const carePackage = await tx.carePackage.create({
                data: {
                    carePackageName: package_name,
                    carePackageRemarks: package_remarks,
                    carePackagePrice: package_price,
                    carePackageCustomizable: is_customizable,
                    status: 'ENABLED',
                    createdBy: BigInt(employee_id),
                    lastUpdatedBy: BigInt(employee_id),
                    createdAt: new Date(created_at),
                    updatedAt: new Date(updated_at),
                    carePackageItemDetails: {
                        create: services.map((service) => ({
                            carePackageItemDetailsQuantity: service.quantity,
                            carePackageItemDetailsDiscount: service.discount,
                            carePackageItemDetailsPrice: service.price,
                            serviceId: BigInt(service.id),
                        })),
                    },
                },
                select: {
                    id: true,
                },
            });

            return carePackage;
        });

        return {
            carePackageId: result.id.toString(),
        };
    } catch (error) {
        console.error('Error creating care package:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('An unexpected error occurred while creating the care package.');
    }
};

const updateCarePackageById = async (
    care_package_id: string,
    package_name: string,
    package_remarks: string,
    package_price: number,
    services: servicePayload[],
    is_customizable: boolean,
    employee_id: string,
    updated_at: string
) => {
    try {
        const prisma = getPrisma();

        await prisma.$transaction(async (tx) => {
            // Validate that the care package exists
            const existingPackage = await tx.carePackage.findUnique({
                where: { id: BigInt(care_package_id) },
                select: { id: true },
            });

            if (!existingPackage) {
                throw new Error(`Care package with ID ${care_package_id} does not exist.`);
            }

            // Validate employee exists
            const employee = await tx.employee.findUnique({
                where: { id: BigInt(employee_id) },
                select: { id: true },
            });

            if (!employee) {
                throw new Error(`Invalid employee_id: ${employee_id} does not exist.`);
            }

            // Delete existing care package item details
            await tx.carePackageItemDetail.deleteMany({
                where: { carePackageId: BigInt(care_package_id) },
            });

            // Update care package with new service items
            await tx.carePackage.update({
                where: { id: BigInt(care_package_id) },
                data: {
                    carePackageName: package_name,
                    carePackageRemarks: package_remarks,
                    carePackagePrice: package_price,
                    carePackageCustomizable: is_customizable,
                    status: 'ENABLED',
                    lastUpdatedBy: BigInt(employee_id),
                    updatedAt: new Date(updated_at),
                    carePackageItemDetails: {
                        create: services.map((service) => ({
                            carePackageItemDetailsQuantity: service.quantity,
                            carePackageItemDetailsDiscount: service.discount,
                            carePackageItemDetailsPrice: service.price,
                            serviceId: BigInt(service.id),
                        })),
                    },
                },
            });
        });

        return {
            carePackageId: care_package_id,
            message: 'Care package updated successfully',
        };
    } catch (error) {
        console.error('Error updating care package:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('An unexpected error occurred while updating the care package.');
    }
};

const updateCarePackageStatusById = async (
    care_package_id: string,
    status: 'ENABLED' | 'DISABLED',
    employee_id: string | null,
    updated_at: string
) => {
    try {
        const prisma = getPrisma();

        await prisma.$transaction(async (tx) => {
            // Validate that the care package exists
            const existingPackage = await tx.carePackage.findUnique({
                where: { id: BigInt(care_package_id) },
                select: { id: true },
            });

            if (!existingPackage) {
                throw new Error(`Care package with ID ${care_package_id} does not exist.`);
            }

            // If employee_id is provided, validate it exists; else allow null for audit flexibility
            if (employee_id) {
                const employee = await tx.employee.findUnique({
                    where: { id: BigInt(employee_id) },
                    select: { id: true },
                });

                if (!employee) {
                    // If provided employee_id is invalid, do not block the update; set lastUpdatedBy to null
                    employee_id = null;
                }
            }

            // Update only the status and tracking fields
            await tx.carePackage.update({
                where: { id: BigInt(care_package_id) },
                data: {
                    status: status,
                    lastUpdatedBy: employee_id ? BigInt(employee_id) : null,
                    updatedAt: new Date(updated_at),
                },
            });
        });

        return {
            carePackageId: care_package_id,
            message: 'Care package status updated successfully',
            status: status,
        };
    } catch (error) {
        console.error('Error updating care package status:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('An unexpected error occurred while updating the care package status.');
    }
};

const deleteCarePackageById = async (carePackageId: string) => {
    try {
        const prisma = getPrisma();

        await prisma.$transaction(async (tx) => {
            // Check if care package has been purchased
            const allPurchaseCounts = await getCarePackagePurchaseCount();

            if (allPurchaseCounts[parseInt(carePackageId)] && allPurchaseCounts[parseInt(carePackageId)].purchase_count > 0) {
                throw new Error('Cannot Delete Purchased CarePackage');
            }

            // Check if care package exists
            const existingPackage = await tx.carePackage.findUnique({
                where: { id: BigInt(carePackageId) },
                select: { id: true },
            });

            if (!existingPackage) {
                throw new Error(`Care package with ID ${carePackageId} does not exist.`);
            }

            // Delete care package item details first (cascade will handle this, but explicit is clearer)
            await tx.carePackageItemDetail.deleteMany({
                where: { carePackageId: BigInt(carePackageId) },
            });

            // Delete the care package
            await tx.carePackage.delete({
                where: { id: BigInt(carePackageId) },
            });
        });

        return {
            message: 'Care package deleted successfully.',
            deletedCarePackageId: carePackageId,
        };
    } catch (error) {
        console.error('Error deleting care package:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('An unexpected error occurred while deleting the care package.');
    }
};

interface emulatePayload {
    id?: string;
    package_name: string;
    package_remarks: string;
    package_price: number;
    services: servicePayload[];
    is_customizable: boolean;
    status: 'ENABLED' | 'DISABLED';
    created_at: string;
    updated_at: string;
    employee_id?: string;
    user_id?: string;
}

const emulateCarePackage = async (method: string, payload: Partial<emulatePayload>) => {
    async function em_post(payload: emulatePayload) {
        try {
            const lastCpSql: string = 'SELECT * FROM care_packages ORDER BY id DESC LIMIT 1';
            const { rows: cpRows } = await pool().query<CarePackages>(lastCpSql);
            const lastCp: CarePackages | undefined = cpRows[0];
            const lastCpId = lastCp && lastCp.id ? parseInt(lastCp.id) : 0;

            payload.employee_id = payload.employee_id;

            const newCp: CarePackages = {
                id: (lastCpId + 1).toString(),
                care_package_name: payload.package_name,
                care_package_remarks: payload.package_remarks,
                care_package_price: payload.package_price,
                care_package_customizable: payload.is_customizable,
                status: 'ENABLED',
                created_by: payload.employee_id!,
                last_updated_by: payload.employee_id!,
                created_at: payload.created_at || new Date().toISOString(),
                updated_at: payload.updated_at || new Date().toISOString(),
            };

            let oldCpItemDetails: CarePackageItemDetails[] = [];
            const newCpItemDetails: CarePackageItemDetails[] = [];

            if (payload.services && payload.services.length > 0) {
                const lastCpItemDetailsSql: string = 'SELECT * FROM care_package_item_details ORDER BY id DESC LIMIT 1';
                const { rows: itemRows } = await pool().query<CarePackageItemDetails>(lastCpItemDetailsSql);
                oldCpItemDetails = itemRows;
                const lastCpItemDetailsId = itemRows[0] && itemRows[0].id ? parseInt(itemRows[0].id) : 0;

                payload.services.forEach((service, idx) => {
                    newCpItemDetails.push({
                        id: (lastCpItemDetailsId + idx + 1).toString(),
                        care_package_id: newCp.id!,
                        service_id: service.id,
                        care_package_item_details_quantity: service.quantity,
                        care_package_item_details_discount: service.discount,
                        care_package_item_details_price: service.price,
                    });
                });
            }

            return {
                old: {
                    care_packages: cpRows,
                    care_package_item_details: oldCpItemDetails,
                },
                new: {
                    care_packages: [newCp],
                    care_package_item_details: newCpItemDetails,
                },
            };
        } catch (error) {
            console.error('Error emulating create care package:', error);
            if (error instanceof Error) {
                throw new Error(`Error emulating create care package: ${error.message}`);
            }
            throw new Error('An unknown error occurred while emulating create care package');
        }
    }

    async function em_put(payload: emulatePayload) {
        try {
            if (!payload.id) {
                throw new Error('Payload must include an id for the care package to update.');
            }

            const cpSql: string = 'SELECT * FROM care_packages WHERE id = $1';
            const cpItemDetailsSql: string = 'SELECT * FROM care_package_item_details WHERE care_package_id = $1';

            const { rows: cpRows } = await pool().query<CarePackages>(cpSql, [payload.id]);
            if (cpRows.length === 0) {
                throw new Error(`Care package with id ${payload.id} not found for update.`);
            }
            const oldCarePackage: CarePackages = cpRows[0];

            const { rows: oldCpItemDetails } = await pool().query<CarePackageItemDetails>(cpItemDetailsSql, [
                oldCarePackage.id,
            ]);

            payload.employee_id = payload.employee_id;

            const fieldMappings: FieldMapping<emulatePayload, CarePackages>[] = [
                { payloadKey: 'package_name', dbKey: 'care_package_name' },
                { payloadKey: 'package_remarks', dbKey: 'care_package_remarks' },
                { payloadKey: 'package_price', dbKey: 'care_package_price' },
                { payloadKey: 'is_customizable', dbKey: 'care_package_customizable' },
                { payloadKey: 'status', dbKey: 'status' },
                { payloadKey: 'created_at', dbKey: 'created_at' },
                { payloadKey: 'updated_at', dbKey: 'updated_at' },
                { payloadKey: 'employee_id', dbKey: 'created_by' },
                { payloadKey: 'employee_id', dbKey: 'last_updated_by' },
            ];

            const updatedCpFields: Partial<CarePackages> = {};
            fieldMappings.forEach((m) => {
                if (m.payloadKey in payload) {
                    const payloadValue = payload[m.payloadKey as keyof emulatePayload];
                    const existingValue = oldCarePackage[m.dbKey as keyof CarePackages];
                    const processedPayloadValue = m.transform ? m.transform(payloadValue) : payloadValue;

                    if (processedPayloadValue !== undefined && processedPayloadValue !== existingValue) {
                        (updatedCpFields as any)[m.dbKey] = processedPayloadValue;
                    }
                }
            });

            const newCp: Partial<CarePackages> = {
                // ...oldCarePackage,
                ...updatedCpFields,
                updated_at: payload.updated_at || new Date().toISOString(), // Ensure updated_at is always fresh
            };

            const newCpItemDetails: Partial<CarePackageItemDetails>[] = [];

            const serviceItemMappings: FieldMapping<servicePayload, CarePackageItemDetails>[] = [
                { payloadKey: 'quantity', dbKey: 'care_package_item_details_quantity' },
                { payloadKey: 'discount', dbKey: 'care_package_item_details_discount' },
                { payloadKey: 'finalPrice', dbKey: 'care_package_item_details_price' },
            ];

            (payload.services || []).forEach((servicePayloadItem) => {
                const existingItem = oldCpItemDetails.find(
                    (oldItem) => oldItem.service_id === servicePayloadItem.id && oldItem.care_package_id === oldCarePackage.id!
                );

                if (!existingItem) {
                    newCpItemDetails.push({
                        care_package_id: oldCarePackage.id!,
                        service_id: servicePayloadItem.id,
                        care_package_item_details_quantity: servicePayloadItem.quantity,
                        care_package_item_details_discount: servicePayloadItem.discount,
                        care_package_item_details_price: servicePayloadItem.price,
                    });
                } else {
                    const updatedDetailFields: Partial<CarePackageItemDetails> = {
                        id: existingItem.id,
                        care_package_id: oldCarePackage.id!,
                        service_id: servicePayloadItem.id,
                    };
                    let hasChanges = false;

                    serviceItemMappings.forEach((m) => {
                        // Ensure the keys exist on both objects before comparison
                        const payloadValue = servicePayloadItem[m.payloadKey];
                        const existingDbValue = existingItem[m.dbKey];

                        if (payloadValue !== undefined && payloadValue !== existingDbValue) {
                            (updatedDetailFields as any)[m.dbKey] = payloadValue;
                            hasChanges = true;
                        }
                    });

                    if (hasChanges) {
                        newCpItemDetails.push(updatedDetailFields);
                    }
                }
            });

            return {
                old: {
                    care_packages: [oldCarePackage],
                    care_package_item_details: oldCpItemDetails,
                },
                new: {
                    care_packages: [newCp],
                    care_package_item_details: newCpItemDetails,
                },
            };
        } catch (error) {
            console.error('Error emulating update care package:', error);
            if (error instanceof Error) {
                throw new Error(`Error emulating update care package: ${error.message}`);
            }
            throw new Error('An unknown error occurred while emulating update care package');
        }
    }

    async function em_delete(payload: emulatePayload) {
        try {
            if (!payload.id) {
                throw new Error('Payload must include an id for the care package to delete.');
            }

            const cpSql: string = 'SELECT * FROM care_packages WHERE id = $1';
            const cpItemDetailsSql: string = 'SELECT * FROM care_package_item_details WHERE care_package_id = $1';

            const { rows: cpRows } = await pool().query<CarePackages>(cpSql, [payload.id]);
            if (cpRows.length === 0) {
                throw new Error(`Care package with id ${payload.id} not found for deletion.`);
            }
            const oldCarePackage: CarePackages = cpRows[0];
            const { rows: oldCpItemDetails } = await pool().query<CarePackageItemDetails>(cpItemDetailsSql, [
                oldCarePackage.id,
            ]);

            return {
                old: {
                    care_packages: [oldCarePackage],
                    care_package_item_details: oldCpItemDetails,
                },
                new: {
                    care_packages: [],
                    care_package_item_details: [],
                },
            };
        } catch (error) {
            console.error('Error emulating delete care package:', error);
            if (error instanceof Error) {
                throw new Error(`Error emulating delete care package: ${error.message}`);
            }
            throw new Error('An unknown error occurred while emulating delete care package');
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
            typeof payload.is_customizable !== 'boolean' ||
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
            typeof payload.is_customizable !== 'boolean' ||
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
    getPaginatedCarePackages,
    getCarePackagesForDropdown,
    getCarePackageById,
    getCarePackagePurchaseCount,
    createCarePackage,
    updateCarePackageById,
    updateCarePackageStatusById,
    deleteCarePackageById,
    emulateCarePackage,
    checkPackageNameExists,
};
