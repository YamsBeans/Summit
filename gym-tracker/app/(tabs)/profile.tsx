import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db, isOnline } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits, useDistanceUnit, formatVolume } from "@/utils/units";
import { logError } from "@/utils/log";
import WorkoutHistoryCard from "@/components/WorkoutHistoryCard";
import { SessionWithMeta } from "@/components/WorkoutHistoryList";
import WorkoutChart from "@/components/WorkoutChart";
import { formatDistance, formatDurationShort, formatPace } from "@/utils/cardioUtils";

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

function calcStreaks(sessions: SessionWithMeta[]) {
  if (sessions.length === 0) return { current: 0, longest: 0 };
  const dates = new Set(sessions.map((s) => s.session_date.slice(0, 10)));
  const sorted = [...dates].sort();

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000;
    if (diff === 1) { run++; longest = Math.max(longest, run); }
    else run = 1;
  }
  if (sorted.length === 1) longest = 1;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let current = 0;
  let d = new Date(today);
  while (dates.has(localDateStr(d))) { current++; d.setDate(d.getDate() - 1); }
  if (current === 0) {
    d = new Date(today);
    d.setDate(d.getDate() - 1);
    while (dates.has(localDateStr(d))) { current++; d.setDate(d.getDate() - 1); }
  }

  return { current, longest };
}

function getDurationMins(sessionDate: string, startTime: string, endTime: string | null): number | null {
  if (!endTime) return null;
  const toDate = (t: string) =>
    t.includes("T") || t.length > 10 ? new Date(t) : new Date(`${sessionDate}T${t}`);
  const start = toDate(startTime);
  const end = toDate(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return null;
  return Math.floor(ms / 60000);
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

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { toDisplay, label: unitLabel } = useUnits();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [sessions, setSessions] = useState<SessionWithMeta[]>([]);
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

  const loadProfile = useCallback(async (isRefresh = false) => {
    const now = Date.now();
    const isStale = now - lastFetchedRef.current > 30_000;

    if (hasDataRef.current && !isStale && !isRefresh) return;

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

      const [profileResult, sessionsResult, savedStatIds, cardioStatsResult] = await Promise.all([
        db.getUserProfile(user.id),
        db.getWorkoutSessions(user.id),
        savedStatsPromise,
        db.getCardioStats(user.id),
      ]);

      if (cardioStatsResult.data) setCardioStats(cardioStatsResult.data);

      setSelectedStats(savedStatIds);

      if (profileResult.error) { setError(profileResult.error.message); return; }
      setProfile(profileResult.data);

      if (sessionsResult.error) { setError(sessionsResult.error.message); return; }
      const sessionsData = sessionsResult.data ?? [];

      const sessionIds = sessionsData.map((s: any) => s.session_id);
      const { data: allExercisesFlat } = await db.getBatchSessionExercises(sessionIds);

      const exerciseIds = (allExercisesFlat ?? []).map((ex: any) => ex.session_exercise_id);
      const { data: allSetsFlat } = await db.getBatchSessionExerciseSets(exerciseIds);

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
            if (set.completed) {
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
        };
      });

      enriched.sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime());

      // Compute duration stats
      let longestSession = 0;
      let totalDurationMins = 0;
      let durationCount = 0;
      for (const s of sessionsData) {
        const mins = getDurationMins(s.session_date, s.start_time, s.end_time);
        if (mins !== null) {
          longestSession = Math.max(longestSession, mins);
          totalDurationMins += mins;
          durationCount++;
        }
      }
      const avgDuration = durationCount > 0 ? Math.round(totalDurationMins / durationCount) : 0;

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
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  const handleDeleteSession = useCallback((sessionId: number) => {
    setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
  }, []);

  const handleEditWorkout = useCallback((sessionId: number) => {
    hasDataRef.current = false;
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
      case "totalSets":       return { value: String(stats.totalSets), label: "Sets" };
      case "totalVolume":     return { value: formatVolume(toDisplay(stats.totalVolume)), label: `Vol (${unitLabel})` };
      case "totalReps":       return { value: stats.totalReps.toLocaleString(), label: "Reps" };
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
  const { current: currentStreak, longest: longestStreak } = calcStreaks(sessions);
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
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
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

      {!isOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.warningLight }]}>
          <Text style={[styles.offlineText, { color: colors.warning }]}>⚡ Offline Mode</Text>
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
                {currentStreak} day streak
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
                    <Text style={[styles.statNum, { color: colors.text }]}>{value}</Text>
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
          {longestStreak > 0 && (
            <View style={styles.bestStreakRow}>
              <Ionicons name="trophy-outline" size={14} color={colors.primary} />
              <Text style={[styles.bestStreakText, { color: colors.primary }]}>Best: {longestStreak} days</Text>
            </View>
          )}
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
      </View>

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
                  {formatPace(cardioStats.fastestPaceSecPerKm)}
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
