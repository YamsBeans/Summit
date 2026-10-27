import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";

// Opened from the password-reset email (gymtracker://reset-password on phones,
// <site>/reset-password on web). Signs the user in from the link, then lets them
// choose a new password.
export default function ResetPassword() {
  const { colors } = useTheme();
  const router = useRouter();
  const nativeUrl = Linking.useURL();
  const handledUrl = useRef<string | null>(null);

  const [status, setStatus] = useState<"verifying" | "ready" | "invalid" | "done">("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = Platform.OS === "web" && typeof window !== "undefined" ? window.location.href : nativeUrl;
    if (!url || handledUrl.current === url) return;
    handledUrl.current = url;

    db.recoverSessionFromUrl(url).then(({ error: linkError }) => {
      if (linkError) {
        setError(linkError);
        setStatus("invalid");
      } else {
        setStatus("ready");
        // Drop the one-time tokens from the browser's address bar.
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    });
  }, [nativeUrl]);

  const handleSave = async () => {
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");

    setLoading(true);
    const { error: updateError } = await db.changePassword(password);
    setLoading(false);
    if (updateError) return setError(updateError.message);
    setStatus("done");
  };

  const inputStyle = [styles.input, { borderColor: colors.border, backgroundColor: colors.inputBackground, color: colors.text }];

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>Set a New Password</Text>

        {status === "verifying" && <ActivityIndicator color={colors.primary} />}

        {status === "ready" && (
          <>
            <TextInput
              style={inputStyle}
              placeholder="New password"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="next"
            />
            <TextInput
              style={inputStyle}
              placeholder="Confirm new password"
              placeholderTextColor={colors.textTertiary}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            {error && <Text style={{ color: colors.danger }}>{error}</Text>}
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
              onPress={handleSave}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? "Saving..." : "Save Password"}</Text>
            </Pressable>
          </>
        )}

        {status === "invalid" && (
          <>
            <Text style={{ color: colors.danger, textAlign: "center" }}>{error}</Text>
            <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.replace("/auth")}>
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </Pressable>
          </>
        )}

        {status === "done" && (
          <>
            <Text style={{ color: colors.success, textAlign: "center" }}>Your password has been updated.</Text>
            <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.replace("/(tabs)")}>
              <Text style={styles.buttonText}>Continue to Summit</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: 16, paddingTop: 100, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  button: { paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
