import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "@/backend/db";
import { useConnectionMode } from "@/utils/useConnectionMode";
import MuscleSplitCard from "@/components/MuscleSplitCard";
import TopLiftsCard from "@/components/TopLiftsCard";
import { prCountsBySession } from "@/utils/sessionPRs";
import type { LiftEntry } from "@/utils/topLifts";
import type { SplitEntry } from "@/utils/muscleSplit";
import exercisesData from "@/assets/data/exercises.json";
import { useTheme } from "@/theme/ThemeContext";
import { useHeaderTop } from "@/utils/useHeaderTop";
import { useUnits, useDistanceUnit, formatCompact } from "@/utils/units";
import { logError } from "@/utils/log";
import WorkoutHistoryCard from "@/components/WorkoutHistoryCard";
import WorkoutCalendarModal from "@/components/WorkoutCalendarModal";
import { SessionWithMeta } from "@/components/WorkoutHistoryList";
import WorkoutChart from "@/components/WorkoutChart";
import { formatDistance, formatDurationShort, formatPaceIn } from "@/utils/cardioUtils";
import { sessionDurationMins } from "@/utils/duration";
import { GOAL_CHOICES, useWeeklyGoal, weeklyStreaks, workoutsThisWeek } from "@/utils/streaks";
import { ModalShell } from "@/components/SettingsUI";

// ─── Stat definitions ─────────────────────────────────────────────────────────

export type StatId =
  | "totalWorkouts"
  | "totalSets"
  | "totalVolume"
  | "totalReps"
  | "uniqueExercises"
  | "heaviestWeight"
  | "longestSession"
  | "avgDuration";

type StatDef = { id: StatId; label: string; description: string };

const ALL_STAT_DEFS: StatDef[] = [
  { id: "totalWorkouts",  label: "Workouts",     description: "Total completed workout sessions" },
  { id: "totalSets",      label: "Sets",          description: "Total completed sets across all workouts" },
  { id: "totalVolume",    label: "Volume",        description: "Total weight × reps lifted" },
  { id: "totalReps",      label: "Reps",          description: "Total reps completed across all workouts" },
  { id: "uniqueExercises",label: "Exercises",     description: "Number of distinct exercises performed" },
  { id: "heaviestWeight", label: "Heaviest",      description: "Maximum single-set weight ever lifted" },
  { id: "longestSession", label: "Longest",       description: "Duration of your longest workout" },
  { id: "avgDuration",    label: "Avg Time",      description: "Average duration of all workouts" },
];

const DEFAULT_STATS: StatId[] = ["totalWorkouts", "totalSets", "totalVolume"];
const STATS_STORAGE_KEY = "@gym_tracker_profile_stats";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMinutes(mins: number): string {
  if (mins === 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type AllStats = {
  totalWorkouts: number;
  totalVolume: number;
  totalExercises: number;
  totalSets: number;
  totalReps: number;
  heaviestWeight: number;
  longestSession: number;
  avgDuration: number;
};

// exercise id → primary muscles, for the muscle split card.
const LIBRARY_MUSCLES = new Map<string, string[]>(
  (exercisesData as { id: string; primaryMuscles?: string[] }[]).map((e) => [e.id, e.primaryMuscles ?? []]),
);

export default function ProfileScreen() {
  const headerTop = useHeaderTop();
  const router = useRouter();
  const { colors } = useTheme();
  const connection = useConnectionMode();
  const { toDisplay, label: unitLabel } = useUnits();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [sessions, setSessions] = useState<SessionWithMeta[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useWeeklyGoal();
  const [goalOpen, setGoalOpen] = useState(false);
  const [splitEntries, setSplitEntries] = useState<(SplitEntry & LiftEntry)[]>([]);
  const [customMuscles, setCustomMuscles] = useState<Record<string, string[]>>({});
  const musclesOf = useCallback(
    (id: string) => customMuscles[id] ?? LIBRARY_MUSCLES.get(id),
    [customMuscles],
  );
  const [stats, setStats] = useState<AllStats>({
    totalWorkouts: 0, totalVolume: 0, totalExercises: 0, totalSets: 0,
    totalReps: 0, heaviestWeight: 0, longestSession: 0, avgDuration: 0,
  });
  const [selectedStats, setSelectedStats] = useState<StatId[]>(DEFAULT_STATS);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'strength' | 'cardio'>('all');
  const { distanceUnit } = useDistanceUnit();
  const [cardioStats, setCardioStats] = useState<{
    totalDistanceMeters: number;
    totalDurationSeconds: number;
    totalCardioSessions: number;
    longestRunMeters: number;
    fastestPaceSecPerKm: number | null;
  } | null>(null);

  const hasDataRef = useRef(false);
  const lastFetchedRef = useRef(0);
  // Loads overlap (focus, pull-to-refresh, a delete right after another);
  // only the newest one may write state, or an older one finishing last
  // brings back a workout that was just deleted.
  const loadSeqRef = useRef(0);
  useEffect(() => () => { loadSeqRef.current++; }, []);

  const loadProfile = useCallback(async (isRefresh = false) => {
    const now = Date.now();
    const isStale = now - lastFetchedRef.current > 30_000;

    if (hasDataRef.current && !isStale && !isRefresh) return;
    const seq = ++loadSeqRef.current;
    const superseded = () => seq !== loadSeqRef.current;

    if (isRefresh) {
      setRefreshing(true);
    } else if (!hasDataRef.current) {
      setLoading(true);
    }
    setError(null);

    // Load saved stat selection in parallel with the DB fetch
    const savedStatsPromise = AsyncStorage.getItem(STATS_STORAGE_KEY).then((val) => {
      if (!val) return DEFAULT_STATS;
      try {
        const parsed = JSON.parse(val) as StatId[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) { logError("profile.loadCachedStats", e); }
      return DEFAULT_STATS;
    });

    try {
      const { data: { user } } = await db.getUser();
      if (!user) { setError("Not authenticated"); return; }

      const [profileResult, sessionsResult, savedStatIds, cardioStatsResult, customResult] = await Promise.all([
        db.getUserProfile(user.id),
        db.getWorkoutSessions(user.id),
        savedStatsPromise,
        db.getCardioStats(user.id),
        db.getCustomExercises(user.id),
      ]);
      if (superseded()) return;

      const custom: Record<string, string[]> = {};
      for (const c of customResult?.data ?? []) {
        if (c.primary_muscle) custom[c.exercise_id] = [c.primary_muscle];
      }
      setCustomMuscles(custom);

      if (cardioStatsResult.data) setCardioStats(cardioStatsResult.data);

      setSelectedStats(savedStatIds);

      if (profileResult.error) { setError(profileResult.error.message); return; }
      setProfile(profileResult.data);

      if (sessionsResult.error) { setError(sessionsResult.error.message); return; }
      const sessionsData = sessionsResult.data ?? [];

      const sessionIds = sessionsData.map((s: any) => s.session_id);
      const { data: allExercisesFlat, error: exercisesError } = await db.getBatchSessionExercises(sessionIds);
      if (superseded()) return;
      // Totals built from a failed read would all show 0.
      if (exercisesError) { setError(exercisesError.message ?? "Couldn't load your workouts"); return; }

      const exerciseIds = (allExercisesFlat ?? []).map((ex: any) => ex.session_exercise_id);
      const { data: allSetsFlat, error: setsError } = await db.getBatchSessionExerciseSets(exerciseIds);
      if (superseded()) return;
      if (setsError) { setError(setsError.message ?? "Couldn't load your workouts"); return; }

      const exercisesBySession: Record<number, any[]> = {};
      for (const ex of allExercisesFlat ?? []) {
        (exercisesBySession[ex.session_id] ??= []).push(ex);
      }
      const setsByExercise: Record<number, any[]> = {};
      for (const set of allSetsFlat ?? []) {
        (setsByExercise[set.session_exercise_id] ??= []).push(set);
      }

      let overallVolume = 0;
      let overallSets = 0;
      let overallReps = 0;
      let heaviestWeight = 0;
      const uniqueExercises = new Set<string>();

      const prCounts = prCountsBySession(sessionsData, exercisesBySession, setsByExercise);
      const enriched: SessionWithMeta[] = sessionsData.map((s: any) => {
        const exs = exercisesBySession[s.session_id] ?? [];
        let sessionVolume = 0;
        let sessionReps = 0;
        let sessionCardioDistance = 0;
        let sessionCardioDuration = 0;
        let sessionHasCardio = false;
        for (const ex of exs) {
          uniqueExercises.add(ex.exercise_id);
          const isCardio = ex.exercise_type === 'cardio';
          if (isCardio) sessionHasCardio = true;
          for (const set of setsByExercise[ex.session_exercise_id] ?? []) {
            if (set.completed !== false) { // null on older rows counts as done, as in history
              overallSets++;
              if (!isCardio) {
                if (set.weight != null && set.reps != null) {
                  sessionVolume += set.weight * set.reps;
                  heaviestWeight = Math.max(heaviestWeight, set.weight);
                }
                if (set.reps != null) sessionReps += set.reps;
              } else {
                sessionCardioDistance += set.distance_meters ?? 0;
                sessionCardioDuration += set.duration_seconds ?? 0;
              }
            }
          }
        }
        overallVolume += sessionVolume;
        overallReps += sessionReps;
        return {
          session_id: s.session_id,
          session_name: s.session_name,
          session_date: s.session_date,
          start_time: s.start_time,
          end_time: s.end_time,
          notes: s.notes,
          photo_url: s.photo_url ?? null,
          exerciseCount: exs.length,
          totalVolume: sessionVolume,
          totalReps: sessionReps,
          exerciseNames: exs.map((ex: any) => ex.exercise_name),
          totalCardioDistanceMeters: sessionCardioDistance,
          totalCardioDurationSeconds: sessionCardioDuration,
          hasCardio: sessionHasCardio,
          prCount: prCounts[s.session_id] ?? 0,
        };
      });

      enriched.sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime());

      // Compute duration stats
      let longestSession = 0;
      let totalDurationMins = 0;
      let durationCount = 0;
      for (const s of sessionsData) {
        const mins = sessionDurationMins(s.session_date, s.start_time, s.end_time);
        if (mins !== null) {
          longestSession = Math.max(longestSession, mins);
          totalDurationMins += mins;
          durationCount++;
        }
      }
      const avgDuration = durationCount > 0 ? Math.round(totalDurationMins / durationCount) : 0;

      setSplitEntries(sessionsData.flatMap((s: any) =>
        (exercisesBySession[s.session_id] ?? []).map((ex: any) => ({
          date: s.session_date,
          exerciseId: ex.exercise_id,
          exerciseName: ex.exercise_name,
          exerciseType: ex.exercise_type,
          sets: setsByExercise[ex.session_exercise_id] ?? [],
        }))));
      setSessions(enriched);
      setStats({
        totalWorkouts: enriched.length,
        totalVolume: overallVolume,
        totalExercises: uniqueExercises.size,
        totalSets: overallSets,
        totalReps: overallReps,
        heaviestWeight,
        longestSession,
        avgDuration,
      });
      hasDataRef.current = true;
      lastFetchedRef.current = Date.now();
    } catch (e: any) {
      if (!superseded()) setError(e.message ?? "Something went wrong");
    } finally {
      if (!superseded()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  const handleDeleteSession = useCallback((sessionId: number) => {
    setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    // Totals (workouts, volume, cardio) come from the full load; redo it
    // quietly so they don't keep counting the deleted workout.
    lastFetchedRef.current = 0;
    loadProfile();
  }, [loadProfile]);

  const handleEditWorkout = useCallback((sessionId: number) => {
    // Reload quietly on return; dropping hasData showed the full-screen
    // spinner and lost the scroll position, even after a cancelled edit.
    lastFetchedRef.current = 0;
    router.push(`/workout-edit/${sessionId}` as any);
  }, [router]);

  // ── Stat customizer helpers ──────────────────────────────────────────────────

  const toggleStat = useCallback((id: StatId) => {
    setSelectedStats((prev) => {
      if (prev.includes(id)) {
        // Don't allow deselecting the last stat
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== id);
      }
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  }, []);

  const handleSaveStats = useCallback(async (ids: StatId[]) => {
    setSelectedStats(ids);
    await AsyncStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(ids));
    setCustomizerOpen(false);
  }, []);

  // ── Stat value formatting ────────────────────────────────────────────────────

  function getStatDisplay(id: StatId): { value: string; label: string } {
    switch (id) {
      case "totalWorkouts":   return { value: String(stats.totalWorkouts), label: "Workouts" };
      case "totalSets":       return { value: formatCompact(stats.totalSets), label: "Sets" };
      case "totalVolume":     return { value: formatCompact(toDisplay(stats.totalVolume)), label: `Vol (${unitLabel})` };
      case "totalReps":       return { value: formatCompact(stats.totalReps), label: "Reps" };
      case "uniqueExercises": return { value: String(stats.totalExercises), label: "Exercises" };
      case "heaviestWeight":  return { value: (toDisplay(stats.heaviestWeight) ?? stats.heaviestWeight).toLocaleString(), label: `Best (${unitLabel})` };
      case "longestSession":  return { value: formatMinutes(stats.longestSession), label: "Longest" };
      case "avgDuration":     return { value: formatMinutes(stats.avgDuration), label: "Avg Time" };
    }
  }

  // ── Weekly dots ──────────────────────────────────────────────────────────────

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return { dateStr: localDateStr(d), label: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1) };
  });
  const workoutDates = new Set(sessions.map((s) => s.session_date.slice(0, 10)));
  const sessionDates = sessions.map((s) => s.session_date.slice(0, 10));
  const { current: currentStreak, longest: longestStreak } = weeklyStreaks(sessionDates);
  const thisWeekCount = workoutsThisWeek(sessionDates);
  const weeks = (n: number) => `${n} ${n === 1 ? "week" : "weeks"}`;
  const initials = profile?.username ? profile.username.slice(0, 2).toUpperCase() : "?";

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 10 }}>Loading profile…</Text>
      </View>
    );
  }

  const listHeader = (
    <>
      {/* ── Top bar ── */}
      <View style={[styles.topBar, { paddingTop: headerTop, borderBottomColor: colors.border }]}>
        <Text style={[styles.username, { color: colors.text }]}>
          {profile?.username ?? "Profile"}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.settingsBtn,
            { backgroundColor: colors.surface },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => router.push("/settings")}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {connection === "offline" && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.warningLight }]}>
          <Text style={[styles.offlineText, { color: colors.warning }]}>Offline. Showing saved data; workouts sync when you reconnect.</Text>
        </View>
      )}
      {error && (
        <Text style={{ color: colors.danger, marginHorizontal: 20, marginBottom: 8, fontSize: 14 }}>{error}</Text>
      )}

      {/* ── Avatar + bio ── */}
      <View style={styles.avatarSection}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatarCircle} />
        ) : (
          <View style={[styles.avatarCircle, { backgroundColor: colors.surface }]}>
            <Text style={[styles.avatarInitials, { color: colors.primary }]}>{initials}</Text>
          </View>
        )}
        <View style={styles.bioInfo}>
          <Text style={[styles.bioName, { color: colors.text }]}>{profile?.username ?? "—"}</Text>
          {!!profile?.bio && (
            <Text style={[styles.bioText, { color: colors.textSecondary }]} numberOfLines={2}>
              {profile.bio}
            </Text>
          )}
          {currentStreak > 0 && (
            <View style={styles.streakRow}>
              <Ionicons name="flame" size={16} color="#ff9f0a" />
              <Text style={[styles.streakText, { color: colors.textSecondary }]}>
                {currentStreak} week streak
              </Text>
            </View>
          )}
        </View>

        {/* ── Stats row with customize button ── */}
        <View style={styles.statsBlock}>
          <View style={styles.statsBlockHeader}>
            <Pressable
              style={({ pressed }) => [styles.customizeBtn, pressed && { opacity: 0.5 }]}
              onPress={() => setCustomizerOpen(true)}
              hitSlop={8}
            >
              <Ionicons name="pencil-outline" size={13} color={colors.primary} />
              <Text style={[styles.customizeBtnText, { color: colors.primary }]}>Customize</Text>
            </Pressable>
          </View>
          <View style={styles.statsRow}>
            {selectedStats.map((id, i) => {
              const { value, label } = getStatDisplay(id);
              return (
                <View key={id} style={{ flexDirection: "row", flex: 1 }}>
                  {i > 0 && <View style={[styles.statDivider, { backgroundColor: colors.border }]} />}
                  <View style={styles.statCell}>
                    <Text style={[styles.statNum, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* ── Weekly activity ── */}
      <View style={[styles.card, { backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12 }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>THIS WEEK</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {longestStreak > 0 && (
              <View style={styles.bestStreakRow}>
                <Ionicons name="trophy-outline" size={14} color={colors.primary} />
                <Text style={[styles.bestStreakText, { color: colors.primary }]}>Best: {weeks(longestStreak)}</Text>
              </View>
            )}
            <Pressable
              onPress={() => setCalendarOpen(true)}
              hitSlop={8}
              style={styles.bestStreakRow}
              accessibilityRole="button"
              accessibilityLabel="Open workout calendar"
            >
              <Ionicons name="calendar-outline" size={14} color={colors.primary} />
              <Text style={[styles.bestStreakText, { color: colors.primary }]}>Calendar</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.dotsRow}>
          {last7.map(({ dateStr, label }, i) => {
            const active = workoutDates.has(dateStr);
            return (
              <View key={i} style={styles.dotCell}>
                <View style={[
                  styles.dot,
                  { backgroundColor: active ? colors.primary : colors.surfaceSecondary },
                ]}>
                  {active && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.dotLabel, { color: active ? colors.primary : colors.textTertiary }]}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
        {/* Weekly goal (like Hevy/Strong): progress toward N workouts this week */}
        <Pressable
          onPress={() => setGoalOpen(true)}
          style={[styles.goalRow, { borderTopColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={weeklyGoal ? `Weekly goal: ${thisWeekCount} of ${weeklyGoal} workouts. Change goal` : "Set a weekly workout goal"}
        >
          {weeklyGoal ? (
            <>
              <View style={[styles.goalTrack, { backgroundColor: colors.surfaceSecondary }]}>
                <View style={[styles.goalFill, {
                  backgroundColor: thisWeekCount >= weeklyGoal ? colors.success : colors.primary,
                  width: `${Math.min(100, (thisWeekCount / weeklyGoal) * 100)}%`,
                }]} />
              </View>
              <Text style={[styles.goalText, { color: thisWeekCount >= weeklyGoal ? colors.text : colors.textSecondary }]}>
                {thisWeekCount >= weeklyGoal ? "Goal hit! " : ""}{thisWeekCount}/{weeklyGoal} workouts
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="flag-outline" size={14} color={colors.primary} />
              <Text style={[styles.goalText, { color: colors.primary, flex: 1 }]}>Set a weekly goal</Text>
              <Text style={[styles.goalText, { color: colors.textSecondary }]}>
                {thisWeekCount} {thisWeekCount === 1 ? "workout" : "workouts"} this week
              </Text>
            </>
          )}
        </Pressable>
      </View>

      <ModalShell visible={goalOpen} onClose={() => setGoalOpen(false)} title="Weekly Goal">
        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center", marginBottom: 16 }}>
          Workouts per week
        </Text>
        <View style={styles.goalChips}>
          {GOAL_CHOICES.map((n) => {
            const sel = n === weeklyGoal;
            return (
              <Pressable
                key={n}
                onPress={() => { setWeeklyGoal(n); setGoalOpen(false); }}
                style={[styles.goalChip, { backgroundColor: sel ? colors.primary : colors.surfaceSecondary }]}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`${n} per week`}
              >
                <Text style={{ fontSize: 16, fontWeight: "700", color: sel ? "#fff" : colors.text }}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
        {weeklyGoal != null && (
          <Pressable onPress={() => { setWeeklyGoal(null); setGoalOpen(false); }} style={{ alignSelf: "center", marginTop: 16, padding: 6 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>No goal</Text>
          </Pressable>
        )}
      </ModalShell>

      {/* ── Personal records ── */}
      <Pressable
        onPress={() => router.push("/records" as any)}
        style={({ pressed }) => [styles.card, {
          backgroundColor: pressed ? colors.surfaceSecondary : colors.surface,
          marginHorizontal: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 12,
        }]}
        accessibilityRole="button"
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.warningLight }}>
          <Ionicons name="trophy-outline" size={17} color={colors.warning} />
        </View>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: colors.text }}>Personal Records</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Pressable>

      {/* ── Muscle split ── */}
      {sessions.length > 0 && <MuscleSplitCard entries={splitEntries} musclesOf={musclesOf} />}

      {/* ── Top lifts (est. 1RM trends) ── */}
      {sessions.length > 0 && <TopLiftsCard entries={splitEntries} />}

      <WorkoutCalendarModal visible={calendarOpen} onClose={() => setCalendarOpen(false)} sessions={sessions} />

      {/* ── Progress chart ── */}
      {sessions.length > 0 && <WorkoutChart sessions={sessions} />}

      {/* ── Cardio Summary ── */}
      {cardioStats && cardioStats.totalCardioSessions > 0 && (
        <View style={[styles.card, { backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12 }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>CARDIO SUMMARY</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <View>
              <Text style={[styles.statNum, { color: colors.text, fontSize: 17 }]}>
                {formatDistance(cardioStats.totalDistanceMeters, distanceUnit)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Distance</Text>
            </View>
            <View>
              <Text style={[styles.statNum, { color: colors.text, fontSize: 17 }]}>
                {formatDurationShort(cardioStats.totalDurationSeconds)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Time</Text>
            </View>
            <View>
              <Text style={[styles.statNum, { color: colors.text, fontSize: 17 }]}>
                {String(cardioStats.totalCardioSessions)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Sessions</Text>
            </View>
            {cardioStats.longestRunMeters > 0 && (
              <View>
                <Text style={[styles.statNum, { color: colors.text, fontSize: 17 }]}>
                  {formatDistance(cardioStats.longestRunMeters, distanceUnit)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Best Run</Text>
              </View>
            )}
            {cardioStats.fastestPaceSecPerKm != null && (
              <View>
                <Text style={[styles.statNum, { color: colors.text, fontSize: 17 }]}>
                  {formatPaceIn(cardioStats.fastestPaceSecPerKm, distanceUnit)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Best Pace</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Workout history header + filter ── */}
      <View style={[styles.sectionHeader, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Workouts</Text>
        {sessions.some((s) => s.hasCardio) && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['all', 'strength', 'cardio'] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => setHistoryFilter(f)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 12,
                  backgroundColor: historyFilter === f ? colors.primary : colors.surfaceSecondary,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: historyFilter === f ? '#fff' : colors.textSecondary, textTransform: 'capitalize' }}>
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </>
  );

  const listEmpty = (
    <View style={{ alignItems: "center", paddingVertical: 48, gap: 10, marginHorizontal: 16 }}>
      <Text style={{ fontSize: 48 }}>🏋️</Text>
      <Text style={{ fontSize: 18, fontWeight: "700", color: colors.textSecondary }}>No workouts yet</Text>
      <Text style={{ fontSize: 14, color: colors.textTertiary, textAlign: "center" }}>
        Complete your first workout to see it here
      </Text>
    </View>
  );

  const filteredSessions = historyFilter === 'all'
    ? sessions
    : historyFilter === 'cardio'
    ? sessions.filter((s) => s.hasCardio)
    : sessions.filter((s) => !s.hasCardio);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={filteredSessions}
        keyExtractor={(item) => String(item.session_id)}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadProfile(true)} tintColor={colors.primary} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        renderItem={({ item }) => (
          <View style={{ marginHorizontal: 16 }}>
            <WorkoutHistoryCard
              session_id={item.session_id}
              sessionName={item.session_name}
              sessionDate={item.session_date}
              startTime={item.start_time}
              endTime={item.end_time}
              exerciseCount={item.exerciseCount}
              totalVolume={item.totalVolume}
              notes={item.notes}
              photo_url={item.photo_url}
              exerciseNames={item.exerciseNames}
              onDelete={handleDeleteSession}
              onEditWorkout={handleEditWorkout}
              totalCardioDistanceMeters={item.totalCardioDistanceMeters ?? 0}
              totalCardioDurationSeconds={item.totalCardioDurationSeconds ?? 0}
              distanceUnit={distanceUnit}
              prCount={item.prCount ?? 0}
            />
          </View>
        )}
      />
      <StatCustomizerModal
        visible={customizerOpen}
        selected={selectedStats}
        onToggle={toggleStat}
        onSave={handleSaveStats}
        onClose={() => setCustomizerOpen(false)}
      />
    </View>
  );
}

// ─── Stat Customizer Modal ────────────────────────────────────────────────────

function StatCustomizerModal({
  visible,
  selected,
  onToggle,
  onSave,
  onClose,
}: {
  visible: boolean;
  selected: StatId[];
  onToggle: (id: StatId) => void;
  onSave: (ids: StatId[]) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  // Local draft so we can cancel without saving
  const [draft, setDraft] = useState<StatId[]>(selected);

  // Sync draft when modal opens
  const handleOpen = useCallback(() => setDraft(selected), [selected]);

  const toggleDraft = useCallback((id: StatId) => {
    setDraft((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // need at least 1
        return prev.filter((s) => s !== id);
      }
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  }, []);

  const atMax = draft.length >= 3;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

          <Text style={[styles.sheetTitle, { color: colors.text }]}>Customize Stats</Text>
          <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
            Pick up to 3 stats to show on your profile
            {atMax ? " — deselect one to swap" : ""}
          </Text>

          {ALL_STAT_DEFS.map((def) => {
            const isSelected = draft.includes(def.id);
            const disabled = !isSelected && atMax;
            return (
              <Pressable
                key={def.id}
                style={({ pressed }) => [
                  styles.statRow,
                  { borderBottomColor: colors.border },
                  pressed && !disabled && { backgroundColor: colors.surfaceSecondary },
                  disabled && { opacity: 0.38 },
                ]}
                onPress={() => !disabled && toggleDraft(def.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statRowLabel, { color: colors.text }]}>{def.label}</Text>
                  <Text style={[styles.statRowDesc, { color: colors.textTertiary }]}>{def.description}</Text>
                </View>
                <View style={[
                  styles.checkbox,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : "transparent",
                  },
                ]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </Pressable>
            );
          })}

          <View style={styles.sheetActions}>
            <Pressable
              style={[styles.sheetCancelBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={onClose}
            >
              <Text style={[styles.sheetCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.sheetSaveBtn, { backgroundColor: colors.primary }]}
              onPress={() => onSave(draft)}
            >
              <Text style={styles.sheetSaveText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  username: { flex: 1, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  settingsBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  offlineBanner: { marginHorizontal: 16, marginTop: 10, padding: 10, borderRadius: 10 },
  offlineText: { fontSize: 13, fontWeight: "600", textAlign: "center" },

  avatarSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 16,
    flexWrap: "wrap",
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
  },
  avatarInitials: { fontSize: 28, fontWeight: "800" },
  bioInfo: { flex: 1 },
  bioName: { fontSize: 20, fontWeight: "700" },
  bioText: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  streakText: { fontSize: 14, fontWeight: "500" },

  statsBlock: { width: "100%" },
  statsBlockHeader: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 6 },
  customizeBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  customizeBtnText: { fontSize: 12, fontWeight: "600" },

  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  statNum: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 32, alignSelf: "center" },

  card: { borderRadius: 14, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  cardTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  bestStreakRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  bestStreakText: { fontSize: 12, fontWeight: "600" },
  dotsRow: { flexDirection: "row", justifyContent: "space-between" },
  dotCell: { alignItems: "center", gap: 6 },
  dot: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  dotLabel: { fontSize: 11, fontWeight: "600" },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  goalTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  goalFill: { height: 6, borderRadius: 3 },
  goalText: { fontSize: 13, fontWeight: "600" },
  goalChips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  goalChip: { width: 34, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  sectionHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  sectionTitle: { fontSize: 20, fontWeight: "700" },

  // Customizer modal
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 12 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: "700", paddingHorizontal: 20, marginBottom: 4 },
  sheetSubtitle: { fontSize: 13, paddingHorizontal: 20, marginBottom: 16 },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statRowLabel: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  statRowDesc: { fontSize: 12 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  sheetActions: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 20 },
  sheetCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  sheetCancelText: { fontSize: 15, fontWeight: "600" },
  sheetSaveBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  sheetSaveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
