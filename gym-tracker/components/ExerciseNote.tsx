import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Platform, TextInput } from "react-native";
import { useTheme } from "@/theme/ThemeContext";

/**
 * A note under an exercise ("seat 4", "felt heavy"). Saved shortly after
 * you stop typing and when the screen closes; a blur alone isn't enough, as
 * tapping Finish or minimize doesn't blur the box.
 */
const ExerciseNote = memo(function ExerciseNote({ initial, focusKey, onSave }: {
  initial: string;
  /** Changes when "Add/Edit Note" is chosen, to focus the box. */
  focusKey: number;
  onSave: (text: string) => void;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState(initial);
  const inputRef = useRef<TextInput>(null);
  const saved = useRef(initial);
  const latest = useRef({ text, onSave });
  latest.current = { text, onSave };

  // Take a new value from outside only if it isn't our own save echoing back.
  useEffect(() => {
    if (initial.trim() !== saved.current.trim()) {
      saved.current = initial;
      setText(initial);
    }
  }, [initial]);

  const flush = useCallback(() => {
    const { text: t, onSave: save } = latest.current;
    if (t.trim() !== saved.current.trim()) {
      saved.current = t;
      save(t);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(flush, 800);
    return () => clearTimeout(id);
  }, [text, flush]);
  useEffect(() => flush, [flush]); // on unmount

  useEffect(() => {
    if (focusKey > 0) {
      const id = setTimeout(() => inputRef.current?.focus(), Platform.OS === "ios" ? 450 : 50);
      return () => clearTimeout(id);
    }
  }, [focusKey]);

  return (
    <TextInput
      ref={inputRef}
      value={text}
      onChangeText={setText}
      onBlur={flush}
      placeholder="Add a note…"
      placeholderTextColor={colors.textTertiary}
      multiline
      maxLength={300}
      style={{
        marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 8, fontSize: 13, color: colors.text, backgroundColor: colors.surfaceSecondary,
      }}
      accessibilityLabel="Exercise note"
    />
  );
});

export default ExerciseNote;
