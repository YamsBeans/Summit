import { useEffect, useRef } from "react";

/**
 * Save a value still being typed when the row goes away. Tapping Done or
 * Back in a header outside the ScrollView doesn't blur the input on native,
 * so the screen unmounted before the blur arrived and the last value typed
 * was dropped. The commit functions should only write when the value changed.
 */
export function useCommitOnUnmount(commit: () => void) {
  const ref = useRef(commit);
  ref.current = commit;
  useEffect(() => () => ref.current(), []);
}
