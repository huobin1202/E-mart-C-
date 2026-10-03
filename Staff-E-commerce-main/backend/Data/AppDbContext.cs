using Microsoft.EntityFrameworkCore;
using backend.Models;

namespace backend.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<ActivityLog> ActivityLogs { get; set; }
        public DbSet<PromotionRedemption> PromotionRedemptions { get; set; }
        public DbSet<Payment> Payments { get; set; }
        public DbSet<OrderItem> OrderItems { get; set; }
        public DbSet<Order> Orders { get; set; }
        public DbSet<InventoryAdjustment> InventoryAdjustments { get; set; }
        public DbSet<Inventory> Inventory { get; set; }
        public DbSet<Unit> Units { get; set; }
        public DbSet<Product> Products { get; set; }
        public DbSet<Supplier> Suppliers { get; set; }
        public DbSet<Category> Categories { get; set; }
        public DbSet<Customer> Customers { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<Promotion> Promotions { get; set; }
        public DbSet<EventPromotion> EventPromotions { get; set; }
        public DbSet<VoucherPromotion> VoucherPromotions { get; set; }
        public DbSet<ProductPromotion> ProductPromotions { get; set; }
        public DbSet<AiConversation> AiConversations { get; set; }
        public DbSet<AiMessage> AiMessages { get; set; }


        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // If your EF Core version doesn't support [Index] attribute, define indexes here:
            modelBuilder.Entity<Category>()
                .HasIndex(c => c.Slug)
                .IsUnique()
                .HasDatabaseName("ux_categories_slug");

            modelBuilder.Entity<Product>()
                .HasIndex(p => p.Sku)
                .IsUnique()
                .HasDatabaseName("ux_products_sku");

            // modelBuilder.Entity<Product>()
            // .HasIndex(p => p.Barcode)
            // .IsUnique()
            // .HasDatabaseName("ux_products_barcode");

            modelBuilder.Entity<Product>()
                    .HasOne(p => p.Unit)
                    .WithMany(u => u.Products)
                    .HasForeignKey(p => p.UnitId)
                    .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Product>()
                .HasIndex(p => p.CategoryId)
                .HasDatabaseName("idx_products_category");

            modelBuilder.Entity<Product>()
                .HasIndex(p => p.SupplierId)
                .HasDatabaseName("idx_products_supplier");

            modelBuilder.Entity<Inventory>()
                .HasIndex(i => i.ProductId)
                .IsUnique()
                .HasDatabaseName("ux_inventory_product");

            // Configure one-to-one: Product <-> Inventory
            modelBuilder.Entity<Product>()
                .HasOne(p => p.Inventory)
                .WithOne(i => i.Product)
                .HasForeignKey<Inventory>(i => i.ProductId)
                .OnDelete(DeleteBehavior.Cascade);

            // Configure Product -> Category (many-to-one)
            modelBuilder.Entity<Product>()
                .HasOne(p => p.Category)
                .WithMany(c => c.Products)
                .HasForeignKey(p => p.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);

            // Configure Product -> Supplier (many-to-one)
            modelBuilder.Entity<Product>()
                .HasOne(p => p.Supplier)
                .WithMany(s => s.Products)
                .HasForeignKey(p => p.SupplierId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Order>()
                .HasOne(o => o.Customer)
                .WithMany()
                .HasForeignKey(o => o.CustomerId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Order>()
                .HasOne(o => o.User)
                .WithMany()
                .HasForeignKey(o => o.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Order>()
                .HasOne(o => o.Promotion)
                .WithMany(p => p.Orders)
                .HasForeignKey(o => o.PromotionId)
                .OnDelete(DeleteBehavior.SetNull);

            // OrderItem -> Order (many-to-one)
            modelBuilder.Entity<OrderItem>()
                .HasOne(oi => oi.Order)
                .WithMany(o => o.OrderItems)
                .HasForeignKey(oi => oi.OrderId)
                .OnDelete(DeleteBehavior.Cascade);

            // OrderItem -> Product (many-to-one)
            modelBuilder.Entity<OrderItem>()
                .HasOne(oi => oi.Product)
                .WithMany(p => p.OrderItems)
                .HasForeignKey(oi => oi.ProductId)
                .OnDelete(DeleteBehavior.Restrict);

            // Payment -> Order
            modelBuilder.Entity<Payment>()
                .HasOne(p => p.Order)
                .WithMany(o => o.Payments)
                .HasForeignKey(p => p.OrderId)
                .OnDelete(DeleteBehavior.Cascade);

            // InventoryAdjustment -> Product, User
            modelBuilder.Entity<InventoryAdjustment>()
                .HasOne(a => a.Product)
                .WithMany(p => p.InventoryAdjustments)
                .HasForeignKey(a => a.ProductId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<InventoryAdjustment>()
                .HasOne(a => a.User)
                .WithMany()
                .HasForeignKey(a => a.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            // ActivityLog -> User
            modelBuilder.Entity<ActivityLog>()
                .HasOne(l => l.User)
                .WithMany()
                .HasForeignKey(l => l.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<PromotionRedemption>()
                .HasOne(pr => pr.Promotion)
                .WithMany(p => p.Redemptions)
                .HasForeignKey(pr => pr.PromotionId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<PromotionRedemption>()
                .HasOne(pr => pr.Customer)
                .WithMany(c => c.PromotionRedemptions)
                .HasForeignKey(pr => pr.CustomerId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<PromotionRedemption>()
                .HasOne(pr => pr.Order)
                .WithMany()
                .HasForeignKey(pr => pr.OrderId)
                .OnDelete(DeleteBehavior.SetNull);

            // Global query filters
            modelBuilder.Entity<Promotion>()
                .HasQueryFilter(p => !p.IsDeleted);

            modelBuilder.Entity<Promotion>().HasOne(p => p.EventDetails).WithOne(d => d.Promotion)
                .HasForeignKey<EventPromotion>(d => d.PromotionId).OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<Promotion>().HasOne(p => p.VoucherDetails).WithOne(d => d.Promotion)
                .HasForeignKey<VoucherPromotion>(d => d.PromotionId).OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<Promotion>().HasMany(p => p.ProductDetails).WithOne(d => d.Promotion)
                .HasForeignKey(d => d.PromotionId).OnDelete(DeleteBehavior.Cascade);

            // Customer -> Orders
            modelBuilder.Entity<Customer>()
                .HasMany(c => c.Orders)
                .WithOne(o => o.Customer)
                .HasForeignKey(o => o.CustomerId)
                .OnDelete(DeleteBehavior.SetNull);

            // User -> Orders, InventoryAdjustments, ActivityLogs
            modelBuilder.Entity<User>()
                .HasMany(u => u.Orders)
                .WithOne(o => o.User)
                .HasForeignKey(o => o.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<User>()
                .HasMany(u => u.InventoryAdjustments)
                .WithOne(a => a.User)
                .HasForeignKey(a => a.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<User>()
                .HasMany(u => u.ActivityLogs)
                .WithOne(l => l.User)
                .HasForeignKey(l => l.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            // AiConversation -> User
            modelBuilder.Entity<AiConversation>()
                .HasOne(c => c.User)
                .WithMany()
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // AiMessage -> AiConversation
            modelBuilder.Entity<AiMessage>()
                .HasOne(m => m.Conversation)
                .WithMany(c => c.Messages)
                .HasForeignKey(m => m.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}

