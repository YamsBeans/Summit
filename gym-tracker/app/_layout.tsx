import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { db } from "@/backend/db";
import { ThemeProvider, useTheme } from "@/theme/ThemeContext";
import { useSyncManager } from "@/utils/useSyncManager";
import { ActiveWorkoutProvider, useActiveWorkout } from "@/utils/ActiveWorkoutContext";
import MinimizedWorkoutBar from "@/components/MinimizedWorkoutBar";

function RootNav() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  const { colors } = useTheme();
  const userId = session?.user?.id ?? null;
  const { isSyncing, lastSyncedCount } = useSyncManager(userId);
  const { activeWorkout, minimizeWorkout } = useActiveWorkout();

  // The in-progress workout only lived in memory, so after the app was killed
  // (or the web page reloaded) the "resume workout" bar vanished and the
  // unfinished session was stranded. Look it up again once we know the user.
  useEffect(() => {
    if (!userId || activeWorkout) return;
    let cancelled = false;
    db.getActiveSession(userId).then(({ data }: any) => {
      if (cancelled || !data || data.end_time) return;
      const ts = new Date(`${data.session_date}T${data.start_time}`).getTime();
      minimizeWorkout(data.session_id, data.session_name, Number.isFinite(ts) ? ts : Date.now());
    }).catch(() => {});
    return () => { cancelled = true; };
    // Only on sign-in / app start — not every time a workout is cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    db.getSession().then((result: any) => {
      setSession(result?.data?.session ?? null);
      setLoading(false);
    });

    const result = db.onAuthStateChange(
      (_event: string, session: any) => {
        setSession(session);
      }
    );

    const subscription = result?.data?.subscription;

    return () => {
      if (subscription?.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthScreen = segments[0] === "auth";
    // The reset-password screen signs the user in from the email link itself,
    // so it must stay reachable whether or not there's a session yet.
    const inResetPassword = segments[0] === "reset-password";

    if (session && inAuthScreen) {
      router.replace("/(tabs)");
    } else if (!session && !inAuthScreen && !inResetPassword) {
      router.replace("/auth");
    }
  }, [session, loading, segments]);

  if (loading) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isSyncing && (
        <View style={{ backgroundColor: colors.primary, paddingVertical: 6, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Syncing offline workouts…</Text>
        </View>
      )}
      {!isSyncing && lastSyncedCount > 0 && (
        <View style={{ backgroundColor: colors.success, paddingVertical: 6, paddingHorizontal: 16 }}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
            {lastSyncedCount} workout{lastSyncedCount > 1 ? "s" : ""} synced!
          </Text>
        </View>
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "none",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="workout" options={{ animation: "slide_from_bottom", animationDuration: 280 }} />
        <Stack.Screen name="settings" options={{ animation: "slide_from_bottom", animationDuration: 280 }} />
        <Stack.Screen name="routine/[routineId]" options={{ animation: "slide_from_bottom", animationDuration: 280 }} />
        <Stack.Screen name="exercise-detail/[exerciseId]" options={{ animation: "slide_from_right", animationDuration: 280 }} />
        <Stack.Screen name="explore" options={{ animation: "slide_from_right", animationDuration: 280 }} />
        <Stack.Screen name="index" />
      </Stack>
      <MinimizedWorkoutBar />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ActiveWorkoutProvider>
        <RootNav />
      </ActiveWorkoutProvider>
    </ThemeProvider>
  );
}
