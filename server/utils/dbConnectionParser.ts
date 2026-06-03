interface DbConfig {
  user?: string;
  password?: string;
  host?: string;
  port?: number;
  database?: string;
  ssl?: any;
  maxConnections?: number;
  connectionString?: string;
}

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Parse the repository server/.env file explicitly so we can prefer its values
// even when system/user environment variables exist.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env');
let fileEnv: Record<string, string> = {};
if (fs.existsSync(envPath)) {
  try {
    fileEnv = dotenv.parse(fs.readFileSync(envPath));
  } catch (e) {
    console.warn('Failed to parse server/.env:', e);
    fileEnv = {};
  }
}

export const parseConnectionString = (connectionString: string): DbConfig => {
  // Return empty object if no connection string provided
  if (!connectionString) return {};

  try {
    // Example connection string format:
    // postgresql://username:password@host:port/database?sslmode=require
    const url = new URL(connectionString);

    // Extract username and password
    const user = url.username;
    const password = url.password;

    // Extract host and port
    const host = url.hostname;
    const port = url.port ? parseInt(url.port) : 5432; // Default PostgreSQL port

    // Extract database name (remove leading slash)
    const database = url.pathname.substring(1);

    // Check SSL parameters in query string
    const sslMode = url.searchParams.get('sslmode');
    const ssl =
      sslMode === 'disable' || sslMode === 'false'
        ? false
        : {
            rejectUnauthorized: false,
          };

    // Extract max connections if provided
    const maxConnections = url.searchParams.get('max') ? parseInt(url.searchParams.get('max') || '10') : undefined;

    return {
      user,
      password,
      host,
      port,
      database,
      ssl,
      maxConnections,
    };
  } catch (error) {
    console.error('Error parsing connection string:', error);
    return {};
  }
};

// New function to build config from individual environment variables or connection string
export const buildDbConfig = (): DbConfig => {
  const dbUrl = fileEnv.DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required');
  }
  return {
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  };
};

// Build simulation DB config
export const buildSimDbConfig = (): DbConfig => {
  return buildDbConfig();
};

