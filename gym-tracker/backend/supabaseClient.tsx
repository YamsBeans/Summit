import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

function readSupabaseUrl(): string | undefined {
  const raw = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!raw || raw === "undefined") return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

function readSupabaseAnonKey(): string | undefined {
  const raw = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!raw || raw === "undefined") return undefined;
  return raw;
}

const SUPABASE_URL = readSupabaseUrl();
const SUPABASE_ANON_KEY = readSupabaseAnonKey();
const hasSupabaseEnv = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/** True only when URL + key are present and URL is a valid http(s) URL (matches Supabase client rules). */
export const isSupabaseConfigured = hasSupabaseEnv;

const getStorage = () => {
  if (Platform.OS === "web") {
    return undefined; // uses localStorage by default on web
  }
  // Only import AsyncStorage on native
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  return AsyncStorage;
};

const missingSupabaseClient = new Proxy(
  {},
  {
    get() {
      throw new Error(
        "Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
      );
    },
  }
);

export const supabase = hasSupabaseEnv
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: getStorage(),
        autoRefreshToken: true,
        persistSession: true,
        // Required for Supabase email recovery links on web.
        detectSessionInUrl: Platform.OS === "web",
      },
    })
  : (missingSupabaseClient as any);