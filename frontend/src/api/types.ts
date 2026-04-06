// ===== Core Domain Types =====

export interface Recording {
  id: string;
  date: string;
  duration: number;
  mimeType: string;
  fileSize: number;
  location: GeoLocation | null;
  title: string | null;
  preview: string | null;
  transcriptionSource: 'openai' | 'local' | null;
  transcriptionModel: string | null;
  hasTranscript: boolean;
}

export interface GeoLocation {
  lat: number;
  lng: number;
  label: string;
}

export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
  source: 'openai' | 'local';
  model: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Settings {
  transcriptionMode: 'openai_first' | 'always_local' | 'openai_only';
  autoUpgrade: boolean;
  onDeviceModel: 'tiny' | 'base' | 'small';
}

export interface TextIndex {
  [recordingId: string]: {
    text: string;
    segments: TranscriptSegment[];
  };
}

// ===== API Request/Response Types =====

export interface PingResponse {
  status: string;
  hasApiKey: boolean;
}

export interface RequestAccessResponse {
  token: string;
  fileId: string;
  fileName: string;
  folderUrl: string;
}

export interface CheckAuthResponse {
  authorized: boolean;
}

export interface GetRecordingsResponse {
  recordings: Recording[];
  textIndex: TextIndex | null;
}

export interface GetAudioResponse {
  id: string;
  audioBase64: string;
  mimeType: string;
}

export interface GetTranscriptResponse {
  id: string;
  transcript: Transcript | null;
}

export interface GetRecordingDataResponse {
  id: string;
  audioBase64: string;
  mimeType: string;
  transcript: Transcript | null;
}

export interface UploadPayload {
  clientTimestamp: number;
  audioBase64: string;
  mimeType: string;
  duration: number;
  location: GeoLocation | null;
}

export interface UploadResponse {
  recording: Recording;
  isDuplicate: boolean;
}

export interface TranscribeResponse {
  transcript: Transcript;
}

export interface GenerateTitleResponse {
  id: string;
  title: string | null;
}

export interface BatchTitleResponse {
  titles: Array<{ id: string; title: string | null }>;
}

export interface SettingsResponse {
  settings: Settings;
}

export interface ApiKeyStatusResponse {
  configured: boolean;
  valid: boolean;
}

export interface SaveApiKeyResponse {
  valid: boolean;
  saved: boolean;
}

export interface RebuildIndexResponse {
  recordingsFound: number;
  transcriptsFound: number;
  rebuilt: boolean;
  complete?: boolean;
}

export interface BackfillResponse {
  backfilled: number;
}

export interface TextIndexResponse {
  textIndex: TextIndex;
}

// ===== API Interface =====

export interface ApiClient {
  ping(): Promise<PingResponse>;
  requestAccess(nickname: string): Promise<RequestAccessResponse>;
  checkAuth(token: string, fileId: string): Promise<CheckAuthResponse>;
  revokeAccess(revokeToken: string): Promise<void>;
  getRecordings(includeTextIndex?: boolean): Promise<GetRecordingsResponse>;
  getAudio(id: string): Promise<GetAudioResponse>;
  getTranscript(id: string): Promise<GetTranscriptResponse>;
  getRecordingData(id: string): Promise<GetRecordingDataResponse>;
  uploadRecording(recording: UploadPayload): Promise<UploadResponse>;
  deleteRecording(id: string): Promise<void>;
  transcribe(id: string): Promise<TranscribeResponse>;
  saveTranscript(id: string, transcript: Transcript): Promise<void>;
  generateTitle(id: string): Promise<GenerateTitleResponse>;
  batchGenerateTitles(ids: string[]): Promise<BatchTitleResponse>;
  updateTitle(id: string, title: string): Promise<void>;
  getSettings(): Promise<SettingsResponse>;
  saveSettings(settings: Settings): Promise<void>;
  getApiKeyStatus(): Promise<ApiKeyStatusResponse>;
  saveApiKey(apiKey: string): Promise<SaveApiKeyResponse>;
  getTextIndex(): Promise<TextIndexResponse>;
  rebuildIndex(): Promise<RebuildIndexResponse>;
  backfillTextIndex(): Promise<BackfillResponse>;
}
