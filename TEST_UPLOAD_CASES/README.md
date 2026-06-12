# Upload Cases Test Guide

Use the files in numeric order. Do not rename them: all three files must keep
the name `customer_upload.xlsx` so they target the same base schema name,
`CUSTOMER_UPLOAD`.

## Preparation

To test Case 1 as a truly new Snowflake database, register a test user with a
new organization, then log in with that user. The organization stored in
PostgreSQL is used as the Snowflake database name; Upload Center no longer asks
the user to type an organization.

Example test organization: `UPLOAD_CASE_TEST_20260612`

Do not use `MIDITEL` for the clean three-case sequence unless you first remove
its previous test objects and manual rows. It already contains earlier test
data, so its row counts will not start from zero.

## Case 1 - New organization, new database/schema/table

Upload:

`01_NEW_ORGANISATION_NEW_DB/customer_upload.xlsx`

File contents:

- Sheet/table: `CUSTOMERS`
- Rows: 3

Expected:

- New database from the user's organization
- Schema: `CUSTOMER_UPLOAD`
- Table: `CUSTOMERS`
- Inserted rows: 3

## Case 2 - Existing database/schema, new table

Upload:

`02_EXISTING_DB_SCHEMA_NEW_TABLE/customer_upload.xlsx`

File contents:

- Sheet/table: `ORDERS`
- Rows: 3

Requested business expectation:

- Reuse schema `CUSTOMER_UPLOAD`
- Create table `ORDERS`
- Insert 3 rows

Current application behavior matches this expectation.

## Case 3 - Existing database/schema/table, insert rows

Upload:

`03_EXISTING_DB_SCHEMA_TABLE_INSERT/customer_upload.xlsx`

File contents:

- Sheet/table: `CUSTOMERS`
- New rows: 2

Requested business expectation:

- Reuse `CUSTOMER_UPLOAD.CUSTOMERS`
- Append 2 rows, producing 5 total rows

Current application behavior matches this expectation. New rows are tagged
internally with `_SNOWFAST_IMPORT_ID` so rollback deletes only rows from the
selected import.

## Same filename and same worksheet structure

Upload:

`04_SAME_FILE_SAME_SHEET_SAME_COLUMNS_APPEND/customer_upload.xlsx`

- Same filename: `customer_upload.xlsx`
- Same worksheet: `CUSTOMERS`
- Same columns as Case 1
- Expected: append 2 rows to `CUSTOMER_UPLOAD.CUSTOMERS`

## Same filename and different worksheet structure

Upload:

`05_SAME_FILE_SAME_SHEET_DIFFERENT_COLUMNS_NEW_TABLE/customer_upload.xlsx`

- Same filename and worksheet name
- Different columns
- Expected: create one deterministic table such as
  `CUSTOMERS_STRUCT_06C149DC`

Then upload:

`06_REPEAT_DIFFERENT_STRUCTURE_APPEND_TO_STRUCTURE_TABLE/customer_upload.xlsx`

- Same different structure as Case 5
- Expected: append to the same `CUSTOMERS_STRUCT_...` table
- No `_V2` or `_V3` schemas/tables are created

## Expected failed import

Upload:

`07_EXPECTED_FAILED_RESERVED_COLUMN/failed_import_test.xlsx`

The file contains a column reserved for internal rollback tracking. Analyze can
read the workbook, but Confirm must fail with:

`Column 'SNOWFAST_IMPORT_ID' is reserved for rollback tracking.`

Expected Import History values:

- Status: `FAILED`
- Inserted rows: `0`
- Failed step: `Column Validation`
- User rollback action: unavailable

## Snowflake checks

Replace `<DATABASE>` with the database name created from the test organization.

```sql
SHOW SCHEMAS IN DATABASE <DATABASE>;

SELECT COUNT(*) FROM <DATABASE>.CUSTOMER_UPLOAD.CUSTOMERS;
SELECT COUNT(*) FROM <DATABASE>.CUSTOMER_UPLOAD.ORDERS;
```

Current expected counts after all three uploads:

- `CUSTOMER_UPLOAD.CUSTOMERS`: 5
- `CUSTOMER_UPLOAD.ORDERS`: 3

## Rollback checks

Rollback follows the actions recorded for the selected import.

1. Roll back Case 3: only its 2 appended rows are deleted. `CUSTOMERS` returns
   from 5 rows to 3 rows.
2. Roll back Case 2: only the new `ORDERS` table is dropped. The database,
   schema, and `CUSTOMERS` table remain.
3. Roll back Case 1 last: the database created by Case 1 is dropped.
4. Trying to roll back Case 1 before newer dependent imports is blocked.
