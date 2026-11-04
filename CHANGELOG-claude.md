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

## 2026-10-30 (Fri)

Build status: `tsc` is clean. `npm run lint` shows 0 errors and the same 8 warnings as before. `jest` passes 194 tests in 19 suites (up from 159). `expo export -p web` builds. I checked every UI change in a headless browser at phone width, in light and dark, using local mode.

### Features
- **Workout Complete summary (like Strong/Hevy).** After Finish you see a recap: duration, volume (distance for cardio-only workouts), sets and PR count, plus each exercise's best set with PR badges. It replaces the "New PRs!" alert and the automatic photo prompt. The photo is now an optional **Add Photo** button.
- **Per-exercise rest timers.** Set one from an exercise's ••• menu → Rest Timer (Default, Off, or 0:30–5:00). It's remembered for that exercise in every workout. A small timer pill next to the name shows and changes it. Stored on the device, so there's no schema change.
- **Plate calculator.** Tap a set number → Plate Calculator. It shows the plates per side and a picture of the loaded bar, works in lbs or kg, lets you pick the bar weight (which it remembers), and shows the closest load when the weight can't be made exactly.
- **Exercise detail for cardio.** Shows Longest / Longest Time / Best Pace, a Distance/Time chart, and history with distance, time and pace, instead of weight/reps tiles.
- **New exercises start with sets ready.** Adding an exercise mid-workout creates as many sets as last time (one if it's new), so you can log right away.

### Bugs fixed
- **Offline use for signed-in Supabase users** (the "offline launch is fragile" item from last run):
  - **Couldn't start workouts offline.** Auth switched to the empty in-memory store when offline, so starting a workout said "Not authenticated". It now always uses Supabase's saved session, falling back to the copy on the device after the access token expires.
  - **Couldn't start routines offline.** Starting a routine offline failed with "Routine not found". It's now built from the cached routine. Starting it online keeps that cache fresh.
  - **Requests that can't reach the server** (gym "lie-fi", or a cold start before NetInfo reports offline) now serve cached data instead of an error.
  - **Offline sign-in no longer creates a fake local account** that could never sync. Offline sign-out now actually signs out.
- **Edit Workout couldn't edit cardio sets.** They showed as weight/reps. They now edit distance and time, and pace is recomputed. Exercises added there get the right type.
- **Routine cardio targets were always in miles.** They now follow the km/mi setting. A shared `useDistanceUnit()` hook means Settings changes reach screens that are already open. Profile used to stay on "mi" after switching back to km.
- **Profile cardio "Sessions" was always 1 with Supabase** (it read a column the query never selected). The query is now chunked.
- **Profile chart showed 6 empty future weeks.** It now shows the last 13 weeks with whole-number y-axis steps, and labels aren't truncated. Workouts that run past midnight no longer count 0 minutes.
- Best Pace shows /mi for mile users. "Best: 1 days" now reads "1 day".
- The app crashed at import when the Supabase env vars were missing, instead of running in local-only mode.
- **Headers** used a fixed 56–60px top padding: too tight under the Dynamic Island, wasted space on web and Android. They now use the real safe-area inset (`useHeaderTop`).
- A review subagent checked the diff. I fixed what it found:
  - The adding-exercise race (set inserts now run in parallel).
  - The iOS modal stacking on Finish.
  - Overly broad network-error detection.
  - A load race in the rest overrides.

### Notes / needs Yams's decision
- **Someone else pushed to `claude` during this run:** commit `a40706f` "Fix typecheck in authOffline test". It made the same one-line fix I had just made. I merged it (no force-push). If two scheduled runs overlap, they may race on this branch.
- `routines.routine_order` is still not in `supabaseSchema.md` (carried over from last run).
- Offline workouts still live in the in-memory local store until they're finished and queued. If the app is killed mid-workout while offline, that workout is lost. Fixing this means persisting `localDb` in-progress sessions to AsyncStorage.

### Ideas for next run
- Persist in-progress offline workouts (see above).
- Warm the routine caches for every routine when the home screen loads online (today only routines you've started or opened are cached).
- Supersets, and "Replace exercise" keeping the set count.
- Share card / image of the workout summary.
- Fix the remaining 8 lint warnings (mount-only effects).
- `startWorkoutFromRoutine` online assumes PostgREST returns inserted rows in order. Mapping by `exercise_order` would be safer.

## 2026-11-02 (Mon) — backfilled on 11-04

The Monday run pushed its commits but didn't write a log entry or update the PR description. This list comes from its commit messages:
- **Offline:** workouts started offline or in local mode survive restarts and reconnects. Logging keeps going when the signal drops mid-workout (outbox for server workouts). PRs set offline are queued too. Every routine is cached for offline starts.
- **Exercise picker:** a browse list, recents, muscle filters and smarter search.
- **During a workout:** exercise notes, reordering, Enter in the weight box jumps to reps, and working sets numbered after warm-ups.
- **History:** Repeat a past workout, Save a past workout as a routine, and a workout calendar on the profile.
- **Routines:** cards list their exercises, and a routine can be duplicated.
- **Other:** a Personal Records screen, the exercise chart zooms to your range, and the last lint warnings are cleared.

## 2026-11-04 (Wed)

Build status: `tsc` is clean, `npm run lint` shows 0 errors and 0 warnings, `jest` passes 272 tests in 32 suites (up from 243), and `expo export -p web` builds. I checked the changed screens in a headless browser at phone width, in light and dark, in local mode. Two read-only audit subagents looked for bugs, and a third reviewed my diff. I fixed what they found.

### Bugs fixed
- **Set numbers collided after deleting a set.** Removing a middle set and then adding one gave 1, 3, 3. Sets could then swap order on reload, and finishing a routine workout copied two sets into one template set. Adds now use the next free number, deletes renumber the rest, and add/delete run one at a time per exercise. This covers the workout logger, the routine editor and Edit Workout.
- **The same exercise twice in one workout saved the wrong PR.** The record was built from the first instance's sets only. For cardio, a worse second instance could overwrite the record.
- **PRs never came down.** A 2250 lb typo saved as a PR stayed forever, even after fixing it or deleting the workout. Leaving Edit Workout, or deleting a workout, now rebuilds those exercises' strength records from history.
  - It runs only when the server is up to date (online, nothing waiting to upload), inside the outbox lock, and it stops on any read error.
  - Edits made offline are remembered and rebuilt after the next sync.
- **Edit Workout:**
  - It couldn't mark sets done or not done, so numbers typed into an unticked set never counted. Each row now has a done checkbox.
  - Warm-ups number as W, 1, 2.
  - Rows no longer overflow on narrow (web) screens. The routine editor had the same overflow, now fixed.
- **The Previous column:**
  - It showed unticked sets from last time, and ticking an empty set logged them as done.
  - In local/offline mode it only looked at the very last workout. Mon legs → Wed push → Fri legs showed nothing for Friday's squats.
- **Routine screen:**
  - Replacing an exercise (Squat → Running) kept the old type.
  - Starting a routine while another workout was running stranded the first. It now offers Resume, like Home.
- **Workouts past midnight** showed "—" and were left out of the Longest and Avg Time stats. One shared duration helper replaces three copies.
- **A half-started routine** (the exercise or set insert failed) is deleted instead of coming back as "Resume".
- **History and profile:**
  - Local mode counted the workout in progress as history (streak, calendar, totals).
  - A failed delete still removed the card. A failed discard cleared the bar.
  - Profile totals didn't update after a delete.
  - Records showed 102.5 as 103.
  - An offline finish or delete didn't update cached history.
  - The calendar was stuck on the launch month.
- **Sign-out** now clears the workout bar, rest timer and notification, so the next user doesn't inherit them.
- **kg round trip:** 61.25 kg came back as 61.2. Storage now keeps three decimals, and display keeps 0.05 kg steps exact.
- **Rest notifications:** quick +30s/−15s taps could leave an extra alert that fired early, and Skip during a pending schedule was undone.
- **Workout Complete best set:** a set over 12 reps scored as zero, so 60×5 beat 100×15.

### UX
- **Rep Records on exercise detail** (like Strong's Records tab): the heaviest weight for each rep count from 1 to 12, with its date and estimated 1RM. A rep count is skipped when a heavier set for more reps already beats it.
- **Share from Workout Complete:** a text recap (duration, volume, sets, best sets, PRs) sent to the share sheet.
- **Exercise search:**
  - "bench press" now puts Barbell Bench Press first.
  - Words must match the start of a word, so "run" finds Running, not Crunches.
  - Common lifts get a boost, and plainer names win ties.
- **Light mode:** the weight/reps boxes in the logger were white on white. They now have a light grey fill.
- The set options sheet shows the on-screen set number ("Set 2", "Warm-up Set"), not the stored one.

### Needs Yams's decision or check
- **`completed = null`:** older set rows may have `completed` as null (the column is nullable). I now treat null as done everywhere: history, charts, Previous and the PR rebuild. Before, history/charts treated null as not done. Say if null should mean not done.
- **Warm-ups still count toward PR max weight and volume,** in both the existing PR code and the new rebuild. Strong leaves them out. That's a one-line change in each place if you want it.
- **Routine/session deletes assume Supabase cascades or the outbox deletes children.** The direct `deleteWorkoutSession` path relies on the FK. Discard already worked this way.
- **Still open from earlier runs:** `routines.routine_order` isn't in `supabaseSchema.md`.

### Ideas for next run
- Supersets (needs a schema column, e.g. `superset_group` on `session_exercises`/`routine_exercises`).
- Set types beyond warm-up (drop set, failure) and optional RPE per set.
- A share image for the workout summary.
- The "Offline" badge in local-only mode could say "Local" instead.
- `app/workout.tsx` is about 1,750 lines. Splitting the set row and the modals into components would help.
