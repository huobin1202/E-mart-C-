import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
const defaultHost = typeof window !== "undefined" && window.location?.hostname
  ? `http://${window.location.hostname}:5099/api`
  : "http://10.0.2.2:5099/api";
const API_URL = (process.env.EXPO_PUBLIC_API_URL || defaultHost).replace(/\/$/, "");
const API_ORIGIN = API_URL.replace(/\/api$/, "");
const CART_KEY = "e-mart-mobile-cart";
const CUSTOMER_KEY = "e-mart-mobile-customer";
const CUSTOMER_TOKEN_KEY = "e-mart-mobile-customer-token";
const ADDRESS_KEY = "e-mart-mobile-delivery-address";
const GREEN = "#126a43";
const DARK = "#1f3027";
const MUTED = "#78857c";

const imageUrl = (path) => !path ? null : path.startsWith("http") ? path : `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
const money = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value || 0);

function ProductImage({ imagePath, productId, style }) {
  const candidates = [
    imageUrl(imagePath),
    productId ? `${API_ORIGIN}/assets/images/products/product-${productId}.jpg` : null,
    `${API_ORIGIN}/assets/images/products/default.jpg`,
  ].filter((uri, index, all) => uri && all.indexOf(uri) === index);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => setCandidateIndex(0), [imagePath, productId]);

  const uri = candidates[candidateIndex];
  if (!uri) return <Text style={styles.productEmoji}>🥬</Text>;

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="contain"
      onError={() => setCandidateIndex((index) => Math.min(index + 1, candidates.length))}
    />
  );
}

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
  return (
    <View style={styles.productCard}>
      <View style={styles.productImageBox}>
        <ProductImage imagePath={product.imageUrl} productId={product.id} style={styles.productImage} />
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
  const [customerOrders, setCustomerOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderFilter, setOrderFilter] = useState("all");
  const [customer, setCustomer] = useState(null);
  const [customerToken, setCustomerToken] = useState("");
  const [accountReady, setAccountReady] = useState(false);
  const [loginPhone, setLoginPhone] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [profilePage, setProfilePage] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState({ city: "", ward: "", street: "", otherReceiver: false });
  const [addressMessage, setAddressMessage] = useState("");
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherList, setVoucherList] = useState([]);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [voucherMessage, setVoucherMessage] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [useRewardPoints, setUseRewardPoints] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ADDRESS_KEY).then((stored) => {
      if (!stored) return;
      const address = JSON.parse(stored);
      setDeliveryAddress(address);
      setCheckoutForm((form) => ({ ...form, address: [address.street, address.ward, address.city].filter(Boolean).join(", ") }));
    }).catch(() => {});
  }, []);

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
    if (cartLoaded) AsyncStorage.setItem(CART_KEY, JSON.stringify(cart)).catch(() => { });
  }, [cart, cartLoaded]);
  useEffect(() => {
    let active = true;
    const restoreAccount = async () => {
      try {
        const values = await AsyncStorage.multiGet([CUSTOMER_TOKEN_KEY, CUSTOMER_KEY]);
        const token = values[0][1];
        const storedCustomer = values[1][1] ? JSON.parse(values[1][1]) : null;
        if (!token || !storedCustomer) return;

        const response = await fetch(`${API_URL}/storefront/account`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Phiên đăng nhập đã hết hạn.");
        const profile = await response.json();
        if (!active) return;
        setCustomer(profile);
        setCustomerToken(token);
        setAccountName(profile.fullName || "");
        setCheckoutForm((form) => ({ ...form, fullName: profile.fullName || "", phone: profile.phone || "" }));
      } catch {
        await AsyncStorage.multiRemove([CUSTOMER_TOKEN_KEY, CUSTOMER_KEY]).catch(() => { });
      } finally {
        if (active) setAccountReady(true);
      }
    };
    restoreAccount();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (tab !== "orders" || !customerToken) return undefined;
    let active = true;
    setOrdersLoading(true);
    setOrdersError("");
    fetch(`${API_URL}/storefront/orders`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json();
      })
      .then((data) => { if (active) setCustomerOrders(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) setOrdersError(error.message || "Không thể tải lịch sử đơn hàng."); })
      .finally(() => { if (active) setOrdersLoading(false); });
    return () => { active = false; };
  }, [tab, customerToken, ordersRefreshKey]);

  const loginWithPhone = async () => {
    const phone = loginPhone.trim();
    if (!/^(0|\+84)[35789]\d{8}$/.test(phone)) {
      setAccountError("Số điện thoại Việt Nam chưa đúng định dạng.");
      return;
    }

    setAccountBusy(true);
    setAccountError("");
    setAccountMessage("");
    try {
      const response = await fetch(`${API_URL}/storefront/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json();
      await AsyncStorage.multiSet([
        [CUSTOMER_TOKEN_KEY, result.token],
        [CUSTOMER_KEY, JSON.stringify(result.customer)],
      ]);
      setCustomerToken(result.token);
      setCustomer(result.customer);
      setAccountName(result.customer.fullName || "");
      setCheckoutForm((form) => ({ ...form, fullName: result.customer.fullName || "", phone: result.customer.phone }));
      setAccountMessage(result.customer.fullName ? "Đăng nhập thành công." : "Tài khoản đã tạo. Bạn có thể thêm họ tên bên dưới.");
    } catch (error) {
      setAccountError(error.message || "Không thể đăng nhập.");
    } finally {
      setAccountBusy(false);
    }
  };

  const saveAccountName = async () => {
    const fullName = accountName.trim();
    if (fullName.length < 2) {
      setAccountError("Họ tên cần có ít nhất 2 ký tự.");
      return;
    }

    setAccountBusy(true);
    setAccountError("");
    setAccountMessage("");
    try {
      const response = await fetch(`${API_URL}/storefront/account`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({ fullName }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const profile = await response.json();
      await AsyncStorage.setItem(CUSTOMER_KEY, JSON.stringify(profile));
      setCustomer(profile);
      setCheckoutForm((form) => ({ ...form, fullName: profile.fullName }));
      setAccountMessage("Đã cập nhật họ tên.");
    } catch (error) {
      setAccountError(error.message || "Không thể lưu thông tin tài khoản.");
    } finally {
      setAccountBusy(false);
    }
  };

  const saveDeliveryAddress = async () => {
    if (!deliveryAddress.city.trim() || !deliveryAddress.ward.trim() || !deliveryAddress.street.trim()) {
      setAddressMessage("Vui lòng nhập tỉnh/thành phố, phường/xã và số nhà, tên đường.");
      return;
    }
    const address = { ...deliveryAddress, city: deliveryAddress.city.trim(), ward: deliveryAddress.ward.trim(), street: deliveryAddress.street.trim() };
    await AsyncStorage.setItem(ADDRESS_KEY, JSON.stringify(address));
    setDeliveryAddress(address);
    setCheckoutForm((form) => ({ ...form, address: [address.street, address.ward, address.city].join(", ") }));
    setAddressMessage("Đã lưu địa chỉ nhận hàng.");
  };

  const logoutCustomer = () => {
    Alert.alert("Đăng xuất", "Bạn muốn đăng xuất khỏi tài khoản này?", [
      { text: "Ở lại", style: "cancel" },
      {
        text: "Đăng xuất",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.multiRemove([CUSTOMER_TOKEN_KEY, CUSTOMER_KEY]);
          setCustomer(null);
          setCustomerToken("");
          setAccountName("");
          setLoginPhone("");
          setAccountError("");
          setAccountMessage("");
          setCheckoutForm((form) => ({ ...form, fullName: "", phone: "" }));
        },
      },
    ]);
  };

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesSearch = product.productName?.toLowerCase().includes(query.trim().toLowerCase());
    const matchesCategory = categoryId === "all" || String(product.categoryId) === String(categoryId);
    return matchesSearch && matchesCategory;
  }), [products, query, categoryId]);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const voucherDiscount = appliedVoucher?.discountAmount || 0;
  const afterVoucher = Math.max(0, subtotal - voucherDiscount);
  const maxPointsUsable = Math.min(customer?.rewardPoints || 0, Math.floor(afterVoucher / 1000));
  const pointsDiscount = useRewardPoints ? maxPointsUsable * 1000 : 0;
  const payable = Math.max(0, afterVoucher - pointsDiscount);

  const openVouchers = async () => {
    setVoucherOpen(true);
    setVoucherMessage("");
    try {
      const response = await fetch(`${API_URL}/storefront/promotions`);
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setVoucherList(Array.isArray(data) ? data : []);
    } catch (error) {
      setVoucherMessage(error.message || "Không tải được phiếu mua hàng.");
    }
  };

  const applyVoucher = async (code = voucherCode) => {
    const normalizedCode = code.trim();
    if (!normalizedCode) { setVoucherMessage("Nhập mã phiếu mua hàng."); return; }
    setVoucherBusy(true);
    setVoucherMessage("");
    try {
      const response = await fetch(`${API_URL}/storefront/promotions/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode, orderAmount: subtotal }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.isValid) throw new Error(result.message || "Phiếu mua hàng không hợp lệ.");
      setAppliedVoucher({ code: normalizedCode, discountAmount: result.discountAmount, promotion: result.promotion });
      setVoucherCode(normalizedCode);
      setVoucherMessage(`Đã áp dụng ${money(result.discountAmount)} giảm giá.`);
      setVoucherOpen(false);
    } catch (error) {
      setAppliedVoucher(null);
      setVoucherMessage(error.message || "Không thể áp dụng phiếu mua hàng.");
    } finally {
      setVoucherBusy(false);
    }
  };

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
          fullName: customer?.fullName?.trim() || checkoutForm.fullName.trim(),
          phone: customer?.phone || checkoutForm.phone.trim(),
          paymentMethod,
          pointsUsed: useRewardPoints ? maxPointsUsable : 0,
          items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
          promotionCode: appliedVoucher?.code || null,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json();
      setCompletedOrder({
        ...result,
        paymentMethod,
        pointsDiscount,
        vietQrUrl: result.vietQrUrl || (paymentMethod === "bank" ? `https://img.vietqr.io/image/MB-0987654321-compact2.png?amount=${result.totalAmount}&addInfo=EMART_${result.orderNumber}&accountName=EMART%20STORE` : null)
      });
      if (customer && useRewardPoints && maxPointsUsable > 0) {
        setCustomer((prev) => prev ? ({ ...prev, rewardPoints: Math.max(0, (prev.rewardPoints || 0) - maxPointsUsable) }) : null);
      }
      const placedOrder = {
        ...result,
        paymentMethod,
        note: `Người nhận: ${customer?.fullName?.trim() || checkoutForm.fullName.trim()}\nSố điện thoại: ${customer?.phone || checkoutForm.phone.trim()}\nĐịa chỉ giao hàng: ${checkoutForm.address.trim()}${checkoutForm.note.trim() ? `\nGhi chú: ${checkoutForm.note.trim()}` : ""}`,
        paymentStatus: "pending",
        orderType: "mobile",
        items: cart.map((item) => ({
          productId: item.id,
          productName: item.name,
          imageUrl: item.image,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
        })),
      };
      setCustomerOrders((current) => [placedOrder, ...current.filter((order) => order.id !== placedOrder.id)]);
      setCart([]);
      setUseRewardPoints(false);
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
        {cart.map((item) => <View key={item.id} style={styles.cartRow}><View style={styles.cartThumb}><ProductImage imagePath={item.image} productId={item.id} style={styles.cartImage} /></View><View style={styles.cartInfo}><Text style={styles.cartName} numberOfLines={2}>{item.name}</Text><Text style={styles.cartPrice}>{money(item.price)}</Text><View style={styles.quantityControl}><Pressable onPress={() => changeQuantity(item.id, -1)} style={styles.quantityButton}><Text style={styles.quantityText}>−</Text></Pressable><Text style={styles.quantityValue}>{item.quantity}</Text><Pressable onPress={() => changeQuantity(item.id, 1)} style={styles.quantityButton}><Text style={styles.quantityText}>＋</Text></Pressable></View></View></View>)}
        <View style={styles.summaryCard}><View style={styles.summaryLine}><Text style={styles.summaryLabel}>Tạm tính</Text><Text style={styles.summaryValue}>{money(subtotal)}</Text></View><View style={styles.summaryLine}><Text style={styles.summaryLabel}>Thanh toán</Text><Text style={styles.freeShipping}>Khi nhận hàng</Text></View><Pressable style={styles.voucherRow} onPress={openVouchers}><Text style={styles.voucherLabel}>Phiếu mua hàng</Text><Text style={styles.voucherAction}>{appliedVoucher ? `-${money(appliedVoucher.discountAmount)} · Đổi` : "Sử dụng  ›"}</Text></Pressable>{appliedVoucher ? <Pressable onPress={() => setAppliedVoucher(null)}><Text style={styles.voucherRemove}>Bỏ phiếu mua hàng</Text></Pressable> : null}<View style={styles.summaryTotal}><Text style={styles.summaryTotalLabel}>Tổng cộng</Text><Text style={styles.summaryTotalValue}>{money(payable)}</Text></View><AppButton title="Tiến hành đặt hàng  →" onPress={() => { setOrderError(""); setCompletedOrder(null); setCheckoutOpen(true); }} /><AppButton title="Xóa hết sản phẩm" secondary onPress={() => Alert.alert("Xóa giỏ hàng", "Bạn có chắc muốn xóa tất cả sản phẩm khỏi giỏ hàng?", [{ text: "Hủy", style: "cancel" }, { text: "Xóa hết", style: "destructive", onPress: () => { setCart([]); setAppliedVoucher(null); } }])} /></View>
      </>}
    </ScrollView>
  );

  const orderStatusLabel = (status) => ({
    pending: "Chờ xác nhận",
    processing: "Đang giao",
    completed: "Giao thành công",
    cancelled: "Đã hủy",
    canceled: "Đã hủy",
  }[String(status || "").toLowerCase()] || status || "Đang cập nhật");

  const orderAddress = (order) => {
    const match = (order.note || "").match(/Địa chỉ giao hàng:\s*([\s\S]*?)(?:\nGhi chú:|$)/i);
    return match?.[1]?.trim() || "Nhận hàng tại cửa hàng";
  };

  const visibleOrders = customerOrders.filter((order) => {
    const status = String(order.status || "").toLowerCase();
    if (orderFilter === "store") return order.orderType === "pos";
    if (orderFilter === "pending") return status === "pending" || status === "processing";
    if (orderFilter === "completed") return status === "completed";
    if (orderFilter === "cancelled") return status === "cancelled" || status === "canceled";
    return true;
  });

  const renderOrders = () => {
    if (selectedOrder) {
      const orderItems = selectedOrder.items || [];
      const address = orderAddress(selectedOrder);
      const purchasedAt = selectedOrder.createdAt
        ? new Date(selectedOrder.createdAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
        : "";
      const paidAmount = String(selectedOrder.paymentStatus || "").toLowerCase() === "completed"
        ? selectedOrder.totalAmount
        : 0;

      return (
        <View style={styles.ordersScreen}>
          <View style={styles.orderDetailHeading}>
            <Pressable onPress={() => setSelectedOrder(null)} style={styles.orderBack}><Text style={styles.orderBackText}>‹</Text></Pressable>
            <Text style={styles.orderDetailTitle} numberOfLines={1}>Đơn hàng #{selectedOrder.orderNumber}</Text>
          </View>
          <ScrollView contentContainerStyle={styles.orderDetailContent}>
            <View style={styles.orderInfoCard}>
              <View style={styles.orderInfoTop}><Text style={styles.orderInfoLabel}>Địa chỉ nhận hàng</Text><Text style={styles.orderInfoDate}>Mua lúc: {purchasedAt}</Text></View>
              <Text style={styles.orderAddress}>{address}</Text>
              <Text style={styles.orderStatusText}>Trạng thái: {orderStatusLabel(selectedOrder.status)}</Text>
            </View>
            <View style={styles.orderItemsCard}>
              {orderItems.map((item, index) => (
                <View key={`${item.productId}-${index}`} style={styles.orderItemRow}>
                  <View style={styles.orderItemImageBox}><ProductImage imagePath={item.imageUrl} productId={item.productId} style={styles.orderItemImage} /></View>
                  <View style={styles.orderItemInfo}><Text style={styles.orderItemName}>{item.productName}</Text><Text style={styles.orderItemQuantity}>SL: {item.quantity}</Text></View>
                  <View style={styles.orderItemAmount}><Text style={styles.orderItemPrice}>{money(item.totalPrice ?? item.unitPrice * item.quantity)}</Text><Text style={styles.orderItemUnitPrice}>{money(item.unitPrice)}</Text></View>
                </View>
              ))}
              <View style={styles.orderTotals}>
                <View style={styles.summaryLine}><Text style={styles.summaryLabel}>Tổng đơn hàng</Text><Text style={styles.summaryValue}>{money(selectedOrder.totalAmount)}</Text></View>
                <View style={styles.summaryLine}><Text style={styles.summaryLabel}>{paidAmount > 0 ? "Đã thanh toán" : "Thanh toán khi nhận"}</Text><Text style={styles.summaryValue}>{money(paidAmount || selectedOrder.totalAmount)}</Text></View>
              </View>
            </View>
            <View style={styles.orderInfoCard}>
              <Text style={styles.orderInfoLabel}>Thông tin thanh toán</Text>
              <View style={styles.summaryLine}><Text style={styles.summaryLabel}>Phương thức</Text><Text style={styles.summaryValue}>{selectedOrder.paymentMethod || "Tiền mặt khi nhận hàng"}</Text></View>
              <View style={styles.summaryLine}><Text style={styles.summaryLabel}>Trạng thái thanh toán</Text><Text style={styles.summaryValue}>{paidAmount > 0 ? "Đã thanh toán" : "Chưa thanh toán"}</Text></View>
            </View>
          </ScrollView>
          <View style={styles.orderDetailActions}>
            <Pressable style={styles.orderActionSecondary} onPress={() => Alert.alert("Liên hệ", "Cửa hàng sẽ liên hệ với bạn để hỗ trợ đơn hàng.")}><Text style={styles.orderActionSecondaryText}>Liên hệ</Text></Pressable>
            <Pressable style={styles.orderActionPrimary} onPress={() => Alert.alert("Hóa đơn", `Đơn hàng ${selectedOrder.orderNumber}\nTổng tiền: ${money(selectedOrder.totalAmount)}`)}><Text style={styles.orderActionPrimaryText}>Xem hóa đơn</Text></Pressable>
          </View>
        </View>
      );
    }

    const filters = [["all", "Tất cả"], ["pending", "Chờ giao"], ["store", "Mua tại cửa hàng"], ["completed", "Giao thành công"], ["cancelled", "Đã hủy"]];
    return (
      <View style={styles.ordersScreen}>
        <Text style={styles.ordersTitle}>Đơn hàng từng mua</Text>
        <ScrollView horizontal style={styles.orderFilterScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.orderFilterRow}>
          {filters.map(([key, label]) => <Pressable key={key} onPress={() => setOrderFilter(key)} style={[styles.orderFilterChip, orderFilter === key && styles.orderFilterChipActive]}><Text style={[styles.orderFilterText, orderFilter === key && styles.orderFilterTextActive]}>{label}</Text></Pressable>)}
        </ScrollView>
        {ordersLoading ? <View style={styles.centerState}><ActivityIndicator color={GREEN} /><Text style={styles.stateText}>Đang tải đơn hàng...</Text></View> : ordersError ? <View style={styles.errorCard}><Text style={styles.errorText}>{ordersError}</Text><AppButton title="Thử lại" onPress={() => setOrdersRefreshKey((key) => key + 1)} /></View> : !customer && customerOrders.length === 0 ? <View style={styles.emptyState}><Text style={styles.emptyEmoji}>📦</Text><Text style={styles.emptyTitle}>Đăng nhập để xem đơn hàng</Text><Text style={styles.stateText}>Đơn hàng cũ được lưu theo số điện thoại của tài khoản.</Text><AppButton title="Đăng nhập" onPress={() => setTab("profile")} style={styles.emptyCta} /></View> : visibleOrders.length === 0 ? <View style={styles.emptyState}><Text style={styles.emptyEmoji}>📦</Text><Text style={styles.emptyTitle}>Chưa có đơn hàng</Text><Text style={styles.stateText}>Đơn đặt hàng sẽ xuất hiện ở đây.</Text><AppButton title="Bắt đầu mua sắm" onPress={() => setTab("home")} style={styles.emptyCta} /></View> : (
          <ScrollView contentContainerStyle={styles.orderListContent}>
            {visibleOrders.map((order) => {
              const items = order.items || [];
              return (
                <View key={order.id || order.orderNumber} style={styles.orderListCard}>
                  <View style={styles.orderListHeader}><Text style={styles.orderListNumber} numberOfLines={1}>Đơn hàng  #{order.orderNumber}</Text><Pressable onPress={() => setSelectedOrder(order)}><Text style={styles.orderViewLink}>Xem chi tiết  ›</Text></Pressable></View>
                  <View style={styles.orderPickup}><Text style={styles.orderPickupIcon}>⌂</Text><Text style={styles.orderPickupText} numberOfLines={1}>{orderAddress(order)}</Text></View>
                  <Pressable onPress={() => setSelectedOrder(order)} style={styles.orderThumbnailRow}>
                    {items.slice(0, 4).map((item, index) => <View key={`${item.productId}-${index}`} style={styles.orderThumbnailBox}><ProductImage imagePath={item.imageUrl} productId={item.productId} style={styles.orderThumbnail} />{index === 3 && items.length > 4 ? <View style={styles.orderMoreOverlay}><Text style={styles.orderMoreText}>+{items.length - 4}</Text></View> : null}</View>)}
                    {!items.length ? <Text style={styles.orderItemQuantity}>Không có sản phẩm</Text> : null}
                  </Pressable>
                  <View style={styles.orderListTotals}><Text style={styles.orderListStatus}>{orderStatusLabel(order.status)}</Text><Text style={styles.orderListTotal}>Tổng đơn hàng: {money(order.totalAmount)}</Text></View>
                  <View style={styles.orderListActions}><Pressable onPress={() => Alert.alert("Yêu cầu đổi trả", "Vui lòng liên hệ cửa hàng để được hỗ trợ đổi trả.")} style={styles.orderListAction}><Text style={styles.orderListActionText}>Yêu cầu đổi trả</Text></Pressable><Pressable onPress={() => setSelectedOrder(order)} style={styles.orderListAction}><Text style={styles.orderListActionText}>Liên hệ</Text></Pressable></View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  };

  const renderProfile = () => (
    <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      {profilePage ? <>
        <View style={styles.accountPageHeading}><Pressable style={styles.accountBackButton} onPress={() => { setProfilePage(""); setAccountError(""); setAccountMessage(""); setAddressMessage(""); }}><Text style={styles.accountBack}>‹</Text></Pressable><Text style={styles.accountPageTitle}>{profilePage === "personal" ? "Thông tin tài khoản" : "Địa chỉ nhận hàng"}</Text></View>
        {profilePage === "personal" ? <View style={styles.infoCard}>
          <TextInput value={accountName} onChangeText={setAccountName} placeholder="Họ và tên *" style={styles.accountInput} maxLength={150} autoCapitalize="words" />
          <Text style={[styles.accountInput, styles.phoneReadonly]}><Text style={styles.phoneHint}>Số điện thoại *</Text>{"\n"}{customer?.phone}</Text>
          {accountError ? <Text style={styles.orderError}>{accountError}</Text> : null}
          {accountMessage ? <Text style={styles.accountMessage}>{accountMessage}</Text> : null}
          <AppButton title={accountBusy ? "Đang lưu..." : "Lưu chỉnh sửa"} onPress={saveAccountName} disabled={accountBusy} />

        </View> : <View style={styles.infoCard}>
          <Pressable style={styles.locationButton} onPress={() => Alert.alert("Lấy vị trí hiện tại", "Tính năng định vị sẽ được bổ sung khi ứng dụng tích hợp quyền truy cập vị trí.")}><Text style={styles.locationButtonText}>◎ Lấy vị trí hiện tại</Text></Pressable>
          <TextInput value={deliveryAddress.city} onChangeText={(city) => setDeliveryAddress((a) => ({ ...a, city }))} placeholder="Tỉnh/Thành phố" style={styles.accountInput} />
          <TextInput value={deliveryAddress.ward} onChangeText={(ward) => setDeliveryAddress((a) => ({ ...a, ward }))} placeholder="Phường/Xã" style={styles.accountInput} />
          <TextInput value={deliveryAddress.street} onChangeText={(street) => setDeliveryAddress((a) => ({ ...a, street }))} placeholder="Số nhà, tên đường" style={styles.accountInput} />
          <Text style={styles.receiverLine}>Người nhận:  <Text style={styles.receiverPhone}>{customer?.phone}</Text></Text>
          <Pressable style={styles.receiverCheck} onPress={() => setDeliveryAddress((a) => ({ ...a, otherReceiver: !a.otherReceiver }))}><Text style={styles.checkBox}>{deliveryAddress.otherReceiver ? "☑" : "□"}</Text><Text style={styles.genderText}>Gọi người khác nhận hàng (nếu có)</Text></Pressable>
          {deliveryAddress.otherReceiver ? <TextInput placeholder="Tên và số điện thoại người nhận" style={styles.accountInput} /> : null}
          {addressMessage ? <Text style={styles.accountMessage}>{addressMessage}</Text> : null}
          <AppButton title="Lưu địa chỉ" onPress={saveDeliveryAddress} />
        </View>}
      </> : <>
      <Text style={styles.eyebrow}>E-MART</Text>
      <Text style={styles.pageTitle}>Tài khoản</Text>
      {!accountReady ? <View style={styles.centerState}><ActivityIndicator color={GREEN} /><Text style={styles.stateText}>Đang tải tài khoản...</Text></View> : customer ? <>
        <View style={styles.profileCard}>
          <Text style={styles.profileEmoji}>👋</Text>
          <Text style={styles.emptyTitle}>{customer.fullName || "Chào mừng bạn"}</Text>
          <Text style={styles.stateText}>{customer.phone}</Text>
          <View style={{ marginTop: 10, backgroundColor: "#eef7ef", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 14 }}>⭐</Text>
            <Text style={{ fontSize: 13, fontWeight: "800", color: GREEN }}>
              {customer.rewardPoints || 0} điểm thưởng
            </Text>
            <Text style={{ fontSize: 11, color: MUTED }}>
              (đổi được {money((customer.rewardPoints || 0) * 1000)})
            </Text>
          </View>
        </View>
        <View style={styles.infoCard}><Text style={styles.infoTitle}>Thông tin cá nhân</Text>
          <Pressable style={styles.profileMenuRow} onPress={() => { setAccountName(customer.fullName || ""); setProfilePage("personal"); }}><Text style={styles.profileMenuIcon}>♙</Text><Text style={styles.profileMenuText}>Sửa thông tin cá nhân</Text><Text style={styles.profileMenuArrow}>›</Text></Pressable>
          <Pressable style={styles.profileMenuRow} onPress={() => { setAddressMessage(""); setProfilePage("address"); }}><Text style={styles.profileMenuIcon}>♧</Text><Text style={styles.profileMenuText}>Địa chỉ nhận hàng</Text><Text style={styles.profileMenuArrow}>›</Text></Pressable>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Hỗ trợ khách hàng</Text>
          <Text style={styles.stateText}>Đơn hàng hiện thanh toán khi nhận hàng.</Text>
          <AppButton title="Đăng xuất" secondary onPress={logoutCustomer} />
        </View>
      </> : <>
        <View style={styles.profileCard}>
          <Text style={styles.profileEmoji}>📱</Text>
          <Text style={styles.emptyTitle}>Đăng nhập bằng số điện thoại</Text>
          <Text style={styles.stateText}>Lần đầu đăng nhập, chúng tôi sẽ tạo hồ sơ khách hàng để bạn bổ sung họ tên sau.</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.inputLabel}>SỐ ĐIỆN THOẠI</Text>
          <TextInput value={loginPhone} onChangeText={setLoginPhone} placeholder="0912345678" style={styles.formInput} keyboardType="phone-pad" maxLength={13} autoComplete="tel" />
          {accountError ? <Text style={styles.orderError}>{accountError}</Text> : null}
          <AppButton title={accountBusy ? "Đang đăng nhập..." : "Đăng nhập / Tạo tài khoản"} onPress={loginWithPhone} disabled={accountBusy} />
          {accountMessage ? <Text style={styles.accountMessage}>{accountMessage}</Text> : null}
        </View>
      </>}
      <View style={styles.infoCard}><Text style={styles.infoTitle}>Hỗ trợ khách hàng</Text><Text style={styles.stateText}>Đơn hàng hiện thanh toán khi nhận hàng.</Text></View>
      </>}
    </ScrollView>
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
            {completedOrder ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.successContent}>
                <Text style={styles.successIcon}>✓</Text>
                <Text style={styles.eyebrow}>ĐẶT HÀNG THÀNH CÔNG</Text>
                <Text style={styles.successTitle}>Cảm ơn bạn đã mua hàng!</Text>
                <Text style={styles.inputLabel}>MÃ ĐƠN HÀNG</Text>
                <Text selectable style={styles.successCode}>{completedOrder.orderNumber}</Text>

                {/* Khối thanh toán MoMo */}
                {completedOrder.paymentMethod === "momo" && (
                  <View style={{ marginTop: 14, padding: 14, borderRadius: 12, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffadd2", alignItems: "center" }}>
                    <Text style={{ fontSize: 14, fontWeight: "900", color: "#a50064", marginBottom: 6 }}>
                      🟣 Thanh toán qua Ví MoMo
                    </Text>
                    <Text style={{ fontSize: 11, color: "#595959", textAlign: "center", marginBottom: 12 }}>
                      Nhấn nút bên dưới để mở ứng dụng MoMo và thanh toán số tiền {money(completedOrder.totalAmount)}.
                    </Text>
                    {completedOrder.momoPayUrl ? (
                      <Pressable
                        onPress={() => Linking.openURL(completedOrder.momoPayUrl)}
                        style={{ backgroundColor: "#a50064", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, alignSelf: "stretch", alignItems: "center" }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>
                          Mở Ví MoMo để thanh toán ngay →
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={{ fontSize: 11, color: MUTED }}>Liên kết thanh toán MoMo đang được tạo...</Text>
                    )}
                  </View>
                )}

                {/* Khối quét mã VietQR */}
                {completedOrder.paymentMethod === "bank" && (
                  <View style={{ marginTop: 14, padding: 14, borderRadius: 12, backgroundColor: "#f0f5ff", borderWidth: 1, borderColor: "#adc6ff", alignItems: "center" }}>
                    <Text style={{ fontSize: 14, fontWeight: "900", color: "#1d39c4", marginBottom: 6 }}>
                      🏦 Quét mã QR chuyển khoản ngân hàng
                    </Text>
                    <Text style={{ fontSize: 11, color: "#595959", textAlign: "center", marginBottom: 10 }}>
                      Dùng app ngân hàng bất kỳ để quét mã VietQR chuyển khoản nhanh:
                    </Text>
                    {completedOrder.vietQrUrl && (
                      <Image
                        source={{ uri: completedOrder.vietQrUrl }}
                        style={{ width: 210, height: 210, borderRadius: 10, marginVertical: 6, backgroundColor: "#fff" }}
                        resizeMode="contain"
                      />
                    )}
                    <View style={{ width: "100%", backgroundColor: "#fff", padding: 10, borderRadius: 8, marginTop: 8 }}>
                      <Text style={{ fontSize: 11, color: DARK }}>• Ngân hàng: <Text style={{ fontWeight: "700" }}>MBBank (Quân Đội)</Text></Text>
                      <Text style={{ fontSize: 11, color: DARK }}>• STK: <Text style={{ fontWeight: "700" }}>0987654321</Text></Text>
                      <Text style={{ fontSize: 11, color: DARK }}>• Chủ TK: <Text style={{ fontWeight: "700" }}>EMART STORE</Text></Text>
                      <Text style={{ fontSize: 11, color: DARK }}>• Số tiền: <Text style={{ fontWeight: "700", color: "#1d39c4" }}>{money(completedOrder.totalAmount)}</Text></Text>
                      <Text style={{ fontSize: 11, color: DARK }}>• Nội dung: <Text style={{ fontWeight: "700", color: "#d4380d" }}>EMART_{completedOrder.orderNumber}</Text></Text>
                    </View>
                  </View>
                )}

                <View style={[styles.summaryTotal, { marginTop: 14 }]}>
                  <Text style={styles.summaryTotalLabel}>
                    {completedOrder.paymentMethod === "cod" ? "Thanh toán khi nhận hàng" : "Tổng tiền đơn hàng"}
                  </Text>
                  <Text style={styles.summaryTotalValue}>{money(completedOrder.totalAmount)}</Text>
                </View>
                <AppButton title="Xong" onPress={() => { setCheckoutOpen(false); setTab("orders"); }} />
              </ScrollView>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.checkoutContent}>
                <Text style={styles.eyebrow}>GIAO HÀNG TẬN NHÀ</Text>
                <Text style={styles.checkoutTitle}>Thông tin đặt hàng</Text>
                <Text style={styles.checkoutDescription}>Chọn phương thức thanh toán thuận tiện nhất cho bạn.</Text>
                <Text style={styles.inputLabel}>HỌ VÀ TÊN</Text>
                <TextInput value={customer?.fullName || checkoutForm.fullName} onChangeText={(value) => setCheckoutForm((form) => ({ ...form, fullName: value }))} placeholder="Nguyễn Văn An" style={styles.formInput} maxLength={150} autoCapitalize="words" editable={!customer?.fullName} />
                <Text style={styles.inputLabel}>SỐ ĐIỆN THOẠI</Text>
                <TextInput value={customer?.phone || checkoutForm.phone} onChangeText={(value) => setCheckoutForm((form) => ({ ...form, phone: value }))} placeholder="0912345678" style={styles.formInput} keyboardType="phone-pad" maxLength={13} editable={!customer} />
                <Text style={styles.inputLabel}>ĐỊA CHỈ GIAO HÀNG</Text>
                <TextInput value={checkoutForm.address} onChangeText={(value) => setCheckoutForm((form) => ({ ...form, address: value }))} placeholder="Số nhà, đường, phường/xã, quận/huyện" style={[styles.formInput, styles.addressInput]} multiline maxLength={500} />
                <Text style={styles.inputLabel}>GHI CHÚ (KHÔNG BẮT BUỘC)</Text>
                <TextInput value={checkoutForm.note} onChangeText={(value) => setCheckoutForm((form) => ({ ...form, note: value }))} placeholder="Ví dụ: gọi trước khi giao" style={[styles.formInput, styles.noteInput]} multiline maxLength={500} />

                {/* Lựa chọn phương thức thanh toán */}
                <Text style={styles.inputLabel}>PHƯƠNG THỨC THANH TOÁN</Text>
                <View style={{ gap: 8, marginTop: 4, marginBottom: 8 }}>
                  {[
                    { key: "cod", icon: "💵", label: "Tiền mặt khi nhận (COD)", desc: "Nhận hàng rồi thanh toán tiền mặt" },
                    { key: "momo", icon: "🟣", label: "Ví điện tử MoMo", desc: "Thanh toán online qua ví MoMo" },
                    { key: "bank", icon: "🏦", label: "Chuyển khoản QR ngân hàng", desc: "Quét mã VietQR chuyển khoản nhanh" },
                  ].map((m) => (
                    <Pressable
                      key={m.key}
                      onPress={() => setPaymentMethod(m.key)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: paymentMethod === m.key ? GREEN : "#e6ebe5",
                        backgroundColor: paymentMethod === m.key ? "#f0f8f2" : "#fff",
                      }}
                    >
                      <Text style={{ fontSize: 20, marginRight: 10 }}>{m.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: paymentMethod === m.key ? GREEN : DARK }}>
                          {m.label}
                        </Text>
                        <Text style={{ fontSize: 10, color: MUTED }}>{m.desc}</Text>
                      </View>
                      <View style={{
                        width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                        borderColor: paymentMethod === m.key ? GREEN : "#c7d1c6",
                        alignItems: "center", justifyContent: "center"
                      }}>
                        {paymentMethod === m.key ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} /> : null}
                      </View>
                    </Pressable>
                  ))}
                </View>

                {/* Điểm thưởng khách hàng */}
                {customer && (customer.rewardPoints || 0) > 0 && maxPointsUsable > 0 && (
                  <Pressable
                    onPress={() => setUseRewardPoints(!useRewardPoints)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: useRewardPoints ? "#e0a133" : "#e6ebe5",
                      backgroundColor: useRewardPoints ? "#fff9ed" : "#fafcfa",
                      marginTop: 6,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ fontSize: 18, marginRight: 8 }}>⭐</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: "#8a5814" }}>
                        Dùng {maxPointsUsable} điểm thưởng (-{money(maxPointsUsable * 1000)})
                      </Text>
                      <Text style={{ fontSize: 10, color: MUTED }}>
                        Bạn có {customer.rewardPoints} điểm tích lũy (1 điểm = 1.000đ)
                      </Text>
                    </View>
                    <Text style={{ fontSize: 18, color: useRewardPoints ? "#d48806" : "#a1aba3" }}>
                      {useRewardPoints ? "☑" : "□"}
                    </Text>
                  </Pressable>
                )}

                {orderError ? <Text style={styles.orderError}>{orderError}</Text> : null}
                <View style={styles.checkoutTotal}>
                  <Text style={styles.summaryLabel}>
                    {itemCount} sản phẩm{useRewardPoints ? ` · giảm ${money(pointsDiscount)} điểm` : ""}
                  </Text>
                  <Text style={styles.summaryTotalValue}>{money(payable)}</Text>
                </View>
                <AppButton title={orderSubmitting ? "Đang gửi đơn hàng..." : "Xác nhận đặt hàng"} disabled={orderSubmitting} onPress={submitOrder} />
                <Pressable disabled={orderSubmitting} onPress={() => setCheckoutOpen(false)} style={styles.cancelCheckout}>
                  <Text style={styles.cancelText}>Quay lại giỏ hàng</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={voucherOpen} transparent animationType="slide" onRequestClose={() => setVoucherOpen(false)}>
        <View style={styles.voucherBackdrop}>
          <View style={styles.voucherSheet}>
            <View style={styles.voucherHeading}><Text style={styles.voucherTitle}>Phiếu mua hàng</Text><Pressable style={styles.voucherCloseButton} onPress={() => setVoucherOpen(false)}><Text style={styles.voucherClose}>×</Text></Pressable></View>
            <View style={styles.voucherCodeRow}><TextInput value={voucherCode} onChangeText={setVoucherCode} placeholder="Nhập mã phiếu" autoCapitalize="characters" style={styles.voucherInput} /><Pressable disabled={voucherBusy} onPress={() => applyVoucher()} style={[styles.voucherAdd, voucherBusy && styles.buttonDisabled]}><Text style={styles.voucherAddText}>{voucherBusy ? "..." : "Thêm"}</Text></Pressable></View>
            <Text style={styles.voucherSubheading}>Phiếu mua hàng khả dụng</Text>
            <ScrollView style={styles.voucherList} keyboardShouldPersistTaps="handled">
              {voucherList.map((voucher) => <View key={voucher.id} style={styles.voucherCard}><View style={styles.voucherCardTop}><View style={styles.voucherBadge}><Text style={styles.voucherBadgeText}>{voucher.discountType === "percent" ? `${voucher.value}%` : money(voucher.value)}</Text></View><View style={styles.voucherInfo}><Text style={styles.voucherName}>{voucher.name || "Phiếu mua hàng"}</Text><Text style={styles.voucherExpiry}>{voucher.code}{voucher.endDate ? ` · Hạn ${new Date(voucher.endDate).toLocaleDateString("vi-VN")}` : ""}</Text></View><Pressable onPress={() => applyVoucher(voucher.code)}><Text style={styles.voucherUse}>Dùng</Text></Pressable></View>{voucher.description ? <Text style={styles.voucherDescription}>{voucher.description}</Text> : null}{voucher.minOrderAmount > 0 ? <Text style={styles.voucherExpiry}>Đơn tối thiểu {money(voucher.minOrderAmount)}</Text> : null}</View>)}
              {!voucherList.length && !voucherMessage ? <View style={styles.centerState}><Text style={styles.stateText}>Chưa có phiếu mua hàng khả dụng.</Text></View> : null}
              {voucherMessage ? <Text style={styles.voucherMessage}>{voucherMessage}</Text> : null}
            </ScrollView>
            <AppButton title={appliedVoucher ? `Đang dùng · giảm ${money(appliedVoucher.discountAmount)}` : "Chọn phiếu mua hàng"} disabled={!appliedVoucher} onPress={() => setVoucherOpen(false)} />
          </View>
        </View>
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
  ordersScreen: { flex: 1, backgroundColor: "#f4f4f4" },
  ordersTitle: { color: DARK, fontSize: 20, fontWeight: "900", textAlign: "center", paddingVertical: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  orderFilterScroll: { height: 48, flexGrow: 0, flexShrink: 0 },
  orderFilterRow: { paddingHorizontal: 14, alignItems: "center", gap: 8 },
  orderFilterChip: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 24, backgroundColor: "#e4eaf7" },
  orderFilterChipActive: { backgroundColor: "#328656" },
  orderFilterText: { color: "#344054", fontSize: 12, fontWeight: "600" },
  orderFilterTextActive: { color: "#fff" },
  orderListContent: { padding: 14, paddingTop: 4, paddingBottom: 20 },
  orderListCard: { backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 12 },
  orderListHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 },
  orderListNumber: { flex: 1, color: DARK, fontSize: 14, fontWeight: "900" },
  orderViewLink: { color: "#344054", fontSize: 12, fontWeight: "700" },
  orderPickup: { flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 9, backgroundColor: "#f0f3fa", padding: 10 },
  orderPickupIcon: { color: "#78857c", fontSize: 17 },
  orderPickupText: { flex: 1, color: "#586273", fontSize: 12, fontWeight: "600" },
  orderThumbnailRow: { flexDirection: "row", gap: 8, paddingVertical: 13, minHeight: 83, alignItems: "center" },
  orderThumbnailBox: { width: 57, height: 68, borderRadius: 7, backgroundColor: "#f7f8f5", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  orderThumbnail: { width: "90%", height: "90%" },
  orderMoreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "#17202b99", alignItems: "center", justifyContent: "center" },
  orderMoreText: { color: "#fff", fontSize: 17, fontWeight: "900" },
  orderListTotals: { borderTopWidth: 1, borderTopColor: "#edf0ec", paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 },
  orderListStatus: { color: GREEN, fontSize: 11, fontWeight: "800", flexShrink: 1 },
  orderListTotal: { color: DARK, fontSize: 13, fontWeight: "700" },
  orderListActions: { flexDirection: "row", marginHorizontal: -12, marginTop: 12, borderTopWidth: 1, borderTopColor: "#edf0ec" },
  orderListAction: { flex: 1, alignItems: "center", paddingVertical: 12 },
  orderListActionText: { color: DARK, fontSize: 12, fontWeight: "800" },
  orderDetailHeading: { minHeight: 52, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: "#edf0ec" },
  orderBack: { position: "absolute", left: 13, height: 44, justifyContent: "center", paddingHorizontal: 5 },
  orderBackText: { color: DARK, fontSize: 34, lineHeight: 38 },
  orderDetailTitle: { color: DARK, fontSize: 15, fontWeight: "900", maxWidth: "82%" },
  orderDetailContent: { padding: 14, paddingBottom: 20 },
  orderInfoCard: { backgroundColor: "#fff", borderRadius: 13, padding: 15, marginBottom: 12 },
  orderInfoTop: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  orderInfoLabel: { color: "#59636f", fontSize: 13, fontWeight: "900" },
  orderInfoDate: { color: "#67717d", fontSize: 10, textAlign: "right" },
  orderAddress: { color: DARK, fontSize: 14, lineHeight: 20 },
  orderStatusText: { color: GREEN, fontSize: 11, fontWeight: "800", marginTop: 10 },
  orderItemsCard: { backgroundColor: "#fff", borderRadius: 13, paddingHorizontal: 12, paddingTop: 5, paddingBottom: 12, marginBottom: 12 },
  orderItemRow: { flexDirection: "row", alignItems: "center", minHeight: 92, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#edf0ec", gap: 10 },
  orderItemImageBox: { width: 65, height: 72, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: 7, overflow: "hidden" },
  orderItemImage: { width: "90%", height: "90%" },
  orderItemInfo: { flex: 1 },
  orderItemName: { color: "#344054", fontSize: 12, lineHeight: 18 },
  orderItemQuantity: { color: "#8b95a1", fontSize: 11, marginTop: 5 },
  orderItemAmount: { alignItems: "flex-end", maxWidth: 100 },
  orderItemPrice: { color: DARK, fontSize: 13, fontWeight: "900" },
  orderItemUnitPrice: { color: "#9aa2ad", fontSize: 10, marginTop: 5, textDecorationLine: "line-through" },
  orderTotals: { paddingTop: 10 },
  orderDetailActions: { flexDirection: "row", backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderTopWidth: 1, borderTopColor: "#e8ebe8" },
  orderActionSecondary: { flex: 1, minHeight: 45, borderRadius: 10, borderWidth: 1, borderColor: "#cfd7d0", alignItems: "center", justifyContent: "center" },
  orderActionSecondaryText: { color: "#56615a", fontSize: 13, fontWeight: "700" },
  orderActionPrimary: { flex: 1.3, minHeight: 45, borderRadius: 10, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
  orderActionPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
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
  voucherRow: { minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#edf0ec", marginTop: 8, paddingTop: 7 },
  voucherLabel: { color: "#344054", fontSize: 13, fontWeight: "700" },
  voucherAction: { color: "#83909c", fontSize: 12 },
  voucherRemove: { color: "#b0443c", fontSize: 11, textAlign: "right", marginBottom: 5 },
  voucherBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#14221966" },
  voucherSheet: { height: "78%", backgroundColor: "#f8faff", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingBottom: 14 },
  voucherHeading: { height: 62, marginHorizontal: -16, paddingHorizontal: 20, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e7eaf0", borderTopLeftRadius: 22, borderTopRightRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  voucherTitle: { color: DARK, fontSize: 18, fontWeight: "900" },
  voucherCloseButton: { position: "absolute", right: 18, top: 15 },
  voucherClose: { color: "#fff", backgroundColor: "#9da8ba", overflow: "hidden", borderRadius: 20, width: 30, height: 30, textAlign: "center", lineHeight: 28, fontSize: 25 },
  voucherCodeRow: { flexDirection: "row", gap: 9, marginTop: 14, marginBottom: 14 },
  voucherInput: { flex: 1, minHeight: 48, backgroundColor: "#fff", borderColor: "#dce3e9", borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, color: DARK, fontSize: 14 },
  voucherAdd: { width: 86, borderRadius: 10, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
  voucherAddText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  voucherSubheading: { color: "#59636f", fontSize: 13, fontWeight: "800", marginBottom: 8 },
  voucherList: { flex: 1 },
  voucherCard: { backgroundColor: "#fff", borderRadius: 12, borderColor: "#e2e8ef", borderWidth: 1, padding: 12, marginBottom: 9 },
  voucherCardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  voucherBadge: { minWidth: 58, minHeight: 45, paddingHorizontal: 5, borderRadius: 7, backgroundColor: "#e9edf5", alignItems: "center", justifyContent: "center" },
  voucherBadgeText: { color: "#49576a", fontWeight: "900", fontSize: 13 },
  voucherInfo: { flex: 1 },
  voucherName: { color: "#303b4b", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  voucherExpiry: { color: "#8b95a1", fontSize: 11, marginTop: 4 },
  voucherUse: { color: "#25976c", fontSize: 12, fontWeight: "900" },
  voucherDescription: { color: "#d58b3d", fontSize: 11, lineHeight: 16, marginTop: 8 },
  voucherMessage: { color: "#b0443c", fontSize: 12, marginVertical: 8 },
  accountPageHeading: { minHeight: 54, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, marginBottom: 10, position: "relative" },
  accountBackButton: { position: "absolute", left: 7, top: 5, zIndex: 1, width: 42, height: 44, justifyContent: "center" },
  accountBack: { color: DARK, fontSize: 34, lineHeight: 40 },
  accountPageTitle: { color: DARK, fontSize: 17, fontWeight: "900" },
  profileMenuRow: { minHeight: 55, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#edf0ec", marginTop: 12, paddingTop: 7 },
  profileMenuIcon: { width: 35, color: "#78857c", fontSize: 21 },
  profileMenuText: { flex: 1, color: "#29352f", fontSize: 14 },
  profileMenuArrow: { color: "#111", fontSize: 29, fontWeight: "700" },
  genderText: { color: "#293443", fontSize: 16 },
  accountInput: { minHeight: 53, borderWidth: 1, borderColor: "#dce3e9", borderRadius: 10, paddingHorizontal: 14, color: DARK, fontSize: 16, marginBottom: 12, justifyContent: "center" },
  phoneReadonly: { backgroundColor: "#e5eaf6", borderColor: "#e5eaf6", paddingTop: 8, fontSize: 16 },
  phoneHint: { color: "#98a0ac", fontSize: 12 },
  deleteHint: { color: "#293443", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 22 },
  deleteLink: { color: "#c44343", textDecorationLine: "underline", fontSize: 16, textAlign: "center", marginTop: 12, marginBottom: 5 },
  locationButton: { minHeight: 48, borderWidth: 1, borderColor: "#e1e5e1", borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  locationButtonText: { color: GREEN, fontSize: 16, fontWeight: "800" },
  receiverLine: { color: "#293443", fontSize: 15, marginTop: 5, marginBottom: 10 },
  receiverPhone: { fontWeight: "900" },
  receiverCheck: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 9 },
  checkBox: { color: "#75808c", fontSize: 21 },
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
  accountMessage: { color: GREEN, fontSize: 11, marginTop: 10, textAlign: "center" },
  checkoutTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#edf0ec", paddingTop: 13, marginTop: 15 },
  cancelCheckout: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: MUTED, fontSize: 11, fontWeight: "700" },
  successContent: { alignItems: "stretch", paddingBottom: 10 },
  successIcon: { width: 52, height: 52, lineHeight: 52, borderRadius: 26, overflow: "hidden", textAlign: "center", backgroundColor: "#e8f5eb", color: GREEN, fontSize: 27, fontWeight: "900", alignSelf: "center", marginBottom: 17 },
  successTitle: { color: DARK, fontSize: 20, fontWeight: "900", textAlign: "center", marginTop: 8, marginBottom: 18 },
  successCode: { color: GREEN, fontSize: 16, fontWeight: "900", textAlign: "center", padding: 12, backgroundColor: "#f2f7f1", borderRadius: 9 },
});
