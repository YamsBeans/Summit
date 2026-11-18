import { Pressable, StyleSheet, Text } from "react-native";
import { SheetOption } from "@/components/ActionSheet";
import { useTheme } from "@/theme/ThemeContext";

/** Whole numbers only: sets store RPE in the int4 `effort_level` column. */
export const RPE_VALUES = [6, 7, 8, 9, 10];

/**
 * The "RPE 6–10" row of a set's ActionSheet (like Strong/Hevy). Tapping the
 * selected value clears it, so `onPick` gets the new value or null.
 */
export function RpeOption({ value, onPick }: { value: number | null | undefined; onPick: (rpe: number | null) => void }) {
  const { colors } = useTheme();
  return (
    <SheetOption icon="speedometer-outline" label="RPE" style={{ gap: 10 }}>
      {RPE_VALUES.map((v) => {
        const on = value === v;
        return (
          <Pressable
            key={v}
            onPress={() => onPick(on ? null : v)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={on ? `RPE ${v}, selected. Tap to clear` : `RPE ${v}`}
            hitSlop={4}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: on ? colors.primary : colors.surfaceSecondary, borderColor: on ? colors.primary : colors.border },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.chipText, { color: on ? "#fff" : colors.text }]}>{v}</Text>
          </Pressable>
        );
      })}
    </SheetOption>
  );
}

const styles = StyleSheet.create({
  chip: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 14, fontWeight: "700" },
});
