import type { IDBPDatabase } from 'idb';
import type { VoiceRecorderDB, QueueEntry } from '../cache/db';
import type { QueueOperation } from './operations';

const ENTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type QueueExecutor = (operation: QueueOperation) => Promise<void>;

export class MutationQueue {
  private processPromise: Promise<void> | null = null;

  constructor(
    private db: IDBPDatabase<VoiceRecorderDB>,
    private executor: QueueExecutor,
  ) {}

  /**
   * Call on app startup and on reconnect.
   * - Resets 'processing' entries to 'pending'.
   * - Resets attempt counters.
   * - Removes expired entries.
   * - Starts processing.
   */
  async startup(): Promise<void> {
    await this.resetStuckEntries();
    await this.removeExpiredEntries();
    await this.process();
  }

  async enqueue(operation: QueueOperation): Promise<void> {
    await this.db.add('queue', {
      operation,
      status: 'pending',
      createdAt: Date.now(),
      lastAttemptAt: null,
      attempts: 0,
      maxAttempts: 10,
      error: null,
    });
    this.process(); // fire and forget
  }

  process(): Promise<void> {
    // If already running, return the same promise so callers can await it
    if (this.processPromise) return this.processPromise;
    if (!navigator.onLine) return Promise.resolve();

    this.processPromise = this._runLoop().finally(() => {
      this.processPromise = null;
    });
    return this.processPromise;
  }

  private async _runLoop(): Promise<void> {
    while (true) {
      const entry = await this.getNextPending();
      if (!entry) break;

      await this.markProcessing(entry.id!);

      try {
        await this.executor(entry.operation);
        await this.remove(entry.id!);
      } catch (err) {
        const attempts = entry.attempts + 1;
        const isExpired = this.isExpired(entry);
        if (attempts >= entry.maxAttempts || isExpired) {
          await this.remove(entry.id!);
          this.emitFailure(entry, err as Error);
        } else {
          await this.markFailed(entry.id!, attempts, (err as Error).message);
        }
      }
    }
  }

  async getPendingCount(): Promise<number> {
    const all = await this.db.getAll('queue');
    return all.filter((e) => e.status === 'pending' || e.status === 'failed').length;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getNextPending(): Promise<(QueueEntry & { id: number }) | null> {
    const all = (await this.db.getAll('queue')) as (QueueEntry & { id: number })[];
    // FIFO: sort by id (auto-increment = insertion order)
    // Only return 'pending' — failed entries are reset to pending on next startup/reconnect
    const pending = all
      .filter((e) => e.status === 'pending')
      .sort((a, b) => a.id - b.id);
    return pending[0] ?? null;
  }

  private async markProcessing(id: number): Promise<void> {
    const entry = await this.db.get('queue', id);
    if (!entry) return;
    await this.db.put('queue', { ...entry, status: 'processing', id });
  }

  private async markFailed(id: number, attempts: number, error: string): Promise<void> {
    const entry = await this.db.get('queue', id);
    if (!entry) return;
    await this.db.put('queue', {
      ...entry,
      status: 'failed',
      attempts,
      lastAttemptAt: Date.now(),
      error,
      id,
    });
  }

  private async remove(id: number): Promise<void> {
    await this.db.delete('queue', id);
  }

  private async resetStuckEntries(): Promise<void> {
    const all = (await this.db.getAll('queue')) as (QueueEntry & { id: number })[];
    // Reset both 'processing' (interrupted) and 'failed' (give another chance on reconnect)
    const stuck = all.filter((e) => e.status === 'processing' || e.status === 'failed');
    for (const entry of stuck) {
      await this.db.put('queue', { ...entry, status: 'pending', attempts: 0 });
    }
  }

  private async removeExpiredEntries(): Promise<void> {
    const all = (await this.db.getAll('queue')) as (QueueEntry & { id: number })[];
    const expired = all.filter((e) => this.isExpired(e));
    for (const entry of expired) {
      await this.db.delete('queue', entry.id);
    }
  }

  private isExpired(entry: QueueEntry): boolean {
    return Date.now() - entry.createdAt > ENTRY_TTL_MS;
  }

  private emitFailure(entry: QueueEntry, error: Error): void {
    globalThis.dispatchEvent(
      new CustomEvent('queue-operation-failed', {
        detail: { operation: entry.operation, error: error.message },
      }),
    );
  }
}
