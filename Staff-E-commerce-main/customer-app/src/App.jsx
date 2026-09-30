import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronLeft, Heart, Home, LoaderCircle, Menu, Minus, Plus, Search, ShoppingBag, ShoppingCart, UserRound, X } from "lucide-react";
import "./storefront.css";

const money = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value || 0);
const apiOrigin = import.meta.env.VITE_API_ORIGIN || "";
const imageUrl = (url) => !url ? "" : url.startsWith("http") ? url : `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;

export default function StorefrontApp() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem("shop_cart") || "[]"));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ fullName: "", phone: "", address: "", note: "" });
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [completedOrder, setCompletedOrder] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/storefront/products"),
      fetch("/api/storefront/categories"),
    ]).then(async ([productResponse, categoryResponse]) => {
      if (!productResponse.ok) throw new Error("Không tải được sản phẩm. Hãy kiểm tra backend đang chạy.");
      const productData = await productResponse.json();
      const categoryData = categoryResponse.ok ? await categoryResponse.json() : [];
      if (!active) return;
      setProducts(Array.isArray(productData) ? productData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setLoadError("");
    }).catch((error) => active && setLoadError(error.message || "Không thể kết nối máy chủ."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => { localStorage.setItem("shop_cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesSearch = product.productName?.toLowerCase().includes(query.trim().toLowerCase());
    const matchesCategory = categoryId === "all" || String(product.categoryId) === String(categoryId);
    return matchesSearch && matchesCategory;
  }), [products, query, categoryId]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = (product) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { id: product.id, name: product.productName, price: product.price, image: product.imageUrl, quantity: 1 }];
    });
    setToast("Đã thêm vào giỏ hàng");
  };
  const updateQuantity = (id, change) => setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: item.quantity + change } : item).filter((item) => item.quantity > 0));
  const submitOrder = async (event) => {
    event.preventDefault();
    setOrderSubmitting(true);
    setOrderError("");
    try {
      const response = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...checkoutForm, items: cart.map(({ id, quantity }) => ({ productId: id, quantity })) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Không thể tạo đơn hàng. Vui lòng thử lại.");
      setCompletedOrder(result);
      setCart([]);
    } catch (error) {
      setOrderError(error.message || "Không kết nối được máy chủ. Vui lòng thử lại.");
    } finally {
      setOrderSubmitting(false);
    }
  };

  return (
    <main className="storefront">
      <header className="shop-header">
        <div className="shop-header-top">
          <a className="brand" href="/shop" aria-label="E-Mart trang chủ"><span className="brand-mark">e</span><span>E-Mart<small>ĐI CHỢ THẬT NHANH</small></span></a>
          <button className="icon-button menu-button" aria-label="Mở danh mục" onClick={() => document.querySelector(".category-strip")?.scrollIntoView({ behavior: "smooth" })}><Menu /></button>
          <button className="header-cart" onClick={() => setTab("cart")}><ShoppingBag size={19} /><span>Giỏ hàng</span>{cartCount > 0 && <b>{cartCount}</b>}</button>
        </div>
        <label className="shop-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm sản phẩm bạn cần..." /><kbd>⌘ K</kbd></label>
        <div className="shop-promise"><span><Check size={14} /> Hàng chính hãng</span><i /><span><Check size={14} /> Giao nhanh 2 giờ</span><i /><span><Check size={14} /> Đổi trả dễ dàng</span></div>
      </header>

      <div className="shop-content">
        <section className="hero-card">
          <div className="hero-copy"><span className="hero-eyebrow">TƯƠI NGON MỖI NGÀY</span><h1>Đi chợ tiện lợi,<br /><em>vui khỏe cả nhà.</em></h1><p>Thực phẩm tươi ngon và hàng thiết yếu, giao tận cửa nhà bạn.</p><button onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}>Mua sắm ngay <ArrowRight size={17} /></button></div>
          <div className="hero-art" aria-hidden="true"><div className="hero-sun" /><div className="hero-bag">🛍️</div><span className="hero-leaf leaf-one">✦</span><span className="hero-leaf leaf-two">✿</span><div className="hero-note">Tươi mỗi ngày <span>♥</span></div></div>
        </section>

        <section className="category-section">
          <div className="section-heading"><div><span className="eyebrow">KHÁM PHÁ</span><h2>Mua theo danh mục</h2></div><span className="muted">Chọn nhóm hàng yêu thích</span></div>
          <div className="category-strip">
            <button className={`category-chip ${categoryId === "all" ? "selected" : ""}`} onClick={() => setCategoryId("all")}><span className="category-emoji">🛒</span><span>Tất cả</span></button>
            {categories.map((category) => <button key={category.id} className={`category-chip ${String(categoryId) === String(category.id) ? "selected" : ""}`} onClick={() => setCategoryId(String(category.id))}><span className="category-emoji">{category.name?.toLowerCase().includes("rau") ? "🥬" : category.name?.toLowerCase().includes("thịt") ? "🥩" : category.name?.toLowerCase().includes("đồ uống") ? "🥤" : "🥑"}</span><span>{category.name}</span></button>)}
          </div>
        </section>

        <section id="products" className="products-section">
          <div className="section-heading"><div><span className="eyebrow">TƯƠI NGON, GIÁ TỐT</span><h2>{query ? `Kết quả cho “${query}”` : "Sản phẩm đang có"}</h2></div><button className="sort-button">Phổ biến nhất <ChevronDown size={16} /></button></div>
          {loadError && <div className="shop-message error-message"><span>{loadError}</span><button onClick={() => window.location.reload()}>Thử lại</button></div>}
          {loading ? <div className="shop-loading"><LoaderCircle className="spin" /> Đang tải sản phẩm...</div> : !loadError && visibleProducts.length === 0 ? <div className="shop-message">Chưa có sản phẩm phù hợp. Hãy thử từ khóa khác nhé.</div> : <div className="product-grid">{visibleProducts.map((product) => <article className="product-card" key={product.id}><button className="favorite-button" aria-label="Yêu thích"><Heart size={17} /></button><div className="product-image">{product.imageUrl ? <img src={imageUrl(product.imageUrl)} alt={product.productName} /> : <span>🥬</span>}</div><div className="product-meta">{product.categoryName || "HÀNG TIÊU DÙNG"}</div><h3>{product.productName}</h3><div className="stock-note">Còn hàng</div><div className="product-buy"><strong>{money(product.price)}</strong><button aria-label={`Thêm ${product.productName} vào giỏ`} onClick={() => addToCart(product)}><Plus size={19} /></button></div></article>)}</div>}
        </section>
      </div>

      <nav className="mobile-nav"><button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}><Home /><span>Trang chủ</span></button><button onClick={() => document.querySelector(".category-strip")?.scrollIntoView({ behavior: "smooth" })}><Menu /><span>Danh mục</span></button><button className={tab === "cart" ? "active" : ""} onClick={() => setTab(tab === "cart" ? "home" : "cart")}><ShoppingCart /><span>Giỏ hàng</span>{cartCount > 0 && <b>{cartCount}</b>}</button><button onClick={() => setToast("Tính năng tài khoản sẽ sớm có mặt")}><UserRound /><span>Tài khoản</span></button></nav>

      {tab === "cart" && <div className="cart-backdrop" onClick={() => setTab("home")}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()}><div className="cart-heading"><div><span className="eyebrow">GIỎ HÀNG CỦA BẠN</span><h2>{cartCount} sản phẩm</h2></div><button className="icon-button" onClick={() => setTab("home")} aria-label="Đóng"><X /></button></div>{cart.length === 0 ? <div className="empty-cart"><span>🛍️</span><h3>Giỏ hàng đang trống</h3><p>Chọn vài món ngon cho hôm nay nhé.</p><button onClick={() => setTab("home")}>Tiếp tục mua sắm</button></div> : <><div className="cart-items">{cart.map((item) => <div className="cart-item" key={item.id}><div className="cart-item-image">{item.image ? <img src={imageUrl(item.image)} alt="" /> : "🥬"}</div><div className="cart-item-info"><strong>{item.name}</strong><b>{money(item.price)}</b><div className="quantity-control"><button onClick={() => updateQuantity(item.id, -1)} aria-label="Giảm"><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, 1)} aria-label="Tăng"><Plus size={14} /></button></div></div></div>)}</div><div className="cart-summary"><div><span>Tạm tính</span><b>{money(subtotal)}</b></div><div><span>Giao hàng</span><b className="free-shipping">Miễn phí</b></div><div className="cart-total"><span>Tổng cộng</span><b>{money(subtotal)}</b></div><button className="checkout-button" onClick={() => { setCheckoutOpen(true); setTab("home"); }}>Tiến hành đặt hàng <ArrowRight size={18} /></button><p className="checkout-note">Phí giao hàng và ưu đãi sẽ được xác nhận khi thanh toán.</p></div></>}</aside></div>}

      {checkoutOpen && <div className="cart-backdrop" onClick={() => !orderSubmitting && setCheckoutOpen(false)}><section className="checkout-modal" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={() => setCheckoutOpen(false)} aria-label="Đóng"><X /></button>{completedOrder ? <div className="order-success"><span className="success-mark"><Check /></span><span className="eyebrow">ĐẶT HÀNG THÀNH CÔNG</span><h2>Cảm ơn bạn đã mua hàng!</h2><p>Mã đơn hàng</p><strong className="order-code">{completedOrder.orderNumber}</strong><div className="success-total"><span>Tổng thanh toán khi nhận hàng</span><b>{money(completedOrder.totalAmount)}</b></div><button className="checkout-button" onClick={() => { setCheckoutOpen(false); setCompletedOrder(null); setTab("home"); }}>Tiếp tục mua sắm</button></div> : <><span className="eyebrow">GIAO HÀNG TẬN NHÀ</span><h2>Thông tin nhận hàng</h2><p>Đơn hàng sẽ được tạo ở trạng thái chờ xác nhận. Thanh toán khi nhận hàng.</p><form className="checkout-form" onSubmit={submitOrder}><label>Họ và tên<input required minLength="2" maxLength="150" autoComplete="name" value={checkoutForm.fullName} onChange={(event) => setCheckoutForm({ ...checkoutForm, fullName: event.target.value })} placeholder="Nguyễn Văn An" /></label><label>Số điện thoại<input required type="tel" autoComplete="tel" pattern="(0|\+84)[35789][0-9]{8}" title="Nhập số di động Việt Nam hợp lệ, ví dụ 0912345678" value={checkoutForm.phone} onChange={(event) => setCheckoutForm({ ...checkoutForm, phone: event.target.value })} placeholder="0912 345 678" /></label><label>Địa chỉ giao hàng<textarea required minLength="5" maxLength="500" autoComplete="street-address" value={checkoutForm.address} onChange={(event) => setCheckoutForm({ ...checkoutForm, address: event.target.value })} placeholder="Số nhà, đường, phường/xã, quận/huyện" /></label><label>Ghi chú cho cửa hàng <span>(không bắt buộc)</span><textarea maxLength="500" value={checkoutForm.note} onChange={(event) => setCheckoutForm({ ...checkoutForm, note: event.target.value })} placeholder="Ví dụ: gọi trước khi giao" /></label>{orderError && <div className="order-error" role="alert">{orderError}</div>}<div className="checkout-submit-total"><span>{cartCount} sản phẩm · thanh toán khi nhận</span><b>{money(subtotal)}</b></div><button className="checkout-button" type="submit" disabled={orderSubmitting || cart.length === 0}>{orderSubmitting ? <><LoaderCircle className="spin" size={17} /> Đang gửi đơn...</> : <>Xác nhận đặt hàng <ArrowRight size={18} /></>}</button></form></>}</section></div>}
      {toast && <div className="shop-toast"><Check size={17} />{toast}</div>}
    </main>
  );
}
