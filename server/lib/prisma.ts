/**
 * Prisma Client setup
 * - Provides dual clients for Production and Simulation databases
 * - Exposes getPrisma() to dynamically select the correct client based on simulation mode
 */

import { PrismaClient } from '@prisma/client';
import { getIsSimulation } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Ensure server/.env is applied before Prisma client is created so any
// modules importing this file (including seed scripts) use the repo .env
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    Object.keys(parsed).forEach((k) => {
      process.env[k] = parsed[k];
    });
    console.log('Applied server/.env from lib/prisma (overriding process.env)');
  }
} catch (e) {
  console.warn('Failed to apply server/.env in lib/prisma:', e);
}

type GlobalPrisma = {
  prismaProd?: PrismaClient;
  prismaSim?: PrismaClient;
};

const globalForPrisma = global as unknown as GlobalPrisma;

const dbUrl = process.env.DATABASE_URL;

function createClient(url: string | undefined): PrismaClient {
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prismaProd = globalForPrisma.prismaProd || createClient(dbUrl);
export const prismaSim = globalForPrisma.prismaSim || createClient(dbUrl);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaProd = prismaProd;
  globalForPrisma.prismaSim = prismaSim;
}

// Dynamic selector based on simulation mode
export function getPrisma(): PrismaClient {
  return getIsSimulation() ? prismaSim : prismaProd;
}

// Named export for backward compatibility (points to production client)
export const prisma = prismaProd;

// Default export kept for compatibility (points to production client)
export default prismaProd;
