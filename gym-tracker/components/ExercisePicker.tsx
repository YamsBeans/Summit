import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useEffect, useState } from "react";
import { useTheme } from "@/theme/ThemeContext";
import exercisesData from "@/assets/data/exercises.json";
import { db } from "@/backend/db";
import { searchExercisesByName } from "@/utils/exerciseSearch";

type Exercise = {
  id: string;
  name: string;
  primaryMuscles?: string[];
  equipment?: string;
  isCustom?: boolean;
  [key: string]: any;
};

type Props = {
  visible: boolean;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
};

export default function ExercisePicker({ visible, onSelect, onClose }: Props) {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMuscle, setNewMuscle] = useState("");
  const [newEquip, setNewEquip] = useState("");

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

  const filtered =
    search.trim().length === 0
      ? []
      : searchExercisesByName(allExercises, search, 500);

  const handleClose = () => {
    setSearch("");
    setShowCreateForm(false);
    setNewName(""); setNewMuscle(""); setNewEquip("");
    onClose();
  };

  const handleSelect = (exercise: Exercise) => {
    setSearch("");
    setShowCreateForm(false);
    onSelect(exercise);
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
    });
    handleSelect({
      id: exerciseId,
      name: newName.trim(),
      primaryMuscles: newMuscle.trim() ? [newMuscle.trim()] : [],
      equipment: newEquip.trim() || undefined,
      isCustom: true,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: 60,
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

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          {search.length === 0 && (
            <Text style={{ textAlign: "center", color: colors.textTertiary, marginTop: 40, fontSize: 15 }}>
              Type to search 500+ exercises
            </Text>
          )}

          {filtered.slice(0, 50).map((ex) => (
            <Pressable
              key={ex.id}
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{ex.name}</Text>
                  {ex.isCustom && (
                    <View style={{ backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.primary }}>Custom</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  {ex.primaryMuscles?.join(", ") ?? "Unknown"} • {ex.equipment ?? "none"}
                </Text>
              </View>
              <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>+ Add</Text>
            </Pressable>
          ))}

          {filtered.length > 50 && (
            <Text style={{ textAlign: "center", color: colors.textTertiary, paddingVertical: 12 }}>
              Showing 50 of {filtered.length} — refine your search
            </Text>
          )}

          {search.length > 0 && filtered.length === 0 && !showCreateForm && (
            <View style={{ alignItems: "center", marginTop: 32, paddingHorizontal: 24 }}>
              <Text style={{ color: colors.textTertiary, fontSize: 15, marginBottom: 16 }}>
                No exercises found for &ldquo;{search}&rdquo;
              </Text>
              <Pressable
                onPress={() => { setNewName(search); setShowCreateForm(true); }}
                style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>+ Create &ldquo;{search}&rdquo;</Text>
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
        </ScrollView>
      </View>
    </Modal>
  );
}