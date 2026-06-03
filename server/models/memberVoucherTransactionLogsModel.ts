import { prisma } from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';

const addTransferMemberVoucherTransactionLog = async (
  memberId: number,
  newMemberVoucherId: number,
  memberVoucherName: string,
  voucherTemplateName: string,
  servicedBy: number,
  createdBy: number,
  createdAt: string
): Promise<number> => {
  try {
    const createdDateObj = new Date(createdAt);
    if (isNaN(createdDateObj.getTime())) {
      throw new Error(`Invalid date string for createdAt: ${createdAt}`);
    }
    const createdAtISO = createdDateObj.toISOString();

    // Get old voucher details
    const memberVoucher = await prisma.memberVoucher.findFirst({
      where: {
        memberId: BigInt(memberId),
        memberVoucherName: memberVoucherName,
      },
    });

    if (!memberVoucher) {
      throw new Error("Member voucher record not found");
    }

    const transferAmount = Number(memberVoucher.currentBalance || 0);
    console.log("Transfer amount:", transferAmount);

    // Get the latest current_balance for the new voucher from transaction logs
    const latestTransaction = await prisma.memberVoucherTransactionLog.findFirst({
      where: {
        memberVoucherId: BigInt(newMemberVoucherId),
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });

    const latestBalance = latestTransaction ? Number(latestTransaction.currentBalance || 0) : 0;
    const newBalance = latestBalance + transferAmount;

    // Create transaction logs for both vouchers
    // Log: Transfer TO old voucher
    await prisma.memberVoucherTransactionLog.create({
      data: {
        memberVoucherId: memberVoucher.id,
        serviceDescription: `Transfer TO ${voucherTemplateName} voucher`,
        serviceDate: new Date(createdAt),
        currentBalance: new Decimal(0),
        amountChange: new Decimal(-transferAmount),
        servicedBy: BigInt(servicedBy),
        type: "TRANSFER TO",
        createdBy: BigInt(createdBy),
        createdAt: new Date(createdAtISO),
        updatedAt: new Date(createdAtISO),
      },
    });

    // Log: Transfer FROM old voucher to new voucher
    await prisma.memberVoucherTransactionLog.create({
      data: {
        memberVoucherId: BigInt(newMemberVoucherId),
        serviceDescription: `Transfer FROM ${memberVoucherName}`,
        serviceDate: new Date(createdAt),
        currentBalance: new Decimal(newBalance),
        amountChange: new Decimal(transferAmount),
        servicedBy: BigInt(servicedBy),
        type: "TRANSFER FROM",
        createdBy: BigInt(createdBy),
        createdAt: new Date(createdAtISO),
        updatedAt: new Date(createdAtISO),
      },
    });

    return transferAmount;
  } catch (error) {
    console.error("❌ Error logging transfer:", error);
    throw new Error("Failed to log member voucher transfer");
  }
};

const addPaymentFOCMemberVoucherTransactionLogs = async (
  newMemberVoucherId: number,
  voucherTemplateName: string,
  foc: number,
  servicedBy: number,
  createdBy: number,
  createdAt: string,
  topUpBalance: number,
  baseBalance: number // this is the current balance before top-up and foc
): Promise<void> => {
  try {
    const topUpAmount = Number(topUpBalance);
    const focAmount = Number(foc);

    // ➤ Log: Top-Up (only if topUpBalance > 0)
    const topUpNewCurrentBalance = baseBalance + topUpAmount;

    await prisma.memberVoucherTransactionLog.create({
      data: {
        memberVoucherId: BigInt(newMemberVoucherId),
        serviceDescription: `Top Up ${voucherTemplateName}`,
        serviceDate: new Date(createdAt),
        currentBalance: new Decimal(topUpNewCurrentBalance),
        amountChange: new Decimal(topUpAmount),
        servicedBy: BigInt(servicedBy),
        type: "TOP UP",
        createdBy: BigInt(createdBy),
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
      },
    });

    // ➤ Log: Add FOC (only if foc > 0)
    const FOCNewCurrentBalance = baseBalance + topUpAmount + focAmount;

    await prisma.memberVoucherTransactionLog.create({
      data: {
        memberVoucherId: BigInt(newMemberVoucherId),
        serviceDescription: `Add FOC ${voucherTemplateName}`,
        serviceDate: new Date(createdAt),
        currentBalance: new Decimal(FOCNewCurrentBalance),
        amountChange: new Decimal(focAmount),
        servicedBy: BigInt(servicedBy),
        type: "ADD FOC",
        createdBy: BigInt(createdBy),
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
      },
    });
  } catch (error) {
    console.error("❌ Error adding payment/FOC voucher transaction log:", error);
    throw new Error("Failed to add payment/FOC transaction log");
  }
};

export default {
  addTransferMemberVoucherTransactionLog,
  addPaymentFOCMemberVoucherTransactionLogs,
};