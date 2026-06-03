# Oasis Spa Deployment Guide

This guide covers local Docker development and deployment to Render with Neon PostgreSQL.

## Prerequisites

- Neon PostgreSQL project (you will use its `DATABASE_URL`)
- Render account (and this repo pushed to GitHub)
- Docker Desktop (optional, for local containerized dev)

## Local Development (Docker Compose)

1. Create `server/.env` (see `ENV_SETUP.md`)
2. Run:

```bash
docker-compose up --build
```

Frontend: http://localhost:5173  
Backend: http://localhost:5000

## Deployment (Render)

This repo includes a Render Blueprint at `render.yaml`.

### Step 1: Create Services from Blueprint

1. In Render, choose "New" → "Blueprint"
2. Connect your GitHub repo and select it
3. Render will detect `render.yaml` and propose:
   - `oasis-spa-backend` (Node web service)
   - `oasis-spa-frontend` (static site)

### Step 2: Set Environment Variables

In the backend service:

- `DATABASE_URL` = your Neon connection string (include `?sslmode=require`)
- `JWT_SECRET` = a strong secret
- `CLIENT_URL` = your frontend Render URL
- `NODE_ENV` = `production`

In the frontend static site:

- `VITE_API_URL` = your backend Render URL (e.g. `https://oasis-spa-backend.onrender.com`)

### Step 3: Deploy

- Trigger deploys from Render (or by pushing to GitHub, if auto-deploy is enabled).

## Notes

- Render sets `PORT` automatically for web services; the backend reads `process.env.PORT`.
- Neon requires TLS in production; the app enables SSL with `rejectUnauthorized: false` for compatibility.

## Security Best Practices

- Never commit secrets (`server/.env` should remain untracked)
- Use strong `JWT_SECRET` values and rotate regularly
- Use HTTPS-only URLs for `CLIENT_URL` and `VITE_API_URL` in production

## Support

- Use Render logs for backend/frontend runtime errors
- Check Neon dashboard for database connectivity and pooling limits






