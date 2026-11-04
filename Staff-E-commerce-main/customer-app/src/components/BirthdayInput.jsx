import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { birthdayToIso, formatBirthday } from "../utils/birthday";

function calendarDate(year, month, day = 1) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month, day);
  return date;
}

export default function BirthdayInput({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => calendarDate(2000, 0));
  const [yearText, setYearText] = useState("2000");
  const today = new Date();
  const selected = birthdayToIso(value, today);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const offset = (cursor.getDay() + 6) % 7;
  const days = calendarDate(year, month + 1, 0).getDate();
  const moveMonth = delta => {
    const next = calendarDate(year, month + delta);
    if (next.getFullYear() < 1 || next > today) return;
    setCursor(next); setYearText(String(next.getFullYear()).padStart(4, "0"));
  };
  function showCalendar() {
    const date = selected ? new Date(`${selected}T12:00:00`) : calendarDate(2000, 0);
    setCursor(calendarDate(date.getFullYear(), date.getMonth()));
    setYearText(String(date.getFullYear()).padStart(4, "0"));
    setOpen(true);
  }
  return <>
    <Text style={styles.label}>Ngày sinh (ngày/tháng/năm)</Text>
    <View style={styles.inputRow}>
      <TextInput accessibilityLabel="Ngày sinh (DD/MM/YYYY)" value={value} onChangeText={onChange} placeholder="DD/MM/YYYY" style={styles.input} keyboardType="numbers-and-punctuation" maxLength={10} />
      <Pressable accessibilityRole="button" accessibilityLabel="Chọn ngày sinh" onPress={showCalendar} style={styles.openButton}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Rect x={3} y={5} width={18} height={16} rx={2} stroke="#008848" strokeWidth={2} /><Path d="M7 3v4m10-4v4M3 11h18" stroke="#008848" strokeWidth={2} /></Svg>
        <Text style={styles.buttonText}>Chọn ngày</Text>
      </Pressable>
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}><View style={styles.card} accessibilityViewIsModal>
        <Text style={styles.title}>Chọn ngày sinh</Text>
        <Text style={styles.hint}>Có thể nhập trực tiếp năm sinh bên dưới.</Text>
        <View style={styles.navigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Tháng trước" onPress={() => moveMonth(-1)} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable>
          <Text style={styles.month}>Tháng {month + 1}</Text>
          <TextInput accessibilityLabel="Năm sinh" style={styles.year} value={yearText} keyboardType="number-pad" maxLength={4} selectTextOnFocus onChangeText={text => {
            setYearText(text.replace(/\D/g, ""));
            if (/^\d{4}$/.test(text) && Number(text) >= 1 && Number(text) <= today.getFullYear()) {
              const nextMonth = Number(text) === today.getFullYear() ? Math.min(month, today.getMonth()) : month;
              setCursor(calendarDate(Number(text), nextMonth));
            }
          }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Tháng sau" disabled={calendarDate(year, month + 1) > today} onPress={() => moveMonth(1)} style={styles.arrow}><Text style={styles.arrowText}>›</Text></Pressable>
        </View>
        {Number(yearText) !== year && <Text style={styles.error}>Nhập năm hợp lệ, không lớn hơn năm hiện tại.</Text>}
        <View style={styles.grid}>
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(day => <View key={day} style={styles.cell}><Text style={styles.weekday}>{day}</Text></View>)}
          {Array.from({ length: offset }, (_, i) => <View key={`blank-${i}`} style={styles.cell} />)}
          {Array.from({ length: days }, (_, i) => {
            const date = calendarDate(year, month, i + 1);
            const display = formatBirthday(date);
            const disabled = date > today || Number(yearText) !== year;
            const active = selected !== null && birthdayToIso(display, today) === selected;
            return <Pressable key={i} accessibilityRole="button" accessibilityLabel={display} accessibilityState={{ selected: active, disabled }} disabled={disabled} style={[styles.cell, active && styles.selected]} onPress={() => { onChange(display); setOpen(false); }}>
              <Text style={[styles.day, active && styles.selectedText, disabled && styles.disabled]}>{i + 1}</Text>
            </Pressable>;
          })}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Hủy chọn ngày sinh" style={styles.cancel} onPress={() => setOpen(false)}><Text style={styles.buttonText}>Hủy</Text></Pressable>
      </View></View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  label: { color: "#26382d", fontSize: 13, marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#dce3e9", borderRadius: 10, marginBottom: 12, minHeight: 50 },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 12, color: "#26382d", fontSize: 15 },
  openButton: { flexDirection: "row", alignItems: "center", gap: 6, padding: 12 },
  buttonText: { color: "#008848", fontWeight: "700" },
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#14221988", padding: 16 },
  card: { width: "100%", maxWidth: 360, backgroundColor: "white", padding: 16, borderRadius: 16 },
  title: { fontSize: 20, fontWeight: "700", color: "#26382d" },
  hint: { fontSize: 12, color: "#66756b", marginVertical: 8 },
  navigation: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 8 },
  arrow: { paddingHorizontal: 12, paddingVertical: 4 },
  arrowText: { fontSize: 30, color: "#008848" },
  month: { fontWeight: "700", fontSize: 16 },
  year: { borderWidth: 1, borderColor: "#dce3e9", borderRadius: 6, padding: 8, width: 70, textAlign: "center", fontSize: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "14.285714%", height: 42, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  weekday: { fontWeight: "700", color: "#66756b" },
  day: { color: "#26382d", fontSize: 15 },
  selected: { backgroundColor: "#008848" },
  selectedText: { color: "white" },
  disabled: { color: "#bdc5c0" },
  error: { color: "#a33e36", fontSize: 12 },
  cancel: { alignItems: "center", padding: 12, marginTop: 10 },
});
