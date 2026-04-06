import { useState, useEffect, useCallback } from 'preact/hooks';
import type { MutationQueue } from '../queue/mutation-queue';

export function useQueue(queue: MutationQueue | null) {
  const [pendingCount, setPendingCount] = useState(0);
  const [lastFailedOp, setLastFailedOp] = useState<string | null>(null);

  useEffect(() => {
    const updateCount = async () => {
      if (!queue) return;
      const count = await queue.getPendingCount();
      setPendingCount(count);
    };

    updateCount();

    const interval = setInterval(updateCount, 2000);

    const onFailed = (e: Event) => {
      const detail = (e as CustomEvent).detail as { operation: { type: string } };
      setLastFailedOp(detail.operation.type);
    };
    globalThis.addEventListener('queue-operation-failed', onFailed);

    return () => {
      clearInterval(interval);
      globalThis.removeEventListener('queue-operation-failed', onFailed);
    };
  }, [queue]);

  const process = useCallback(() => {
    queue?.process();
  }, [queue]);

  return { pendingCount, lastFailedOp, process };
}
