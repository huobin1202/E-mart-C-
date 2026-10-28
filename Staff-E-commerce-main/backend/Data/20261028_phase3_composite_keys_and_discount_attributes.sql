/*
  Phase 3 - Enforce the required composite primary keys while preserving id as
  a regular identity column. Also materialize the required discount percentage
  attribute in each promotion detail table.

  Safe to run once after phases 1 and 2.
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

DECLARE @invoiceTriggerWasEnabled bit = CASE
    WHEN EXISTS (
        SELECT 1 FROM sys.triggers
        WHERE parent_id = OBJECT_ID(N'dbo.invoice_items')
          AND name = N'trg_invoice_items_lock_paid_snapshot'
          AND is_disabled = 0
    ) THEN 1 ELSE 0 END;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.po_details', N'U') IS NULL
       OR OBJECT_ID(N'dbo.invoice_items', N'U') IS NULL
       OR OBJECT_ID(N'dbo.product_promotions', N'U') IS NULL
        THROW 51000, N'Không tìm thấy đầy đủ các bảng cần chuyển sang khóa chính phức hợp.', 1;

    /* The composite invoice key cannot contain NULL. */
    IF EXISTS (SELECT 1 FROM dbo.invoice_items WHERE product_id IS NULL)
        THROW 51001, N'invoice_items còn product_id NULL; cần phục hồi mã sản phẩm trước khi tạo PK.', 1;

    /* Consolidate duplicate invoice/product rows without losing quantity/value. */
    IF @invoiceTriggerWasEnabled = 1
        DISABLE TRIGGER dbo.trg_invoice_items_lock_paid_snapshot ON dbo.invoice_items;

    SELECT invoice_id, product_id, MIN(id) AS keep_id,
           SUM(quantity) AS merged_quantity,
           CAST(SUM(total_price) / NULLIF(SUM(quantity), 0) AS decimal(12,2)) AS merged_unit_price,
           SUM(total_price) AS merged_total_price
    INTO #invoice_item_merges
    FROM dbo.invoice_items
    GROUP BY invoice_id, product_id
    HAVING COUNT(*) > 1;

    UPDATE target
       SET target.quantity = source.merged_quantity,
           target.unit_price = source.merged_unit_price,
           target.total_price = source.merged_total_price
    FROM dbo.invoice_items AS target
    JOIN #invoice_item_merges AS source ON source.keep_id = target.id;

    DELETE duplicate_row
    FROM dbo.invoice_items AS duplicate_row
    JOIN #invoice_item_merges AS source
      ON source.invoice_id = duplicate_row.invoice_id
     AND source.product_id = duplicate_row.product_id
    WHERE duplicate_row.id <> source.keep_id;

    IF @invoiceTriggerWasEnabled = 1
        ENABLE TRIGGER dbo.trg_invoice_items_lock_paid_snapshot ON dbo.invoice_items;

    IF EXISTS (
        SELECT 1 FROM dbo.po_details
        GROUP BY purchase_order_id, product_id HAVING COUNT(*) > 1
    )
        THROW 51002, N'po_details còn trùng cặp phiếu nhập/sản phẩm.', 1;

    IF EXISTS (
        SELECT 1 FROM dbo.product_promotions
        GROUP BY promotion_id, product_id HAVING COUNT(*) > 1
    )
        THROW 51003, N'product_promotions còn trùng cặp CTKM/sản phẩm.', 1;

    /* Required discount attributes. NULL represents a fixed-amount campaign. */
    IF COL_LENGTH(N'dbo.product_promotions', N'discount_percent') IS NULL
        ALTER TABLE dbo.product_promotions ADD discount_percent decimal(5,2) NULL;
    IF COL_LENGTH(N'dbo.event_promotions', N'discount_percent') IS NULL
        ALTER TABLE dbo.event_promotions ADD discount_percent decimal(5,2) NULL;
    IF COL_LENGTH(N'dbo.voucher_promotions', N'discount_percent') IS NULL
        ALTER TABLE dbo.voucher_promotions ADD discount_percent decimal(5,2) NULL;

    EXEC sys.sp_executesql N'
        UPDATE detail
           SET discount_percent = CASE WHEN promotion.discount_type = ''percent''
                                       THEN CAST(promotion.discount_value AS decimal(5,2)) END
        FROM dbo.product_promotions AS detail
        JOIN dbo.promotions AS promotion ON promotion.id = detail.promotion_id;

        UPDATE detail
           SET discount_percent = CASE WHEN promotion.discount_type = ''percent''
                                       THEN CAST(promotion.discount_value AS decimal(5,2)) END
        FROM dbo.event_promotions AS detail
        JOIN dbo.promotions AS promotion ON promotion.id = detail.promotion_id;

        UPDATE detail
           SET discount_percent = CASE WHEN promotion.discount_type = ''percent''
                                       THEN CAST(promotion.discount_value AS decimal(5,2)) END
        FROM dbo.voucher_promotions AS detail
        JOIN dbo.promotions AS promotion ON promotion.id = detail.promotion_id;';

    IF OBJECT_ID(N'dbo.ck_product_promotions_discount_percent', N'C') IS NULL
        EXEC sys.sp_executesql N'ALTER TABLE dbo.product_promotions WITH CHECK
            ADD CONSTRAINT ck_product_promotions_discount_percent
            CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100);';
    IF OBJECT_ID(N'dbo.ck_event_discount_percent', N'C') IS NULL
        EXEC sys.sp_executesql N'ALTER TABLE dbo.event_promotions WITH CHECK
            ADD CONSTRAINT ck_event_discount_percent
            CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100);';
    IF OBJECT_ID(N'dbo.ck_voucher_discount_percent', N'C') IS NULL
        EXEC sys.sp_executesql N'ALTER TABLE dbo.voucher_promotions WITH CHECK
            ADD CONSTRAINT ck_voucher_discount_percent
            CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100);';

    DECLARE @sql nvarchar(max) = N'';

    /* Drop the old id primary keys. */
    SELECT @sql = @sql + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id))
        + N'.' + QUOTENAME(OBJECT_NAME(parent_object_id)) + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';'
    FROM sys.key_constraints
    WHERE type = 'PK'
      AND parent_object_id IN (OBJECT_ID(N'dbo.po_details'), OBJECT_ID(N'dbo.invoice_items'),
                               OBJECT_ID(N'dbo.product_promotions'));
    EXEC sys.sp_executesql @sql;

    /* The former pair-wise UNIQUE constraints become redundant with the PKs. */
    SET @sql = N'';
    SELECT @sql = @sql + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id))
        + N'.' + QUOTENAME(OBJECT_NAME(parent_object_id)) + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';'
    FROM sys.key_constraints
    WHERE type = 'UQ'
      AND parent_object_id IN (OBJECT_ID(N'dbo.po_details'), OBJECT_ID(N'dbo.product_promotions'))
      AND name IN (N'ux_po_details_product', N'ux_product_promotions');
    IF LEN(@sql) > 0 EXEC sys.sp_executesql @sql;

    /* SET NULL is incompatible with product_id being part of a primary key. */
    SET @sql = N'';
    SELECT @sql = N'ALTER TABLE dbo.invoice_items DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
    FROM sys.foreign_keys AS fk
    JOIN sys.foreign_key_columns AS fkc ON fkc.constraint_object_id = fk.object_id
    WHERE fk.parent_object_id = OBJECT_ID(N'dbo.invoice_items')
      AND COL_NAME(fkc.parent_object_id, fkc.parent_column_id) = N'product_id';
    IF LEN(@sql) > 0 EXEC sys.sp_executesql @sql;

    ALTER TABLE dbo.invoice_items ALTER COLUMN product_id int NOT NULL;

    ALTER TABLE dbo.po_details
        ADD CONSTRAINT pk_po_details PRIMARY KEY (purchase_order_id, product_id);
    ALTER TABLE dbo.invoice_items
        ADD CONSTRAINT pk_invoice_items PRIMARY KEY (invoice_id, product_id);
    ALTER TABLE dbo.product_promotions
        ADD CONSTRAINT pk_product_promotions PRIMARY KEY (promotion_id, product_id);

    ALTER TABLE dbo.invoice_items WITH CHECK
        ADD CONSTRAINT fk_invoice_items_product FOREIGN KEY (product_id)
        REFERENCES dbo.products(id) ON DELETE NO ACTION;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    IF @invoiceTriggerWasEnabled = 1
       AND EXISTS (SELECT 1 FROM sys.triggers
                   WHERE parent_id = OBJECT_ID(N'dbo.invoice_items')
                     AND name = N'trg_invoice_items_lock_paid_snapshot' AND is_disabled = 1)
        ENABLE TRIGGER dbo.trg_invoice_items_lock_paid_snapshot ON dbo.invoice_items;
    THROW;
END CATCH;
GO

SELECT OBJECT_NAME(k.parent_object_id) AS table_name,
       k.name AS primary_key,
       STRING_AGG(c.name, N', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_columns
FROM sys.key_constraints AS k
JOIN sys.index_columns AS ic
  ON ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id
JOIN sys.columns AS c
  ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE k.type = 'PK'
  AND k.parent_object_id IN (OBJECT_ID(N'dbo.po_details'), OBJECT_ID(N'dbo.invoice_items'),
                             OBJECT_ID(N'dbo.product_promotions'))
GROUP BY k.parent_object_id, k.name
ORDER BY table_name;
GO
