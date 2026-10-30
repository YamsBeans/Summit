import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useEffect, useState } from "react";
import { useTheme } from "@/theme/ThemeContext";
import { useHeaderTop } from "@/utils/useHeaderTop";
import exercisesData from "@/assets/data/exercises.json";
import { db } from "@/backend/db";

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
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryTab>('all');
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMuscle, setNewMuscle] = useState("");
  const [newEquip, setNewEquip] = useState("");
  const [newType, setNewType] = useState<ExerciseType>('strength');

  useEffect(() => {
    if (!visible) return;
    db.getUser().then(({ data }) => {
      const userId = data?.user?.id;
      if (!userId) return;
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

  const allExercises: Exercise[] = [
    ...customExercises,
    ...(exercisesData as Exercise[]),
  ];

  const categoryFiltered = activeCategory === 'all'
    ? allExercises
    : allExercises.filter((ex) => getExerciseType(ex) === activeCategory);

  const filtered = search.length === 0
    ? []
    : categoryFiltered.filter(
        (ex) => ex.name && ex.name.toLowerCase().includes(search.toLowerCase())
      );

  const handleClose = () => {
    setSearch("");
    setShowCreateForm(false);
    setNewName(""); setNewMuscle(""); setNewEquip(""); setNewType('strength');
    onClose();
  };

  const handleSelect = (exercise: Exercise) => {
    setSearch("");
    setShowCreateForm(false);
    // Ensure exercise_type is set before passing to caller
    onSelect({ ...exercise, exercise_type: getExerciseType(exercise) });
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const { data: userData } = await db.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;
    const slug = newName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const exerciseId = `custom-${slug}-${Date.now()}`;
    await db.insertCustomExercise({
      exercise_id: exerciseId,
      user_id: userId,
      name: newName.trim(),
      primary_muscle: newMuscle.trim() || null,
      equipment: newEquip.trim() || null,
      exercise_type: newType,
    });
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
            placeholder="Search exercises..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={(t) => { setSearch(t); setShowCreateForm(false); }}
            autoFocus
            autoCapitalize="none"
          />
          <Pressable onPress={handleClose} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 16 }}>Cancel</Text>
          </Pressable>
        </View>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0, flexShrink: 0 }}
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

        <FlatList
          data={filtered.slice(0, 50)}
          keyExtractor={(ex) => ex.id}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={search.length === 0 ? (
            <Text style={{ textAlign: "center", color: colors.textTertiary, marginTop: 40, fontSize: 15 }}>
              Type to search 500+ exercises
            </Text>
          ) : null}
          ListFooterComponent={
            <>
              {filtered.length > 50 && (
                <Text style={{ textAlign: "center", color: colors.textTertiary, paddingVertical: 12 }}>
                  Showing 50 of {filtered.length} — refine your search
                </Text>
              )}
              {search.length > 0 && filtered.length === 0 && !showCreateForm && (
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
                    >
                      <Text style={{ fontWeight: "700", color: "#fff" }}>Create & Add</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          }
          renderItem={({ item: ex }) => (
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
                  {ex.primaryMuscles?.join(", ") ?? "Unknown"} • {ex.equipment ?? "none"}
                </Text>
              </View>
              <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>+ Add</Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}
