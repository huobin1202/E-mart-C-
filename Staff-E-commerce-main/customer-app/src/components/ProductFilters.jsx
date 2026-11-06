import { useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { allCategoriesOff, emptyFilters, enableAllCategories, hiddenCategoryCount, isCategoryOn, matchesFilters, matchesKeyword, toggleCategory } from '../utils/productFilters';

const GREEN = '#008848';

function RangeHandle({ value, onChange, width, limit, label }) {
  const start = useRef(value);
  const latest = useRef({ value, onChange, width, limit });
  latest.current = { value, onChange, width, limit };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { start.current = latest.current.value; },
    onPanResponderMove: (_, gesture) => {
      const current = latest.current;
      current.onChange(Math.max(0, Math.min(current.limit, Math.round((start.current + gesture.dx / Math.max(current.width, 1) * current.limit) / 1000) * 1000)));
    },
  }), []);
  const step = (direction) => onChange(Math.max(0, Math.min(limit, value + direction * 1000)));
  return <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max: limit, now: value }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={({ nativeEvent }) => step(nativeEvent.actionName === 'increment' ? 1 : -1)} {...(Platform.OS === 'web' ? { tabIndex: 0, onKeyDown: (event) => { if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) { event.preventDefault(); step(['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1); } } } : {})} style={[s.handle, { left: `${value / limit * 100}%`, ...(Platform.OS === 'web' ? { touchAction: 'none', cursor: 'grab' } : {}) }]}><View style={s.knob} /></View>;
}
export default function ProductFilters({ visible, value, categories, products, query = '', onApply, onClose }) {
  // Category inclusion lists are no longer edited here; categories are on/off toggles (excludedCategories).
  const [draft, setDraft] = useState(() => ({ ...emptyFilters(), ...value, categories: [], conditions: [] }));
  const [keyword, setKeyword] = useState(query);
  const { height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(1);
  const scroll = useRef(null);
  const limit = Math.max(1500000, Math.ceil(Math.max(...products.map((p) => Number(p.price) || 0), Number(draft.min) || 0, Number(draft.max) || 0) / 100000) * 100000);
  const low = Math.min(limit, Number(draft.min) || 0);
  const high = Math.min(limit, draft.max === '' ? limit : Number(draft.max) || 0);

  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const toggle = (key, item) => update({ [key]: draft[key].includes(item) ? draft[key].filter((x) => x !== item) : [...draft[key], item] });
  const valid = (draft.min === '' || /^\d+$/.test(draft.min)) && (draft.max === '' || /^\d+$/.test(draft.max)) && (draft.min === '' || draft.max === '' || Number(draft.min) <= Number(draft.max));
  const noCategory = allCategoriesOff(draft, categories);
  const hiddenCount = hiddenCategoryCount(draft, categories);
  const count = useMemo(() => valid && !noCategory ? products.filter((p) => matchesFilters(p, draft) && matchesKeyword(p, keyword)).length : 0, [products, draft, valid, keyword, noCategory]);
  // On = included (✓, green border); off = excluded (✕, struck through, grey). Never color alone.
  const categoryToggle = (category) => {
    const on = isCategoryOn(draft, category.id);
    return <Pressable key={category.id} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={`${category.name}: ${on ? 'đang bật' : 'đã tắt'}`} onPress={() => setDraft((current) => toggleCategory(current, category.id))} style={[s.chip, on ? s.selected : s.chipOff]}>
      <Text style={[s.chipText, on ? s.selectedText : s.chipOffText]}>{on ? '✓ ' : '✕ '}{category.name}</Text>
    </Pressable>;
  };
  const chip = (label, selected, onPress, key = label) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.chip, selected && s.selected]}><Text style={[s.chipText, selected && s.selectedText]}>{label}{selected ? ' ✓' : ''}</Text></Pressable>;
  const heading = (label) => <Text style={s.heading}>{label}</Text>;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={s.overlay}>
      <Pressable accessibilityLabel="Đóng popup" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[s.page, { maxHeight: height * 0.88 }]} accessibilityViewIsModal>
      <View style={s.header}><Text style={s.title}>Tìm kiếm và bộ lọc nâng cao</Text><Pressable accessibilityLabel="Đóng bộ lọc" onPress={onClose} style={s.close}><Text style={{ fontSize: 14 }}>× Đóng</Text></Pressable></View>
      <Text style={s.hint}>Sản phẩm phải thỏa tất cả các nhóm đã chọn</Text>
      <View style={s.search}><Text style={s.selectedText}>Tìm kiếm sản phẩm</Text><TextInput accessibilityLabel="Từ khóa tìm kiếm trong popup" placeholder="Nhập tên sản phẩm hoặc danh mục..." value={keyword} onChangeText={setKeyword} returnKeyType="search" style={[s.input, s.keyword]} /></View>
      <View style={s.body}>
        <ScrollView ref={scroll} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={[s.between, { alignItems: 'flex-end', marginBottom: 0 }]}>{heading('Danh mục', 0)}{hiddenCount > 0 && <Pressable accessibilityRole="button" onPress={() => setDraft((current) => enableAllCategories(current))} style={s.linkButton}><Text style={s.selectedText}>Bật tất cả</Text></Pressable>}</View>
          <Text style={s.muted}>Tất cả danh mục đang bật. Nhấn vào danh mục không muốn xem để tắt, nhấn lại để bật.</Text>
          <View style={s.wrap}>{(expanded ? categories : categories.slice(0, 8)).map(categoryToggle)}</View>
          {categories.length > 8 && <Pressable onPress={() => setExpanded(!expanded)}><Text style={s.muted}>{expanded ? 'Thu gọn ⌃' : `Xem thêm ${categories.length - 8} danh mục ⌄`}</Text></Pressable>}
          {hiddenCount > 0 && <Text style={s.muted}>{noCategory ? 'Bạn đã tắt tất cả danh mục nên không có sản phẩm nào. Bấm "Bật tất cả" để xem lại.' : `Đang ẩn ${hiddenCount} danh mục.`}</Text>}
          {heading('Khoảng giá (đ)', 1)}<Text style={s.selectedText}>⚲ Kéo để chọn mức giá phù hợp với bạn</Text>
          <View style={s.between}><Text style={s.priceLabel}>{low.toLocaleString('vi-VN')}đ</Text><Text style={s.priceLabel}>{draft.max === '' ? 'Không giới hạn' : `${high.toLocaleString('vi-VN')}đ`}</Text></View>
          <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={s.track}>
            <View pointerEvents="none" style={[s.selectedTrack, { left: `${low / limit * 100}%`, right: `${100 - high / limit * 100}%` }]} />
            <RangeHandle label="Giá tối thiểu trên thanh kéo" limit={limit} width={width} value={low} onChange={(n) => update({ min: n === 0 ? '' : String(Math.min(n, high)) })} />
            <RangeHandle label="Giá tối đa trên thanh kéo" limit={limit} width={width} value={high} onChange={(n) => update({ max: n === limit ? '' : String(Math.max(n, low)) })} />
          </View>
          <View style={s.between}><Text style={s.muted}>0đ</Text><Text style={s.muted}>{limit.toLocaleString('vi-VN')}đ</Text></View>
          <View style={s.row}><TextInput accessibilityLabel="Giá tối thiểu" placeholder="TỐI THIỂU" keyboardType="numeric" value={draft.min} onChangeText={(min) => update({ min })} style={s.input} /><Text>—</Text><TextInput accessibilityLabel="Giá tối đa" placeholder="TỐI ĐA" keyboardType="numeric" value={draft.max} onChangeText={(max) => update({ max })} style={s.input} /></View>
          {heading('Khuyến mãi', 2)}<View style={s.wrap}>{[['Đang giảm giá', '0'], ['Giảm từ 20%', '20'], ['Giảm từ 30%', '30']].map(([label, id]) => chip(label, draft.promotion === id, () => update({ promotion: draft.promotion === id ? '' : id })))}</View>
          {heading('Tình trạng', 3)}<View style={s.wrap}>{chip('Còn hàng', draft.status.includes('stock'), () => toggle('status', 'stock'))}{chip('Bán chạy', draft.status.includes('best'), () => toggle('status', 'best'))}</View>
          {heading('Điều kiện nâng cao', 4)}<Text style={s.muted}>Miền nhà cung cấp</Text><View style={s.wrap}>{['Bắc', 'Trung', 'Nam'].map((region) => chip(region, draft.regions.includes(region), () => toggle('regions', region)))}</View>
        </ScrollView></View>
      <View style={s.footer}><Text style={[s.muted, { textAlign: 'center' }]}>{!valid ? 'Nhập giá hợp lệ, tối thiểu ≤ tối đa.' : noCategory ? 'Đã tắt tất cả danh mục — bật lại ít nhất một danh mục.' : `Tìm thấy ${count} sản phẩm phù hợp`}</Text><View style={s.row}><Pressable accessibilityRole="button" onPress={() => { setDraft(emptyFilters()); setKeyword(''); }} style={s.reset}><Text style={s.selectedText}>Thiết lập lại</Text></Pressable><Pressable accessibilityRole="button" disabled={!valid} onPress={() => { onApply(draft, keyword); onClose(); }} style={[s.apply, !valid && { opacity: 0.4 }]}><Text style={s.white}>Xem {count} kết quả</Text></Pressable></View></View>
      </View>
    </SafeAreaView>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.52)', justifyContent: 'center', alignItems: 'center', padding: 16 }, page: { width: '100%', maxWidth: 1080, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', flexShrink: 1 }, search: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12, gap: 8 }, keyword: { flex: 0, textAlign: 'left', minHeight: 44 }, header: { height: 70, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderColor: '#eee' }, title: { fontSize: 17, fontWeight: '700', paddingLeft: 16, paddingRight: 82 }, close: { position: 'absolute', right: 15, padding: 6 }, hint: { fontSize: 11, color: '#7b8491', backgroundColor: '#fafafa', padding: 9 }, body: { flexShrink: 1, minHeight: 0 }, sidebar: { width: 88, backgroundColor: '#f5f6f8' }, nav: { paddingVertical: 22, paddingHorizontal: 8 }, content: { paddingHorizontal: 24, paddingBottom: 28 }, heading: { fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: 14 }, muted: { color: '#7b8491', fontSize: 12 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }, chip: { backgroundColor: '#f3f4f5', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: 'transparent' }, chipText: { fontSize: 14, color: '#30343b' }, selected: { borderColor: GREEN, backgroundColor: '#e9f6ef' }, selectedText: { color: GREEN, fontWeight: '700', fontSize: 14 }, chipOff: { borderColor: '#cbd2d9', backgroundColor: '#fff', borderStyle: 'dashed' }, chipOffText: { color: '#6b7280', textDecorationLine: 'line-through' }, linkButton: { paddingVertical: 6, paddingHorizontal: 4, marginBottom: 10 }, priceLabel: { fontSize: 15, fontWeight: '700', color: GREEN, marginTop: 14 }, selectedTrack: { position: 'absolute', top: 0, bottom: 0, backgroundColor: GREEN, borderRadius: 3 }, track: { height: 6, borderRadius: 3, backgroundColor: '#e2e8e5', marginTop: 16, marginBottom: 20, marginHorizontal: 22 }, handle: { position: 'absolute', top: -19, marginLeft: -22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, knob: { width: 26, height: 26, backgroundColor: GREEN, borderRadius: 13, borderWidth: 3, borderColor: '#fff', elevation: 3, boxShadow: '0 1px 4px #0003' }, between: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, input: { flex: 1, minWidth: 65, borderWidth: 1, borderColor: '#e2e4e8', borderRadius: 5, padding: 11, textAlign: 'center', fontSize: 12 }, footer: { flexShrink: 0, borderTopWidth: 1, borderColor: '#e4e6e9', padding: 12, gap: 10 }, reset: { flex: 1, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: GREEN, borderRadius: 7 }, apply: { flex: 1, paddingVertical: 15, alignItems: 'center', backgroundColor: GREEN, borderRadius: 7 }, white: { color: '#fff', fontWeight: '700' }, condition: { padding: 8, borderWidth: 1, borderColor: '#e2e4e8', borderRadius: 6, marginVertical: 8 },
});
