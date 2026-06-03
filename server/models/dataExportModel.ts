import { query as dbQuery } from '../config/database.js';
import { prisma } from '../lib/prisma.js';
import {
    DataToExportList,
    MemberDetailsData,
    UnusedMemberCarePackageData,
    UnusedMemberVoucherData
} from '../types/model.types.js';

const getMemberDetails = async (): Promise<{ success: boolean, data?: DataToExportList<MemberDetailsData>, message: string }> => {
    try {
        const members = await prisma.member.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                contact: true,
                dob: true,
                sex: true,
                remarks: true,
                address: true,
                nric: true
            },
            orderBy: {
                id: 'asc'
            }
        });

        const dataToExportList = members.map(m => ({
            member_id: Number(m.id),
            name: m.name,
            email: m.email ?? '',
            contact: m.contact ?? '',
            dob: m.dob ?? new Date(),
            sex: m.sex ?? '',
            remarks: m.remarks ?? '',
            address: m.address ?? '',
            nric: m.nric ?? ''
        }));

        const data = { dataToExportList };

        if (dataToExportList.length > 0) {
            return { success: true, data: data, message: "Member Details retrieve successfully." }
        } else {
            return { success: false, data: { dataToExportList: [] }, message: "There are no Member Details records." }
        }
    } catch (error) {
        console.error('Error fetching member details:', error);
        throw new Error('Failed to fetch member details');
    }
};

const getUnusedMemberVoucher = async (timeInput: number): Promise<{ success: boolean, data?: DataToExportList<UnusedMemberVoucherData>, message: string }> => {
    try {
        const query = `
        SELECT 
            m.name as member_name, 
            m.contact, 
            m.email, 
            mv.member_voucher_name, 
            EXTRACT(DAY FROM (CURRENT_DATE - mvtl.service_date)) as days_since_use,
            mvtl.service_date
        FROM members m
        JOIN member_vouchers mv ON m.id = mv.member_id
        JOIN member_voucher_transaction_logs mvtl ON mv.id = mvtl.member_voucher_id
        JOIN (
            SELECT 
                member_voucher_id, 
                MAX(service_date) as latest_service_date
            FROM member_voucher_transaction_logs
            GROUP BY member_voucher_id
        ) latest ON mvtl.member_voucher_id = latest.member_voucher_id 
            AND mvtl.service_date = latest.latest_service_date
        WHERE EXTRACT(DAY FROM (CURRENT_DATE - mvtl.service_date)) >= $1        
        AND mv.status = 'is_enabled'  
        ORDER BY mvtl.service_date DESC;
        `;

        const result = await dbQuery(query, [timeInput]);
        const data = {
            dataToExportList: result.rows
        };

        if (result.rows.length > 0) {
            return { success: true, data: data, message: "Unused Member Voucher retrieve successfully." }
        } else {
            return { success: false, data: { dataToExportList: [] }, message: "There are no Unused Member Voucher records." }
        }
    } catch (error) {
        console.error('Error fetching unused member voucher:', error);
        throw new Error('Failed to fetch unused member voucher');
    }
};

const getUnusedMemberCarePackage = async (timeInput: number): Promise<{ success: boolean, data?: DataToExportList<UnusedMemberCarePackageData>, message: string }> => {
    try {
        const query = `
        SELECT 
            m.name as member_name, 
            m.contact, 
            m.email, 
            mcp.package_name as package_name, 
            EXTRACT(DAY FROM (CURRENT_DATE - mcp.created_at)) as days_since_use,
            mcp.created_at
        FROM members m
        JOIN member_care_packages mcp ON m.id = mcp.member_id
        WHERE EXTRACT(DAY FROM (CURRENT_DATE - mcp.created_at)) >= $1
        ORDER BY mcp.created_at;
    `;

        const result = await dbQuery(query, [timeInput]);
        const data = {
            dataToExportList: result.rows
        };

        if (result.rows.length > 0) {
            return { success: true, data: data, message: "Unused Member Care Package retrieve successfully." }
        } else {
            return { success: false, data: { dataToExportList: [] }, message: "There are no Unused Member Care Package records." }
        }
    } catch (error) {
        console.error('Error fetching unused member care package:', error);
        throw new Error('Failed to fetch unused member care package');
    }
};

export default {
    getMemberDetails,
    getUnusedMemberVoucher,
    getUnusedMemberCarePackage
};