import { createContext, useCallback, useContext, useState } from "react";

type ActiveWorkout = {
  sessionId: number;
  sessionName: string;
  startTimestamp: number;
} | null;

type ActiveWorkoutCtx = {
  activeWorkout: ActiveWorkout;
  minimizeWorkout: (id: number, name: string, startTimestamp: number) => void;
  clearActiveWorkout: () => void;
};

const ActiveWorkoutContext = createContext<ActiveWorkoutCtx>({
  activeWorkout: null,
  minimizeWorkout: () => {},
  clearActiveWorkout: () => {},
});

export function ActiveWorkoutProvider({ children }: { children: React.ReactNode }) {
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout>(null);

  const minimizeWorkout = useCallback((id: number, name: string, startTimestamp: number) => {
    setActiveWorkout({ sessionId: id, sessionName: name, startTimestamp });
  }, []);

  const clearActiveWorkout = useCallback(() => {
    setActiveWorkout(null);
  }, []);

  return (
    <ActiveWorkoutContext.Provider value={{ activeWorkout, minimizeWorkout, clearActiveWorkout }}>
      {children}
    </ActiveWorkoutContext.Provider>
  );
}

export function useActiveWorkout() {
  return useContext(ActiveWorkoutContext);
}
