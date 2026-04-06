import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MutationQueue } from '../../../src/queue/mutation-queue';
import { openDb } from '../../../src/cache/db';
import type { IDBPDatabase } from 'idb';
import type { VoiceRecorderDB } from '../../../src/cache/db';
import type { QueueOperation } from '../../../src/queue/operations';

let db: IDBPDatabase<VoiceRecorderDB>;

beforeEach(async () => {
  db = await openDb();
  const tx = db.transaction('queue', 'readwrite');
  await tx.store.clear();
  await tx.done;
});

function makeQueue(executor?: (op: QueueOperation) => Promise<void>): MutationQueue {
  const exec = executor ?? vi.fn().mockResolvedValue(undefined);
  return new MutationQueue(db, exec);
}

describe('MutationQueue', () => {
  it('persists entries to IndexedDB on enqueue', async () => {
    const q = makeQueue();
    await q.enqueue({ type: 'delete', recordingId: 'rec_1' });
    const count = await db.count('queue');
    expect(count).toBe(1);
  });

  it('processes entries in FIFO order', async () => {
    const order: string[] = [];
    const exec = vi.fn().mockImplementation(async (op: QueueOperation) => {
      if (op.type === 'delete') order.push(op.recordingId);
    });
    const q = makeQueue(exec);

    await q.enqueue({ type: 'delete', recordingId: 'rec_A' });
    await q.enqueue({ type: 'delete', recordingId: 'rec_B' });
    await q.enqueue({ type: 'delete', recordingId: 'rec_C' });
    await q.process();

    expect(order).toEqual(['rec_A', 'rec_B', 'rec_C']);
  });

  it('removes entries from queue after successful processing', async () => {
    const q = makeQueue();
    await q.enqueue({ type: 'delete', recordingId: 'rec_1' });
    await q.process();
    expect(await db.count('queue')).toBe(0);
  });

  it('marks entry as failed and increments attempts on error', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('network error'));
    const q = makeQueue(exec);

    await q.enqueue({ type: 'delete', recordingId: 'rec_fail' });
    await q.process();

    const entries = await db.getAll('queue');
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('failed');
    expect(entries[0].attempts).toBe(1);
    expect(entries[0].error).toBe('network error');
  });

  it('expires entries older than 7 days', async () => {
    const q = makeQueue();
    const oldTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000;

    // Manually insert an old entry
    await db.add('queue', {
      operation: { type: 'delete', recordingId: 'rec_old' },
      status: 'pending',
      createdAt: oldTimestamp,
      lastAttemptAt: null,
      attempts: 0,
      maxAttempts: 10,
      error: null,
    });

    await q.startup();

    const entries = await db.getAll('queue');
    expect(entries).toHaveLength(0);
  });

  it('resets processing entries to pending on startup', async () => {
    await db.add('queue', {
      operation: { type: 'delete', recordingId: 'rec_stuck' },
      status: 'processing',
      createdAt: Date.now(),
      lastAttemptAt: Date.now() - 1000,
      attempts: 1,
      maxAttempts: 10,
      error: null,
    });

    const exec = vi.fn().mockResolvedValue(undefined);
    const q = makeQueue(exec);
    await q.startup();

    // After startup, it should process the formerly-stuck entry
    expect(exec).toHaveBeenCalledOnce();
  });

  it('does not process when offline (navigator.onLine = false)', async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const q = makeQueue(exec);

    // Set offline BEFORE enqueuing so the auto-process triggered by enqueue also skips
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    await q.enqueue({ type: 'delete', recordingId: 'rec_offline' });
    await q.process();

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

    expect(exec).not.toHaveBeenCalled();
  });

  it('removes entry when maxAttempts is reached', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('always fails'));
    const q = makeQueue(exec);

    // Insert entry that's already at maxAttempts - 1
    await db.add('queue', {
      operation: { type: 'delete', recordingId: 'rec_maxed' },
      status: 'pending',
      createdAt: Date.now(),
      lastAttemptAt: null,
      attempts: 9,  // one more will hit maxAttempts=10
      maxAttempts: 10,
      error: null,
    });

    await q.process();

    expect(await db.count('queue')).toBe(0);
  });

  it('getPendingCount returns correct count', async () => {
    const q = makeQueue();
    expect(await q.getPendingCount()).toBe(0);
    await q.enqueue({ type: 'delete', recordingId: 'r1' });
    await q.enqueue({ type: 'delete', recordingId: 'r2' });
    expect(await q.getPendingCount()).toBe(2);
  });
});
