import type { Transcript } from '../api/types';
import { resampleTo16kMono } from './resample';

export class WhisperClient {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }

  // Resampling is done here in the main thread rather than inside the worker
  // because iOS Safari does not support OfflineAudioContext in Web Workers.
  async transcribe(
    audioData: ArrayBuffer,
    model: 'tiny' | 'base' | 'small',
    onProgress?: (stage: string) => void,
  ): Promise<Transcript> {
    onProgress?.('resampling');
    const audio16k = await resampleTo16kMono(audioData);

    return new Promise((resolve, reject) => {
      this.worker.onmessage = (e: MessageEvent) => {
        switch (e.data.type) {
          case 'progress':
            onProgress?.(e.data.stage as string);
            break;
          case 'result':
            resolve(e.data.transcript as Transcript);
            break;
          case 'error':
            reject(new Error(e.data.message as string));
            break;
        }
      };
      this.worker.onerror = (err) => reject(err);
      // Transfer ownership of the Float32Array buffer for performance
      this.worker.postMessage({ type: 'transcribe', audioData: audio16k, model }, [audio16k.buffer]);
    });
  }

  preload(model: 'tiny' | 'base' | 'small', onProgress?: (stage: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (e: MessageEvent) => {
        switch (e.data.type) {
          case 'progress':
            onProgress?.(e.data.stage as string);
            break;
          case 'preload-complete':
            resolve();
            break;
          case 'error':
            reject(new Error(e.data.message as string));
            break;
        }
      };
      this.worker.onerror = (err) => reject(err);
      this.worker.postMessage({ type: 'preload', model });
    });
  }

  terminate(): void {
    this.worker.terminate();
  }
}
