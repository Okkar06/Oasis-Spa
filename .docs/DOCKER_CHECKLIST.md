# Docker Container Requirements Checklist

This document lists all files and dependencies required for the backend Docker container to run properly.

## Required Files (Now Included)

### 1. **Application Code**
- `package.json` & `package-lock.json` - Dependencies
- `dist/` - Compiled TypeScript (JavaScript)
- Node modules (production only)

### 2. **Prisma**
- `prisma/schema.prisma` - Database schema
- Prisma Client generation (`npx prisma generate`)
- Generated `.prisma/client` files

### 3. **SQL Files**
- `sql/` directory - Database stored procedures
  - Used by `prisma/seed.ts` to set up database functions
  - Contains subdirectories: appointment/, cpmcp/, et/, mv/, product/, revenue/, service/, triggers/
  - Critical for database functionality

### 4. **Seed Data**
- `seed/` directory (from project root)
  - Contains CSV files for database seeding
  - Subdirectories: pre/, post/, temp/
  - Used by seed script and super admin features

### 5. **Environment Variables**
Required environment variables that must be set:
- `PROD_DB_URL` or `DATABASE_URL` - Production database connection
- `SIM_DB_URL` - Simulation database connection
- `AUTH_JWT_SECRET` - JWT authentication secret
- `INV_JWT_SECRET` - JWT inventory secret
- `REMEMBER_TOKEN` - Remember me token secret
- `SESSION_SECRET` - Session secret
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `LOCAL_FRONTEND_URL` - Frontend URL for CORS
- `LOCAL_BACKEND_URL` - Backend URL for CORS

## Docker Build Process

### Stage 1: Builder
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY server/package*.json ./
RUN npm install
COPY server/ .
RUN npm run build
```

**Purpose**: Compiles TypeScript to JavaScript

### Stage 2: Production
```dockerfile
FROM node:20-alpine
WORKDIR /usr/src/app
COPY server/package*.json ./
RUN npm install --only=production
COPY server/prisma ./prisma
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
COPY server/sql ./sql
COPY seed ./seed
EXPOSE 3000
CMD [ "node", "dist/index.js" ]
```

**Purpose**: Creates minimal production image with only necessary files

## What Each Component Does

### Prisma Client
- **Location**: Generated in `node_modules/.prisma/client/`
- **Purpose**: Database ORM for TypeScript
- **Why needed**: Application uses `@prisma/client` for all database operations
- **Generated during build**: `npx prisma generate`

### SQL Files
- **Location**: `server/sql/`
- **Purpose**: PostgreSQL stored procedures and functions
- **Used by**: `prisma/seed.ts` during database setup
- **Examples**:
  - `sql/appointment/` - Appointment-related procedures
  - `sql/service/` - Service management functions
  - `sql/product/` - Product functions
  - `sql/triggers/` - Database triggers

### Seed Directory
- **Location**: Project root `seed/`
- **Purpose**: CSV files for populating database
- **Used by**: 
  - `prisma/seed.ts` - Initial database population
  - `superAdminModel.ts` - Manual data import features
- **Structure**:
  - `pre/` - Pre-simulation data
  - `post/` - Post-simulation data
  - `temp/` - Temporary/merged data

## What's NOT Needed in Production Container

- TypeScript source files (`.ts`) - Compiled to `.js`
- Development dependencies - Only production packages
- `node_modules/@types/*` - TypeScript types not needed at runtime
- Test files
- `.env` files - Passed via environment variables

## Common Issues

### Issue: "Prisma client not initialized"
**Cause**: Prisma client not generated in container
**Solution**: Fixed - Added `npx prisma generate` to Dockerfile

### Issue: "SQL directory not found"
**Cause**: SQL files not copied to container
**Solution**: Fixed - Added `COPY server/sql ./sql` to Dockerfile

### Issue: "Cannot read property 'readFileSync'"
**Cause**: Seed directory not accessible
**Solution**: Already included - `COPY seed ./seed`

### Issue: Database connection errors
**Cause**: Missing environment variables
**Solution**: Ensure `PROD_DB_URL` and `SIM_DB_URL` are set

## Image Size Optimization

Current approach uses multi-stage builds to minimize image size:

1. **Builder stage**: Full dev dependencies for compilation (~500MB)
2. **Production stage**: Only production dependencies + compiled code (~200MB)

**Benefits**:
- Smaller image size
- Faster deployments
- Reduced attack surface
- Lower bandwidth usage

## Security Considerations

1. **No secrets in image**: Environment variables passed at runtime
2. **Minimal dependencies**: Only production packages
3. **Non-root user**: Consider adding `USER node` for security
4. **Alpine base**: Smaller attack surface than full distributions

## Verification Steps

After building, verify all components:

```bash
# Build the image
docker build -t backend-test -f server/Dockerfile .

# Check if Prisma client exists
docker run --rm backend-test ls -la node_modules/.prisma/client/

# Check if SQL files exist
docker run --rm backend-test ls -la sql/

# Check if seed directory exists
docker run --rm backend-test ls -la seed/

# Check if dist exists
docker run --rm backend-test ls -la dist/
```

## Current Status

All required components are now included in the Dockerfile:
- Prisma schema copied
- Prisma client generated
- SQL files copied
- Seed directory copied
- Built application copied
- Production dependencies installed

**The Docker container should now start successfully!**






