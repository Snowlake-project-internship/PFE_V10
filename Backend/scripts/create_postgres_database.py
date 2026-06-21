import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")


def main() -> None:
    database_url = os.getenv("POSTGRES_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("POSTGRES_URL or DATABASE_URL is required in Backend/.env")

    target_url = make_url(database_url)
    database_name = target_url.database
    if not database_name:
        raise RuntimeError("Database name is missing from POSTGRES_URL/DATABASE_URL")

    admin_url = target_url.set(database="postgres")
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    with admin_engine.connect() as connection:
        exists = connection.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :database_name"),
            {"database_name": database_name},
        ).scalar()
        if exists:
            print(f"Database '{database_name}' already exists.")
        else:
            quoted_database = database_name.replace('"', '""')
            connection.execute(text(f'CREATE DATABASE "{quoted_database}"'))
            print(f"Database '{database_name}' created.")

    from database import Base, engine, ensure_metadata_schema
    from logs import AuditLog, ErrorLog, ExecutionLog  # noqa: F401
    from models import Feedback, ImportFile, User  # noqa: F401
    from models.user import Organization  # noqa: F401

    Base.metadata.create_all(bind=engine)
    ensure_metadata_schema()
    print("Application tables are ready.")


if __name__ == "__main__":
    main()
