import type { Transcript } from '../api/types';
import type { RecordingsCacheImpl } from '../cache/recordings-cache';
import type { TranscriptCacheImpl } from '../cache/transcript-cache';
import type { MutationQueue } from '../queue/mutation-queue';
import { getSettings } from '../cache/settings-cache';
import { WhisperClient } from './whisper-client';
import { getApiClient } from '../api/index';

export class TranscriptionManager {
  private whisperClient: WhisperClient | null = null;

  constructor(
    private recordingsCache: RecordingsCacheImpl,
    private transcriptCache: TranscriptCacheImpl,
    private queue: MutationQueue,
  ) {}

  async transcribe(recordingId: string, audioData: ArrayBuffer): Promise<void> {
    const settings = await getSettings();
    const isOnline = navigator.onLine;

    let apiKeyStatus = { configured: false, valid: false };
    if (isOnline) {
      try {
        apiKeyStatus = await getApiClient().getApiKeyStatus();
      } catch {
        // If we can't check, assume not configured
      }
    }

    let useCloud = false;

    switch (settings.transcriptionMode) {
      case 'openai_first':
        useCloud = isOnline && apiKeyStatus.configured && apiKeyStatus.valid;
        break;
      case 'always_local':
        useCloud = false;
        break;
      case 'openai_only':
        useCloud = isOnline && apiKeyStatus.configured && apiKeyStatus.valid;
        if (!useCloud) return; // Defer
        break;
    }

    if (useCloud) {
      await this.queue.enqueue({ type: 'transcribe', recordingId, mode: 'cloud' });
    } else {
      await this.transcribeLocally(recordingId, audioData, settings.onDeviceModel);
    }
  }

  async preloadModel(): Promise<void> {
    const settings = await getSettings();
    if (settings.transcriptionMode === 'openai_only') return;

    if (!this.whisperClient) {
      this.whisperClient = new WhisperClient();
    }
    try {
      await this.whisperClient.preload(settings.onDeviceModel);
    } catch {
      // Non-fatal
    }
  }

  private async transcribeLocally(
    recordingId: string,
    audioData: ArrayBuffer,
    model: 'tiny' | 'base' | 'small',
  ): Promise<void> {
    if (!this.whisperClient) {
      this.whisperClient = new WhisperClient();
    }

    const transcript: Transcript = await this.whisperClient.transcribe(audioData, model);

    // Save to local cache immediately
    await this.transcriptCache.set(recordingId, transcript);
    await this.recordingsCache.patch(recordingId, {
      hasTranscript: true,
      preview: transcript.text.substring(0, 200),
      transcriptionSource: 'local',
      transcriptionModel: transcript.model,
    });

    // Enqueue save to backend
    await this.queue.enqueue({ type: 'save-transcript', recordingId, transcript });

    // Enqueue title generation
    await this.queue.enqueue({ type: 'generate-title', recordingId });
  }

  destroy(): void {
    this.whisperClient?.terminate();
    this.whisperClient = null;
  }
}
