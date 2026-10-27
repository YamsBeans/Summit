import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits } from "@/utils/units";
import { SessionWithMeta } from "./WorkoutHistoryList";

// ─── Types ────────────────────────────────────────────────────────────────────

type Metric = "reps" | "volume" | "duration";
type Range = "3M";

const RANGE_WEEKS: Record<Range, number> = {
  "3M": 13,
};

const Y_AXIS_LABEL_WIDTH = 38;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weekSunday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function durationMinutes(session: SessionWithMeta): number {
  if (!session.end_time) return 0;
  const toSec = (t: string) => {
    const [h, m, s] = t.split(":").map(Number);
    return h * 3600 + m * 60 + (s ?? 0);
  };
  return Math.max(0, (toSec(session.end_time) - toSec(session.start_time)) / 60);
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = { sessions: SessionWithMeta[] };

export default function WorkoutChart({ sessions }: Props) {
  const { colors } = useTheme();
  const { toDisplay, label: unitLabel } = useUnits();
  const { width: screenWidth } = useWindowDimensions();

  const [metric, setMetric] = useState<Metric>("reps");
  const [range, setRange] = useState<Range>("3M");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Clear selection whenever metric or range changes
  useEffect(() => { setSelectedIndex(null); }, [metric, range]);

  const numWeeks = RANGE_WEEKS[range];

  const chartBodyWidth = Math.max(100, screenWidth - 32 - 32 - Y_AXIS_LABEL_WIDTH);
  const barSpacing = 4;
  const barWidth = Math.max(
    1,
    Math.floor((chartBodyWidth - numWeeks * barSpacing) / numWeeks)
  );

  const { barData, periodTotal, weekLabels } = useMemo(() => {
    const nowSunday = weekSunday(new Date());
    const leftWeeks = Math.floor((numWeeks - 1) / 2);

    const weeks: Date[] = [];
    for (let i = -leftWeeks; i < numWeeks - leftWeeks; i++) {
      const d = new Date(nowSunday);
      d.setDate(d.getDate() + i * 7);
      weeks.push(d);
    }

    const weekMap = new Map<string, number>();
    for (const s of sessions) {
      const d = new Date(s.session_date + "T12:00:00");
      const key = isoDate(weekSunday(d));
      let val = 0;
      if (metric === "reps") val = s.totalReps;
      else if (metric === "volume") val = toDisplay(s.totalVolume) ?? s.totalVolume;
      else val = durationMinutes(s);
      weekMap.set(key, (weekMap.get(key) ?? 0) + val);
    }

    const labelEvery = 2;

    // Full human-readable label for every week (used in header when bar is selected)
    const weekLabels: string[] = [];

    let total = 0;
    const barData = weeks.map((weekDate, i) => {
      const key = isoDate(weekDate);
      const value = Math.round(weekMap.get(key) ?? 0);
      total += value;
      weekLabels.push(shortLabel(weekDate));
      return {
        value,
        label: i % labelEvery === 0 ? shortLabel(weekDate) : "",
        // frontColor updated after selectedIndex is known — patched below
        frontColor: value > 0 ? colors.primary : colors.surfaceSecondary,
        onPress: () => {
          setSelectedIndex((prev) => (prev === i ? null : i));
        },
      };
    });

    return { barData, periodTotal: total, weekLabels };
  }, [sessions, metric, range, numWeeks, colors, toDisplay]);

  // Apply selection-aware colors without rerunning the full memo
  const coloredBarData = barData.map((item, i) => {
    let frontColor: string;
    if (selectedIndex === null) {
      frontColor = item.value > 0 ? colors.primary : colors.surfaceSecondary;
    } else if (i === selectedIndex) {
      frontColor = colors.primary;
    } else {
      frontColor = item.value > 0 ? colors.primaryLight : colors.surfaceSecondary;
    }
    return { ...item, frontColor };
  });

  const maxValue = Math.max(...barData.map((d) => d.value), 1);

  const metricLabels: Record<Metric, string> = {
    reps: "Reps",
    volume: `Vol (${unitLabel})`,
    duration: "Min",
  };

  // Header display: selected bar value vs. period total
  const displayValue =
    selectedIndex !== null ? barData[selectedIndex]?.value ?? 0 : periodTotal;

  const displayValueStr =
    metric === "volume"
      ? displayValue.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : displayValue.toLocaleString();

  const displayLabel =
    selectedIndex !== null
      ? `week of ${weekLabels[selectedIndex]}`
      : "this period";

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {/* ── Header: summary + range pills ── */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.totalValue, { color: colors.text }]}>
            {displayValueStr}{" "}
            <Text style={[styles.totalUnit, { color: colors.textSecondary }]}>
              {metricLabels[metric]}
            </Text>
          </Text>
          <Text style={[styles.periodLabel, { color: colors.textSecondary }]}>
            {displayLabel}
          </Text>
        </View>

        <View style={[styles.rangePills, { backgroundColor: colors.surfaceSecondary }]}>
          {(["3M"] as Range[]).map((r) => (
            <Pressable
              key={r}
              onPress={() => setRange(r)}
              style={[styles.rangePill, range === r && { backgroundColor: colors.primary }]}
            >
              <Text
                style={[
                  styles.rangePillText,
                  { color: range === r ? "#fff" : colors.textSecondary },
                ]}
              >
                {r}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Bar chart ── */}
      <BarChart
        data={coloredBarData}
        width={chartBodyWidth}
        barWidth={barWidth}
        spacing={barSpacing}
        initialSpacing={0}
        roundedTop
        maxValue={maxValue}
        noOfSections={4}
        yAxisColor="transparent"
        xAxisColor={colors.border}
        yAxisTextStyle={{ color: colors.textSecondary, fontSize: 9 }}
        xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 9 }}
        rulesColor={colors.border}
        hideRules={false}
        yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
        isAnimated
      />

      {/* ── Metric selector ── */}
      <View style={styles.metricRow}>
        {(["duration", "volume", "reps"] as Metric[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMetric(m)}
            style={[
              styles.metricPill,
              { borderColor: colors.border },
              metric === m && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.metricPillText,
                { color: metric === m ? "#fff" : colors.textSecondary },
              ]}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  totalValue: { fontSize: 22, fontWeight: "800" },
  totalUnit: { fontSize: 14, fontWeight: "500" },
  periodLabel: { fontSize: 12, marginTop: 2 },
  rangePills: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  rangePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rangePillText: { fontSize: 11, fontWeight: "600" },
  metricRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  metricPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  metricPillText: { fontSize: 13, fontWeight: "600" },
});