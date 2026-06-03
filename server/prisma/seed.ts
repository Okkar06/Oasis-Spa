import { prisma } from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library.js';
import * as bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const SALT_ROUNDS = 10;

async function cleanup() {
    console.log('Cleaning up existing data...');

    try {
        // Use TRUNCATE CASCADE which automatically handles foreign key constraints
        // This is more efficient and reliable than deleteMany
        await prisma.$executeRawUnsafe(`
      DO $$ 
      DECLARE 
        r RECORD;
      BEGIN
        -- Disable triggers temporarily to speed up cleanup
        SET session_replication_role = 'replica';
        
        -- Truncate all tables (excluding Prisma migration tables)
        FOR r IN (
          SELECT tablename 
          FROM pg_tables 
          WHERE schemaname = 'public' 
            AND tablename NOT LIKE '_prisma%'
            AND tablename NOT LIKE 'prisma%'
          ORDER BY tablename
        ) 
        LOOP
          BEGIN
            EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
            RAISE NOTICE 'Truncated table: %', r.tablename;
          EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error truncating table %: %', r.tablename, SQLERRM;
          END;
        END LOOP;
        
        -- Re-enable triggers
        SET session_replication_role = 'origin';
      END $$;
    `);
        console.log('Cleanup completed successfully using TRUNCATE CASCADE!');
    } catch (error: any) {
        console.error('Cleanup failed:', error.message);
        // Fallback to deleteMany if TRUNCATE fails
        console.log('Attempting fallback cleanup method...');

        // Delete in order: child tables first (respecting foreign key constraints)
        // Don't use transactions - handle errors individually
        const tables = [
            'storedValueAccountTransactionLog',
            'memberVoucherTransactionLog',
            'memberCarePackageTransactionLog',
            'employeeCommission',
            'userToRole',
            'employeeToPosition',
            'paymentToSaleTransaction',
            'voucherTemplateDetail',
            'memberVoucherDetail',
            'memberCarePackageDetail',
            'carePackageItemDetail',
            'saleTransactionItem',
            'saleTransaction',
            'storedValueAccount',
            'membershipAccount',
            'memberVoucher',
            'memberCarePackage',
            'user',
            'userAuth',
            'appointment',
            'timetable',
            'voucherTemplate',
            'carePackage',
            'product',
            'service',
            'productCategory',
            'serviceCategory',
            'member',
            'membershipType',
            'employee',
            'position',
            'paymentMethod',
            'setting',
            'systemParameter',
            'role',
            'status',
        ];

        for (const table of tables) {
            try {
                const result = await prisma[table].deleteMany({});
                console.log(`Deleted ${table} (${result.count} records)`);
            } catch (e: any) {
                // Skip if table doesn't exist or other errors
                if (e.code === 'P2021') {
                    console.log(`Table ${table} does not exist, skipping...`);
                } else {
                    console.warn(`Warning deleting ${table}: ${e.message}`);
                    // Continue with next table
                }
            }
        }

        try {
            await prisma.$executeRawUnsafe(`
        DO $$
        DECLARE r RECORD;
        BEGIN
          FOR r IN (
            SELECT sequence_schema, sequence_name
            FROM information_schema.sequences
            WHERE sequence_schema = 'public'
          ) LOOP
            EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequence_schema) || '.' || quote_ident(r.sequence_name) || ' RESTART WITH 1';
          END LOOP;
        END $$;
      `);
            console.log('Sequences reset to start from 1');
        } catch (seqErr: any) {
            console.warn('Sequence reset failed:', seqErr.message);
        }
    }
}

async function setupDatabaseProcedures() {
    try {
        console.log('Setting up database stored procedures...');
        const fs = await import('fs');
        const path = await import('path');

        const sqlDir = path.default.resolve(__dirname, '../sql');

        if (!fs.default.existsSync(sqlDir)) {
            console.warn('SQL directory not found, skipping procedure setup');
            return;
        }

        const getAllFiles = (dirPath: string, arrayOfFiles: string[] = []): string[] => {
            const files = fs.default.readdirSync(dirPath);

            files.forEach((file: string) => {
                const filePath = path.default.join(dirPath, file);
                if (fs.default.statSync(filePath).isDirectory()) {
                    arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
                } else if (filePath.endsWith('.sql')) {
                    arrayOfFiles.push(filePath);
                }
            });

            return arrayOfFiles;
        };

        // Split SQL into statements - handle $$ syntax for functions and /* */ comments
        const splitSqlStatements = (sql: string): string[] => {
            const statements: string[] = [];
            let current = '';
            let inDollarQuote = false;
            let dollarQuoteTag = '';
            let inBlockComment = false;

            for (let i = 0; i < sql.length; i++) {
                const char = sql[i];

                // Check for block comment start
                if (!inDollarQuote && char === '/' && sql[i + 1] === '*') {
                    inBlockComment = true;
                    current += '/*';
                    i++;
                    continue;
                }

                // Check for block comment end
                if (inBlockComment && char === '*' && sql[i + 1] === '/') {
                    inBlockComment = false;
                    current += '*/';
                    i++;
                    continue;
                }

                // Check for $$ or $tag$ syntax
                if (char === '$' && !inBlockComment) {
                    const restOfLine = sql.substring(i);
                    const dollarMatch = restOfLine.match(/^\$[a-zA-Z_]*\$/);

                    if (dollarMatch) {
                        const tag = dollarMatch[0];
                        if (!inDollarQuote) {
                            inDollarQuote = true;
                            dollarQuoteTag = tag;
                            current += tag;
                            i += tag.length - 1;
                            continue;
                        } else if (tag === dollarQuoteTag) {
                            inDollarQuote = false;
                            current += tag;
                            i += tag.length - 1;
                            continue;
                        }
                    }
                }

                current += char;

                // Check for statement end (semicolon not in dollar quote and not in comment)
                if (char === ';' && !inDollarQuote && !inBlockComment) {
                    const trimmed = current.trim();
                    if (trimmed) {
                        statements.push(trimmed);
                    }
                    current = '';
                }
            }

            // Add any remaining statement
            const trimmed = current.trim();
            if (trimmed) {
                statements.push(trimmed);
            }

            return statements.filter((stmt) => stmt.length > 0);
        };

        const sqlFiles = getAllFiles(sqlDir);
        let succeeded = 0;
        let failed = 0;

        for (const file of sqlFiles) {
            try {
                // Skip schema files and simulation files
                if (file.includes('schema.sql') || file.includes('set_simulation.sql')) {
                    console.log(`Skipping ${path.default.basename(file)}`);
                    continue;
                }

                const sql = fs.default.readFileSync(file, 'utf-8').trim();

                // Skip empty files
                if (!sql) {
                    console.log(`Empty: ${path.default.basename(file)}`);
                    continue;
                }

                const statements = splitSqlStatements(sql);

                // Execute each statement
                let stmtSucceeded = 0;
                for (const statement of statements) {
                    try {
                        await prisma.$executeRawUnsafe(statement);
                        stmtSucceeded++;
                    } catch (stmtError: any) {
                        console.error(`  Statement failed: ${stmtError.message}`);
                    }
                }

                if (stmtSucceeded === statements.length) {
                    if (statements.length > 1) {
                        console.log(`✓ ${path.default.basename(file)} (${statements.length} statements)`);
                    } else {
                        console.log(`✓ ${path.default.basename(file)}`);
                    }
                    succeeded++;
                } else {
                    console.error(`✗ ${path.default.basename(file)}: ${stmtSucceeded}/${statements.length} statements executed`);
                    failed++;
                }
            } catch (error: any) {
                console.error(`✗ ${path.default.basename(file)}: ${error.message}`);
                failed++;
            }
        }

        console.log(
            `Database procedures setup completed: ${succeeded} succeeded, ${failed} failed`
        );
    } catch (error) {
        console.error('Error setting up database procedures:', error);
    }
}

async function main() {
    await cleanup();
    await setupDatabaseProcedures();
    console.log('Start seeding...');

    // 1. Statuses
    console.log('Seeding statuses...');
    const activeStatus = await prisma.status.upsert({
        where: { statusName: 'Active' },
        update: {},
        create: {
            statusName: 'Active',
            statusDescription: 'Active status',
            createdAt: new Date(),
        },
    });

    const inactiveStatus = await prisma.status.upsert({
        where: { statusName: 'Inactive' },
        update: {},
        create: {
            statusName: 'Inactive',
            statusDescription: 'Inactive status',
            createdAt: new Date(),
        },
    });

    const pendingStatus = await prisma.status.upsert({
        where: { statusName: 'Pending' },
        update: {},
        create: {
            statusName: 'Pending',
            statusDescription: 'Pending status',
            createdAt: new Date(),
        },
    });

    const completedStatus = await prisma.status.upsert({
        where: { statusName: 'Completed' },
        update: {},
        create: {
            statusName: 'Completed',
            statusDescription: 'Completed status',
            createdAt: new Date(),
        },
    });

    // 2. Employees
    console.log('Seeding employees...');
    const employee1 = await prisma.employee.upsert({
        where: { employeeCode: 'EMP001' },
        update: {},
        create: {
            employeeCode: 'EMP001',
            employeeName: 'John Doe',
            employeeEmail: 'john.doe@oasis-spa.com',
            employeeContact: '+65 9123 4567',
            employeeIsActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const employee2 = await prisma.employee.upsert({
        where: { employeeCode: 'EMP002' },
        update: {},
        create: {
            employeeCode: 'EMP002',
            employeeName: 'Jane Smith',
            employeeEmail: 'jane.smith@oasis-spa.com',
            employeeContact: '+65 9234 5678',
            employeeIsActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const employee3 = await prisma.employee.upsert({
        where: { employeeCode: 'EMP003' },
        update: {},
        create: {
            employeeCode: 'EMP003',
            employeeName: 'Alice Wong',
            employeeEmail: 'alice.wong@oasis-spa.com',
            employeeContact: '+65 9345 6789',
            employeeIsActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 3. Positions
    console.log('Seeding positions...');
    const therapistPosition = await prisma.position.upsert({
        where: { positionName: 'Therapist' },
        update: {},
        create: {
            positionName: 'Therapist',
            positionIsActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const managerPosition = await prisma.position.upsert({
        where: { positionName: 'Manager' },
        update: {},
        create: {
            positionName: 'Manager',
            positionIsActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const receptionistPosition = await prisma.position.upsert({
        where: { positionName: 'Receptionist' },
        update: {},
        create: {
            positionName: 'Receptionist',
            positionIsActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 4. EmployeeToPosition
    console.log('Linking employees to positions...');
    await prisma.employeeToPosition.upsert({
        where: {
            employeeId_positionId: {
                employeeId: employee1.id,
                positionId: therapistPosition.id,
            },
        },
        update: {},
        create: {
            employeeId: employee1.id,
            positionId: therapistPosition.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.employeeToPosition.upsert({
        where: {
            employeeId_positionId: {
                employeeId: employee2.id,
                positionId: managerPosition.id,
            },
        },
        update: {},
        create: {
            employeeId: employee2.id,
            positionId: managerPosition.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.employeeToPosition.upsert({
        where: {
            employeeId_positionId: {
                employeeId: employee3.id,
                positionId: receptionistPosition.id,
            },
        },
        update: {},
        create: {
            employeeId: employee3.id,
            positionId: receptionistPosition.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 5. Membership Types
    console.log('Seeding membership types...');
    const goldMembership = await prisma.membershipType.upsert({
        where: { membershipTypeName: 'Gold' },
        update: {},
        create: {
            membershipTypeName: 'Gold',
            createdBy: employee1.id,
            lastUpdatedBy: employee1.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const silverMembership = await prisma.membershipType.upsert({
        where: { membershipTypeName: 'Silver' },
        update: {},
        create: {
            membershipTypeName: 'Silver',
            createdBy: employee1.id,
            lastUpdatedBy: employee1.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const bronzeMembership = await prisma.membershipType.upsert({
        where: { membershipTypeName: 'Bronze' },
        update: {},
        create: {
            membershipTypeName: 'Bronze',
            createdBy: employee1.id,
            lastUpdatedBy: employee1.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 6. Members
    console.log('Seeding members...');
    const member1 = await prisma.member.create({
        data: {
            name: 'Sarah Tan',
            email: 'sarah.tan@email.com',
            sex: 'Female',
            address: '123 Orchard Road, Singapore 238858',
            nric: 'S9012345A',
            membershipTypeId: goldMembership.id,
            cardNumber: 'GOLD001',
            createdBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const member2 = await prisma.member.create({
        data: {
            name: 'David Lim',
            email: 'david.lim@email.com',
            sex: 'Male',
            address: '456 Marina Bay, Singapore 018956',
            nric: 'S8512345B',
            membershipTypeId: silverMembership.id,
            cardNumber: 'SILVER001',
            createdBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const member3 = await prisma.member.create({
        data: {
            name: 'Michelle Chen',
            email: 'michelle.chen@email.com',
            sex: 'Female',
            address: '789 Sentosa Cove, Singapore 098234',
            nric: 'S9512345C',
            membershipTypeId: bronzeMembership.id,
            cardNumber: 'BRONZE001',
            createdBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // Additional members for better testing
    const member4 = await prisma.member.create({
        data: {
            name: 'James Wilson',
            email: 'james.wilson@email.com',
            sex: 'Male',
            address: '321 Clementi Avenue, Singapore 129959',
            nric: 'S9012346D',
            membershipTypeId: goldMembership.id,
            cardNumber: 'GOLD002',
            createdBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const member5 = await prisma.member.create({
        data: {
            name: 'Lisa Wong',
            email: 'lisa.wong@email.com',
            sex: 'Female',
            address: '654 Bedok North Road, Singapore 469253',
            nric: 'S8812345E',
            membershipTypeId: silverMembership.id,
            cardNumber: 'SILVER002',
            createdBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const member6 = await prisma.member.create({
        data: {
            name: 'Robert Lee',
            email: 'robert.lee@email.com',
            sex: 'Male',
            address: '987 Bukit Merah Road, Singapore 159653',
            nric: 'S9312345F',
            membershipTypeId: bronzeMembership.id,
            cardNumber: 'BRONZE002',
            createdBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const member7 = await prisma.member.create({
        data: {
            name: 'Emily Ng',
            email: 'emily.ng@email.com',
            sex: 'Female',
            address: '147 Ang Mo Kio Avenue 1, Singapore 569977',
            nric: 'S9412345G',
            membershipTypeId: goldMembership.id,
            cardNumber: 'GOLD003',
            createdBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const member8 = await prisma.member.create({
        data: {
            name: 'Peter Ooi',
            email: 'peter.ooi@email.com',
            sex: 'Male',
            address: '258 Tampines Street 21, Singapore 529203',
            nric: 'S8612345H',
            membershipTypeId: silverMembership.id,
            cardNumber: 'SILVER003',
            createdBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const member9 = await prisma.member.create({
        data: {
            name: 'Angela Koh',
            email: 'angela.koh@email.com',
            sex: 'Female',
            address: '369 Hougang Street 31, Singapore 530369',
            nric: 'S9512346I',
            membershipTypeId: bronzeMembership.id,
            cardNumber: 'BRONZE003',
            createdBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const member10 = await prisma.member.create({
        data: {
            name: 'Henry Chua',
            email: 'henry.chua@email.com',
            sex: 'Male',
            address: '741 Jurong East Street 74, Singapore 609729',
            nric: 'S8712345J',
            membershipTypeId: goldMembership.id,
            cardNumber: 'GOLD004',
            createdBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 7. Membership Accounts
    console.log('Seeding membership accounts...');
    await prisma.membershipAccount.create({
        data: {
            memberId: member1.id,
            membershipTypeId: goldMembership.id,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2025-12-31'),
            isActive: true,
            statusId: activeStatus.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.membershipAccount.create({
        data: {
            memberId: member2.id,
            membershipTypeId: silverMembership.id,
            startDate: new Date('2024-06-01'),
            endDate: new Date('2025-05-31'),
            isActive: true,
            statusId: activeStatus.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 8. Service Categories
    console.log('Seeding service categories...');
    const massageCategory = await prisma.serviceCategory.upsert({
        where: { serviceCategoryName: 'Massage' },
        update: {},
        create: {
            serviceCategoryName: 'Massage',
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const facialCategory = await prisma.serviceCategory.upsert({
        where: { serviceCategoryName: 'Facial' },
        update: {},
        create: {
            serviceCategoryName: 'Facial',
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const bodyTreatmentCategory = await prisma.serviceCategory.upsert({
        where: { serviceCategoryName: 'Body Treatment' },
        update: {},
        create: {
            serviceCategoryName: 'Body Treatment',
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 9. Services
    console.log('Seeding services...');
    const aromatherapyMassage = await prisma.service.upsert({
        where: { serviceName: 'Aromatherapy Massage' },
        update: {},
        create: {
            serviceName: 'Aromatherapy Massage',
            serviceRemarks: 'Popular service',
            serviceDuration: 90,
            servicePrice: 150.0,
            serviceIsEnabled: true,
            serviceCategoryId: massageCategory.id,
            serviceSequenceNo: 1,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const deepTissueMassage = await prisma.service.upsert({
        where: { serviceName: 'Deep Tissue Massage' },
        update: {},
        create: {
            serviceName: 'Deep Tissue Massage',
            serviceDuration: 60,
            servicePrice: 120.0,
            serviceIsEnabled: true,
            serviceCategoryId: massageCategory.id,
            serviceSequenceNo: 2,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const hydraFacial = await prisma.service.upsert({
        where: { serviceName: 'HydraFacial' },
        update: {},
        create: {
            serviceName: 'HydraFacial',
            serviceDuration: 75,
            servicePrice: 180.0,
            serviceIsEnabled: true,
            serviceCategoryId: facialCategory.id,
            serviceSequenceNo: 1,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const bodyScrub = await prisma.service.upsert({
        where: { serviceName: 'Body Scrub' },
        update: {},
        create: {
            serviceName: 'Body Scrub',
            serviceDuration: 45,
            servicePrice: 80.0,
            serviceIsEnabled: true,
            serviceCategoryId: bodyTreatmentCategory.id,
            serviceSequenceNo: 1,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // Additional services for better testing
    const swedishMassage = await prisma.service.upsert({
        where: { serviceName: 'Swedish Massage' },
        update: {},
        create: {
            serviceName: 'Swedish Massage',
            serviceDuration: 60,
            servicePrice: 100.0,
            serviceIsEnabled: true,
            serviceCategoryId: massageCategory.id,
            serviceSequenceNo: 3,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const thaiMassage = await prisma.service.upsert({
        where: { serviceName: 'Thai Massage' },
        update: {},
        create: {
            serviceName: 'Thai Massage',
            serviceDuration: 90,
            servicePrice: 140.0,
            serviceIsEnabled: true,
            serviceCategoryId: massageCategory.id,
            serviceSequenceNo: 4,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const antiAgingFacial = await prisma.service.upsert({
        where: { serviceName: 'Anti-Aging Facial' },
        update: {},
        create: {
            serviceName: 'Anti-Aging Facial',
            serviceDuration: 90,
            servicePrice: 200.0,
            serviceIsEnabled: true,
            serviceCategoryId: facialCategory.id,
            serviceSequenceNo: 2,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const classicFacial = await prisma.service.upsert({
        where: { serviceName: 'Classic Facial' },
        update: {},
        create: {
            serviceName: 'Classic Facial',
            serviceDuration: 60,
            servicePrice: 120.0,
            serviceIsEnabled: true,
            serviceCategoryId: facialCategory.id,
            serviceSequenceNo: 3,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const detoxBodyWrap = await prisma.service.upsert({
        where: { serviceName: 'Detox Body Wrap' },
        update: {},
        create: {
            serviceName: 'Detox Body Wrap',
            serviceDuration: 60,
            servicePrice: 110.0,
            serviceIsEnabled: true,
            serviceCategoryId: bodyTreatmentCategory.id,
            serviceSequenceNo: 2,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const aromatherapyBath = await prisma.service.upsert({
        where: { serviceName: 'Aromatherapy Bath' },
        update: {},
        create: {
            serviceName: 'Aromatherapy Bath',
            serviceDuration: 45,
            servicePrice: 90.0,
            serviceIsEnabled: true,
            serviceCategoryId: bodyTreatmentCategory.id,
            serviceSequenceNo: 3,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 10. Product Categories
    console.log('Seeding product categories...');
    const skincareCategory = await prisma.productCategory.upsert({
        where: { productCategoryName: 'Skincare' },
        update: {},
        create: {
            productCategoryName: 'Skincare',
            productCategorySequenceNo: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const aromatherapyCategory = await prisma.productCategory.upsert({
        where: { productCategoryName: 'Aromatherapy' },
        update: {},
        create: {
            productCategoryName: 'Aromatherapy',
            productCategorySequenceNo: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 11. Products
    console.log('Seeding products...');
    await prisma.product.create({
        data: {
            productName: 'Lavender Essential Oil',
            productSequenceNo: 1,
            productUnitSalePrice: 45.0,
            productUnitCostPrice: 20.0,
            productIsEnabled: true,
            productCategoryId: aromatherapyCategory.id,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.product.create({
        data: {
            productName: 'Hydrating Face Serum',
            productSequenceNo: 1,
            productUnitSalePrice: 65.0,
            productUnitCostPrice: 30.0,
            productIsEnabled: true,
            productCategoryId: skincareCategory.id,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // Additional products for better testing
    await prisma.product.create({
        data: {
            productName: 'Rose Essential Oil',
            productSequenceNo: 2,
            productUnitSalePrice: 55.0,
            productUnitCostPrice: 25.0,
            productIsEnabled: true,
            productCategoryId: aromatherapyCategory.id,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.product.create({
        data: {
            productName: 'Eucalyptus Essential Oil',
            productSequenceNo: 3,
            productUnitSalePrice: 50.0,
            productUnitCostPrice: 22.0,
            productIsEnabled: true,
            productCategoryId: aromatherapyCategory.id,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.product.create({
        data: {
            productName: 'Anti-Aging Eye Cream',
            productSequenceNo: 2,
            productUnitSalePrice: 85.0,
            productUnitCostPrice: 40.0,
            productIsEnabled: true,
            productCategoryId: skincareCategory.id,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.product.create({
        data: {
            productName: 'Moisturizing Face Mask',
            productSequenceNo: 3,
            productUnitSalePrice: 35.0,
            productUnitCostPrice: 15.0,
            productIsEnabled: true,
            productCategoryId: skincareCategory.id,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.product.create({
        data: {
            productName: 'Herbal Body Oil',
            productSequenceNo: 4,
            productUnitSalePrice: 55.0,
            productUnitCostPrice: 25.0,
            productIsEnabled: true,
            productCategoryId: skincareCategory.id,
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 12. Care Packages
    console.log('Seeding care packages...');
    const relaxationPackage = await prisma.carePackage.create({
        data: {
            carePackageName: 'Ultimate Relaxation Package',
            carePackageRemarks: 'Best value package',
            carePackagePrice: 400.0,
            carePackageCustomizable: false,
            status: 'Active',
            createdBy: employee2.id,
            lastUpdatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 13. Care Package Item Details
    console.log('Seeding care package item details...');
    await prisma.carePackageItemDetail.create({
        data: {
            carePackageItemDetailsQuantity: 2,
            carePackageItemDetailsDiscount: 20.0,
            carePackageItemDetailsPrice: 240.0,
            serviceId: aromatherapyMassage.id,
            carePackageId: relaxationPackage.id,
        },
    });

    await prisma.carePackageItemDetail.create({
        data: {
            carePackageItemDetailsQuantity: 1,
            carePackageItemDetailsDiscount: 20.0,
            carePackageItemDetailsPrice: 144.0,
            serviceId: hydraFacial.id,
            carePackageId: relaxationPackage.id,
        },
    });

    // 14. Payment Methods
    console.log('Seeding payment methods...');
    await prisma.paymentMethod.create({
        data: {
            paymentMethodName: 'Cash',
            isEnabled: true,
            isIncome: true,
            showOnPaymentPage: true,
            isProtected: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.paymentMethod.create({
        data: {
            paymentMethodName: 'Credit Card',
            isEnabled: true,
            isIncome: true,
            showOnPaymentPage: true,
            isProtected: false,
            percentageRate: 2.5,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.paymentMethod.create({
        data: {
            paymentMethodName: 'PayNow',
            isEnabled: true,
            isIncome: true,
            showOnPaymentPage: true,
            isProtected: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // Add Refund method to support refund reporting
    await prisma.paymentMethod.create({
        data: {
            paymentMethodName: 'Refund',
            isEnabled: true,
            isIncome: false,
            showOnPaymentPage: false,
            isProtected: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 15. Voucher Templates
    console.log('Seeding voucher templates...');
    const massageVoucherTemplate = await prisma.voucherTemplate.create({
        data: {
            voucherTemplateName: 'Massage Package Voucher',
            defaultStartingBalance: 500.0,
            defaultFreeOfCharge: 0.0,
            defaultTotalPrice: 500.0,
            remarks: 'Valid for massage services',
            status: 'Active',
            createdBy: employee2.id,
            lastUpdatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const facialVoucherTemplate = await prisma.voucherTemplate.create({
        data: {
            voucherTemplateName: 'Facial Package Voucher',
            defaultStartingBalance: 350.0,
            defaultFreeOfCharge: 0.0,
            defaultTotalPrice: 350.0,
            remarks: 'Valid for facial services',
            status: 'Active',
            createdBy: employee2.id,
            lastUpdatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 16. Voucher Template Details
    console.log('Seeding voucher template details...');
    await prisma.voucherTemplateDetail.create({
        data: {
            voucherTemplateId: massageVoucherTemplate.id,
            serviceId: aromatherapyMassage.id,
            serviceName: aromatherapyMassage.serviceName,
            originalPrice: 150.0,
            customPrice: 120.0,
            discount: 30.0,
            finalPrice: 120.0,
            duration: 90,
            serviceCategoryId: massageCategory.id,
        },
    });

    await prisma.voucherTemplateDetail.create({
        data: {
            voucherTemplateId: facialVoucherTemplate.id,
            serviceId: hydraFacial.id,
            serviceName: hydraFacial.serviceName,
            originalPrice: 180.0,
            customPrice: 150.0,
            discount: 30.0,
            finalPrice: 150.0,
            duration: 75,
            serviceCategoryId: facialCategory.id,
        },
    });

    // 17. Member Vouchers
    console.log('Seeding member vouchers...');
    await prisma.memberVoucher.create({
        data: {
            memberVoucherName: 'Sarah Massage Voucher',
            voucherTemplateId: massageVoucherTemplate.id,
            memberId: member1.id,
            currentBalance: 500.0,
            startingBalance: 500.0,
            freeOfCharge: 0.0,
            defaultTotalPrice: 500.0,
            status: 'Active',
            createdBy: employee3.id,
            handledBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // Additional member vouchers for better testing
    await prisma.memberVoucher.create({
        data: {
            memberVoucherName: 'David Facial Voucher',
            voucherTemplateId: facialVoucherTemplate.id,
            memberId: member2.id,
            currentBalance: 300.0,
            startingBalance: 300.0,
            freeOfCharge: 0.0,
            defaultTotalPrice: 300.0,
            status: 'Active',
            createdBy: employee3.id,
            handledBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.memberVoucher.create({
        data: {
            memberVoucherName: 'Michelle Spa Voucher',
            voucherTemplateId: massageVoucherTemplate.id,
            memberId: member3.id,
            currentBalance: 400.0,
            startingBalance: 400.0,
            freeOfCharge: 0.0,
            defaultTotalPrice: 400.0,
            status: 'Active',
            createdBy: employee3.id,
            handledBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.memberVoucher.create({
        data: {
            memberVoucherName: 'James Massage Voucher',
            voucherTemplateId: massageVoucherTemplate.id,
            memberId: member4.id,
            currentBalance: 600.0,
            startingBalance: 600.0,
            freeOfCharge: 0.0,
            defaultTotalPrice: 600.0,
            status: 'Active',
            createdBy: employee3.id,
            handledBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.memberVoucher.create({
        data: {
            memberVoucherName: 'Lisa Facial Voucher',
            voucherTemplateId: facialVoucherTemplate.id,
            memberId: member5.id,
            currentBalance: 350.0,
            startingBalance: 350.0,
            freeOfCharge: 0.0,
            defaultTotalPrice: 350.0,
            status: 'Active',
            createdBy: employee3.id,
            handledBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.memberVoucher.create({
        data: {
            memberVoucherName: 'Robert Massage Voucher',
            voucherTemplateId: massageVoucherTemplate.id,
            memberId: member6.id,
            currentBalance: 250.0,
            startingBalance: 250.0,
            freeOfCharge: 0.0,
            defaultTotalPrice: 250.0,
            status: 'Active',
            createdBy: employee3.id,
            handledBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.memberVoucher.create({
        data: {
            memberVoucherName: 'Emily Facial Voucher',
            voucherTemplateId: facialVoucherTemplate.id,
            memberId: member7.id,
            currentBalance: 450.0,
            startingBalance: 450.0,
            freeOfCharge: 0.0,
            defaultTotalPrice: 450.0,
            status: 'Active',
            createdBy: employee3.id,
            handledBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.memberVoucher.create({
        data: {
            memberVoucherName: 'Peter Massage Voucher',
            voucherTemplateId: massageVoucherTemplate.id,
            memberId: member8.id,
            currentBalance: 380.0,
            startingBalance: 380.0,
            freeOfCharge: 0.0,
            defaultTotalPrice: 380.0,
            status: 'Active',
            createdBy: employee3.id,
            handledBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 18. Stored Value Accounts
    console.log('Seeding stored value accounts...');
    await prisma.storedValueAccount.create({
        data: {
            memberId: member1.id,
            storedValue: 200.0,
            createdBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.storedValueAccount.create({
        data: {
            memberId: member2.id,
            storedValue: 150.0,
            createdBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.storedValueAccount.create({
        data: {
            memberId: member3.id,
            storedValue: 300.0,
            createdBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.storedValueAccount.create({
        data: {
            memberId: member4.id,
            storedValue: 250.0,
            createdBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.storedValueAccount.create({
        data: {
            memberId: member5.id,
            storedValue: 180.0,
            createdBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.storedValueAccount.create({
        data: {
            memberId: member6.id,
            storedValue: 220.0,
            createdBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.storedValueAccount.create({
        data: {
            memberId: member7.id,
            storedValue: 190.0,
            createdBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.storedValueAccount.create({
        data: {
            memberId: member8.id,
            storedValue: 210.0,
            createdBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.storedValueAccount.create({
        data: {
            memberId: member9.id,
            storedValue: 170.0,
            createdBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.storedValueAccount.create({
        data: {
            memberId: member10.id,
            storedValue: 240.0,
            createdBy: employee3.id,
            lastUpdatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 18.5. Member Voucher Details (Services)
    console.log('Seeding member voucher details (services)...');

    // Get member vouchers for adding details
    const memberVouchers = await prisma.memberVoucher.findMany();
    const massageVouchers = memberVouchers.filter((_v: any, i: number) => i % 2 === 0); // Even indices = massage
    const facialVouchers = memberVouchers.filter((_v: any, i: number) => i % 2 === 1); // Odd indices = facial

    // Add details to massage vouchers (Swedish Massage, Thai Massage)
    for (let i = 0; i < massageVouchers.length; i++) {
        const voucher = massageVouchers[i];

        // Swedish Massage
        await prisma.memberVoucherDetail.create({
            data: {
                memberVoucherId: voucher.id,
                serviceId: swedishMassage.id,
                serviceName: 'Swedish Massage',
                originalPrice: 100.0,
                customPrice: 100.0,
                discount: 0,
                finalPrice: 100.0,
                duration: 60,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        // Thai Massage
        await prisma.memberVoucherDetail.create({
            data: {
                memberVoucherId: voucher.id,
                serviceId: thaiMassage.id,
                serviceName: 'Thai Massage',
                originalPrice: 120.0,
                customPrice: 120.0,
                discount: 0,
                finalPrice: 120.0,
                duration: 60,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
    }

    // Add details to facial vouchers (Anti-Aging Facial, Classic Facial)
    for (let i = 0; i < facialVouchers.length; i++) {
        const voucher = facialVouchers[i];

        // Anti-Aging Facial
        await prisma.memberVoucherDetail.create({
            data: {
                memberVoucherId: voucher.id,
                serviceId: antiAgingFacial.id,
                serviceName: 'Anti-Aging Facial',
                originalPrice: 150.0,
                customPrice: 150.0,
                discount: 0,
                finalPrice: 150.0,
                duration: 45,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        // Classic Facial
        await prisma.memberVoucherDetail.create({
            data: {
                memberVoucherId: voucher.id,
                serviceId: classicFacial.id,
                serviceName: 'Classic Facial',
                originalPrice: 100.0,
                customPrice: 100.0,
                discount: 0,
                finalPrice: 100.0,
                duration: 45,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
    }

    // 18.6. Member Voucher Transaction Logs
    console.log('Seeding member voucher transaction logs...');

    // Create transaction logs for each member voucher showing service usage
    for (const voucher of memberVouchers) {
        // Initial purchase transaction
        await prisma.memberVoucherTransactionLog.create({
            data: {
                memberVoucherId: voucher.id,
                serviceDescription: 'Voucher Purchase',
                serviceDate: new Date(),
                currentBalance: voucher.currentBalance,
                amountChange: voucher.startingBalance,
                servicedBy: null,
                type: 'Purchase',
                createdBy: employee3.id,
                lastUpdatedBy: employee3.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        // Add 1-3 service usage transactions for variety
        const numTransactions = Math.floor(Math.random() * 3) + 1;
        let currentBalance = Number(voucher.currentBalance || 0);

        for (let i = 0; i < numTransactions; i++) {
            const serviceIndex = i % 2;
            const serviceAmount = serviceIndex === 0 ? 100 : 120;
            const serviceName = serviceIndex === 0 ? 'Swedish Massage' : 'Thai Massage';
            currentBalance -= serviceAmount;

            // Spread usage across the past 3 months for more realistic reports
            const now = new Date();
            const monthsBack = Math.floor(Math.random() * 3); // 0-2 months back
            const targetDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
            const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
            const transactionDate = new Date(targetDate);
            transactionDate.setDate(Math.floor(Math.random() * daysInMonth) + 1);
            transactionDate.setHours(Math.floor(Math.random() * 12) + 9, Math.floor(Math.random() * 60), 0, 0);

            await prisma.memberVoucherTransactionLog.create({
                data: {
                    memberVoucherId: voucher.id,
                    serviceDescription: `${serviceName} Service (60 mins)`,
                    serviceDate: transactionDate,
                    currentBalance: new Decimal(Math.max(0, currentBalance)),
                    amountChange: new Decimal(-serviceAmount),
                    servicedBy: employee1.id,
                    type: 'Service',
                    createdBy: employee1.id,
                    lastUpdatedBy: employee1.id,
                    createdAt: transactionDate,
                    updatedAt: transactionDate,
                },
            });
        }
    }

    // 19. Appointments
    console.log('Seeding appointments...');
    // Find the appointments section - we'll leave existing appointments in place

    // Additional appointments for new members
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    await prisma.appointment.create({
        data: {
            memberId: member4.id,
            appointmentDate: tomorrow,
            startTime: new Date(tomorrow.getTime() + 9 * 60 * 60 * 1000),
            endTime: new Date(tomorrow.getTime() + 11 * 60 * 60 * 1000),
            remarks: 'First time massage',
            createdBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.appointment.create({
        data: {
            memberId: member5.id,
            appointmentDate: tomorrow,
            startTime: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
            endTime: new Date(tomorrow.getTime() + 4 * 60 * 60 * 1000),
            remarks: 'Facial treatment',
            createdBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // Original appointments section continues below
    // 19. Appointments (continued)
    // Original appointment from earlier in seed

    await prisma.appointment.create({
        data: {
            memberId: member1.id,
            servicingEmployeeId: employee1.id,
            appointmentDate: new Date('2024-12-15'),
            startTime: new Date('2024-12-15T10:00:00'),
            endTime: new Date('2024-12-15T11:30:00'),
            createdBy: employee3.id,
            updatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.appointment.create({
        data: {
            memberId: member2.id,
            servicingEmployeeId: employee1.id,
            appointmentDate: new Date('2024-12-16'),
            startTime: new Date('2024-12-16T14:00:00'),
            endTime: new Date('2024-12-16T15:00:00'),
            createdBy: employee3.id,
            updatedBy: employee3.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 20. Roles
    console.log('Seeding roles...');
    const superAdminRole = await prisma.role.upsert({
        where: { roleName: 'super_admin' },
        update: {},
        create: {
            roleName: 'super_admin',
            description: 'Super Administrator with full access',
            createdAt: new Date(),
        },
    });

    const dataAdminRole = await prisma.role.upsert({
        where: { roleName: 'data_admin' },
        update: {},
        create: {
            roleName: 'data_admin',
            description: 'Data Administrator with data management access',
            createdAt: new Date(),
        },
    });

    const adminRole = await prisma.role.upsert({
        where: { roleName: 'Admin' },
        update: {},
        create: {
            roleName: 'Admin',
            description: 'Administrator with full access',
            createdAt: new Date(),
        },
    });

    const managerRole = await prisma.role.upsert({
        where: { roleName: 'Manager' },
        update: {},
        create: {
            roleName: 'Manager',
            description: 'Manager with limited access',
            createdAt: new Date(),
        },
    });

    const staffRole = await prisma.role.upsert({
        where: { roleName: 'Staff' },
        update: {},
        create: {
            roleName: 'Staff',
            description: 'Staff with basic access',
            createdAt: new Date(),
        },
    });

    // 21. User Auth
    console.log('Seeding user auth...');
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
    const adminAuth = await prisma.userAuth.create({
        data: {
            email: 'admin@oasis-spa.com',
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 22. Users
    console.log('Seeding users...');
    const adminUser = await prisma.user.create({
        data: {
            username: 'admin',
            email: 'admin@oasis-spa.com',
            userAuthId: adminAuth.id,
            verifiedStatusId: activeStatus.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 23. UserToRole
    console.log('Linking users to roles...');
    // Assign admin user both super_admin and data_admin roles for full system access
    await prisma.userToRole.create({
        data: {
            userAuthId: adminAuth.id,
            roleId: superAdminRole.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.userToRole.create({
        data: {
            userAuthId: adminAuth.id,
            roleId: dataAdminRole.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 22.1 Seed a normal user with Staff role
    console.log('Seeding a normal staff user...');
    const normalUserPassword = process.env.NORMAL_USER_PASSWORD || 'User@123';
    const hashedNormalPassword = await bcrypt.hash(normalUserPassword, SALT_ROUNDS);

    const normalAuth = await prisma.userAuth.create({
        data: {
            email: 'user@oasis-spa.com',
            password: hashedNormalPassword,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const normalUser = await prisma.user.create({
        data: {
            username: 'user',
            email: 'user@oasis-spa.com',
            userAuthId: normalAuth.id,
            verifiedStatusId: activeStatus.id,
            preferredLanguage: 'zh',
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await prisma.userToRole.create({
        data: {
            userAuthId: normalAuth.id,
            roleId: staffRole.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    // 24. Settings
    console.log('Seeding settings...');
    await prisma.setting.upsert({
        where: {
            type_key: {
                type: 'general',
                key: 'spa_name',
            },
        },
        update: {},
        create: {
            type: 'general',
            key: 'spa_name',
            value: 'Oasis Spa',
        },
    });

    await prisma.setting.upsert({
        where: {
            type_key: {
                type: 'general',
                key: 'gst_rate',
            },
        },
        update: {},
        create: {
            type: 'general',
            key: 'gst_rate',
            value: '9',
        },
    });

    await prisma.setting.upsert({
        where: {
            type_key: {
                type: 'general',
                key: 'currency',
            },
        },
        update: {},
        create: {
            type: 'general',
            key: 'currency',
            value: 'SGD',
        },
    });

    // 25. System Parameters
    console.log('Seeding system parameters...');
    await prisma.systemParameter.create({
        data: {
            startDateUtc: new Date('2024-01-01'),
            endDateUtc: new Date('2025-12-31'),
            isSimulation: false,
        },
    });

    // 26. Timetables
    console.log('Seeding timetables...');
    await prisma.timetable.create({
        data: {
            employeeId: employee1.id,
            restdayNumber: 1,
            effectiveStartdate: new Date('2024-01-01'),
            createdBy: employee2.id,
            updatedBy: employee2.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    console.log('Seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error('Error during seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
