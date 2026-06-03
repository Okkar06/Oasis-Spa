# Revenue Data Seeding

This document explains how to seed revenue/sales transaction data for testing and development.

## Prerequisites

Make sure you have already run the main seed script:

```bash
npm run db:seed
```

## Usage

### Seed Revenue Data Only

```bash
npm run db:seed:revenue
```

### Seed Everything (Main + Revenue)

```bash
npm run db:seed:all
```

## What Gets Created

The revenue seed creates realistic sales transaction data for the past 6 months:

### Sale Transactions

- **10-25 transactions per month** (randomized)
- **Mix of member and walk-in customers** (60% members, 40% walk-ins)
- **Random dates and times** within business hours (9 AM - 9 PM)
- **Unique receipt numbers** in format: `RCYYYYMMDD-XXXX`

### Transaction Items

- **1-4 items per transaction**
- **70% services, 30% products**
- **Quantity variations** (1 for services, 1-3 for products)
- **Discounts applied** (30% chance for services, 20% for products)
- **GST calculation** (9% on subtotal)

### Payment Records

- **Random payment methods** (Cash, Credit Card, PayNow)
- **Full payment records** linked to transactions
- **Proper timestamps** matching transaction dates

## Revenue Summary

After seeding, you'll see:

- Total number of transactions created
- Total revenue generated
- Average transaction value
- Monthly breakdown with transaction counts

## Example Output

```
📊 Creating sale transactions...
✅ Created 15 transactions for 0 months ago
✅ Created 18 transactions for 1 months ago
...

📈 Revenue Summary:
   Total Transactions: 95
   Total Revenue: $42,567.80
   Average Transaction: $448.08
   Date Range: 06/12/2024 - 12/12/2024

📅 Monthly Breakdown:
   Dec 2024: $7,234.50 (15 transactions)
   Nov 2024: $8,456.30 (18 transactions)
   ...
```

## Resetting Data

To clear and reseed all data:

```bash
npm run db:reset
npm run db:seed:all
```

## Notes

- Data is randomly generated for realistic distribution
- Transactions span the past 6 months for trend analysis
- GST is calculated at 9% (Singapore standard)
- All transactions are marked as "completed" with full payment
