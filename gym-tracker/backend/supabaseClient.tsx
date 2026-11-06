import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

// Without these the app runs in local-only mode (see `isOnline` in db.tsx).
// createClient throws on an empty URL, which used to crash the whole app at
// import time instead, so fall back to an inert placeholder that db.tsx never
// calls (every Supabase call is gated on `isOnline`).
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "http://localhost.invalid";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "not-configured";

const getStorage = () => {
  if (Platform.OS === "web") {
    return undefined; // uses localStorage by default on web
  }
  // Only import AsyncStorage on native
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  return AsyncStorage;
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});