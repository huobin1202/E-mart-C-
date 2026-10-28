/*
  Phase 1: add the new columns and backfill them while the legacy inventory
  table still exists. This script is idempotent and safe to run before the
  application is switched to products.stock_quantity.
*/
USE store_management;
GO

SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.products', 'stock_quantity') IS NULL
    ALTER TABLE dbo.products ADD stock_quantity INT NULL;
GO

IF OBJECT_ID('dbo.inventory', 'U') IS NOT NULL
BEGIN
    UPDATE product
    SET stock_quantity = ISNULL(stock.quantity, 0)
    FROM dbo.products product
    LEFT JOIN dbo.inventory stock ON stock.product_id = product.id;
END
ELSE
    UPDATE dbo.products SET stock_quantity = 0 WHERE stock_quantity IS NULL;

UPDATE dbo.products SET stock_quantity = 0 WHERE stock_quantity IS NULL;
ALTER TABLE dbo.products ALTER COLUMN stock_quantity INT NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('dbo.products') AND name = 'df_products_stock_quantity')
    ALTER TABLE dbo.products ADD CONSTRAINT df_products_stock_quantity DEFAULT (0) FOR stock_quantity;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('dbo.products') AND name = 'ck_products_stock_quantity')
    ALTER TABLE dbo.products ADD CONSTRAINT ck_products_stock_quantity CHECK (stock_quantity >= 0);

IF COL_LENGTH('dbo.employees', 'family_middle_name') IS NULL
    ALTER TABLE dbo.employees ADD family_middle_name NVARCHAR(200) NULL;
IF COL_LENGTH('dbo.employees', 'given_name') IS NULL
    ALTER TABLE dbo.employees ADD given_name NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.employees', 'base_salary') IS NULL
    ALTER TABLE dbo.employees ADD base_salary DECIMAL(18,2) NOT NULL CONSTRAINT df_employees_base_salary DEFAULT (0);
GO

UPDATE employee
SET given_name = CASE WHEN split.last_space = 0 THEN split.normalized_name ELSE RIGHT(split.normalized_name, split.last_space - 1) END,
    family_middle_name = CASE WHEN split.last_space = 0 THEN N'' ELSE LEFT(split.normalized_name, LEN(split.normalized_name) - split.last_space) END
FROM dbo.employees employee
CROSS APPLY (
    SELECT normalized_name, CHARINDEX(N' ', REVERSE(normalized_name)) AS last_space
    FROM (SELECT LTRIM(RTRIM(employee.full_name)) AS normalized_name) source_name
) split
WHERE employee.given_name IS NULL OR employee.family_middle_name IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('dbo.employees') AND name = 'ck_employees_base_salary')
    ALTER TABLE dbo.employees ADD CONSTRAINT ck_employees_base_salary CHECK (base_salary >= 0);

IF COL_LENGTH('dbo.purchase_orders', 'employee_id') IS NULL
    ALTER TABLE dbo.purchase_orders ADD employee_id INT NULL;
GO

UPDATE purchase_order
SET employee_id = account.employee_id
FROM dbo.purchase_orders purchase_order
JOIN dbo.users account ON account.id = purchase_order.user_id
WHERE purchase_order.employee_id IS NULL AND account.employee_id IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_purchase_orders_employee')
    ALTER TABLE dbo.purchase_orders ADD CONSTRAINT fk_purchase_orders_employee FOREIGN KEY (employee_id) REFERENCES dbo.employees(id) ON DELETE SET NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.purchase_orders') AND name = 'idx_purchase_orders_employee')
    CREATE INDEX idx_purchase_orders_employee ON dbo.purchase_orders(employee_id);

IF COL_LENGTH('dbo.invoices', 'employee_id') IS NULL
    ALTER TABLE dbo.invoices ADD employee_id INT NULL;
IF COL_LENGTH('dbo.invoices', 'customer_id') IS NULL
    ALTER TABLE dbo.invoices ADD customer_id INT NULL;
GO

UPDATE invoice
SET employee_id = account.employee_id,
    customer_id = sales_order.customer_id
FROM dbo.invoices invoice
JOIN dbo.orders sales_order ON sales_order.id = invoice.order_id
LEFT JOIN dbo.users account ON account.id = sales_order.user_id
WHERE invoice.employee_id IS NULL OR invoice.customer_id IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_invoices_employee')
    ALTER TABLE dbo.invoices ADD CONSTRAINT fk_invoices_employee FOREIGN KEY (employee_id) REFERENCES dbo.employees(id) ON DELETE SET NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_invoices_customer')
    ALTER TABLE dbo.invoices ADD CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id) ON DELETE SET NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.invoices') AND name = 'idx_invoices_employee')
    CREATE INDEX idx_invoices_employee ON dbo.invoices(employee_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.invoices') AND name = 'idx_invoices_customer')
    CREATE INDEX idx_invoices_customer ON dbo.invoices(customer_id);

COMMIT TRANSACTION;
GO

IF OBJECT_ID('dbo.inventory', 'U') IS NOT NULL
    EXEC(N'SELECT COUNT(*) AS stock_mismatch_count
           FROM dbo.products product
           JOIN dbo.inventory stock ON stock.product_id = product.id
           WHERE product.stock_quantity <> stock.quantity;');
ELSE
    SELECT CAST(0 AS INT) AS stock_mismatch_count;
GO
