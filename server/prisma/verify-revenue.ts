import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyRevenue() {
  console.log('🔍 Verifying database contents...\n');

  try {
    // Check all tables
    const [
      saleTransactionCount,
      saleTransactionItemCount,
      paymentCount,
      memberCount,
      employeeCount,
      serviceCount,
      productCount,
    ] = await Promise.all([
      prisma.saleTransaction.count(),
      prisma.saleTransactionItem.count(),
      prisma.paymentToSaleTransaction.count(),
      prisma.member.count(),
      prisma.employee.count(),
      prisma.service.count(),
      prisma.product.count(),
    ]);

    console.log('📊 Database Record Counts:');
    console.log(`   Sale Transactions: ${saleTransactionCount}`);
    console.log(`   Sale Transaction Items: ${saleTransactionItemCount}`);
    console.log(`   Payments: ${paymentCount}`);
    console.log(`   Members: ${memberCount}`);
    console.log(`   Employees: ${employeeCount}`);
    console.log(`   Services: ${serviceCount}`);
    console.log(`   Products: ${productCount}\n`);

    if (saleTransactionCount === 0) {
      console.log('⚠️  No sale transactions found in database!\n');

      // Check if we have the required data to seed
      if (memberCount === 0 || employeeCount === 0 || serviceCount === 0) {
        console.log('❌ Missing required data. Please run:');
        console.log('   npm run db:seed\n');
      } else {
        console.log('✅ Required data exists. You can run:');
        console.log('   npm run db:seed:revenue\n');
      }
      return;
    }

    // Get sample transactions with dates
    const recentTransactions = await prisma.saleTransaction.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        saleTransactionItems: true,
        paymentToSaleTransactions: true,
      },
    });

    console.log('📋 Recent Transactions:');
    recentTransactions.forEach((tx, idx) => {
      console.log(`\n   ${idx + 1}. Receipt: ${tx.receiptNo}`);
      console.log(`      Date: ${tx.createdAt?.toLocaleString() || 'N/A'}`);
      console.log(`      Amount: $${tx.totalPaidAmount?.toString() || '0'}`);
      console.log(`      Items: ${tx.saleTransactionItems.length}`);
      console.log(`      Payments: ${tx.paymentToSaleTransactions.length}`);
    });

    // Get date range
    const oldestTransaction = await prisma.saleTransaction.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    const newestTransaction = await prisma.saleTransaction.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    console.log('\n📅 Transaction Date Range:');
    console.log(`   Oldest: ${oldestTransaction?.createdAt?.toLocaleDateString() || 'N/A'}`);
    console.log(`   Newest: ${newestTransaction?.createdAt?.toLocaleDateString() || 'N/A'}\n`);

    // Monthly breakdown
    const today = new Date();
    console.log('📊 Monthly Revenue Breakdown:\n');

    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
      const startDate = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
      const endDate = new Date(today.getFullYear(), today.getMonth() - monthOffset + 1, 0, 23, 59, 59);

      const monthTransactions = await prisma.saleTransaction.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalPaidAmount: true,
        },
      });

      const total = monthTransactions.reduce((sum, tx) => sum + (Number(tx.totalPaidAmount) || 0), 0);

      const monthName = startDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
      });

      console.log(`   ${monthName}: $${total.toFixed(2).padStart(10)} (${monthTransactions.length} transactions)`);
    }

    console.log('\n✅ Verification complete!\n');
  } catch (error) {
    console.error('❌ Error verifying data:', error);
    throw error;
  }
}

verifyRevenue()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
