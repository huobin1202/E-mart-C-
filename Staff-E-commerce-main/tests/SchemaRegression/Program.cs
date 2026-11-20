using backend.Data;
using backend.Security;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

var backendPath = Path.GetFullPath(args.FirstOrDefault() ?? "Staff-E-commerce-main/backend");
var config = new ConfigurationBuilder().SetBasePath(backendPath).AddJsonFile("appsettings.json")
    .AddJsonFile("appsettings.Development.json", optional: true).AddEnvironmentVariables().Build();
var connection = new SqlConnectionStringBuilder(config.GetConnectionString("DefaultConnection"))
{
    InitialCatalog = "SchemaRegression_" + Guid.NewGuid().ToString("N")
};
var services = new ServiceCollection().AddLogging()
    .AddDbContext<AppDbContext>(o => o.UseSqlServer(connection.ConnectionString)).BuildServiceProvider();
await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(connection.ConnectionString).Options);
var checks = 0;
try
{
    await AuthorizationSchemaInitializer.InitializeAsync(services);
    await CheckColumns();
    await CheckCustomerBirthdayRemoved();
    Check(await Scalar("SELECT COUNT(*) AS Value FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')") == 26, "26 current tables (incl. customer_vouchers) created from an absent database");
    foreach (var resource in PermissionCatalog.Resources.Keys)
    foreach (var op in resource is "reports" or "audit" or "invoices" ? new[] { "read" } : new[] { "read", "write" })
        Check(await db.Permissions.AnyAsync(p => p.Code == resource + "." + op), "permission " + resource + "." + op);

    await db.Database.ExecuteSqlRawAsync("""
        DELETE rp FROM dbo.role_permissions rp JOIN dbo.roles r ON r.id=rp.role_id
        JOIN dbo.permissions p ON p.id=rp.permission_id WHERE r.name='staff' AND p.code='products.write';
        INSERT dbo.products(product_name, sku, selling_price, stock_quantity) VALUES (N'Legacy product', 'TEST', 12500, 7);
        INSERT dbo.promotions(code, name, type, discount_type, discount_value, start_date, end_date)
        VALUES ('TEST', N'Test promotion', 'product', 'percent', 20, GETDATE(), DATEADD(day,1,GETDATE()));
        INSERT dbo.product_promotions(promotion_id,product_id,discount_percent) VALUES (1,1,20);
        """);
    var grants = await Scalar("SELECT COUNT(*) AS Value FROM dbo.role_permissions");
    await AuthorizationSchemaInitializer.InitializeAsync(services);
    Check(await Scalar("SELECT COUNT(*) AS Value FROM dbo.role_permissions") == grants, "restart preserves revoked permissions");
    Check(await Scalar("SELECT stock_quantity AS Value FROM dbo.products WHERE id=1") == 7, "restart preserves stock");

    // Emulate the previous schema, including old names and id primary keys.
    await db.Database.ExecuteSqlRawAsync("""
        CREATE TABLE dbo.inventory(id INT IDENTITY PRIMARY KEY, product_id INT NOT NULL, quantity INT NOT NULL);
        ALTER TABLE dbo.customers ADD date_of_birth DATE NULL CONSTRAINT df_legacy_customer_birthday DEFAULT ('2000-01-01');
        EXEC sys.sp_executesql N'INSERT dbo.customers(full_name,phone,date_of_birth,reward_points) VALUES (N''Legacy customer'',''0912345678'',''1995-03-09'',120);';
        INSERT dbo.inventory(product_id,quantity) VALUES (1,7);
        DROP INDEX idx_products_stock_quantity ON dbo.products;
        ALTER TABLE dbo.products DROP CONSTRAINT ck_products_stock_quantity;
        DECLARE @drop NVARCHAR(MAX);
        SELECT @drop=N'ALTER TABLE dbo.products DROP CONSTRAINT '+QUOTENAME(d.name)
        FROM sys.default_constraints d JOIN sys.columns c ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
        WHERE c.object_id=OBJECT_ID('dbo.products') AND c.name='stock_quantity';
        EXEC sys.sp_executesql @drop;
        ALTER TABLE dbo.products DROP COLUMN stock_quantity;
        EXEC sys.sp_rename 'dbo.products.selling_price', 'price', 'COLUMN';
        ALTER TABLE dbo.product_promotions DROP CONSTRAINT ck_product_promotions_discount_percent;
        ALTER TABLE dbo.product_promotions DROP COLUMN discount_percent;
        ALTER TABLE dbo.invoice_promotions DROP CONSTRAINT ck_invoice_promotions_discount_percent;
        ALTER TABLE dbo.invoice_promotions DROP COLUMN discount_percent;
        ALTER TABLE dbo.voucher_promotions DROP CONSTRAINT ck_voucher_discount_percent;
        ALTER TABLE dbo.voucher_promotions DROP COLUMN discount_percent;
        ALTER TABLE dbo.purchase_order_items DROP COLUMN line_total;
        ALTER TABLE dbo.purchase_order_items DROP CONSTRAINT ck_purchase_order_items_unit_cost;
        EXEC sys.sp_rename 'dbo.purchase_order_items.unit_cost', 'import_price', 'COLUMN';
        EXEC sys.sp_rename 'dbo.purchase_order_items', 'po_details';
        ALTER TABLE dbo.invoice_promotions DROP CONSTRAINT ck_invoice_promotions_min_invoice_amount;
        SELECT @drop=N'ALTER TABLE dbo.invoice_promotions DROP CONSTRAINT '+QUOTENAME(d.name)
        FROM sys.default_constraints d JOIN sys.columns c ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
        WHERE c.object_id=OBJECT_ID('dbo.invoice_promotions') AND c.name='min_invoice_amount';
        EXEC sys.sp_executesql @drop;
        EXEC sys.sp_rename 'dbo.invoice_promotions.min_invoice_amount', 'min_order_amount', 'COLUMN';
        EXEC sys.sp_rename 'dbo.invoice_promotions', 'event_promotions';
        ALTER TABLE dbo.event_promotions ADD CONSTRAINT ck_event_min_order CHECK (min_order_amount >= 0);
        ALTER TABLE dbo.event_promotions ADD CONSTRAINT df_event_min_order DEFAULT (0) FOR min_order_amount;
        ALTER TABLE dbo.po_details ADD CONSTRAINT ck_po_details_import_price CHECK (import_price >= 0);
        ALTER TABLE dbo.po_details DROP CONSTRAINT pk_purchase_order_items;
        ALTER TABLE dbo.po_details ADD CONSTRAINT pk_legacy_po PRIMARY KEY(id);
        ALTER TABLE dbo.invoice_items DROP CONSTRAINT pk_invoice_items;
        ALTER TABLE dbo.invoice_items ADD CONSTRAINT pk_legacy_ii PRIMARY KEY(id);
        ALTER TABLE dbo.product_promotions DROP CONSTRAINT pk_product_promotions;
        ALTER TABLE dbo.product_promotions ADD CONSTRAINT pk_legacy_pp PRIMARY KEY(id);
        INSERT dbo.orders(order_number,status,payment_status) VALUES ('HISTORY','completed','paid');
        INSERT dbo.invoices(order_id,invoice_number,subtotal,total_amount) VALUES (1,'HD-HISTORY',15000,15000);
        INSERT dbo.invoice_items(invoice_id,product_id,product_name,sku,quantity,unit_price,total_price)
        VALUES (1,1,N'Historical product','OLD',2,5000,10000),(1,1,N'Historical product','OLD',1,5000,5000);
        UPDATE dbo.invoices SET invoice_status='paid' WHERE id=1;
        """);
    await AuthorizationSchemaInitializer.InitializeAsync(services);
    await CheckColumns();
    await CheckCustomerBirthdayRemoved();
    Check(await Scalar("SELECT reward_points AS Value FROM dbo.customers WHERE phone='0912345678'") == 120, "removing birthdays preserves customer and points");
    Check(await Scalar("SELECT stock_quantity AS Value FROM dbo.products WHERE id=1") == 7, "legacy stock copied");
    Check(await Scalar("SELECT CAST(selling_price AS INT) AS Value FROM dbo.products WHERE id=1") == 12500, "legacy price retained");
    Check(await Scalar("SELECT CAST(discount_percent AS INT) AS Value FROM dbo.product_promotions WHERE product_id=1") == 20, "promotion percent backfilled");
    Check(await Scalar("SELECT COUNT(*) AS Value FROM sys.tables WHERE name IN ('inventory','po_details','event_promotions')") == 0, "legacy tables removed or renamed");
    Check(await Scalar("SELECT COUNT(*) AS Value FROM sys.key_constraints k WHERE k.type='PK' AND k.name IN ('pk_purchase_order_items','pk_invoice_items','pk_product_promotions')") == 3, "composite primary keys upgraded");
    Check(await Scalar("SELECT COUNT(*) AS Value FROM dbo.invoice_items WHERE invoice_id=1") == 1, "identical historical invoice lines consolidated");
    Check(await Scalar("SELECT quantity AS Value FROM dbo.invoice_items WHERE invoice_id=1") == 3, "invoice quantity sum retained");
    Check(await Scalar("SELECT CAST(total_price AS INT) AS Value FROM dbo.invoice_items WHERE invoice_id=1") == 15000, "invoice amount sum retained");
    Check(await Scalar("SELECT CAST(unit_price AS INT) AS Value FROM dbo.invoice_items WHERE invoice_id=1") == 5000, "historical unit price retained");
    Check(await Scalar("SELECT COUNT(*) AS Value FROM sys.triggers WHERE name='trg_invoice_items_lock_paid_snapshot' AND is_disabled=0") == 1, "paid invoice protection restored");
    await AuthorizationSchemaInitializer.InitializeAsync(services);
    Check(await Scalar("SELECT COUNT(*) AS Value FROM dbo.products") == 1, "upgraded database can initialize twice");
    await CheckCustomerBirthdayRemoved();

    // A conflicting legacy stock table must abort and roll back earlier renames.
    await db.Database.ExecuteSqlRawAsync("""
        EXEC sys.sp_rename 'dbo.purchase_order_items', 'po_details';
        CREATE TABLE dbo.inventory(product_id INT NOT NULL, quantity INT NOT NULL);
        INSERT dbo.inventory VALUES (1,99);
        """);
    try
    {
        await AuthorizationSchemaInitializer.InitializeAsync(services);
        throw new Exception("Conflicting inventory should block the upgrade.");
    }
    catch (SqlException ex) when (ex.Number == 51004) { checks++; }
    Check(await Scalar("SELECT COUNT(*) AS Value FROM sys.tables WHERE name='po_details'") == 1, "failed migration rolls back table rename");
    Check(await Scalar("SELECT stock_quantity AS Value FROM dbo.products WHERE id=1") == 7, "failed migration preserves stock");
    await db.Database.ExecuteSqlRawAsync("DROP TABLE dbo.inventory;");
    await AuthorizationSchemaInitializer.InitializeAsync(services);

    // Exercise the optional demo branch using the exact SQL batches from the resource.
    await db.Database.EnsureDeletedAsync();
    await DatabaseSchemaInitializer.InitializeAsync(db);
    await db.Database.OpenConnectionAsync();
    try
    {
        await db.Database.ExecuteSqlRawAsync("EXEC sys.sp_set_session_context @key=N'emart_seed_demo', @value=1;");
        await DatabaseSchemaInitializer.InitializeAsync(db);
        Check(await Scalar("SELECT COUNT(*) AS Value FROM dbo.products") == 80, "optional demo dataset imports 80 products");
        await DatabaseSchemaInitializer.InitializeAsync(db);
        Check(await Scalar("SELECT COUNT(*) AS Value FROM dbo.products") == 80, "demo dataset is not duplicated");
    }
    finally { await db.Database.CloseConnectionAsync(); }
    Console.WriteLine($"PASS: {checks} schema checks (fresh creation, legacy upgrade, idempotence, rollback, demo data).");
}
finally
{
    await services.DisposeAsync();
    SqlConnection.ClearAllPools();
    await db.Database.EnsureDeletedAsync();
}

async Task<int> Scalar(string sql) => await db.Database.SqlQueryRaw<int>(sql).SingleAsync();
async Task CheckCustomerBirthdayRemoved()
{
    Check(await Scalar("SELECT COUNT(*) AS Value FROM sys.columns WHERE object_id=OBJECT_ID('dbo.customers') AND name='date_of_birth'") == 0, "customer birthday column absent");
    Check(await Scalar("SELECT COUNT(*) AS Value FROM sys.columns WHERE object_id=OBJECT_ID('dbo.employees') AND name='date_of_birth'") == 1, "employee birthday column retained");
}
void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
    checks++;
}
async Task CheckColumns()
{
    var columns = (await db.Database.SqlQueryRaw<string>("SELECT TABLE_NAME + '.' + COLUMN_NAME AS Value FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo'").ToListAsync()).ToHashSet(StringComparer.OrdinalIgnoreCase);
    foreach (var table in db.Model.GetRelationalModel().Tables)
    foreach (var column in table.Columns)
        Check(columns.Contains(table.Name + "." + column.Name), "mapped column " + table.Name + "." + column.Name);
    // SELECT also catches incompatible SQL data types and missing relationships.
    foreach (var entity in db.Model.GetEntityTypes())
    {
        var method = typeof(EntityFrameworkQueryableExtensions).GetMethods().Single(m => m.Name == "ToListAsync" && m.GetParameters().Length == 2);
        var set = typeof(DbContext).GetMethod("Set", Type.EmptyTypes)!.MakeGenericMethod(entity.ClrType).Invoke(db, null)!;
        var task = (Task)method.MakeGenericMethod(entity.ClrType).Invoke(null, [set, CancellationToken.None])!;
        await task;
        checks++;
    }
}
