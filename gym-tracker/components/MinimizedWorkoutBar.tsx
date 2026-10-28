import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";
import { useActiveWorkout } from "@/utils/ActiveWorkoutContext";
import { db } from "@/backend/db";
import { cancelRestDoneNotification } from "@/utils/notifications";
import { clearActiveRestTimer } from "@/utils/useRestTimer";
import ConfirmModal from "./ConfirmModal";

export const TAB_BAR_HEIGHT = 64;

export default function MinimizedWorkoutBar() {
  const { activeWorkout, clearActiveWorkout } = useActiveWorkout();
  const { colors } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const isOnWorkoutScreen = segments.includes("workout" as never);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  // Pulsing dot animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!activeWorkout) return;
    const tick = () =>
      setElapsed(Math.floor((Date.now() - activeWorkout.startTimestamp) / 1000));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeWorkout]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ":" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleResume = useCallback(() => {
    if (!activeWorkout) return;
    router.push({ pathname: "/workout", params: { sessionId: String(activeWorkout.sessionId) } });
  }, [activeWorkout, router]);

  const handleConfirmDiscard = useCallback(async () => {
    if (!activeWorkout) return;
    setShowDiscard(false);
    cancelRestDoneNotification();
    clearActiveRestTimer();
    await db.deleteWorkoutSession(activeWorkout.sessionId);
    clearActiveWorkout();
  }, [activeWorkout, clearActiveWorkout]);

  if (!activeWorkout || isOnWorkoutScreen) return null;

  return (
    <>
      <Pressable
        style={[
          styles.bar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            bottom: TAB_BAR_HEIGHT + insets.bottom + 8,
          },
        ]}
        onPress={handleResume}
      >
        {/* Live pulse dot */}
        <View style={styles.dotContainer}>
          <Animated.View
            style={[
              styles.dotRing,
              { backgroundColor: colors.success + "30", transform: [{ scale: pulseAnim }] },
            ]}
          />
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
        </View>

        {/* Workout info */}
        <View style={styles.textGroup}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {activeWorkout.sessionName}
          </Text>
          <Text style={[styles.timer, { color: colors.textSecondary }]}>
            {formatTime(elapsed)} · tap to resume
          </Text>
        </View>

        {/* Resume + trash */}
        <View style={styles.actions}>
          <View style={[styles.resumePill, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="play" size={13} color={colors.primary} />
            <Text style={[styles.resumeText, { color: colors.primary }]}>Resume</Text>
          </View>
          <Pressable
            onPress={(e) => { e.stopPropagation(); setShowDiscard(true); }}
            hitSlop={10}
            style={styles.trashBtn}
          >
            <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      </Pressable>

      <ConfirmModal
        visible={showDiscard}
        title="Discard Workout"
        message="This workout will be permanently deleted. This cannot be undone."
        confirmText="Discard"
        cancelText="Keep"
        confirmStyle="danger"
        icon="trash-outline"
        onConfirm={handleConfirmDiscard}
        onCancel={() => setShowDiscard(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  dotContainer: {
    width: 14,
    height: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  dotRing: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  textGroup: { flex: 1 },
  name: { fontSize: 14, fontWeight: "700" },
  timer: { fontSize: 12, fontWeight: "500", marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  resumePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  resumeText: { fontSize: 12, fontWeight: "700" },
  trashBtn: { padding: 2 },
});
