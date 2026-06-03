import React, { useEffect, useMemo, useState } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Download, DollarSign, Tickets, Package, Wand } from 'lucide-react';
import { useRevenueReportStore } from '@/stores/revenue/revenueStore';
import MonthYearSelector from '@/components/revenue/revenueMonthYearSelector';
import * as XLSX from 'xlsx';
import api from '@/services/api';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';

function parseFloatSafe(val) {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

function RevenueReportPage() {
  const {
    earliestDate,
    reportData,
    selectedMonth,
    selectedYear,
    loading,
    error,
    setMonth,
    setYear,
    resultMonth,
    resultYear,
    fetchEarliestDate,
    fetchRevenueData,
    setReportData,
    mvData,
    mcpData,
    adhocData,
    combinedData,
    totals,
    paymentMethods,
    fetchPaymentMethods,
    applyCellUpdate,
  } = useRevenueReportStore();

  // Fixed columns that come after payment methods
  const fixedColumns = ['Total Income', 'GST (9%)', 'Total with GST', 'VIP', 'Package', 'Net Sales', 'Refund'];

  const [tab, setTab] = useState('combined');

  const [selectedCell, setSelectedCell] = useState(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [breakdownState, setBreakdownState] = useState({
    loading: false,
    error: null,
    transactions: [],
    summary: null,
    overrideAmount: '',
    overrideReason: '',
  });

  useEffect(() => {
    fetchEarliestDate();
  }, []);

  useEffect(() => {
    if (earliestDate) {
      const run = async () => {
        await fetchPaymentMethods();
        await fetchRevenueData();
      };
      run();
    }
  }, [earliestDate]);

  useEffect(() => {
    switch (tab) {
      case 'mv': setReportData(mvData); break;
      case 'mcp': setReportData(mcpData); break;
      case 'adhoc': setReportData(adhocData); break;
      default: setReportData(combinedData); break;
    }
  }, [tab, mvData, mcpData, adhocData, combinedData]);

  const currentTotals = useMemo(() => {
    const totalsData = totals[tab] || {};
    return totalsData;
  }, [totals, tab]);

  // Helper function to get the correct property name for payment methods
  const getPaymentMethodKey = (methodName) => {
    const lowerMethod = methodName.toLowerCase();
    return lowerMethod;
  };

  const fixedKeys = new Set(['day', 'total', 'gst', 'vip', 'package', 'net_sales', 'refund']);

  const isNumericCellEditable = (key) => {
    const lower = String(key || '').toLowerCase();
    if (lower === 'vip' || lower === 'package' || lower === 'refund' || lower === 'gst') return true;
    if (fixedKeys.has(lower)) return false;
    return true;
  };

  // Helper function to get total value for a payment method
  const getTotalValue = (methodName) => {
    const key = getPaymentMethodKey(methodName);
    return currentTotals[key] || 0;
  };

  const handleGetReport = async () => {
    await fetchPaymentMethods();
    await fetchRevenueData();
  };

  const getDateForDay = (day) => {
    const year = parseInt(resultYear, 10);
    const temp = new Date(`${resultMonth} 1, ${resultYear}`);
    const monthIndex = temp.getMonth() + 1;
    const m = String(monthIndex).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  const loadCellBreakdown = async ({ day, fieldKey, columnLabel, value }) => {
    const date = getDateForDay(day);
    const type = tab;

    setBreakdownState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      transactions: [],
      summary: null,
      overrideAmount:
        typeof value === 'number' ? value.toFixed(2) : value != null ? String(value) : '',
      overrideReason: '',
    }));
    setIsBreakdownOpen(true);

    try {
      const res = await api.get('/rr/cell-breakdown', {
        params: {
          tab: type,
          date,
          fieldKey,
          columnLabel,
        },
      });

      const data = res.data?.data || {};
      const list = data.transactions || [];

      setBreakdownState((prev) => ({
        ...prev,
        loading: false,
        error: null,
        transactions: list.map((t) => ({
          id: t.id,
          receipt_no: t.receipt_no,
          time: t.time,
          amount: Number(t.amount),
          payment_method_id: t.payment_method_id,
          payment_method_name: t.payment_method_name,
          category: t.category,
        })),
        summary: data.summary || null,
        overrideAmount:
          data.override && typeof data.override.amount === 'number'
            ? data.override.amount.toFixed(2)
            : typeof value === 'number'
            ? value.toFixed(2)
            : value != null
            ? String(value)
            : '',
      }));
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to load breakdown';
      setBreakdownState((prev) => ({
        ...prev,
        loading: false,
        error: message,
        transactions: [],
        summary: null,
      }));
    }
  };

  const handleCellClick = (row, fieldKey, columnLabel) => {
    if (!row || !fieldKey) return;
    let value = row[fieldKey];
    if (typeof value !== 'number') {
      const parsed = parseFloatSafe(value);
      value = isNaN(parsed) ? 0 : parsed;
    }

    setSelectedCell({
      day: row.day,
      fieldKey,
      columnLabel,
      value,
      tab,
    });

    loadCellBreakdown({
      day: row.day,
      fieldKey,
      columnLabel,
      value,
    });
  };

  const handleSaveInlineEdit = async () => {
    if (!selectedCell) return;

    const { day, fieldKey, columnLabel, value: oldValue, tab: selectedTab } = selectedCell;
    const isCombinedTab = selectedTab === 'combined';

    const hasTx = breakdownState.transactions && breakdownState.transactions.length > 0;

    let newValue;
    if (hasTx) {
      newValue = breakdownState.transactions.reduce(
        (acc, t) => acc + (Number(t.amount) || 0),
        0
      );
    } else {
      newValue = Number(breakdownState.overrideAmount || 0);
    }

    if (!(newValue >= 0)) {
      toast('Amount must be greater than or equal to 0');
      return;
    }

    if (!breakdownState.overrideReason.trim()) {
      toast('Please provide a reason for the change.');
      return;
    }

    // Validate new transactions: require payment method and non-negative amount
    if (hasTx) {
      for (const t of breakdownState.transactions) {
        const isNew = String(t.id).startsWith('new-');
        const amountNum = Number(t.amount);
        if (isNew) {
          if (!t.payment_method_id) {
            toast('Select a payment method for new transactions.');
            return;
          }
          if (!(amountNum >= 0)) {
            toast('Enter a valid amount (>= 0) for new transactions.');
            return;
          }
        }
      }
    }

    const payload = {
      tab: selectedTab,
      date: getDateForDay(day),
      fieldKey,
      columnLabel,
      oldValue,
      newValue,
      reason: breakdownState.overrideReason,
      mode: hasTx ? 'transactions' : 'override',
      transactions: hasTx
        ? breakdownState.transactions.map((t) => ({
            id: t.id,
            amount: Number(t.amount),
            payment_method_id: t.payment_method_id,
          }))
        : [],
    };

    try {
      await api.post('/rr/cell-update', payload);
      toast(
        `Updated Day ${day} ${columnLabel}: ${oldValue.toFixed(2)} → ${newValue.toFixed(2)}`
      );
      // Refresh data to ensure all columns (e.g. Total vs individual payment methods) are consistent
      await fetchRevenueData();

      setIsBreakdownOpen(false);
      setBreakdownState({
        loading: false,
        error: null,
        transactions: [],
        overrideAmount: '',
        overrideReason: '',
      });
      setSelectedCell(null);
    } catch (err) {
      console.error('Failed to save cell update:', err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save changes. Please try again.';
      setBreakdownState((prev) => ({
        ...prev,
        error: message,
      }));
    }
  };

  // Derive dynamic payment methods from store plus any extra method keys present in data
  const derivedPaymentMethods = useMemo(() => {
    const knownNames = new Set((paymentMethods || []).map(m => (m.payment_method_name || '').toLowerCase()));
    const extras = new Set();
    const fixedKeys = new Set(['day','total','gst','vip','package','net_sales','refund']);
    for (const row of reportData || []) {
      for (const key of Object.keys(row)) {
        const lower = key.toLowerCase();
        if (!fixedKeys.has(lower) && lower !== 'day' && !knownNames.has(lower)) {
          extras.add(lower);
        }
      }
    }
    const extraList = Array.from(extras).map((name, idx) => ({ id: `extra-${idx}-${name}`, payment_method_name: name }));
    const allMethods = [...(paymentMethods || []), ...extraList];
    // Filter out GST if it accidentally appears in payment methods to avoid duplication
    return allMethods.filter(m => (m.payment_method_name || '').toLowerCase() !== 'gst');
  }, [paymentMethods, reportData]);

  const formatAmount = (val) => (val && val !== '0.00' ? parseFloatSafe(val).toFixed(2) : '');

  const handleDownloadExcel = () => {
    if (!reportData || reportData.length === 0) {
      alert('No data available to download. Please generate a report first.');
      return;
    }

    // Get current date for download timestamp
    const downloadDate = new Date();
    const downloadDateStr = downloadDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Create title based on tab type
    const tabLabels = {
      combined: 'Combined',
      mv: 'MV',
      mcp: 'MCP',
      adhoc: 'Ad Hoc'
    };

    const title = `${tabLabels[tab]} Monthly Revenue Report of ${resultMonth} ${resultYear}`;
    const subtitle = `Downloaded at ${downloadDateStr}`;

    // Create dynamic headers array
    const headers = [
      'Day',
      ...derivedPaymentMethods.map(method => method.payment_method_name),
      ...fixedColumns
    ];

    // Prepare data for Excel
    const excelData = [
      [title], // Title row
      [subtitle], // Subtitle row
      [], // Empty row
      headers, // Dynamic header row
      ...reportData.map(row => [
        row.day,
        // Dynamic payment method columns
        ...derivedPaymentMethods.map(method => {
          const key = getPaymentMethodKey(method.payment_method_name);
          return parseFloatSafe(row[key]).toFixed(2);
        }),
        // Fixed columns
        parseFloatSafe(row.total).toFixed(2),
        parseFloatSafe(row.gst).toFixed(2),
        (parseFloatSafe(row.total) + parseFloatSafe(row.gst)).toFixed(2),
        parseFloatSafe(row.vip).toFixed(2),
        parseFloatSafe(row.package).toFixed(2),
        parseFloatSafe(row.net_sales).toFixed(2),
        parseFloatSafe(row.refund).toFixed(2)
      ]),
      // Dynamic total row
      [
        'Total',
        // Dynamic payment method totals
        ...derivedPaymentMethods.map(method => getTotalValue(method.payment_method_name).toFixed(2)),
        // Fixed totals
        (currentTotals.total || 0).toFixed(2),
        (currentTotals.gst || 0).toFixed(2),
        ((parseFloatSafe(currentTotals.total) || 0) + (parseFloatSafe(currentTotals.gst) || 0)).toFixed(2),
        (currentTotals.vip || 0).toFixed(2),
        (currentTotals.package || 0).toFixed(2),
        (currentTotals.net_sales || 0).toFixed(2),
        (currentTotals.refund || 0).toFixed(2)
      ],
    ];

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);

    // Set dynamic column widths
    const totalColumns = 1 + derivedPaymentMethods.length + fixedColumns.length;
    const colWidths = [
      { wch: 5 },  // Day
      ...derivedPaymentMethods.map(() => ({ wch: 10 })), // Payment methods
      { wch: 10 }, // Total Income
      { wch: 10 }, // GST
      { wch: 12 }, // Total with GST
      { wch: 10 }, // VIP
      { wch: 10 }, // Package
      { wch: 12 }, // Net Sales
      { wch: 10 }  // Refund
    ];
    ws['!cols'] = colWidths;

    // Style the title and subtitle rows
    if (ws['A1']) {
      ws['A1'].s = {
        font: { bold: true, sz: 14 },
        alignment: { horizontal: 'center' }
      };
    }
    if (ws['A2']) {
      ws['A2'].s = {
        font: { italic: true, sz: 10 },
        alignment: { horizontal: 'center' }
      };
    }

    // Merge cells for title and subtitle
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } }, // Title row
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalColumns - 1 } }, // Subtitle row
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Revenue Report');

    // Generate filename
    const timestamp = downloadDate.toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const filename = `${tabLabels[tab]}_Revenue_Report_${resultMonth}_${resultYear}_${timestamp}.xlsx`;

    // Save file
    XLSX.writeFile(wb, filename);
  };

  const tabOptions = [
    { key: 'combined', label: 'Combined', icon: DollarSign },
    { key: 'mv', label: 'MV', icon: Tickets },
    { key: 'mcp', label: 'MCP', icon: Package },
    { key: 'adhoc', label: 'Ad Hoc', icon: Wand }
  ];

  const getTabClasses = (tabKey, index) => {
    const isActive = tab === tabKey;
    const isFirst = index === 0;
    const isLast = index === tabOptions.length - 1;

    let classes = "inline-block w-full p-4 transition-all duration-200";

    if (isActive) {
      classes += " text-white bg-black border-r border-gray-200";
    } else {
      classes += " bg-white border-r border-gray-200 hover:text-gray-700 hover:bg-gray-50";
    }

    if (isFirst) {
      classes += " rounded-s-lg";
    }
    if (isLast) {
      classes += " rounded-e-lg border-s-0";
    }

    return classes;
  };

  if (loading && !earliestDate) {
    return <div className="p-6 text-center">Loading date restrictions...</div>;
  }

  if (error && !earliestDate) {
    return <div className="p-6 text-center text-red-500">Error loading date: {error}</div>;
  }

  return (
    <div className='[--header-height:calc(theme(spacing.14))] h-screen overflow-hidden'>
      <SidebarProvider className='flex flex-col h-full'>
        <SiteHeader />
        <div className='flex flex-1 min-h-0'>
          <AppSidebar />
          <SidebarInset className="flex flex-col min-w-0 flex-1">
            <div className="bg-white rounded-lg shadow-md p-6 flex flex-col h-full min-h-0">
              {/* Sticky header controls (title, selector, tabs) */}
              <div className="sticky top-0 z-30 bg-white pb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-bold">Revenue Report</h2>
                    <div className="text-sm text-gray-600">Monthly report of {resultMonth} {resultYear}</div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleDownloadExcel}
                      className="bg-green-600 text-white p-3 rounded hover:bg-green-700 transition-colors"
                      disabled={!reportData || reportData.length === 0}
                      title="Download Excel Report"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Using the new MonthYearSelector component */}
                <MonthYearSelector
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  onMonthChange={setMonth}
                  onYearChange={setYear}
                  onGetReport={handleGetReport}
                  loading={loading}
                  earliestDate={earliestDate}
                  buttonText="Get Report"
                  buttonClassName="bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-600"
                  containerClassName="flex items-center space-x-4 mb-4"
                />

                {/* Enhanced Tab Navigation */}
                <div className="mb-2">
                  {/* Mobile dropdown */}
                  <div className="sm:hidden">
                    <label htmlFor="tabs" className="sr-only">Select report type</label>
                    <select
                      id="tabs"
                      value={tab}
                      onChange={(e) => setTab(e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    >
                      {tabOptions.map(({ key, label }) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Desktop tabs */}
                  <div className="hidden sm:flex">
                    <ul className="inline-flex text-sm font-medium text-black rounded-lg shadow-sm">
                      {tabOptions.map(({ key, label, icon: Icon }, index) => (
                        <li key={key} className="focus-within:z-10">
                          <button
                            onClick={() => setTab(key)}
                            className={`inline-flex items-center ${getTabClasses(key, index)}`}
                            aria-current={tab === key ? "page" : undefined}
                          >
                            <Icon className="w-4 h-4 mr-2" />
                            {label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded flex-shrink-0">
                  Error loading revenue data: {error}
                </div>
              )}
              
              <div className="flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-auto relative">
                  {loading ? (
                    <div className="flex justify-center items-center h-32">Loading revenue data...</div>
                  ) : (
                    <table className="min-w-full w-full table-fixed border border-gray-200">
                      <thead className="bg-white z-40 shadow relative">
                        <tr className="bg-gray-100">
                          {/* Day column */}
                          <th className="border border-gray-300 px-4 py-2 sticky top-0 left-0 bg-gray-100 z-50 w-[80px] min-w-[80px]">Day</th>

                          {/* Dynamic payment method columns */}
                          {derivedPaymentMethods.map(method => (
                            <th key={method.id} className="border border-gray-300 px-4 py-2 whitespace-nowrap min-w-[100px] sticky top-0 bg-white z-40">
                              {method.payment_method_name}
                            </th>
                          ))}

                          {/* Fixed columns */}
                          {fixedColumns.map(header => (
                            <th key={header} className="border border-gray-300 px-4 py-2 whitespace-nowrap min-w-[100px] sticky top-0 bg-white z-40">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.length > 0 ? (
                          <>
                            {reportData.map((row, index) => {
                              return (
                                <tr key={row.day} className="hover:bg-gray-50">
                                  {/* Day column - sticky */}
                                  <td className="border border-gray-300 px-4 py-2 text-center sticky left-0 bg-white z-30 font-medium w-[80px] min-w-[80px]">{row.day}</td>

                                  {/* Dynamic payment method columns */}
                                  {derivedPaymentMethods.map(method => {
                                    const key = getPaymentMethodKey(method.payment_method_name);
                                    const rawVal = row[key];
                                    const clickable = isNumericCellEditable(key);
                                    return (
                                      <td
                                        key={method.id}
                                        className={
                                          'border border-gray-300 px-4 py-2 text-center whitespace-nowrap' +
                                          (clickable
                                            ? ' cursor-pointer hover:bg-yellow-50'
                                            : '')
                                        }
                                        onClick={() =>
                                          clickable &&
                                          handleCellClick(
                                            row,
                                            key,
                                            method.payment_method_name
                                          )
                                        }
                                      >
                                        {formatAmount(rawVal)}
                                      </td>
                                    );
                                  })}

                                  {/* Fixed columns */}
                                  <td
                                    className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap cursor-pointer hover:bg-yellow-50"
                                    onClick={() =>
                                      handleCellClick(row, 'total', 'Total Income')
                                    }
                                  >
                                    {formatAmount(row.total)}
                                  </td>
                                  <td
                                    className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap cursor-pointer hover:bg-yellow-50"
                                    onClick={() =>
                                      handleCellClick(row, 'gst', 'GST (9%)')
                                    }
                                  >
                                    {formatAmount(row.gst)}
                                  </td>
                                  <td
                                    className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap cursor-pointer hover:bg-yellow-50"
                                    onClick={() =>
                                      handleCellClick(
                                        {
                                          ...row,
                                          total_with_gst:
                                            parseFloatSafe(row.total) +
                                            parseFloatSafe(row.gst),
                                        },
                                        'total_with_gst',
                                        'Total with GST'
                                      )
                                    }
                                  >
                                    {formatAmount(
                                      parseFloatSafe(row.total) +
                                        parseFloatSafe(row.gst)
                                    )}
                                  </td>
                                  <td
                                    className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap cursor-pointer hover:bg-yellow-50"
                                    onClick={() =>
                                      handleCellClick(row, 'vip', 'VIP')
                                    }
                                  >
                                    {formatAmount(row.vip)}
                                  </td>
                                  <td
                                    className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap cursor-pointer hover:bg-yellow-50"
                                    onClick={() =>
                                      handleCellClick(row, 'package', 'Package')
                                    }
                                  >
                                    {formatAmount(row.package)}
                                  </td>
                                  <td
                                    className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap cursor-pointer hover:bg-yellow-50"
                                    onClick={() =>
                                      handleCellClick(row, 'net_sales', 'Net Sales')
                                    }
                                  >
                                    {formatAmount(row.net_sales)}
                                  </td>
                                  <td
                                    className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap cursor-pointer hover:bg-yellow-50"
                                    onClick={() =>
                                      handleCellClick(row, 'refund', 'Refund')
                                    }
                                  >
                                    {formatAmount(row.refund)}
                                  </td>
                                </tr>
                              );
                            })}

                            {/* Dynamic Totals row */}
                             <tr className="bg-gray-200 font-semibold sticky bottom-0 z-30">
                              <td className="border border-gray-300 px-4 py-2 text-center sticky left-0 bg-gray-200 z-40 w-[80px] min-w-[80px]">Total</td>

                              {/* Dynamic payment method totals */}
                              {derivedPaymentMethods.map((method, index) => (
                                <td key={method.id} className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap bg-gray-200">
                                  <div className="flex flex-col">
                                    <span>{getTotalValue(method.payment_method_name).toFixed(2)}</span>
                                  </div>
                                </td>
                              ))}

                              {/* Fixed totals columns */}
                              <td className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap bg-gray-200">
                                <div className="flex flex-col">
                                  <span>{(currentTotals.total || 0).toFixed(2)}</span>
                                </div>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap bg-gray-200">
                                <div className="flex flex-col">
                                  <span>{(currentTotals.gst || 0).toFixed(2)}</span>
                                </div>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap bg-gray-200">
                                <div className="flex flex-col">
                                  <span>{((parseFloatSafe(currentTotals.total) || 0) + (parseFloatSafe(currentTotals.gst) || 0)).toFixed(2)}</span>
                                </div>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap bg-gray-200">
                                <div className="flex flex-col">
                                  <span>{(currentTotals.vip || 0).toFixed(2)}</span>
                                </div>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap bg-gray-200">
                                <div className="flex flex-col">
                                  <span>{(currentTotals.package || 0).toFixed(2)}</span>
                                </div>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap bg-gray-200">
                                <div className="flex flex-col">
                                  <span>{(currentTotals.net_sales || 0).toFixed(2)}</span>
                                </div>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center whitespace-nowrap bg-gray-200">
                                <div className="flex flex-col">
                                  <span>{(currentTotals.refund || 0).toFixed(2)}</span>
                                </div>
                              </td>
                            </tr>
                          </>
                        ) : (
                          <tr>
                            <td colSpan={1 + derivedPaymentMethods.length + fixedColumns.length} className="border border-gray-300 px-4 py-8 text-center text-gray-500">
                              No data available. Please select a month and year and click "Get Report".
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <Sheet open={isBreakdownOpen} onOpenChange={setIsBreakdownOpen}>
                <SheetContent side="right" className="flex flex-col">
                  <SheetHeader>
                    <SheetTitle>
                      Breakdown / Source
                      {selectedCell
                        ? ` – Day ${selectedCell.day}, ${resultMonth} ${resultYear} (${selectedCell.columnLabel})`
                        : ''}
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-auto px-4">
                    {breakdownState.loading && (
                      <div className="py-4 text-sm text-gray-500">
                        Loading breakdown...
                      </div>
                    )}

                    {breakdownState.error && !breakdownState.loading && (
                      <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {breakdownState.error}
                      </div>
                    )}

                    {selectedCell && !breakdownState.loading && (
                      <>
                        <div className="mb-4 space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">Current value</span>
                            <span>
                              {selectedCell.value.toFixed
                                ? selectedCell.value.toFixed(2)
                                : selectedCell.value}
                            </span>
                          </div>

                          <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="mb-1 text-xs font-medium uppercase text-gray-500">
                              Calculation summary
                            </div>
                            <CalculationSummary
                              row={reportData.find(
                                (r) => r.day === selectedCell.day
                              )}
                              derivedPaymentMethods={derivedPaymentMethods}
                              getPaymentMethodKey={getPaymentMethodKey}
                            />
                          </div>
                        </div>

                        <div className="mb-6">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-medium">
                              Source transactions
                            </span>
                            <span className="text-xs text-gray-500">
                              Editing transactions will recompute this cell
                            </span>
                          </div>

                          <TransactionEditor
                            transactions={breakdownState.transactions || []}
                            onChange={(txs) =>
                              setBreakdownState((prev) => ({
                                ...prev,
                                transactions: txs,
                              }))
                            }
                            paymentMethods={paymentMethods}
                          />
                        </div>

                        <div className="mb-6">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-medium">
                              Manual override
                            </span>
                            <span className="text-xs text-gray-500">
                              Reason is required
                            </span>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                              <label htmlFor="override-amount" className="text-xs font-medium text-gray-600">
                                Override amount
                              </label>
                              <input
                                id="override-amount"
                                type="number"
                                min="0"
                                step="0.01"
                                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                                value={breakdownState.overrideAmount}
                                onChange={(e) =>
                                  setBreakdownState((prev) => ({
                                    ...prev,
                                    overrideAmount: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label htmlFor="override-reason" className="text-xs font-medium text-gray-600">
                                Reason
                              </label>
                              <textarea
                                id="override-reason"
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                rows={3}
                                value={breakdownState.overrideReason}
                                onChange={(e) =>
                                  setBreakdownState((prev) => ({
                                    ...prev,
                                    overrideReason: e.target.value,
                                  }))
                                }
                                placeholder="Explain why this value is adjusted."
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <SheetFooter>
                    <div className="flex w-full justify-between space-x-2">
                      <button
                        type="button"
                        className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                        onClick={() => setIsBreakdownOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="flex-1 rounded bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                        onClick={handleSaveInlineEdit}
                        disabled={breakdownState.loading || !selectedCell}
                      >
                        Save changes
                      </button>
                    </div>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

function CalculationSummary({ row, derivedPaymentMethods, getPaymentMethodKey }) {
  if (!row) return null;

  let totalIncome = 0;
  derivedPaymentMethods.forEach((method) => {
    const key = getPaymentMethodKey(method.payment_method_name);
    totalIncome += row[key] || 0;
  });

  const gst = row.gst || 0;
  const totalWithGst = totalIncome + gst;
  const netSales = row.net_sales || 0;
  const refund = row.refund || 0;

  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span>Total Income</span>
        <span>{totalIncome.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>GST (9%)</span>
        <span>{gst.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>Total with GST</span>
        <span>{totalWithGst.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>Net Sales</span>
        <span>{netSales.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>Refund</span>
        <span>{refund.toFixed(2)}</span>
      </div>
    </div>
  );
}

function TransactionEditor({ transactions, onChange, paymentMethods = [] }) {
  const handleAmountChange = (id, value) => {
    const next = transactions.map((t) =>
      t.id === id ? { ...t, amount: value === '' ? '' : Number(value) } : t
    );
    onChange(next);
  };

  const handleAddTransaction = () => {
    const newTx = {
      id: `new-${Date.now()}`,
      receipt_no: 'MANUAL',
      time: new Date().toISOString(),
      payment_method_name: '',
      payment_method_id: '',
      category: 'manual',
      amount: 0,
    };
    onChange([...transactions, newTx]);
  };

  const handlePaymentMethodChange = (id, methodId) => {
    const method = paymentMethods.find(m => String(m.id) === String(methodId));
    const next = transactions.map((t) =>
      t.id === id ? { 
        ...t, 
        payment_method_id: Number(methodId),
        payment_method_name: method ? method.payment_method_name : '' 
      } : t
    );
    onChange(next);
  };

  const handleDelete = (id) => {
    onChange(transactions.filter(t => t.id !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-64 overflow-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Receipt</th>
              <th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-left">Payment Method</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-2">{t.receipt_no || '-'}</td>
                <td className="px-3 py-2">
                  {t.time ? new Date(t.time).toLocaleTimeString() : '-'}
                </td>
                <td className="px-3 py-2">
                  {String(t.id).startsWith('new-') ? (
                    <select
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      value={t.payment_method_id || ''}
                      onChange={(e) => handlePaymentMethodChange(t.id, e.target.value)}
                    >
                      <option value="">Select...</option>
                      {paymentMethods.map(pm => (
                        <option key={pm.id} value={pm.id}>{pm.payment_method_name}</option>
                      ))}
                    </select>
                  ) : (
                    t.payment_method_name || '-'
                  )}
                </td>
                <td className="px-3 py-2">{t.category || '-'}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                    value={t.amount === '' ? '' : Number(t.amount).toFixed(2)}
                    onChange={(e) => handleAmountChange(t.id, e.target.value)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  {String(t.id).startsWith('new-') && (
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="text-red-500 hover:text-red-700 font-bold"
                      title="Remove"
                    >
                      &times;
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-gray-500 italic">
                  No transactions found. You can add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={handleAddTransaction}
        className="self-start rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 border border-gray-300 transition-colors"
      >
        + Add Transaction
      </button>
    </div>
  );
}

export default RevenueReportPage;
