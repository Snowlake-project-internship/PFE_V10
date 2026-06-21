-- Run with psql while connected to the default postgres database:
-- psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -f Backend/migrations/20260605_create_database_psql.sql

SELECT 'CREATE DATABASE etl_db'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'etl_db'
)\gexec
