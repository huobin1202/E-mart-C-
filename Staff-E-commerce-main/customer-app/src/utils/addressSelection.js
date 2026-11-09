export function normalizeAddressSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d").toLowerCase().trim().replace(/\s+/g, " ");
}

function unitName(value) {
  return normalizeAddressSearch(value).replace(/^(thanh pho|tinh|phuong|xa|dac khu|tp\.?)\s+/, "");
}

export function findAddressUnit(units, name) {
  if (!name?.trim()) return null;
  const exact = units.find(unit => normalizeAddressSearch(unit.name) === normalizeAddressSearch(name));
  if (exact) return exact;
  const normalized = unitName(name);
  const matches = units.filter(unit => unitName(unit.name) === normalized);
  return matches.length === 1 ? matches[0] : null;
}

export function filterAddressUnits(units, query) {
  const words = normalizeAddressSearch(query).split(" ").filter(Boolean);
  return units.filter(unit => {
    const name = normalizeAddressSearch(unit.name);
    return words.every(word => name.includes(word));
  });
}

export function selectAddressProvince(address, province) {
  // Keep a ward only when reselecting the same province and it still exists there.
  const sameProvince = unitName(address.city) === unitName(province.name);
  const ward = sameProvince ? findAddressUnit(province.wards, address.ward) : null;
  return { ...address, city: province.name, ward: ward?.name || "" };
}

export function parseDeliveryAddress(value) {
  const parts = (value || "").trim().split(",").map(part => part.trim()).filter(Boolean);
  return parts.length >= 3
    ? { street: parts.slice(0, -2).join(", "), ward: parts.at(-2), city: parts.at(-1), otherReceiver: false }
    : { street: (value || "").trim(), ward: "", city: "", otherReceiver: false };
}

export function formatSelectedDeliveryAddress(provinces, address) {
  const province = findAddressUnit(provinces, address.city);
  const ward = findAddressUnit(province?.wards || [], address.ward);
  const street = (address.street || "").trim();
  return province && ward && street ? [street, ward.name, province.name].join(", ") : "";
}
