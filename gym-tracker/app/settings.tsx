import { Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { showAlert } from "@/utils/alert";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits, UnitSystem } from "@/utils/units";
import { useRestTimer } from "@/utils/useRestTimer";
import { requestNotificationPermissions } from "@/utils/notifications";

const NOTIF_KEY = "@gym_tracker_notifications";

// ─── Reusable primitives ──────────────────────────────────────────────────────

type SettingItemProps = {
  icon: string;
  label: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  destructive?: boolean;
  value?: string;
};

function SettingItem({ icon, label, onPress, rightElement, destructive, value }: SettingItemProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        {
          flexDirection: "row" as const, alignItems: "center" as const,
          paddingVertical: 13, paddingHorizontal: 16,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        },
        pressed && onPress && { backgroundColor: colors.surfaceSecondary },
      ]}
      onPress={onPress}
      disabled={!onPress && !rightElement}
    >
      <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: destructive ? colors.dangerLight : colors.surfaceSecondary, marginRight: 12 }}>
        <Ionicons name={icon as any} size={18} color={destructive ? colors.danger : colors.textSecondary} />
      </View>
      <Text style={[{ flex: 1, fontSize: 16, fontWeight: "500", color: colors.text }, destructive && { color: colors.danger }]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {value && <Text style={{ fontSize: 14, color: colors.textSecondary }}>{value}</Text>}
        {rightElement ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null)}
      </View>
    </Pressable>
  );
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 28, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary, marginBottom: 8, marginLeft: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {title}
      </Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: "hidden" }}>
        {children}
      </View>
    </View>
  );
}

function ModalShell({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 }} onPress={onClose}>
          <Pressable
            style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 24, width: "100%", maxWidth: 340, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 }}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 20 }}>{title}</Text>
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function AppearanceModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, mode, setMode } = useTheme();
  const options: { label: string; value: "light" | "dark" | "system"; icon: string; description: string }[] = [
    { label: "Light", value: "light", icon: "☀️", description: "Always use light theme" },
    { label: "Dark", value: "dark", icon: "🌙", description: "Always use dark theme" },
    { label: "System", value: "system", icon: "📱", description: "Match device settings" },
  ];
  return (
    <ModalShell visible={visible} onClose={onClose} title="Appearance">
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8, backgroundColor: mode === opt.value ? colors.primaryLight : "transparent", borderWidth: mode === opt.value ? 2 : 1, borderColor: mode === opt.value ? colors.primary : colors.border }, pressed && { opacity: 0.7 }]}
          onPress={() => { setMode(opt.value); onClose(); }}
        >
          <Text style={{ fontSize: 24, marginRight: 14 }}>{opt.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>{opt.label}</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{opt.description}</Text>
          </View>
          {mode === opt.value && <Text style={{ fontSize: 18, color: colors.primary, fontWeight: "700" }}>✓</Text>}
        </Pressable>
      ))}
      <Pressable style={{ marginTop: 4, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: "center" }} onPress={onClose}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.textSecondary }}>Cancel</Text>
      </Pressable>
    </ModalShell>
  );
}

function UnitsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { unit, saveUnit } = useUnits();
  const [distanceUnit, setDistanceUnit] = useState<"km" | "mi">("km");

  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem("@gym_tracker_distance_unit").then((val) => {
        setDistanceUnit(val === "mi" ? "mi" : "km");
      });
    }
  }, [visible]);

  const saveDistanceUnit = async (u: "km" | "mi") => {
    setDistanceUnit(u);
    await AsyncStorage.setItem("@gym_tracker_distance_unit", u);
  };

  const weightOptions: { label: string; value: UnitSystem; icon: string }[] = [
    { label: "Pounds (lbs)", value: "lbs", icon: "🇺🇸" },
    { label: "Kilograms (kg)", value: "kg", icon: "🌍" },
  ];
  const distanceOptions: { label: string; value: "km" | "mi"; icon: string }[] = [
    { label: "Miles (mi)", value: "mi", icon: "🇺🇸" },
    { label: "Kilometers (km)", value: "km", icon: "🌍" },
  ];

  return (
    <ModalShell visible={visible} onClose={onClose} title="Units">
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary, marginBottom: 8, marginLeft: 4 }}>Weight</Text>
      {weightOptions.map((opt) => (
        <Pressable
          key={opt.value}
          style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8, backgroundColor: unit === opt.value ? colors.primaryLight : "transparent", borderWidth: unit === opt.value ? 2 : 1, borderColor: unit === opt.value ? colors.primary : colors.border }, pressed && { opacity: 0.7 }]}
          onPress={() => { saveUnit(opt.value); }}
        >
          <Text style={{ fontSize: 24, marginRight: 14 }}>{opt.icon}</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text, flex: 1 }}>{opt.label}</Text>
          {unit === opt.value && <Text style={{ fontSize: 18, color: colors.primary, fontWeight: "700" }}>✓</Text>}
        </Pressable>
      ))}
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary, marginBottom: 8, marginTop: 12, marginLeft: 4 }}>Distance</Text>
      {distanceOptions.map((opt) => (
        <Pressable
          key={opt.value}
          style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8, backgroundColor: distanceUnit === opt.value ? colors.primaryLight : "transparent", borderWidth: distanceUnit === opt.value ? 2 : 1, borderColor: distanceUnit === opt.value ? colors.primary : colors.border }, pressed && { opacity: 0.7 }]}
          onPress={() => { saveDistanceUnit(opt.value); }}
        >
          <Text style={{ fontSize: 24, marginRight: 14 }}>{opt.icon}</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text, flex: 1 }}>{opt.label}</Text>
          {distanceUnit === opt.value && <Text style={{ fontSize: 18, color: colors.primary, fontWeight: "700" }}>✓</Text>}
        </Pressable>
      ))}
      <Pressable style={{ marginTop: 4, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: "center" }} onPress={onClose}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.textSecondary }}>Done</Text>
      </Pressable>
    </ModalShell>
  );
}

function RestTimerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { duration, saveDuration } = useRestTimer();
  const [inputVal, setInputVal] = useState(String(duration));
  const presets = [60, 90, 120, 180, 300];
  return (
    <ModalShell visible={visible} onClose={onClose} title="Rest Timer">
      <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12, textAlign: "center" }}>Auto-starts after each completed set</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
        {presets.map((s) => (
          <Pressable
            key={s}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 2, borderColor: duration === s ? colors.primary : colors.border, backgroundColor: duration === s ? colors.primaryLight : "transparent" }}
            onPress={() => { setInputVal(String(s)); saveDuration(s); }}
          >
            <Text style={{ fontWeight: "700", color: duration === s ? colors.primary : colors.textSecondary }}>{s < 60 ? `${s}s` : `${s / 60}m`}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 16, color: colors.text, backgroundColor: colors.inputBackground, textAlign: "center", marginBottom: 16 }}
        value={inputVal}
        onChangeText={setInputVal}
        keyboardType="numeric"
        placeholder="Seconds"
        placeholderTextColor={colors.textTertiary}
        onBlur={() => { const n = parseInt(inputVal, 10); if (n > 0) saveDuration(n); }}
      />
      <Pressable style={{ paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" }} onPress={onClose}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>Done</Text>
      </Pressable>
    </ModalShell>
  );
}

const AVATAR_LOCAL_KEY = "@gym_tracker_avatar_uri";

function ProfileEditModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    db.getUser().then(({ data }) => {
      const uid = data?.user?.id;
      if (!uid) return;
      setUserId(uid);
      Promise.all([
        db.getUserProfile(uid),
        // Load last-known local avatar URI as a quick display while we check profile
        AsyncStorage.getItem(AVATAR_LOCAL_KEY),
      ]).then(([{ data: profile }, localUri]) => {
        if (profile?.username) setUsername(profile.username);
        if (profile?.bio) setBio(profile.bio);
        // Prefer remote avatar_url, fall back to cached local URI
        setAvatarUri(profile?.avatar_url ?? localUri ?? null);
      });
    });
  }, [visible]);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Allow access to your photo library to set a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setAvatarUri(uri);
    // Cache locally so it shows even before Save is tapped
    await AsyncStorage.setItem(AVATAR_LOCAL_KEY, uri);
  };

  const handleSave = async () => {
    if (!username.trim()) { setError("Username cannot be empty."); return; }
    if (!userId) { setError("Not authenticated."); return; }
    setLoading(true); setError(null);

    let avatarUrl: string | null | undefined = undefined; // undefined = don't update

    // Upload avatar if the current URI looks like a local file (not already a remote URL)
    if (avatarUri && !avatarUri.startsWith("http")) {
      setUploading(true);
      const { url, error: uploadErr } = await db.uploadAvatar(userId, avatarUri);
      setUploading(false);
      if (uploadErr) {
        // Non-fatal: warn but still save the rest
        setError(`Avatar upload failed: ${uploadErr}. Other changes will still be saved.`);
      } else {
        avatarUrl = url;
        if (url) await AsyncStorage.setItem(AVATAR_LOCAL_KEY, url);
      }
    }

    const updates: { username: string; bio?: string | null; avatar_url?: string | null } = {
      username: username.trim(),
      bio: bio.trim() || null,
    };
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

    const { error: err } = await db.updateUserProfile(userId, updates);
    setLoading(false);
    if (err) { setError(err.message); return; }
    if (!error) onClose(); // only close if no avatar warning
  };

  const initials = username ? username.slice(0, 2).toUpperCase() : "?";
  const isBusy = loading || uploading;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={profileStyles.backdrop}>
        <View style={[profileStyles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[profileStyles.handle, { backgroundColor: colors.border }]} />
          <Text style={[profileStyles.title, { color: colors.text }]}>Edit Profile</Text>

          {/* ── Avatar ── */}
          <View style={profileStyles.avatarRow}>
            <Pressable style={profileStyles.avatarWrap} onPress={handlePickImage}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={profileStyles.avatarImg} />
              ) : (
                <View style={[profileStyles.avatarPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[profileStyles.avatarInitials, { color: colors.primary }]}>{initials}</Text>
                </View>
              )}
              <View style={[profileStyles.cameraBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ fontSize: 14 }}>📷</Text>
              </View>
            </Pressable>
            <Text style={[profileStyles.avatarHint, { color: colors.textTertiary }]}>
              Tap to change photo
            </Text>
          </View>

          {error && <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 10, textAlign: "center" }}>{error}</Text>}

          {/* ── Username ── */}
          <Text style={[profileStyles.fieldLabel, { color: colors.textSecondary }]}>Username</Text>
          <TextInput
            style={[profileStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.inputBackground }]}
            value={username}
            onChangeText={setUsername}
            placeholder="Enter username"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
          />

          {/* ── Bio ── */}
          <Text style={[profileStyles.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
          <TextInput
            style={[profileStyles.input, profileStyles.bioInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.inputBackground }]}
            value={bio}
            onChangeText={setBio}
            placeholder="A little about yourself…"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={160}
          />
          <Text style={[profileStyles.charCount, { color: colors.textTertiary }]}>{bio.length}/160</Text>

          {/* ── Actions ── */}
          <View style={profileStyles.actions}>
            <Pressable style={[profileStyles.cancelBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={onClose} disabled={isBusy}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable style={[profileStyles.saveBtn, { backgroundColor: colors.primary, opacity: isBusy ? 0.6 : 1 }]} onPress={handleSave} disabled={isBusy}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>
                {uploading ? "Uploading…" : loading ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const profileStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 20 },
  avatarRow: { alignItems: "center", marginBottom: 24 },
  avatarWrap: { position: "relative", width: 88, height: 88, marginBottom: 8 },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  avatarInitials: { fontSize: 32, fontWeight: "800" },
  cameraBtn: { position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  avatarHint: { fontSize: 12 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 16 },
  bioInput: { height: 80, textAlignVertical: "top" },
  charCount: { fontSize: 11, textAlign: "right", marginTop: -12, marginBottom: 16 },
  actions: { flexDirection: "row", gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  saveBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
});

function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => { setNewPassword(""); setConfirmPassword(""); setError(null); setSuccess(false); };

  const handleChange = async () => {
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true); setError(null);
    const { error: err } = await db.changePassword(newPassword);
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSuccess(true);
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <ModalShell visible={visible} onClose={handleClose} title="Change Password">
      {success ? (
        <View style={{ alignItems: "center", gap: 12 }}>
          <Text style={{ fontSize: 40 }}>✅</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.success, textAlign: "center" }}>Password updated successfully!</Text>
          <Pressable style={{ marginTop: 8, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", width: "100%" }} onPress={handleClose}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {error && <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 10, textAlign: "center" }}>{error}</Text>}
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>New Password</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, color: colors.text, backgroundColor: colors.inputBackground, marginBottom: 14 }}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
          />
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>Confirm Password</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, color: colors.text, backgroundColor: colors.inputBackground, marginBottom: 20 }}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter new password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: "center" }} onPress={handleClose}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable style={{ flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", opacity: loading ? 0.6 : 1 }} onPress={handleChange} disabled={loading}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>{loading ? "Updating…" : "Update Password"}</Text>
            </Pressable>
          </View>
        </>
      )}
    </ModalShell>
  );
}

function ContentModal({ visible, onClose, title, sections }: { visible: boolean; onClose: () => void; title: string; sections: { heading?: string; body: string }[] }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <Pressable style={{ ...StyleSheet.absoluteFillObject }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: "80%", elevation: 8 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 }} />
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 20 }}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            {sections.map((s, i) => (
              <View key={i} style={{ marginBottom: 16 }}>
                {s.heading && <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 6 }}>{s.heading}</Text>}
                <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 22 }}>{s.body}</Text>
              </View>
            ))}
            <View style={{ height: 20 }} />
          </ScrollView>
          <Pressable style={{ paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", marginTop: 8 }} onPress={onClose}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function AboutModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <ModalShell visible={visible} onClose={onClose} title="About">
      <View style={{ alignItems: "center", gap: 6, marginBottom: 20 }}>
        <Text style={{ fontSize: 48 }}>🏋️</Text>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>Summit</Text>
        <Text style={{ fontSize: 13, color: colors.textTertiary }}>Version 1.0.0</Text>
      </View>
      <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
        A personal workout tracker built to help you log, track, and improve your training — no social feed, just your progress.
      </Text>
      <View style={{ gap: 8 }}>
        {[["📊", "Track lifts & volume"], ["📈", "View progression charts"], ["🏆", "Detect personal records"], ["⏱️", "Automatic rest timer"], ["🔄", "Offline-first design"]].map(([icon, text]) => (
          <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 18 }}>{icon}</Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary }}>{text}</Text>
          </View>
        ))}
      </View>
      <Pressable style={{ marginTop: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: "center" }} onPress={onClose}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.textSecondary }}>Close</Text>
      </Pressable>
    </ModalShell>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();
  const { unit } = useUnits();
  const { duration } = useRestTimer();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showUnits, setShowUnits] = useState(false);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showGettingStarted, setShowGettingStarted] = useState(false);
  const [showRoutineHelp, setShowRoutineHelp] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_KEY).then((val) => {
      setNotificationsEnabled(val === "true");
    });
  }, []);

  const toggleNotifications = async (val: boolean) => {
    if (val) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        showAlert(
          "Permission Required",
          "Enable notifications in your device settings to receive rest timer alerts.",
          [{ text: "OK" }]
        );
        return;
      }
    }
    setNotificationsEnabled(val);
    AsyncStorage.setItem(NOTIF_KEY, String(val));
  };

  const appearanceLabel = mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System";

  const handleSignOut = () => {
    showAlert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => { await db.signOut(); } },
    ]);
  };

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

  const handleContactUs = () => {
    Linking.openURL("mailto:support@gymtracker.app?subject=Gym Tracker Feedback").catch(() => {
      showAlert("Contact Us", "Reach us at: support@gymtracker.app");
    });
  };

  const handleRateApp = () => {
    showAlert("Rate Gym Tracker", "Enjoying the app? We'd love your feedback!\n\nLeave us a review on the App Store to help others find us.", [
      { text: "Not Now", style: "cancel" },
      { text: "Rate Now", onPress: () => {} },
    ]);
  };

  const gettingStartedSections = [
    { heading: "1. Create a Routine", body: "Head to the Workouts tab and tap 'Create Routine'. Add a name and description, then add exercises to define your workout structure." },
    { heading: "2. Start a Workout", body: "Tap '▶ Start' on any routine to begin a live workout session. Your template sets are pre-loaded and ready to fill in." },
    { heading: "3. Log Your Sets", body: "Enter the weight and reps for each set, then tap ✓ to mark it complete. Previous session values appear as placeholder hints." },
    { heading: "4. Track Your Progress", body: "Tap any exercise name during a workout to view its history, best weight, and a progression chart over time." },
    { heading: "5. Rest Timer", body: "A countdown starts automatically after every completed set. You can adjust the duration in Settings → Rest Timer." },
    { heading: "6. Finish & Review PRs", body: "Tap 'Finish Workout' to save your session. If you hit any personal records, you'll see a summary before returning home." },
  ];

  const routineHelpSections = [
    { heading: "Creating Routines", body: "A routine is a reusable workout template. Create one for each day of your split (e.g. Push, Pull, Legs)." },
    { heading: "Adding Exercises", body: "Tap a routine to expand it, then tap 'Add Exercise'. Search from 500+ exercises or create your own custom exercise." },
    { heading: "Template Sets", body: "Tap an exercise name to manage its template sets. Set a target reps and weight for each set — these become your starting point each workout." },
    { heading: "Warmup Sets", body: "Mark a set as a warmup by tapping the W button. Warmup sets are tracked separately and don't count towards your working volume." },
    { heading: "Deleting Routines", body: "Hold a routine card for 500ms to get the delete option. You'll be asked to confirm before anything is removed." },
    { heading: "Mid-Workout Changes", body: "During a workout you can add new exercises using the '+ Add Exercise' button at the bottom of the workout screen." },
  ];

  const faqSections = [
    { heading: "How do I track a workout?", body: "Go to the Workouts tab, tap a routine card to expand it, then tap '▶ Start'. Fill in weight and reps for each set and tap ✓ to complete it." },
    { heading: "What are the greyed-out placeholder values?", body: "Those are your previous session's values for that exercise. They help you quickly match or beat last time's performance." },
    { heading: "Can I add exercises mid-workout?", body: "Yes! Scroll to the bottom of the workout screen and tap '+ Add Exercise' to add from the full exercise library." },
    { heading: "What's a PR?", body: "PR stands for Personal Record. When you lift more weight or more total volume than ever before, you'll see a 'New PRs!' summary when you finish your workout." },
    { heading: "How do progression charts work?", body: "Tap any exercise name during a workout to open the exercise detail screen. It shows your max weight per session over time as a line chart." },
    { heading: "Does this work without internet?", body: "Yes — the app works fully offline using in-memory storage. When a Supabase connection is available, data is persisted to the cloud." },
    { heading: "How do I switch between kg and lbs?", body: "Go to Settings → Units. All displayed weights switch immediately. Weights are always stored in lbs internally." },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <Pressable style={{ width: 40 }} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "600", color: colors.text, textAlign: "center" }}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>

        {/* Account */}
        <SettingSection title="Account">
          <SettingItem icon="person-outline" label="Edit Profile" onPress={() => setShowProfile(true)} />
          <SettingItem icon="lock-closed-outline" label="Change Password" onPress={() => setShowPassword(true)} />
          <SettingItem
            icon="notifications-outline"
            label="Notifications"
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={toggleNotifications}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
        </SettingSection>

        {/* Preferences */}
        <SettingSection title="Preferences">
          <SettingItem icon="timer-outline" label="Rest Timer" onPress={() => setShowRestTimer(true)} value={duration < 60 ? `${duration}s` : `${duration / 60}m`} />
          <SettingItem icon="scale-outline" label="Units" onPress={() => setShowUnits(true)} value={unit} />
          <SettingItem icon="moon-outline" label="Appearance" onPress={() => setShowAppearance(true)} value={appearanceLabel} />
        </SettingSection>

        {/* Guides */}
        <SettingSection title="Guides">
          <SettingItem icon="rocket-outline" label="Getting Started Guide" onPress={() => setShowGettingStarted(true)} />
          <SettingItem icon="list-outline" label="Routine Help" onPress={() => setShowRoutineHelp(true)} />
        </SettingSection>

        {/* Help */}
        <SettingSection title="Help">
          <SettingItem icon="help-circle-outline" label="Frequently Asked Questions" onPress={() => setShowFAQ(true)} />
          <SettingItem icon="mail-outline" label="Contact Us" onPress={handleContactUs} />
          <SettingItem icon="star-outline" label="Rate the App" onPress={handleRateApp} />
          <SettingItem icon="information-circle-outline" label="About" onPress={() => setShowAbout(true)} />
        </SettingSection>

        {/* Danger Zone */}
        <SettingSection title="Danger Zone">
          <SettingItem icon="trash-outline" label="Delete Account" onPress={handleDeleteAccount} destructive />
        </SettingSection>

        {/* Sign Out */}
        <View style={{ marginTop: 28, paddingHorizontal: 16 }}>
          <Pressable
            style={({ pressed }) => [
              { backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 15, alignItems: "center" as const },
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleSignOut}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.danger }}>Log Out</Text>
          </Pressable>
        </View>

        <Text style={{ textAlign: "center", color: colors.textTertiary, fontSize: 12, marginTop: 20, fontWeight: "500" }}>
          Gym Tracker v1.0.0
        </Text>
      </ScrollView>

      <AppearanceModal visible={showAppearance} onClose={() => setShowAppearance(false)} />
      <UnitsModal visible={showUnits} onClose={() => setShowUnits(false)} />
      <RestTimerModal visible={showRestTimer} onClose={() => setShowRestTimer(false)} />
      <ProfileEditModal visible={showProfile} onClose={() => setShowProfile(false)} />
      <ChangePasswordModal visible={showPassword} onClose={() => setShowPassword(false)} />
      <ContentModal visible={showGettingStarted} onClose={() => setShowGettingStarted(false)} title="Getting Started" sections={gettingStartedSections} />
      <ContentModal visible={showRoutineHelp} onClose={() => setShowRoutineHelp(false)} title="Routine Help" sections={routineHelpSections} />
      <ContentModal visible={showFAQ} onClose={() => setShowFAQ(false)} title="FAQ" sections={faqSections} />
      <AboutModal visible={showAbout} onClose={() => setShowAbout(false)} />
    </View>
  );
}
