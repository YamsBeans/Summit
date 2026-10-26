import { memo } from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeContext";
import WorkoutHistoryCard from "./WorkoutHistoryCard";

export type SessionWithMeta = {
  session_id: number;
  session_name: string;
  session_date: string;
  start_time: string;
  end_time: string | null;
  notes: string | null;
  photo_url: string | null;
  exerciseCount: number;
  totalVolume: number;
  totalReps: number;
  exerciseNames: string[];
};

type Props = {
  sessions: SessionWithMeta[];
  onDelete?: (sessionId: number) => void;
  onEditWorkout?: (sessionId: number) => void;
};

const WorkoutHistoryList = memo(function WorkoutHistoryList({ sessions, onDelete, onEditWorkout }: Props) {
  const { colors } = useTheme();

  if (sessions.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
        <Text style={{ fontSize: 48 }}>🏋️</Text>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.textSecondary }}>No workouts yet</Text>
        <Text style={{ fontSize: 14, color: colors.textTertiary, textAlign: "center" }}>
          Complete your first workout to see it here
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 4 }}>Workout History</Text>
      {sessions.map((session) => (
        <WorkoutHistoryCard
          key={session.session_id}
          session_id={session.session_id}
          sessionName={session.session_name}
          sessionDate={session.session_date}
          startTime={session.start_time}
          endTime={session.end_time}
          exerciseCount={session.exerciseCount}
          totalVolume={session.totalVolume}
          notes={session.notes}
          photo_url={session.photo_url}
          exerciseNames={session.exerciseNames}
          onDelete={onDelete}
          onEditWorkout={onEditWorkout}
        />
      ))}
    </View>
  );
});

export default WorkoutHistoryList;