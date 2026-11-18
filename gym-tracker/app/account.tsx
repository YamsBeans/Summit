import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { showAlert } from "@/utils/alert";
import { ModalShell, SettingItem, SettingSection } from "@/components/SettingsUI";

// Account settings (modelled on Hevy's Account page): username, email,
// password, and Delete Account kept apart at the bottom.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [modal, setModal] = useState<null | "username" | "email" | "password">(null);

  const load = useCallback(async () => {
    const { data } = await db.getUser();
    const user = data?.user;
    if (!user) return;
    setUserId(user.id);
    setEmail(user.email ?? "");
    const { data: profile } = await db.getUserProfile(user.id);
    setUsername(profile?.username ?? "");
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteAccount = () => {
    showAlert(
      "Delete Account",
      "This will permanently delete your account and all workout data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => showAlert(
            "Are you absolutely sure?",
            "All your routines, workouts, and progress will be lost forever.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Yes, Delete",
                style: "destructive",
                onPress: async () => {
                  const { error } = await db.deleteAccount();
                  if (error) showAlert("Couldn't delete account", error);
                  // On success the auth listener sees the sign-out and routes to /auth.
                },
              },
            ]
          ),
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={{ width: 40 }} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Account Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <SettingSection title="Account">
          <SettingItem icon="person-outline" label="Change Username" onPress={() => setModal("username")} />
          <SettingItem icon="mail-outline" label="Change Email" onPress={() => setModal("email")} />
          <SettingItem icon="lock-closed-outline" label="Update Password" onPress={() => setModal("password")} />
        </SettingSection>

        {email ? (
          <Text style={[styles.signedInAs, { color: colors.textTertiary }]} numberOfLines={1}>
            Signed in as {email}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
          onPress={handleDeleteAccount}
          accessibilityRole="button"
        >
          <Text style={[styles.deleteText, { color: colors.danger }]}>Delete Account</Text>
        </Pressable>
      </ScrollView>

      <UsernameModal
        visible={modal === "username"}
        userId={userId}
        current={username}
        onClose={() => setModal(null)}
        onSaved={(u) => setUsername(u)}
      />
      <EmailModal visible={modal === "email"} current={email} onClose={() => setModal(null)} />
      <PasswordModal visible={modal === "password"} email={email} onClose={() => setModal(null)} />
    </View>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { colors } = useTheme();
  const { label, style, ...rest } = props;
  return (
    <>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        {...rest}
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.inputBackground }, style]}
      />
    </>
  );
}

function ModalButtons({ onCancel, onSave, saving, saveLabel }: { onCancel: () => void; onSave: () => void; saving: boolean; saveLabel: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
      <Pressable style={[styles.btn, { flex: 1, backgroundColor: colors.surfaceSecondary }]} onPress={onCancel} disabled={saving}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.textSecondary }}>Cancel</Text>
      </Pressable>
      <Pressable style={[styles.btn, { flex: 2, backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} onPress={onSave} disabled={saving}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>{saving ? "Saving…" : saveLabel}</Text>
      </Pressable>
    </View>
  );
}

function SuccessView({ message, onDone }: { message: string; onDone: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <Ionicons name="checkmark-circle" size={44} color={colors.success} />
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text, textAlign: "center" }}>{message}</Text>
      <Pressable style={[styles.btn, { width: "100%", backgroundColor: colors.primary, marginTop: 4 }]} onPress={onDone}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>Done</Text>
      </Pressable>
    </View>
  );
}

// ─── Username ────────────────────────────────────────────────────────────────

function UsernameModal({ visible, userId, current, onClose, onSaved }: {
  visible: boolean; userId: string | null; current: string; onClose: () => void; onSaved: (u: string) => void;
}) {
  const { colors } = useTheme();
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (visible) { setValue(current); setError(null); } }, [visible, current]);

  const save = async () => {
    const next = value.trim();
    if (!next) { setError("Username cannot be empty."); return; }
    if (next.length > 30) { setError("Username must be 30 characters or fewer."); return; }
    if (next === current) { onClose(); return; }
    if (!userId) { setError("You're not signed in."); return; }
    setSaving(true); setError(null);
    const { error: err } = await db.updateUserProfile(userId, { username: next });
    setSaving(false);
    if (err) { setError(err.message ?? "Couldn't update username."); return; }
    onSaved(next);
    onClose();
  };

  return (
    <ModalShell visible={visible} onClose={onClose} title="Change Username">
      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
      <Field label="Username" value={value} onChangeText={setValue} placeholder="Username" maxLength={30} returnKeyType="done" onSubmitEditing={save} autoFocus />
      <ModalButtons onCancel={onClose} onSave={save} saving={saving} saveLabel="Save" />
    </ModalShell>
  );
}

// ─── Email ───────────────────────────────────────────────────────────────────

function EmailModal({ visible, current, onClose }: { visible: boolean; current: string; onClose: () => void }) {
  const { colors } = useTheme();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => { if (visible) { setValue(""); setError(null); setSentTo(null); } }, [visible]);

  const save = async () => {
    const next = value.trim().toLowerCase();
    if (!EMAIL_RE.test(next)) { setError("Enter a valid email address."); return; }
    if (next === current.toLowerCase()) { setError("That's already your email."); return; }
    setSaving(true); setError(null);
    const { error: err } = await db.changeEmail(next);
    setSaving(false);
    if (err) { setError(err.message ?? "Couldn't change email."); return; }
    setSentTo(next);
  };

  return (
    <ModalShell visible={visible} onClose={onClose} title="Change Email">
      {sentTo ? (
        <SuccessView
          message={`Check ${sentTo} for a confirmation link. Your email changes once you open it.`}
          onDone={onClose}
        />
      ) : (
        <>
          {current ? (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>Current: {current}</Text>
          ) : null}
          {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
          <Field
            label="New email"
            value={value}
            onChangeText={setValue}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="done"
            onSubmitEditing={save}
            autoFocus
          />
          <ModalButtons onCancel={onClose} onSave={save} saving={saving} saveLabel="Send Link" />
        </>
      )}
    </ModalShell>
  );
}

// ─── Password ────────────────────────────────────────────────────────────────

function PasswordModal({ visible, email, onClose }: { visible: boolean; email: string; onClose: () => void }) {
  const { colors } = useTheme();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (visible) { setCurrentPw(""); setNewPw(""); setConfirmPw(""); setError(null); setDone(false); }
  }, [visible]);

  const save = async () => {
    if (!currentPw) { setError("Enter your current password."); return; }
    if (newPw.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (newPw !== confirmPw) { setError("New passwords do not match."); return; }
    if (newPw === currentPw) { setError("New password must be different."); return; }
    setSaving(true); setError(null);
    const { error: verifyErr } = await db.verifyPassword(email, currentPw);
    if (verifyErr) { setSaving(false); setError(verifyErr); return; }
    const { error: err } = await db.changePassword(newPw);
    setSaving(false);
    if (err) { setError(err.message ?? "Couldn't update password."); return; }
    setDone(true);
  };

  return (
    <ModalShell visible={visible} onClose={onClose} title="Update Password">
      {done ? (
        <SuccessView message="Your password has been updated." onDone={onClose} />
      ) : (
        <>
          {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
          <Field label="Current password" value={currentPw} onChangeText={setCurrentPw} secureTextEntry autoComplete="current-password" textContentType="password" placeholder="Current password" />
          <Field label="New password" value={newPw} onChangeText={setNewPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="At least 6 characters" />
          <Field label="Confirm new password" value={confirmPw} onChangeText={setConfirmPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="Re-enter new password" returnKeyType="done" onSubmitEditing={save} />
          <ModalButtons onCancel={onClose} onSave={save} saving={saving} saveLabel="Update" />
        </>
      )}
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "600", textAlign: "center" },
  signedInAs: { fontSize: 13, textAlign: "center", marginTop: 12, paddingHorizontal: 24 },
  deleteBtn: { alignSelf: "center", marginTop: 40, paddingVertical: 12, paddingHorizontal: 24 },
  deleteText: { fontSize: 16, fontWeight: "600" },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 14 },
  btn: { paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  error: { fontSize: 13, marginBottom: 10, textAlign: "center" },
  hint: { fontSize: 13, marginBottom: 12, textAlign: "center" },
});
