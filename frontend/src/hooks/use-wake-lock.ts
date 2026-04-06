import { useEffect, useRef } from 'preact/hooks';

export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) {
      lockRef.current?.release().catch(() => undefined);
      lockRef.current = null;
      return;
    }

    if (!('wakeLock' in navigator)) return;

    navigator.wakeLock
      .request('screen')
      .then((lock) => {
        lockRef.current = lock;
      })
      .catch(() => undefined);

    return () => {
      lockRef.current?.release().catch(() => undefined);
      lockRef.current = null;
    };
  }, [active]);
}
