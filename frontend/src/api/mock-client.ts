import type {
  ApiClient,
  PingResponse,
  RequestAccessResponse,
  CheckAuthResponse,
  GetRecordingsResponse,
  GetAudioResponse,
  GetTranscriptResponse,
  GetRecordingDataResponse,
  UploadPayload,
  UploadResponse,
  TranscribeResponse,
  Transcript,
  GenerateTitleResponse,
  BatchTitleResponse,
  SettingsResponse,
  Settings,
  ApiKeyStatusResponse,
  SaveApiKeyResponse,
  RebuildIndexResponse,
  BackfillResponse,
  TextIndexResponse,
  Recording,
  TextIndex,
} from './types';
import { makeFakeAudioBase64 } from '../utils/audio-utils';

const DEFAULT_SETTINGS: Settings = {
  transcriptionMode: 'openai_first',
  autoUpgrade: false,
  onDeviceModel: 'tiny',
};

const SEED_DATA: Recording[] = [
  {
    id: 'rec_1712345678901',
    date: '2026-04-05T10:30:00Z',
    duration: 312,
    mimeType: 'audio/mp4',
    fileSize: 1048576,
    location: { lat: 37.7749, lng: -122.4194, label: 'San Francisco, CA, US' },
    title: 'Morning Standup Notes',
    preview: "Good morning everyone, let's start with the sprint updates...",
    transcriptionSource: 'openai',
    transcriptionModel: 'whisper-1',
    hasTranscript: true,
  },
  {
    id: 'rec_1712432078902',
    date: '2026-04-06T08:15:00Z',
    duration: 185,
    mimeType: 'audio/mp4',
    fileSize: 614400,
    location: { lat: 40.7128, lng: -74.006, label: 'New York, NY, US' },
    title: 'Grocery Run Plans',
    preview: 'Need to pick up milk, eggs, and bread from the store...',
    transcriptionSource: 'local',
    transcriptionModel: 'whisper-tiny',
    hasTranscript: true,
  },
  {
    id: 'rec_1712518478903',
    date: '2026-04-07T14:45:00Z',
    duration: 92,
    mimeType: 'audio/webm',
    fileSize: 307200,
    location: { lat: 51.5074, lng: -0.1278, label: 'London, England, UK' },
    title: 'Meeting Recap',
    preview: 'Just finished the quarterly review meeting. Key points...',
    transcriptionSource: 'openai',
    transcriptionModel: 'whisper-1',
    hasTranscript: true,
  },
  {
    id: 'rec_1712604878904',
    date: '2026-04-08T09:00:00Z',
    duration: 450,
    mimeType: 'audio/mp4',
    fileSize: 1536000,
    location: null,
    title: null,
    preview: null,
    transcriptionSource: null,
    transcriptionModel: null,
    hasTranscript: false,
  },
];

const SEED_TEXT_INDEX: TextIndex = {
  rec_1712345678901: {
    text: "Good morning everyone, let's start with the sprint updates. Alice, can you go first? Sure, I finished the authentication module yesterday.",
    segments: [
      { start: 0.0, end: 3.2, text: 'Good morning everyone,' },
      { start: 3.2, end: 6.1, text: "let's start with the sprint updates." },
      { start: 6.1, end: 9.5, text: 'Alice, can you go first?' },
      { start: 9.5, end: 13.2, text: 'Sure, I finished the authentication module yesterday.' },
    ],
  },
  rec_1712432078902: {
    text: 'Need to pick up milk, eggs, and bread from the store. Also get some coffee and maybe some fruit. Oh and dont forget the paper towels.',
    segments: [
      { start: 0.0, end: 4.1, text: 'Need to pick up milk, eggs, and bread from the store.' },
      { start: 4.1, end: 8.3, text: 'Also get some coffee and maybe some fruit.' },
      { start: 8.3, end: 12.0, text: 'Oh and dont forget the paper towels.' },
    ],
  },
  rec_1712518478903: {
    text: 'Just finished the quarterly review meeting. Key points: budget approved, new hire starting Monday, product launch pushed to Q3.',
    segments: [
      { start: 0.0, end: 4.0, text: 'Just finished the quarterly review meeting.' },
      { start: 4.0, end: 7.5, text: 'Key points: budget approved, new hire starting Monday,' },
      { start: 7.5, end: 11.0, text: 'product launch pushed to Q3.' },
    ],
  },
};

export class MockApiClient implements ApiClient {
  private recordings: Recording[] = [...SEED_DATA];
  private textIndex: TextIndex = { ...SEED_TEXT_INDEX };
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private apiKeyConfigured = false;
  private latencyMs = 300;

  private delay(): Promise<void> {
    return new Promise((r) => setTimeout(r, this.latencyMs));
  }

  async ping(): Promise<PingResponse> {
    await this.delay();
    return { status: 'ok', hasApiKey: this.apiKeyConfigured };
  }

  async requestAccess(nickname: string): Promise<RequestAccessResponse> {
    await this.delay();
    const token = Math.random().toString(16).slice(2).padEnd(32, '0');
    return {
      token,
      fileId: `file_${token.slice(0, 8)}`,
      fileName: `auth_${token}.json`,
      folderUrl: 'https://drive.google.com/drive/folders/mock',
    };
  }

  async checkAuth(_token: string, _fileId: string): Promise<CheckAuthResponse> {
    await this.delay();
    return { authorized: true };
  }

  async revokeAccess(_revokeToken: string): Promise<void> {
    await this.delay();
  }

  async getRecordings(includeTextIndex?: boolean): Promise<GetRecordingsResponse> {
    await this.delay();
    return {
      recordings: [...this.recordings],
      textIndex: includeTextIndex ? { ...this.textIndex } : null,
    };
  }

  async getAudio(id: string): Promise<GetAudioResponse> {
    await this.delay();
    const rec = this.recordings.find((r) => r.id === id);
    if (!rec) throw new Error(`Recording ${id} not found`);
    return {
      id,
      audioBase64: makeFakeAudioBase64(256),
      mimeType: rec.mimeType,
    };
  }

  async getTranscript(id: string): Promise<GetTranscriptResponse> {
    await this.delay();
    const entry = this.textIndex[id];
    if (!entry) return { id, transcript: null };
    return {
      id,
      transcript: {
        text: entry.text,
        segments: entry.segments,
        source: 'openai',
        model: 'whisper-1',
      },
    };
  }

  async getRecordingData(id: string): Promise<GetRecordingDataResponse> {
    await this.delay();
    const audio = await this.getAudio(id);
    const { transcript } = await this.getTranscript(id);
    return { id, audioBase64: audio.audioBase64, mimeType: audio.mimeType, transcript };
  }

  async uploadRecording(payload: UploadPayload): Promise<UploadResponse> {
    await this.delay();
    const id = `rec_${payload.clientTimestamp}`;
    const existing = this.recordings.find((r) => r.id === id);
    if (existing) return { recording: existing, isDuplicate: true };

    const recording: Recording = {
      id,
      date: new Date(payload.clientTimestamp).toISOString(),
      duration: payload.duration,
      mimeType: payload.mimeType,
      fileSize: Math.round(payload.audioBase64.length * 0.75),
      location: payload.location,
      title: null,
      preview: null,
      transcriptionSource: null,
      transcriptionModel: null,
      hasTranscript: false,
    };
    this.recordings.unshift(recording);
    return { recording, isDuplicate: false };
  }

  async deleteRecording(id: string): Promise<void> {
    await this.delay();
    this.recordings = this.recordings.filter((r) => r.id !== id);
    delete this.textIndex[id];
  }

  async transcribe(id: string): Promise<TranscribeResponse> {
    await this.delay();
    const transcript: Transcript = {
      text: `Mock transcription for recording ${id}`,
      segments: [{ start: 0, end: 5, text: `Mock transcription for recording ${id}` }],
      source: 'openai',
      model: 'whisper-1',
    };
    // Update recording
    const rec = this.recordings.find((r) => r.id === id);
    if (rec) {
      rec.hasTranscript = true;
      rec.preview = transcript.text.substring(0, 200);
      rec.transcriptionSource = 'openai';
      rec.transcriptionModel = 'whisper-1';
    }
    this.textIndex[id] = { text: transcript.text, segments: transcript.segments };
    return { transcript };
  }

  async saveTranscript(id: string, transcript: Transcript): Promise<void> {
    await this.delay();
    this.textIndex[id] = { text: transcript.text, segments: transcript.segments };
    const rec = this.recordings.find((r) => r.id === id);
    if (rec) {
      rec.hasTranscript = true;
      rec.preview = transcript.text.substring(0, 200);
      rec.transcriptionSource = transcript.source;
      rec.transcriptionModel = transcript.model;
    }
  }

  async generateTitle(id: string): Promise<GenerateTitleResponse> {
    await this.delay();
    const titles = ['Quick Thought', 'Meeting Notes', 'Voice Memo', 'Idea Capture', 'Daily Log'];
    const title = titles[Math.floor(Math.random() * titles.length)];
    const rec = this.recordings.find((r) => r.id === id);
    if (rec) rec.title = title;
    return { id, title };
  }

  async batchGenerateTitles(ids: string[]): Promise<BatchTitleResponse> {
    await this.delay();
    const titles = await Promise.all(ids.map((id) => this.generateTitle(id)));
    return { titles: titles.map((t) => ({ id: t.id, title: t.title })) };
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.delay();
    const rec = this.recordings.find((r) => r.id === id);
    if (rec) rec.title = title;
  }

  async getSettings(): Promise<SettingsResponse> {
    await this.delay();
    return { settings: { ...this.settings } };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.delay();
    this.settings = { ...settings };
  }

  async getApiKeyStatus(): Promise<ApiKeyStatusResponse> {
    await this.delay();
    return { configured: this.apiKeyConfigured, valid: this.apiKeyConfigured };
  }

  async saveApiKey(apiKey: string): Promise<SaveApiKeyResponse> {
    await this.delay();
    const valid = apiKey.startsWith('sk-');
    if (valid) this.apiKeyConfigured = true;
    return { valid, saved: valid };
  }

  async getTextIndex(): Promise<TextIndexResponse> {
    await this.delay();
    return { textIndex: { ...this.textIndex } };
  }

  async rebuildIndex(): Promise<RebuildIndexResponse> {
    await this.delay();
    return {
      recordingsFound: this.recordings.length,
      transcriptsFound: Object.keys(this.textIndex).length,
      rebuilt: true,
      complete: true,
    };
  }

  async backfillTextIndex(): Promise<BackfillResponse> {
    await this.delay();
    return { backfilled: 0 };
  }
}
