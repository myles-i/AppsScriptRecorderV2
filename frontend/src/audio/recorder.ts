import { blobsToArrayBuffer } from '../utils/audio-utils';

export interface RecorderState {
  status: 'idle' | 'recording' | 'paused' | 'stopping';
  elapsed: number;
  amplitude: number;
}

export interface StopResult {
  audio: ArrayBuffer;
  mimeType: string;
  duration: number;
}

export function getPreferredMimeType(): string {
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  throw new Error('No supported audio MIME type found');
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private audioCtx: AudioContext | null = null;

  private startTime = 0;
  private pausedDuration = 0;
  private lastPauseTime = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  private state: RecorderState = { status: 'idle', elapsed: 0, amplitude: 0 };
  private onStateChange?: (state: RecorderState) => void;

  constructor(onStateChange?: (state: RecorderState) => void) {
    this.onStateChange = onStateChange;
  }

  getState(): RecorderState {
    return { ...this.state };
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /** Must be called inside a user gesture handler (required for iOS). */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = getPreferredMimeType();

    // Set up AudioContext for waveform amplitude
    try {
      this.audioCtx = new AudioContext();
      await this.audioCtx.resume();
      this.analyser = this.audioCtx.createAnalyser();
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      source.connect(this.analyser);
    } catch {
      // Non-fatal: waveform won't work but recording still proceeds
    }

    this.audioChunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      audioBitsPerSecond: 32000,
    });

    this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };

    this.startTime = Date.now();
    this.pausedDuration = 0;
    this.mediaRecorder.start(1000); // 1-second timeslice for emergency save

    this.setState({ status: 'recording', elapsed: 0, amplitude: 0 });
    this.startTimer();
  }

  pause(): void {
    if (this.state.status !== 'recording') return;
    this.mediaRecorder?.pause();
    this.lastPauseTime = Date.now();
    this.setState({ ...this.state, status: 'paused' });
    this.stopTimer();
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.pausedDuration += Date.now() - this.lastPauseTime;
    this.mediaRecorder?.resume();
    this.setState({ ...this.state, status: 'recording' });
    this.startTimer();
  }

  async stop(): Promise<StopResult | null> {
    if (!this.mediaRecorder || this.state.status === 'idle') return null;

    this.setState({ ...this.state, status: 'stopping' });
    this.stopTimer();

    const duration = this.getElapsed();

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        const audio = await blobsToArrayBuffer(this.audioChunks);
        const mimeType = this.mediaRecorder!.mimeType || getPreferredMimeType();
        this.cleanup();
        resolve({ audio, mimeType, duration });
      };
      this.mediaRecorder!.stop();
    });
  }

  /** Assemble whatever chunks have been collected so far without stopping. */
  async emergencySave(): Promise<StopResult | null> {
    if (this.audioChunks.length === 0) return null;

    const audio = await blobsToArrayBuffer(this.audioChunks);
    const mimeType = this.mediaRecorder?.mimeType ?? getPreferredMimeType();
    const duration = this.getElapsed();

    this.cleanup();
    return { audio, mimeType, duration };
  }

  getAmplitude(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] - 128) / 128;
      if (v > max) max = v;
    }
    return max;
  }

  destroy(): void {
    this.cleanup();
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private getElapsed(): number {
    if (this.startTime === 0) return 0;
    const now = Date.now();
    let elapsed = now - this.startTime - this.pausedDuration;
    if (this.state.status === 'paused') {
      elapsed -= now - this.lastPauseTime;
    }
    return Math.max(0, elapsed / 1000);
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      const elapsed = this.getElapsed();
      const amplitude = this.getAmplitude();
      this.setState({ ...this.state, elapsed, amplitude });
    }, 100);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private setState(state: RecorderState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  private cleanup(): void {
    this.stopTimer();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.analyser = null;
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
    this.setState({ status: 'idle', elapsed: 0, amplitude: 0 });
  }
}
