/*
  Phase 4 - Rename ambiguous database objects without changing API contracts.

  po_details                    -> purchase_order_items
  event_promotions              -> invoice_promotions
  products.price                -> products.selling_price
  purchase_order_items.import_price -> unit_cost
  purchase_order_items.subtotal     -> line_total
  invoice_promotions.min_order_amount -> min_invoice_amount
*/
USE store_management;
GO

SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.po_details', N'U') IS NOT NULL
       AND OBJECT_ID(N'dbo.purchase_order_items', N'U') IS NULL
        EXEC sys.sp_rename N'dbo.po_details', N'purchase_order_items';

    IF OBJECT_ID(N'dbo.event_promotions', N'U') IS NOT NULL
       AND OBJECT_ID(N'dbo.invoice_promotions', N'U') IS NULL
        EXEC sys.sp_rename N'dbo.event_promotions', N'invoice_promotions';

    IF COL_LENGTH(N'dbo.products', N'price') IS NOT NULL
       AND COL_LENGTH(N'dbo.products', N'selling_price') IS NULL
        EXEC sys.sp_rename N'dbo.products.price', N'selling_price', N'COLUMN';

    IF COL_LENGTH(N'dbo.purchase_order_items', N'import_price') IS NOT NULL
       AND COL_LENGTH(N'dbo.purchase_order_items', N'unit_cost') IS NULL
    BEGIN
        /* subtotal is computed, so it contains no independently stored data. */
        IF COL_LENGTH(N'dbo.purchase_order_items', N'subtotal') IS NOT NULL
            ALTER TABLE dbo.purchase_order_items DROP COLUMN subtotal;
        IF OBJECT_ID(N'dbo.ck_po_details_import_price', N'C') IS NOT NULL
            ALTER TABLE dbo.purchase_order_items DROP CONSTRAINT ck_po_details_import_price;
        EXEC sys.sp_rename N'dbo.purchase_order_items.import_price', N'unit_cost', N'COLUMN';
    END;

    IF COL_LENGTH(N'dbo.purchase_order_items', N'line_total') IS NULL
        EXEC sys.sp_executesql N'ALTER TABLE dbo.purchase_order_items
            ADD line_total AS (quantity * unit_cost) PERSISTED;';
    IF OBJECT_ID(N'dbo.ck_purchase_order_items_unit_cost', N'C') IS NULL
        EXEC sys.sp_executesql N'ALTER TABLE dbo.purchase_order_items WITH CHECK
            ADD CONSTRAINT ck_purchase_order_items_unit_cost CHECK (unit_cost >= 0);';

    IF COL_LENGTH(N'dbo.invoice_promotions', N'min_order_amount') IS NOT NULL
       AND COL_LENGTH(N'dbo.invoice_promotions', N'min_invoice_amount') IS NULL
    BEGIN
        IF OBJECT_ID(N'dbo.ck_event_min_order', N'C') IS NOT NULL
            ALTER TABLE dbo.invoice_promotions DROP CONSTRAINT ck_event_min_order;
        DECLARE @defaultConstraint sysname;
        SELECT @defaultConstraint = default_object.name
        FROM sys.default_constraints AS default_object
        JOIN sys.columns AS column_object
          ON column_object.object_id=default_object.parent_object_id
         AND column_object.column_id=default_object.parent_column_id
        WHERE default_object.parent_object_id=OBJECT_ID(N'dbo.invoice_promotions')
          AND column_object.name=N'min_order_amount';
        IF @defaultConstraint IS NOT NULL
        BEGIN
            DECLARE @dropDefault nvarchar(max) = N'ALTER TABLE dbo.invoice_promotions DROP CONSTRAINT '
                + QUOTENAME(@defaultConstraint) + N';';
            EXEC sys.sp_executesql @dropDefault;
        END;
        EXEC sys.sp_rename N'dbo.invoice_promotions.min_order_amount', N'min_invoice_amount', N'COLUMN';
        ALTER TABLE dbo.invoice_promotions
            ADD CONSTRAINT df_invoice_promotions_min_invoice_amount DEFAULT 0 FOR min_invoice_amount;
        ALTER TABLE dbo.invoice_promotions WITH CHECK
            ADD CONSTRAINT ck_invoice_promotions_min_invoice_amount CHECK (min_invoice_amount >= 0);
    END;

    IF OBJECT_ID(N'dbo.pk_po_details', N'PK') IS NOT NULL
        EXEC sys.sp_rename N'dbo.pk_po_details', N'pk_purchase_order_items', N'OBJECT';
    IF OBJECT_ID(N'dbo.fk_po_details_po', N'F') IS NOT NULL
        EXEC sys.sp_rename N'dbo.fk_po_details_po', N'fk_purchase_order_items_order', N'OBJECT';
    IF OBJECT_ID(N'dbo.fk_po_details_product', N'F') IS NOT NULL
        EXEC sys.sp_rename N'dbo.fk_po_details_product', N'fk_purchase_order_items_product', N'OBJECT';
    IF OBJECT_ID(N'dbo.ck_po_details_quantity', N'C') IS NOT NULL
        EXEC sys.sp_rename N'dbo.ck_po_details_quantity', N'ck_purchase_order_items_quantity', N'OBJECT';
    IF OBJECT_ID(N'dbo.ck_po_details_import_price', N'C') IS NOT NULL
        EXEC sys.sp_rename N'dbo.ck_po_details_import_price', N'ck_purchase_order_items_unit_cost', N'OBJECT';
    IF EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id=OBJECT_ID(N'dbo.purchase_order_items') AND name=N'idx_po_details_product')
        EXEC sys.sp_rename N'dbo.purchase_order_items.idx_po_details_product',
                           N'idx_purchase_order_items_product', N'INDEX';

    IF OBJECT_ID(N'dbo.fk_event_promotions_promotion', N'F') IS NOT NULL
        EXEC sys.sp_rename N'dbo.fk_event_promotions_promotion', N'fk_invoice_promotions_promotion', N'OBJECT';
    IF OBJECT_ID(N'dbo.ck_event_min_order', N'C') IS NOT NULL
        EXEC sys.sp_rename N'dbo.ck_event_min_order', N'ck_invoice_promotions_min_invoice_amount', N'OBJECT';
    IF OBJECT_ID(N'dbo.ck_event_discount_percent', N'C') IS NOT NULL
        EXEC sys.sp_rename N'dbo.ck_event_discount_percent', N'ck_invoice_promotions_discount_percent', N'OBJECT';

    DECLARE @oldName sysname;
    DECLARE @qualifiedOldName nvarchar(517);
    SELECT @oldName = constraint_object.name
    FROM sys.key_constraints AS constraint_object
    WHERE constraint_object.parent_object_id=OBJECT_ID(N'dbo.invoice_promotions')
      AND constraint_object.type=N'PK';
    IF @oldName IS NOT NULL AND @oldName <> N'pk_invoice_promotions'
    BEGIN
        SET @qualifiedOldName = N'dbo.' + QUOTENAME(@oldName);
        EXEC sys.sp_rename @qualifiedOldName, N'pk_invoice_promotions', N'OBJECT';
    END;

    SET @oldName = NULL;
    SELECT @oldName = constraint_object.name
    FROM sys.key_constraints AS constraint_object
    JOIN sys.index_columns AS index_column
      ON index_column.object_id=constraint_object.parent_object_id
     AND index_column.index_id=constraint_object.unique_index_id
    JOIN sys.columns AS column_object
      ON column_object.object_id=index_column.object_id
     AND column_object.column_id=index_column.column_id
    WHERE constraint_object.parent_object_id=OBJECT_ID(N'dbo.invoice_promotions')
      AND constraint_object.type=N'UQ' AND column_object.name=N'promotion_id';
    IF @oldName IS NOT NULL AND @oldName <> N'uq_invoice_promotions_promotion'
    BEGIN
        SET @qualifiedOldName = N'dbo.' + QUOTENAME(@oldName);
        EXEC sys.sp_rename @qualifiedOldName, N'uq_invoice_promotions_promotion', N'OBJECT';
    END;

    IF OBJECT_ID(N'dbo.purchase_order_items', N'U') IS NULL
       OR OBJECT_ID(N'dbo.invoice_promotions', N'U') IS NULL
       OR COL_LENGTH(N'dbo.products', N'selling_price') IS NULL
       OR COL_LENGTH(N'dbo.purchase_order_items', N'unit_cost') IS NULL
       OR COL_LENGTH(N'dbo.purchase_order_items', N'line_total') IS NULL
       OR COL_LENGTH(N'dbo.invoice_promotions', N'min_invoice_amount') IS NULL
        THROW 51010, N'Không thể hoàn tất toàn bộ thay đổi tên cơ sở dữ liệu.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SELECT t.name AS table_name, c.name AS column_name
FROM sys.tables AS t
JOIN sys.columns AS c ON c.object_id=t.object_id
WHERE (t.name=N'products' AND c.name=N'selling_price')
   OR (t.name=N'purchase_order_items' AND c.name IN (N'unit_cost',N'line_total'))
   OR (t.name=N'invoice_promotions' AND c.name=N'min_invoice_amount')
ORDER BY t.name,c.column_id;
GO
