# Environment Variables Setup

## For Local Development

Create `server/.env` with the following content:

```env
# Neon PostgreSQL (recommended)
# Get this from your Neon dashboard - Connection String
DATABASE_URL=postgresql://username:password@ep-xxxxx-xxxxx.neon.tech/oasis_spa?sslmode=require

# App
JWT_SECRET=your_jwt_secret_here
PORT=5000
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

## How to Get Neon Connection Strings

1. Go to your Neon dashboard
2. Select your project
3. Click "Connection Details"
4. Copy the connection string (should start with `postgresql://`)
5. Ensure it includes `?sslmode=require` at the end

Example:

```
postgresql://myuser:mypassword@ep-cool-cloud-123456.neon.tech/oasis_spa?sslmode=require
```

## How to Generate Secrets

```bash
openssl rand -base64 32
```

## Important Notes

- **NEVER** commit the `server/.env` file to version control
- `DATABASE_URL` is required for Prisma CLI commands (generate/migrate/seed)

## Quick Setup

```bash
docker-compose up --build
```






