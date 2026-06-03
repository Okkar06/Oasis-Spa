import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const parseRevenueData = (raw, paymentMethods) => {
  return raw.map(item => {
    const date = new Date(item.date);

    // Create an empty map for payment methods with default value 0
    const paymentMap = {};
    paymentMethods.forEach(method => {
      paymentMap[method.payment_method_name.toLowerCase()] = 0;
    });

    // Fill in actual values from the day's income
    item.income.forEach(entry => {
      const key = entry.payment_method_name.toLowerCase();
      paymentMap[key] = parseFloat(entry.amount) || 0;
    });

    return {
      day: date.getDate(),
      ...paymentMap, // dynamic payment method fields
      total: parseFloat(item.total_income) || 0,
      gst: parseFloat(item.gst) || 0, 
      vip: parseFloat(item.vip) || 0,
      package: parseFloat(item.package) || 0,
      net_sales: parseFloat(item.net_sales) || 0,
      refund: parseFloat(item.refund) || 0,
    };
  });
};


const calculateTotals = (data) => {
  return data.reduce((acc, item) => {
    Object.keys(item).forEach(key => {
      if (key !== 'day') acc[key] = (acc[key] || 0) + item[key];
    });
    return acc;
  }, {});
};

const mergeDataArrays = (...arrays) => {
  const map = new Map();
  arrays.flat().forEach(item => {
    const existing = map.get(item.day) || { day: item.day };

    Object.keys(item).forEach(key => {
      if (key === 'day') return;
      // Initialize if missing
      if (!existing.hasOwnProperty(key)) existing[key] = 0;
      existing[key] += item[key];
    });
    map.set(item.day, existing);
  });
  return Array.from(map.values()).sort((a, b) => a.day - b.day);
};

const fixedKeys = new Set(['day', 'total', 'gst', 'vip', 'package', 'net_sales', 'refund']);

export const useRevenueReportStore = create(persist(
  (set, get) => ({
    earliestDate: null,
    selectedMonth: months[new Date().getMonth()],
    selectedYear: new Date().getFullYear().toString(),
    resultMonth: months[new Date().getMonth()],
    resultYear: new Date().getFullYear().toString(),
    loading: false,
    error: null,

    reportData: [],
    mvData: [],
    mcpData: [],
    adhocData: [],
    combinedData: [],
    totals: {
      mv: {}, mcp: {}, adhoc: {}, combined: {}
    },

    // Add new state for deferred revenue data
    deferredRevenue: {
      mv: null,
      mcp: null
    },

    // Add new state for payment methods
    paymentMethods: [],
    paymentMethodsLoading: false,
    paymentMethodsError: null,

    setMonth: (month) => set({ selectedMonth: month }),
    setYear: (year) => set({ selectedYear: year }),
    setReportData: (data) => set({ reportData: data }),

    fetchEarliestDate: async () => {
      set({ loading: true, error: null });
      try {
        const res = await api.get('/rr/range');
        const date = new Date(res.data.data.range.earliest_created_at_sgt);
        set({ earliestDate: date });
      } catch (err) {
        set({ error: err.message || 'Failed to fetch earliest date' });
      } finally {
        set({ loading: false });
      }
    },

    applyCellUpdate: ({ tab, day, fieldKey, newValue }) => {
      set((state) => {
        const datasetKey =
          tab === 'mv' ? 'mvData' : tab === 'mcp' ? 'mcpData' : tab === 'adhoc' ? 'adhocData' : null;

        if (!datasetKey) {
          return state;
        }

        const updatedDataset = state[datasetKey].map((row) => {
          if (row.day !== day) return row;

          const updatedRow = { ...row, [fieldKey]: newValue };

          if (!fixedKeys.has(fieldKey)) {
            let totalIncome = 0;
            Object.keys(updatedRow).forEach((key) => {
              if (key === 'day') return;
              if (fixedKeys.has(key)) return;
              totalIncome += updatedRow[key] || 0;
            });
            updatedRow.total = totalIncome;

            if (tab === 'mv' || tab === 'mcp') {
              updatedRow.package = totalIncome;
            }
            if (tab === 'adhoc') {
              updatedRow.net_sales = totalIncome;
            }
          }

          return updatedRow;
        });

        const mv = tab === 'mv' ? updatedDataset : state.mvData;
        const mcp = tab === 'mcp' ? updatedDataset : state.mcpData;
        const adhoc = tab === 'adhoc' ? updatedDataset : state.adhocData;
        const combined = mergeDataArrays(mv, mcp, adhoc);

        return {
          ...state,
          mvData: mv,
          mcpData: mcp,
          adhocData: adhoc,
          combinedData: combined,
          totals: {
            mv: calculateTotals(mv),
            mcp: calculateTotals(mcp),
            adhoc: calculateTotals(adhoc),
            combined: calculateTotals(combined),
          },
        };
      });
    },

    // Add new function to fetch payment methods
    fetchPaymentMethods: async () => {
      set({ paymentMethodsLoading: true, paymentMethodsError: null });
      try {
        const res = await api.get('/payment-method/visible');
        const filteredPaymentMethods = res.data
          .filter(method => method.is_enabled && method.is_income)
          .map(method => ({
            id: method.id,
            payment_method_name: method.payment_method_name
          }));
        
        set({ paymentMethods: filteredPaymentMethods });
      } catch (err) {
        set({ paymentMethodsError: err.message || 'Failed to fetch payment methods' });
      } finally {
        set({ paymentMethodsLoading: false });
      }
    },

    fetchRevenueData: async () => {
      let { selectedMonth, selectedYear, paymentMethods, paymentMethodsLoading } = get();
      // Ensure payment methods are available before parsing revenue data
      if ((paymentMethods?.length ?? 0) === 0 && !paymentMethodsLoading) {
        try {
          await get().fetchPaymentMethods();
          paymentMethods = get().paymentMethods;
        } catch (e) {
          // Proceed even if payment methods failed; dynamic columns will still render totals
          paymentMethods = [];
        }
      }
      const monthIndex = months.indexOf(selectedMonth) + 1;
    
      set({ loading: true, error: null });
      try {
        const [mvRes, mcpRes, adhocRes, mvDrRes, mcpDrRes] = await Promise.all([
          api.get(`/rr/mrr/mv?year=${selectedYear}&month=${monthIndex}`),
          api.get(`/rr/mrr/mcp?year=${selectedYear}&month=${monthIndex}`),
          api.get(`/rr/mrr/adhoc?year=${selectedYear}&month=${monthIndex}`),
          api.get(`/rr/dr/mv?year=${selectedYear}&month=${monthIndex}`),
          api.get(`/rr/dr/mcp?year=${selectedYear}&month=${monthIndex}`),
        ]);
    
        const mv = parseRevenueData(mvRes.data.data, paymentMethods);
        const mcp = parseRevenueData(mcpRes.data.data, paymentMethods);
        const adhoc = parseRevenueData(adhocRes.data.data, paymentMethods);
        const combined = mergeDataArrays(mv, mcp, adhoc);

        set({
          mvData: mv,
          mcpData: mcp,
          adhocData: adhoc,
          combinedData: combined,
          reportData: combined,
          resultMonth: selectedMonth,
          resultYear: selectedYear,
          totals: {
            mv: calculateTotals(mv),
            mcp: calculateTotals(mcp),
            adhoc: calculateTotals(adhoc),
            combined: calculateTotals(combined),
          },
          // Store the deferred revenue data
          deferredRevenue: {
            mv: {
              ...mvDrRes.data.data,
              income: parseFloat(mvDrRes.data.data.income) || 0,
              net_sale: parseFloat(mvDrRes.data.data.net_sale) || 0,
              refund: parseFloat(mvDrRes.data.data.refund) || 0,
              deferred_amount: parseFloat(mvDrRes.data.data.deferred_amount) || 0,
              previous_total_deferred_amount: parseFloat(mvDrRes.data.data.previous_total_deferred_amount) || 0
            },
            mcp: {
              ...mcpDrRes.data.data,
              income: parseFloat(mcpDrRes.data.data.income) || 0,
              net_sale: parseFloat(mcpDrRes.data.data.net_sale) || 0,
              refund: parseFloat(mcpDrRes.data.data.refund) || 0,
              deferred_amount: parseFloat(mcpDrRes.data.data.deferred_amount) || 0,
              previous_total_deferred_amount: parseFloat(mcpDrRes.data.data.previous_total_deferred_amount) || 0
            }
          }
        });
      } catch (err) {
        set({ error: err.message || 'Failed to fetch revenue data' });
      } finally {
        set({ loading: false });
      }
    },

    getMonths: () => months,
  }),
  {
    name: 'revenue-report-storage', // localStorage key
    partialize: (state) => ({
      selectedMonth: state.selectedMonth,
      selectedYear: state.selectedYear,
      resultMonth: state.resultMonth,
      resultYear: state.resultYear,
      reportData: state.reportData,
      mvData: state.mvData,
      mcpData: state.mcpData,
      adhocData: state.adhocData,
      combinedData: state.combinedData,
      totals: state.totals,
      deferredRevenue: state.deferredRevenue, // Add deferred revenue to persisted state
      paymentMethods: state.paymentMethods // Add payment methods to persisted state
    })
  }
));

// Auto-fetch payment methods when the store is created
// This will run when the store is first initialized
const store = useRevenueReportStore.getState();
if (store.paymentMethods.length === 0) {
  store.fetchPaymentMethods();
}
