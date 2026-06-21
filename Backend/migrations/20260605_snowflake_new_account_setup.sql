-- Snowflake account: ZUGHMQB-XI16237
-- Admin/browser user: IDRISSISOULAYMAN
-- Run this in Snowflake with role ACCOUNTADMIN.
-- It prepares the backend role/user/warehouse for the SnowFast loader.

USE ROLE ACCOUNTADMIN;

CREATE ROLE IF NOT EXISTS EXCELLOADER_ROLE;

CREATE WAREHOUSE IF NOT EXISTS EXCELLOADER_WH
  WAREHOUSE_SIZE = XSMALL
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE;

GRANT USAGE, OPERATE ON WAREHOUSE EXCELLOADER_WH TO ROLE EXCELLOADER_ROLE;

-- Required because the app creates one Snowflake database per organization/upload flow.
GRANT CREATE DATABASE ON ACCOUNT TO ROLE EXCELLOADER_ROLE;

-- Required only for the Log Files background sync from SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY.
-- If your trial/edition does not allow it, uploads still work; only account-wide history sync is limited.
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO ROLE EXCELLOADER_ROLE;

CREATE USER IF NOT EXISTS EXCELLOADER_USER
  PASSWORD = 'ChangeThisPassword123!'
  DEFAULT_ROLE = EXCELLOADER_ROLE
  DEFAULT_WAREHOUSE = EXCELLOADER_WH
  MUST_CHANGE_PASSWORD = FALSE;

GRANT ROLE EXCELLOADER_ROLE TO USER EXCELLOADER_USER;

-- Optional: let ACCOUNTADMIN read tables that the app creates, so you can inspect uploads in Snowsight.
-- The backend also tries to grant SELECT to SNOWFLAKE_VIEWER_ROLE after creating each table.
GRANT ROLE EXCELLOADER_ROLE TO ROLE ACCOUNTADMIN;

-- History sync needs one existing database to call INFORMATION_SCHEMA.QUERY_HISTORY.
-- This keeps the same default name that the backend used before.
CREATE DATABASE IF NOT EXISTS IDRISSI;
GRANT USAGE ON DATABASE IDRISSI TO ROLE EXCELLOADER_ROLE;
GRANT USAGE ON SCHEMA IDRISSI.PUBLIC TO ROLE EXCELLOADER_ROLE;

SHOW GRANTS TO ROLE EXCELLOADER_ROLE;
