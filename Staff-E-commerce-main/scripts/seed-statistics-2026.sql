/* Demo transactions for all four quarters of 2026, up to today's date.
   Run: sqlcmd -S localhost\SQLEXPRESS -d store_management -E -C -b -i scripts/seed-statistics-2026.sql
   Each month has a unique DEMO26 code; rerunning does not duplicate data.
   Historical report fixtures do not change current stock or loyalty points. */
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
BEGIN TRANSACTION;

DECLARE @user int, @employee int, @customer int, @supplier int;
SELECT TOP (1) @user = id, @employee = employee_id FROM dbo.users ORDER BY id;
SELECT TOP (1) @customer = id FROM dbo.customers ORDER BY id;
SELECT TOP (1) @supplier = id FROM dbo.suppliers ORDER BY id;
IF @user IS NULL OR @supplier IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.products WHERE selling_price > 0)
    THROW 50001, 'Seed users, suppliers and products before running this script.', 1;

DECLARE @month int = 1, @date datetime, @code varchar(20), @order int, @invoice int, @purchase int;
DECLARE @product int, @price decimal(12,2), @cost decimal(12,2), @quantity int, @amount decimal(12,2);
WHILE @month <= 12
BEGIN
    SET @date = DATEADD(hour, 3, CAST(DATEFROMPARTS(2026, @month, 15) AS datetime));
    IF @date <= GETUTCDATE()
    BEGIN
        SET @code = CONCAT('DEMO26-', RIGHT(CONCAT('0', @month), 2));
        SELECT TOP (1) @product = id, @price = selling_price FROM dbo.products
        WHERE selling_price > 0 ORDER BY CASE WHEN id >= @month THEN 0 ELSE 1 END, id;
        SET @quantity = 35 + @month * 3;
        SET @cost = ROUND(@price * 0.65, 2);
        SET @amount = @price * @quantity;

        IF NOT EXISTS (SELECT 1 FROM dbo.orders WITH (UPDLOCK, HOLDLOCK) WHERE order_number = @code)
        BEGIN
            INSERT dbo.orders (order_number, customer_id, user_id, order_type, status, subtotal, discount,
                total_amount, payment_method, payment_status, note, created_at, updated_at)
            VALUES (@code, @customer, @user, 'pos', 'completed', @amount, 0, @amount,
                'cash', 'paid', N'Demo statistics 2026', @date, @date);
            SET @order = SCOPE_IDENTITY();
            INSERT dbo.order_items (order_id, product_id, quantity, unit_price, total_price, created_at)
            VALUES (@order, @product, @quantity, @price, @amount, @date);
            INSERT dbo.payments (order_id, amount, method, transaction_ref, status, created_at)
            VALUES (@order, @amount, 'cash', @code, 'completed', @date);
            INSERT dbo.invoices (order_id, employee_id, customer_id, invoice_number, invoice_status,
                payment_status, payment_method, customer_name, subtotal, total_amount, issued_at, updated_at)
            SELECT @order, @employee, @customer, @code, 'issued', 'pending', 'cash',
                COALESCE((SELECT full_name FROM dbo.customers WHERE id = @customer), N'Demo customer'),
                @amount, @amount, @date, @date;
            SET @invoice = SCOPE_IDENTITY();
            INSERT dbo.invoice_items (invoice_id, product_id, product_name, sku, quantity, unit_price, total_price)
            SELECT @invoice, id, product_name, sku, @quantity, @price, @amount FROM dbo.products WHERE id = @product;
            UPDATE dbo.invoices SET invoice_status = 'paid', payment_status = 'paid' WHERE id = @invoice;
        END;

        IF NOT EXISTS (SELECT 1 FROM dbo.purchase_orders WITH (UPDLOCK, HOLDLOCK) WHERE po_code = @code)
        BEGIN
            INSERT dbo.purchase_orders (po_code, supplier_id, user_id, employee_id, total_amount, note, status, created_at, updated_at)
            VALUES (@code, @supplier, @user, @employee, @cost * @quantity, N'Demo statistics 2026', 'completed', @date, @date);
            SET @purchase = SCOPE_IDENTITY();
            INSERT dbo.purchase_order_items (purchase_order_id, product_id, quantity, unit_cost)
            VALUES (@purchase, @product, @quantity, @cost);
        END;
    END;
    SET @month += 1;
END;
COMMIT TRANSACTION;

;WITH income AS (
    SELECT DATEPART(quarter, DATEADD(hour, 7, issued_at)) AS quarter, SUM(total_amount) AS revenue
    FROM dbo.invoices WHERE issued_at >= '20260101' AND issued_at < '20270101'
        AND invoice_status IN ('issued', 'paid') AND payment_status = 'paid'
    GROUP BY DATEPART(quarter, DATEADD(hour, 7, issued_at))
), expense AS (
    SELECT DATEPART(quarter, DATEADD(hour, 7, p.updated_at)) AS quarter, SUM(d.line_total) AS cost
    FROM dbo.purchase_orders p JOIN dbo.purchase_order_items d ON d.purchase_order_id = p.id
    WHERE p.updated_at >= '20260101' AND p.updated_at < '20270101' AND p.status = 'completed'
    GROUP BY DATEPART(quarter, DATEADD(hour, 7, p.updated_at))
)
SELECT i.quarter, i.revenue, COALESCE(e.cost, 0) AS cost, i.revenue - COALESCE(e.cost, 0) AS profit
FROM income i LEFT JOIN expense e ON e.quarter = i.quarter ORDER BY i.quarter;
