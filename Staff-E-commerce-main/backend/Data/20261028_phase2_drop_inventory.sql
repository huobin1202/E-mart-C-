/*
  Phase 2: run only after the application version that reads and writes
  products.stock_quantity has been deployed and Phase 1 reports zero mismatch.
*/
USE store_management;
GO

IF COL_LENGTH('dbo.products', 'stock_quantity') IS NULL
    THROW 51010, 'Phase 1 has not been applied: products.stock_quantity is missing.', 1;

IF OBJECT_ID('dbo.inventory', 'U') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM dbo.products product
    FULL JOIN dbo.inventory stock ON stock.product_id = product.id
    WHERE product.id IS NULL OR stock.product_id IS NULL OR product.stock_quantity <> stock.quantity
)
    THROW 51011, 'Stock values differ between products and inventory. Reconcile them before Phase 2.', 1;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- inventory_adjustments is intentionally retained as the stock audit trail.
IF OBJECT_ID('dbo.inventory', 'U') IS NOT NULL
    DROP TABLE dbo.inventory;

COMMIT TRANSACTION;
GO

SELECT id, product_name, stock_quantity
FROM dbo.products
ORDER BY id;
GO
