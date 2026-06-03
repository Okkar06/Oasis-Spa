import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanRevenue() {
  console.log('🧹 Cleaning revenue data...');

  try {
    // Delete in order of dependencies
    const deletedPayments = await prisma.paymentToSaleTransaction.deleteMany({});
    console.log(`   ✅ Deleted ${deletedPayments.count} payment records`);

    const deletedItems = await prisma.saleTransactionItem.deleteMany({});
    console.log(`   ✅ Deleted ${deletedItems.count} sale transaction items`);

    const deletedTransactions = await prisma.saleTransaction.deleteMany({});
    console.log(`   ✅ Deleted ${deletedTransactions.count} sale transactions`);

    console.log('✨ Revenue data cleaned successfully!');
  } catch (error) {
    console.error('❌ Error cleaning revenue data:', error);
    throw error;
  }
}

cleanRevenue()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
