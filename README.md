# SnowFast / Snowflake Loader

Full-stack internship project with a FastAPI backend, PostgreSQL metadata, Snowflake loading, import history, rollback support, execution logs, account approval, feedback/reclamation notifications, and a React + Vite frontend.

## Structure

- `Backend/` - FastAPI backend and services.
- `frontend-Snowflake/frontend/` - React + TypeScript frontend.
- `TEST_UPLOAD_CASES/` - sample upload cases used during validation.

## Local Setup

1. Configure backend environment variables in `Backend/.env` using `Backend/.env.example` as a template.
2. Start backend from `Backend/`:
   ```powershell
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```
3. Start frontend from `frontend-Snowflake/frontend/`:
   ```powershell
   npm install
   npm run dev
   ```

Do not commit real `.env` files or credentials.
