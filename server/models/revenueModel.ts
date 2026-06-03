import { getPrisma } from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';

// Helpers
function toSGTDateString(date: Date): string {
  const sgt = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  const y = sgt.getFullYear();
  const m = String(sgt.getMonth() + 1).padStart(2, '0');
  const d = String(sgt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toSGTMonthString(date: Date): string {
  const sgt = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  const y = sgt.getFullYear();
  const m = String(sgt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function toNumber(val: number | Decimal | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  try {
    return Number(val.toString());
  } catch {
    return 0;
  }
}

type CellBreakdownParams = {
  tab: 'combined' | 'mv' | 'mcp' | 'adhoc';
  date: string;
  fieldKey: string;
  columnLabel?: string;
};

type UpdateCellParams = {
  tab: 'combined' | 'mv' | 'mcp' | 'adhoc';
  date: string;
  fieldKey: string;
  columnLabel?: string;
  oldValue: number;
  newValue: number;
  reason: string;
  mode: 'transactions' | 'override';
  transactions?: { id: string | number; amount: number; payment_method_id?: number }[];
  userId: number | null;
};

const getMVMonthlyReport = async (year: number, month: number) => {
  const prisma = getPrisma();
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  console.log('[Model/MV] Range', { start, end, year, month });

  // Diagnostic: list item types present in the month
  try {
    const itemTypesMV = await prisma.saleTransactionItem.findMany({
      where: {
        saleTransaction: { createdAt: { gte: start, lte: end } },
      },
      select: { itemType: true },
    });
    const typeCountsMV = itemTypesMV.reduce<Record<string, number>>((acc, r) => {
      const k = (r.itemType || '').toLowerCase();
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    console.log('[Model/MV] Item types in range', typeCountsMV);
  } catch (e) {
    console.log('[Model/MV] Item type diagnostics failed', e);
  }

  // Income (enabled + income methods, member voucher items)
  const ptstIncome = await prisma.paymentToSaleTransaction.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      saleTransaction: {
        saleTransactionItems: {
          some: {
            OR: [
              { itemType: { equals: 'member voucher', mode: 'insensitive' } },
              { itemType: { equals: 'Member Voucher', mode: 'insensitive' } },
              { itemType: { equals: 'member_voucher', mode: 'insensitive' } },
              { itemType: { equals: 'member-voucher', mode: 'insensitive' } },
            ],
          },
        },
      },
      paymentMethod: { is: { isEnabled: true, isIncome: true } },
    },
    include: { paymentMethod: true },
  });
  console.log('[Model/MV] ptstIncome count', ptstIncome.length);

  const incomeAgg: Record<string, { payment_method_id: number; payment_method_name: string; amount: number; is_gst: boolean }[]> = {};
  for (const r of ptstIncome) {
    if (!r.createdAt || !r.paymentMethodId || !r.paymentMethod) continue;
    const day = toSGTDateString(r.createdAt);
    const amt = Math.abs(toNumber(r.amount));
    const entry = {
      payment_method_id: Number(r.paymentMethodId),
      payment_method_name: r.paymentMethod.paymentMethodName || '',
      amount: amt,
      is_gst: false,
    };
    if (!incomeAgg[day]) incomeAgg[day] = [];
    const existing = incomeAgg[day].find((e) => e.payment_method_id === entry.payment_method_id && e.is_gst === false);
    if (existing) existing.amount += amt; else incomeAgg[day].push(entry);
  }

  // GST (dynamically detect GST payment method; fallback to id 10 if not found)
  const gstMethodMV = await prisma.paymentMethod.findFirst({
    where: { paymentMethodName: { equals: 'GST', mode: 'insensitive' } },
    select: { id: true }
  });
  console.log('[Model/MV] GST method id', gstMethodMV?.id);
  const ptstGST = await prisma.paymentToSaleTransaction.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      saleTransaction: {
        saleTransactionItems: {
          some: {
            OR: [
              { itemType: { equals: 'member voucher', mode: 'insensitive' } },
              { itemType: { equals: 'Member Voucher', mode: 'insensitive' } },
              { itemType: { equals: 'member_voucher', mode: 'insensitive' } },
              { itemType: { equals: 'member-voucher', mode: 'insensitive' } },
            ],
          },
        },
      },
      paymentMethodId: gstMethodMV?.id ?? 10n,
    },
    include: { paymentMethod: true },
  });
  console.log('[Model/MV] ptstGST count', ptstGST.length);
  for (const r of ptstGST) {
    if (!r.createdAt || !r.paymentMethodId || !r.paymentMethod) continue;
    const day = toSGTDateString(r.createdAt);
    const amt = Math.abs(toNumber(r.amount));
    const entry = {
      payment_method_id: Number(r.paymentMethodId),
      payment_method_name: r.paymentMethod.paymentMethodName || '',
      amount: amt,
      is_gst: true,
    };
    if (!incomeAgg[day]) incomeAgg[day] = [];
    const existing = incomeAgg[day].find((e) => e.payment_method_id === entry.payment_method_id && e.is_gst === true);
    if (existing) existing.amount += amt; else incomeAgg[day].push(entry);
  }

  const income = Object.entries(incomeAgg)
    .flatMap(([day, arr]) => arr.map((e) => ({ payment_date_gmt8: day, payment_method_id: e.payment_method_id, payment_method_name: e.payment_method_name, amount: Number(e.amount.toFixed(2)), is_gst: e.is_gst })));

  // Refund (Refund method name)
  const refundMethod = await prisma.paymentMethod.findFirst({ where: { paymentMethodName: { equals: 'Refund', mode: 'insensitive' } } });
  console.log('[Model/MV] Refund method id', refundMethod?.id);
  const refundRows: { refund_date_gmt8: string; total_refund_amount: number }[] = [];
  if (refundMethod) {
    const ptstRefund = await prisma.paymentToSaleTransaction.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        saleTransaction: {
          saleTransactionItems: {
            some: {
              OR: [
                { itemType: { equals: 'member voucher', mode: 'insensitive' } },
                { itemType: { equals: 'Member Voucher', mode: 'insensitive' } },
                { itemType: { equals: 'member_voucher', mode: 'insensitive' } },
                { itemType: { equals: 'member-voucher', mode: 'insensitive' } },
              ],
            },
          },
        },
        paymentMethodId: refundMethod.id,
      },
    });
    console.log('[Model/MV] ptstRefund count', ptstRefund.length);
    const refundAgg: Record<string, number> = {};
    for (const r of ptstRefund) {
      if (!r.createdAt) continue;
      const day = toSGTDateString(r.createdAt);
      refundAgg[day] = (refundAgg[day] || 0) + Math.abs(toNumber(r.amount));
    }
    for (const [day, amt] of Object.entries(refundAgg)) {
      refundRows.push({ refund_date_gmt8: day, total_refund_amount: Number(amt.toFixed(2)) });
    }
  }

  // Net sales (revenue earned from MV consumptions)
  const mvtls = await prisma.memberVoucherTransactionLog.findMany({
    where: {
      type: 'CONSUMPTION',
      serviceDate: { gte: start, lte: end },
    },
    include: { memberVoucher: true },
  });
  console.log('[Model/MV] mvtls count', mvtls.length);

  // Preload payments for member vouchers (income-recognized methods)
  const incomeMethods = await prisma.paymentMethod.findMany({ where: { isEnabled: true, isIncome: true }, select: { id: true } });
  const allowedMethodIds = incomeMethods.map((m) => m.id);
  const ptstForMV = await prisma.paymentToSaleTransaction.findMany({
    where: {
      createdAt: { lte: end },
      paymentMethodId: { in: allowedMethodIds },
      saleTransaction: {
        saleTransactionItems: {
          some: {
            OR: [
              { itemType: { equals: 'member voucher', mode: 'insensitive' } },
              { itemType: { equals: 'Member Voucher', mode: 'insensitive' } },
              { itemType: { equals: 'member_voucher', mode: 'insensitive' } },
              { itemType: { equals: 'member-voucher', mode: 'insensitive' } },
            ],
          },
        },
      },
    },
    include: { saleTransaction: { select: { saleTransactionItems: { select: { memberVoucherId: true } } } } },
  });
  console.log('[Model/MV] ptstForMV count', ptstForMV.length);

  // Build map: voucherId -> payments [{createdAt, amount}]
  const voucherPayments = new Map<bigint, { createdAt: Date; amount: number }[]>();
  for (const p of ptstForMV) {
    const mvId = p.saleTransaction?.saleTransactionItems?.[0]?.memberVoucherId;
    if (!mvId || !p.createdAt) continue;
    const arr = voucherPayments.get(mvId) || [];
    arr.push({ createdAt: p.createdAt, amount: Math.abs(toNumber(p.amount)) });
    voucherPayments.set(mvId, arr);
  }
  for (const [k, v] of voucherPayments.entries()) {
    v.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  const netAgg: Record<string, { total_amount_change: number; total_revenue_earned: number }> = {};
  for (const log of mvtls) {
    if (!log.serviceDate || !log.memberVoucher) continue;
    const day = toSGTDateString(log.serviceDate);
    const startingBalance = toNumber(log.memberVoucher.startingBalance);
    const currentBalance = toNumber(log.currentBalance);
    const amountChange = Math.abs(toNumber(log.amountChange));
    const spent = startingBalance - currentBalance;

    const payments = voucherPayments.get(log.memberVoucherId) || [];
    const amountPaidUpTo = payments.filter((p) => p.createdAt.getTime() <= log.serviceDate!.getTime()).reduce((s, p) => s + p.amount, 0);

    let revenueEarned = 0;
    if (spent === amountPaidUpTo) revenueEarned = amountChange;
    else if (spent - amountPaidUpTo < 0) revenueEarned = amountChange;
    else if (spent - amountPaidUpTo > 0) revenueEarned = Math.max(amountChange - (spent - amountPaidUpTo), 0);

    const bucket = netAgg[day] || { total_amount_change: 0, total_revenue_earned: 0 };
    bucket.total_amount_change += amountChange;
    bucket.total_revenue_earned += revenueEarned;
    netAgg[day] = bucket;
  }

  const netsales = Object.entries(netAgg)
    .map(([day, v]) => ({ service_date_gmt8: day, total_amount_change: Number(v.total_amount_change.toFixed(2)), total_revenue_earned: Number(v.total_revenue_earned.toFixed(2)) }))
    .sort((a, b) => (a.service_date_gmt8 < b.service_date_gmt8 ? -1 : 1));

  return {
    income,
    refund: refundRows,
    netsales,
  };
};

const getMCPMonthlyReport = async (year: number, month: number) => {
  const prisma = getPrisma();
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  console.log('[Model/MCP] Range', { start, end, year, month });

  // Diagnostic: list item types present in the month
  try {
    const itemTypesMCP = await prisma.saleTransactionItem.findMany({
      where: { saleTransaction: { createdAt: { gte: start, lte: end } } },
      select: { itemType: true },
    });
    const typeCountsMCP = itemTypesMCP.reduce<Record<string, number>>((acc, r) => {
      const k = (r.itemType || '').toLowerCase();
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    console.log('[Model/MCP] Item types in range', typeCountsMCP);
  } catch (e) {
    console.log('[Model/MCP] Item type diagnostics failed', e);
  }

  // Income for MCP
  const ptstIncome = await prisma.paymentToSaleTransaction.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      saleTransaction: {
        saleTransactionItems: {
          some: {
            OR: [
              { itemType: { equals: 'member care package', mode: 'insensitive' } },
              { itemType: { equals: 'Member_Care_Package', mode: 'insensitive' } },
              { itemType: { equals: 'member-care-package', mode: 'insensitive' } },
              { itemType: { equals: 'member_care_package', mode: 'insensitive' } },
            ],
          },
        },
      },
      paymentMethod: { is: { isEnabled: true, isIncome: true } },
    },
    include: { paymentMethod: true },
  });
  console.log('[Model/MCP] ptstIncome count', ptstIncome.length);
  const incomeAgg: Record<string, { payment_method_id: number; payment_method_name: string; amount: number; is_gst: boolean }[]> = {};
  for (const r of ptstIncome) {
    if (!r.createdAt || !r.paymentMethodId || !r.paymentMethod) continue;
    const day = toSGTDateString(r.createdAt);
    const amt = Math.abs(toNumber(r.amount));
    const entry = { payment_method_id: Number(r.paymentMethodId), payment_method_name: r.paymentMethod.paymentMethodName || '', amount: amt, is_gst: false };
    if (!incomeAgg[day]) incomeAgg[day] = [];
    const existing = incomeAgg[day].find((e) => e.payment_method_id === entry.payment_method_id && e.is_gst === false);
    if (existing) existing.amount += amt; else incomeAgg[day].push(entry);
  }

  // GST for MCP (dynamically detect GST method; fallback to id 10)
  const gstMethodMCP = await prisma.paymentMethod.findFirst({
    where: { paymentMethodName: { equals: 'GST', mode: 'insensitive' } },
    select: { id: true }
  });
  console.log('[Model/MCP] GST method id', gstMethodMCP?.id);
  const ptstGST = await prisma.paymentToSaleTransaction.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      saleTransaction: {
        saleTransactionItems: {
          some: {
            OR: [
              { itemType: { equals: 'member care package', mode: 'insensitive' } },
              { itemType: { equals: 'Member_Care_Package', mode: 'insensitive' } },
              { itemType: { equals: 'member-care-package', mode: 'insensitive' } },
              { itemType: { equals: 'member_care_package', mode: 'insensitive' } },
            ],
          },
        },
      },
      paymentMethodId: gstMethodMCP?.id ?? 10n,
    },
    include: { paymentMethod: true },
  });
  console.log('[Model/MCP] ptstGST count', ptstGST.length);
  for (const r of ptstGST) {
    if (!r.createdAt || !r.paymentMethodId || !r.paymentMethod) continue;
    const day = toSGTDateString(r.createdAt);
    const amt = Math.abs(toNumber(r.amount));
    const entry = { payment_method_id: Number(r.paymentMethodId), payment_method_name: r.paymentMethod.paymentMethodName || '', amount: amt, is_gst: true };
    if (!incomeAgg[day]) incomeAgg[day] = [];
    const existing = incomeAgg[day].find((e) => e.payment_method_id === entry.payment_method_id && e.is_gst === true);
    if (existing) existing.amount += amt; else incomeAgg[day].push(entry);
  }
  const income = Object.entries(incomeAgg).flatMap(([day, arr]) => arr.map((e) => ({ payment_date_gmt8: day, payment_method_id: e.payment_method_id, payment_method_name: e.payment_method_name, amount: Number(e.amount.toFixed(2)), is_gst: e.is_gst })));

  // Refund MCP
  const refundMethod = await prisma.paymentMethod.findFirst({ where: { paymentMethodName: { equals: 'Refund', mode: 'insensitive' } } });
  console.log('[Model/MCP] Refund method id', refundMethod?.id);
  const refundRows: { refund_date_gmt8: string; total_refund_amount: number }[] = [];
  if (refundMethod) {
    const ptstRefund = await prisma.paymentToSaleTransaction.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        saleTransaction: {
          saleTransactionItems: {
            some: {
              OR: [
                { itemType: { equals: 'member care package', mode: 'insensitive' } },
                { itemType: { equals: 'Member_Care_Package', mode: 'insensitive' } },
                { itemType: { equals: 'member-care-package', mode: 'insensitive' } },
                { itemType: { equals: 'member_care_package', mode: 'insensitive' } },
              ],
            },
          },
        },
        paymentMethodId: refundMethod.id,
      },
    });
    console.log('[Model/MCP] ptstRefund count', ptstRefund.length);
    const refundAgg: Record<string, number> = {};
    for (const r of ptstRefund) {
      if (!r.createdAt) continue;
      const day = toSGTDateString(r.createdAt);
      refundAgg[day] = (refundAgg[day] || 0) + Math.abs(toNumber(r.amount));
    }
    for (const [day, amt] of Object.entries(refundAgg)) {
      refundRows.push({ refund_date_gmt8: day, total_refund_amount: Number(amt.toFixed(2)) });
    }
  }

  // Net sales MCP (consumptions)
  const mcptls = await prisma.memberCarePackageTransactionLog.findMany({
    where: { type: 'CONSUMPTION', transactionDate: { gte: start, lte: end } },
  });
  console.log('[Model/MCP] mcptls count', mcptls.length);
  const netAgg: Record<string, number> = {};
  for (const r of mcptls) {
    if (!r.transactionDate) continue;
    const day = toSGTDateString(r.transactionDate);
    netAgg[day] = (netAgg[day] || 0) + Math.abs(toNumber(r.amountChanged));
  }
  const netsales = Object.entries(netAgg)
    .map(([day, amt]) => ({ consumption_date_gmt8: day, total_consumed_amount: Number(amt.toFixed(2)) }))
    .sort((a, b) => (a.consumption_date_gmt8 < b.consumption_date_gmt8 ? -1 : 1));

  return { income, refund: refundRows, netsales };
};

const getAdHocMonthlyReport = async (year: number, month: number) => {
  const prisma = getPrisma();
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Income from service + product (deduplicated by PTST id)
  const ptIncome = await prisma.paymentToSaleTransaction.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      saleTransaction: {
        saleTransactionItems: {
          some: {
            OR: [
              { itemType: { equals: 'service', mode: 'insensitive' } },
              { itemType: { equals: 'product', mode: 'insensitive' } },
            ],
          },
        },
      },
      paymentMethod: { is: { isEnabled: true, isIncome: true } },
    },
    include: { paymentMethod: true },
  });
  const incomeAgg: Record<string, { payment_method_id: number; payment_method_name: string; amount: number; is_gst: boolean }[]> = {};
  for (const r of ptIncome) {
    if (!r.createdAt || !r.paymentMethodId || !r.paymentMethod) continue;
    const day = toSGTDateString(r.createdAt);
    const amt = Math.abs(toNumber(r.amount));
    const entry = { payment_method_id: Number(r.paymentMethodId), payment_method_name: r.paymentMethod.paymentMethodName || '', amount: amt, is_gst: false };
    if (!incomeAgg[day]) incomeAgg[day] = [];
    const existing = incomeAgg[day].find((e) => e.payment_method_id === entry.payment_method_id && e.is_gst === false);
    if (existing) existing.amount += amt; else incomeAgg[day].push(entry);
  }

  // GST for ad-hoc (dynamically detect GST method; fallback to id 10)
  const gstMethodAdHoc = await prisma.paymentMethod.findFirst({
    where: { paymentMethodName: { equals: 'GST', mode: 'insensitive' } },
    select: { id: true }
  });
  const ptGST = await prisma.paymentToSaleTransaction.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      saleTransaction: {
        saleTransactionItems: {
          some: {
            OR: [
              { itemType: { equals: 'service', mode: 'insensitive' } },
              { itemType: { equals: 'product', mode: 'insensitive' } },
            ],
          },
        },
      },
      paymentMethodId: gstMethodAdHoc?.id ?? 10n,
    },
    include: { paymentMethod: true },
  });
  for (const r of ptGST) {
    if (!r.createdAt || !r.paymentMethodId || !r.paymentMethod) continue;
    const day = toSGTDateString(r.createdAt);
    const amt = Math.abs(toNumber(r.amount));
    const entry = { payment_method_id: Number(r.paymentMethodId), payment_method_name: r.paymentMethod.paymentMethodName || '', amount: amt, is_gst: true };
    if (!incomeAgg[day]) incomeAgg[day] = [];
    const existing = incomeAgg[day].find((e) => e.payment_method_id === entry.payment_method_id && e.is_gst === true);
    if (existing) existing.amount += amt; else incomeAgg[day].push(entry);
  }
  const income = Object.entries(incomeAgg).flatMap(([day, arr]) => arr.map((e) => ({ payment_date_gmt8: day, payment_method_id: e.payment_method_id, payment_method_name: e.payment_method_name, amount: Number(e.amount.toFixed(2)), is_gst: e.is_gst })));

  // Refund for ad-hoc services
  const refundMethod = await prisma.paymentMethod.findFirst({ where: { paymentMethodName: { equals: 'Refund', mode: 'insensitive' } } });
  const refundRows: { refund_date_gmt8: string; total_refund_amount: number }[] = [];
  if (refundMethod) {
    const ptRefund = await prisma.paymentToSaleTransaction.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        saleTransaction: { saleTransactionItems: { some: { itemType: { equals: 'service', mode: 'insensitive' } } } },
        paymentMethodId: refundMethod.id,
      },
    });
    const refundAgg: Record<string, number> = {};
    for (const r of ptRefund) {
      if (!r.createdAt) continue;
      const day = toSGTDateString(r.createdAt);
      refundAgg[day] = (refundAgg[day] || 0) + Math.abs(toNumber(r.amount));
    }
    for (const [day, amt] of Object.entries(refundAgg)) {
      refundRows.push({ refund_date_gmt8: day, total_refund_amount: Number(amt.toFixed(2)) });
    }
  }

  return { income, refund: refundRows };
};

const getTransactionDateRange = async () => {
  const prisma = getPrisma();
  const min = await prisma.saleTransaction.aggregate({ _min: { createdAt: true } });
  const max = await prisma.saleTransaction.aggregate({ _max: { createdAt: true } });
  const earliest = min._min.createdAt ? toSGTDateString(min._min.createdAt) : null;
  const latest = max._max.createdAt ? toSGTDateString(max._max.createdAt) : null;
  return { range: { earliest_created_at_sgt: earliest, latest_created_at_sgt: latest } };
};

const getMVDeferredRevenue = async () => {
  const prisma = getPrisma();
  // Income for MV by month
  const ptstIncome = await prisma.paymentToSaleTransaction.findMany({
    where: {
      paymentMethod: { is: { isEnabled: true, isIncome: true } },
      saleTransaction: { saleTransactionItems: { some: { itemType: { equals: 'member voucher', mode: 'insensitive' } } } },
    },
    include: { paymentMethod: true },
  });
  const incomeByMonth: Record<string, number> = {};
  for (const r of ptstIncome) {
    if (!r.createdAt) continue;
    const m = toSGTMonthString(r.createdAt);
    incomeByMonth[m] = (incomeByMonth[m] || 0) + Math.abs(toNumber(r.amount));
  }

  // Refund for MV by month
  const refundMethod = await prisma.paymentMethod.findFirst({ where: { paymentMethodName: { equals: 'Refund', mode: 'insensitive' } } });
  const refundByMonth: Record<string, number> = {};
  if (refundMethod) {
    const ptRefund = await prisma.paymentToSaleTransaction.findMany({
      where: {
        paymentMethodId: refundMethod.id,
        saleTransaction: { saleTransactionItems: { some: { itemType: { equals: 'member voucher', mode: 'insensitive' } } } },
      },
    });
    for (const r of ptRefund) {
      if (!r.createdAt) continue;
      const m = toSGTMonthString(r.createdAt);
      refundByMonth[m] = (refundByMonth[m] || 0) + Math.abs(toNumber(r.amount));
    }
  }

  // Net sales by month from MV logs
  const mvtls = await prisma.memberVoucherTransactionLog.findMany({ where: { type: 'CONSUMPTION' }, include: { memberVoucher: true } });
  const incomeMethods = await prisma.paymentMethod.findMany({ where: { isEnabled: true, isIncome: true }, select: { id: true } });
  const allowedMethodIds = incomeMethods.map((m) => m.id);
  const ptForMV = await prisma.paymentToSaleTransaction.findMany({
    where: { paymentMethodId: { in: allowedMethodIds }, saleTransaction: { saleTransactionItems: { some: { itemType: { equals: 'member voucher', mode: 'insensitive' } } } } },
    include: { saleTransaction: { select: { saleTransactionItems: { select: { memberVoucherId: true } } } } },
  });
  const voucherPayments = new Map<bigint, { createdAt: Date; amount: number }[]>();
  for (const p of ptForMV) {
    const mvId = p.saleTransaction?.saleTransactionItems?.[0]?.memberVoucherId;
    if (!mvId || !p.createdAt) continue;
    const arr = voucherPayments.get(mvId) || [];
    arr.push({ createdAt: p.createdAt, amount: Math.abs(toNumber(p.amount)) });
    voucherPayments.set(mvId, arr);
  }
  for (const [k, v] of voucherPayments.entries()) v.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const netByMonth: Record<string, number> = {};
  for (const log of mvtls) {
    if (!log.serviceDate || !log.memberVoucher) continue;
    const m = toSGTMonthString(log.serviceDate);
    const startingBalance = toNumber(log.memberVoucher.startingBalance);
    const currentBalance = toNumber(log.currentBalance);
    const amountChange = Math.abs(toNumber(log.amountChange));
    const spent = startingBalance - currentBalance;
    const payments = voucherPayments.get(log.memberVoucherId) || [];
    const amountPaidUpTo = payments.filter((p) => p.createdAt.getTime() <= (log.serviceDate?.getTime() || 0)).reduce((s, p) => s + p.amount, 0);
    let revenueEarned = 0;
    if (spent === amountPaidUpTo) revenueEarned = amountChange;
    else if (spent - amountPaidUpTo < 0) revenueEarned = amountChange;
    else if (spent - amountPaidUpTo > 0) revenueEarned = Math.max(amountChange - (spent - amountPaidUpTo), 0);
    netByMonth[m] = (netByMonth[m] || 0) + revenueEarned;
  }

  // Combine into rows
  const allMonths = new Set<string>([...Object.keys(incomeByMonth), ...Object.keys(refundByMonth), ...Object.keys(netByMonth)]);
  const rows = Array.from(allMonths).sort().map((m) => {
    const income = Number((incomeByMonth[m] || 0).toFixed(2));
    const net_sale = Number((netByMonth[m] || 0).toFixed(2));
    const refund = Number((refundByMonth[m] || 0).toFixed(2));
    const deferred_amount = Number((income - net_sale - refund).toFixed(2));
    return { transaction_month: m, income, net_sale, refund, deferred_amount } as any;
  });

  return { result: { rows } } as any;
};

const getRevenueCellBreakdown = async (params: CellBreakdownParams) => {
  const prisma = getPrisma();
  const { tab, date, fieldKey } = params;

  const [year, month] = date.split('-').map((v) => parseInt(v, 10));
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const mvTypes = ['member voucher', 'Member Voucher', 'member_voucher', 'member-voucher'];
  const mcpTypes = [
    'member care package',
    'Member_Care_Package',
    'member-care-package',
    'member_care_package',
  ];
  const adhocTypes = ['service', 'product'];

  let itemTypes: string[];
  if (tab === 'mv') itemTypes = mvTypes;
  else if (tab === 'mcp') itemTypes = mcpTypes;
  else if (tab === 'adhoc') itemTypes = adhocTypes;
  else itemTypes = [...mvTypes, ...mcpTypes, ...adhocTypes];

  const saleItemFilter = {
    some: {
      OR: itemTypes.map((t) => ({ itemType: { equals: t, mode: 'insensitive' as const } })),
    },
  };

  let paymentMethodsFilter: any;
  if (fieldKey === 'refund') {
    paymentMethodsFilter = { paymentMethodName: { equals: 'Refund', mode: 'insensitive' as const } };
  } else if (fieldKey === 'gst') {
    paymentMethodsFilter = { paymentMethodName: { equals: 'GST', mode: 'insensitive' as const } };
  } else if (fieldKey === 'total' || fieldKey === 'net_sales' || fieldKey === 'vip' || fieldKey === 'package') {
    // For aggregate columns, show all income transactions
    paymentMethodsFilter = { isEnabled: true, isIncome: true };
  } else {
    // For specific payment method columns (e.g. 'cash', 'paynow')
    // We try to match the fieldKey to the payment method name
    // fieldKey from frontend is usually lowercased or formatted, so we use insensitive match
    // However, fieldKey might be 'cash' but name is 'Cash'.
    paymentMethodsFilter = { 
      paymentMethodName: { equals: fieldKey, mode: 'insensitive' as const },
      isEnabled: true, 
      isIncome: true 
    };
  }

  const ptRows = await prisma.paymentToSaleTransaction.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      paymentMethod: { is: paymentMethodsFilter },
      saleTransaction: {
        saleTransactionItems: saleItemFilter,
      },
    },
    include: { paymentMethod: true, saleTransaction: true },
  });

  const dayRows = ptRows.filter((r) => {
    if (!r.createdAt) return false;
    return toSGTDateString(r.createdAt) === date;
  });

  const transactions = dayRows.map((r) => ({
    id: Number(r.id),
    receipt_no: r.saleTransaction?.receiptNo || '',
    time: r.createdAt ? r.createdAt.toISOString() : '',
    amount: Number(Math.abs(toNumber(r.amount)).toFixed(2)),
    payment_method_id: r.paymentMethodId ? Number(r.paymentMethodId) : null,
    payment_method_name: r.paymentMethod?.paymentMethodName || '',
    category: r.saleTransaction?.customerType || tab.toUpperCase(),
  }));

  const total = transactions.reduce((s, t) => s + t.amount, 0);

  return {
    transactions,
    summary: {
      date,
      fieldKey,
      transaction_count: transactions.length,
      total_amount: Number(total.toFixed(2)),
    },
  };
};

const updateRevenueCellValue = async (params: UpdateCellParams) => {
  const prisma = getPrisma();
  const { mode, transactions = [], reason, oldValue, newValue, date, userId, fieldKey, columnLabel, tab } = params;

  if (mode === 'transactions' && transactions.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const t of transactions) {
        // If ID is a string starting with "new-", it's a new transaction
        if (typeof t.id === 'string' && t.id.startsWith('new-')) {
          if (!t.payment_method_id) {
             throw new Error('Payment method is required for new transactions');
          }
          
          // Create a new SaleTransaction for this manual entry
          // We set the date to noon SGT of the target date to ensure it falls in the day
          const targetDate = new Date(date);
          targetDate.setHours(12, 0, 0, 0);

          const newSale = await tx.saleTransaction.create({
            data: {
              receiptNo: `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              customerType: 'manual-adjustment',
              totalPaidAmount: new Decimal(t.amount),
              outstandingTotalPaymentAmount: new Decimal(0),
              gstAmount: new Decimal(0),
              saleTransactionStatus: 'FULL',
              processPayment: false,
              remarks: 'Manual revenue adjustment',
              createdBy: userId ? BigInt(userId) : undefined,
              handledBy: userId ? BigInt(userId) : undefined,
              createdAt: targetDate,
              updatedAt: new Date(),
            }
          });

          // Link a minimal item so revenue queries include this transaction
          await tx.saleTransactionItem.create({
            data: {
              saleTransactionId: newSale.id,
              serviceName: 'Manual Adjustment',
              productName: null,
              memberCarePackageId: null,
              memberVoucherId: null,
              originalUnitPrice: new Decimal(t.amount),
              customUnitPrice: new Decimal(t.amount),
              discountPercentage: new Decimal(0),
              quantity: 1,
              remarks: 'Manual revenue adjustment item',
              amount: new Decimal(t.amount),
              itemType: 'service',
            }
          });

          await tx.paymentToSaleTransaction.create({
            data: {
              saleTransactionId: newSale.id,
              paymentMethodId: BigInt(Number(t.payment_method_id)),
              amount: new Decimal(t.amount),
              createdAt: targetDate,
              updatedAt: new Date(),
              createdBy: userId ? BigInt(userId) : undefined,
              updatedBy: userId ? BigInt(userId) : undefined,
            }
          });

        } else {
          // Existing transaction update
          await tx.paymentToSaleTransaction.update({
            where: { id: BigInt(t.id) },
            data: {
              amount: new Decimal(t.amount),
            },
          });
          const updatedPayment = await tx.paymentToSaleTransaction.findUnique({
            where: { id: BigInt(t.id) },
            select: { saleTransactionId: true },
          });
          if (updatedPayment?.saleTransactionId) {
            const saleId = updatedPayment.saleTransactionId;
            const payments = await tx.paymentToSaleTransaction.findMany({
              where: { saleTransactionId: saleId },
              select: { amount: true, paymentMethodId: true },
            });
            const sale = await tx.saleTransaction.findUnique({
              where: { id: saleId },
              select: { totalPaidAmount: true, outstandingTotalPaymentAmount: true },
            });
            if (sale) {
              const totalAmount = toNumber(sale.totalPaidAmount) + toNumber(sale.outstandingTotalPaymentAmount);
              const newPaid = payments.reduce((sum, p) => {
                const pid = p.paymentMethodId ? Number(p.paymentMethodId) : undefined;
                const isPending = pid === 7;
                return sum + (isPending ? 0 : toNumber(p.amount));
              }, 0);
              const newOutstanding = Math.max(totalAmount - newPaid, 0);
              await tx.saleTransaction.update({
                where: { id: saleId },
                data: {
                  totalPaidAmount: new Decimal(newPaid),
                  outstandingTotalPaymentAmount: new Decimal(newOutstanding),
                  saleTransactionStatus: newOutstanding <= 0 ? 'FULL' : 'PARTIAL',
                },
              });
            }
          }
        }
      }
    });
  }
  // Manual override: create an adjustment transaction using the payment method inferred from the column
  else if (mode === 'override') {
    const delta = Number(newValue) - Number(oldValue);
    // If no change, skip
    if (Math.abs(delta) >= 0.0001) {
      // Resolve payment method: prefer columnLabel, fallback to fieldKey
      let nameToMatch = (columnLabel || fieldKey || '').trim();
      // Handle special case for GST display name
      if (nameToMatch.toLowerCase().includes('gst')) {
        nameToMatch = 'GST';
      }
      if (!nameToMatch) {
        throw new Error('Cannot determine payment method for override');
      }
      const method = await prisma.paymentMethod.findFirst({
        where: {
          paymentMethodName: { equals: nameToMatch, mode: 'insensitive' },
          isEnabled: true,
          isIncome: true,
        },
        select: { id: true, paymentMethodName: true },
      });
      if (!method) {
        throw new Error(`Payment method '${nameToMatch}' not found or not income-enabled`);
      }
      // Choose item type based on tab; default to 'service' to be included in Combined
      const itemType = tab === 'mv'
        ? 'member voucher'
        : tab === 'mcp'
        ? 'member care package'
        : 'service';

      await prisma.$transaction(async (tx) => {
        const targetDate = new Date(date);
        targetDate.setHours(12, 0, 0, 0);

        const newSale = await tx.saleTransaction.create({
          data: {
            receiptNo: `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            customerType: 'manual-adjustment',
            totalPaidAmount: new Decimal(delta),
            outstandingTotalPaymentAmount: new Decimal(0),
            gstAmount: new Decimal(0),
            saleTransactionStatus: 'FULL',
            processPayment: false,
            remarks: `Manual override: ${nameToMatch}`,
            createdBy: userId ? BigInt(userId) : undefined,
            handledBy: userId ? BigInt(userId) : undefined,
            createdAt: targetDate,
            updatedAt: new Date(),
          },
        });

        await tx.saleTransactionItem.create({
          data: {
            saleTransactionId: newSale.id,
            serviceName: 'Manual Override',
            productName: null,
            memberCarePackageId: null,
            memberVoucherId: null,
            originalUnitPrice: new Decimal(delta),
            customUnitPrice: new Decimal(delta),
            discountPercentage: new Decimal(0),
            quantity: 1,
            remarks: `Manual override for ${nameToMatch}`,
            amount: new Decimal(delta),
            itemType,
          },
        });

        await tx.paymentToSaleTransaction.create({
          data: {
            saleTransactionId: newSale.id,
            paymentMethodId: BigInt(Number(method.id)),
            amount: new Decimal(delta),
            createdAt: targetDate,
            updatedAt: new Date(),
            createdBy: userId ? BigInt(userId) : undefined,
            updatedBy: userId ? BigInt(userId) : undefined,
          },
        });
      });
    }
  }

  const logMessage = [
    'Revenue cell updated',
    `tab=${params.tab}`,
    `date=${params.date}`,
    `fieldKey=${params.fieldKey}`,
    `old=${oldValue.toFixed(2)}`,
    `new=${newValue.toFixed(2)}`,
    `reason=${reason}`,
    `userId=${params.userId ?? 'unknown'}`,
    mode === 'transactions'
      ? `transactions=${transactions.map((t) => `${t.id}:${t.amount}`).join(',')}`
      : 'mode=override',
  ].join(' | ');

  console.log(logMessage);
};

const getMCPDeferredRevenue = async () => {
  const prisma = getPrisma();
  // Income by month (MCP)
  const ptstIncome = await prisma.paymentToSaleTransaction.findMany({
    where: {
      paymentMethod: { is: { isEnabled: true, isIncome: true } },
      saleTransaction: { saleTransactionItems: { some: { itemType: { equals: 'member care package', mode: 'insensitive' } } } },
    },
    include: { paymentMethod: true },
  });
  const incomeByMonth: Record<string, number> = {};
  for (const r of ptstIncome) {
    if (!r.createdAt) continue;
    const m = toSGTMonthString(r.createdAt);
    incomeByMonth[m] = (incomeByMonth[m] || 0) + Math.abs(toNumber(r.amount));
  }

  // Refund by month (MCP)
  const refundMethod = await prisma.paymentMethod.findFirst({ where: { paymentMethodName: { equals: 'Refund', mode: 'insensitive' } } });
  const refundByMonth: Record<string, number> = {};
  if (refundMethod) {
    const ptRefund = await prisma.paymentToSaleTransaction.findMany({
      where: { paymentMethodId: refundMethod.id, saleTransaction: { saleTransactionItems: { some: { itemType: { equals: 'member care package', mode: 'insensitive' } } } } },
    });
    for (const r of ptRefund) {
      if (!r.createdAt) continue;
      const m = toSGTMonthString(r.createdAt);
      refundByMonth[m] = (refundByMonth[m] || 0) + Math.abs(toNumber(r.amount));
    }
  }

  // Net sales by month (MCP consumptions)
  const mcptls = await prisma.memberCarePackageTransactionLog.findMany({ where: { type: 'CONSUMPTION' } });
  const netByMonth: Record<string, number> = {};
  for (const r of mcptls) {
    if (!r.transactionDate) continue;
    const m = toSGTMonthString(r.transactionDate);
    netByMonth[m] = (netByMonth[m] || 0) + Math.abs(toNumber(r.amountChanged));
  }

  const allMonths = new Set<string>([...Object.keys(incomeByMonth), ...Object.keys(refundByMonth), ...Object.keys(netByMonth)]);
  const rows = Array.from(allMonths).sort().map((m) => {
    const income = Number((incomeByMonth[m] || 0).toFixed(2));
    const net_sale = Number((netByMonth[m] || 0).toFixed(2));
    const refund = Number((refundByMonth[m] || 0).toFixed(2));
    const deferred_amount = Number((income - net_sale - refund).toFixed(2));
    return { transaction_month: m, income, net_sale, refund, deferred_amount } as any;
  });

  return { result: { rows } } as any;
};

export default {
  getMVMonthlyReport,
  getMCPMonthlyReport,
  getAdHocMonthlyReport,
  getTransactionDateRange,
  getMVDeferredRevenue,
  getMCPDeferredRevenue,
  getRevenueCellBreakdown,
  updateRevenueCellValue,
};
