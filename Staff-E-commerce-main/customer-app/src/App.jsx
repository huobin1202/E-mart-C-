import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:5099/api").replace(/\/$/, "");
const API_ORIGIN = API_URL.replace(/\/api$/, "");
const CART_KEY = "e-mart-mobile-cart";
const GREEN = "#126a43";
const DARK = "#1f3027";
const MUTED = "#78857c";

const imageUrl = (path) => !path ? null : path.startsWith("http") ? path : `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
const money = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value || 0);

async function readError(response) {
  const body = await response.json().catch(() => ({}));
  return body.message || body.title || "Không kết nối được cửa hàng. Hãy kiểm tra backend và địa chỉ API.";
}

function AppButton({ title, onPress, secondary = false, disabled = false, style }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled, style]}>
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{title}</Text>
    </Pressable>
  );
}

function ProductCard({ product, onAdd }) {
  const uri = imageUrl(product.imageUrl);
  return (
    <View style={styles.productCard}>
      <View style={styles.productImageBox}>
        {uri ? <Image source={{ uri }} style={styles.productImage} resizeMode="contain" /> : <Text style={styles.productEmoji}>🥬</Text>}
      </View>
      <Text style={styles.productCategory} numberOfLines={1}>{product.categoryName || "HÀNG TIÊU DÙNG"}</Text>
      <Text style={styles.productName} numberOfLines={2}>{product.productName}</Text>
      <Text style={styles.stockLabel}>●  Còn hàng</Text>
      <View style={styles.productFooter}>
        <Text style={styles.productPrice}>{money(product.price)}</Text>
        <Pressable accessibilityLabel={`Thêm ${product.productName} vào giỏ`} onPress={() => onAdd(product)} style={styles.addButton}><Text style={styles.addButtonText}>＋</Text></Pressable>
      </View>
    </View>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [tab, setTab] = useState("home");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ fullName: "", phone: "", address: "", note: "" });
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [completedOrder, setCompletedOrder] = useState(null);

  const loadStore = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [productsResponse, categoriesResponse] = await Promise.all([
        fetch(`${API_URL}/storefront/products`),
        fetch(`${API_URL}/storefront/categories`),
      ]);
      if (!productsResponse.ok) throw new Error(await readError(productsResponse));
      if (!categoriesResponse.ok) throw new Error(await readError(categoriesResponse));
      const [productData, categoryData] = await Promise.all([productsResponse.json(), categoriesResponse.json()]);
      setProducts(Array.isArray(productData) ? productData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
    } catch (error) {
      setLoadError(error.message || "Không thể tải sản phẩm.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStore(); }, [loadStore]);
  useEffect(() => {
    AsyncStorage.getItem(CART_KEY)
      .then((stored) => setCart(stored ? JSON.parse(stored) : []))
      .catch(() => setCart([]))
      .finally(() => setCartLoaded(true));
  }, []);
  useEffect(() => {
    if (cartLoaded) AsyncStorage.setItem(CART_KEY, JSON.stringify(cart)).catch(() => {});
  }, [cart, cartLoaded]);

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesSearch = product.productName?.toLowerCase().includes(query.trim().toLowerCase());
    const matchesCategory = categoryId === "all" || String(product.categoryId) === String(categoryId);
    return matchesSearch && matchesCategory;
  }), [products, query, categoryId]);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = (product) => {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id);
      if (found) return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { id: product.id, name: product.productName, price: product.price, image: product.imageUrl, quantity: 1 }];
    });
  };

  const changeQuantity = (id, amount) => setCart((current) => current
    .map((item) => item.id === id ? { ...item, quantity: item.quantity + amount } : item)
    .filter((item) => item.quantity > 0));

  const submitOrder = async () => {
    if (!checkoutForm.fullName.trim() || !checkoutForm.phone.trim() || !checkoutForm.address.trim()) {
      setOrderError("Nhập họ tên, số điện thoại và địa chỉ nhận hàng.");
      return;
    }
    if (!/^(0|\+84)[35789]\d{8}$/.test(checkoutForm.phone.trim())) {
      setOrderError("Số điện thoại Việt Nam chưa đúng định dạng.");
      return;
    }
    if (!cart.length) return;
    setOrderSubmitting(true);
    setOrderError("");
    try {
      const response = await fetch(`${API_URL}/storefront/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...checkoutForm,
          items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json();
      setCompletedOrder(result);
      setCart([]);
    } catch (error) {
      setOrderError(error.message || "Không thể gửi đơn hàng. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setOrderSubmitting(false);
    }
  };

  const renderHome = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>TƯƠI NGON MỖI NGÀY</Text>
        <Text style={styles.heroTitle}>Đi chợ tiện lợi,</Text>
        <Text style={styles.heroTitleAccent}>vui khỏe cả nhà.</Text>
        <Text style={styles.heroCaption}>Thực phẩm tươi ngon và hàng thiết yếu, giao tận cửa.</Text>
        <View style={styles.heroDecoration}><Text style={styles.heroBag}>🛍️</Text></View>
      </View>

      <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>KHÁM PHÁ</Text><Text style={styles.sectionTitle}>Mua theo danh mục</Text></View></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        <Pressable onPress={() => setCategoryId("all")} style={[styles.categoryChip, categoryId === "all" && styles.categoryChipActive]}><Text style={styles.categoryEmoji}>🛒</Text><Text style={styles.categoryName}>Tất cả</Text></Pressable>
        {categories.map((category, index) => <Pressable key={category.id} onPress={() => setCategoryId(String(category.id))} style={[styles.categoryChip, String(categoryId) === String(category.id) && styles.categoryChipActive]}><Text style={styles.categoryEmoji}>{["🥬", "🥩", "🥤", "🍞", "🧴", "🧹", "🍼"][index % 7]}</Text><Text style={styles.categoryName} numberOfLines={2}>{category.name}</Text></Pressable>)}
      </ScrollView>

      <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>{query ? "TÌM KIẾM" : "TƯƠI NGON, GIÁ TỐT"}</Text><Text style={styles.sectionTitle}>{query ? "Kết quả tìm kiếm" : "Sản phẩm đang có"}</Text></View><Pressable onPress={loadStore} style={styles.refreshButton}><Text style={styles.refreshText}>Làm mới</Text></Pressable></View>
      {loading ? <View style={styles.centerState}><ActivityIndicator size="large" color={GREEN} /><Text style={styles.stateText}>Đang tải sản phẩm...</Text></View> : loadError ? <View style={styles.errorCard}><Text style={styles.errorTitle}>Chưa kết nối được cửa hàng</Text><Text style={styles.errorText}>{loadError}</Text><Text style={styles.apiHint}>API: {API_URL}</Text><AppButton title="Thử kết nối lại" onPress={loadStore} /></View> : visibleProducts.length === 0 ? <View style={styles.emptyState}><Text style={styles.stateText}>Chưa có sản phẩm phù hợp.</Text></View> : <View style={styles.productGrid}>{visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} />)}</View>}
      <View style={{ height: 22 }} />
    </ScrollView>
  );

  const renderCart = () => (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.eyebrow}>GIỎ HÀNG CỦA BẠN</Text>
      <Text style={styles.pageTitle}>{itemCount} sản phẩm</Text>
      {!cart.length ? <View style={styles.emptyState}><Text style={styles.emptyEmoji}>🛍️</Text><Text style={styles.emptyTitle}>Giỏ hàng đang trống</Text><Text style={styles.stateText}>Chọn vài món ngon cho hôm nay nhé.</Text><AppButton title="Tiếp tục mua sắm" onPress={() => setTab("home")} style={styles.emptyCta} /></View> : <>
        {cart.map((item) => <View key={item.id} style={styles.cartRow}><View style={styles.cartThumb}>{imageUrl(item.image) ? <Image source={{ uri: imageUrl(item.image) }} style={styles.cartImage} resizeMode="contain" /> : <Text style={styles.productEmoji}>🥬</Text>}</View><View style={styles.cartInfo}><Text style={styles.cartName} numberOfLines={2}>{item.name}</Text><Text style={styles.cartPrice}>{money(item.price)}</Text><View style={styles.quantityControl}><Pressable onPress={() => changeQuantity(item.id, -1)} style={styles.quantityButton}><Text style={styles.quantityText}>−</Text></Pressable><Text style={styles.quantityValue}>{item.quantity}</Text><Pressable onPress={() => changeQuantity(item.id, 1)} style={styles.quantityButton}><Text style={styles.quantityText}>＋</Text></Pressable></View></View></View>)}
        <View style={styles.summaryCard}><View style={styles.summaryLine}><Text style={styles.summaryLabel}>Tạm tính</Text><Text style={styles.summaryValue}>{money(subtotal)}</Text></View><View style={styles.summaryLine}><Text style={styles.summaryLabel}>Thanh toán</Text><Text style={styles.freeShipping}>Khi nhận hàng</Text></View><View style={styles.summaryTotal}><Text style={styles.summaryTotalLabel}>Tổng cộng</Text><Text style={styles.summaryTotalValue}>{money(subtotal)}</Text></View><AppButton title="Tiến hành đặt hàng  →" onPress={() => { setOrderError(""); setCompletedOrder(null); setCheckoutOpen(true); }} /></View>
      </>}
    </ScrollView>
  );

  const renderOrders = () => (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.eyebrow}>LỊCH SỬ MUA SẮM</Text><Text style={styles.pageTitle}>Đơn hàng</Text>
      {completedOrder ? <View style={styles.orderCard}><Text style={styles.orderCheck}>✓</Text><Text style={styles.orderTitle}>Đơn hàng đang chờ xác nhận</Text><Text style={styles.orderCode}>{completedOrder.orderNumber}</Text><View style={styles.summaryLine}><Text style={styles.summaryLabel}>Tổng tiền</Text><Text style={styles.summaryValue}>{money(completedOrder.totalAmount)}</Text></View><Text style={styles.stateText}>Cửa hàng sẽ liên hệ với bạn để xác nhận đơn.</Text></View> : <View style={styles.emptyState}><Text style={styles.emptyEmoji}>📦</Text><Text style={styles.emptyTitle}>Chưa có đơn hàng</Text><Text style={styles.stateText}>Đơn bạn vừa đặt sẽ xuất hiện ở đây.</Text><AppButton title="Bắt đầu mua sắm" onPress={() => setTab("home")} style={styles.emptyCta} /></View>}
    </ScrollView>
  );

  const renderProfile = () => (
    <ScrollView contentContainerStyle={styles.pageContent}><Text style={styles.eyebrow}>E-MART</Text><Text style={styles.pageTitle}>Tài khoản</Text><View style={styles.profileCard}><Text style={styles.profileEmoji}>👋</Text><Text style={styles.emptyTitle}>Xin chào!</Text><Text style={styles.stateText}>Đặt hàng nhanh với thông tin nhận hàng của bạn.</Text></View><View style={styles.infoCard}><Text style={styles.infoTitle}>Hỗ trợ khách hàng</Text><Text style={styles.stateText}>Đơn hàng hiện thanh toán khi nhận hàng.</Text><Text style={styles.apiHint}>Đang kết nối: {API_URL}</Text></View></ScrollView>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.header}>
        <View style={styles.headerTop}><View style={styles.brandIcon}><Text style={styles.brandLetter}>e</Text></View><View><Text style={styles.brandName}>E-Mart</Text><Text style={styles.brandTagline}>ĐI CHỢ THẬT NHANH</Text></View><Pressable onPress={() => setTab("cart")} style={styles.headerCart}><Text style={styles.headerCartIcon}>🛒</Text>{itemCount > 0 && <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{itemCount}</Text></View>}</Pressable></View>
        <View style={styles.searchBar}><Text style={styles.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Tìm sản phẩm bạn cần..." placeholderTextColor="#929c95" style={styles.searchInput} returnKeyType="search" /></View>
        <View style={styles.promises}><Text style={styles.promiseText}>✓ Hàng chính hãng</Text><Text style={styles.promiseDot}>·</Text><Text style={styles.promiseText}>✓ Giao nhanh</Text></View>
      </View>

      <View style={styles.screen}>{tab === "home" ? renderHome() : tab === "cart" ? renderCart() : tab === "orders" ? renderOrders() : renderProfile()}</View>

      <View style={styles.bottomNav}>{[["home", "⌂", "Trang chủ"], ["orders", "▤", "Đơn hàng"], ["cart", "🛒", "Giỏ hàng"], ["profile", "○", "Tài khoản"]].map(([key, icon, label]) => <Pressable key={key} onPress={() => setTab(key)} style={styles.navItem}><Text style={[styles.navIcon, tab === key && styles.navActive]}>{icon}{key === "cart" && itemCount > 0 ? <Text style={styles.navBadge}> {itemCount}</Text> : null}</Text><Text style={[styles.navLabel, tab === key && styles.navActive]}>{label}</Text></Pressable>)}</View>

      <Modal visible={checkoutOpen} transparent animationType="slide" onRequestClose={() => !orderSubmitting && setCheckoutOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.checkoutSheet}>
            <View style={styles.sheetHandle} />
            {completedOrder ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.successContent}><Text style={styles.successIcon}>✓</Text><Text style={styles.eyebrow}>ĐẶT HÀNG THÀNH CÔNG</Text><Text style={styles.successTitle}>Cảm ơn bạn đã mua hàng!</Text><Text style={styles.inputLabel}>MÃ ĐƠN HÀNG</Text><Text selectable style={styles.successCode}>{completedOrder.orderNumber}</Text><View style={styles.summaryTotal}><Text style={styles.summaryTotalLabel}>Thanh toán khi nhận hàng</Text><Text style={styles.summaryTotalValue}>{money(completedOrder.totalAmount)}</Text></View><AppButton title="Xong" onPress={() => { setCheckoutOpen(false); setTab("orders"); }} /></ScrollView> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.checkoutContent}><Text style={styles.eyebrow}>GIAO HÀNG TẬN NHÀ</Text><Text style={styles.checkoutTitle}>Thông tin nhận hàng</Text><Text style={styles.checkoutDescription}>Thanh toán tiền mặt khi nhận hàng.</Text>
              <Text style={styles.inputLabel}>HỌ VÀ TÊN</Text><TextInput value={checkoutForm.fullName} onChangeText={(value) => setCheckoutForm((form) => ({ ...form, fullName: value }))} placeholder="Nguyễn Văn An" style={styles.formInput} maxLength={150} autoCapitalize="words" />
              <Text style={styles.inputLabel}>SỐ ĐIỆN THOẠI</Text><TextInput value={checkoutForm.phone} onChangeText={(value) => setCheckoutForm((form) => ({ ...form, phone: value }))} placeholder="0912345678" style={styles.formInput} keyboardType="phone-pad" maxLength={13} />
              <Text style={styles.inputLabel}>ĐỊA CHỈ GIAO HÀNG</Text><TextInput value={checkoutForm.address} onChangeText={(value) => setCheckoutForm((form) => ({ ...form, address: value }))} placeholder="Số nhà, đường, phường/xã, quận/huyện" style={[styles.formInput, styles.addressInput]} multiline maxLength={500} />
              <Text style={styles.inputLabel}>GHI CHÚ (KHÔNG BẮT BUỘC)</Text><TextInput value={checkoutForm.note} onChangeText={(value) => setCheckoutForm((form) => ({ ...form, note: value }))} placeholder="Ví dụ: gọi trước khi giao" style={[styles.formInput, styles.noteInput]} multiline maxLength={500} />
              {orderError ? <Text style={styles.orderError}>{orderError}</Text> : null}
              <View style={styles.checkoutTotal}><Text style={styles.summaryLabel}>{itemCount} sản phẩm · thanh toán khi nhận</Text><Text style={styles.summaryTotalValue}>{money(subtotal)}</Text></View>
              <AppButton title={orderSubmitting ? "Đang gửi đơn hàng..." : "Xác nhận đặt hàng"} disabled={orderSubmitting} onPress={submitOrder} />
              <Pressable disabled={orderSubmitting} onPress={() => setCheckoutOpen(false)} style={styles.cancelCheckout}><Text style={styles.cancelText}>Quay lại giỏ hàng</Text></Pressable>
            </ScrollView>}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f6f8f4" },
  header: { backgroundColor: "#fff", paddingHorizontal: 18, paddingTop: 7, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#edf0ec" },
  headerTop: { flexDirection: "row", alignItems: "center" },
  brandIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: GREEN, alignItems: "center", justifyContent: "center", marginRight: 9 },
  brandLetter: { color: "#fff", fontSize: 25, fontWeight: "900", fontStyle: "italic" },
  brandName: { color: GREEN, fontWeight: "900", fontSize: 20, letterSpacing: -0.7 },
  brandTagline: { color: "#8b978e", fontSize: 8, letterSpacing: 1.2, fontWeight: "800", marginTop: -1 },
  headerCart: { marginLeft: "auto", backgroundColor: "#f0f6ef", borderRadius: 12, width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  headerCartIcon: { fontSize: 20 },
  cartBadge: { position: "absolute", right: -4, top: -4, minWidth: 18, height: 18, borderRadius: 10, backgroundColor: "#dc5a42", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  cartBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  searchBar: { height: 44, backgroundColor: "#f4f6f2", borderRadius: 11, marginTop: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center" },
  searchIcon: { color: "#7f8a81", fontSize: 24, marginRight: 7 },
  searchInput: { flex: 1, color: DARK, fontSize: 13, paddingVertical: 0 },
  promises: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 9, gap: 9 },
  promiseText: { color: "#708077", fontSize: 10, fontWeight: "600" },
  promiseDot: { color: "#b6c0b8" },
  screen: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 20 },
  hero: { minHeight: 176, borderRadius: 18, backgroundColor: "#e8f2e5", padding: 19, overflow: "hidden", justifyContent: "center" },
  heroKicker: { color: "#57936e", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 8 },
  heroTitle: { color: "#193d2d", fontSize: 23, fontWeight: "900", letterSpacing: -0.7 },
  heroTitleAccent: { color: "#278455", fontSize: 23, fontWeight: "900", letterSpacing: -0.7 },
  heroCaption: { color: "#66776b", fontSize: 10, lineHeight: 15, maxWidth: "76%", marginTop: 8 },
  heroDecoration: { position: "absolute", right: 5, top: 34, width: 105, height: 105, borderRadius: 55, backgroundColor: "#d2e7bd", alignItems: "center", justifyContent: "center" },
  heroBag: { fontSize: 55 },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 23, marginBottom: 11 },
  eyebrow: { color: "#57936e", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  sectionTitle: { color: DARK, fontSize: 17, fontWeight: "900", marginTop: 3 },
  categoryRow: { gap: 8, paddingRight: 8 },
  categoryChip: { width: 83, height: 78, borderRadius: 12, backgroundColor: "#fff", borderColor: "#e9eee8", borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  categoryChipActive: { backgroundColor: "#eef7ef", borderColor: "#78aa88" },
  categoryEmoji: { fontSize: 23, marginBottom: 4 },
  categoryName: { color: "#59665e", fontSize: 9, fontWeight: "700", textAlign: "center" },
  refreshButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#eaf3e9" },
  refreshText: { color: GREEN, fontSize: 10, fontWeight: "800" },
  productGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  productCard: { width: "48.5%", backgroundColor: "#fff", borderColor: "#edf0ec", borderWidth: 1, borderRadius: 13, padding: 9 },
  productImageBox: { height: 123, borderRadius: 10, backgroundColor: "#f7f8f5", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 9 },
  productImage: { width: "90%", height: "90%" },
  productEmoji: { fontSize: 40 },
  productCategory: { color: "#839287", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  productName: { color: "#34463a", fontWeight: "800", fontSize: 12, lineHeight: 17, minHeight: 34, marginTop: 4 },
  stockLabel: { color: "#328259", fontSize: 9, marginTop: 5 },
  productFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  productPrice: { color: "#1e573b", fontSize: 12, fontWeight: "900", flexShrink: 1 },
  addButton: { width: 29, height: 29, borderRadius: 9, backgroundColor: "#eaf3ea", alignItems: "center", justifyContent: "center", marginLeft: 4 },
  addButtonText: { color: GREEN, fontSize: 22, lineHeight: 25, fontWeight: "600" },
  centerState: { minHeight: 170, alignItems: "center", justifyContent: "center" },
  stateText: { color: MUTED, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 7 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 55, paddingHorizontal: 18 },
  emptyEmoji: { fontSize: 51, marginBottom: 9 },
  emptyTitle: { color: DARK, fontSize: 16, fontWeight: "900", textAlign: "center" },
  emptyCta: { marginTop: 18, alignSelf: "stretch" },
  errorCard: { backgroundColor: "#fff", borderRadius: 13, padding: 17, borderWidth: 1, borderColor: "#f0dfda" },
  errorTitle: { color: "#a3443c", fontSize: 14, fontWeight: "900" },
  errorText: { color: "#785f5b", fontSize: 11, lineHeight: 17, marginTop: 6 },
  apiHint: { color: "#89948b", fontSize: 9, marginTop: 8 },
  button: { minHeight: 45, borderRadius: 10, backgroundColor: GREEN, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginTop: 13 },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  buttonSecondary: { backgroundColor: "#edf5ed" },
  buttonSecondaryText: { color: GREEN },
  buttonDisabled: { opacity: 0.65 },
  pageContent: { padding: 18, paddingBottom: 25 },
  pageTitle: { color: DARK, fontSize: 24, fontWeight: "900", marginTop: 4, marginBottom: 17 },
  cartRow: { flexDirection: "row", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 10, marginBottom: 9, borderWidth: 1, borderColor: "#edf0ec" },
  cartThumb: { width: 67, height: 67, backgroundColor: "#f5f7f3", borderRadius: 9, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  cartImage: { width: "90%", height: "90%" },
  cartInfo: { flex: 1, justifyContent: "center" },
  cartName: { color: "#435349", fontSize: 11, fontWeight: "800" },
  cartPrice: { color: GREEN, fontWeight: "900", fontSize: 12, marginTop: 4 },
  quantityControl: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 7 },
  quantityButton: { width: 25, height: 25, borderWidth: 1, borderColor: "#e2e9e1", borderRadius: 7, alignItems: "center", justifyContent: "center" },
  quantityText: { color: "#526157", fontSize: 16 },
  quantityValue: { color: DARK, fontSize: 11, fontWeight: "800" },
  summaryCard: { backgroundColor: "#fff", borderRadius: 13, padding: 15, marginTop: 10, borderWidth: 1, borderColor: "#edf0ec" },
  summaryLine: { flexDirection: "row", justifyContent: "space-between", marginVertical: 5 },
  summaryLabel: { color: MUTED, fontSize: 11 },
  summaryValue: { color: "#34463b", fontSize: 11, fontWeight: "800" },
  freeShipping: { color: "#258256", fontSize: 11, fontWeight: "800" },
  summaryTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#edf0ec", marginTop: 10, paddingTop: 13 },
  summaryTotalLabel: { color: DARK, fontSize: 12, fontWeight: "800" },
  summaryTotalValue: { color: "#176843", fontSize: 17, fontWeight: "900" },
  orderCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16, borderColor: "#e7eee6", borderWidth: 1 },
  orderCheck: { width: 34, height: 34, lineHeight: 34, borderRadius: 17, overflow: "hidden", textAlign: "center", color: GREEN, backgroundColor: "#e8f5eb", fontWeight: "900", fontSize: 19, marginBottom: 10 },
  orderTitle: { color: DARK, fontSize: 14, fontWeight: "900" },
  orderCode: { color: GREEN, fontSize: 13, fontWeight: "900", marginVertical: 12 },
  profileCard: { backgroundColor: "#e8f2e5", borderRadius: 15, alignItems: "center", padding: 20 },
  profileEmoji: { fontSize: 39, marginBottom: 8 },
  infoCard: { backgroundColor: "#fff", borderRadius: 13, padding: 16, marginTop: 13 },
  infoTitle: { color: DARK, fontSize: 13, fontWeight: "900" },
  bottomNav: { height: 62, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e9ede8", flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingBottom: 3 },
  navItem: { minWidth: 60, alignItems: "center", justifyContent: "center", gap: 2 },
  navIcon: { color: "#849087", fontSize: 20, fontWeight: "700", height: 24 },
  navLabel: { color: "#849087", fontSize: 9, fontWeight: "600" },
  navActive: { color: GREEN, fontWeight: "900" },
  navBadge: { color: "#fff", backgroundColor: "#dc5a42", overflow: "hidden", borderRadius: 8, fontSize: 9, fontWeight: "900" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#14221988" },
  checkoutSheet: { maxHeight: "92%", backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#d7ded7", alignSelf: "center", marginBottom: 15 },
  checkoutContent: { paddingBottom: 10 },
  checkoutTitle: { color: DARK, fontSize: 21, fontWeight: "900", marginTop: 4 },
  checkoutDescription: { color: MUTED, fontSize: 11, marginTop: 5, marginBottom: 14 },
  inputLabel: { color: "#536257", fontSize: 9, fontWeight: "900", letterSpacing: 0.7, marginTop: 12, marginBottom: 6 },
  formInput: { minHeight: 43, backgroundColor: "#fbfcfa", borderWidth: 1, borderColor: "#dfe7df", borderRadius: 9, paddingHorizontal: 11, color: DARK, fontSize: 12 },
  addressInput: { minHeight: 62, textAlignVertical: "top", paddingTop: 10 },
  noteInput: { minHeight: 48, textAlignVertical: "top", paddingTop: 9 },
  orderError: { color: "#a33e36", fontSize: 11, backgroundColor: "#fff1ef", borderRadius: 8, padding: 10, marginTop: 10 },
  checkoutTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#edf0ec", paddingTop: 13, marginTop: 15 },
  cancelCheckout: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: MUTED, fontSize: 11, fontWeight: "700" },
  successContent: { alignItems: "stretch", paddingBottom: 10 },
  successIcon: { width: 52, height: 52, lineHeight: 52, borderRadius: 26, overflow: "hidden", textAlign: "center", backgroundColor: "#e8f5eb", color: GREEN, fontSize: 27, fontWeight: "900", alignSelf: "center", marginBottom: 17 },
  successTitle: { color: DARK, fontSize: 20, fontWeight: "900", textAlign: "center", marginTop: 8, marginBottom: 18 },
  successCode: { color: GREEN, fontSize: 16, fontWeight: "900", textAlign: "center", padding: 12, backgroundColor: "#f2f7f1", borderRadius: 9 },
});
