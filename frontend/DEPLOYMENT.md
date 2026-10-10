# Deployment Guide
## Project: PolicyPulse AI — Cloud Infrastructure & Deployment Runbook
**Team**: TENSOR TITANS | PS-40

---

## 1. Cloud Architecture Overview

| Component | Target Provider | Service Type | Build Command / Entrypoint |
| :--- | :--- | :--- | :--- |
| **Frontend** | Vercel | Edge CDN / Static Web App | `npm run build` (`dist/`) |
| **Backend API** | Render | Managed Web Service (Python 3.11) | `pip install -r requirements.txt && uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |
| **Database & Vector Engine** | Supabase | Managed PostgreSQL 15 + pgvector | SQL schema in `DATABASE_SCHEMA.md` |
| **Policy Document Storage** | Supabase Storage | S3-Compatible Object Store | Bucket: `policy-documents` |

---

## 2. Environment Variables Configuration

Copy `.env.example` to `.env` and configure credentials:

```bash
# Frontend (.env / Vercel Environment Variables)
VITE_API_BASE_URL=https://policypulse-api.onrender.com/api/v1
VITE_ENABLE_DEMO_FALLBACK=true

# Backend (.env / Render Environment Variables)
PORT=8000
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
OPENAI_API_KEY=<your-openai-or-gemini-api-key>
EMBEDDING_MODEL=text-embedding-3-small
LLM_MODEL=gpt-4o-mini
CORS_ORIGINS=https://policypulse.vercel.app,http://localhost:5173
```

---

## 3. Step-by-Step Deployment Steps

### 3.1 Supabase Setup
1. Create a new Supabase project in your preferred region.
2. In the Supabase SQL Editor, run the SQL script documented in `DATABASE_SCHEMA.md` to:
   - Enable `vector` and `pg_trgm` extensions.
   - Create tables (`policies`, `policy_chunks`, `complaints`, `decomposed_concerns`, `citations`, `guardrail_scans`, `dispatch_audit_logs`).
   - Create the `hybrid_policy_search()` stored procedure.
3. In Supabase Storage, create a public or authenticated bucket named `policy-documents`.

### 3.2 Backend Deployment (Render)
1. In Render, select **New Web Service** and connect the Git repository.
2. Root Directory: `.`
3. Runtime: `Python 3`
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
6. Add the environment variables from the checklist above.
7. Deploy service and verify the `/api/v1/health` endpoint returns `200 OK`.

### 3.3 Frontend Deployment (Vercel)
1. In Vercel, select **Add New Project** and import the repository.
2. Framework Preset: `Vite`
3. Root Directory: `./`
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Add `VITE_API_BASE_URL` pointing to the Render backend URL.
7. Deploy and verify the live domain.

---

## 4. Local Development Quickstart

```bash
# 1. Install frontend dependencies and start Vite
npm install
npm run dev

# 2. In a second terminal, install Python backend dependencies and run API
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```
Visit `http://localhost:5173` to test the full-stack application locally.
