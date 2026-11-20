# Database schema

`store_management_full.sql` is the single SQL source for the current schema and
legacy upgrades. The separate phase, repair, authorization and backup-copy SQL
files have been consolidated into it. The database remains named `store_management`.

The file creates a database when absent. On an existing database it creates
missing tables, adds the known legacy columns, updates names and keys, and retains
business data. The 24 mapped business/security tables and `authorization_migrations`
are included, along with indexes, foreign keys, checks and paid-invoice triggers.

The backend embeds this file. `DatabaseSchemaInitializer` runs its application
section on the database configured by `ConnectionStrings:DefaultConnection`;
it never switches an application connection to the hardcoded database name.
`AuthorizationSchemaInitializer` then retains the existing C# migration that
parses recipient information from historical order notes. SQL Server must already
be installed and accessible. Creating an absent database requires CREATE DATABASE;
upgrading an existing one requires schema modification permissions.

## Apply manually

From the repository root, using Windows authentication:

```powershell
.\Staff-E-commerce-main\scripts\setup-db.ps1 -Server 'localhost\SQLEXPRESS'
```

Alternatively, execute `store_management_full.sql` in SSMS. Stop execution on the
first error; with sqlcmd use `-b -I -f 65001`. All application changes share one
transaction and an application lock. The setup script and backend roll back on
failure. There is no database reset or DROP DATABASE command.

## Legacy objects

- `customers.date_of_birth`: removed from new and existing databases. Applying
  the schema permanently deletes existing customer birthday values. Deploy the
  updated backend with this schema; an older backend still queries this column.
  Employee birthdays remain available.
- `inventory`: populate missing `products.stock_quantity`, check all quantities,
  then remove the old table. Conflicting/orphan/duplicate rows stop the upgrade.
- `po_details`: renamed to `purchase_order_items`; `import_price` becomes `unit_cost`
  and the computed `subtotal` is replaced by `line_total`.
- `event_promotions`: renamed to `invoice_promotions`; `min_order_amount` becomes
  `min_invoice_amount`.
- `products.price`: renamed to `selling_price`.
- Composite keys: purchase order/product, invoice/product and promotion/product.
  Identical historical invoice snapshots are combined with quantity and amount
  sums retained. Different snapshots, NULL keys and other duplicate pairs stop
  the upgrade and require reconciliation.
- Unused AI tables are not created. Empty legacy AI tables are removed; tables
  with historical messages are retained for explicit export/removal.

Rerunning the script preserves stock, existing values and revoked role grants.
The normal startup seeds role and permission metadata, without inserting demo
accounts or business records. Permission assignments are seeded once using the
existing `permissions-v1` marker.

## Optional demo data

Only on empty business tables:

```powershell
.\Staff-E-commerce-main\scripts\setup-db.ps1 -Server 'localhost\SQLEXPRESS' -SeedDemoData
```

This imports the existing demo dataset once (including 80 products). Demo login:
`admin` / `admin123`. In SSMS, opt in on the same connection before running the file:

```sql
EXEC sys.sp_set_session_context @key=N'emart_seed_demo', @value=1;
```

## Verification

The schema regression runner creates and deletes uniquely named temporary databases;
it never modifies the configured application database:

```powershell
dotnet restore Staff-E-commerce-main/tests/SchemaRegression/SchemaRegression.csproj --configfile Staff-E-commerce-main/NuGet.Config
dotnet build Staff-E-commerce-main/tests/SchemaRegression/SchemaRegression.csproj --no-restore -o Staff-E-commerce-main/.tmp/schema-regression -p:UseAppHost=false
dotnet Staff-E-commerce-main/.tmp/schema-regression/SchemaRegression.dll D:/E-mart-C-/Staff-E-commerce-main/backend
```

It verifies every mapped column by querying all entity sets, fresh database
creation, legacy names/stock/discounts/keys, repeated initialization, permission
revocation, atomic rollback, historical invoice totals, and optional demo data.
