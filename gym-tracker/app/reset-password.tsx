import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const result = await db.getSession();
      if (!active) return;
      const hasSession = !!result?.data?.session;
      setRecoveryReady(hasSession);
      if (!hasSession) {
        setError("Open this page from the reset link sent to your email.");
      }
    };

    checkSession();

    const sub = db.onAuthStateChange((event: string, session: any) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setRecoveryReady(true);
        setError(null);
      }
    })?.data?.subscription;

    return () => {
      active = false;
      if (sub?.unsubscribe) sub.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async () => {
    if (!recoveryReady) {
      setError("Recovery session not found. Please open the reset link from your email again.");
      return;
    }
    if (!password.trim()) {
      setError("Please enter a new password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const { error: updateError } = await db.changePassword(password);
      if (updateError) {
        setError(updateError.message ?? "Could not update password.");
        return;
      }
      setInfo("Password updated successfully. You can sign in now.");
      setPassword("");
      setConfirmPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Reset Password</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Enter a new password for your account.
        </Text>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
            placeholder="New Password"
            placeholderTextColor={colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
            placeholder="Confirm New Password"
            placeholderTextColor={colors.textTertiary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          {error && <Text style={[styles.message, { color: colors.danger }]}>{error}</Text>}
          {info && <Text style={[styles.message, { color: colors.success }]}>{info}</Text>}

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85 },
              loading && { opacity: 0.6 },
            ]}
            onPress={handleUpdatePassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Update Password</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.75 }]}
            onPress={() => router.replace("/auth")}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Back to sign in</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  title: { fontSize: 30, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 28 },
  form: { gap: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  message: { fontSize: 13, marginTop: 2 },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    minHeight: 40,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "500" },
});
