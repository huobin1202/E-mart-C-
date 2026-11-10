import React from "react";
import Svg, { Path, Rect, Circle, G } from "react-native-svg";

export function IconMenu({ size = 22, color = "#ffffff" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 6h18M3 12h18M3 18h18" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

export function IconSearch({ size = 20, color = "#008848" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth="2.2" />
      <Path d="M20 20l-4-4" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

export function IconEye({ size = 22, color = "#64748b", crossedOut = false }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8" />
      {crossedOut && <Path d="M3 3l18 18" stroke={color} strokeWidth="2" strokeLinecap="round" />}
    </Svg>
  );
}

export function IconCart({ size = 22, color = "#ffffff" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 3h2l2.4 11.2a2 2 0 002 1.6h9.2a2 2 0 002-1.6L22 6H6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="9.5" cy="19.5" r="1.5" fill={color} />
      <Circle cx="17.5" cy="19.5" r="1.5" fill={color} />
    </Svg>
  );
}

export function IconLocation({ size = 16, color = "#ffd400" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z" fill={color} />
      <Circle cx="12" cy="9" r="2.5" fill="#008848" />
    </Svg>
  );
}

export function IconChevronRight({ size = 18, color = "#8898aa" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconChevronDown({ size = 16, color = "#ffffff" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconClose({ size = 18, color = "#666666" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M6 18L18 6" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

export function IconCloseCircle({ size = 20, color = "#ffffff" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
      <Path d="M15 9l-6 6M9 9l6 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function IconHome({ size = 22, color = "#008848", active = false }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 20v-9.5z"
        stroke={color}
        strokeWidth="2"
        fill={active ? color : "none"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M9 21v-7a1 1 0 011-1h4a1 1 0 011 1v7" stroke={active ? "#ffffff" : color} strokeWidth="1.8" />
    </Svg>
  );
}

export function IconCategoryGrid({ size = 22, color = "#64748b", active = false }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" fill={active ? color : "none"} />
      <Rect x="14" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" fill={active ? color : "none"} />
      <Rect x="3" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" fill={active ? color : "none"} />
      <Rect x="14" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" fill={active ? color : "none"} />
    </Svg>
  );
}

export function IconReceipt({ size = 22, color = "#64748b", active = false }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 3v18l3-2 3 2 3-2 3 2 2-2V3H5z"
        stroke={color}
        strokeWidth="2"
        fill={active ? color : "none"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M9 8h6M9 12h6M9 16h4" stroke={active ? "#ffffff" : color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function IconUser({ size = 22, color = "#64748b", active = false }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="7.5" r="4" stroke={color} strokeWidth="2" fill={active ? color : "none"} />
      <Path d="M4 20.5a8 8 0 0116 0" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function IconPlus({ size = 16, color = "#ffffff" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4v16M4 12h16" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );
}

export function IconMinus({ size = 16, color = "#008848" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12h16" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );
}

export function IconCheck({ size = 18, color = "#008848" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12.5l5.5 5.5L20 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconFlash({ size = 16, color = "#ffd400" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13 2L4 14h7v8l9-12h-7V2z" fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconShield({ size = 16, color = "#008848" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2l8 4v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V6l8-4z" stroke={color} strokeWidth="2" fill="#e8f5ec" />
      <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconStar({ size = 16, color = "#ffb300" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={color} />
    </Svg>
  );
}

export function IconFilter({ size = 18, color = "#008848" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 4h18l-7 8v7l-4 2v-9L3 4z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconSort({ size = 16, color = "#475569" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4v16M7 4L3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ==========================================
// BỘ ICON CHUYÊN NGHIỆP CÁC NGÀNH HÀNG SIÊU THỊ BÁCH HÓA XANH
// ==========================================

// 1. Thực phẩm tươi sống (Thịt, trứng, gia cầm)
export function CategoryFreshFood({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#ffebee" />
      {/* Miếng thịt bò Steak đỏ tươi với vân mỡ hoa cúc */}
      <Path d="M12 18c-3-2-2-7 2-8 5-1 12 0 15 4 3 4 1 10-2 13-4 3-10 2-13 0-3-2-3-7-2-9z" fill="#e53935" />
      <Path d="M15 15c2-2 6-1 7 1s-1 5-4 5c-2 0-3-3-3-6z" fill="#ffcdd2" opacity="0.8" />
      <Circle cx="17.5" cy="16.5" r="1.5" fill="#ffffff" />
    </Svg>
  );
}

// 2. Thủy hải sản (Tôm, cua, cá)
export function CategorySeafood({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#e1f5fe" />
      {/* Con cá bơi trong nước */}
      <Path d="M10 20c3-5 11-7 18-3 2 1 4 3 4 3s-2 2-4 3c-7 4-15 2-18-3z" fill="#0288d1" />
      <Path d="M28 20l5-4v8l-5-4z" fill="#0277bd" />
      <Circle cx="15" cy="18.5" r="1.5" fill="#ffffff" />
      <Path d="M20 17c1 2 1 4 0 6" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

// 3. Đồ uống & Giải khát (Bia, nước ngọt)
export function CategoryBeverage({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#e8f5e9" />
      {/* Lon nước giải khát & ly cocktail */}
      <Rect x="14" y="11" width="12" height="18" rx="3" fill="#2e7d32" />
      <Path d="M14 15h12M14 25h12" stroke="#ffffff" strokeWidth="1.2" opacity="0.6" />
      <Path d="M18 18c2-1 4 0 4 3s-2 4-4 3" stroke="#ffd54f" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

// 4. Bánh kẹo & Ăn vặt
export function CategorySnacks({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#fff8e1" />
      {/* Bánh cookie sô-cô-la */}
      <Circle cx="20" cy="20" r="10" fill="#f57c00" />
      <Circle cx="16" cy="17" r="1.5" fill="#5d4037" />
      <Circle cx="22" cy="16" r="1.8" fill="#5d4037" />
      <Circle cx="18" cy="23" r="1.5" fill="#5d4037" />
      <Circle cx="24" cy="22" r="1.2" fill="#5d4037" />
    </Svg>
  );
}

// 5. Gia vị & Dầu ăn
export function CategorySpices({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#fff3e0" />
      {/* Chai dầu ăn / nước sốt gia vị */}
      <Path d="M18 9h4v4l3 4v11a2 2 0 01-2 2h-6a2 2 0 01-2-2V17l3-4V9z" fill="#ef6c00" />
      <Rect x="18" y="7" width="4" height="3" rx="1" fill="#d84315" />
      <Rect x="16" y="20" width="8" height="6" rx="1" fill="#ffe082" />
    </Svg>
  );
}

// 6. Đồ gia dụng
export function CategoryHousehold({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#ede7f6" />
      {/* Nồi cơm / xoong chảo */}
      <Path d="M12 17h16v8a5 5 0 01-5 5h-6a5 5 0 01-5-5v-8z" fill="#5e35b1" />
      <Path d="M11 17c0-2 4-4 9-4s9 2 9 4H11z" fill="#7e57c2" />
      <Circle cx="20" cy="11.5" r="2" fill="#d1c4e9" />
      <Path d="M9 19h3M28 19h3" stroke="#5e35b1" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// 7. Mỹ phẩm & Chăm sóc cá nhân
export function CategoryCosmetics({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#fce4ec" />
      {/* Chai sữa tắm / kem dưỡng pump */}
      <Rect x="14" y="16" width="12" height="14" rx="3" fill="#d81b60" />
      <Rect x="18" y="13" width="4" height="3" fill="#ad1457" />
      <Path d="M16 11h6v2h-6zM16 11l-2 3" stroke="#ad1457" strokeWidth="1.6" strokeLinecap="round" />
      <Circle cx="20" cy="22" r="2.5" fill="#f8bbd0" />
    </Svg>
  );
}

// 8. Điện tử & Phụ kiện
export function CategoryElectronics({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#eceff1" />
      {/* Tai nghe over-ear / phụ kiện */}
      <Path d="M12 21a8 8 0 0116 0" stroke="#37474f" strokeWidth="2.5" strokeLinecap="round" />
      <Rect x="10" y="20" width="4" height="7" rx="2" fill="#00838f" />
      <Rect x="26" y="20" width="4" height="7" rx="2" fill="#00838f" />
    </Svg>
  );
}

// 9. Dược phẩm & Y tế
export function CategoryPharmacy({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#e0f2f1" />
      {/* Hộp thuốc y tế chữ thập xanh/đỏ */}
      <Rect x="10" y="14" width="20" height="16" rx="3" fill="#ffffff" stroke="#00897b" strokeWidth="1.5" />
      <Path d="M15 14v-2a2 2 0 012-2h6a2 2 0 012 2v2" stroke="#00897b" strokeWidth="1.5" />
      <Path d="M20 18v8M16 22h8" stroke="#e53935" strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );
}

// 10. Văn phòng phẩm & Giấy
export function CategoryStationery({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#f3e5f5" />
      {/* Cuốn sổ tay & bút */}
      <Rect x="12" y="10" width="16" height="20" rx="2" fill="#8e24aa" />
      <Path d="M15 10v20" stroke="#ffffff" strokeWidth="1.2" />
      <Path d="M18 16h6M18 20h6M18 24h4" stroke="#e1bee7" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

// Category chung: Tất cả
export function CategoryAll({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="12" fill="#008848" />
      <Path d="M11 13h18M11 20h18M11 27h18" stroke="#ffd400" strokeWidth="2.5" strokeLinecap="round" />
      <Circle cx="8" cy="13" r="1.5" fill="#ffffff" />
      <Circle cx="8" cy="20" r="1.5" fill="#ffffff" />
      <Circle cx="8" cy="27" r="1.5" fill="#ffffff" />
    </Svg>
  );
}

// Helper lấy icon cho nhóm con Sub-Category trong Menu Bách Hóa Xanh
export function getSubCategoryIcon(iconType, size = 32) {
  switch (iconType) {
    case "sanitary_pad":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#e0f2fe" />
          <Rect x="10" y="8" width="16" height="20" rx="4" fill="#38bdf8" />
          <Path d="M12 18h12M14 14h8M14 22h8" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        </Svg>
      );
    case "toothpaste":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#fee2e2" />
          <Path d="M13 26l3-14h4l3 14H13z" fill="#ef4444" />
          <Rect x="16" y="8" width="4" height="4" rx="1" fill="#ffffff" />
          <Path d="M15 17h6" stroke="#ffffff" strokeWidth="1.5" />
        </Svg>
      );
    case "shampoo":
    case "body_wash":
    case "conditioner":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#ecfdf5" />
          <Rect x="12" y="12" width="12" height="16" rx="3" fill="#10b981" />
          <Rect x="16" y="9" width="4" height="3" fill="#047857" />
          <Path d="M14 9h8" stroke="#047857" strokeWidth="1.5" strokeLinecap="round" />
          <Circle cx="18" cy="18" r="2.5" fill="#ffffff" />
        </Svg>
      );
    case "hand_soap":
    case "dishwashing":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#fef3c7" />
          <Rect x="12" y="14" width="12" height="14" rx="3" fill="#f59e0b" />
          <Path d="M18 14V9m0 0h-3m3 0h3" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" />
          <Path d="M15 20h6" stroke="#ffffff" strokeWidth="1.5" />
        </Svg>
      );
    case "toothbrush":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#f3e8ff" />
          <Path d="M22 8l-8 18" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M20 7l3 3M22 9l2 2" stroke="#6b21a8" strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );
    case "mouthwash":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#ccfbf1" />
          <Rect x="13" y="13" width="10" height="15" rx="2" fill="#0d9488" />
          <Rect x="15" y="9" width="6" height="4" fill="#115e59" />
          <Path d="M15 18h6" stroke="#ffffff" strokeWidth="1.5" />
        </Svg>
      );
    case "soap_bar":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#e0e7ff" />
          <Rect x="9" y="12" width="18" height="12" rx="4" fill="#6366f1" />
          <Circle cx="15" cy="18" r="1.5" fill="#ffffff" />
          <Circle cx="21" cy="18" r="1.5" fill="#ffffff" />
        </Svg>
      );
    case "toilet_paper":
    case "tissue":
    case "wet_wipes":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#f1f5f9" />
          <Circle cx="16" cy="18" r="7" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
          <Circle cx="16" cy="18" r="2.5" fill="#94a3b8" />
          <Path d="M16 25h9a3 3 0 003-3v-4" stroke="#94a3b8" strokeWidth="1.8" />
        </Svg>
      );
    case "beer":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#fef3c7" />
          <Rect x="13" y="9" width="10" height="18" rx="2" fill="#d97706" />
          <Path d="M13 14h10" stroke="#ffffff" strokeWidth="1.5" />
          <Path d="M15 18h6" stroke="#ffffff" strokeWidth="1" />
        </Svg>
      );
    case "soda":
    case "water":
    case "energy_drink":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#fee2e2" />
          <Rect x="13" y="10" width="10" height="17" rx="2" fill="#ef4444" />
          <Path d="M15 15h6M15 19h4" stroke="#ffffff" strokeWidth="1.5" />
        </Svg>
      );
    case "pork":
    case "beef":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#ffe4e6" />
          <Path d="M11 18c0-4 4-7 9-7s7 3 7 7-4 7-9 7-7-3-7-7z" fill="#e11d48" />
          <Circle cx="18" cy="18" r="3" fill="#ffffff" />
        </Svg>
      );
    case "veggies":
    case "fruits":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#dcfce7" />
          <Circle cx="18" cy="19" r="7" fill="#16a34a" />
          <Path d="M18 12c0-3 3-4 4-4" stroke="#15803d" strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );
    case "fish":
    case "salmon":
    case "shrimp":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#e0f2fe" />
          <Path d="M10 18c4-4 12-4 16 0-4 4-12 4-16 0z" fill="#0284c7" />
          <Circle cx="14" cy="18" r="1.5" fill="#ffffff" />
        </Svg>
      );
    case "cooking_oil":
    case "fish_sauce":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#fef9c3" />
          <Rect x="14" y="13" width="8" height="15" rx="2" fill="#ca8a04" />
          <Rect x="16" y="9" width="4" height="4" fill="#a16207" />
        </Svg>
      );
    case "rice":
    case "noodles":
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#fef08a" />
          <Path d="M10 20c0 5 3.5 8 8 8s8-3 8-8H10z" fill="#eab308" />
          <Path d="M13 16l10 4M15 14l8 4" stroke="#ca8a04" strokeWidth="1.5" strokeLinecap="round" />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <Rect width="36" height="36" rx="8" fill="#f1f5f9" />
          <Circle cx="18" cy="18" r="6" fill="#008848" />
          <Path d="M15 18h6" stroke="#ffffff" strokeWidth="1.5" />
        </Svg>
      );
  }
}

// Map helper lấy icon cho từng ngành hàng
export function getCategoryIcon(categoryName, size = 36) {
  const norm = (categoryName || "").toLowerCase();
  if (norm.includes("tươi sống") || norm.includes("thịt") || norm.includes("rau")) {
    return <CategoryFreshFood size={size} />;
  }
  if (norm.includes("thủy hải sản") || norm.includes("hải sản") || norm.includes("cá") || norm.includes("tôm")) {
    return <CategorySeafood size={size} />;
  }
  if (norm.includes("uống") || norm.includes("nước") || norm.includes("bia") || norm.includes("sữa")) {
    return <CategoryBeverage size={size} />;
  }
  if (norm.includes("bánh") || norm.includes("kẹo") || norm.includes("snack")) {
    return <CategorySnacks size={size} />;
  }
  if (norm.includes("gia vị") || norm.includes("dầu ăn") || norm.includes("mắm")) {
    return <CategorySpices size={size} />;
  }
  if (norm.includes("gia dụng") || norm.includes("bếp") || norm.includes("nhà cửa") || norm.includes("vệ sinh")) {
    return <CategoryHousehold size={size} />;
  }
  if (norm.includes("mỹ phẩm") || norm.includes("chăm sóc") || norm.includes("gội")) {
    return <CategoryCosmetics size={size} />;
  }
  if (norm.includes("điện tử") || norm.includes("phụ kiện") || norm.includes("sạc")) {
    return <CategoryElectronics size={size} />;
  }
  if (norm.includes("dược") || norm.includes("y tế") || norm.includes("thuốc")) {
    return <CategoryPharmacy size={size} />;
  }
  if (norm.includes("văn phòng") || norm.includes("giấy") || norm.includes("vở")) {
    return <CategoryStationery size={size} />;
  }
  return <CategorySnacks size={size} />;
}

