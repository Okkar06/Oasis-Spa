#!/usr/bin/env node

/**
 * Simple Prisma connection tester
 * Run with: npx tsx server/scripts/test-prisma-connection.ts
 * Ensure DATABASE_URL is set in the environment before running.
 */

import { prisma } from '../lib/prisma.js';

async function main() {
  console.log('🔌 Attempting to connect with Prisma...');
  try {
    await prisma.$connect();
    console.log('✅ Connected to database via Prisma');

    // A harmless test query - adapt if your DB disallows raw queries
    try {
      // Use a lightweight Prisma RPC call if available, otherwise fallback
      const result = await prisma.$queryRaw`SELECT 1 as ok`;
      console.log('✅ Test query succeeded:', result);
    } catch (err) {
      console.warn('⚠️ Test query failed (this may be expected on some DBs):', err instanceof Error ? err.message : err);
    }

  } catch (error) {
    console.error('❌ Prisma connection failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected');
  }
}

main().catch((e) => {
  console.error('💥 Unexpected error:', e);
  process.exit(1);
});
