/* Idempotent demo data for the invoice statistics screen.
   Adds paid invoices for existing completed orders that do not yet have an invoice.
   Safe to run repeatedly: the DEMO-INV- prefix is checked first. */
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_number LIKE 'DEMO-INV-%')
BEGIN
    DECLARE @demoOrders TABLE (id int NOT NULL, customer_id int NULL, subtotal decimal(12,2) NOT NULL, discount decimal(12,2) NOT NULL, total_amount decimal(12,2) NOT NULL, payment_method varchar(20) NULL, rn int NOT NULL);
    ;WITH nums AS (SELECT TOP (12) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS rn FROM sys.all_objects)
    INSERT INTO orders (order_number, customer_id, user_id, order_type, status, subtotal, discount, total_amount, promotion_id, payment_method, payment_status, created_at)
    OUTPUT inserted.id, inserted.customer_id, inserted.subtotal, inserted.discount, inserted.total_amount, inserted.payment_method, 0 INTO @demoOrders
    SELECT CONCAT('DEMO-ORD-', CONVERT(varchar(8), CAST(GETDATE() AS date), 112), '-', n.rn), CASE ((n.rn - 1) % 5) WHEN 0 THEN 1 WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 5 ELSE 6 END, 1, 'pos', 'completed', 100000 + n.rn * 25000, n.rn * 1000, 100000 + n.rn * 24000, NULL, CASE WHEN n.rn % 2 = 0 THEN 'card' ELSE 'cash' END, 'paid', DATEADD(HOUR, 9, DATEADD(DAY, -n.rn + 1, CAST(CAST(GETDATE() AS date) AS datetime2)))
    FROM nums n;
    ;WITH numbered AS (SELECT id, ROW_NUMBER() OVER (ORDER BY id DESC) AS rn FROM @demoOrders)
    UPDATE d SET rn = n.rn FROM @demoOrders d JOIN numbered n ON n.id = d.id;

    DECLARE @created TABLE (invoice_id int NOT NULL, order_id int NOT NULL);
    INSERT INTO invoices (order_id, invoice_number, invoice_status, payment_status, payment_method, customer_name, customer_phone, customer_email, customer_address, subtotal, tax_amount, shipping_fee, discount_amount, total_amount, issued_at, updated_at, employee_id, customer_id)
    OUTPUT inserted.id, inserted.order_id INTO @created
    SELECT c.id, CONCAT('DEMO-INV-', c.id), 'issued', 'pending', COALESCE(c.payment_method, 'cash'), COALESCE(cu.full_name, N'Khách lẻ'), cu.phone, cu.email, cu.address,
           c.subtotal, 0, 0, c.discount, c.total_amount,
           DATEADD(HOUR, 10, DATEADD(DAY, -c.rn + 1, CAST(CAST(GETDATE() AS date) AS datetime2))), DATEADD(HOUR, 10, DATEADD(DAY, -c.rn + 1, CAST(CAST(GETDATE() AS date) AS datetime2))),
           CASE WHEN c.rn % 3 = 0 THEN 5 WHEN c.rn % 3 = 1 THEN 1 ELSE 4 END, c.customer_id
    FROM @demoOrders c
    LEFT JOIN customers cu ON cu.id = c.customer_id
    CROSS APPLY (SELECT TOP (1) p.id, p.product_name, p.sku, p.selling_price FROM products p ORDER BY p.id + c.rn) p;

    INSERT INTO invoice_items (invoice_id, product_id, product_name, sku, quantity, unit_price, total_price)
    SELECT c.invoice_id, p.id, p.product_name, p.sku, 1, p.selling_price, p.selling_price
    FROM @created c
    CROSS APPLY (SELECT TOP (1) p.id, p.product_name, p.sku, p.selling_price FROM products p ORDER BY p.id + c.order_id) p;

    UPDATE i SET invoice_status = 'paid', payment_status = 'paid', updated_at = GETDATE()
    FROM invoices i JOIN @created c ON c.invoice_id = i.id;
END;

COMMIT TRANSACTION;
SELECT COUNT(*) AS demo_invoices FROM invoices WHERE invoice_number LIKE 'DEMO-INV-%';
