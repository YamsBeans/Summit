import { memo, useCallback, useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
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
  onComplete?: (sessionExerciseId: number) => void;
  onDraft?: (sessionSetId: number, sessionExerciseId: number, updates: Record<string, any>) => void;
  distanceUnit: "km" | "mi";
  /** Working sets count 1, 2, 3 after warm-ups, like strength rows. */
  workingNumber?: number;
};

// Stored meters → the text shown in the distance box, in the user's unit.
function toDistStr(meters: number | null | undefined, unit: "km" | "mi"): string {
  return meters != null ? String(parseFloat(metersToDisplay(meters, unit).toFixed(2))) : "";
}

const CardioSetRow = memo(function CardioSetRow({
  set,
  sessionExerciseId,
  onUpdate,
  onSetNumberPress,
  prevSet,
  onComplete,
  onDraft,
  distanceUnit,
  workingNumber,
}: Props) {
  const { colors } = useTheme();

  const [distanceInput, setDistanceInput] = useState(toDistStr(set.distance_meters, distanceUnit));
  const [digitBuffer, setDigitBuffer] = useState(() => secondsToDigits(set.duration_seconds));

  useEffect(() => {
    setDistanceInput(toDistStr(set.distance_meters, distanceUnit));
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

  // Report unsaved typing to the screen (see StrengthSetRow's onDraft).
  const reportDraft = useCallback((distStr: string, digits: string) => {
    onDraft?.(set.session_set_id, sessionExerciseId, buildUpdates(distStr, digitsToSeconds(digits)));
  }, [onDraft, set.session_set_id, sessionExerciseId, buildUpdates]);

  const handleDistanceBlur = useCallback(() => {
    commitNow(distanceInput, digitsToSeconds(digitBuffer));
  }, [distanceInput, digitBuffer, commitNow]);

  const handleDurationChange = useCallback((text: string) => {
    // Strip anything that isn't a digit, cap at 6 digits
    const digits = text.replace(/\D/g, "").slice(0, 6);
    setDigitBuffer(digits);
    reportDraft(distanceInput, digits);
  }, [distanceInput, reportDraft]);

  const hasPrev = prevSet?.distance_meters != null || prevSet?.duration_seconds != null;

  const handleDurationBlur = useCallback(() => {
    commitNow(distanceInput, digitsToSeconds(digitBuffer));
  }, [digitBuffer, distanceInput, commitNow]);

  // Copy last time's distance/time into this row (like strength rows).
  const copyPrevious = useCallback((completed?: boolean) => {
    const dist = prevSet?.distance_meters ?? null;
    const dur = prevSet?.duration_seconds ?? null;
    setDistanceInput(toDistStr(dist, distanceUnit));
    setDigitBuffer(secondsToDigits(dur));
    const pace = dist && dur ? computePace(dist, dur) : null;
    onUpdate(set.session_set_id, sessionExerciseId, {
      distance_meters: dist,
      duration_seconds: dur,
      pace_sec_per_km: pace,
      ...(completed != null ? { completed } : {}),
    });
  }, [prevSet, distanceUnit, set.session_set_id, sessionExerciseId, onUpdate]);

  const toggleCompleted = useCallback(() => {
    const completing = !set.completed;
    // Ticking an empty row logs last time's numbers instead of an empty set.
    if (completing && distanceInput.trim() === "" && digitBuffer === "" && hasPrev) {
      copyPrevious(true);
    } else {
      onUpdate(set.session_set_id, sessionExerciseId, {
        completed: completing,
        ...buildUpdates(distanceInput, digitsToSeconds(digitBuffer)),
      });
    }
    if (completing) onComplete?.(sessionExerciseId);
  }, [set, sessionExerciseId, onUpdate, onComplete, distanceInput, digitBuffer, buildUpdates, hasPrev, copyPrevious]);

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
  const inputBg = isCompleted ? colors.successLight : colors.surfaceSecondary;
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
        accessibilityRole="button"
        accessibilityLabel={`Set ${workingNumber ?? set.set_number} options`}
      >
        <Text
          style={[
            rowStyles.badgeText,
            { color: colors.textTertiary },
            isWarmup && { color: "#ffd60a" },
            isCompleted && { color: colors.success },
          ]}
        >
          {isWarmup ? "W" : workingNumber ?? set.set_number}
        </Text>
      </Pressable>

      {/* Previous hint */}
      <Pressable
        style={rowStyles.prevHintWrap}
        onPress={() => { if (hasPrev && !isCompleted) copyPrevious(); }}
        disabled={!hasPrev || isCompleted}
        accessibilityRole="button"
        accessibilityLabel={hasPrev ? `Use previous: ${prevHint}` : "No previous set"}
      >
        <Text style={[rowStyles.prevHint, { color: colors.textTertiary }]} numberOfLines={1}>
          {prevHint}
        </Text>
      </Pressable>

      {/* Distance input */}
      <TextInput
        style={[rowStyles.cell, { backgroundColor: inputBg, color: inputColor }]}
        value={distanceInput}
        onChangeText={(t) => { setDistanceInput(t); reportDraft(t, digitBuffer); }}
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
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isCompleted }}
        accessibilityLabel={`Complete set ${workingNumber ?? set.set_number}`}
      >
        <Ionicons name="checkmark" size={16} color={isCompleted ? "#fff" : colors.textTertiary} />
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
  prevHintWrap: { flex: 1, minWidth: 40, justifyContent: "center", minHeight: 38 },
  prevHint: { fontSize: 12 },
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
