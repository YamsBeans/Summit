## Table `custom_exercises`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `exercise_id` | `text` | Primary |
| `user_id` | `uuid` |  |
| `name` | `text` |  |
| `primary_muscle` | `text` |  Nullable |
| `equipment` | `text` |  Nullable |
| `exercise_type` | `text` |  |
| `created_at` | `timestamptz` |  |

## Table `personal_records`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `pr_id` | `int4` | Primary |
| `user_id` | `uuid` |  |
| `exercise_id` | `text` |  |
| `exercise_name` | `text` |  Nullable |
| `max_weight` | `float4` |  Nullable |
| `max_volume` | `float4` |  Nullable |
| `best_distance_meters` | `float4` |  Nullable |
| `best_pace_sec_per_km` | `float4` |  Nullable |
| `best_duration_seconds` | `int4` |  Nullable |
| `pr_type` | `text` |  |
| `updated_at` | `timestamptz` |  Nullable |

## Table `routine_exercise_sets`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `routine_set_id` | `int4` | Primary |
| `routine_exercise_id` | `int4` |  |
| `set_number` | `int4` |  |
| `target_weight` | `numeric` |  Nullable |
| `target_reps` | `int4` |  Nullable |
| `is_warmup` | `bool` |  Nullable |
| `target_duration_seconds` | `int4` |  Nullable |
| `target_distance_meters` | `float4` |  Nullable |
| `target_effort_level` | `int4` |  Nullable |

## Table `routine_exercises`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `routine_exercise_id` | `int4` | Primary |
| `routine_id` | `int4` |  |
| `exercise_id` | `text` |  |
| `exercise_name` | `text` |  |
| `exercise_order` | `int4` |  |
| `exercise_type` | `text` |  |

## Table `routines`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `routine_id` | `int4` | Primary |
| `routine_name` | `text` |  |
| `description` | `text` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `user_id` | `uuid` |  |

## Table `session_exercise_sets`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `session_set_id` | `int4` | Primary |
| `session_exercise_id` | `int4` |  |
| `set_number` | `int4` |  |
| `weight` | `numeric` |  Nullable |
| `reps` | `int4` |  Nullable |
| `is_warmup` | `bool` |  Nullable |
| `completed` | `bool` |  Nullable |
| `duration_seconds` | `int4` |  Nullable |
| `distance_meters` | `float4` |  Nullable |
| `pace_sec_per_km` | `float4` |  Nullable |
| `calories` | `int4` |  Nullable |
| `effort_level` | `int4` |  Nullable |

## Table `session_exercises`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `session_exercise_id` | `int4` | Primary |
| `session_id` | `int4` |  |
| `exercise_id` | `text` |  |
| `exercise_name` | `text` |  |
| `exercise_order` | `int4` |  |
| `notes` | `text` |  Nullable |
| `exercise_type` | `text` |  |

## Table `users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `username` | `text` |  Nullable |
| `email` | `text` |  Nullable |
| `password_hash` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `bio` | `text` |  Nullable |
| `avatar_url` | `text` |  Nullable |

## Table `workout_sessions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `session_id` | `int4` | Primary |
| `routine_id` | `int4` |  Nullable |
| `session_name` | `text` |  Nullable |
| `session_date` | `date` |  |
| `start_time` | `time` |  Nullable |
| `end_time` | `time` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `user_id` | `uuid` |  |
| `photo_url` | `text` |  Nullable |
| `sleep_hours` | `int2` |  Nullable |
| `nutrition` | `text` |  Nullable |
| `took_supps` | `bool` |  Nullable |

