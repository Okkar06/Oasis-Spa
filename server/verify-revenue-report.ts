
import model from './models/revenueModel.js';

async function main() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  console.log(`Verifying MV Revenue Report for ${year}-${month}...`);

  try {
    const report = await model.getMVMonthlyReport(year, month);
    
    // Check if CDC Vouchers is present in income
    const cdcIncome = report.income.filter(i => i.payment_method_name === 'CDC Vouchers');
    
    console.log('CDC Vouchers Income entries:', cdcIncome);

    if (cdcIncome.length > 0) {
        const total = cdcIncome.reduce((sum, item) => sum + item.amount, 0);
        console.log(`SUCCESS: Found CDC Vouchers income! Total: ${total}`);
    } else {
        console.log('FAILURE: CDC Vouchers income not found in report.');
        console.log('All income entries:', report.income);
    }

  } catch (error) {
    console.error('Error verifying report:', error);
  }
}

main();
