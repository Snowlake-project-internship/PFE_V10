# SnowFast - Snowflake Loader

SnowFast is a full-stack data loading platform built for an internship/PFE project. It helps users upload Excel or CSV files, validate and clean data, load it into Snowflake, inspect import history, review technical logs, rollback successful imports, and manage feedback/reclamations between users, admins, and super admins.

## Project Structure

```text
PFE_V3/
├── Backend/                 # FastAPI backend, PostgreSQL metadata, Snowflake services
├── frontend/                # React + TypeScript + Vite application
├── TEST_UPLOAD_CASES/       # Upload scenarios for rollback/import validation
├── docs/                    # Additional project notes and plans
└── README.md
```

The frontend is now directly in `frontend/`. The old nested path `frontend-Snowflake/frontend/` is no longer used.

## Main Features

- User authentication with user, admin, and super admin roles.
- Organization-based data isolation.
- Account approval workflow for new users.
- Upload Center for Excel and CSV files.
- Data cleaning preview before loading into Snowflake.
- PostgreSQL-backed import history and status tracking.
- Snowflake database, schema, and table creation/reuse.
- Precise rollback for successful imports.
- Log Files page for execution, SQL, warning, error, and rollback logs.
- Feedback/reclamation workflow with admin replies through notifications.
- Admin and super admin dashboards.

## Backend Setup

```powershell
cd C:\PFE_V3\Backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Fill `Backend\.env` with your local PostgreSQL and Snowflake values.

Start the backend:

```powershell
cd C:\PFE_V3\Backend
.\.venv\Scripts\activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

API docs:

```text
http://127.0.0.1:8000/docs
```

If port `8000` gives `WinError 10013`, another process or Windows permission rule is blocking it. Use another port:

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

Then update the frontend API URL if needed.

## Frontend Setup

```powershell
cd C:\PFE_V3\frontend
npm install
npm run dev
```

Default frontend URL:

```text
http://localhost:5173
```

Production build check:

```powershell
cd C:\PFE_V3\frontend
npm run build
```

## Environment Files

Never commit real `.env` files. Use:

- `Backend\.env.example` for backend variable names.
- `frontend\.env` only if you need a custom API URL, for example:

```env
VITE_API_URL=http://127.0.0.1:8000
```

## Useful Test Files

Use `TEST_UPLOAD_CASES/` for controlled upload and rollback scenarios:

- new organization/database creation
- existing database/schema with new table
- existing table insert
- same file/same columns append
- same file/different columns structure handling
- reserved rollback column failure

## GitHub

Repository:

```text
https://github.com/Snowlake-project-internship/PFE_V10.git
```

Before pushing, make sure these are not included:

- `.env`
- `node_modules/`
- `dist/`
- `.venv/` or `venv/`
- `__pycache__/`
- `.codex-tmp/`

## Recommended Daily Run

Terminal 1:

```powershell
cd C:\PFE_V3\Backend
.\.venv\Scripts\activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2:

```powershell
cd C:\PFE_V3\frontend
npm run dev
```
