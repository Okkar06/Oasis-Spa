import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { startPoolMonitoring, stopPoolMonitoring, closeAllPools } from './config/database.js';

// Ensure we force the repository `server/.env` values into process.env so
// all modules (including Prisma and DB pools) use the intended connection strings.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    Object.keys(parsed).forEach((k) => {
      // Override any existing env var so .env in repo is authoritative
      process.env[k] = parsed[k];
    });
    console.log('Loaded and applied server/.env (overriding process.env)');
  } catch (e) {
    console.warn('Failed to load server/.env, falling back to existing environment variables', e);
  }
} else {
  console.warn('server/.env not found; using existing environment variables');
}

const PORT = process.env.PORT || 5000;

async function start() {
  const { default: app } = await import('./app.js');
  const server = createServer(app);

  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);

    // Start monitoring database connections
    startPoolMonitoring();
  });

  // Graceful shutdown handlers
  process.on('SIGINT', async () => {
    console.log('\n🔄 Gracefully shutting down server...');

    stopPoolMonitoring();

    server.close(async () => {
      console.log('🔒 HTTP server closed');

      // Close database connections
      await closeAllPools();

      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    });
  });

  process.on('SIGTERM', async () => {
    console.log('\n🔄 Received SIGTERM, shutting down gracefully...');

    stopPoolMonitoring();
    await closeAllPools();

    process.exit(0);
  });
}

start();
