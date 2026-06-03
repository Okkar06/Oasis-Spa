# Stage 1: Build the TypeScript code
FROM node:20-alpine AS builder
WORKDIR /app
COPY server/package*.json ./
COPY server/prisma ./prisma
RUN npm install
COPY server/ .
RUN npx prisma generate
RUN npm run build

# Stage 2: Create the production image
FROM node:20-alpine
WORKDIR /usr/src/app
COPY server/package*.json ./
COPY server/prisma ./prisma
RUN npm install --only=production

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy SQL files for database procedures (used during seeding)
COPY server/sql ./sql

# Copy seed directory to the location expected by the application
COPY seed ./seed

# Expose the port the app runs on
EXPOSE 3000

# Run the app
CMD [ "node", "dist/index.js" ]