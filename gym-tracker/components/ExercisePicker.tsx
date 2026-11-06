import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { showAlert } from "@/utils/alert";
import { useConnectionMode } from "@/utils/useConnectionMode";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/theme/ThemeContext";
import { useHeaderTop } from "@/utils/useHeaderTop";
import exercisesData from "@/assets/data/exercises.json";
import { db } from "@/backend/db";
import {
  MUSCLE_GROUPS,
  MuscleGroup,
  matchesMuscleGroup,
  pushRecent,
  searchExercises,
} from "@/utils/exerciseSearch";

const RECENT_KEY = "@gym_tracker_recent_exercises";
const SEARCH_LIMIT = 100;

type Row =
  | { kind: "header"; key: string; title: string }
  | { kind: "exercise"; key: string; ex: Exercise };

type ExerciseType = 'strength' | 'cardio' | 'stretching';

type Exercise = {
  id: string;
  name: string;
  primaryMuscles?: string[];
  equipment?: string;
  isCustom?: boolean;
  category?: string;
  exercise_type?: ExerciseType;
  [key: string]: any;
};

type CategoryTab = 'all' | ExerciseType;

const CATEGORY_TABS: { key: CategoryTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'strength', label: 'Strength' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'stretching', label: 'Stretching' },
];

// Teal for cardio, muted for stretching, primary-ish for strength
const CATEGORY_COLORS: Record<ExerciseType, { bg: string; text: string }> = {
  cardio: { bg: '#0d94601a', text: '#0d9460' },
  stretching: { bg: '#6b72801a', text: '#6b7280' },
  strength: { bg: '', text: '' }, // uses primary from theme, set at render
};

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// "Chest · Barbell"; skips what's unknown instead of printing "Unknown • none".
function exerciseSubtitle(ex: Exercise): string {
  const parts = [
    (ex.primaryMuscles ?? []).filter(Boolean).map(titleCase).join(", "),
    ex.equipment && ex.equipment !== "other" ? titleCase(ex.equipment) : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : ex.isCustom ? "Custom exercise" : "";
}

function getExerciseType(ex: Exercise): ExerciseType {
  const cat = (ex.category ?? ex.exercise_type ?? 'strength').toLowerCase();
  if (cat === 'cardio') return 'cardio';
  if (cat === 'stretching' || cat === 'stretches') return 'stretching';
  return 'strength';
}

type Props = {
  visible: boolean;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
};

export default function ExercisePicker({ visible, onSelect, onClose }: Props) {
  const headerTop = useHeaderTop();
  const { colors } = useTheme();
  const connection = useConnectionMode();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryTab>('all');
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMuscle, setNewMuscle] = useState("");
  const [newEquip, setNewEquip] = useState("");
  const [newType, setNewType] = useState<ExerciseType>('strength');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [recentKey, setRecentKey] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    db.getUser().then(async ({ data }) => {
      const userId = data?.user?.id;
      if (!userId) return;
      // Recently used exercises, like Strong/Hevy show before you search.
      // Seeded from the last few workouts the first time.
      try {
        const key = `${RECENT_KEY}:${userId}`;
        setRecentKey(key);
        const raw = await AsyncStorage.getItem(key);
        let ids: string[] = raw ? JSON.parse(raw) : [];
        if (ids.length === 0) {
          const { data: sessions } = await db.getWorkoutSessions(userId);
          const recentSessions = (sessions ?? []).slice(0, 6).map((s: any) => s.session_id);
          const { data: exs } = await db.getBatchSessionExercises(recentSessions);
          const order = new Map<number, number>(recentSessions.map((id: number, i: number) => [id, i]));
          ids = [...(exs ?? [])]
            .sort((a: any, b: any) => (order.get(a.session_id) ?? 0) - (order.get(b.session_id) ?? 0) || a.exercise_order - b.exercise_order)
            .map((e: any) => e.exercise_id)
            .filter((id: string, i: number, all: string[]) => all.indexOf(id) === i)
            .slice(0, 12);
        }
        setRecentIds(ids);
      } catch {
        // Recents are a convenience; the full list still works.
      }
      db.getCustomExercises(userId).then(({ data: customs }) => {
        if (customs) {
          setCustomExercises(
            customs.map((c: any) => ({
              id: c.exercise_id,
              name: c.name,
              primaryMuscles: c.primary_muscle ? [c.primary_muscle] : [],
              equipment: c.equipment ?? undefined,
              isCustom: true,
              exercise_type: (c.exercise_type ?? 'strength') as ExerciseType,
              category: c.exercise_type ?? 'strength',
            }))
          );
        }
      });
    });
  }, [visible]);

  const allExercises: Exercise[] = useMemo(() => [
    ...customExercises,
    ...(exercisesData as Exercise[]),
  ], [customExercises]);

  const filteredPool = useMemo(() => allExercises.filter((ex) =>
    (activeCategory === 'all' || getExerciseType(ex) === activeCategory) && matchesMuscleGroup(ex, muscle)
  ), [allExercises, activeCategory, muscle]);

  const searching = search.trim().length > 0;
  const filtered = useMemo(
    () => (searching ? searchExercises(filteredPool, search) : []),
    [filteredPool, search, searching],
  );

  // With no search: Recent, then everything A–Z, so you can browse (the
  // list used to stay blank until you typed).
  const rows: Row[] = useMemo(() => {
    if (searching) {
      return filtered.slice(0, SEARCH_LIMIT).map((ex) => ({ kind: "exercise" as const, key: ex.id, ex }));
    }
    const byId = new Map(filteredPool.map((ex) => [ex.id, ex]));
    const recent = recentIds.map((id) => byId.get(id)).filter(Boolean) as Exercise[];
    const all = [...filteredPool].sort((a, b) => a.name.localeCompare(b.name));
    const out: Row[] = [];
    if (recent.length > 0) {
      out.push({ kind: "header", key: "h-recent", title: "Recent" });
      for (const ex of recent) out.push({ kind: "exercise", key: `r-${ex.id}`, ex });
    }
    out.push({ kind: "header", key: "h-all", title: `All exercises (${all.length})` });
    for (const ex of all) out.push({ kind: "exercise", key: ex.id, ex });
    return out;
  }, [searching, filtered, filteredPool, recentIds]);

  const handleClose = () => {
    setSearch("");
    setMuscle(null);
    setShowCreateForm(false);
    setNewName(""); setNewMuscle(""); setNewEquip(""); setNewType('strength');
    onClose();
  };

  const handleSelect = (exercise: Exercise) => {
    const nextRecent = pushRecent(recentIds, exercise.id);
    setRecentIds(nextRecent);
    if (recentKey) AsyncStorage.setItem(recentKey, JSON.stringify(nextRecent)).catch(() => {});
    setSearch("");
    setShowCreateForm(false);
    // Ensure exercise_type is set before passing to caller
    onSelect({ ...exercise, exercise_type: getExerciseType(exercise) });
  };

  // A double tap used to create two custom exercises with different ids.
  const creatingRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const handleCreate = async () => {
    if (!newName.trim() || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      await createAndSelect();
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const createAndSelect = async () => {
    const { data: userData } = await db.getUser();
    const userId = userData?.user?.id;
    if (!userId) { showAlert("Not signed in", "Sign in to create custom exercises."); return; }
    const slug = newName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const exerciseId = `custom-${slug}-${Date.now()}`;
    const { error } = await db.insertCustomExercise({
      exercise_id: exerciseId,
      user_id: userId,
      name: newName.trim(),
      primary_muscle: newMuscle.trim() || null,
      equipment: newEquip.trim() || null,
      exercise_type: newType,
    });
    // Selecting it anyway would log sets under an id with no exercise row.
    if (error) { showAlert("Couldn't create exercise", error.message ?? "Please try again."); return; }
    handleSelect({
      id: exerciseId,
      name: newName.trim(),
      primaryMuscles: newMuscle.trim() ? [newMuscle.trim()] : [],
      equipment: newEquip.trim() || undefined,
      isCustom: true,
      exercise_type: newType,
      category: newType,
    });
  };

  const CategoryBadge = ({ ex }: { ex: Exercise }) => {
    const type = getExerciseType(ex);
    if (type === 'strength') return null; // no badge for strength (default)
    const style = CATEGORY_COLORS[type];
    return (
      <View style={{ backgroundColor: style.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: style.text, textTransform: 'capitalize' }}>
          {type}
        </Text>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header: search + cancel */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: headerTop,
          paddingHorizontal: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: 12,
        }}>
          <TextInput
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              padding: 10,
              fontSize: 16,
              backgroundColor: colors.inputBackground,
              color: colors.text,
            }}
            placeholder="Search exercises"
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={(t) => { setSearch(t); setShowCreateForm(false); }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <Pressable onPress={handleClose} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 16 }}>Cancel</Text>
          </Pressable>
        </View>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' }}
        >
          {CATEGORY_TABS.map((tab) => {
            const active = activeCategory === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveCategory(tab.key)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: active ? colors.primary : colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.textSecondary }}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8, flexDirection: 'row', alignItems: 'center' }}
        >
          {MUSCLE_GROUPS.map((g) => {
            const active = muscle === g.key;
            return (
              <Pressable
                key={g.key}
                onPress={() => setMuscle(active ? null : g.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: active ? colors.primaryLight : colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? colors.primary : colors.textSecondary }}>
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={20}
          windowSize={11}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListFooterComponent={
            <>
              {filtered.length > SEARCH_LIMIT && (
                <Text style={{ textAlign: "center", color: colors.textTertiary, paddingVertical: 12 }}>
                  Showing {SEARCH_LIMIT} of {filtered.length} — refine your search
                </Text>
              )}
              {!searching && filteredPool.length === 0 && (
                <Text style={{ textAlign: "center", color: colors.textTertiary, marginTop: 32, fontSize: 15 }}>
                  No exercises match these filters
                </Text>
              )}
              {searching && filtered.length === 0 && !showCreateForm && (
                <View style={{ alignItems: "center", marginTop: 32, paddingHorizontal: 24 }}>
                  <Text style={{ color: colors.textTertiary, fontSize: 15, marginBottom: 16 }}>
                    No exercises found for “{search}”
                  </Text>
                  <Pressable
                    onPress={() => { setNewName(search); setShowCreateForm(true); }}
                    style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>+ Create “{search}”</Text>
                  </Pressable>
                </View>
              )}
              {showCreateForm && (
                <View style={{ padding: 20, gap: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>New Exercise</Text>
                  {connection === "offline" && (
                    <Text style={{ fontSize: 13, color: colors.warning }}>
                      You&apos;re offline. Creating an exercise needs a connection.
                    </Text>
                  )}
                  <TextInput
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: colors.inputBackground, color: colors.text }}
                    placeholder="Exercise name *"
                    placeholderTextColor={colors.textTertiary}
                    value={newName}
                    onChangeText={setNewName}
                  />
                  <TextInput
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: colors.inputBackground, color: colors.text }}
                    placeholder="Primary muscle (optional)"
                    placeholderTextColor={colors.textTertiary}
                    value={newMuscle}
                    onChangeText={setNewMuscle}
                  />
                  <TextInput
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: colors.inputBackground, color: colors.text }}
                    placeholder="Equipment (optional)"
                    placeholderTextColor={colors.textTertiary}
                    value={newEquip}
                    onChangeText={setNewEquip}
                  />
                  {/* Type selector */}
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 }}>Type</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['strength', 'cardio', 'stretching'] as ExerciseType[]).map((t) => (
                        <Pressable
                          key={t}
                          onPress={() => setNewType(t)}
                          style={{
                            flex: 1,
                            paddingVertical: 8,
                            borderRadius: 8,
                            alignItems: 'center',
                            backgroundColor: newType === t ? colors.primary : colors.surfaceSecondary,
                            borderWidth: 1,
                            borderColor: newType === t ? colors.primary : colors.border,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: newType === t ? '#fff' : colors.textSecondary, textTransform: 'capitalize' }}>
                            {t}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.surfaceSecondary, alignItems: "center" }}
                      onPress={() => setShowCreateForm(false)}
                    >
                      <Text style={{ fontWeight: "600", color: colors.textSecondary }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={{ flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center" }}
                      onPress={handleCreate}
                      disabled={creating}
                    >
                      <Text style={{ fontWeight: "700", color: "#fff" }}>{creating ? "Creating…" : "Create & Add"}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          }
          renderItem={({ item: row }) => {
            if (row.kind === "header") {
              return (
                <Text style={{
                  fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase",
                  color: colors.textTertiary, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
                  backgroundColor: colors.background,
                }}>
                  {row.title}
                </Text>
              );
            }
            const ex = row.ex;
            return (
            <Pressable
              onPress={() => handleSelect(ex)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.borderLight,
                backgroundColor: pressed ? colors.surfaceSecondary : colors.background,
              })}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{ex.name}</Text>
                  {ex.isCustom && (
                    <View style={{ backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.primary }}>Custom</Text>
                    </View>
                  )}
                  <CategoryBadge ex={ex} />
                </View>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  {exerciseSubtitle(ex)}
                </Text>
              </View>
              <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>+ Add</Text>
            </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
