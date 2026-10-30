import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits } from "@/utils/units";
import { BARS, PLATES, calculatePlates, groupPlates } from "@/utils/plates";
import { formatNumberInput, parseDecimalInput } from "@/utils/numberInput";

type Props = {
  visible: boolean;
  /** Starting weight in the display unit (kg or lbs). */
  initialWeight: number | null;
  onClose: () => void;
};

const BAR_KEY = "@gym_tracker_bar_weight";

// Bumper-plate colours, heaviest first, so a 45/25 kg plate looks like one.
const PLATE_COLORS = ["#dc2626", "#2563eb", "#eab308", "#16a34a", "#e5e7eb", "#374151", "#9ca3af"];

export default function PlateCalculatorModal({ visible, initialWeight, onClose }: Props) {
  const { colors } = useTheme();
  const { unit } = useUnits();
  const [text, setText] = useState("");
  const [bar, setBar] = useState<number>(BARS[unit][0]);

  useEffect(() => {
    if (!visible) return;
    setText(formatNumberInput(initialWeight));
    AsyncStorage.getItem(`${BAR_KEY}_${unit}`).then((v) => {
      const n = v ? Number(v) : NaN;
      setBar(BARS[unit].includes(n) ? n : BARS[unit][0]);
    }).catch(() => {});
  }, [visible, initialWeight, unit]);

  const chooseBar = (b: number) => {
    setBar(b);
    AsyncStorage.setItem(`${BAR_KEY}_${unit}`, String(b)).catch(() => {});
  };

  const plates = PLATES[unit];
  const target = parseDecimalInput(text);
  const result = useMemo(() => (target != null ? calculatePlates(target, bar, plates) : null), [target, bar, plates]);
  const groups = result ? groupPlates(result.perSide) : [];
  const maxPlate = plates[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>Plate Calculator</Text>

          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
              value={text}
              onChangeText={setText}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              selectTextOnFocus
              accessibilityLabel={`Target weight in ${unit}`}
            />
            <Text style={[styles.unit, { color: colors.textSecondary }]}>{unit}</Text>
          </View>

          <Text style={[styles.label, { color: colors.textTertiary }]}>BAR</Text>
          <View style={styles.barRow}>
            {BARS[unit].map((b) => {
              const sel = b === bar;
              return (
                <Pressable
                  key={b}
                  onPress={() => chooseBar(b)}
                  style={[styles.barChip, { borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primaryLight : "transparent" }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                >
                  <Text style={{ color: sel ? colors.primary : colors.text, fontWeight: "700" }}>{b} {unit}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* One side of the bar: shaft, collar, then plates heaviest-first */}
          <View style={[styles.visual, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={[styles.shaft, { backgroundColor: colors.textTertiary }]} />
            <View style={[styles.collar, { backgroundColor: colors.textSecondary }]} />
            {result?.perSide.map((p, i) => {
              const idx = plates.indexOf(p);
              return (
                <View
                  key={i}
                  style={[
                    styles.plate,
                    {
                      height: 30 + 70 * (p / maxPlate),
                      backgroundColor: PLATE_COLORS[idx] ?? colors.textSecondary,
                      borderColor: colors.border,
                    },
                  ]}
                />
              );
            })}
            <View style={[styles.sleeve, { backgroundColor: colors.textTertiary }]} />
          </View>

          <View style={styles.summary}>
            {target == null ? (
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}>Enter a weight to see the plates.</Text>
            ) : groups.length === 0 ? (
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
                {target <= bar ? `That's just the bar (${bar} ${unit}).` : "No plates needed."}
              </Text>
            ) : (
              <>
                <Text style={[styles.perSideLabel, { color: colors.textTertiary }]}>EACH SIDE</Text>
                <Text style={[styles.summaryText, { color: colors.text }]}>
                  {groups.map(([p, n]) => `${n} × ${p}`).join("  +  ")}
                </Text>
              </>
            )}
            {result && result.remainder > 0 && target != null && target > bar && (
              <View style={[styles.warn, { backgroundColor: colors.warningLight }]}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.warning} />
                <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "600", flexShrink: 1 }}>
                  Closest is {result.loaded} {unit} ({result.remainder} {unit} short)
                </Text>
              </View>
            )}
          </View>

          <Pressable style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 8, paddingBottom: 36, paddingHorizontal: 16,
    width: "100%", maxWidth: 560, alignSelf: "center",
  },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: 14, alignSelf: "center" },
  title: { fontSize: 18, fontWeight: "800", textAlign: "center", marginBottom: 14 },
  inputRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 },
  input: { width: 130, borderWidth: 1, borderRadius: 12, paddingVertical: 10, fontSize: 26, fontWeight: "800", textAlign: "center" },
  unit: { fontSize: 18, fontWeight: "600" },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: 6 },
  barRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  barChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  visual: {
    height: 120, borderRadius: 12, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, overflow: "hidden", marginBottom: 12,
  },
  shaft: { width: 28, height: 6 },
  plate: { width: 14, borderRadius: 3, marginHorizontal: 1, borderWidth: StyleSheet.hairlineWidth },
  collar: { width: 6, height: 26, borderRadius: 2, marginRight: 2 },
  sleeve: { flex: 1, height: 12, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  summary: { alignItems: "center", minHeight: 52, gap: 4, marginBottom: 12 },
  perSideLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  summaryText: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  warn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginTop: 4 },
  doneBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  doneText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
