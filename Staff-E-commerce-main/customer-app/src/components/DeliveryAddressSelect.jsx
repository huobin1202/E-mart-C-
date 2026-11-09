import { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import administrativeUnits from "../data/vietnamAdministrativeUnits.json";
import { filterAddressUnits, findAddressUnit, formatSelectedDeliveryAddress, selectAddressProvince } from "../utils/addressSelection";
import { IconCheck, IconChevronRight, IconClose, IconSearch } from "./Icons";

const provinces = [...administrativeUnits.provinces].sort((a, b) => a.name.localeCompare(b.name, "vi"));

export default function DeliveryAddressSelect({ value, onChange, disabled = false, singleField = false }) {
  const [level, setLevel] = useState(null);
  const [query, setQuery] = useState("");
  const [draftAddress, setDraftAddress] = useState(() => ({ ...value }));
  const [error, setError] = useState("");
  const selection = singleField ? draftAddress : value;
  const province = findAddressUnit(provinces, selection.city);
  const selectingProvince = level === "province";
  const editingDetails = level === "details";
  const title = selectingProvince ? "Tỉnh/Thành phố" : "Phường/Xã";
  const selectedName = selectingProvince ? province?.name : findAddressUnit(province?.wards || [], selection.ward)?.name;
  const savedAddress = formatSelectedDeliveryAddress(provinces, value);
  const summary = savedAddress || (disabled ? [value.street, value.ward, value.city].filter(Boolean).join(", ") : "");
  const options = useMemo(() => {
    const units = level === "province" ? provinces : [...(province?.wards || [])].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    return filterAddressUnits(units, query);
  }, [level, province, query]);

  function open(nextLevel) {
    setQuery("");
    setError("");
    setLevel(nextLevel);
  }

  function editAddress() {
    setDraftAddress({ ...value });
    open(savedAddress ? "details" : "province");
  }

  function close() {
    setLevel(null);
    setQuery("");
  }

  function select(unit) {
    if (selectingProvince) {
      const address = selectAddressProvince(selection, unit);
      if (singleField) setDraftAddress(address);
      else onChange(address);
      open("ward");
    } else {
      const address = { ...selection, ward: unit.name };
      if (singleField) {
        setDraftAddress(address);
        open("details");
      } else {
        onChange(address);
        close();
      }
    }
  }

  function saveAddress() {
    if (disabled) return;
    const formatted = formatSelectedDeliveryAddress(provinces, draftAddress);
    if (!formatted) {
      setError("Vui lòng chọn tỉnh/thành phố, phường/xã và nhập số nhà, tên đường.");
      return;
    }
    if (formatted.length > 500) {
      setError("Địa chỉ không được vượt quá 500 ký tự.");
      return;
    }
    onChange({
      ...draftAddress,
      city: province.name,
      ward: findAddressUnit(province.wards, draftAddress.ward).name,
      street: draftAddress.street.trim(),
    });
    close();
  }

  function locationFields() {
    return <>
    <Text style={styles.label}>Tỉnh/Thành phố</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Chọn Tỉnh/Thành phố${selection.city ? `: ${selection.city}` : ""}`} accessibilityState={{ disabled }} disabled={disabled} onPress={() => open("province")} style={[styles.field, disabled && styles.disabled]}>
      <Text style={[styles.fieldText, !selection.city && styles.placeholder]}>{selection.city || "Chọn Tỉnh/Thành phố"}</Text>
      <IconChevronRight />
    </Pressable>
    <Text style={styles.label}>Phường/Xã</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Chọn Phường/Xã${selection.ward ? `: ${selection.ward}` : ""}`} accessibilityState={{ disabled: disabled || !province }} disabled={disabled || !province} onPress={() => open("ward")} style={[styles.field, (disabled || !province) && styles.disabled]}>
      <Text style={[styles.fieldText, !selection.ward && styles.placeholder]}>{selection.ward || (province ? "Chọn Phường/Xã" : "Chọn Tỉnh/Thành phố trước")}</Text>
      <IconChevronRight />
    </Pressable>
    </>;
  }

  return <>
    {singleField ? <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary ? `Thay đổi địa chỉ nhận hàng: ${summary}` : "Vui lòng cung cấp thông tin nhận hàng"}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={editAddress}
      style={[styles.field, styles.summaryField, !summary && styles.missingAddress, disabled && styles.disabled]}
    >
      <Text style={[styles.fieldText, !summary && styles.missingAddressText]}>{summary || "Vui lòng cung cấp thông tin nhận hàng"}</Text>
      <IconChevronRight color={summary ? "#008848" : "#d65a00"} />
    </Pressable> : locationFields()}
    <Modal visible={level !== null} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.content} accessibilityViewIsModal>
            <View style={styles.heading}>
              {singleField && level === "ward" ? <Pressable accessibilityRole="button" accessibilityLabel="Quay lại chọn Tỉnh/Thành phố" onPress={() => open("province")} style={styles.close}><View style={{ transform: [{ rotate: "180deg" }] }}><IconChevronRight size={24} color="#1a202c" /></View></Pressable> : null}
              <Text accessibilityRole="header" style={styles.title}>{editingDetails ? "Địa chỉ nhận hàng" : `Chọn ${title}`}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Đóng danh sách địa chỉ" onPress={close} style={styles.close} hitSlop={8}><IconClose size={25} color="#1a202c" /></Pressable>
            </View>
            {editingDetails ? <>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.details}>
                {locationFields()}
                <Text style={styles.label}>Số nhà, tên đường</Text>
                <TextInput
                  accessibilityLabel="Số nhà, tên đường nhận hàng"
                  value={draftAddress.street}
                  onChangeText={(street) => { setDraftAddress(address => ({ ...address, street })); setError(""); }}
                  placeholder="Số nhà, tên đường"
                  placeholderTextColor="#78857c"
                  style={styles.streetInput}
                  multiline
                  maxLength={500}
                />
                {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              </ScrollView>
              <View style={styles.footer}>
                <Pressable accessibilityRole="button" onPress={saveAddress} disabled={disabled} style={[styles.saveButton, disabled && styles.disabled]}><Text style={styles.saveButtonText}>Lưu địa chỉ</Text></Pressable>
              </View>
            </> : <>
            <View style={styles.intro}>
              {!selectingProvince && province ? <Pressable accessibilityRole="button" accessibilityLabel="Đổi Tỉnh/Thành phố" onPress={() => open("province")} style={styles.provinceLink}>
                <Text style={styles.provinceName}>{province.name}</Text><Text style={styles.change}>Thay đổi</Text>
              </Pressable> : null}
            </View>
            <View style={styles.listCard}>
              <View style={styles.searchBox}>
                <IconSearch color="#78857c" size={22} />
                <TextInput accessibilityLabel={`Tìm nhanh ${title}`} placeholder={`Tìm nhanh ${title}`} placeholderTextColor="#78857c" value={query} onChangeText={setQuery} style={styles.searchInput} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
                {query ? <Pressable accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm" onPress={() => setQuery("")} style={styles.clear}><IconClose /></Pressable> : null}
              </View>
              <FlatList
                data={options}
                keyExtractor={item => item.code}
                extraData={selectedName}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={<Text style={styles.empty}>Không tìm thấy {title.toLowerCase()} phù hợp.</Text>}
                renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item.name === selectedName }} onPress={() => select(item)} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
                  <Text style={[styles.optionText, item.name === selectedName && styles.selectedText]}>{item.name}</Text>
                  {item.name === selectedName ? <IconCheck size={21} /> : null}
                </Pressable>}
              />
            </View>
            </>}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  label: { color: "#526159", fontSize: 13, fontWeight: "600", marginBottom: 6 },
  field: { minHeight: 53, borderWidth: 1, borderColor: "#dce3e9", borderRadius: 10, paddingHorizontal: 14, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff" },
  fieldText: { flex: 1, color: "#1a202c", fontSize: 16, paddingVertical: 12 },
  summaryField: { minHeight: 62 },
  missingAddress: { backgroundColor: "#fff4e8", borderColor: "#ffe0bc" },
  missingAddressText: { color: "#d65a00", fontWeight: "700" },
  placeholder: { color: "#78857c" },
  disabled: { backgroundColor: "#f4f6f5", opacity: 0.65 },
  screen: { flex: 1, backgroundColor: "#f6f7f6" },
  content: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center" },
  heading: { minHeight: 76, paddingLeft: 20, paddingRight: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#fff", gap: 12 },
  title: { flex: 1, fontSize: 21, fontWeight: "700", color: "#1a202c" },
  close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  intro: { padding: 16, gap: 14 },
  hint: { color: "#66756b", fontSize: 15, lineHeight: 22 },
  provinceLink: { flexDirection: "row", alignItems: "center", gap: 12 },
  provinceName: { flex: 1, color: "#1a202c", fontSize: 16, fontWeight: "600" },
  change: { color: "#008848", fontSize: 14, fontWeight: "700", paddingVertical: 8 },
  listCard: { flex: 1, backgroundColor: "#fff", marginHorizontal: 12, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 14 },
  searchBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#dce3e9", borderRadius: 10, marginHorizontal: 14, marginBottom: 8, paddingLeft: 12, gap: 10 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 50, paddingVertical: 12, paddingRight: 12, color: "#1a202c", fontSize: 16 },
  clear: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  option: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16 },
  optionPressed: { backgroundColor: "#eef7ef" },
  optionText: { flex: 1, color: "#26382d", fontSize: 17, lineHeight: 24 },
  selectedText: { color: "#008848", fontWeight: "700" },
  separator: { height: 1, backgroundColor: "#e8ece9" },
  empty: { paddingVertical: 32, textAlign: "center", color: "#66756b", fontSize: 15 },
  details: { padding: 20 },
  streetInput: { minHeight: 86, borderWidth: 1, borderColor: "#dce3e9", borderRadius: 10, padding: 14, color: "#1a202c", backgroundColor: "#fff", fontSize: 16, textAlignVertical: "top" },
  error: { color: "#d32f2f", fontSize: 14, lineHeight: 20, marginTop: 12 },
  footer: { padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e8ece9" },
  saveButton: { minHeight: 50, backgroundColor: "#008848", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
