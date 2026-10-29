# Claude run log (branch `claude`)

Each scheduled run appends a dated section: what changed and why, anything unfinished, and ideas for next time. Nothing here has been merged to `main`. Yams reviews it first.

## 2026-10-28 (Wed)

Build status: `npm run lint` shows 0 errors and 8 warnings (there were 17 before this run). `tsc` is clean. `jest` passes 159 tests, up from 138. `expo export -p web` builds. I checked the main flows in a headless browser in offline/local mode, in light and dark themes and in kg and lbs.

### Bugs fixed
- **Weights entered in kg were saved as lbs.** The database stores lbs. Every screen showed weights converted, but the screens where you type them did not convert. So 100 typed in kg mode was saved as 100 lb, and history then showed 45.4 kg. The workout logger, routine editor and workout editor now show and accept the display unit. They only write when the visible value actually changes, so no rounding drift. The routine editor's column header was hard-coded to "LBS".
- **PR records could get worse.** A volume-only PR wrote that day's lighter top weight over the all-time max, and the reverse. A cardio distance PR erased the best pace. The record now keeps the better value per field (`mergeStrengthRecord`). Strength PR detection also ignores cardio records.
- **Rest timer was wrong after locking the phone.** It counted ticks, and JS timers pause in the background. It is now based on the wall clock. It also survives minimizing the workout and is cleared when you finish or discard.
- **Previous-session numbers were missing for exercises added mid-workout.** This covered every quick-start workout.
- **An in-progress workout was lost after an app restart or page reload.** The resume bar only lived in memory. It is now restored from the database. `getActiveSession` no longer errors if two open sessions exist.
- **Exercise detail showed dates one day early in US time zones.** Fixed, along with a possible crash when a PR value was 0.
- Routine Move Up/Down order was saved but never applied when the list loaded.
- Tab bar labels were clipped.
- Offline sign-in/up never navigated into the app.
- The rest notification now uses the Android high-importance channel.
- Text inputs can no longer save NaN, and comma decimals ("82,5") are accepted.

### UX and visual
- **Quick Start:** "Start Empty Workout", named by time of day. It turns into "Resume …" while a workout is running. Starting a second workout now offers to resume the first.
- **Logging like Strong/Hevy:**
  - Tap the PREVIOUS value to copy it into the set.
  - Checking an empty set logs last time's numbers.
  - Previous values show as placeholders.
  - Decimal and number keypads.
  - Haptics on set complete, PRs and rest end.
- **Finish confirmation** when sets are unfinished or none are completed.
- **Rest banner:** progress bar, −15s / +30s / Skip, turns amber in the last 10 seconds, respects the safe area.
- **Exercise detail:** Est. 1RM (Epley) tile, Max Weight / Est. 1RM chart toggle, best set highlighted, round y-axis numbers, better empty states.
- **Sign-in screen:** logo, wordmark and tagline, show-password toggle, autofill hints for password managers, basic validation.
- Volumes are shown as whole numbers, so no more "800.1 kg".
- The resume bar only floats over tab screens.

### Performance
- Workout set rows no longer re-render every second. The rest-timer callbacks are stable now and the elapsed clock is its own component.
- Exercise history loads in one query (chunked) instead of one request per past session.

### Needs Yams's decision or check
- **`routines.routine_order` column:** the app writes it, but `backend/supabaseSchema.md` doesn't list it. If the column doesn't exist in Supabase, reordering silently fails. A one-line migration would fix that. I didn't add one, because I can't see the live database.
- **Empty sets now log last session's numbers.** Checking a set with empty inputs copies them, the way Strong/Hevy do. Say if you'd rather it stay empty.

### Not done / ideas for next run
- **Offline launch is fragile.** `networkStatus` starts as "connected" and NetInfo resolves later. Data calls go to the in-memory `localDb` when offline, and the read cache covers only some reads. Worth a careful pass.
- Routine cardio targets are always in miles, but the workout screen follows the km/mi setting.
- A workout summary screen after Finish (PRs, volume, duration, share) to replace the plain alert.
- Plate calculator and per-exercise rest times.
- Exercise detail for cardio exercises (it currently shows weight stats).
- The remaining lint warnings are mount-only effects (`loadSession` etc.).

## 2026-10-29 (requested by Yams)
- **Account settings page (like Hevy's):** Settings → Account now opens its own screen with Change Username, Change Email and Update Password, plus Delete Account at the bottom. It replaces the old Change Password row and the Danger Zone section.
  - **Change Email** calls `supabase.auth.updateUser({ email })`, and Supabase emails a confirmation link. The app's root URL has to be in Supabase → Auth → Redirect URLs for that link to bring you back into the app.
  - **Update Password** now asks for your current password first and checks it before saving the new one.
- The shared settings building blocks (SettingItem, SettingSection, ModalShell) moved to `components/SettingsUI.tsx`.
