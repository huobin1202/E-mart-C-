-- Canonical SQL Server schema: create missing objects and upgrade legacy databases.
-- Re-runnable; existing business data is retained. Never drops/recreates the database.
-- Run with SSMS or: powershell -File scripts/setup-db.ps1
-- Optional demo fixtures: setup-db.ps1 -SeedDemoData (empty databases only).
-- Backend embeds the application section below and runs it at startup.
USE master;
GO
IF DB_ID(N'store_management') IS NULL
    EXEC(N'CREATE DATABASE [store_management] COLLATE Vietnamese_CI_AS;');
GO
USE [store_management];
GO
-- BEGIN APPLICATION SCHEMA
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
BEGIN TRANSACTION;
DECLARE @lockResult INT;
EXEC @lockResult = sys.sp_getapplock @Resource = N'emart-schema', @LockMode = 'Exclusive',
    @LockOwner = 'Transaction', @LockTimeout = 60000;
IF @lockResult < 0 THROW 51000, 'Cannot acquire database schema lock.', 1;
GO

-- Rename legacy objects before checking for the modern tables.
IF OBJECT_ID(N'dbo.po_details', N'U') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'dbo.purchase_order_items', N'U') IS NOT NULL
        THROW 51001, 'Both po_details and purchase_order_items exist; reconcile them before upgrading.', 1;
    EXEC sys.sp_rename N'dbo.po_details', N'purchase_order_items';
END;
GO
IF OBJECT_ID(N'dbo.event_promotions', N'U') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'dbo.invoice_promotions', N'U') IS NOT NULL
        THROW 51001, 'Both event_promotions and invoice_promotions exist; reconcile them before upgrading.', 1;
    EXEC sys.sp_rename N'dbo.event_promotions', N'invoice_promotions';
END;
GO
IF COL_LENGTH(N'dbo.products', N'price') IS NOT NULL AND COL_LENGTH(N'dbo.products', N'selling_price') IS NULL
    EXEC sys.sp_rename N'dbo.products.price', N'selling_price', N'COLUMN';
IF COL_LENGTH(N'dbo.purchase_order_items', N'import_price') IS NOT NULL AND COL_LENGTH(N'dbo.purchase_order_items', N'unit_cost') IS NULL
BEGIN
    IF COL_LENGTH(N'dbo.purchase_order_items', N'subtotal') IS NOT NULL
        ALTER TABLE dbo.purchase_order_items DROP COLUMN subtotal;
    IF OBJECT_ID(N'dbo.ck_po_details_import_price', N'C') IS NOT NULL
        ALTER TABLE dbo.purchase_order_items DROP CONSTRAINT ck_po_details_import_price;
    IF OBJECT_ID(N'dbo.ck_purchase_order_items_unit_cost', N'C') IS NOT NULL
        ALTER TABLE dbo.purchase_order_items DROP CONSTRAINT ck_purchase_order_items_unit_cost;
    EXEC sys.sp_rename N'dbo.purchase_order_items.import_price', N'unit_cost', N'COLUMN';
END;
IF COL_LENGTH(N'dbo.invoice_promotions', N'min_order_amount') IS NOT NULL AND COL_LENGTH(N'dbo.invoice_promotions', N'min_invoice_amount') IS NULL
BEGIN
    IF OBJECT_ID(N'dbo.ck_event_min_order', N'C') IS NOT NULL
        ALTER TABLE dbo.invoice_promotions DROP CONSTRAINT ck_event_min_order;
    IF OBJECT_ID(N'dbo.ck_invoice_promotions_min_invoice_amount', N'C') IS NOT NULL
        ALTER TABLE dbo.invoice_promotions DROP CONSTRAINT ck_invoice_promotions_min_invoice_amount;
    DECLARE @dropDefault NVARCHAR(MAX);
    SELECT @dropDefault = N'ALTER TABLE dbo.invoice_promotions DROP CONSTRAINT ' + QUOTENAME(d.name)
    FROM sys.default_constraints d JOIN sys.columns c ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
    WHERE d.parent_object_id=OBJECT_ID(N'dbo.invoice_promotions') AND c.name=N'min_order_amount';
    IF @dropDefault IS NOT NULL EXEC sys.sp_executesql @dropDefault;
    EXEC sys.sp_rename N'dbo.invoice_promotions.min_order_amount', N'min_invoice_amount', N'COLUMN';
END;
GO

-- Complete current schema (no inventory, po_details, event_promotions or AI tables).
IF OBJECT_ID(N'dbo.categories', N'U') IS NULL
BEGIN
CREATE TABLE dbo.categories (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(191) NOT NULL,
  slug NVARCHAR(191) DEFAULT NULL,
  description NVARCHAR(MAX),
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- SQL Server: dùng filtered unique index bên dưới để cho phép nhiều NULL
);
END;
GO

IF OBJECT_ID(N'dbo.suppliers', N'U') IS NULL
BEGIN
CREATE TABLE dbo.suppliers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(255) NOT NULL,
  contact_name NVARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  address NVARCHAR(MAX),
  region NVARCHAR(10) NULL,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_suppliers_region CHECK (region IS NULL OR region IN (N'Bắc', N'Trung', N'Nam'))
);
END;
GO

IF OBJECT_ID(N'dbo.customers', N'U') IS NULL
BEGIN
CREATE TABLE dbo.customers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  full_name NVARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  password_hash VARCHAR(512) DEFAULT NULL,
  email VARCHAR(255),
  date_of_birth DATE NULL,
  reward_points INT NOT NULL DEFAULT 0,
  address NVARCHAR(MAX),
  note NVARCHAR(MAX),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BIT NOT NULL DEFAULT 1,
  -- SQL Server: dùng filtered unique indexes bên dưới để cho phép nhiều NULL.
);
END;
GO

IF OBJECT_ID(N'dbo.employees', N'U') IS NULL
BEGIN
CREATE TABLE dbo.employees (
  id INT IDENTITY(1,1) PRIMARY KEY,
  full_name NVARCHAR(255) NOT NULL,
  family_middle_name NVARCHAR(200),
  given_name NVARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  date_of_birth DATE NULL,
  address NVARCHAR(MAX),
  note NVARCHAR(MAX),
  base_salary DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT ck_employees_base_salary CHECK (base_salary >= 0)
);
END;
GO

IF OBJECT_ID(N'dbo.roles', N'U') IS NULL
BEGIN
CREATE TABLE dbo.roles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description NVARCHAR(255),
  is_active BIT NOT NULL DEFAULT 1
);
END;
GO

IF OBJECT_ID(N'dbo.permissions', N'U') IS NULL
BEGIN
CREATE TABLE dbo.permissions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name NVARCHAR(150) NOT NULL,
  description NVARCHAR(255)
);
END;
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
CREATE TABLE dbo.users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  username VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(512) NOT NULL,
  full_name NVARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  role_id INT NOT NULL,
  employee_id INT NULL,
  customer_id INT NULL,
  is_active BIT NOT NULL DEFAULT 1,
  locked BIT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME DEFAULT NULL,
  session_version INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_users_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);
END;
GO

IF OBJECT_ID(N'dbo.role_permissions', N'U') IS NULL
BEGIN
CREATE TABLE dbo.role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);
END;
GO

IF OBJECT_ID(N'dbo.promotions', N'U') IS NULL
BEGIN
CREATE TABLE dbo.promotions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name NVARCHAR(150) NOT NULL,
  type VARCHAR(20) NOT NULL,
  discount_type VARCHAR(10) NOT NULL,
  discount_value DECIMAL(12,2) NOT NULL,
  description NVARCHAR(1000),
  start_date DATETIME NOT NULL,
  end_date DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  max_discount DECIMAL(12,2) DEFAULT NULL,
  usage_limit INT DEFAULT NULL,
  used_count INT NOT NULL DEFAULT 0,
  is_deleted BIT NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_promotions_type CHECK (type IN ('product','event','voucher')),
  CONSTRAINT ck_promotions_discount_type CHECK (discount_type IN ('percent','fixed')),
  CONSTRAINT ck_promotions_discount_value CHECK (discount_value > 0 AND (discount_type <> 'percent' OR discount_value <= 100)),
  CONSTRAINT ck_promotions_status CHECK (status IN ('active','expired','disabled')),
  CONSTRAINT ck_promotions_dates CHECK (end_date >= start_date),
  CONSTRAINT ck_promotions_usage CHECK (usage_limit IS NULL OR usage_limit >= 0),
  CONSTRAINT ck_promotions_used_count CHECK (used_count >= 0)
);
END;
GO

IF OBJECT_ID(N'dbo.invoice_promotions', N'U') IS NULL
BEGIN
CREATE TABLE dbo.invoice_promotions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  promotion_id INT NOT NULL UNIQUE,
  min_invoice_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) NULL,
  CONSTRAINT fk_invoice_promotions_promotion
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
  CONSTRAINT ck_invoice_promotions_min_invoice_amount CHECK (min_invoice_amount >= 0),
  CONSTRAINT ck_invoice_promotions_discount_percent CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100)
);
END;
GO

IF OBJECT_ID(N'dbo.voucher_promotions', N'U') IS NULL
BEGIN
CREATE TABLE dbo.voucher_promotions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  promotion_id INT NOT NULL UNIQUE,
  voucher_code VARCHAR(50) NOT NULL UNIQUE,
  discount_percent DECIMAL(5,2) NULL,
  CONSTRAINT fk_voucher_promotions_promotion
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
  CONSTRAINT ck_voucher_code CHECK (LEN(voucher_code) > 0),
  CONSTRAINT ck_voucher_discount_percent CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100)
);
END;
GO

IF OBJECT_ID(N'dbo.units', N'U') IS NULL
BEGIN
CREATE TABLE dbo.units (
  id INT IDENTITY(1,1) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name NVARCHAR(255) NOT NULL,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
END;
GO

IF OBJECT_ID(N'dbo.products', N'U') IS NULL
BEGIN
CREATE TABLE dbo.products (
  id INT IDENTITY(1,1) PRIMARY KEY,
  sku VARCHAR(100) DEFAULT NULL,
  product_name NVARCHAR(255) NOT NULL,
  barcode VARCHAR(191) DEFAULT NULL,
  category_id INT DEFAULT NULL,
  supplier_id INT DEFAULT NULL,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost DECIMAL(12,2) DEFAULT 0,
  stock_quantity INT NOT NULL DEFAULT 0,
  unit_id INT DEFAULT NULL,
  description NVARCHAR(MAX),
  image_url VARCHAR(1024) DEFAULT NULL,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_products_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT ck_products_stock_quantity CHECK (stock_quantity >= 0)
);
END;
GO

IF OBJECT_ID(N'dbo.product_promotions', N'U') IS NULL
BEGIN
CREATE TABLE dbo.product_promotions (
  id INT IDENTITY(1,1) NOT NULL,
  promotion_id INT NOT NULL,
  product_id INT NOT NULL,
  discount_percent DECIMAL(5,2) NULL,
  CONSTRAINT pk_product_promotions PRIMARY KEY (promotion_id, product_id),
  CONSTRAINT fk_product_promotions_promotion
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_promotions_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT ck_product_promotions_discount_percent
    CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100)
);
END;
GO

IF OBJECT_ID(N'dbo.inventory_adjustments', N'U') IS NULL
BEGIN
CREATE TABLE dbo.inventory_adjustments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  product_id INT NOT NULL,
  change_amount INT NOT NULL,
  reason NVARCHAR(255) NULL,
  user_id INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_adj_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_inv_adj_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);
END;
GO

IF OBJECT_ID(N'dbo.purchase_orders', N'U') IS NULL
BEGIN
CREATE TABLE dbo.purchase_orders (
  id INT IDENTITY(1,1) PRIMARY KEY,
  po_code VARCHAR(20) NOT NULL UNIQUE,
  supplier_id INT NOT NULL,
  user_id INT NOT NULL,
  employee_id INT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  note NVARCHAR(MAX),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_purchase_orders_supplier
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT fk_purchase_orders_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT fk_purchase_orders_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT ck_purchase_orders_status CHECK (status IN ('pending','completed','cancelled'))
);
END;
GO

IF OBJECT_ID(N'dbo.purchase_order_items', N'U') IS NULL
BEGIN
CREATE TABLE dbo.purchase_order_items (
  id INT IDENTITY(1,1) NOT NULL,
  purchase_order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  line_total AS (quantity * unit_cost) PERSISTED,
  CONSTRAINT pk_purchase_order_items PRIMARY KEY (purchase_order_id, product_id),
  CONSTRAINT fk_purchase_order_items_order
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_order_items_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE NO ACTION,
  CONSTRAINT ck_purchase_order_items_quantity CHECK (quantity > 0),
  CONSTRAINT ck_purchase_order_items_unit_cost CHECK (unit_cost >= 0)
);
END;
GO

IF OBJECT_ID(N'dbo.orders', N'U') IS NULL
BEGIN
CREATE TABLE dbo.[orders] (
  id INT IDENTITY(1,1) PRIMARY KEY,
  order_number VARCHAR(100) NOT NULL UNIQUE,
  customer_id INT DEFAULT NULL,
  user_id INT DEFAULT NULL, -- staff who created the order
  promotion_id INT DEFAULT NULL,
  order_type VARCHAR(20) NOT NULL DEFAULT 'pos',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(20) DEFAULT NULL,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  checkout_key VARCHAR(36) NULL,
  checkout_hash VARCHAR(64) NULL,
  points_used INT NOT NULL DEFAULT 0,
  points_earned INT NOT NULL DEFAULT 0,
  cash_received DECIMAL(12,2) NULL,
  recipient_name NVARCHAR(255) NULL,
  recipient_phone NVARCHAR(50) NULL,
  shipping_address NVARCHAR(MAX) NULL,
  note NVARCHAR(MAX),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_orders_promo FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT ck_orders_type CHECK (order_type IN ('pos','mobile')),
  CONSTRAINT ck_orders_status CHECK (status IN ('pending','processing','completed','cancelled','refunded')),
  CONSTRAINT ck_orders_payment_method CHECK (payment_method IS NULL OR payment_method IN ('cash','card','e_wallet')),
  CONSTRAINT ck_orders_payment_status CHECK (payment_status IN ('pending','paid','failed','refunded')),
  CONSTRAINT ck_orders_amounts CHECK (subtotal >= 0 AND discount >= 0 AND total_amount >= 0)
);
END;
GO

IF OBJECT_ID(N'dbo.order_items', N'U') IS NULL
BEGIN
CREATE TABLE dbo.order_items (
  id INT IDENTITY(1,1) PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES [orders](id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE NO ACTION ON UPDATE CASCADE
);
END;
GO

IF OBJECT_ID(N'dbo.payments', N'U') IS NULL
BEGIN
CREATE TABLE dbo.payments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  order_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  method VARCHAR(20) NOT NULL DEFAULT 'cash',
  transaction_ref VARCHAR(255) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES [orders](id) ON DELETE CASCADE ON UPDATE CASCADE
);
END;
GO

IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL
BEGIN
CREATE TABLE dbo.invoices (
  id INT IDENTITY(1,1) PRIMARY KEY,
  order_id INT NOT NULL UNIQUE,
  employee_id INT NULL,
  customer_id INT NULL,
  invoice_number VARCHAR(120) NOT NULL UNIQUE,
  invoice_status VARCHAR(20) NOT NULL DEFAULT 'issued',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(20) NULL,
  customer_name NVARCHAR(255) NOT NULL DEFAULT N'Khách lẻ',
  customer_phone VARCHAR(50) NULL,
  customer_email VARCHAR(255) NULL,
  customer_address NVARCHAR(MAX) NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  issued_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES [orders](id) ON DELETE NO ACTION,
  CONSTRAINT fk_invoices_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT ck_invoices_status CHECK (invoice_status IN ('issued','paid','voided','refunded')),
  CONSTRAINT ck_invoices_payment_status CHECK (payment_status IN ('pending','paid','failed','refunded')),
  CONSTRAINT ck_invoices_amounts CHECK (subtotal >= 0 AND tax_amount >= 0 AND shipping_fee >= 0 AND discount_amount >= 0 AND total_amount >= 0)
);
END;
GO

IF OBJECT_ID(N'dbo.invoice_items', N'U') IS NULL
BEGIN
CREATE TABLE dbo.invoice_items (
  id INT IDENTITY(1,1) NOT NULL,
  invoice_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name NVARCHAR(255) NOT NULL,
  sku VARCHAR(100) NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL,
  CONSTRAINT pk_invoice_items PRIMARY KEY (invoice_id, product_id),
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE NO ACTION,
  CONSTRAINT fk_invoice_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE NO ACTION,
  CONSTRAINT ck_invoice_items_quantity CHECK (quantity > 0),
  CONSTRAINT ck_invoice_items_amounts CHECK (unit_price >= 0 AND total_price >= 0)
);
END;
GO

IF OBJECT_ID(N'dbo.promotion_redemptions', N'U') IS NULL
BEGIN
CREATE TABLE dbo.promotion_redemptions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  promotion_id INT NOT NULL,
  customer_id INT DEFAULT NULL,
  order_id INT DEFAULT NULL,
  redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_promotion FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pr_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_pr_order FOREIGN KEY (order_id) REFERENCES [orders](id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
END;
GO

IF OBJECT_ID(N'dbo.activity_logs', N'U') IS NULL
BEGIN
CREATE TABLE dbo.activity_logs (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  user_id INT DEFAULT NULL,
  action VARCHAR(191) NOT NULL, -- e.g., "create_order", "adjust_inventory"
  entity_type VARCHAR(100) DEFAULT NULL, -- e.g., "orders", "products"
  entity_id VARCHAR(100) DEFAULT NULL,
  payload NVARCHAR(MAX) DEFAULT NULL,
  ip_address VARCHAR(50) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);
END;
GO

IF OBJECT_ID(N'dbo.authorization_migrations', N'U') IS NULL
    CREATE TABLE dbo.authorization_migrations (name VARCHAR(100) NOT NULL PRIMARY KEY);
GO

-- Add columns introduced after the legacy schema.
IF COL_LENGTH(N'dbo.products', N'stock_quantity') IS NULL
    ALTER TABLE dbo.products ADD stock_quantity INT NULL;
IF COL_LENGTH(N'dbo.employees', N'family_middle_name') IS NULL
    ALTER TABLE dbo.employees ADD family_middle_name NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.employees', N'given_name') IS NULL
    ALTER TABLE dbo.employees ADD given_name NVARCHAR(100) NULL;
IF COL_LENGTH(N'dbo.employees', N'base_salary') IS NULL
    ALTER TABLE dbo.employees ADD base_salary DECIMAL(18,2) NOT NULL CONSTRAINT df_employees_base_salary DEFAULT (0);
IF COL_LENGTH(N'dbo.purchase_orders', N'employee_id') IS NULL
    ALTER TABLE dbo.purchase_orders ADD employee_id INT NULL;
IF COL_LENGTH(N'dbo.invoices', N'employee_id') IS NULL
    ALTER TABLE dbo.invoices ADD employee_id INT NULL;
IF COL_LENGTH(N'dbo.invoices', N'customer_id') IS NULL
    ALTER TABLE dbo.invoices ADD customer_id INT NULL;
-- Supplier region (Miền). Nullable: existing suppliers stay "Chưa phân loại"; addresses are not touched or parsed.
IF COL_LENGTH(N'dbo.suppliers', N'region') IS NULL
    ALTER TABLE dbo.suppliers ADD region NVARCHAR(10) NULL;
GO
IF OBJECT_ID(N'dbo.ck_suppliers_region', N'C') IS NULL
    ALTER TABLE dbo.suppliers WITH CHECK ADD CONSTRAINT ck_suppliers_region CHECK (region IS NULL OR region IN (N'Bắc', N'Trung', N'Nam'));
GO
-- Authorization, checkout and delivery columns from the former startup initializer.
IF COL_LENGTH(N'dbo.employees', N'date_of_birth') IS NULL
    ALTER TABLE dbo.employees ADD date_of_birth DATE NULL;
IF COL_LENGTH(N'dbo.customers', N'date_of_birth') IS NULL
    ALTER TABLE dbo.customers ADD date_of_birth DATE NULL;
IF COL_LENGTH(N'dbo.users', N'employee_id') IS NULL
    ALTER TABLE dbo.users ADD employee_id INT NULL;
IF COL_LENGTH(N'dbo.users', N'customer_id') IS NULL
    ALTER TABLE dbo.users ADD customer_id INT NULL;
IF COL_LENGTH(N'dbo.users', N'role_id') IS NULL
    ALTER TABLE dbo.users ADD role_id INT NULL;
IF COL_LENGTH(N'dbo.users', N'session_version') IS NULL
    ALTER TABLE dbo.users ADD session_version INT NOT NULL CONSTRAINT df_users_session_version DEFAULT (0);
IF COL_LENGTH(N'dbo.orders', N'checkout_key') IS NULL
    ALTER TABLE dbo.orders ADD checkout_key VARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.orders', N'checkout_hash') IS NULL
    ALTER TABLE dbo.orders ADD checkout_hash VARCHAR(64) NULL;
IF COL_LENGTH(N'dbo.orders', N'points_used') IS NULL
    ALTER TABLE dbo.orders ADD points_used INT NOT NULL DEFAULT (0);
IF COL_LENGTH(N'dbo.orders', N'points_earned') IS NULL
    ALTER TABLE dbo.orders ADD points_earned INT NOT NULL DEFAULT (0);
IF COL_LENGTH(N'dbo.orders', N'cash_received') IS NULL
    ALTER TABLE dbo.orders ADD cash_received DECIMAL(12,2) NULL;
IF COL_LENGTH(N'dbo.orders', N'recipient_name') IS NULL
    ALTER TABLE dbo.orders ADD recipient_name NVARCHAR(255) NULL;
IF COL_LENGTH(N'dbo.orders', N'recipient_phone') IS NULL
    ALTER TABLE dbo.orders ADD recipient_phone NVARCHAR(50) NULL;
IF COL_LENGTH(N'dbo.orders', N'shipping_address') IS NULL
    ALTER TABLE dbo.orders ADD shipping_address NVARCHAR(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name = 'admin')
    INSERT INTO dbo.roles(name, description, is_active) VALUES ('admin', N'Quản trị toàn hệ thống', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name = 'staff')
    INSERT INTO dbo.roles(name, description, is_active) VALUES ('staff', N'Nhân viên bán hàng', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE name = 'customer')
    INSERT INTO dbo.roles(name, description, is_active) VALUES ('customer', N'Khách hàng', 1);
IF COL_LENGTH(N'dbo.users', N'role') IS NOT NULL
    EXEC(N'UPDATE u SET role_id = r.id FROM dbo.users u JOIN dbo.roles r ON r.name = LOWER(COALESCE(u.role, ''staff'')) WHERE u.role_id IS NULL;');
UPDATE dbo.users SET role_id = (SELECT id FROM dbo.roles WHERE name = 'staff') WHERE role_id IS NULL;
ALTER TABLE dbo.users ALTER COLUMN role_id INT NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns WHERE parent_object_id=OBJECT_ID(N'dbo.users') AND COL_NAME(parent_object_id,parent_column_id)=N'employee_id')
    ALTER TABLE dbo.users WITH CHECK ADD CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES dbo.employees(id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns WHERE parent_object_id=OBJECT_ID(N'dbo.users') AND COL_NAME(parent_object_id,parent_column_id)=N'customer_id')
    ALTER TABLE dbo.users WITH CHECK ADD CONSTRAINT fk_users_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns WHERE parent_object_id=OBJECT_ID(N'dbo.users') AND COL_NAME(parent_object_id,parent_column_id)=N'role_id')
    ALTER TABLE dbo.users WITH CHECK ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES dbo.roles(id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.orders') AND name=N'ux_orders_checkout_key')
    CREATE UNIQUE INDEX ux_orders_checkout_key ON dbo.orders(checkout_key) WHERE checkout_key IS NOT NULL;
IF OBJECT_ID(N'dbo.ck_employees_base_salary',N'C') IS NULL
    ALTER TABLE dbo.employees WITH CHECK ADD CONSTRAINT ck_employees_base_salary CHECK(base_salary >= 0);
GO
-- Backfill only missing values. Existing product stock is authoritative.
IF OBJECT_ID(N'dbo.inventory', N'U') IS NOT NULL
    EXEC(N'
        IF EXISTS (SELECT product_id FROM dbo.inventory GROUP BY product_id HAVING COUNT(*) > 1)
            THROW 51002, ''Duplicate inventory rows require reconciliation.'', 1;
        UPDATE p SET stock_quantity = ISNULL(i.quantity, 0)
        FROM dbo.products p LEFT JOIN dbo.inventory i ON i.product_id = p.id
        WHERE p.stock_quantity IS NULL;
        IF EXISTS (SELECT 1 FROM dbo.inventory i LEFT JOIN dbo.products p ON p.id = i.product_id WHERE p.id IS NULL)
            THROW 51003, ''Orphan inventory rows require reconciliation.'', 1;
        IF EXISTS (SELECT 1 FROM dbo.products p LEFT JOIN dbo.inventory i ON i.product_id = p.id
                   WHERE p.stock_quantity <> ISNULL(i.quantity, 0))
            THROW 51004, ''Product stock differs from legacy inventory; reconcile before removing inventory.'', 1;
        DROP TABLE dbo.inventory;');
UPDATE dbo.products SET stock_quantity = 0 WHERE stock_quantity IS NULL;
ALTER TABLE dbo.products ALTER COLUMN stock_quantity INT NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints d JOIN sys.columns c
    ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
    WHERE d.parent_object_id = OBJECT_ID(N'dbo.products') AND c.name = N'stock_quantity')
    ALTER TABLE dbo.products ADD CONSTRAINT df_products_stock_quantity DEFAULT (0) FOR stock_quantity;
IF OBJECT_ID(N'dbo.ck_products_stock_quantity', N'C') IS NULL
    ALTER TABLE dbo.products WITH CHECK ADD CONSTRAINT ck_products_stock_quantity CHECK (stock_quantity >= 0);

-- Every internal account (admin/staff) sells, so each needs an employee profile; otherwise its
-- invoices land in "Chưa gán nhân viên". Create the missing profiles from the account data;
-- the invoice/purchase-order backfill below then attributes their historical documents.
DECLARE @orphanUserId INT, @newEmployeeId INT;
WHILE 1 = 1
BEGIN
    SET @orphanUserId = NULL;
    SELECT TOP (1) @orphanUserId = u.id FROM dbo.users u JOIN dbo.roles r ON r.id = u.role_id
    WHERE u.employee_id IS NULL AND r.name <> 'customer' ORDER BY u.id;
    IF @orphanUserId IS NULL BREAK;
    INSERT INTO dbo.employees (full_name, phone, email, is_active)
    SELECT LTRIM(RTRIM(full_name)), phone, email, is_active FROM dbo.users WHERE id = @orphanUserId;
    SET @newEmployeeId = SCOPE_IDENTITY();
    UPDATE dbo.users SET employee_id = @newEmployeeId WHERE id = @orphanUserId;
END;

UPDATE e SET given_name = CASE WHEN s.last_space = 0 THEN s.full_name ELSE RIGHT(s.full_name, s.last_space - 1) END,
    family_middle_name = CASE WHEN s.last_space = 0 THEN N'' ELSE LEFT(s.full_name, LEN(s.full_name) - s.last_space) END
FROM dbo.employees e
CROSS APPLY (SELECT LTRIM(RTRIM(e.full_name)) AS full_name, CHARINDEX(N' ', REVERSE(LTRIM(RTRIM(e.full_name)))) AS last_space) s
WHERE e.given_name IS NULL OR e.family_middle_name IS NULL;
UPDATE po SET employee_id = u.employee_id FROM dbo.purchase_orders po JOIN dbo.users u ON u.id = po.user_id
WHERE po.employee_id IS NULL AND u.employee_id IS NOT NULL;
UPDATE i SET employee_id = COALESCE(i.employee_id, u.employee_id), customer_id = COALESCE(i.customer_id, o.customer_id)
FROM dbo.invoices i JOIN dbo.orders o ON o.id = i.order_id LEFT JOIN dbo.users u ON u.id = o.user_id
WHERE i.employee_id IS NULL OR i.customer_id IS NULL;
GO
IF COL_LENGTH(N'dbo.purchase_order_items', N'line_total') IS NULL
    ALTER TABLE dbo.purchase_order_items ADD line_total AS (quantity * unit_cost) PERSISTED;
IF OBJECT_ID(N'dbo.ck_purchase_order_items_unit_cost', N'C') IS NULL
    ALTER TABLE dbo.purchase_order_items WITH CHECK ADD CONSTRAINT ck_purchase_order_items_unit_cost CHECK (unit_cost >= 0);
IF OBJECT_ID(N'dbo.ck_invoice_promotions_min_invoice_amount', N'C') IS NULL
    ALTER TABLE dbo.invoice_promotions WITH CHECK ADD CONSTRAINT ck_invoice_promotions_min_invoice_amount CHECK (min_invoice_amount >= 0);
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints d JOIN sys.columns c ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
    WHERE d.parent_object_id=OBJECT_ID(N'dbo.invoice_promotions') AND c.name=N'min_invoice_amount')
    ALTER TABLE dbo.invoice_promotions ADD CONSTRAINT df_invoice_promotions_min_invoice_amount DEFAULT (0) FOR min_invoice_amount;
GO
IF COL_LENGTH(N'dbo.product_promotions', N'discount_percent') IS NULL
BEGIN
    ALTER TABLE dbo.product_promotions ADD discount_percent DECIMAL(5,2) NULL;
    EXEC(N'UPDATE d SET discount_percent = CASE WHEN p.discount_type = ''percent'' THEN CAST(p.discount_value AS DECIMAL(5,2)) END
        FROM dbo.product_promotions d JOIN dbo.promotions p ON p.id = d.promotion_id;');
END;
GO
IF OBJECT_ID(N'dbo.ck_product_promotions_discount_percent', N'C') IS NULL
    ALTER TABLE dbo.product_promotions WITH CHECK ADD CONSTRAINT ck_product_promotions_discount_percent
        CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100);
GO
IF COL_LENGTH(N'dbo.invoice_promotions', N'discount_percent') IS NULL
BEGIN
    ALTER TABLE dbo.invoice_promotions ADD discount_percent DECIMAL(5,2) NULL;
    EXEC(N'UPDATE d SET discount_percent = CASE WHEN p.discount_type = ''percent'' THEN CAST(p.discount_value AS DECIMAL(5,2)) END
        FROM dbo.invoice_promotions d JOIN dbo.promotions p ON p.id = d.promotion_id;');
END;
GO
IF OBJECT_ID(N'dbo.ck_invoice_promotions_discount_percent', N'C') IS NULL
    ALTER TABLE dbo.invoice_promotions WITH CHECK ADD CONSTRAINT ck_invoice_promotions_discount_percent
        CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100);
GO
IF COL_LENGTH(N'dbo.voucher_promotions', N'discount_percent') IS NULL
BEGIN
    ALTER TABLE dbo.voucher_promotions ADD discount_percent DECIMAL(5,2) NULL;
    EXEC(N'UPDATE d SET discount_percent = CASE WHEN p.discount_type = ''percent'' THEN CAST(p.discount_value AS DECIMAL(5,2)) END
        FROM dbo.voucher_promotions d JOIN dbo.promotions p ON p.id = d.promotion_id;');
END;
GO
IF OBJECT_ID(N'dbo.ck_voucher_discount_percent', N'C') IS NULL
    ALTER TABLE dbo.voucher_promotions WITH CHECK ADD CONSTRAINT ck_voucher_discount_percent
        CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.key_constraints k
    WHERE k.parent_object_id = OBJECT_ID(N'dbo.purchase_order_items') AND k.type = 'PK'
      AND (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id AND ic.key_ordinal > 0) = 2
      AND EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                  WHERE ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id AND ic.key_ordinal = 1 AND c.name = N'purchase_order_id')
      AND EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                  WHERE ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id AND ic.key_ordinal = 2 AND c.name = N'product_id')
)
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.purchase_order_items WHERE purchase_order_id IS NULL OR product_id IS NULL)
        THROW 51005, 'purchase_order_items has NULL key values; reconcile before upgrading.', 1;
    IF EXISTS (SELECT purchase_order_id, product_id FROM dbo.purchase_order_items GROUP BY purchase_order_id, product_id HAVING COUNT(*) > 1)
        THROW 51006, 'purchase_order_items has duplicate pairs; reconcile before upgrading.', 1;
    DECLARE @dropKey NVARCHAR(MAX) = N'';
    SELECT @dropKey = N'ALTER TABLE dbo.purchase_order_items DROP CONSTRAINT ' + QUOTENAME(name) + N';'
    FROM sys.key_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.purchase_order_items') AND type = 'PK';
    EXEC sys.sp_executesql @dropKey;
    ALTER TABLE dbo.purchase_order_items ADD CONSTRAINT pk_purchase_order_items PRIMARY KEY (purchase_order_id, product_id);
END;
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.key_constraints k
    WHERE k.parent_object_id = OBJECT_ID(N'dbo.invoice_items') AND k.type = 'PK'
      AND (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id AND ic.key_ordinal > 0) = 2
      AND EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                  WHERE ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id AND ic.key_ordinal = 1 AND c.name = N'invoice_id')
      AND EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                  WHERE ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id AND ic.key_ordinal = 2 AND c.name = N'product_id')
)
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.invoice_items WHERE invoice_id IS NULL OR product_id IS NULL)
        THROW 51005, 'invoice_items has NULL key values; reconcile before upgrading.', 1;
    -- Old invoices could repeat one product on multiple identical snapshot lines.
    -- Combine only identical names/SKUs/prices, retaining quantity and amount sums.
    -- Different historical snapshots require manual reconciliation.
    IF EXISTS (SELECT invoice_id, product_id FROM dbo.invoice_items GROUP BY invoice_id, product_id
               HAVING COUNT(*) > 1 AND (MIN(unit_price) <> MAX(unit_price)
                   OR COUNT(DISTINCT product_name COLLATE Latin1_General_100_BIN2) > 1
                   OR COUNT(DISTINCT ISNULL(sku, CHAR(0)) COLLATE Latin1_General_100_BIN2) > 1))
        THROW 51008, 'Duplicate invoice lines have different snapshots; reconcile before upgrading.', 1;
    IF EXISTS (SELECT invoice_id, product_id FROM dbo.invoice_items GROUP BY invoice_id, product_id HAVING COUNT(*) > 1)
    BEGIN
        DECLARE @restoreInvoiceTrigger BIT = CASE WHEN EXISTS (SELECT 1 FROM sys.triggers
            WHERE parent_id=OBJECT_ID(N'dbo.invoice_items') AND name=N'trg_invoice_items_lock_paid_snapshot' AND is_disabled=0) THEN 1 ELSE 0 END;
        IF @restoreInvoiceTrigger=1 DISABLE TRIGGER dbo.trg_invoice_items_lock_paid_snapshot ON dbo.invoice_items;
        SELECT invoice_id, product_id, MIN(id) AS keep_id, SUM(quantity) AS quantity, SUM(total_price) AS total_price
        INTO #invoice_line_merges FROM dbo.invoice_items GROUP BY invoice_id, product_id HAVING COUNT(*) > 1;
        UPDATE target SET quantity=source.quantity, total_price=source.total_price
        FROM dbo.invoice_items target JOIN #invoice_line_merges source ON source.keep_id=target.id;
        DELETE target FROM dbo.invoice_items target JOIN #invoice_line_merges source
          ON source.invoice_id=target.invoice_id AND source.product_id=target.product_id WHERE target.id<>source.keep_id;
        DROP TABLE #invoice_line_merges;
        IF @restoreInvoiceTrigger=1 ENABLE TRIGGER dbo.trg_invoice_items_lock_paid_snapshot ON dbo.invoice_items;
    END;
    DECLARE @dropKey NVARCHAR(MAX) = N'';
    SELECT @dropKey = N'ALTER TABLE dbo.invoice_items DROP CONSTRAINT ' + QUOTENAME(name) + N';'
    FROM sys.key_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.invoice_items') AND type = 'PK';
    EXEC sys.sp_executesql @dropKey;
    SET @dropKey = N'';
    SELECT @dropKey = @dropKey + N'ALTER TABLE dbo.invoice_items DROP CONSTRAINT ' + QUOTENAME(f.name) + N';'
    FROM sys.foreign_keys f JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = f.object_id
    WHERE f.parent_object_id = OBJECT_ID(N'dbo.invoice_items') AND COL_NAME(fc.parent_object_id, fc.parent_column_id) = N'product_id';
    EXEC sys.sp_executesql @dropKey;
    ALTER TABLE dbo.invoice_items ALTER COLUMN product_id INT NOT NULL;
    ALTER TABLE dbo.invoice_items WITH CHECK ADD CONSTRAINT fk_invoice_items_product FOREIGN KEY (product_id) REFERENCES dbo.products(id);
    ALTER TABLE dbo.invoice_items ADD CONSTRAINT pk_invoice_items PRIMARY KEY (invoice_id, product_id);
END;
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.key_constraints k
    WHERE k.parent_object_id = OBJECT_ID(N'dbo.product_promotions') AND k.type = 'PK'
      AND (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id AND ic.key_ordinal > 0) = 2
      AND EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                  WHERE ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id AND ic.key_ordinal = 1 AND c.name = N'promotion_id')
      AND EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                  WHERE ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id AND ic.key_ordinal = 2 AND c.name = N'product_id')
)
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.product_promotions WHERE promotion_id IS NULL OR product_id IS NULL)
        THROW 51005, 'product_promotions has NULL key values; reconcile before upgrading.', 1;
    IF EXISTS (SELECT promotion_id, product_id FROM dbo.product_promotions GROUP BY promotion_id, product_id HAVING COUNT(*) > 1)
        THROW 51006, 'product_promotions has duplicate pairs; reconcile before upgrading.', 1;
    DECLARE @dropKey NVARCHAR(MAX) = N'';
    SELECT @dropKey = N'ALTER TABLE dbo.product_promotions DROP CONSTRAINT ' + QUOTENAME(name) + N';'
    FROM sys.key_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.product_promotions') AND type = 'PK';
    EXEC sys.sp_executesql @dropKey;
    ALTER TABLE dbo.product_promotions ADD CONSTRAINT pk_product_promotions PRIMARY KEY (promotion_id, product_id);
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns WHERE parent_object_id = OBJECT_ID(N'dbo.purchase_orders') AND COL_NAME(parent_object_id,parent_column_id) = N'employee_id')
    ALTER TABLE dbo.purchase_orders WITH CHECK ADD CONSTRAINT fk_purchase_orders_employee FOREIGN KEY (employee_id) REFERENCES dbo.employees(id) ON DELETE SET NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns WHERE parent_object_id = OBJECT_ID(N'dbo.invoices') AND COL_NAME(parent_object_id,parent_column_id) = N'employee_id')
    ALTER TABLE dbo.invoices WITH CHECK ADD CONSTRAINT fk_invoices_employee FOREIGN KEY (employee_id) REFERENCES dbo.employees(id) ON DELETE SET NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns WHERE parent_object_id = OBJECT_ID(N'dbo.invoices') AND COL_NAME(parent_object_id,parent_column_id) = N'customer_id')
    ALTER TABLE dbo.invoices WITH CHECK ADD CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id) ON DELETE SET NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.customers') AND name = N'ux_customers_phone')
    CREATE UNIQUE INDEX ux_customers_phone
ON customers(phone)
WHERE phone IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.customers') AND name = N'ux_customers_email')
    CREATE UNIQUE INDEX ux_customers_email
ON customers(email)
WHERE email IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employees') AND name = N'ux_employees_email')
    CREATE UNIQUE INDEX ux_employees_email ON employees(email) WHERE email IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'ux_users_email')
    CREATE UNIQUE INDEX ux_users_email
ON users(email)
WHERE email IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.units') AND name = N'idx_units_code')
    CREATE INDEX idx_units_code ON units (code);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'ux_products_sku')
    CREATE UNIQUE INDEX ux_products_sku
ON products(sku)
WHERE sku IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'ux_products_barcode')
    CREATE UNIQUE INDEX ux_products_barcode
ON products(barcode)
WHERE barcode IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'idx_products_category')
    CREATE INDEX idx_products_category ON products (category_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'idx_products_supplier')
    CREATE INDEX idx_products_supplier ON products (supplier_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'idx_products_unit')
    CREATE INDEX idx_products_unit ON products (unit_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.inventory_adjustments') AND name = N'idx_inv_adj_product')
    CREATE INDEX idx_inv_adj_product ON inventory_adjustments (product_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.inventory_adjustments') AND name = N'idx_inv_adj_user')
    CREATE INDEX idx_inv_adj_user ON inventory_adjustments (user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.purchase_orders') AND name = N'idx_purchase_orders_supplier')
    CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.purchase_orders') AND name = N'idx_purchase_orders_user')
    CREATE INDEX idx_purchase_orders_user ON purchase_orders(user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.purchase_orders') AND name = N'idx_purchase_orders_employee')
    CREATE INDEX idx_purchase_orders_employee ON purchase_orders(employee_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.purchase_order_items') AND name = N'idx_purchase_order_items_product')
    CREATE INDEX idx_purchase_order_items_product ON purchase_order_items(product_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.orders') AND name = N'idx_orders_customer')
    CREATE INDEX idx_orders_customer ON [orders] (customer_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.orders') AND name = N'idx_orders_user')
    CREATE INDEX idx_orders_user ON [orders] (user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.orders') AND name = N'idx_orders_status')
    CREATE INDEX idx_orders_status ON [orders] (status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.orders') AND name = N'idx_orders_type')
    CREATE INDEX idx_orders_type ON [orders] (order_type);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.orders') AND name = N'idx_orders_payment_status')
    CREATE INDEX idx_orders_payment_status ON [orders] (payment_status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.order_items') AND name = N'idx_oi_order')
    CREATE INDEX idx_oi_order ON order_items (order_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.order_items') AND name = N'idx_oi_product')
    CREATE INDEX idx_oi_product ON order_items (product_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.payments') AND name = N'idx_payments_order')
    CREATE INDEX idx_payments_order ON payments (order_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invoices') AND name = N'idx_invoices_employee')
    CREATE INDEX idx_invoices_employee ON invoices(employee_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invoices') AND name = N'idx_invoices_customer')
    CREATE INDEX idx_invoices_customer ON invoices(customer_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.promotion_redemptions') AND name = N'idx_pr_promotion')
    CREATE INDEX idx_pr_promotion ON promotion_redemptions (promotion_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.promotion_redemptions') AND name = N'idx_pr_customer')
    CREATE INDEX idx_pr_customer ON promotion_redemptions (customer_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.activity_logs') AND name = N'idx_activity_user')
    CREATE INDEX idx_activity_user ON activity_logs (user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.activity_logs') AND name = N'idx_activity_action')
    CREATE INDEX idx_activity_action ON activity_logs (action);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.orders') AND name = N'idx_orders_created_at')
    CREATE INDEX idx_orders_created_at ON [orders] (created_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'idx_products_stock_quantity')
    CREATE INDEX idx_products_stock_quantity ON products (stock_quantity);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'idx_products_created_at')
    CREATE INDEX idx_products_created_at ON products (created_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.categories') AND name = N'ux_categories_slug')
    CREATE UNIQUE INDEX ux_categories_slug ON categories(slug) WHERE slug IS NOT NULL;
GO
IF OBJECT_ID(N'dbo.ck_orders_status', N'C') IS NOT NULL ALTER TABLE dbo.orders DROP CONSTRAINT ck_orders_status;
ALTER TABLE dbo.orders WITH CHECK ADD CONSTRAINT ck_orders_status CHECK (status IN ('pending','processing','completed','cancelled','refunded'));
GO
IF OBJECT_ID(N'dbo.ck_orders_payment_status', N'C') IS NOT NULL ALTER TABLE dbo.orders DROP CONSTRAINT ck_orders_payment_status;
ALTER TABLE dbo.orders WITH CHECK ADD CONSTRAINT ck_orders_payment_status CHECK (payment_status IN ('pending','paid','failed','refunded'));
GO
IF NOT EXISTS (SELECT 1 FROM dbo.authorization_migrations WITH (UPDLOCK, HOLDLOCK) WHERE name = 'permissions-v1')
BEGIN
    INSERT INTO dbo.permissions (code, name)
    SELECT v.code, v.name FROM (VALUES
        ('users.read', N'Xem tài khoản'),
        ('users.write', N'Thao tác tài khoản'),
        ('roles.read', N'Xem vai trò và quyền'),
        ('roles.write', N'Thao tác vai trò và quyền'),
        ('employees.read', N'Xem nhân viên'),
        ('employees.write', N'Thao tác nhân viên'),
        ('customers.read', N'Xem khách hàng'),
        ('customers.write', N'Thao tác khách hàng'),
        ('products.read', N'Xem sản phẩm'),
        ('products.write', N'Thao tác sản phẩm'),
        ('categories.read', N'Xem danh mục'),
        ('categories.write', N'Thao tác danh mục'),
        ('units.read', N'Xem đơn vị tính'),
        ('units.write', N'Thao tác đơn vị tính'),
        ('suppliers.read', N'Xem nhà cung cấp'),
        ('suppliers.write', N'Thao tác nhà cung cấp'),
        ('inventory.read', N'Xem tồn kho'),
        ('inventory.write', N'Thao tác tồn kho'),
        ('purchaseorders.read', N'Xem phiếu nhập'),
        ('purchaseorders.write', N'Thao tác phiếu nhập'),
        ('orders.read', N'Xem đơn hàng'),
        ('orders.write', N'Thao tác đơn hàng'),
        ('payments.read', N'Xem thanh toán'),
        ('payments.write', N'Thao tác thanh toán'),
        ('invoices.read', N'Xem hóa đơn'),
        ('promotions.read', N'Xem khuyến mãi'),
        ('promotions.write', N'Thao tác khuyến mãi'),
        ('reports.read', N'Xem báo cáo'),
        ('audit.read', N'Xem nhật ký hệ thống')) v(code, name)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.permissions p WHERE p.code = v.code);
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE (r.name = 'admin' OR (r.name = 'staff' AND
            p.code NOT LIKE 'users.%' AND p.code NOT LIKE 'roles.%' AND
            p.code NOT LIKE 'employees.%' AND p.code NOT LIKE 'audit.%' AND p.code <> 'units.write'))
        AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
        INSERT INTO authorization_migrations (name) VALUES ('permissions-v1');
END;
GO
-- One-time backfill: give the demo suppliers their region (matched by seed email, only while still NULL).
-- Runs once per database so a supplier later set back to "Chưa phân loại" is not overwritten.
IF NOT EXISTS (SELECT 1 FROM dbo.authorization_migrations WHERE name = 'supplier-region-backfill-v1')
BEGIN
    UPDATE s SET region = v.region
    FROM dbo.suppliers s JOIN (VALUES
        (N'abc@gmail.com', N'Bắc'), (N'xyz@gmail.com', N'Nam'), (N'123@gmail.com', N'Trung'),
        (N'thucphamviet@company.com', N'Bắc'), (N'douongsaigon@company.com', N'Nam'), (N'giadungtoancau@company.com', N'Trung'),
        (N'myphamkorea@company.com', N'Nam'), (N'banhkeohuunghi@company.com', N'Bắc'), (N'giaviphuongnam@company.com', N'Nam'),
        (N'dientuvienthong@company.com', N'Nam'), (N'vanphongphamstc@company.com', N'Nam'), (N'duocphamvietduc@company.com', N'Bắc'),
        (N'haisanbiendong@company.com', N'Trung')) v(email, region) ON v.email = s.email
    WHERE s.region IS NULL;
    INSERT INTO dbo.authorization_migrations (name) VALUES ('supplier-region-backfill-v1');
END;
GO
-- Optional demo dataset. Never imported by normal backend startup.
IF TRY_CONVERT(BIT, SESSION_CONTEXT(N'emart_seed_demo')) = 1
   AND NOT EXISTS (SELECT 1 FROM dbo.authorization_migrations WHERE name = 'demo-data-v1')
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.users) OR EXISTS (SELECT 1 FROM dbo.products)
       OR EXISTS (SELECT 1 FROM dbo.orders) OR EXISTS (SELECT 1 FROM dbo.categories)
       OR EXISTS (SELECT 1 FROM dbo.suppliers) OR EXISTS (SELECT 1 FROM dbo.customers)
       OR EXISTS (SELECT 1 FROM dbo.units) OR EXISTS (SELECT 1 FROM dbo.promotions)
        THROW 51007, 'Demo fixtures require empty business tables.', 1;
INSERT INTO users
(username, password_hash, full_name, email, role_id, is_active, locked, created_at)
VALUES
  ('admin', '$2a$11$B5Pre4vLwlsfDIMg/gXXjuH/CyqianiPXHXSXikWE5R0djN/9Tf7.', N'Quản trị viên', 'admin@example.com', (SELECT id FROM roles WHERE name = 'admin'), 1, 0, GETUTCDATE()),
  ('staff01', '$2a$11$NChyYqe5MniZi.l08LVuP.SkfLMRMtyK6guvRRyq/PdaGdjYoTaO2', N'Nguyễn Văn A', 'staff01@example.com', (SELECT id FROM roles WHERE name = 'staff'), 1, 0, GETUTCDATE()),
  ('staff02', '$2a$11$NChyYqe5MniZi.l08LVuP.SkfLMRMtyK6guvRRyq/PdaGdjYoTaO2', N'Lê Thị B', 'staff02@example.com', (SELECT id FROM roles WHERE name = 'staff'), 1, 0, GETUTCDATE());

-- Internal accounts must belong to an employee profile (the app enforces this when editing accounts).
INSERT INTO employees (full_name, email, is_active, created_at, updated_at)
VALUES
  (N'Nguyễn Văn A', 'staff01@example.com', 1, GETUTCDATE(), GETUTCDATE()),
  (N'Lê Thị B', 'staff02@example.com', 1, GETUTCDATE(), GETUTCDATE());
UPDATE u SET employee_id = e.id
FROM users u JOIN employees e ON e.email = u.email
WHERE u.username IN ('staff01', 'staff02');


-- password của admin là admin123
-- password của employee là 123456


-- ===== CUSTOMERS (full_name, phone, email, address) =====
INSERT INTO customers (full_name, phone, email, address, created_at)
VALUES
(N'Khách hàng 1', '0909000001', 'kh1@mail.com', N'Địa chỉ 1', GETUTCDATE()),
(N'Khách hàng 2', '0909000002', 'kh2@mail.com', N'Địa chỉ 2', GETUTCDATE()),
(N'Khách hàng 3', '0909000003', 'kh3@mail.com', N'Địa chỉ 3', GETUTCDATE()),
(N'Khách hàng 4', '0909000004', 'kh4@mail.com', N'Địa chỉ 4', GETUTCDATE()),
(N'Khách hàng 5', '0909000005', 'kh5@mail.com', N'Địa chỉ 5', GETUTCDATE()),
(N'Khách hàng 6', '0909000006', 'kh6@mail.com', N'Địa chỉ 6', GETUTCDATE()),
(N'Khách hàng 7', '0909000007', 'kh7@mail.com', N'Địa chỉ 7', GETUTCDATE()),
(N'Khách hàng 8', '0909000008', 'kh8@mail.com', N'Địa chỉ 8', GETUTCDATE()),
(N'Khách hàng 9', '0909000009', 'kh9@mail.com', N'Địa chỉ 9', GETUTCDATE()),
(N'Khách hàng 10', '0909000010', 'kh10@mail.com', N'Địa chỉ 10', GETUTCDATE()),
(N'Khách hàng 11', '0909000011', 'kh11@mail.com', N'Địa chỉ 11', GETUTCDATE()),
(N'Khách hàng 12', '0909000012', 'kh12@mail.com', N'Địa chỉ 12', GETUTCDATE()),
(N'Khách hàng 13', '0909000013', 'kh13@mail.com', N'Địa chỉ 13', GETUTCDATE()),
(N'Khách hàng 14', '0909000014', 'kh14@mail.com', N'Địa chỉ 14', GETUTCDATE()),
(N'Khách hàng 15', '0909000015', 'kh15@mail.com', N'Địa chỉ 15', GETUTCDATE()),
(N'Khách hàng 16', '0909000016', 'kh16@mail.com', N'Địa chỉ 16', GETUTCDATE()),
(N'Khách hàng 17', '0909000017', 'kh17@mail.com', N'Địa chỉ 17', GETUTCDATE()),
(N'Khách hàng 18', '0909000018', 'kh18@mail.com', N'Địa chỉ 18', GETUTCDATE()),
(N'Khách hàng 19', '0909000019', 'kh19@mail.com', N'Địa chỉ 19', GETUTCDATE()),
(N'Khách hàng 20', '0909000020', 'kh20@mail.com', N'Địa chỉ 20', GETUTCDATE());

-- SQL Server FIX:
-- slug is NULL for all seed categories. A normal UNIQUE constraint on a nullable
-- column would allow only one NULL in SQL Server, so categories would fail here.
-- The filtered unique index above allows multiple NULLs and still enforces
-- uniqueness whenever slug has a value.
-- ===== CATEGORIES (name) =====
INSERT INTO categories (name, created_at)
VALUES
(N'Đồ uống', GETUTCDATE()),
(N'Bánh kẹo', GETUTCDATE()),
(N'Gia vị', GETUTCDATE()),
(N'Đồ gia dụng', GETUTCDATE()),
(N'Mỹ phẩm', GETUTCDATE()),
(N'Thực phẩm tươi sống', GETUTCDATE()),         
(N'Điện tử & Phụ kiện', GETUTCDATE()),       
(N'Dược phẩm & Y tế', GETUTCDATE()),     
(N'Văn phòng phẩm', GETUTCDATE()),      
(N'Thủy hải sản', GETUTCDATE());

-- ===== SUPPLIERS (name, contact_name, phone, email, address, region) =====
INSERT INTO suppliers (name, contact_name, phone, email, address, region, created_at)
VALUES
(N'Công ty TNHH Đồ uống Quốc tế ABC', N'Nguyễn Văn A', '0909123456', 'abc@gmail.com', N'Số 123, Đường Láng, Quận Đống Đa, Hà Nội', N'Bắc', GETUTCDATE()),
(N'Công ty CP Thương mại & Phân phối XYZ', N'Trần Thị B', '0912123456', 'xyz@gmail.com', N'Số 456, Nguyễn Văn Linh, Quận 7, TP HCM', N'Nam', GETUTCDATE()),
(N'Công ty TNHH Sản xuất 123', N'Lê Văn C', '0933123456', '123@gmail.com', N'Số 789, Đường 2/9, Quận Hải Châu, Đà Nẵng', N'Trung', GETUTCDATE()),
(N'Công ty Thực phẩm Việt', N'Phạm Minh D', '0909123457', 'thucphamviet@company.com', N'Khu công nghiệp Bắc Thăng Long, Hà Nội', N'Bắc', GETUTCDATE()),
(N'Công ty Đồ uống Sài Gòn', N'Hoàng Thị E', '0912123457', 'douongsaigon@company.com', N'Số 321, Lê Văn Việt, Quận 9, TP HCM', N'Nam', GETUTCDATE()),
(N'Công ty Gia dụng Toàn Cầu', N'Đặng Văn F', '0933123457', 'giadungtoancau@company.com', N'Khu công nghiệp Hòa Khánh, Đà Nẵng', N'Trung', GETUTCDATE()),
(N'Công ty Mỹ phẩm Hàn Quốc', N'Kim Soo G', '0909123458', 'myphamkorea@company.com', N'Tầng 5, Tòa nhà Vina, Quận 1, TP HCM', N'Nam', GETUTCDATE()),
(N'Công ty Bánh kẹo Hữu Nghị', N'Ngô Thị H', '0912123458', 'banhkeohuunghi@company.com', N'Số 55, Minh Khai, Quận Hai Bà Trưng, Hà Nội', N'Bắc', GETUTCDATE()),
(N'Công ty Gia vị Phương Nam', N'Võ Văn I', '0933123458', 'giaviphuongnam@company.com', N'Khu chế xuất Tân Thuận, Quận 7, TP HCM', N'Nam', GETUTCDATE()),
(N'Công ty Điện tử Viễn Thông', N'Trương Văn J', '0909123459', 'dientuvienthong@company.com', N'Khu công nghiệp Sóng Thần, Bình Dương', N'Nam', GETUTCDATE()),
(N'Công ty Văn phòng phẩm STC', N'Lý Thị K', '0912123459', 'vanphongphamstc@company.com', N'Số 88, Lê Hồng Phong, Quận 10, TP HCM', N'Nam', GETUTCDATE()),
(N'Công ty Dược phẩm Việt Đức', N'Mai Văn L', '0933123459', 'duocphamvietduc@company.com', N'Khu công nghiệp Yên Phong, Bắc Ninh', N'Bắc', GETUTCDATE()),
(N'Công ty Thủy hải sản Biển Đông', N'Bùi Thị M', '0909123460', 'haisanbiendong@company.com', N'Cảng cá Thọ Quang, Đà Nẵng', N'Trung', GETUTCDATE());

-- ===== THÊM DỮ LIỆU MẪU CHO BẢNG UNITS =====
INSERT INTO units (code, name, created_at) VALUES
('pcs', N'Cái', GETUTCDATE()),
('box', N'Hộp', GETUTCDATE()),
('bottle', N'Chai', GETUTCDATE()),
('can', N'Lon', GETUTCDATE()),
('tube', N'Tuýp', GETUTCDATE()),
('pack', N'Gói', GETUTCDATE()),
('kg', N'Kilogram', GETUTCDATE()),
('liter', N'Lít', GETUTCDATE()),
('pair', N'Đôi', GETUTCDATE()),
('set', N'Bộ', GETUTCDATE()),
('roll', N'Cuộn', GETUTCDATE()),             
('sheet', N'Tờ', GETUTCDATE()),             
('bag', N'Túi', GETUTCDATE());             

-- ===== PRODUCTS (category_id, supplier_id, product_name, sku, selling_price, unit) =====
INSERT INTO products (category_id, supplier_id, product_name, sku, selling_price, unit_id, created_at)
VALUES
(1, 1, N'Coca Cola lon', '8900000000001', 15000.00, 4, GETUTCDATE()),
(1, 5, N'Pepsi lon', '8900000000002', 15000.00, 4, GETUTCDATE()),
(1, 1, N'Trà Xanh 0 độ', '8900000000003', 12000.00, 3, GETUTCDATE()),
(1, 5, N'Sting dâu', '8900000000004', 12000.00, 3, GETUTCDATE()),
(1, 1, N'Red Bull', '8900000000005', 20000.00, 4, GETUTCDATE()),
(1, 1, N'Nước ngọt Sprite', '8900000000046', 15000.00, 3, GETUTCDATE()),
(1, 5, N'Trà sữa đóng chai', '8900000000047', 20000.00, 3, GETUTCDATE()),
(1, 5, N'Nước cam ép', '8900000000054', 25000.00, 3, GETUTCDATE()),
(1, 5, N'Sinh tố đóng chai', '8900000000055', 30000.00, 3, GETUTCDATE()),
(1, 5, N'Bia Tiger lon', '8900000000056', 20000.00, 4, GETUTCDATE()),
(1, 1, N'Trà Lipton', '8900000000027', 10000.00, 3, GETUTCDATE()),
(1, 4, N'Sữa Vinamilk', '8900000000028', 12000.00, 3, GETUTCDATE()),
(1, 4, N'Sữa TH 1 Milk', '8900000000029', 15000.00, 3, GETUTCDATE()),
(1, 5, N'Nước suối Lavie', '8900000000030', 8000.00, 4, GETUTCDATE()),
(1, 9, N'Cà phê G7', '8900000000026', 50000.00, 3, GETUTCDATE()),
(2, 8, N'Bánh Oreo', '8900000000006', 25000.00, 6, GETUTCDATE()),
(2, 8, N'Bánh Chocopie', '8900000000007', 20000.00, 6, GETUTCDATE()),
(2, 8, N'Kẹo Alpenliebe', '8900000000008', 5000.00, 6, GETUTCDATE()),
(2, 8, N'Kẹo bạc hà', '8900000000009', 10000.00, 6, GETUTCDATE()),
(2, 8, N'Socola KitKat', '8900000000010', 15000.00, 6, GETUTCDATE()),
(2, 4, N'Snack Oishi', '8900000000048', 10000.00, 6, GETUTCDATE()),
(2, 8, 'Snack Lay''s', '8900000000049', 15000.00, 6, GETUTCDATE()),
(2, 8, N'Kẹo dẻo Haribo', '8900000000050', 20000.00, 6, GETUTCDATE()),
(2, 8, N'Bánh quy bơ', '8900000000063', 30000.00, 6, GETUTCDATE()),
(2, 8, N'Kẹo cao su', '8900000000064', 5000.00, 6, GETUTCDATE()),
(2, 8, N'Bánh gato mini', '8900000000065', 50000.00, 2, GETUTCDATE()),
(3, 9, N'Nước mắm Nam Ngư', '8900000000011', 35000.00, 3, GETUTCDATE()),
(3, 9, N'Nước tương Maggi', '8900000000012', 25000.00, 3, GETUTCDATE()),
(3, 9, N'Muối i-ốt', '8900000000013', 5000.00, 6, GETUTCDATE()),
(3, 9, N'Bột ngọt Ajinomoto', '8900000000014', 15000.00, 6, GETUTCDATE()),
(3, 9, N'Dầu ăn Tường An', '8900000000015', 45000.00, 3, GETUTCDATE()),
(3, 9, N'Hạt nêm Knorr', '8900000000066', 20000.00, 6, GETUTCDATE()),
(3, 9, N'Tương ớt Chin-su', '8900000000067', 15000.00, 3, GETUTCDATE()),
(3, 9, N'Giấm gạo lên men', '8900000000068', 12000.00, 3, GETUTCDATE()),
(4, 6, N'Nồi cơm điện', '8900000000016', 500000.00, 1, GETUTCDATE()),
(4, 6, N'Ấm siêu tốc', '8900000000017', 300000.00, 1, GETUTCDATE()),
(4, 6, N'Quạt máy', '8900000000018', 400000.00, 1, GETUTCDATE()),
(4, 6, N'Bếp gas mini', '8900000000019', 600000.00, 1, GETUTCDATE()),
(4, 6, N'Máy xay sinh tố', '8900000000020', 350000.00, 1, GETUTCDATE()),
(4, 6, N'Bình nước Lock&Lock', '8900000000033', 150000.00, 1, GETUTCDATE()),
(4, 6, N'Hộp nhựa Tupperware', '8900000000034', 80000.00, 1, GETUTCDATE()),
(4, 6, N'Dao Inox', '8900000000035', 50000.00, 1, GETUTCDATE()),
(4, 6, N'Nồi áp suất điện', '8900000000057', 800000.00, 1, GETUTCDATE()),
(4, 6, N'Lò vi sóng', '8900000000058', 1200000.00, 1, GETUTCDATE()),
(4, 6, N'Máy lọc không khí', '8900000000059', 1500000.00, 1, GETUTCDATE()),
(5, 7, N'Sữa rửa mặt Hazeline', '8900000000021', 75000.00, 5, GETUTCDATE()),
(5, 7, N'Kem dưỡng da Pond''s', '8900000000022', 120000.00, 5, GETUTCDATE()),
(5, 7, N'Dầu gội Sunsilk', '8900000000023', 80000.00, 3, GETUTCDATE()),
(5, 7, N'Sữa tắm Dove', '8900000000024', 90000.00, 3, GETUTCDATE()),
(5, 7, N'Nước hoa Romano', '8900000000025', 250000.00, 3, GETUTCDATE()),
(5, 7, N'Serum chống lão hóa', '8900000000060', 350000.00, 3, GETUTCDATE()),
(5, 7, N'Mặt nạ dưỡng da', '8900000000061', 20000.00, 1, GETUTCDATE()),
(5, 7, N'Kem chống nắng SPF50', '8900000000062', 150000.00, 5, GETUTCDATE()),
(6, 4, N'Bánh mì sandwich', '8900000000041', 20000.00, 1, GETUTCDATE()),
(6, 4, N'Thịt bò tươi', '8900000000051', 250000.00, 7, GETUTCDATE()),
(6, 4, N'Cá hồi phi lê', '8900000000052', 350000.00, 7, GETUTCDATE()),
(6, 4, N'Rau củ đông lạnh', '8900000000053', 50000.00, 6, GETUTCDATE()),
(6, 4, N'Mì gói Hảo Hảo', '8900000000042', 5000.00, 6, GETUTCDATE()),
(6, 4, N'Mì Omachi', '8900000000043', 7000.00, 6, GETUTCDATE()),
(6, 4, N'Bún khô', '8900000000044', 15000.00, 6, GETUTCDATE()),
(6, 4, N'Phở ăn liền', '8900000000045', 10000.00, 6, GETUTCDATE()),
(7, 10, N'Tai nghe Bluetooth', '8900000000069', 300000.00, 1, GETUTCDATE()),
(7, 10, N'Sạc dự phòng', '8900000000070', 200000.00, 1, GETUTCDATE()),
(7, 10, N'Cáp sạc nhanh', '8900000000071', 50000.00, 1, GETUTCDATE()),
(8, 12, N'Bàn chải Colgate', '8900000000036', 25000.00, 1, GETUTCDATE()),
(8, 12, N'Kem đánh răng P/S', '8900000000037', 35000.00, 5, GETUTCDATE()),
(8, 12, N'Nước súc miệng Listerine', '8900000000038', 45000.00, 3, GETUTCDATE()),
(8, 12, N'Bông tẩy trang', '8900000000039', 20000.00, 6, GETUTCDATE()),
(8, 12, N'Khẩu trang 3M', '8900000000040', 50000.00, 6, GETUTCDATE()),
(8, 12, N'Vitamin C 500mg', '8900000000075', 80000.00, 6, GETUTCDATE()),
(8, 12, N'Paracetamol 500mg', '8900000000076', 15000.00, 6, GETUTCDATE()),
(8, 12, N'Băng gạc y tế', '8900000000077', 25000.00, 6, GETUTCDATE()),
(9, 11, N'Khăn giấy Tempo', '8900000000031', 20000.00, 6, GETUTCDATE()),
(9, 11, N'Giấy vệ sinh Pulppy', '8900000000032', 35000.00, 10, GETUTCDATE()),
(9, 11, N'Bút bi xanh', '8900000000072', 5000.00, 1, GETUTCDATE()),
(9, 11, N'Vở học sinh 96 trang', '8900000000073', 15000.00, 1, GETUTCDATE()),
(9, 11, N'Bút highlight', '8900000000074', 12000.00, 1, GETUTCDATE()),
(10, 13, N'Tôm sú tươi', '8900000000078', 280000.00, 7, GETUTCDATE()),
(10, 13, N'Mực ống', '8900000000079', 220000.00, 7, GETUTCDATE()),
(10, 13, N'Cá ngừ đại dương', '8900000000080', 320000.00, 7, GETUTCDATE());

-- ===== PRODUCT STOCK (product_id, stock_quantity) =====
MERGE products AS product
USING (VALUES
(1, 25, GETUTCDATE()),(2, 169, GETUTCDATE()),(3, 77, GETUTCDATE()),(4, 169, GETUTCDATE()),(5, 90, GETUTCDATE()),
(6, 105, GETUTCDATE()),(7, 125, GETUTCDATE()),(8, 37, GETUTCDATE()),(9, 74, GETUTCDATE()),(10, 149, GETUTCDATE()),
(11, 69, GETUTCDATE()),(12, 23, GETUTCDATE()),(13, 46, GETUTCDATE()),(14, 144, GETUTCDATE()),(15, 134, GETUTCDATE()),
(16, 182, GETUTCDATE()),(17, 99, GETUTCDATE()),(18, 72, GETUTCDATE()),(19, 128, GETUTCDATE()),(20, 123, GETUTCDATE()),
(21, 155, GETUTCDATE()),(22, 78, GETUTCDATE()),(23, 166, GETUTCDATE()),(24, 117, GETUTCDATE()),(25, 168, GETUTCDATE()),
(26, 197, GETUTCDATE()),(27, 36, GETUTCDATE()),(28, 145, GETUTCDATE()),(29, 61, GETUTCDATE()),(30, 139, GETUTCDATE()),
(31, 47, GETUTCDATE()),(32, 154, GETUTCDATE()),(33, 194, GETUTCDATE()),(34, 41, GETUTCDATE()),(35, 154, GETUTCDATE()),
(36, 71, GETUTCDATE()),(37, 49, GETUTCDATE()),(38, 165, GETUTCDATE()),(39, 73, GETUTCDATE()),(40, 176, GETUTCDATE()),
(41, 41, GETUTCDATE()),(42, 34, GETUTCDATE()),(43, 175, GETUTCDATE()),(44, 59, GETUTCDATE()),(45, 198, GETUTCDATE()),
(46, 106, GETUTCDATE()),(47, 99, GETUTCDATE()),(48, 55, GETUTCDATE()),(49, 62, GETUTCDATE()),(50, 33, GETUTCDATE()),
(51, 45, GETUTCDATE()),(52, 67, GETUTCDATE()),(53, 88, GETUTCDATE()),(54, 92, GETUTCDATE()),(55, 76, GETUTCDATE()),
(56, 54, GETUTCDATE()),(57, 63, GETUTCDATE()),(58, 71, GETUTCDATE()),(59, 82, GETUTCDATE()),(60, 93, GETUTCDATE()),
(61, 105, GETUTCDATE()),(62, 114, GETUTCDATE()),(63, 126, GETUTCDATE()),(64, 138, GETUTCDATE()),(65, 147, GETUTCDATE()),
(66, 155, GETUTCDATE()),(67, 163, GETUTCDATE()),(68, 172, GETUTCDATE()),(69, 181, GETUTCDATE()),(70, 192, GETUTCDATE()),
(71, 203, GETUTCDATE()),(72, 215, GETUTCDATE()),(73, 224, GETUTCDATE()),(74, 233, GETUTCDATE()),(75, 242, GETUTCDATE()),
(76, 251, GETUTCDATE()),(77, 263, GETUTCDATE()),(78, 274, GETUTCDATE()),(79, 285, GETUTCDATE()),(80, 296, GETUTCDATE())
) AS source(product_id, quantity, updated_at)
ON product.id = source.product_id
WHEN MATCHED THEN UPDATE SET product.stock_quantity = source.quantity, product.updated_at = source.updated_at;

-- ===== PURCHASE ORDERS =====
INSERT INTO purchase_orders
(po_code, supplier_id, user_id, total_amount, note, status, created_at)
VALUES
('PO0001', 1, 2, 12500000, N'Nhập bổ sung nhóm đồ uống', 'completed', GETUTCDATE()),
('PO0002', 8, 3, 8500000, N'Nhập bánh kẹo định kỳ', 'completed', GETUTCDATE()),
('PO0003', 4, 2, 6200000, N'Nhập thực phẩm tươi sống', 'pending', GETUTCDATE());

INSERT INTO purchase_order_items
(purchase_order_id, product_id, quantity, unit_cost)
VALUES
(1, 1, 200, 10000),
(1, 2, 200, 10000),
(1, 3, 150, 8000),
(2, 16, 100, 16000),
(2, 17, 100, 13000),
(2, 18, 200, 3000),
(3, 42, 100, 3500),
(3, 43, 100, 5000),
(3, 44, 50, 35000);

-- ===== INVENTORY ADJUSTMENTS =====
INSERT INTO inventory_adjustments
(product_id, change_amount, reason, user_id, created_at)
VALUES
(1, 200, N'Nhập hàng PO0001', 2, GETUTCDATE()),
(2, 200, N'Nhập hàng PO0001', 2, GETUTCDATE()),
(16, 100, N'Nhập hàng PO0002', 3, GETUTCDATE()),
(42, 100, N'Nhập hàng PO0003', 2, GETUTCDATE()),
(1, -2, N'Hàng hư hỏng', 3, GETUTCDATE());

-- ===== PROMOTIONS =====
INSERT INTO promotions
(code, name, type, discount_type, discount_value, description, start_date, end_date, status, max_discount, usage_limit, used_count, created_at)
VALUES
('SALE10', N'Giảm 10%', 'event', 'percent', 10, N'Giảm 10% cho đơn hàng đủ điều kiện', CAST(DATEADD(month, -1, GETUTCDATE()) AS DATE), CAST(DATEADD(year, 1, GETUTCDATE()) AS DATE), 'active', 50000, NULL, 0, GETUTCDATE()),
('FREESHIP50K', N'Giảm 50K', 'event', 'fixed', 50000, N'Giảm 50.000 cho đơn từ 300.000', CAST(DATEADD(month, -1, GETUTCDATE()) AS DATE), CAST(DATEADD(year, 1, GETUTCDATE()) AS DATE), 'active', NULL, 500, 0, GETUTCDATE()),
('NEWUSER', N'Khách hàng mới', 'voucher', 'percent', 20, N'Giảm 20% cho khách hàng mới', CAST(DATEADD(month, -1, GETUTCDATE()) AS DATE), CAST(DATEADD(year, 1, GETUTCDATE()) AS DATE), 'active', 100000, 1, 0, GETUTCDATE()),
('SUMMER15', N'Khuyến mãi mùa hè', 'event', 'percent', 15, N'Giảm 15% mùa hè', CAST(DATEADD(month, -1, GETUTCDATE()) AS DATE), CAST(DATEADD(year, 1, GETUTCDATE()) AS DATE), 'active', 100000, 1000, 0, GETUTCDATE()),
('VIP100K', N'Khách VIP', 'voucher', 'fixed', 100000, N'Giảm 100.000 cho khách VIP', CAST(DATEADD(month, -1, GETUTCDATE()) AS DATE), CAST(DATEADD(year, 1, GETUTCDATE()) AS DATE), 'active', NULL, 200, 0, GETUTCDATE()),
('PROD15', N'Giảm 15% Coca/Pepsi', 'product', 'percent', 15, N'Giảm 15% cho một số sản phẩm đồ uống', CAST(DATEADD(month, -1, GETUTCDATE()) AS DATE), CAST(DATEADD(year, 1, GETUTCDATE()) AS DATE), 'active', 100000, 500, 0, GETUTCDATE());

-- Chi tiết event promotion
INSERT INTO invoice_promotions (promotion_id, min_invoice_amount, discount_percent)
VALUES
(1, 0, 10),
(2, 300000, NULL),
(4, 50000, 15);

-- Chi tiết voucher promotion
INSERT INTO voucher_promotions (promotion_id, voucher_code, discount_percent)
VALUES
(3, 'NEWUSER20', 20),
(5, 'VIP100K', NULL);

-- Khuyến mãi áp dụng trực tiếp cho sản phẩm
INSERT INTO product_promotions (promotion_id, product_id, discount_percent)
VALUES
(6, 1, 5),
(6, 2, 5);

-- ===== ORDERS với giá mới hợp lý =====
INSERT INTO orders (order_number, customer_id, user_id, order_type, status, subtotal, discount, total_amount, promotion_id, payment_method, payment_status, created_at)
VALUES
(CONVERT(varchar(36), NEWID()), 5, 3, 'pos', 'completed', 285000, 28500, 256500, 1, 'cash', 'paid', GETUTCDATE()), -- Order 1: 10% discount
(CONVERT(varchar(36), NEWID()), 17, 3, 'pos', 'completed', 420000, 0, 420000, NULL, 'e_wallet', 'paid', GETUTCDATE()), -- Order 2: No discount
(CONVERT(varchar(36), NEWID()), 8, 3, 'pos', 'completed', 185000, 0, 185000, NULL, 'e_wallet', 'paid', GETUTCDATE()), -- Order 3: No discount
(CONVERT(varchar(36), NEWID()), 20, 3, 'pos', 'completed', 40000, 4000, 36000, 1, 'card', 'paid', GETUTCDATE()), -- Order 4: 10% discount
(CONVERT(varchar(36), NEWID()), 1, 2, 'pos', 'completed', 75000, 0, 75000, NULL, 'cash', 'paid', GETUTCDATE()), -- Order 5
(CONVERT(varchar(36), NEWID()), 5, 3, 'pos', 'completed', 620000, 50000, 570000, 2, 'cash', 'paid', GETUTCDATE()), -- Order 6: Fixed 50k
(CONVERT(varchar(36), NEWID()), 9, 3, 'pos', 'completed', 350000, 52500, 297500, 4, 'e_wallet', 'paid', GETUTCDATE()), -- Order 7: 15% discount
(CONVERT(varchar(36), NEWID()), 11, 3, 'pos', 'completed', 280000, 56000, 224000, 3, 'cash', 'paid', GETUTCDATE()), -- Order 8: 20% discount
(CONVERT(varchar(36), NEWID()), 11, 3, 'pos', 'completed', 450000, 0, 450000, NULL, 'cash', 'paid', GETUTCDATE()), -- Order 9
(CONVERT(varchar(36), NEWID()), 11, 3, 'pos', 'completed', 320000, 50000, 270000, 2, 'card', 'paid', GETUTCDATE()), -- Order 10: Fixed 50k
(CONVERT(varchar(36), NEWID()), 20, 3, 'pos', 'completed', 380000, 0, 380000, NULL, 'e_wallet', 'paid', GETUTCDATE()), -- Order 11
(CONVERT(varchar(36), NEWID()), 10, 2, 'pos', 'completed', 275000, 0, 275000, NULL, 'card', 'paid', GETUTCDATE()), -- Order 12
(CONVERT(varchar(36), NEWID()), 10, 3, 'pos', 'completed', 410000, 50000, 360000, 2, 'card', 'paid', GETUTCDATE()), -- Order 13: Fixed 50k
(CONVERT(varchar(36), NEWID()), 6, 2, 'pos', 'completed', 520000, 50000, 470000, 2, 'cash', 'paid', GETUTCDATE()), -- Order 14: Fixed 50k
(CONVERT(varchar(36), NEWID()), 10, 2, 'pos', 'completed', 90000, 18000, 72000, 3, 'card', 'paid', GETUTCDATE()), -- Order 15: 20% discount
(CONVERT(varchar(36), NEWID()), 10, 2, 'pos', 'completed', 280000, 50000, 230000, 2, 'cash', 'paid', GETUTCDATE()), -- Order 16: Fixed 50k
(CONVERT(varchar(36), NEWID()), 19, 3, 'pos', 'completed', 150000, 0, 150000, NULL, 'cash', 'paid', GETUTCDATE()), -- Order 17
(CONVERT(varchar(36), NEWID()), 10, 2, 'pos', 'completed', 120000, 0, 120000, NULL, 'e_wallet', 'paid', GETUTCDATE()), -- Order 18
(CONVERT(varchar(36), NEWID()), 8, 3, 'pos', 'completed', 680000, 102000, 578000, 4, 'card', 'paid', GETUTCDATE()), -- Order 19: 15% discount
(CONVERT(varchar(36), NEWID()), 3, 3, 'pos', 'completed', 850000, 0, 850000, NULL, 'card', 'paid', GETUTCDATE()), -- Order 20
(CONVERT(varchar(36), NEWID()), 9, 2, 'pos', 'completed', 720000, 0, 720000, NULL, 'cash', 'paid', GETUTCDATE()), -- Order 21
(CONVERT(varchar(36), NEWID()), 17, 3, 'pos', 'completed', 95000, 0, 95000, NULL, 'e_wallet', 'paid', GETUTCDATE()), -- Order 22
(CONVERT(varchar(36), NEWID()), 6, 3, 'pos', 'completed', 630000, 94500, 535500, 4, 'cash', 'paid', GETUTCDATE()), -- Order 23: 15% discount
(CONVERT(varchar(36), NEWID()), 1, 3, 'pos', 'completed', 480000, 72000, 408000, 4, 'e_wallet', 'paid', GETUTCDATE()), -- Order 24: 15% discount
(CONVERT(varchar(36), NEWID()), 2, 2, 'pos', 'completed', 220000, 44000, 176000, 3, 'cash', 'paid', GETUTCDATE()), -- Order 25: 20% discount
(CONVERT(varchar(36), NEWID()), 15, 3, 'pos', 'completed', 180000, 36000, 144000, 3, 'cash', 'paid', GETUTCDATE()), -- Order 26: 20% discount
(CONVERT(varchar(36), NEWID()), 4, 2, 'pos', 'completed', 310000, 0, 310000, NULL, 'cash', 'paid', GETUTCDATE()), -- Order 27
(CONVERT(varchar(36), NEWID()), 16, 2, 'pos', 'completed', 750000, 0, 750000, NULL, 'card', 'paid', GETUTCDATE()), -- Order 28
(CONVERT(varchar(36), NEWID()), 4, 3, 'pos', 'completed', 920000, 138000, 782000, 4, 'cash', 'paid', GETUTCDATE()), -- Order 29: 15% discount
(CONVERT(varchar(36), NEWID()), 1, 3, 'pos', 'completed', 1050000, 0, 1050000, NULL, 'card', 'paid', GETUTCDATE()); -- Order 30

UPDATE [orders] SET order_number = CONCAT('DH-', FORMAT(id, '000'));

-- ===== ORDER_ITEMS với giá mới =====
INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, created_at)
VALUES
-- Order 1 (3 sản phẩm)
(1, 23, 2, 15000.00, 30000.00, GETUTCDATE()), -- Snack Lay's
(1, 5, 1, 20000.00, 20000.00, GETUTCDATE()),  -- Red Bull
(1, 47, 3, 20000.00, 60000.00, GETUTCDATE()), -- Trà sữa đóng chai

-- Order 2 (2 sản phẩm)
(2, 39, 1, 20000.00, 20000.00, GETUTCDATE()), -- Bông tẩy trang
(2, 14, 2, 12000.00, 24000.00, GETUTCDATE()), -- Sữa Vinamilk

-- Order 3 (3 sản phẩm)
(3, 18, 1, 10000.00, 10000.00, GETUTCDATE()), -- Kẹo bạc hà
(3, 34, 2, 80000.00, 160000.00, GETUTCDATE()), -- Hộp nhựa Tupperware
(3, 26, 1, 15000.00, 15000.00, GETUTCDATE()), -- Bánh quy bơ

-- Order 4 (2 sản phẩm)
(4, 24, 2, 20000.00, 40000.00, GETUTCDATE()), -- Kẹo dẻo Haribo

-- Order 5 (1 sản phẩm)
(5, 9, 1, 75000.00, 75000.00, GETUTCDATE()), -- Sữa rửa mặt Hazeline

-- Order 6 (5 sản phẩm)
(6, 18, 2, 10000.00, 20000.00, GETUTCDATE()),
(6, 22, 1, 120000.00, 120000.00, GETUTCDATE()),
(6, 42, 3, 5000.00, 15000.00, GETUTCDATE()),
(6, 17, 2, 300000.00, 600000.00, GETUTCDATE()),
(6, 20, 1, 400000.00, 400000.00, GETUTCDATE()),

-- Order 7 (2 sản phẩm)
(7, 8, 2, 5000.00, 10000.00, GETUTCDATE()),
(7, 8, 1, 5000.00, 5000.00, GETUTCDATE()),

-- Order 8 (3 sản phẩm)
(8, 42, 1, 5000.00, 5000.00, GETUTCDATE()),
(8, 43, 2, 7000.00, 14000.00, GETUTCDATE()),
(8, 31, 3, 20000.00, 60000.00, GETUTCDATE()),

-- Order 9 (4 sản phẩm)
(9, 17, 2, 300000.00, 600000.00, GETUTCDATE()),
(9, 12, 1, 25000.00, 25000.00, GETUTCDATE()),
(9, 43, 2, 7000.00, 14000.00, GETUTCDATE()),
(9, 19, 1, 600000.00, 600000.00, GETUTCDATE()),

-- Order 10 (4 sản phẩm)
(10, 25, 1, 250000.00, 250000.00, GETUTCDATE()),
(10, 1, 2, 15000.00, 30000.00, GETUTCDATE()),
(10, 23, 2, 15000.00, 30000.00, GETUTCDATE()),
(10, 49, 2, 5000.00, 10000.00, GETUTCDATE()),

-- Thêm thông tin cho các order còn lại...
-- (Giảm bớt để file không quá dài, bạn có thể thêm theo mẫu trên)
(11, 3, 1, 12000.00, 12000.00, GETUTCDATE()),
(11, 23, 2, 15000.00, 30000.00, GETUTCDATE()),
(12, 40, 1, 50000.00, 50000.00, GETUTCDATE()),
(13, 24, 1, 20000.00, 20000.00, GETUTCDATE()),
(14, 24, 2, 20000.00, 40000.00, GETUTCDATE()),
(15, 18, 1, 10000.00, 10000.00, GETUTCDATE()),
(16, 15, 1, 45000.00, 45000.00, GETUTCDATE()),
(17, 42, 1, 5000.00, 5000.00, GETUTCDATE()),
(18, 30, 1, 8000.00, 8000.00, GETUTCDATE()),
(19, 16, 1, 500000.00, 500000.00, GETUTCDATE()),
(20, 49, 1, 5000.00, 5000.00, GETUTCDATE()),
(21, 11, 2, 35000.00, 70000.00, GETUTCDATE()),
(22, 40, 1, 50000.00, 50000.00, GETUTCDATE()),
(23, 1, 2, 15000.00, 30000.00, GETUTCDATE()),
(24, 3, 3, 12000.00, 36000.00, GETUTCDATE()),
(25, 9, 1, 75000.00, 75000.00, GETUTCDATE()),
(26, 47, 2, 20000.00, 40000.00, GETUTCDATE()),
(27, 37, 1, 35000.00, 35000.00, GETUTCDATE()),
(28, 20, 3, 400000.00, 1200000.00, GETUTCDATE()),
(29, 28, 1, 25000.00, 25000.00, GETUTCDATE()),
(30, 25, 1, 250000.00, 250000.00, GETUTCDATE());

-- Seed invoice snapshots after the sample orders and their items have been inserted.
INSERT INTO invoices (order_id, invoice_number, invoice_status, payment_status, payment_method,
  customer_name, customer_phone, customer_email, customer_address, subtotal, discount_amount, total_amount, issued_at, updated_at)
SELECT o.id, CONCAT('INV-', FORMAT(o.id, '000')), 'issued', o.payment_status, o.payment_method,
  COALESCE(c.full_name,N'Khách lẻ'), c.phone, c.email, c.address,
  o.subtotal, o.discount, o.total_amount, o.created_at, o.updated_at
FROM [orders] o LEFT JOIN customers c ON c.id=o.customer_id
WHERE o.status IN ('processing','completed') OR o.payment_status='paid';

INSERT INTO invoice_items (invoice_id, product_id, product_name, sku, quantity, unit_price, total_price)
SELECT i.id, oi.product_id, COALESCE(p.product_name,N'Sản phẩm'), p.sku,
       SUM(oi.quantity), CAST(SUM(oi.total_price) / NULLIF(SUM(oi.quantity), 0) AS DECIMAL(12,2)), SUM(oi.total_price)
FROM invoices i JOIN [orders] o ON o.id=i.order_id
JOIN order_items oi ON oi.order_id=o.id LEFT JOIN products p ON p.id=oi.product_id
GROUP BY i.id, oi.product_id, p.product_name, p.sku;

UPDATE i SET invoice_status='paid'
FROM invoices i JOIN [orders] o ON o.id=i.order_id WHERE o.payment_status='paid';

-- ===== PAYMENTS với số tiền mới =====
INSERT INTO payments (order_id, amount, method, transaction_ref, status, created_at)
VALUES
(1, 256500.00, 'cash', NULL, 'completed', GETUTCDATE()),
(2, 420000.00, 'e_wallet', NULL, 'completed', GETUTCDATE()),
(3, 185000.00, 'e_wallet', NULL, 'completed', GETUTCDATE()),
(4, 36000.00, 'card', NULL, 'completed', GETUTCDATE()),
(5, 75000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(6, 570000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(7, 297500.00, 'e_wallet', NULL, 'completed', GETUTCDATE()),
(8, 224000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(9, 450000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(10, 270000.00, 'card', NULL, 'completed', GETUTCDATE()),
(11, 380000.00, 'e_wallet', NULL, 'completed', GETUTCDATE()),
(12, 275000.00, 'card', NULL, 'completed', GETUTCDATE()),
(13, 360000.00, 'card', NULL, 'completed', GETUTCDATE()),
(14, 470000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(15, 72000.00, 'card', NULL, 'completed', GETUTCDATE()),
(16, 230000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(17, 150000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(18, 120000.00, 'e_wallet', NULL, 'completed', GETUTCDATE()),
(19, 578000.00, 'card', NULL, 'completed', GETUTCDATE()),
(20, 850000.00, 'card', NULL, 'completed', GETUTCDATE()),
(21, 720000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(22, 95000.00, 'e_wallet', NULL, 'completed', GETUTCDATE()),
(23, 535500.00, 'cash', NULL, 'completed', GETUTCDATE()),
(24, 408000.00, 'e_wallet', NULL, 'completed', GETUTCDATE()),
(25, 176000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(26, 144000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(27, 310000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(28, 750000.00, 'card', NULL, 'completed', GETUTCDATE()),
(29, 782000.00, 'cash', NULL, 'completed', GETUTCDATE()),
(30, 1050000.00, 'card', NULL, 'completed', GETUTCDATE());




    INSERT INTO dbo.authorization_migrations(name) VALUES ('demo-data-v1');
END;
IF OBJECT_ID(N'dbo.invoice_items', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.invoice_items (
    id INT IDENTITY(1,1) NOT NULL,
    invoice_id INT NOT NULL,
    product_id INT NOT NULL,
    product_name NVARCHAR(255) NOT NULL,
    sku VARCHAR(100) NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    CONSTRAINT pk_invoice_items PRIMARY KEY (invoice_id, product_id),
    CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id) ON DELETE NO ACTION,
    CONSTRAINT fk_invoice_items_product FOREIGN KEY (product_id) REFERENCES dbo.products(id) ON DELETE NO ACTION,
    CONSTRAINT ck_invoice_items_quantity CHECK (quantity > 0),
    CONSTRAINT ck_invoice_items_amounts CHECK (unit_price >= 0 AND total_price >= 0)
  );
END;

/* Backfill eligible orders and historical line snapshots, without duplicates. */
INSERT dbo.invoices (order_id, invoice_number, invoice_status, payment_status, payment_method,
  customer_name, customer_phone, customer_email, customer_address, subtotal, discount_amount, total_amount, issued_at, updated_at)
SELECT o.id, CONCAT('INV-', FORMAT(o.id, '000')), 'issued', o.payment_status, o.payment_method,
  COALESCE(c.full_name,N'Khách lẻ'), c.phone, c.email, c.address,
  o.subtotal, o.discount, o.total_amount, o.created_at, o.updated_at
FROM dbo.[orders] o LEFT JOIN dbo.customers c ON c.id=o.customer_id
WHERE o.status <> 'cancelled' AND (o.status IN ('processing','completed') OR o.payment_status='paid')
  AND NOT EXISTS (SELECT 1 FROM dbo.invoices i WHERE i.order_id=o.id);

INSERT dbo.invoice_items (invoice_id, product_id, product_name, sku, quantity, unit_price, total_price)
SELECT i.id, oi.product_id, COALESCE(p.product_name,N'Sản phẩm'), p.sku, oi.quantity, oi.unit_price, oi.total_price
FROM dbo.invoices i JOIN dbo.order_items oi ON oi.order_id=i.order_id
LEFT JOIN dbo.products p ON p.id=oi.product_id
WHERE NOT EXISTS (SELECT 1 FROM dbo.invoice_items ii WHERE ii.invoice_id=i.id);

UPDATE i SET invoice_status=CASE WHEN o.status='cancelled' THEN 'voided'
                                 WHEN o.payment_status='refunded' OR o.status='refunded' THEN 'refunded'
                                 WHEN o.payment_status='paid' THEN 'paid' ELSE 'issued' END,
             payment_status=CASE WHEN o.payment_status='refunded' OR o.status='refunded' THEN 'refunded' ELSE o.payment_status END
FROM dbo.invoices i JOIN dbo.[orders] o ON o.id=i.order_id;

IF OBJECT_ID(N'dbo.ck_orders_status', N'C') IS NOT NULL
  ALTER TABLE dbo.[orders] DROP CONSTRAINT ck_orders_status;
ALTER TABLE dbo.[orders] ADD CONSTRAINT ck_orders_status CHECK (status IN ('pending','processing','completed','cancelled','refunded'));

IF OBJECT_ID(N'dbo.ck_orders_payment_status', N'C') IS NOT NULL
  ALTER TABLE dbo.[orders] DROP CONSTRAINT ck_orders_payment_status;
ALTER TABLE dbo.[orders] ADD CONSTRAINT ck_orders_payment_status CHECK (payment_status IN ('pending','paid','failed','refunded'));

GO
CREATE OR ALTER TRIGGER dbo.trg_invoices_lock_paid_amounts ON dbo.invoices
AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM inserted n JOIN deleted o ON o.id=n.id
    WHERE o.invoice_status='paid' AND (n.subtotal<>o.subtotal OR n.tax_amount<>o.tax_amount OR
      n.shipping_fee<>o.shipping_fee OR n.discount_amount<>o.discount_amount OR n.total_amount<>o.total_amount))
  BEGIN
    THROW 51001, 'Amounts on a paid invoice are immutable; void and issue an adjustment instead.', 1;
  END;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_invoice_items_lock_paid_snapshot ON dbo.invoice_items
AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM deleted d JOIN dbo.invoices i ON i.id=d.invoice_id WHERE i.invoice_status='paid')
    OR EXISTS (SELECT 1 FROM inserted n JOIN dbo.invoices i ON i.id=n.invoice_id WHERE i.invoice_status='paid')
  BEGIN
    THROW 51002, 'Items on a paid invoice are immutable.', 1;
  END;
END;
GO
-- Remove unused AI tables only when empty; keep any historical conversations.
IF OBJECT_ID(N'dbo.ai_messages', N'U') IS NOT NULL
    EXEC(N'IF NOT EXISTS (SELECT 1 FROM dbo.ai_messages) DROP TABLE dbo.ai_messages;');
IF OBJECT_ID(N'dbo.ai_conversations', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.ai_messages', N'U') IS NULL
    EXEC(N'IF NOT EXISTS (SELECT 1 FROM dbo.ai_conversations) DROP TABLE dbo.ai_conversations;');
COMMIT TRANSACTION;
GO
-- END APPLICATION SCHEMA
