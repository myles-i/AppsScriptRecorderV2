# Frontend Implementation Specification

**Type:** Progressive Web App (PWA)
**Stack:** TypeScript, Preact, Vite, Workbox
**Hosting:** Static files (GitHub Pages, Netlify, or any CDN)

---

## 1. Overview

A mobile-first PWA that records voice memos, transcribes them (on-device or via the backend's OpenAI integration), and syncs everything to the user's Google Drive via a Google Apps Script backend. The app works fully offline, including recording and on-device transcription.

The frontend communicates with the backend exclusively through the API contract defined in `backend.md`. The backend is a black box — the frontend never accesses Drive directly.

---

## 2. Tech Stack

| Technology | Purpose | Version/Notes |
|-----------|---------|---------------|
| **TypeScript** | Type safety, IDE support | Strict mode |
| **Preact** | UI components (3KB React alternative) | ^10.x, with `preact/hooks` |
| **Vite** | Bundler, dev server, HMR | ^5.x |
| **Workbox** | Service worker, precaching, offline | `workbox-precaching`, `workbox-routing` |
| **idb-keyval** | Simple IndexedDB wrapper for settings/tokens | ^6.x |
| **idb** | Full IndexedDB wrapper for structured data | ^8.x |
| **@huggingface/transformers** | On-device Whisper (ONNX Runtime Web) | ^3.x |

### 2.1 Why These Choices
- **Preact over React:** 3KB vs 40KB. Performance targets (100ms screen transitions) require minimal framework overhead. Preact's API is identical to React's hooks API.
- **Vite:** Fast dev server, native ESM, tree-shaking, easy PWA plugin integration.
- **idb + idb-keyval:** idb-keyval for simple key-value (auth token, settings). idb for structured stores (recordings, transcripts, audio cache, queue).
- **@huggingface/transformers:** Mature ONNX-based Whisper implementation. Runs in Web Worker. Supports tiny/base/small models.

---

## 3. Project Structure

```
├── public/
│   ├── manifest.json              # PWA manifest
│   ├── icons/                     # App icons (192x192, 512x512)
│   └── favicon.ico
├── src/
│   ├── main.tsx                   # Entry point, renders App
│   ├── app.tsx                    # Router, global state providers
│   ├── api/
│   │   ├── client.ts             # Real API client (all backend calls)
│   │   ├── mock-client.ts        # Mock API client for dev/testing
│   │   ├── types.ts              # API request/response types (shared w/ backend)
│   │   └── index.ts              # Exports active client (real or mock)
│   ├── audio/
│   │   ├── recorder.ts           # MediaRecorder wrapper
│   │   ├── player.ts             # Audio playback controller
│   │   └── waveform.ts           # Canvas waveform visualization
│   ├── cache/
│   │   ├── db.ts                 # IndexedDB schema & migrations
│   │   ├── recordings-cache.ts   # Recording metadata cache
│   │   ├── transcript-cache.ts   # Transcript text + segments cache
│   │   ├── audio-cache.ts        # Audio blob cache (LRU, ~10 entries)
│   │   └── settings-cache.ts     # Local settings (idb-keyval)
│   ├── queue/
│   │   ├── mutation-queue.ts     # Durable mutation queue
│   │   └── operations.ts         # Operation type definitions
│   ├── transcription/
│   │   ├── manager.ts            # Orchestrator: decides cloud vs local
│   │   ├── worker.ts             # Web Worker entry (Whisper inference)
│   │   └── whisper-client.ts     # Main-thread interface to worker
│   ├── screens/
│   │   ├── browse.tsx            # Main recordings list
│   │   ├── record.tsx            # Recording screen
│   │   ├── playback.tsx          # Playback + transcript screen
│   │   └── setup/
│   │       ├── wizard.tsx        # Setup wizard container
│   │       ├── step-create.tsx   # Step 1: Create GAS project
│   │       ├── step-deploy.tsx   # Step 2: Deploy web app
│   │       ├── step-connect.tsx  # Step 3: Enter URL + nickname
│   │       ├── step-authorize.tsx # Step 3b: Star-to-authorize
│   │       └── step-apikey.tsx   # Step 4: OpenAI key (optional)
│   ├── components/
│   │   ├── recording-card.tsx    # Recording list item
│   │   ├── search-bar.tsx        # Search input w/ filtering
│   │   ├── transcript-view.tsx   # Transcript with playback sync
│   │   ├── speed-control.tsx     # Playback speed bottom sheet
│   │   ├── share-sheet.tsx       # Share bottom sheet
│   │   ├── banner.tsx            # Info/warning/error banners
│   │   ├── settings-modal.tsx    # Settings modal
│   │   └── update-modal.tsx      # Backend update instructions
│   ├── hooks/
│   │   ├── use-recordings.ts    # Recordings state + sync
│   │   ├── use-playback.ts      # Audio playback state
│   │   ├── use-search.ts        # Search filtering logic
│   │   ├── use-online.ts        # Online/offline detection
│   │   ├── use-queue.ts         # Queue status + processing
│   │   └── use-wake-lock.ts     # Screen wake lock
│   ├── state/
│   │   ├── app-state.ts         # Global app state (Preact signals or context)
│   │   └── auth-state.ts        # Auth token, backend URL, connection status
│   ├── utils/
│   │   ├── geo.ts               # Geolocation + reverse geocoding
│   │   ├── format.ts            # Date/time/duration formatting
│   │   ├── audio-utils.ts       # Base64 encode/decode, blob conversion
│   │   └── platform.ts          # iOS detection, feature detection
│   ├── styles/
│   │   ├── global.css           # Global styles, CSS variables
│   │   └── screens/             # Per-screen styles
│   ├── service-worker.ts        # Service worker (Workbox)
│   └── static/
│       └── backend.gs.txt       # Backend source code for copy-paste
├── tests/
│   ├── unit/
│   │   ├── api/client.test.ts
│   │   ├── cache/*.test.ts
│   │   ├── queue/mutation-queue.test.ts
│   │   ├── audio/recorder.test.ts
│   │   ├── hooks/*.test.ts
│   │   └── utils/*.test.ts
│   ├── integration/
│   │   ├── recording-flow.test.ts
│   │   ├── playback-flow.test.ts
│   │   ├── search.test.ts
│   │   ├── offline-queue.test.ts
│   │   └── setup-wizard.test.ts
│   └── mocks/
│       ├── audio.ts             # Fake audio blobs
│       ├── recordings.ts        # Fake recording data
│       └── indexeddb.ts         # IndexedDB mock (fake-indexeddb)
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── vitest.config.ts
```

---

## 4. API Client Layer

### 4.1 Real Client (`api/client.ts`)

The client encapsulates all backend communication. Every method maps to one backend endpoint.

```typescript
interface ApiClient {
  // Health
  ping(): Promise<PingResponse>;

  // Auth
  requestAccess(nickname: string): Promise<RequestAccessResponse>;
  checkAuth(token: string, fileId: string): Promise<CheckAuthResponse>;
  revokeAccess(revokeToken: string): Promise<void>;

  // Recordings
  getRecordings(includeTextIndex?: boolean): Promise<GetRecordingsResponse>;
  getAudio(id: string): Promise<GetAudioResponse>;
  getTranscript(id: string): Promise<GetTranscriptResponse>;
  getRecordingData(id: string): Promise<GetRecordingDataResponse>;
  uploadRecording(recording: UploadPayload): Promise<UploadResponse>;
  deleteRecording(id: string): Promise<void>;

  // Transcription
  transcribe(id: string): Promise<TranscribeResponse>;
  saveTranscript(id: string, transcript: Transcript): Promise<void>;

  // Titles
  generateTitle(id: string): Promise<GenerateTitleResponse>;
  batchGenerateTitles(ids: string[]): Promise<BatchTitleResponse>;
  updateTitle(id: string, title: string): Promise<void>;

  // Settings
  getSettings(): Promise<SettingsResponse>;
  saveSettings(settings: Settings): Promise<void>;
  getApiKeyStatus(): Promise<ApiKeyStatusResponse>;
  saveApiKey(apiKey: string): Promise<SaveApiKeyResponse>;

  // Maintenance
  getTextIndex(): Promise<TextIndexResponse>;
  rebuildIndex(): Promise<RebuildIndexResponse>;
  backfillTextIndex(): Promise<BackfillResponse>;
}
```

**Implementation details:**

```typescript
class RealApiClient implements ApiClient {
  private baseUrl: string;
  private token: string | null;

  constructor(baseUrl: string, token: string | null) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async get(action: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('action', action);
    if (this.token) url.searchParams.set('token', this.token);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const response = await fetch(url.toString(), { redirect: 'follow' });
    const data = await response.json();

    if (!data.success) throw new ApiError(data.error.code, data.error.message);
    this.checkVersion(data.version);
    return data.data;
  }

  private async post(action: string, body: Record<string, any> = {}): Promise<any> {
    const url = new URL(this.baseUrl);
    if (this.token) url.searchParams.set('token', this.token);

    const response = await fetch(url.toString(), {
      method: 'POST',
      body: JSON.stringify({ action, ...body }),
      headers: { 'Content-Type': 'text/plain' },  // Avoid CORS preflight
      redirect: 'follow',
    });
    const data = await response.json();

    if (!data.success) throw new ApiError(data.error.code, data.error.message);
    this.checkVersion(data.version);
    return data.data;
  }

  private checkVersion(backendVersion: string): void {
    // Compare with expected version; emit event if outdated
    if (backendVersion < EXPECTED_BACKEND_VERSION) {
      globalThis.dispatchEvent(new CustomEvent('backend-update-available', {
        detail: { current: backendVersion, expected: EXPECTED_BACKEND_VERSION }
      }));
    }
  }
}
```

**Error handling:**
```typescript
class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
```

The API client does NOT handle retries — that's the mutation queue's job. Read operations can be retried by the calling code with simple exponential backoff.

### 4.2 Mock Client (`api/mock-client.ts`)

For frontend development without a backend. Implements the same `ApiClient` interface.

```typescript
class MockApiClient implements ApiClient {
  private recordings: Recording[] = [...SEED_DATA];
  private textIndex: TextIndex = { ...SEED_TEXT_INDEX };
  private settings: Settings = DEFAULT_SETTINGS;
  private apiKeyConfigured = false;
  private latencyMs = 300;

  private async delay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.latencyMs));
  }

  async getRecordings(includeTextIndex?: boolean): Promise<GetRecordingsResponse> {
    await this.delay();
    return {
      recordings: this.recordings,
      textIndex: includeTextIndex ? this.textIndex : null,
    };
  }

  async uploadRecording(payload: UploadPayload): Promise<UploadResponse> {
    await this.delay();
    const id = `rec_${payload.clientTimestamp}`;
    const existing = this.recordings.find(r => r.id === id);
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

  // ... implement all other methods with in-memory state + delay
}
```

**Seed data:** Include 5-10 realistic recordings with transcripts for development:
```typescript
const SEED_DATA: Recording[] = [
  {
    id: 'rec_1712345678901',
    date: '2026-04-05T10:30:00Z',
    duration: 312,
    mimeType: 'audio/mp4',
    fileSize: 1048576,
    location: { lat: 37.7749, lng: -122.4194, label: 'San Francisco, CA, US' },
    title: 'Morning Standup Notes',
    preview: 'Good morning everyone, let\'s start with the sprint updates...',
    transcriptionSource: 'openai',
    transcriptionModel: 'whisper-1',
    hasTranscript: true,
  },
  // ... more entries
];
```

**Switching between real and mock:**
```typescript
// api/index.ts
import { RealApiClient } from './client';
import { MockApiClient } from './mock-client';

export function createApiClient(): ApiClient {
  if (import.meta.env.VITE_MOCK_API === 'true') {
    return new MockApiClient();
  }
  const url = getStoredBackendUrl();
  const token = getStoredToken();
  return new RealApiClient(url, token);
}
```

Toggle with environment variable: `VITE_MOCK_API=true npm run dev`

---

## 5. Shared Data Types (`api/types.ts`)

These types define the contract between frontend and backend. They match the schemas in `backend.md` Section 7.

```typescript
// ===== Core Domain Types =====

interface Recording {
  id: string;                    // "rec_<clientTimestamp>"
  date: string;                  // ISO 8601
  duration: number;              // Seconds
  mimeType: string;              // "audio/mp4" | "audio/webm"
  fileSize: number;              // Bytes
  location: GeoLocation | null;
  title: string | null;
  preview: string | null;        // First ~200 chars of transcript
  transcriptionSource: 'openai' | 'local' | null;
  transcriptionModel: string | null;
  hasTranscript: boolean;
}

interface GeoLocation {
  lat: number;
  lng: number;
  label: string;
}

interface Transcript {
  text: string;
  segments: TranscriptSegment[];
  source: 'openai' | 'local';
  model: string;
}

interface TranscriptSegment {
  start: number;   // Seconds
  end: number;     // Seconds
  text: string;
}

interface Settings {
  transcriptionMode: 'openai_first' | 'always_local' | 'openai_only';
  autoUpgrade: boolean;
  onDeviceModel: 'tiny' | 'base' | 'small';
}

interface TextIndex {
  [recordingId: string]: {
    text: string;
    segments: TranscriptSegment[];
  };
}

// ===== API Request/Response Types =====

interface PingResponse {
  status: string;
  hasApiKey: boolean;
}

interface RequestAccessResponse {
  token: string;
  fileId: string;
  fileName: string;
  folderUrl: string;
}

interface CheckAuthResponse {
  authorized: boolean;
}

interface GetRecordingsResponse {
  recordings: Recording[];
  textIndex: TextIndex | null;
}

interface GetAudioResponse {
  id: string;
  audioBase64: string;
  mimeType: string;
}

interface GetTranscriptResponse {
  id: string;
  transcript: Transcript | null;
}

interface GetRecordingDataResponse {
  id: string;
  audioBase64: string;
  mimeType: string;
  transcript: Transcript | null;
}

interface UploadPayload {
  clientTimestamp: number;
  audioBase64: string;
  mimeType: string;
  duration: number;
  location: GeoLocation | null;
}

interface UploadResponse {
  recording: Recording;
  isDuplicate: boolean;
}

interface TranscribeResponse {
  transcript: Transcript;
}

interface GenerateTitleResponse {
  id: string;
  title: string | null;
}

interface BatchTitleResponse {
  titles: Array<{ id: string; title: string | null }>;
}

interface SettingsResponse {
  settings: Settings;
}

interface ApiKeyStatusResponse {
  configured: boolean;
  valid: boolean;
}

interface SaveApiKeyResponse {
  valid: boolean;
  saved: boolean;
}

interface RebuildIndexResponse {
  recordingsFound: number;
  transcriptsFound: number;
  rebuilt: boolean;
  complete?: boolean;
}

interface BackfillResponse {
  backfilled: number;
}

// ===== API Error =====

interface ApiErrorResponse {
  code: string;
  message: string;
}
```

---

## 6. Local Storage & Caching

### 6.1 IndexedDB Schema (`cache/db.ts`)

Single database: `voicerecorder`

```typescript
interface VoiceRecorderDB extends DBSchema {
  // Store: recording metadata (all entries, never evicted)
  recordings: {
    key: string;          // recording ID
    value: Recording;
    indexes: {
      'by-date': string;  // ISO date for sorting
    };
  };

  // Store: transcripts (all entries, never evicted)
  transcripts: {
    key: string;          // recording ID
    value: {
      text: string;
      segments: TranscriptSegment[];
      source: string;
      model: string;
    };
  };

  // Store: audio blobs (LRU, max ~10 entries)
  audio: {
    key: string;          // recording ID
    value: {
      data: ArrayBuffer;  // NOT Blob — iOS Safari loses Blobs across sessions
      mimeType: string;
      accessedAt: number; // Timestamp for LRU eviction
    };
  };

  // Store: mutation queue
  queue: {
    key: number;          // Auto-increment
    value: QueueEntry;
    indexes: {
      'by-status': string;
    };
  };
}
```

### 6.2 Recording Metadata Cache (`cache/recordings-cache.ts`)

```typescript
interface RecordingsCache {
  // Load all recordings from IndexedDB (for cold start)
  getAll(): Promise<Recording[]>;

  // Bulk replace (after server sync)
  replaceAll(recordings: Recording[]): Promise<void>;

  // Optimistic single-entry updates
  upsert(recording: Recording): Promise<void>;
  remove(id: string): Promise<void>;

  // Patch fields (e.g., title update, transcript status)
  patch(id: string, fields: Partial<Recording>): Promise<void>;
}
```

On app startup, the browse screen renders immediately from cached data. Then a background fetch to the server reconciles differences (see Section 14).

### 6.3 Transcript Cache (`cache/transcript-cache.ts`)

```typescript
interface TranscriptCache {
  get(id: string): Promise<Transcript | null>;
  set(id: string, transcript: Transcript): Promise<void>;
  remove(id: string): Promise<void>;

  // Bulk load text index for search
  getTextIndex(): Promise<TextIndex>;
  setTextIndex(index: TextIndex): Promise<void>;
}
```

The full text index is stored in a single IndexedDB entry for fast search loading. Individual transcripts (with segments) are stored per-recording for playback.

### 6.4 Audio Cache (`cache/audio-cache.ts`)

```typescript
interface AudioCache {
  get(id: string): Promise<{ data: ArrayBuffer; mimeType: string } | null>;
  set(id: string, data: ArrayBuffer, mimeType: string): Promise<void>;
  remove(id: string): Promise<void>;

  // Called after set() — evicts oldest entries if count > MAX_CACHED
  evictIfNeeded(): Promise<void>;
}

const MAX_CACHED_AUDIO = 10;
```

**iOS Safari note:** Store audio as `ArrayBuffer`, not `Blob`. iOS Safari's IndexedDB loses Blob references across browser sessions. Convert to Blob only at playback time:
```typescript
function arrayBufferToBlob(buffer: ArrayBuffer, mimeType: string): Blob {
  return new Blob([buffer], { type: mimeType });
}
```

### 6.5 Settings Cache (`cache/settings-cache.ts`)

Uses `idb-keyval` for simple key-value storage:

```typescript
// Keys stored in idb-keyval
const KEYS = {
  BACKEND_URL: 'backend_url',
  AUTH_TOKEN: 'auth_token',
  BROWSER_NICKNAME: 'browser_nickname',
  SETTINGS: 'settings',
  LAST_SYNC: 'last_sync',
  WHISPER_MODEL_STATUS: 'whisper_model_status',
} as const;
```

---

## 7. Durable Mutation Queue

### 7.1 Overview

All state-changing operations go through the mutation queue. The queue guarantees:
- **Durability:** Entries are persisted to IndexedDB before any network call.
- **Order:** Entries process in FIFO order.
- **Retry:** Failed entries retry with exponential backoff.
- **Survival:** Queue survives app close, page refresh, device restart.
- **Expiry:** Entries older than 7 days are expired and cleaned up.

### 7.2 Queue Entry Schema

```typescript
interface QueueEntry {
  id?: number;              // Auto-increment (IndexedDB key)
  operation: QueueOperation;
  status: 'pending' | 'processing' | 'failed';
  createdAt: number;        // Timestamp ms
  lastAttemptAt: number | null;
  attempts: number;
  maxAttempts: number;      // Default 10
  error: string | null;     // Last error message
}

type QueueOperation =
  | { type: 'upload'; clientTimestamp: number; mimeType: string; duration: number; location: GeoLocation | null }
  | { type: 'transcribe'; recordingId: string; mode: 'cloud' | 'local' }
  | { type: 'save-transcript'; recordingId: string; transcript: Transcript }
  | { type: 'generate-title'; recordingId: string }
  | { type: 'batch-generate-titles'; recordingIds: string[] }
  | { type: 'update-title'; recordingId: string; title: string }
  | { type: 'delete'; recordingId: string }
  | { type: 'save-settings'; settings: Settings }
  | { type: 'auto-upgrade-transcription'; recordingId: string };
```

### 7.3 Queue Processing

```typescript
class MutationQueue {
  private processing = false;
  private db: IDBPDatabase<VoiceRecorderDB>;

  // Called on: app startup, reconnect, after enqueue
  async process(): Promise<void> {
    if (this.processing) return;
    if (!navigator.onLine && this.requiresNetwork()) return;
    this.processing = true;

    try {
      while (true) {
        const entry = await this.getNextPending();
        if (!entry) break;

        await this.markProcessing(entry.id!);

        try {
          await this.execute(entry.operation);
          await this.remove(entry.id!);
        } catch (err) {
          const attempts = entry.attempts + 1;
          if (attempts >= entry.maxAttempts || this.isExpired(entry)) {
            await this.remove(entry.id!);
            this.emitFailure(entry, err);
          } else {
            await this.markFailed(entry.id!, attempts, err.message);
          }
        }
      }
    } finally {
      this.processing = false;
    }
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
    this.process(); // Fire and forget
  }

  private isExpired(entry: QueueEntry): boolean {
    return Date.now() - entry.createdAt > 7 * 24 * 60 * 60 * 1000;
  }
}
```

### 7.4 Operation Execution

The `execute` method dispatches by operation type:

```typescript
private async execute(op: QueueOperation): Promise<void> {
  switch (op.type) {
    case 'upload': {
      // 1. Read audio from IndexedDB audio cache
      const audio = await audioCache.get(`rec_${op.clientTimestamp}`);
      if (!audio) throw new Error('Audio not found in cache');
      
      // 2. Base64 encode
      const base64 = arrayBufferToBase64(audio.data);
      
      // 3. Upload to backend
      const result = await api.uploadRecording({
        clientTimestamp: op.clientTimestamp,
        audioBase64: base64,
        mimeType: op.mimeType,
        duration: op.duration,
        location: op.location,
      });
      
      // 4. Update local cache with server-assigned data
      await recordingsCache.patch(result.recording.id, result.recording);
      break;
    }

    case 'transcribe': {
      const result = await api.transcribe(op.recordingId);
      await transcriptCache.set(op.recordingId, result.transcript);
      await recordingsCache.patch(op.recordingId, {
        hasTranscript: true,
        preview: result.transcript.text.substring(0, 200),
        transcriptionSource: result.transcript.source,
        transcriptionModel: result.transcript.model,
      });
      break;
    }

    case 'save-transcript': {
      await api.saveTranscript(op.recordingId, op.transcript);
      break;
    }

    case 'generate-title': {
      const result = await api.generateTitle(op.recordingId);
      if (result.title) {
        await recordingsCache.patch(op.recordingId, { title: result.title });
      }
      break;
    }

    case 'delete': {
      await api.deleteRecording(op.recordingId);
      // Local cache already cleared optimistically
      break;
    }

    case 'update-title': {
      await api.updateTitle(op.recordingId, op.title);
      break;
    }

    case 'save-settings': {
      await api.saveSettings(op.settings);
      break;
    }
    
    // ... etc
  }
}
```

### 7.5 Recording Pipeline

When a recording finishes, the queue receives a multi-stage pipeline:

1. **Enqueue upload** operation (audio already saved to local audio cache).
2. On upload success, **enqueue transcribe** (cloud or local depending on settings + connectivity).
3. On transcription success, **enqueue save-transcript** (if local transcription) and **enqueue generate-title**.

The pipeline stages are separate queue entries so each can retry independently. The orchestration happens in the recording completion handler:

```typescript
async function onRecordingComplete(
  clientTimestamp: number,
  audioData: ArrayBuffer,
  mimeType: string,
  duration: number,
  location: GeoLocation | null
): Promise<void> {
  const id = `rec_${clientTimestamp}`;

  // 1. Save audio to local cache FIRST (before any network)
  await audioCache.set(id, audioData, mimeType);

  // 2. Create optimistic recording entry in local cache
  await recordingsCache.upsert({
    id,
    date: new Date(clientTimestamp).toISOString(),
    duration,
    mimeType,
    fileSize: audioData.byteLength,
    location,
    title: null,
    preview: null,
    transcriptionSource: null,
    transcriptionModel: null,
    hasTranscript: false,
  });

  // 3. Enqueue upload
  await queue.enqueue({
    type: 'upload',
    clientTimestamp,
    mimeType,
    duration,
    location,
  });

  // 4. Start local transcription immediately (if applicable)
  const settings = await getSettings();
  if (settings.transcriptionMode !== 'openai_only') {
    startLocalTranscription(id, audioData);
  }
}
```

### 7.6 Startup Behavior

On app startup:
1. Reset all `status: 'processing'` entries to `status: 'pending'` (process was interrupted).
2. Reset all `attempts` counters to 0 (give everything a fresh chance).
3. Remove expired entries (>7 days old).
4. Start processing.

On reconnect (online event):
1. Same as startup.

---

## 8. Recording System

### 8.1 MediaRecorder Wrapper (`audio/recorder.ts`)

```typescript
interface RecorderState {
  status: 'idle' | 'recording' | 'paused' | 'stopping';
  elapsed: number;          // Seconds (excluding paused time)
  amplitude: number;        // 0-1, current audio level for waveform
}

class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private startTime = 0;
  private pausedDuration = 0;
  private lastPauseTime = 0;

  // Must be called inside a user gesture handler (tap)
  async start(): Promise<void> { ... }
  pause(): void { ... }
  resume(): void { ... }
  async stop(): Promise<{ audio: ArrayBuffer; mimeType: string; duration: number }> { ... }

  // Emergency save: assemble whatever chunks exist
  async emergencySave(): Promise<{ audio: ArrayBuffer; mimeType: string; duration: number } | null> { ... }

  // For waveform visualization
  getAmplitude(): number { ... }

  destroy(): void { ... }
}
```

### 8.2 MIME Type Selection

```typescript
function getPreferredMimeType(): string {
  // Prefer MP4 for maximum playback compatibility
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  throw new Error('No supported audio MIME type');
}
```

| Platform | Result |
|---------|--------|
| iOS Safari | `audio/mp4` |
| Chrome/Android | `audio/mp4` (preferred) |
| Firefox | `audio/webm;codecs=opus` |

### 8.3 Recording Configuration

```typescript
const RECORDER_CONFIG: MediaRecorderOptions = {
  mimeType: getPreferredMimeType(),
  audioBitsPerSecond: 32000,  // Low bitrate for speech (1-2 MB per 5 min)
};
```

### 8.4 Chunk Collection Strategy

Use `ondataavailable` with a 1-second `timeslice` to collect audio in small chunks. This enables emergency save — if the browser kills the recorder, we have all chunks collected so far:

```typescript
this.mediaRecorder = new MediaRecorder(stream, RECORDER_CONFIG);
this.mediaRecorder.ondataavailable = (e) => {
  if (e.data.size > 0) this.audioChunks.push(e.data);
};
this.mediaRecorder.start(1000); // 1-second timeslice
```

### 8.5 Emergency Save

Triggered when `document.visibilitychange` fires and `mediaRecorder.state` is not `'recording'` (browser killed it):

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && this.wasRecording) {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      // Browser killed the recorder while backgrounded
      this.emergencySave().then(result => {
        if (result) {
          showToast('Recording auto-saved (app was backgrounded)');
          onRecordingComplete(this.startTime, result.audio, result.mimeType, result.duration, ...);
        }
      });
    }
  }
});
```

### 8.6 iOS-Specific Handling

```typescript
// Audio context must be created/resumed inside a user gesture
async function initAudioContext(userGestureEvent: Event): Promise<AudioContext> {
  const ctx = new AudioContext();
  // iOS requires resume inside gesture handler
  await ctx.resume();
  return ctx;
}

// After native dialogs (confirm/alert), AudioContext may be suspended
async function ensureAudioContextActive(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}
```

### 8.7 Waveform Visualization (`audio/waveform.ts`)

Canvas-based real-time waveform using `AnalyserNode`:

```typescript
class WaveformVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private analyser: AnalyserNode;
  private animationId: number = 0;

  start(): void {
    const draw = () => {
      this.animationId = requestAnimationFrame(draw);
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteTimeDomainData(data);
      this.drawWaveform(data);
    };
    draw();
  }

  stop(): void {
    cancelAnimationFrame(this.animationId);
  }
}
```

---

## 9. On-Device Transcription

### 9.1 Architecture

Whisper runs in a dedicated Web Worker to never block the UI thread.

```
Main Thread                    Web Worker
    |                              |
    |-- postMessage('transcribe')→ |
    |   { audioData, model }       |
    |                              |-- Load/init model (first time)
    |                              |-- Resample to 16kHz mono
    |                              |-- Run inference
    |←- postMessage('progress') -- |   (progress updates)
    |←- postMessage('result') ---- |
    |   { text, segments }         |
```

### 9.2 Worker Entry (`transcription/worker.ts`)

```typescript
import { pipeline, env } from '@huggingface/transformers';

// Configure ONNX to use WASM backend
env.backends.onnx.wasm.numThreads = 1; // Avoid issues on iOS

let transcriber: any = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, audioData, model } = e.data;

  if (type === 'transcribe') {
    try {
      // Lazy-load the pipeline
      if (!transcriber) {
        self.postMessage({ type: 'progress', stage: 'loading-model' });
        transcriber = await pipeline(
          'automatic-speech-recognition',
          `Xenova/whisper-${model}`,  // 'tiny', 'base', or 'small'
          { dtype: 'q8' }            // Quantized for speed
        );
      }

      self.postMessage({ type: 'progress', stage: 'transcribing' });

      // Resample to 16kHz mono Float32Array
      const audio16k = resampleTo16kMono(audioData);

      const result = await transcriber(audio16k, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      const segments = result.chunks.map((c: any) => ({
        start: c.timestamp[0],
        end: c.timestamp[1],
        text: c.text.trim(),
      }));

      self.postMessage({
        type: 'result',
        transcript: {
          text: segments.map((s: any) => s.text).join(' '),
          segments,
          source: 'local',
          model: `whisper-${model}`,
        },
      });
    } catch (err: any) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};
```

### 9.3 Main-Thread Client (`transcription/whisper-client.ts`)

```typescript
class WhisperClient {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  transcribe(
    audioData: ArrayBuffer,
    model: 'tiny' | 'base' | 'small',
    onProgress?: (stage: string) => void
  ): Promise<Transcript> {
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        switch (e.data.type) {
          case 'progress': onProgress?.(e.data.stage); break;
          case 'result': resolve(e.data.transcript); break;
          case 'error': reject(new Error(e.data.message)); break;
        }
      };
      this.worker.postMessage({ type: 'transcribe', audioData, model }, [audioData]);
    });
  }

  terminate(): void {
    this.worker.terminate();
  }
}
```

### 9.4 Transcription Manager (`transcription/manager.ts`)

Decides whether to use cloud or on-device transcription:

```typescript
class TranscriptionManager {
  private whisperClient: WhisperClient | null = null;

  async transcribe(recordingId: string, audioData: ArrayBuffer): Promise<void> {
    const settings = await getSettings();
    const apiKeyStatus = await getApiKeyStatusCached();
    const isOnline = navigator.onLine;

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
        if (!useCloud) {
          // Defer — enqueue for later
          return;
        }
        break;
    }

    if (useCloud) {
      // Enqueue cloud transcription (backend reads audio from Drive)
      await queue.enqueue({ type: 'transcribe', recordingId, mode: 'cloud' });
    } else {
      // Run locally
      await this.transcribeLocally(recordingId, audioData, settings.onDeviceModel);
    }
  }

  private async transcribeLocally(
    recordingId: string,
    audioData: ArrayBuffer,
    model: 'tiny' | 'base' | 'small'
  ): Promise<void> {
    if (!this.whisperClient) {
      this.whisperClient = new WhisperClient();
    }

    const transcript = await this.whisperClient.transcribe(audioData, model);

    // Save to local cache immediately
    await transcriptCache.set(recordingId, transcript);
    await recordingsCache.patch(recordingId, {
      hasTranscript: true,
      preview: transcript.text.substring(0, 200),
      transcriptionSource: 'local',
      transcriptionModel: transcript.model,
    });

    // Enqueue save to backend (if connected)
    await queue.enqueue({ type: 'save-transcript', recordingId, transcript });

    // Enqueue title generation
    await queue.enqueue({ type: 'generate-title', recordingId });
  }
}
```

### 9.5 Model Download Management

On app startup, the selected model begins downloading in the background. The `@huggingface/transformers` library handles caching via the browser's Cache API.

```typescript
async function preloadWhisperModel(model: 'tiny' | 'base' | 'small'): Promise<void> {
  // This triggers model download + caching without running inference
  const worker = new WhisperClient();
  worker.postMessage({ type: 'preload', model });
  // Worker responds with progress events; UI shows download status in settings
}
```

Model sizes (quantized):
- Tiny: ~40 MB (recommended)
- Base: ~75 MB
- Small: ~250 MB

### 9.6 Audio Resampling

Whisper requires 16kHz mono Float32Array input. The worker resamples from the recorded format:

```typescript
async function resampleTo16kMono(audioData: ArrayBuffer): Promise<Float32Array> {
  const audioCtx = new OfflineAudioContext(1, 1, 16000);
  const source = audioCtx.createBufferSource();
  const decoded = await audioCtx.decodeAudioData(audioData.slice(0)); // slice to avoid detach
  
  // Create offline context with target sample rate
  const offlineCtx = new OfflineAudioContext(
    1,                                    // Mono
    Math.ceil(decoded.duration * 16000),  // Length at 16kHz
    16000                                 // Sample rate
  );
  
  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = decoded;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start();
  
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}
```

---

## 10. Playback & Transcript Sync

### 10.1 Audio Player (`audio/player.ts`)

```typescript
interface PlayerState {
  status: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';
  currentTime: number;       // Seconds
  duration: number;          // Seconds
  playbackRate: number;      // 0.6 - 3.0
}

class AudioPlayer {
  private audio: HTMLAudioElement;
  private onStateChange: (state: PlayerState) => void;

  constructor(onStateChange: (state: PlayerState) => void) {
    this.audio = new Audio();
    this.onStateChange = onStateChange;
    this.bindEvents();
  }

  async load(recordingId: string): Promise<void> {
    // 1. Try local cache first
    const cached = await audioCache.get(recordingId);
    if (cached) {
      const blob = new Blob([cached.data], { type: cached.mimeType });
      this.audio.src = URL.createObjectURL(blob);
      return;
    }

    // 2. Fetch from server
    try {
      const data = await api.getAudio(recordingId);
      const bytes = base64ToArrayBuffer(data.audioBase64);
      await audioCache.set(recordingId, bytes, data.mimeType);
      const blob = new Blob([bytes], { type: data.mimeType });
      this.audio.src = URL.createObjectURL(blob);
    } catch (err) {
      this.emitState({ status: 'error' });
    }
  }

  play(): void { this.audio.play(); }
  pause(): void { this.audio.pause(); }
  seek(time: number): void { this.audio.currentTime = time; }
  skipForward(seconds = 15): void { this.audio.currentTime += seconds; }
  skipBackward(seconds = 15): void { this.audio.currentTime -= seconds; }
  setRate(rate: number): void { this.audio.playbackRate = rate; }

  destroy(): void {
    this.audio.pause();
    if (this.audio.src.startsWith('blob:')) URL.revokeObjectURL(this.audio.src);
    this.audio.src = '';
  }
}
```

### 10.2 Error Recovery

If audio fails to play (corrupted cache or stale blob):
```typescript
this.audio.onerror = async () => {
  // Clear cached audio and retry with server fetch
  await audioCache.remove(recordingId);
  try {
    const data = await api.getAudio(recordingId);
    // ... reload
  } catch {
    this.emitState({ status: 'error' });
  }
};
```

### 10.3 Transcript View (`components/transcript-view.tsx`)

The transcript view syncs with playback:

```typescript
interface TranscriptViewProps {
  segments: TranscriptSegment[];
  currentTime: number;       // From player
  isPlaying: boolean;
  searchQuery?: string;       // For highlighting search matches
  onSegmentTap: (time: number) => void;
}
```

**Active segment detection:**
```typescript
function getActiveSegmentIndex(segments: TranscriptSegment[], time: number): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (time >= segments[i].start) return i;
  }
  return 0;
}
```

**Auto-scroll behavior:**
1. Track the active segment's DOM element.
2. When active segment changes during playback:
   - Get the element's position relative to the scroll container.
   - If it's past the vertical midpoint, scroll to center it.
   - If it's above the midpoint (early segments), don't scroll (list stays at top).
3. If user manually scrolls: disable auto-scroll, show "Jump to current" button.
4. Re-enable auto-scroll when: user taps jump button, scrolls active segment into view below center, or taps a segment.

```typescript
const [autoScroll, setAutoScroll] = useState(true);
const [userScrolled, setUserScrolled] = useState(false);
const containerRef = useRef<HTMLDivElement>(null);
const activeRef = useRef<HTMLDivElement>(null);

// Auto-scroll on active segment change
useEffect(() => {
  if (!autoScroll || !activeRef.current || !containerRef.current) return;

  const container = containerRef.current;
  const element = activeRef.current;
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const midpoint = containerRect.top + containerRect.height / 2;

  if (elementRect.top > midpoint) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}, [activeSegmentIndex, autoScroll]);

// Detect manual scroll
const onScroll = () => {
  if (isPlaying) {
    setUserScrolled(true);
    setAutoScroll(false);
  }
};
```

**"Jump to current" button direction:**
```typescript
const jumpDirection = useMemo(() => {
  if (!activeRef.current || !containerRef.current) return null;
  const containerRect = containerRef.current.getBoundingClientRect();
  const elementRect = activeRef.current.getBoundingClientRect();
  if (elementRect.bottom < containerRect.top) return 'up';
  if (elementRect.top > containerRect.bottom) return 'down';
  return null; // Visible
}, [activeSegmentIndex, userScrolled]);
```

### 10.4 Speed Control (`components/speed-control.tsx`)

Bottom sheet popup with:
- Continuous slider (0.6x to 3.0x, step 0.1)
- Preset buttons: 1x, 1.2x, 1.4x, 1.6x, 1.8x, 2x
- Tap outside to dismiss

```typescript
interface SpeedControlProps {
  currentRate: number;
  onRateChange: (rate: number) => void;
  onClose: () => void;
}
```

---

## 11. Search System

### 11.1 Architecture

Search is entirely client-side. The full text index is cached locally and filtered in-memory.

### 11.2 Text Index Loading

On app startup (or refresh):
1. Load text index from IndexedDB cache → render immediately.
2. Fetch updated text index from server (`getRecordings(includeTextIndex=true)`).
3. Update local cache with any changes.

### 11.3 Search Implementation (`hooks/use-search.ts`)

```typescript
function useSearch(recordings: Recording[], textIndex: TextIndex) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return recordings;

    const q = query.toLowerCase();

    return recordings
      .map(rec => {
        const matches: SearchMatch[] = [];

        // Match title
        if (rec.title?.toLowerCase().includes(q)) {
          matches.push({ field: 'title', text: rec.title });
        }

        // Match location
        if (rec.location?.label.toLowerCase().includes(q)) {
          matches.push({ field: 'location', text: rec.location.label });
        }

        // Match date (formatted)
        const dateStr = formatDate(rec.date).toLowerCase();
        if (dateStr.includes(q)) {
          matches.push({ field: 'date', text: formatDate(rec.date) });
        }

        // Match transcript text
        const entry = textIndex[rec.id];
        if (entry) {
          const idx = entry.text.toLowerCase().indexOf(q);
          if (idx !== -1) {
            // Get preview snippet
            matches.push({
              field: 'transcript',
              text: getSnippet(entry.text, idx, q.length),
            });

            // Find up to 3 additional context snippets
            const additionalSnippets = findAdditionalSnippets(entry.text, q, idx, 3);
            additionalSnippets.forEach(s => {
              matches.push({ field: 'transcript-context', text: s });
            });
          }
        }

        if (matches.length === 0) return null;
        return { recording: rec, matches };
      })
      .filter(Boolean);
  }, [query, recordings, textIndex]);

  return { query, setQuery, results };
}

interface SearchMatch {
  field: 'title' | 'location' | 'date' | 'transcript' | 'transcript-context';
  text: string;
}
```

### 11.4 Search-to-Playback

When the user taps a search result:
1. Find the first matching transcript segment by scanning `textIndex[id].segments` for the query text.
2. Navigate to playback screen with `seekTo` param set to that segment's `start` timestamp.
3. The playback screen auto-scrolls to that segment and begins playing.

```typescript
function findMatchingSegmentTime(segments: TranscriptSegment[], query: string): number {
  const q = query.toLowerCase();
  for (const seg of segments) {
    if (seg.text.toLowerCase().includes(q)) return seg.start;
  }
  return 0;
}
```

### 11.5 Snippet Extraction

```typescript
function getSnippet(text: string, matchIndex: number, matchLength: number, contextChars = 80): string {
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(text.length, matchIndex + matchLength + contextChars);
  let snippet = text.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}
```

---

## 12. Screens

### 12.1 Browse Screen (`screens/browse.tsx`)

The main screen. Shows all recordings as a scrollable list of cards.

**Layout:**
```
┌─────────────────────────────────┐
│ [gear icon]  Voice Recorder     │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🔍 Search recordings...     │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Banner: offline / no backend]  │
│ [Banner: backend update avail]  │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Morning Standup Notes       │ │
│ │ San Francisco · Apr 5, 10am │ │
│ │ Good morning everyone...    │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Saving and transcribing...  │ │
│ │ Unknown location · Apr 5    │ │
│ │ ░░░░░░░░░░ (progress)       │ │
│ └─────────────────────────────┘ │
│                                 │
│ ... more cards ...              │
│                                 │
│              [🎙 FAB]           │
└─────────────────────────────────┘
```

**Features:**
- **Pull-to-refresh:** Fetch recordings from server, reconcile with cache, incremental DOM update.
- **Recording cards:** Title (or date fallback), location, date, transcript preview.
- **Optimistic cards:** New recordings appear immediately with progress indicators.
- **Search bar:** Always visible at top. Filters in real-time (see Section 11).
- **FAB (floating action button):** Large mic icon, bottom-center. Tapping starts recording.
- **Banners:** Offline, no-backend, backend-update-available, API-key-invalid.
- **Settings:** Gear icon opens settings modal.

**Recording card states:**
1. **Complete:** Title, location, date, preview. Tap → playback.
2. **Uploading:** "Saving and transcribing..." with animated indicator.
3. **Upload done, transcribing:** Checkmark + "Saved. Transcribing..."
4. **Upload failed:** "Upload failed — will retry on next visit."
5. **Transcription failed:** "Transcription failed — will retry on next visit."

### 12.2 Record Screen (`screens/record.tsx`)

Full-screen recording interface. Recording starts automatically on mount.

**Layout:**
```
┌─────────────────────────────────┐
│ [← back]                       │
│                                 │
│         San Francisco, CA       │
│                                 │
│                                 │
│     ╔═══════════════════╗       │
│     ║   WAVEFORM VIZ    ║       │
│     ╚═══════════════════╝       │
│                                 │
│            3:42                  │
│                                 │
│     [⏸ pause]   [⏹ stop]       │
│                                 │
│ ⚠ App was in background...     │
└─────────────────────────────────┘
```

**Behavior:**
1. On mount: request mic permission (if needed), start recording, start waveform, acquire wake lock, start geolocation.
2. Timer counts up, pauses when recording is paused.
3. Location shows reverse-geocoded label (or raw coords if offline).
4. Back button: confirmation dialog ("Stop recording and discard?").
5. Stop: calls `onRecordingComplete()`, navigates to browse.
6. Background banner: appears when returning from background if recording state changed.

### 12.3 Playback Screen (`screens/playback.tsx`)

**Layout:**
```
┌─────────────────────────────────┐
│ [← back]              [🗑 del] │
│                                 │
│ Morning Standup Notes (tap edit)│
│ 📍 San Francisco · Apr 5, 10am │
│ 📷 Search Google Photos         │
│                                 │
│ ────●──────────── 1:23 / 5:12  │
│                                 │
│   [⏪15]   [▶ PLAY]   [15⏩]    │
│                        [1.0x]   │
│                                 │
│ Transcript          [📋 copy]  │
│ ─────────────────────────────── │
│ [1:23] Good morning everyone,   │
│ [1:26] let's start with the     │  ← highlighted (active)
│ [1:30] updates from yesterday.  │
│ ...                              │
│                                 │
│           [↓ Jump to current]   │
│                                 │
│ [Share]                          │
└─────────────────────────────────┘
```

**Features:**
- **Title:** Tap to edit inline. Enter/blur saves. Escape cancels. Optimistic update.
- **Location:** Link to Google Maps (`https://www.google.com/maps?q=lat,lng`).
- **Date:** Link to Google Photos date search (`https://photos.google.com/search/<date>`).
- **Progress bar:** Scrubbable. Shows elapsed/total. Touch-drag supported.
- **Controls:** Play/pause (large), skip back/forward 15s, speed button.
- **Speed control:** Opens bottom sheet (see Section 10.4).
- **Transcript:** Synced with playback (see Section 10.3).
- **Copy:** Copies full transcript text. Shows checkmark for ~750ms.
- **Share:** Bottom sheet with "Audio file" and "Transcript" options.
- **Delete:** Trash icon → confirmation dialog → optimistic delete → navigate to browse.

### 12.4 Setup Wizard (`screens/setup/`)

A multi-step wizard that appears when the user taps the setup banner or goes to Settings > Set up sync.

Each step is a separate component. The wizard container manages step navigation and state.

**Step 1 — Create Project (`step-create.tsx`):**
- Instructions to go to script.google.com/create.
- "Copy code" button (reads `/static/backend.gs.txt` and copies to clipboard).
- Instructions to paste and name the project.
- Tip for returning users.
- "Next" button.

**Step 2 — Deploy (`step-deploy.tsx`):**
- Numbered instructions for deploying as web app.
- Screenshots/descriptions of each dialog.
- "Next" button.

**Step 3 — Connect (`step-connect.tsx`):**
- URL input field (validated: must start with `https://script.google.com/macros/s/`).
- Nickname input field (defaults to "My Browser").
- "Request Access" button.
- On success: calls `requestAccess()`, stores token/URL locally, transitions to Step 3b.

**Step 3b — Authorize (`step-authorize.tsx`):**
- Instructions: "Star this file in your Drive folder to authorize."
- Link to Drive folder.
- Filename displayed.
- Spinner + "Waiting for authorization..."
- Polls `checkAuth()` every 3 seconds for up to 10 minutes.
- Cancel button returns to Step 3.
- On success: transitions to Step 4 (or completes if API key already configured).

**Step 4 — API Key (`step-apikey.tsx`):**
- Skipped if `getApiKeyStatus()` returns `configured: true`.
- Explanation of OpenAI Whisper and costs.
- Link to platform.openai.com/api-keys.
- Input field for API key.
- "Validate & Save" button: calls `saveApiKey()`.
- "Skip" button: completes setup without API key.

---

## 13. Settings Modal (`components/settings-modal.tsx`)

A full-height modal accessed via the gear icon on the browse screen.

**Sections:**

1. **Browser Info:** Nickname, link to Drive folder.
2. **OpenAI API Key:** Status indicator (green/orange), "Update key" button.
3. **Transcription Settings:**
   - Mode radio buttons (openai_first, always_local, openai_only).
   - Auto-upgrade checkbox (visible only in openai_first mode).
   - On-device model radio buttons (tiny, base, small) with sizes shown.
   - Download model button + progress bar.
   - Model status text.
4. **Adding Another Device:** Web App URL with copy button, instructions.
5. **Access & Security:** Explanatory text about the token model.
6. **Revoking Access:** Instructions for editing browsers.json in Drive.
7. **Maintenance:** "Rebuild Index" button, "Check for updates" button.
8. **Disconnect:** Red button, clears everything.

**Settings sync:** Changes to transcription settings are saved locally immediately and enqueued for server sync. Last-write-wins by timestamp.

---

## 14. Data Sync & Reconciliation

### 14.1 Startup Sync Flow

```
1. Render browse screen from IndexedDB cache (instant)
2. Background: fetch getRecordings(includeTextIndex=true)
3. Reconcile server data with local cache:
   a. New server entries → add to cache + DOM
   b. Changed entries (new title, new transcript) → patch cache + DOM
   c. Server-deleted entries → remove from cache + DOM
   d. Local-only entries (pending upload) → keep, match by clientTimestamp
4. Update text index cache
5. Process mutation queue
6. Check for recordings needing title generation
```

### 14.2 Reconciliation Logic

```typescript
async function reconcile(
  serverRecordings: Recording[],
  localRecordings: Recording[],
  pendingOps: QueueEntry[]
): Promise<void> {
  const serverById = new Map(serverRecordings.map(r => [r.id, r]));
  const localById = new Map(localRecordings.map(r => [r.id, r]));
  const pendingUploadTimestamps = new Set(
    pendingOps
      .filter(e => e.operation.type === 'upload')
      .map(e => `rec_${(e.operation as any).clientTimestamp}`)
  );

  // Add new server entries
  for (const [id, serverRec] of serverById) {
    if (!localById.has(id)) {
      await recordingsCache.upsert(serverRec);
    }
  }

  // Patch changed entries
  for (const [id, serverRec] of serverById) {
    const local = localById.get(id);
    if (local && hasChanges(local, serverRec)) {
      await recordingsCache.patch(id, serverRec);
    }
  }

  // Remove server-deleted entries (but not pending uploads)
  for (const [id] of localById) {
    if (!serverById.has(id) && !pendingUploadTimestamps.has(id)) {
      await recordingsCache.remove(id);
    }
  }
}
```

### 14.3 Self-Healing

On each recordings list load:
- Recordings with `hasTranscript: false` and no pending transcription queue entry → re-enqueue transcription.
- Recordings with `hasTranscript: true` but missing local transcript cache → fetch from server.
- Recordings with transcript but no title and no pending title queue entry → enqueue title generation.

---

## 15. PWA & Service Worker

### 15.1 Service Worker (`service-worker.ts`)

Uses Workbox for precaching and routing:

```typescript
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';
import { CacheFirst } from 'workbox-strategies';

// Precache all app shell assets (injected by Vite plugin)
precacheAndRoute(self.__WB_MANIFEST);

// Backend API: always network-only (never cache)
registerRoute(
  ({ url }) => url.hostname === 'script.google.com' ||
               url.hostname.includes('googleusercontent.com'),
  new NetworkOnly()
);

// CDN fonts/icons: cache on first use
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' ||
               url.hostname === 'fonts.gstatic.com' ||
               url.hostname === 'cdn.jsdelivr.net',
  new CacheFirst({ cacheName: 'cdn-cache' })
);

// Update flow: notify clients when new version available
self.addEventListener('install', () => {
  // Don't skipWaiting — let user choose when to update
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

### 15.2 Update Detection

```typescript
// In main app
if ('serviceWorker' in navigator) {
  const reg = await navigator.serviceWorker.register('/service-worker.js');

  reg.addEventListener('updatefound', () => {
    const newWorker = reg.installing;
    newWorker?.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // New version available — show banner
        showUpdateBanner();
      }
    });
  });
}

function applyUpdate() {
  navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
  window.location.reload();
}
```

### 15.3 Manifest (`public/manifest.json`)

```json
{
  "name": "Voice Recorder",
  "short_name": "Recorder",
  "description": "Record voice memos with automatic transcription",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a73e8",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 15.4 iOS PWA Meta Tags (`index.html`)

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Voice Recorder">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

---

## 16. Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
});
```

---

## 17. Offline Behavior Summary

| Feature | Offline Behavior |
|---------|-----------------|
| App shell | Loads from service worker cache |
| Browse screen | Renders from IndexedDB cache |
| Recording | Works fully (audio captured locally) |
| On-device transcription | Works (if model downloaded) |
| Cloud transcription | Deferred to queue |
| Playback (cached) | Works fully |
| Playback (uncached audio) | Shows metadata + transcript; "Audio not available offline" |
| Search | Works fully (text index cached) |
| Title edit | Applied locally, queued for sync |
| Delete | Applied locally, queued for sync |
| Settings change | Applied locally, queued for sync |
| Upload | Queued, processes on reconnect |
| Pull-to-refresh | Shows cached data, resets retry queue |

**Online detection:**
```typescript
function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => { setOnline(true); queue.process(); };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  return online;
}
```

---

## 18. Cross-Platform Considerations

### 18.1 iOS Safari
- Audio recording: must init MediaRecorder inside tap handler.
- AudioContext: must resume inside user gesture.
- IndexedDB Blobs: store as ArrayBuffer, convert to Blob at use time.
- Wake Lock API: not supported on iOS. Use `<video>` element workaround with silent video.
- Service Worker: limited background execution. Queue processing must be fast.
- After native dialogs: check AudioContext state and resume if suspended.

### 18.2 Firefox
- MediaRecorder: only supports WebM, not MP4.
- No audio/mp4 recording capability.
- WebM recordings won't play on iOS Safari (known limitation, documented in PRD).

### 18.3 Chrome / Android
- Supports both MP4 and WebM recording.
- Full Wake Lock API support.
- Background handling: more permissive than iOS but still kills audio recording.

### 18.4 Feature Detection Pattern
```typescript
const platform = {
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
  supportsMP4Recording: MediaRecorder.isTypeSupported('audio/mp4'),
  supportsWebM: MediaRecorder.isTypeSupported('audio/webm'),
  supportsWakeLock: 'wakeLock' in navigator,
  supportsShare: 'share' in navigator,
  supportsClipboard: 'clipboard' in navigator && 'writeText' in navigator.clipboard,
};
```

---

## 19. Testing Strategy

### 19.1 Test Runner
Vitest (Vite-native, fast, compatible with Testing Library).

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

### 19.2 Test Setup

```typescript
// tests/setup.ts
import 'fake-indexeddb/auto';  // IndexedDB mock
import { vi } from 'vitest';

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue(new MediaStream()),
  },
});

// Mock MediaRecorder
globalThis.MediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  state: 'inactive',
  ondataavailable: null,
  onstop: null,
})) as any;
(MediaRecorder as any).isTypeSupported = vi.fn().mockReturnValue(true);
```

### 19.3 Unit Tests

**API Client:**
```typescript
describe('RealApiClient', () => {
  it('sends GET with action and token params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, version: '1.0.0', data: { status: 'ok' } }))
    );
    const client = new RealApiClient('https://example.com/exec', 'test-token');
    await client.ping();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('action=ping'),
      expect.any(Object)
    );
  });

  it('sends POST with text/plain content type', async () => {
    // ...
  });

  it('throws ApiError on error response', async () => {
    // ...
  });

  it('emits backend-update-available for old versions', async () => {
    // ...
  });
});
```

**Mutation Queue:**
```typescript
describe('MutationQueue', () => {
  it('persists entries to IndexedDB', async () => { ... });
  it('processes entries in FIFO order', async () => { ... });
  it('retries failed entries with backoff', async () => { ... });
  it('expires entries older than 7 days', async () => { ... });
  it('resets processing entries on startup', async () => { ... });
  it('handles upload idempotency', async () => { ... });
  it('does not process when offline', async () => { ... });
});
```

**Audio Recorder:**
```typescript
describe('AudioRecorder', () => {
  it('selects MP4 when supported', () => { ... });
  it('falls back to WebM when MP4 unsupported', () => { ... });
  it('collects chunks with 1s timeslice', () => { ... });
  it('calculates duration excluding paused time', () => { ... });
  it('performs emergency save from collected chunks', () => { ... });
});
```

**Search:**
```typescript
describe('useSearch', () => {
  it('filters by title', () => { ... });
  it('filters by transcript text', () => { ... });
  it('returns snippet with context', () => { ... });
  it('returns additional context snippets', () => { ... });
  it('finds matching segment timestamp', () => { ... });
  it('handles empty query (returns all)', () => { ... });
  it('is case-insensitive', () => { ... });
});
```

**Caching:**
```typescript
describe('AudioCache', () => {
  it('stores and retrieves ArrayBuffer', () => { ... });
  it('evicts oldest entries when over limit', () => { ... });
  it('updates accessedAt on get', () => { ... });
});

describe('RecordingsCache', () => {
  it('patches individual fields', () => { ... });
  it('replaceAll clears and rewrites', () => { ... });
});
```

### 19.4 Integration Tests

**Recording flow:**
```typescript
describe('Recording Flow', () => {
  it('creates optimistic card after recording', async () => {
    // 1. Simulate recording completion
    // 2. Check browse screen has new card with "Saving..."
    // 3. Check audio saved to IndexedDB
    // 4. Check queue has upload entry
  });

  it('updates card as pipeline progresses', async () => {
    // 1. Simulate upload success → card shows "Transcribing..."
    // 2. Simulate transcription success → card shows preview
    // 3. Simulate title generation → card shows title
  });
});
```

**Offline queue:**
```typescript
describe('Offline Queue', () => {
  it('queues upload when offline and processes on reconnect', async () => {
    // 1. Set navigator.onLine = false
    // 2. Complete recording → queue entry created
    // 3. Queue.process() → does nothing (offline)
    // 4. Set navigator.onLine = true, dispatch 'online'
    // 5. Queue processes → upload called
  });
});
```

**Setup wizard:**
```typescript
describe('Setup Wizard', () => {
  it('validates URL format', () => { ... });
  it('calls requestAccess and stores token', () => { ... });
  it('polls checkAuth until authorized', () => { ... });
  it('skips API key step when already configured', () => { ... });
});
```

### 19.5 Test Files Summary

```
tests/
  unit/
    api/client.test.ts           # API client GET/POST/error handling
    api/mock-client.test.ts      # Mock client contract compliance
    cache/recordings-cache.test.ts
    cache/transcript-cache.test.ts
    cache/audio-cache.test.ts
    queue/mutation-queue.test.ts
    audio/recorder.test.ts
    hooks/use-search.test.ts
    hooks/use-online.test.ts
    utils/geo.test.ts
    utils/format.test.ts
    utils/audio-utils.test.ts
  integration/
    recording-flow.test.ts
    playback-flow.test.ts
    search.test.ts
    offline-queue.test.ts
    setup-wizard.test.ts
    sync-reconciliation.test.ts
  mocks/
    audio.ts                     # Fake audio ArrayBuffers
    recordings.ts                # Fake recording data (matches seed data)
    indexeddb.ts                 # fake-indexeddb auto-setup
```

---

## 20. Build & Deployment

### 20.1 Build

```bash
npm run build
# Outputs to dist/
# All static files, ready for any CDN
```

### 20.2 Deployment Options

Any static file host works:
- **GitHub Pages:** Free, automatic from repo.
- **Netlify:** Free tier, automatic deploys.
- **Vercel:** Free tier.
- **Any CDN / S3 bucket.**

**Requirements:**
- HTTPS (required for service worker, microphone, Web Worker).
- Serves `index.html` for all routes (SPA routing).
- Correct MIME types for `.wasm` files (needed for Whisper ONNX runtime).

### 20.3 Environment Variables

```bash
VITE_MOCK_API=true              # Use mock API client (dev only)
VITE_EXPECTED_BACKEND_VERSION=1.0.0  # For version compatibility check
```

### 20.4 Static Backend Source

The file `src/static/backend.gs.txt` contains the complete GAS backend source code. It is:
- Included in the build output as a static asset.
- Read by the setup wizard's "Copy code" button.
- Works offline (precached by service worker).

When the backend is updated, this file must be updated in the frontend repo to match. The frontend's expected backend version (`VITE_EXPECTED_BACKEND_VERSION`) should be bumped accordingly.
