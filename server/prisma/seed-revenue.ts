import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function seedRevenue() {
  console.log('🚀 Starting revenue data seeding...\n');

  try {
    // Verify existing data
    console.log('🔍 Checking for existing data...');
    
    // Ensure CDC Vouchers payment method exists
    console.log('💳 Ensuring CDC Vouchers payment method exists...');
    const existingCDC = await prisma.paymentMethod.findFirst({
      where: { paymentMethodName: 'CDC Vouchers' },
    });

    if (!existingCDC) {
      await prisma.paymentMethod.create({
        data: {
          paymentMethodName: 'CDC Vouchers',
          isEnabled: true,
          isIncome: true,
          showOnPaymentPage: true,
          isProtected: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      console.log('   ✅ Created CDC Vouchers payment method');
    } else {
      console.log('   ℹ️ CDC Vouchers payment method already exists');
    }

    // Ensure GST payment method exists
    console.log('💳 Ensuring GST payment method exists...');
    const existingGST = await prisma.paymentMethod.findFirst({
      where: { paymentMethodName: 'GST' },
    });

    if (!existingGST) {
      await prisma.paymentMethod.create({
        data: {
          paymentMethodName: 'GST',
          isEnabled: true,
          isIncome: true,
          showOnPaymentPage: false,
          isProtected: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      console.log('   ✅ Created GST payment method');
    } else {
      console.log('   ℹ️ GST payment method already exists');
    }

    const [memberCount, employeeCount, serviceCount, productCount, paymentMethodCount] = await Promise.all([
      prisma.member.count(),
      prisma.employee.count(),
      prisma.service.count(),
      prisma.product.count(),
      prisma.paymentMethod.count(),
    ]);

    console.log(`   Members: ${memberCount}`);
    console.log(`   Employees: ${employeeCount}`);
    console.log(`   Services: ${serviceCount}`);
    console.log(`   Products: ${productCount}`);
    console.log(`   Payment Methods: ${paymentMethodCount}\n`);

    if (memberCount === 0 || employeeCount === 0 || serviceCount === 0) {
      console.error('❌ Error: Missing required data. Please run the main seed first:');
      console.error('   npm run db:seed\n');
      process.exit(1);
    }

    // Get existing data
    const [members, employees, services, products, paymentMethods] = await Promise.all([
      prisma.member.findMany({ take: 10 }),
      prisma.employee.findMany({ take: 10 }),
      prisma.service.findMany({ take: 10 }),
      prisma.product.findMany({ take: 10 }),
      prisma.paymentMethod.findMany({ where: { isEnabled: true } }),
    ]);

    // Ensure we have some member care packages for revenue seeding
    let memberCarePackages = await prisma.memberCarePackage.findMany({ take: 20 });
    if (memberCarePackages.length === 0) {
      console.log('ℹ️ No Member Care Packages found. Creating sample MCPs for seeding...');
      const now = new Date();
      const mcpCreates = [] as any[];
      for (let i = 0; i < Math.min(members.length, 5); i++) {
        const m = members[i];
        const emp = employees[i % employees.length];
        mcpCreates.push(
          prisma.memberCarePackage.create({
            data: {
              memberId: m.id,
              employeeId: emp.id,
              packageName: 'Relaxation Package',
              status: 'Active',
              totalPrice: new Decimal(400),
              balance: new Decimal(400),
              packageRemarks: 'Seeded MCP for demo revenue',
              createdAt: now,
              updatedAt: now,
            },
          })
        );
      }
      memberCarePackages = await Promise.all(mcpCreates);
    }

    // Fetch vouchers to include voucher purchases in revenue
    const memberVouchers = await prisma.memberVoucher.findMany({ take: 50 });

    console.log('📊 Creating sale transactions...\n');
    console.log(`   Current Date: ${new Date().toLocaleDateString()}\n`);

    const now = new Date();
    const saleTransactions = [];
    let totalTransactionCount = 0;

    // Create transactions for the PAST 6 months
    for (let monthsBack = 0; monthsBack < 6; monthsBack++) {
      // Calculate target month by going back from current date
      const targetDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
      const targetYear = targetDate.getFullYear();
      const targetMonth = targetDate.getMonth();

      const transactionsPerMonth =
        monthsBack === 0
          ? Math.floor(Math.random() * 21) + 20 // 20-40 for current month
          : Math.floor(Math.random() * 16) + 15; // 15-30 for past months

      for (let i = 0; i < transactionsPerMonth; i++) {
        const transactionDate = new Date(targetYear, targetMonth, 1);

        if (monthsBack === 0) {
          // Current month: use dates up to today
          const maxDay = now.getDate();
          transactionDate.setDate(Math.floor(Math.random() * maxDay) + 1);
        } else {
          // Past months: use any day
          const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
          transactionDate.setDate(Math.floor(Math.random() * daysInMonth) + 1);
        }

        // Set random time during business hours
        transactionDate.setHours(Math.floor(Math.random() * 12) + 9, Math.floor(Math.random() * 60), 0, 0);

        const member = members[Math.floor(Math.random() * members.length)];
        const handledBy = employees[Math.floor(Math.random() * employees.length)];
        const isWalkIn = Math.random() > 0.65; // 35% walk-in customers

        // Randomly select 1-4 items
        const itemCount = Math.floor(Math.random() * 3) + 1;
        let totalAmount = new Decimal(0);
        const items = [];

        for (let j = 0; j < itemCount; j++) {
          const isService = Math.random() > 0.25; // 75% services, 25% products

          if (isService && services.length > 0) {
            const service = services[Math.floor(Math.random() * services.length)];
            const quantity = 1;
            const discount = Math.random() > 0.75 ? Math.floor(Math.random() * 15) + 5 : 0;
            const originalPrice = Number(service.servicePrice);
            const discountedPrice = originalPrice * (1 - discount / 100);
            const amount = discountedPrice * quantity;

            totalAmount = totalAmount.add(amount);

            items.push({
              serviceName: service.serviceName,
              productName: null,
              originalUnitPrice: new Decimal(originalPrice),
              customUnitPrice: new Decimal(discountedPrice),
              discountPercentage: new Decimal(discount),
              quantity,
              amount: new Decimal(amount),
              itemType: 'Service',
              remarks: null,
            });
          } else if (products.length > 0) {
            const product = products[Math.floor(Math.random() * products.length)];
            const quantity = Math.floor(Math.random() * 2) + 1;
            const discount = Math.random() > 0.85 ? Math.floor(Math.random() * 10) + 5 : 0;
            const originalPrice = Number(product.productUnitSalePrice);
            const discountedPrice = originalPrice * (1 - discount / 100);
            const amount = discountedPrice * quantity;

            totalAmount = totalAmount.add(amount);

            items.push({
              serviceName: null,
              productName: product.productName,
              originalUnitPrice: new Decimal(originalPrice),
              customUnitPrice: new Decimal(discountedPrice),
              discountPercentage: new Decimal(discount),
              quantity,
              amount: new Decimal(amount),
              itemType: 'Product',
              remarks: null,
            });
          }
        }

        // Optionally include a Member Voucher purchase item (member-only)
        const includeVoucher = !isWalkIn && Math.random() < 0.2 && memberVouchers.length > 0;
        if (includeVoucher) {
          const vouchersForMember = memberVouchers.filter((v: any) => v.memberId === member.id);
          const voucher = vouchersForMember.length > 0
            ? vouchersForMember[Math.floor(Math.random() * vouchersForMember.length)]
            : memberVouchers[Math.floor(Math.random() * memberVouchers.length)];

          const voucherPrice = Number(voucher.defaultTotalPrice || 300);
          totalAmount = totalAmount.add(voucherPrice);

          items.push({
            serviceName: null,
            productName: null,
            memberVoucherId: voucher.id,
            originalUnitPrice: new Decimal(voucherPrice),
            customUnitPrice: new Decimal(voucherPrice),
            discountPercentage: new Decimal(0),
            quantity: 1,
            amount: new Decimal(voucherPrice),
            itemType: 'Member Voucher',
            remarks: 'Voucher purchase',
          } as any);
        }

        // Optionally include a Member Care Package purchase item (member-only)
        const includeMcp = !isWalkIn && Math.random() < 0.15 && memberCarePackages.length > 0;
        if (includeMcp) {
          const mcpsForMember = memberCarePackages.filter((mcp: any) => mcp.memberId === member.id);
          const mcp = mcpsForMember.length > 0
            ? mcpsForMember[Math.floor(Math.random() * mcpsForMember.length)]
            : memberCarePackages[Math.floor(Math.random() * memberCarePackages.length)];
          const mcpPrice = Number(mcp.totalPrice || 400);
          totalAmount = totalAmount.add(mcpPrice);

          items.push({
            serviceName: null,
            productName: null,
            memberCarePackageId: mcp.id,
            originalUnitPrice: new Decimal(mcpPrice),
            customUnitPrice: new Decimal(mcpPrice),
            discountPercentage: new Decimal(0),
            quantity: 1,
            amount: new Decimal(mcpPrice),
            itemType: 'Member_Care_Package',
            remarks: 'Care package purchase',
          } as any);
        }

        if (items.length === 0) continue;

        const gstRate = 0.09;
        const gstAmount = totalAmount.mul(gstRate);
        const finalTotal = totalAmount.add(gstAmount);

        // Create sale transaction
        const receiptNo = `RC${transactionDate.getFullYear()}${String(transactionDate.getMonth() + 1).padStart(
          2,
          '0'
        )}${String(transactionDate.getDate()).padStart(2, '0')}-${String(totalTransactionCount + 1).padStart(4, '0')}`;

        const saleTransaction = await prisma.saleTransaction.create({
          data: {
            customerType: isWalkIn ? 'walk-in-customer' : 'member',
            memberId: isWalkIn ? null : member.id,
            totalPaidAmount: finalTotal,
            outstandingTotalPaymentAmount: new Decimal(0),
            gstAmount,
            saleTransactionStatus: 'FULL',
            receiptNo,
            processPayment: false,
            handledBy: handledBy.id,
            createdBy: handledBy.id,
            createdAt: transactionDate,
            updatedAt: transactionDate,
          },
        });

        saleTransactions.push(saleTransaction);
        totalTransactionCount++;

        // Create items
        for (const item of items) {
          await prisma.saleTransactionItem.create({
            data: {
              saleTransactionId: saleTransaction.id,
              ...item,
            },
          });
        }

        // Create payment - distribute across payment methods
        if (paymentMethods.length > 0) {
          // Determine payment split
          const paymentMethodCount = Math.random() > 0.85 ? 2 : 1; // 15% chance of split payment

          if (paymentMethodCount === 1) {
            const paymentMethod = paymentMethods[Math.floor(Math.random() * Math.min(3, paymentMethods.length))];
            await prisma.paymentToSaleTransaction.create({
              data: {
                paymentMethodId: paymentMethod.id,
                saleTransactionId: saleTransaction.id,
                amount: finalTotal,
                remarks: `Payment for ${receiptNo}`,
                createdBy: handledBy.id,
                createdAt: transactionDate,
                updatedBy: handledBy.id,
                updatedAt: transactionDate,
              },
            });
          } else {
            // Split payment between two methods
            const method1 = paymentMethods[0];
            const method2 = paymentMethods[Math.min(1, paymentMethods.length - 1)];
            const amount1 = finalTotal.mul(0.5);
            const amount2 = finalTotal.sub(amount1);

            await prisma.paymentToSaleTransaction.createMany({
              data: [
                {
                  paymentMethodId: method1.id,
                  saleTransactionId: saleTransaction.id,
                  amount: amount1,
                  remarks: `Payment 1/2 for ${receiptNo}`,
                  createdBy: handledBy.id,
                  createdAt: transactionDate,
                  updatedBy: handledBy.id,
                  updatedAt: transactionDate,
                },
                {
                  paymentMethodId: method2.id,
                  saleTransactionId: saleTransaction.id,
                  amount: amount2,
                  remarks: `Payment 2/2 for ${receiptNo}`,
                  createdBy: handledBy.id,
                  createdAt: transactionDate,
                  updatedBy: handledBy.id,
                  updatedAt: transactionDate,
                },
              ],
            });
          }
        }
      }

      const monthName = targetDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      console.log(`   ✅ ${monthName}: Created ${transactionsPerMonth} transactions`);
    }

    // Calculate summary
    const totalRevenue = saleTransactions.reduce(
      (sum, tx) => sum.add(tx.totalPaidAmount || new Decimal(0)),
      new Decimal(0)
    );
    const avgTransactionValue =
      saleTransactions.length > 0 ? totalRevenue.div(saleTransactions.length) : new Decimal(0);

    console.log('\n📈 Revenue Summary:');
    console.log(`   Total Transactions: ${saleTransactions.length}`);
    console.log(`   Total Revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`   Average Transaction: $${avgTransactionValue.toFixed(2)}`);

    // Show actual date range of created transactions
    const sortedDates = saleTransactions
      .map((tx) => tx.createdAt)
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    if (sortedDates.length > 0) {
      console.log(
        `   Date Range: ${sortedDates[0].toLocaleDateString()} - ${sortedDates[
          sortedDates.length - 1
        ].toLocaleDateString()}`
      );
    }

    // Create specific CDC Voucher test transactions for the last 6 months
    console.log('\n🧪 Creating CDC Voucher transactions for the last 6 months...');
    const cdcMethod = await prisma.paymentMethod.findFirst({
      where: { paymentMethodName: 'CDC Vouchers' },
    });

    if (cdcMethod) {
      const today = new Date();
      
      for (let i = 0; i < 6; i++) {
        const targetDate = new Date(today.getFullYear(), today.getMonth() - i, 15, 14, 30, 0); // 15th of each month
        const testAmount = 100.00 + (i * 10); // Varied amount: 100, 110, 120...
        
        const testSaleTransaction = await prisma.saleTransaction.create({
          data: {
            totalPaidAmount: testAmount,
            outstandingTotalPaymentAmount: 0,
            gstAmount: 0,
            saleTransactionStatus: 'COMPLETED',
            createdAt: targetDate,
            updatedAt: targetDate,
            customerType: 'WALK_IN',
            receiptNo: `CDC-TEST-${targetDate.getFullYear()}${(targetDate.getMonth() + 1).toString().padStart(2, '0')}-${Date.now()}`,
            processPayment: true,
          },
        });

        await prisma.saleTransactionItem.create({
          data: {
            saleTransactionId: testSaleTransaction.id,
            itemType: 'Member Voucher',
            amount: testAmount,
            quantity: 1,
            remarks: `CDC Voucher Purchase - ${targetDate.toLocaleString('default', { month: 'long' })}`,
          },
        });

        await prisma.paymentToSaleTransaction.create({
          data: {
            saleTransactionId: testSaleTransaction.id,
            paymentMethodId: cdcMethod.id,
            amount: testAmount,
            createdAt: targetDate,
            updatedAt: targetDate,
          },
        });
        
        console.log(`   ✅ Created CDC transaction for ${targetDate.toLocaleString('default', { month: 'short', year: 'numeric' })}: $${testAmount.toFixed(2)}`);
      }
    }

    console.log('\n✨ Revenue seeding completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error seeding revenue data:', error);
    throw error;
  }
}

seedRevenue()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
