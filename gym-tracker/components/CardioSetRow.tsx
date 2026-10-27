import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeContext";
import {
  computePace,
  digitsToSeconds,
  formatDigits,
  formatDuration,
  metersToDisplay,
  parseDistanceToMeters,
  secondsToDigits,
} from "@/utils/cardioUtils";

type Props = {
  set: any;
  sessionExerciseId: number;
  onUpdate: (id: number, exId: number, updates: any) => void;
  onSetNumberPress: (set: any, sessionExerciseId: number) => void;
  prevSet?: any;
  onComplete?: () => void;
  distanceUnit: "km" | "mi";
};

const CardioSetRow = memo(function CardioSetRow({
  set,
  sessionExerciseId,
  onUpdate,
  onSetNumberPress,
  prevSet,
  onComplete,
  distanceUnit,
}: Props) {
  const { colors } = useTheme();

  const toDistStr = (meters: number | null | undefined) =>
    meters != null
      ? String(parseFloat(metersToDisplay(meters, distanceUnit).toFixed(2)))
      : "";

  const [distanceInput, setDistanceInput] = useState(toDistStr(set.distance_meters));
  const [digitBuffer, setDigitBuffer] = useState(() => secondsToDigits(set.duration_seconds));

  useEffect(() => {
    setDistanceInput(toDistStr(set.distance_meters));
  }, [set.distance_meters, distanceUnit]);

  useEffect(() => {
    setDigitBuffer(secondsToDigits(set.duration_seconds));
  }, [set.duration_seconds]);

  const buildUpdates = useCallback(
    (distStr: string, durSec: number) => {
      const distMeters = parseDistanceToMeters(distStr, distanceUnit);
      const pace =
        durSec > 0 && distMeters != null && distMeters > 0
          ? computePace(distMeters, durSec)
          : null;
      return {
        duration_seconds: durSec > 0 ? durSec : null,
        distance_meters: distMeters ?? null,
        pace_sec_per_km: pace,
      };
    },
    [distanceUnit]
  );

  const commitNow = useCallback(
    (distStr: string, durSec: number) => {
      onUpdate(set.session_set_id, sessionExerciseId, buildUpdates(distStr, durSec));
    },
    [set.session_set_id, sessionExerciseId, onUpdate, buildUpdates]
  );

  const handleDistanceBlur = useCallback(() => {
    commitNow(distanceInput, digitsToSeconds(digitBuffer));
  }, [distanceInput, digitBuffer, commitNow]);

  const handleDurationChange = useCallback((text: string) => {
    // Strip anything that isn't a digit, cap at 6 digits
    setDigitBuffer(text.replace(/\D/g, "").slice(0, 6));
  }, []);

  const handleDurationBlur = useCallback(() => {
    commitNow(distanceInput, digitsToSeconds(digitBuffer));
  }, [digitBuffer, distanceInput, commitNow]);

  const toggleCompleted = useCallback(() => {
    const completing = !set.completed;
    const updates: any = {
      completed: completing,
      ...buildUpdates(distanceInput, digitsToSeconds(digitBuffer)),
    };
    onUpdate(set.session_set_id, sessionExerciseId, updates);
    if (completing) onComplete?.();
  }, [set, sessionExerciseId, onUpdate, onComplete, distanceInput, digitBuffer, buildUpdates]);

  const isCompleted = set.completed === true;
  const isWarmup = set.is_warmup === true;

  const prevDist =
    prevSet?.distance_meters != null
      ? `${parseFloat(metersToDisplay(prevSet.distance_meters, distanceUnit).toFixed(2))} ${distanceUnit}`
      : null;
  const prevDur =
    prevSet?.duration_seconds != null ? formatDuration(prevSet.duration_seconds) : null;
  const prevHint = [prevDist, prevDur].filter(Boolean).join(" / ") || "—";

  const completedBg = isCompleted ? colors.successLight + "80" : "transparent";
  const inputBg = isCompleted ? colors.successLight : colors.inputBackground;
  const inputColor = isCompleted ? colors.success : colors.text;

  return (
    <View
      style={[
        rowStyles.row,
        { backgroundColor: completedBg, borderBottomColor: colors.border },
      ]}
    >
      {/* Set badge */}
      <Pressable
        style={[
          rowStyles.badge,
          isWarmup && { backgroundColor: colors.warningLight },
          isCompleted && { backgroundColor: colors.successLight },
        ]}
        onPress={() => onSetNumberPress(set, sessionExerciseId)}
        hitSlop={8}
      >
        <Text
          style={[
            rowStyles.badgeText,
            { color: colors.textTertiary },
            isWarmup && { color: "#ffd60a" },
            isCompleted && { color: colors.success },
          ]}
        >
          {isWarmup ? "W" : set.set_number}
        </Text>
      </Pressable>

      {/* Previous hint */}
      <Text
        style={[rowStyles.prevHint, { color: colors.textTertiary }]}
        numberOfLines={1}
      >
        {prevHint}
      </Text>

      {/* Distance input */}
      <TextInput
        style={[rowStyles.cell, { backgroundColor: inputBg, color: inputColor }]}
        value={distanceInput}
        onChangeText={setDistanceInput}
        onBlur={handleDistanceBlur}
        placeholder="0.00"
        placeholderTextColor={colors.textTertiary}
        keyboardType="decimal-pad"
        returnKeyType="done"
        editable={!isCompleted}
        selectTextOnFocus
      />

      {/* Duration input — digit-shift: type raw digits, always shows h:mm:ss colons as guides */}
      <TextInput
        style={[rowStyles.cell, { backgroundColor: inputBg, color: inputColor }]}
        value={formatDigits(digitBuffer)}
        onChangeText={handleDurationChange}
        onBlur={handleDurationBlur}
        placeholder="00:00:00"
        placeholderTextColor={colors.textTertiary}
        keyboardType="number-pad"
        returnKeyType="done"
        editable={!isCompleted}
      />

      {/* Complete button */}
      <Pressable
        style={[
          rowStyles.checkBtn,
          isCompleted
            ? { backgroundColor: colors.success, borderColor: colors.success }
            : { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
        ]}
        onPress={toggleCompleted}
        hitSlop={6}
      >
        <Text
          style={{
            color: isCompleted ? "#fff" : colors.textTertiary,
            fontSize: 16,
            fontWeight: "700",
          }}
        >
          ✓
        </Text>
      </Pressable>
    </View>
  );
});

export default CardioSetRow;

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 13, fontWeight: "700" },
  prevHint: { flex: 1, fontSize: 12, minWidth: 40 },
  cell: {
    width: 72,
    height: 38,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    padding: 0,
    paddingHorizontal: 4,
  },
  checkBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
