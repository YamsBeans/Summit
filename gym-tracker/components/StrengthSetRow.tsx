import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits } from "@/utils/units";
import { formatNumberInput, parseDecimalInput, parseIntInput } from "@/utils/numberInput";
import { tapLight } from "@/utils/haptics";

/**
 * One weight × reps row in the workout logger: set number (tap for
 * options), last session's numbers (tap to copy), inputs and the check.
 */
const StrengthSetRow = memo(function StrengthSetRow({
  set,
  sessionExerciseId,
  onUpdate,
  onSetNumberPress,
  prevSet,
  onComplete,
  workingNumber,
  isPR = false,
}: {
  set: any;
  workingNumber?: number;
  isPR?: boolean;
  sessionExerciseId: number;
  onUpdate: (id: number, exId: number, updates: any) => void;
  onSetNumberPress: (set: any, sessionExerciseId: number) => void;
  prevSet?: any;
  onComplete?: (sessionExerciseId: number) => void;
}) {
  const { colors, isDark } = useTheme();
  // Weights are stored in lbs; inputs show and accept the user's display unit.
  const { unit, toDisplay, toStorage } = useUnits();
  const displayWeight = toDisplay(set.weight);
  const [weight, setWeight] = useState(formatNumberInput(displayWeight));
  const [reps, setReps] = useState(formatNumberInput(set.reps));
  const isFocused = useRef<"weight" | "reps" | null>(null);
  const repsRef = useRef<TextInput>(null);

  useEffect(() => {
    if (isFocused.current !== "weight") setWeight(formatNumberInput(toDisplay(set.weight)));
    if (isFocused.current !== "reps") setReps(formatNumberInput(set.reps));
  }, [set.weight, set.reps, unit, toDisplay]);

  // Only write when the value the user sees actually changed, so a kg↔lbs
  // round-trip never rewrites a stored weight with a rounded one.
  const weightUpdate = useCallback((text: string) => {
    const val = parseDecimalInput(text);
    if (val === displayWeight) return undefined;
    return toStorage(val);
  }, [displayWeight, toStorage]);

  const commitWeight = useCallback(() => {
    const next = weightUpdate(weight);
    if (next !== undefined) onUpdate(set.session_set_id, sessionExerciseId, { weight: next });
    setWeight(formatNumberInput(parseDecimalInput(weight)));
  }, [weight, weightUpdate, set.session_set_id, sessionExerciseId, onUpdate]);

  const commitReps = useCallback(() => {
    const val = parseIntInput(reps);
    if (val !== set.reps) onUpdate(set.session_set_id, sessionExerciseId, { reps: val });
    setReps(formatNumberInput(val));
  }, [reps, set.reps, set.session_set_id, sessionExerciseId, onUpdate]);

  const hasPrev = prevSet?.weight != null || prevSet?.reps != null;

  const toggleCompleted = useCallback(() => {
    const completing = !set.completed;
    const updates: any = { completed: completing };
    // Completing an empty set copies last session's numbers (like Strong/Hevy):
    // the "previous" column is the plan, so one tap logs "same as last time".
    if (completing && weight.trim() === "" && reps.trim() === "" && hasPrev) {
      setWeight(formatNumberInput(toDisplay(prevSet.weight)));
      setReps(formatNumberInput(prevSet.reps));
      // Copy the stored lbs value directly — going through the kg text and
      // back would drift it by rounding (225 lb → 102.1 kg → 225.1 lb).
      if (prevSet.weight !== set.weight) updates.weight = prevSet.weight ?? null;
      if (prevSet.reps !== set.reps) updates.reps = prevSet.reps ?? null;
    } else {
      const nextWeight = weightUpdate(weight);
      if (nextWeight !== undefined) updates.weight = nextWeight;
      const repsVal = parseIntInput(reps);
      if (repsVal !== set.reps) updates.reps = repsVal;
    }
    onUpdate(set.session_set_id, sessionExerciseId, updates);
    if (completing) {
      tapLight();
      onComplete?.(sessionExerciseId);
    }
  }, [weight, reps, set, hasPrev, prevSet, toDisplay, weightUpdate, sessionExerciseId, onUpdate, onComplete]);

  // Tap the "previous" value to copy it into this set without completing it.
  const fillFromPrevious = useCallback(() => {
    if (!hasPrev || set.completed) return;
    const updates: any = {};
    if (prevSet.weight != null) {
      setWeight(formatNumberInput(toDisplay(prevSet.weight)));
      if (prevSet.weight !== set.weight) updates.weight = prevSet.weight;
    }
    if (prevSet.reps != null) {
      setReps(formatNumberInput(prevSet.reps));
      if (prevSet.reps !== set.reps) updates.reps = prevSet.reps;
    }
    if (Object.keys(updates).length > 0) {
      tapLight();
      onUpdate(set.session_set_id, sessionExerciseId, updates);
    }
  }, [hasPrev, prevSet, set, toDisplay, sessionExerciseId, onUpdate]);

  const isCompleted = set.completed === true;
  const isWarmup = set.is_warmup === true;

  const prevWeight = toDisplay(prevSet?.weight);
  const prevText = prevWeight != null && prevSet?.reps != null
    ? `${prevWeight} × ${prevSet.reps}`
    : prevWeight != null
    ? `${prevWeight} ${unit}`
    : prevSet?.reps != null
    ? `${prevSet.reps} reps`
    : "—";

  const rowBg = isCompleted
    ? (colors.successLight + "80")
    : "transparent";

  return (
    <View style={[rowStyles.row, { backgroundColor: rowBg, borderBottomColor: colors.border }]}>
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
        accessibilityLabel={`Set ${set.set_number} options`}
      >
        <Text style={[
          rowStyles.badgeText,
          { color: colors.textTertiary },
          isWarmup && { color: colors.warning },
          isCompleted && { color: colors.success },
        ]}>
          {isWarmup ? "W" : workingNumber ?? set.set_number}
        </Text>
        {isPR && isCompleted && (
          <View
            style={[rowStyles.prBadge, { backgroundColor: colors.warning, borderColor: colors.background }]}
            accessibilityLabel="Personal record"
          >
            <Ionicons name="trophy" size={9} color={isDark ? "#1a1300" : "#fff"} />
          </View>
        )}
      </Pressable>

      {/* Previous — tap to copy into this set */}
      <Pressable
        style={rowStyles.prevBtn}
        onPress={fillFromPrevious}
        disabled={!hasPrev || isCompleted}
        accessibilityRole="button"
        accessibilityLabel={hasPrev ? `Use previous: ${prevText}` : "No previous set"}
      >
        <Text style={[rowStyles.prevText, { color: colors.textTertiary }]} numberOfLines={1}>
          {prevText}
        </Text>
      </Pressable>

      {/* Weight input */}
      <TextInput
        style={[rowStyles.input, {
          backgroundColor: isCompleted ? colors.successLight : colors.surfaceSecondary,
          color: isCompleted ? colors.success : colors.text,
        }]}
        value={weight}
        onChangeText={setWeight}
        onFocus={() => { isFocused.current = "weight"; }}
        onBlur={() => { isFocused.current = null; commitWeight(); }}
        keyboardType="decimal-pad"
        // Enter / Next (Android, web) jumps to reps, like Strong.
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => repsRef.current?.focus()}
        placeholder={prevWeight != null ? String(prevWeight) : "—"}
        placeholderTextColor={colors.textTertiary}
        editable={!isCompleted}
        selectTextOnFocus
        accessibilityLabel={`Set ${set.set_number} weight in ${unit}`}
      />

      {/* Reps input */}
      <TextInput
        style={[rowStyles.input, {
          backgroundColor: isCompleted ? colors.successLight : colors.surfaceSecondary,
          color: isCompleted ? colors.success : colors.text,
        }]}
        ref={repsRef}
        value={reps}
        onChangeText={setReps}
        returnKeyType="done"
        onFocus={() => { isFocused.current = "reps"; }}
        onBlur={() => { isFocused.current = null; commitReps(); }}
        keyboardType="number-pad"
        placeholder={prevSet?.reps != null ? String(prevSet.reps) : "—"}
        placeholderTextColor={colors.textTertiary}
        editable={!isCompleted}
        selectTextOnFocus
        accessibilityLabel={`Set ${set.set_number} reps`}
      />

      {/* Check button */}
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
        accessibilityLabel={`Complete set ${set.set_number}`}
      >
        <Ionicons
          name="checkmark"
          size={16}
          color={isCompleted ? "#fff" : colors.textTertiary}
        />
      </Pressable>
    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────

export default StrengthSetRow;

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  prBadge: {
    position: "absolute",
    top: -6,
    right: -7,
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  prevBtn: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  prevText: {
    fontSize: 13,
    paddingLeft: 4,
  },
  input: {
    width: 68,
    height: 40,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    padding: 0,
    paddingHorizontal: 4,
  },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
