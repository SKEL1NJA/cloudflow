import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router';

function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return visible;
}

export function NavigationProgress() {
  const navigation = useNavigation();
  const visible = useDelayedFlag(navigation.state !== 'idle', 150);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
    >
      <div className="h-full w-1/3 animate-[progress_1s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}
