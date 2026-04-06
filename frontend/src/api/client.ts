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
} from './types';

export const EXPECTED_BACKEND_VERSION = '1.0.0';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RealApiClient implements ApiClient {
  private baseUrl: string;
  private token: string | null;

  constructor(baseUrl: string, token: string | null) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async get(action: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('action', action);
    if (this.token) url.searchParams.set('token', this.token);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const response = await fetch(url.toString(), { redirect: 'follow' });
    const data = (await response.json()) as {
      success: boolean;
      version: string;
      data?: unknown;
      error?: { code: string; message: string };
    };

    if (!data.success) {
      throw new ApiError(data.error!.code, data.error!.message);
    }
    this.checkVersion(data.version);
    return data.data;
  }

  private async post(action: string, body: Record<string, unknown> = {}): Promise<unknown> {
    const url = new URL(this.baseUrl);
    if (this.token) url.searchParams.set('token', this.token);

    const response = await fetch(url.toString(), {
      method: 'POST',
      body: JSON.stringify({ action, ...body }),
      headers: { 'Content-Type': 'text/plain' }, // Avoid CORS preflight
      redirect: 'follow',
    });
    const data = (await response.json()) as {
      success: boolean;
      version: string;
      data?: unknown;
      error?: { code: string; message: string };
    };

    if (!data.success) {
      throw new ApiError(data.error!.code, data.error!.message);
    }
    this.checkVersion(data.version);
    return data.data;
  }

  private checkVersion(backendVersion: string): void {
    if (backendVersion < EXPECTED_BACKEND_VERSION) {
      globalThis.dispatchEvent(
        new CustomEvent('backend-update-available', {
          detail: { current: backendVersion, expected: EXPECTED_BACKEND_VERSION },
        }),
      );
    }
  }

  // ─── Health ───────────────────────────────────────────────────────────────

  async ping(): Promise<PingResponse> {
    return this.get('ping') as Promise<PingResponse>;
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  async requestAccess(nickname: string): Promise<RequestAccessResponse> {
    return this.post('requestAccess', { nickname }) as Promise<RequestAccessResponse>;
  }

  async checkAuth(token: string, fileId: string): Promise<CheckAuthResponse> {
    return this.get('checkAuth', { token, fileId }) as Promise<CheckAuthResponse>;
  }

  async revokeAccess(revokeToken: string): Promise<void> {
    await this.post('revokeAccess', { revokeToken });
  }

  // ─── Recordings ───────────────────────────────────────────────────────────

  async getRecordings(includeTextIndex?: boolean): Promise<GetRecordingsResponse> {
    const params: Record<string, string> = {};
    if (includeTextIndex) params.includeTextIndex = 'true';
    return this.get('getRecordings', params) as Promise<GetRecordingsResponse>;
  }

  async getAudio(id: string): Promise<GetAudioResponse> {
    return this.get('getAudio', { id }) as Promise<GetAudioResponse>;
  }

  async getTranscript(id: string): Promise<GetTranscriptResponse> {
    return this.get('getTranscript', { id }) as Promise<GetTranscriptResponse>;
  }

  async getRecordingData(id: string): Promise<GetRecordingDataResponse> {
    return this.get('getRecordingData', { id }) as Promise<GetRecordingDataResponse>;
  }

  async uploadRecording(recording: UploadPayload): Promise<UploadResponse> {
    return this.post('uploadRecording', { recording }) as Promise<UploadResponse>;
  }

  async deleteRecording(id: string): Promise<void> {
    await this.post('deleteRecording', { id });
  }

  // ─── Transcription ────────────────────────────────────────────────────────

  async transcribe(id: string): Promise<TranscribeResponse> {
    return this.post('transcribe', { id }) as Promise<TranscribeResponse>;
  }

  async saveTranscript(id: string, transcript: Transcript): Promise<void> {
    await this.post('saveTranscript', { id, transcript });
  }

  // ─── Titles ───────────────────────────────────────────────────────────────

  async generateTitle(id: string): Promise<GenerateTitleResponse> {
    return this.post('generateTitle', { id }) as Promise<GenerateTitleResponse>;
  }

  async batchGenerateTitles(ids: string[]): Promise<BatchTitleResponse> {
    return this.post('batchGenerateTitles', { ids }) as Promise<BatchTitleResponse>;
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.post('updateTitle', { id, title });
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  async getSettings(): Promise<SettingsResponse> {
    return this.get('getSettings') as Promise<SettingsResponse>;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.post('saveSettings', { settings });
  }

  async getApiKeyStatus(): Promise<ApiKeyStatusResponse> {
    return this.get('getApiKeyStatus') as Promise<ApiKeyStatusResponse>;
  }

  async saveApiKey(apiKey: string): Promise<SaveApiKeyResponse> {
    return this.post('saveApiKey', { apiKey }) as Promise<SaveApiKeyResponse>;
  }

  // ─── Maintenance ──────────────────────────────────────────────────────────

  async getTextIndex(): Promise<TextIndexResponse> {
    return this.get('getTextIndex') as Promise<TextIndexResponse>;
  }

  async rebuildIndex(): Promise<RebuildIndexResponse> {
    return this.post('rebuildIndex') as Promise<RebuildIndexResponse>;
  }

  async backfillTextIndex(): Promise<BackfillResponse> {
    return this.post('backfillTextIndex') as Promise<BackfillResponse>;
  }
}
