import { base64ToArrayBuffer, arrayBufferToBlob } from '../utils/audio-utils';
import type { AudioCacheImpl } from '../cache/audio-cache';
import type { ApiClient } from '../api/types';

export interface PlayerState {
  status: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';
  currentTime: number;
  duration: number;
  playbackRate: number;
}

const DEFAULT_STATE: PlayerState = {
  status: 'idle',
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
};

export class AudioPlayer {
  private audio: HTMLAudioElement;
  private state: PlayerState = { ...DEFAULT_STATE };
  private onStateChange: (state: PlayerState) => void;
  private recordingId: string | null = null;
  private retried = false;
  private audioCache?: AudioCacheImpl;
  private api?: ApiClient;

  constructor(
    onStateChange: (state: PlayerState) => void,
    audioCache?: AudioCacheImpl,
    api?: ApiClient,
  ) {
    this.onStateChange = onStateChange;
    this.audioCache = audioCache;
    this.api = api;
    this.audio = new Audio();
    this.bindEvents();
  }

  async load(recordingId: string): Promise<void> {
    this.recordingId = recordingId;
    this.retried = false;
    this.emitState({ status: 'loading', currentTime: 0, duration: 0, playbackRate: this.state.playbackRate });

    // 1. Try local cache first
    if (this.audioCache) {
      const cached = await this.audioCache.get(recordingId);
      if (cached) {
        const blob = arrayBufferToBlob(cached.data, cached.mimeType);
        this.setSource(URL.createObjectURL(blob));
        return;
      }
    }

    // 2. Fetch from server
    await this.fetchFromServer(recordingId);
  }

  play(): void {
    this.audio.play().catch(() => {
      this.emitState({ ...this.state, status: 'error' });
    });
  }

  pause(): void {
    this.audio.pause();
  }

  seek(time: number): void {
    this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration || 0));
  }

  skipForward(seconds = 15): void {
    this.seek(this.audio.currentTime + seconds);
  }

  skipBackward(seconds = 15): void {
    this.seek(this.audio.currentTime - seconds);
  }

  setRate(rate: number): void {
    const clamped = Math.max(0.6, Math.min(3.0, rate));
    this.audio.playbackRate = clamped;
    this.emitState({ ...this.state, playbackRate: clamped });
  }

  destroy(): void {
    this.audio.pause();
    if (this.audio.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.audio.src);
    }
    this.audio.src = '';
    this.audio.load();
    this.emitState({ ...DEFAULT_STATE });
  }

  getState(): PlayerState {
    return { ...this.state };
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private setSource(src: string): void {
    if (this.audio.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.audio.src);
    }
    this.audio.src = src;
    this.audio.load();
  }

  private bindEvents(): void {
    this.audio.onloadedmetadata = () => {
      this.emitState({ ...this.state, status: 'ready', duration: this.audio.duration });
    };

    this.audio.ontimeupdate = () => {
      this.emitState({ ...this.state, currentTime: this.audio.currentTime });
    };

    this.audio.onplay = () => {
      this.emitState({ ...this.state, status: 'playing' });
    };

    this.audio.onpause = () => {
      if (this.state.status === 'playing') {
        this.emitState({ ...this.state, status: 'paused' });
      }
    };

    this.audio.onended = () => {
      this.emitState({ ...this.state, status: 'paused', currentTime: 0 });
      this.audio.currentTime = 0;
    };

    this.audio.onerror = async () => {
      if (!this.retried && this.recordingId && this.audioCache) {
        // Clear cached audio and retry
        this.retried = true;
        await this.audioCache.remove(this.recordingId);
        await this.fetchFromServer(this.recordingId);
      } else {
        this.emitState({ ...this.state, status: 'error' });
      }
    };
  }

  private async fetchFromServer(recordingId: string): Promise<void> {
    if (!this.api) {
      this.emitState({ ...this.state, status: 'error' });
      return;
    }
    try {
      const data = await this.api.getAudio(recordingId);
      const bytes = base64ToArrayBuffer(data.audioBase64);
      if (this.audioCache) {
        await this.audioCache.set(recordingId, bytes, data.mimeType);
      }
      const blob = arrayBufferToBlob(bytes, data.mimeType);
      this.setSource(URL.createObjectURL(blob));
    } catch {
      this.emitState({ ...this.state, status: 'error' });
    }
  }

  private emitState(state: PlayerState): void {
    this.state = state;
    this.onStateChange(state);
  }
}
