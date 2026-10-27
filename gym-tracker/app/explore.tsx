import { useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import { showAlert } from "@/utils/alert";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";
import { db } from "@/backend/db";
import { PROGRAMS, Program, ProgramRoutine } from "@/utils/programsData";

type LevelFilter = 'all' | 'beginner' | 'intermediate';
type GoalFilter = 'all' | 'strength' | 'hypertrophy' | 'weight_loss';
type EquipFilter = 'all' | 'gym' | 'home';

const LEVEL_LABELS: Record<LevelFilter, string> = {
  all: 'All Levels',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
};

const GOAL_LABELS: Record<GoalFilter, string> = {
  all: 'All Goals',
  strength: 'Strength',
  hypertrophy: 'Muscle',
  weight_loss: 'Weight Loss',
};

const EQUIP_LABELS: Record<EquipFilter, string> = {
  all: 'All Equipment',
  gym: 'Gym',
  home: 'Home',
};

export default function ExploreScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [goalFilter, setGoalFilter] = useState<GoalFilter>('all');
  const [equipFilter, setEquipFilter] = useState<EquipFilter>('all');
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [importing, setImporting] = useState(false);

  const filtered = PROGRAMS.filter((p) => {
    if (levelFilter !== 'all' && p.level !== levelFilter) return false;
    if (goalFilter !== 'all' && p.goal !== goalFilter) return false;
    if (equipFilter !== 'all' && p.equipment !== equipFilter) return false;
    return true;
  });

  const importProgram = async (program: Program) => {
    setImporting(true);
    try {
      const { data: userData } = await db.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        showAlert("Not signed in", "Please sign in to add programs.");
        setImporting(false);
        return;
      }

      for (const routine of program.routines) {
        const { data: newRoutine, error: routineErr } = await db.insertRoutine({
          routine_name: routine.name,
          description: `Part of ${program.name}`,
          user_id: userId,
        });
        if (routineErr || !newRoutine) {
          showAlert("Error", routineErr?.message ?? "Failed to create routine.");
          setImporting(false);
          return;
        }

        for (let exIdx = 0; exIdx < routine.exercises.length; exIdx++) {
          const ex = routine.exercises[exIdx];
          const { data: newEx, error: exErr } = await db.insertRoutineExercise({
            routine_id: newRoutine.routine_id,
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            exercise_order: exIdx + 1,
            exercise_type: 'strength',
          });
          if (exErr || !newEx) continue;

          for (let setIdx = 0; setIdx < ex.sets; setIdx++) {
            await db.insertRoutineExerciseSet({
              routine_exercise_id: newEx.routine_exercise_id,
              set_number: setIdx + 1,
              target_weight: null,
              target_reps: ex.reps,
              is_warmup: false,
            });
          }
        }
      }

      setImporting(false);
      showAlert(
        "Program Added!",
        `${program.routines.length} routine${program.routines.length > 1 ? 's' : ''} from "${program.name}" have been added to My Routines.`,
        [{ text: "Got it", onPress: () => router.back() }]
      );
    } catch (e: any) {
      setImporting(false);
      showAlert("Error", e?.message ?? "Something went wrong.");
    }
  };

  if (selectedProgram) {
    return (
      <ProgramDetail
        program={selectedProgram}
        importing={importing}
        onBack={() => setSelectedProgram(null)}
        onImport={() => importProgram(selectedProgram)}
        colors={colors}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Explore</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Programs</Text>

        {/* Filter row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <FilterPill
            label={LEVEL_LABELS[levelFilter]}
            active={levelFilter !== 'all'}
            colors={colors}
            onPress={() => {
              const opts: LevelFilter[] = ['all', 'beginner', 'intermediate'];
              const next = opts[(opts.indexOf(levelFilter) + 1) % opts.length];
              setLevelFilter(next);
            }}
          />
          <FilterPill
            label={GOAL_LABELS[goalFilter]}
            active={goalFilter !== 'all'}
            colors={colors}
            onPress={() => {
              const opts: GoalFilter[] = ['all', 'strength', 'hypertrophy', 'weight_loss'];
              const next = opts[(opts.indexOf(goalFilter) + 1) % opts.length];
              setGoalFilter(next);
            }}
          />
          <FilterPill
            label={EQUIP_LABELS[equipFilter]}
            active={equipFilter !== 'all'}
            colors={colors}
            onPress={() => {
              const opts: EquipFilter[] = ['all', 'gym', 'home'];
              const next = opts[(opts.indexOf(equipFilter) + 1) % opts.length];
              setEquipFilter(next);
            }}
          />
        </ScrollView>

        {/* Program cards */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No programs match your filters</Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            {filtered.map((program) => (
              <Pressable
                key={program.id}
                style={[styles.card, { backgroundColor: colors.surface }]}
                onPress={() => setSelectedProgram(program)}
              >
                {/* Colored label box */}
                <View style={[styles.labelBox, { backgroundColor: program.labelColor + '22' }]}>
                  <Text style={[styles.labelText, { color: program.labelColor }]}>{program.label}</Text>
                </View>

                {/* Program info */}
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardName, { color: colors.text }]}>{program.name}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    {program.equipment === 'gym' ? 'Gym Equipment' : 'Equipment-Free'}
                  </Text>
                  <Text style={[styles.cardRoutineCount, { color: colors.textTertiary }]}>
                    {program.routines.length} routine{program.routines.length > 1 ? 's' : ''}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Program Detail ───────────────────────────────────────────────────────────

function ProgramDetail({
  program,
  importing,
  onBack,
  onImport,
  colors,
}: {
  program: Program;
  importing: boolean;
  onBack: () => void;
  onImport: () => void;
  colors: any;
}) {
  const levelLabel = program.level === 'beginner' ? 'Beginner' : 'Intermediate';
  const goalLabel = program.goal === 'hypertrophy' ? 'Muscle' : program.goal === 'strength' ? 'Strength' : 'Weight Loss';
  const equipLabel = program.equipment === 'gym' ? 'Gym Equipment' : 'Equipment-Free';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {program.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.heroLabel, { backgroundColor: program.labelColor + '22' }]}>
            <Text style={[styles.heroLabelText, { color: program.labelColor }]}>{program.label}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={[styles.heroName, { color: colors.text }]}>{program.name}</Text>
            <Text style={[styles.heroDesc, { color: colors.textSecondary }]}>{program.description}</Text>
            <View style={styles.heroPills}>
              <MetaPill icon="barbell-outline" label={levelLabel} colors={colors} />
              <MetaPill icon="fitness-outline" label={goalLabel} colors={colors} />
              <MetaPill icon="home-outline" label={equipLabel} colors={colors} />
            </View>
          </View>
        </View>

        {/* Routines */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Routines</Text>
        <View style={styles.cardList}>
          {program.routines.map((routine, idx) => (
            <RoutineCard key={idx} routine={routine} colors={colors} />
          ))}
        </View>
      </ScrollView>

      {/* Sticky footer */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          style={[styles.importBtn, { backgroundColor: colors.primary }, importing && { opacity: 0.6 }]}
          onPress={onImport}
          disabled={importing}
        >
          {importing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.importBtnText}>Add to My Routines</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function RoutineCard({ routine, colors }: { routine: ProgramRoutine; colors: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      style={[styles.routineCard, { backgroundColor: colors.surface }]}
      onPress={() => setExpanded((v) => !v)}
    >
      <View style={styles.routineCardHeader}>
        <View style={[styles.routineIconWrap, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="barbell-outline" size={16} color={colors.primary} />
        </View>
        <Text style={[styles.routineCardName, { color: colors.text }]}>{routine.name}</Text>
        <Text style={[styles.routineExCount, { color: colors.textTertiary }]}>
          {routine.exercises.length} exercises
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.textTertiary}
        />
      </View>

      {expanded && (
        <View style={[styles.exerciseList, { borderTopColor: colors.border }]}>
          {routine.exercises.map((ex, idx) => (
            <View key={idx} style={[styles.exerciseRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.exerciseRowName, { color: colors.text }]}>{ex.exercise_name}</Text>
              <Text style={[styles.exerciseRowSets, { color: colors.textTertiary }]}>
                {ex.sets} × {ex.reps}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

function FilterPill({
  label,
  active,
  colors,
  onPress,
}: {
  label: string;
  active: boolean;
  colors: any;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterPill,
        {
          backgroundColor: active ? colors.primary : colors.surface,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.filterPillText, { color: active ? '#fff' : colors.textSecondary }]}>
        {label}
      </Text>
      <Ionicons
        name="chevron-down"
        size={12}
        color={active ? '#fff' : colors.textTertiary}
        style={{ marginLeft: 2 }}
      />
    </Pressable>
  );
}

function MetaPill({ icon, label, colors }: { icon: any; label: string; colors: any }) {
  return (
    <View style={[styles.metaPill, { backgroundColor: colors.surfaceSecondary }]}>
      <Ionicons name={icon} size={12} color={colors.textSecondary} />
      <Text style={[styles.metaPillText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: { width: 28 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },

  scroll: { padding: 16, paddingBottom: 60 },

  sectionTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 14 },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  filterPillText: { fontSize: 13, fontWeight: '600' },

  cardList: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    padding: 14,
    gap: 14,
  },
  labelBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 14,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 13 },
  cardRoutineCount: { fontSize: 12, marginTop: 2 },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 15, fontWeight: '500' },

  // Detail
  heroCard: {
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 16,
    padding: 16,
  },
  heroLabel: {
    width: 80,
    height: 80,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroLabelText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center', lineHeight: 15 },
  heroInfo: { flex: 1, gap: 6 },
  heroName: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  heroDesc: { fontSize: 13, lineHeight: 19 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  metaPillText: { fontSize: 11, fontWeight: '600' },

  routineCard: { borderRadius: 14, overflow: 'hidden' },
  routineCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  routineIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  routineCardName: { flex: 1, fontSize: 15, fontWeight: '700' },
  routineExCount: { fontSize: 13 },

  exerciseList: { borderTopWidth: StyleSheet.hairlineWidth },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exerciseRowName: { fontSize: 14, fontWeight: '500', flex: 1 },
  exerciseRowSets: { fontSize: 13 },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  importBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
