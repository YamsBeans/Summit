import { useEffect, useState } from "react";
import { db } from "@/backend/db";

/**
 * Resolves a workout's saved photo_url into a displayable image URL.
 * Progress photos are private, so stored paths are exchanged for signed links.
 */
export function useProgressPhotoUrl(photoUrl: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    db.getProgressPhotoUrl(photoUrl).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  return resolved;
}
