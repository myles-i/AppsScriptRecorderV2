# Backend Implementation Specification

**Target Runtime:** Google Apps Script (GAS)
**Deployment:** Web App (Execute as Me, Anyone can access)
**Storage:** User's Google Drive
**Version:** 1.0.0

---

## 1. Overview

The backend is a single Google Apps Script file (`Code.gs`) deployed as a web app. It provides a JSON API over HTTP for the frontend PWA. All persistent data lives in the deploying user's Google Drive. The backend is stateless — every request is self-contained.

The backend source is distributed as a static text file within the frontend (`/static/backend.gs.txt`). Users copy-paste it into the GAS editor during setup.

---

## 2. Architecture & Constraints

### 2.1 GAS Runtime Constraints
- **Entry points:** `doGet(e)` and `doPost(e)` only.
- **Execution timeout:** 6 minutes per invocation.
- **POST body:** Text only — no binary. Audio is base64-encoded.
- **POST body limit:** 50 MB (base64 audio at ~2.7 MB for 5 min is well within).
- **Response:** Must return `ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON)`.
- **No custom headers:** GAS web apps redirect responses through `script.googleusercontent.com`. CORS preflight must be avoided.
- **Properties storage:** `PropertiesService.getScriptProperties()` persists key-value pairs across invocations. Used for the OpenAI API key.
- **Drive API:** `DriveApp` for file/folder operations. Full Drive scope (not drive.file).

### 2.2 HTTP Behavior
GAS web app requests follow this flow:
1. Browser sends request to `https://script.google.com/macros/s/DEPLOYMENT_ID/exec`
2. GAS executes `doGet(e)` or `doPost(e)`
3. GAS returns a 302 redirect to `script.googleusercontent.com` with the response body
4. Browser follows redirect and receives JSON response

**Frontend implications:**
- Use `fetch()` with default `redirect: 'follow'` behavior.
- POST must use `Content-Type: text/plain` to qualify as a CORS "simple request" (no preflight).
- POST body is a JSON string, accessible in GAS as `e.postData.contents`.
- GET parameters are in `e.parameter` (single values) or `e.parameters` (arrays).

### 2.3 Concurrency
GAS may execute multiple requests concurrently for the same user. The backend uses `LockService.getScriptLock()` when modifying shared files (index.json, text_index.json, browsers.json, settings.json) to prevent corruption. Lock timeout: 10 seconds. If a lock cannot be acquired, the request returns an error and the frontend retries.

---

## 3. Drive Folder Structure

All data lives under a single root folder in the user's Drive.

```
AppsScriptRecorder/
  recordings/
    2026/
      04/
        05/
          rec_2026-04-05_10-30-00.mp4    # Audio file
          rec_2026-04-05_10-30-00.json   # Transcript
        06/
          rec_2026-04-06_08-15-30.webm
          rec_2026-04-06_08-15-30.json
  auth/
    auth_<token>.json                    # Authorization request files
  index.json                             # Recordings index
  text_index.json                        # Full-text search index
  settings.json                          # Cross-device settings
  browsers.json                          # Authorized browsers list
```

### 3.1 Naming Conventions
- **Root folder:** `AppsScriptRecorder` (created on first request if missing)
- **Audio files:** `rec_<YYYY-MM-DD_HH-MM-SS>.<ext>` where the timestamp is derived from `clientTimestamp` (ms since epoch) formatted in local time; `ext` is `mp4` or `webm`. Example: `rec_2026-04-05_10-30-00.mp4`.
- **Transcript files:** `rec_<YYYY-MM-DD_HH-MM-SS>.json` (same name as audio, different extension).
- **Date folders:** `recordings/YYYY/MM/DD/` (zero-padded).
- **Auth files:** `auth_<token>.json` where token is a 32-char hex string.

### 3.2 File Creation Policy
- The root folder and `recordings/` and `auth/` subfolders are created lazily on first use.
- Date subfolders (`YYYY/MM/DD`) are created when the first recording for that date is uploaded.
- All folder lookups use `getfoldersByName()` and create if not found.

---

## 4. Request/Response Protocol

### 4.1 Routing
Every request includes an `action` parameter that determines the operation.

- **GET requests:** Action and all parameters are query string parameters.
- **POST requests:** Action is in the JSON body. Auth token is a query parameter for consistency.

### 4.2 Authentication
Every request (except `requestAccess` and `ping`) must include a `token` query parameter. The token is validated against `browsers.json`.

### 4.3 Response Envelope
All responses follow this structure:

```json
{
  "success": true,
  "version": "1.0.0",
  "data": { ... }
}
```

Error responses:

```json
{
  "success": false,
  "version": "1.0.0",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

### 4.4 Version Header
Every response includes `"version": "1.0.0"`. The frontend compares this to its expected version and shows an update banner if the backend is older.

---

## 5. Authentication System

### 5.1 Overview
Authentication uses a star-based flow: the frontend requests access, the backend creates a file in Drive, and the user stars that file (proving they own the Drive account) to authorize.

### 5.2 Token Format
Tokens are 32-character lowercase hex strings generated by the backend:

```javascript
function generateToken() {
  var bytes = [];
  for (var i = 0; i < 16; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  return bytes.map(function(b) {
    return ('0' + b.toString(16)).slice(-2);
  }).join('');
}
```

### 5.3 Auth Flow

**Step 1: Request Access**
- Frontend POSTs `requestAccess` with a `nickname`.
- Backend generates a token, creates `auth/auth_<token>.json` in Drive.
- The auth file content is: `{ "token": "<token>", "nickname": "<nickname>", "created": "<ISO date>", "status": "pending" }`
- Returns the token, the auth file ID, and the folder URL.

**Step 2: User Stars the File**
- User opens Drive, finds the file, and stars it.
- This proves the user has access to the Drive account where the backend runs.

**Step 3: Check Authorization**
- Frontend polls `checkAuth` with the token.
- Backend calls `DriveApp.getFileById(fileId).isStarred()`.
- If starred: adds token to `browsers.json`, updates auth file status to "authorized", returns `{ authorized: true }`.
- If not starred: returns `{ authorized: false }`.

**Step 4: Ongoing Authentication**
- Every API request includes `token` as a query parameter.
- Backend checks `browsers.json` for the token.
- If not found or revoked: returns `UNAUTHORIZED` error.

### 5.4 browsers.json Schema
```json
{
  "browsers": [
    {
      "token": "a1b2c3...",
      "nickname": "My iPhone",
      "authorizedAt": "2026-04-05T10:30:00Z",
      "lastSeen": "2026-04-05T14:22:00Z",
      "status": "active"
    }
  ]
}
```

### 5.5 Revocation
- `revokeAccess` sets the browser's status to `"revoked"` in `browsers.json`.
- Subsequent requests with that token return `UNAUTHORIZED`.
- The auth file in Drive is deleted.

---

## 6. API Reference

### 6.1 GET Endpoints

All GET endpoints use query parameters. Required: `action`, `token` (except where noted).

---

#### `ping`
Health check and version probe. **No token required.**

**Parameters:** `action=ping`

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "status": "ok",
    "hasApiKey": true
  }
}
```

---

#### `checkAuth`
Poll authorization status during setup.

**Parameters:** `action=checkAuth`, `token`, `fileId` (the auth file ID from requestAccess)

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "authorized": true
  }
}
```

---

#### `getRecordings`
Fetch the recordings index. Optionally include the text index for search.

**Parameters:** `action=getRecordings`, `token`, `includeTextIndex=true` (optional)

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "recordings": [
      {
        "id": "rec_1712345678901",
        "date": "2026-04-05T10:30:00Z",
        "duration": 312,
        "mimeType": "audio/mp4",
        "fileSize": 1048576,
        "location": {
          "lat": 37.7749,
          "lng": -122.4194,
          "label": "San Francisco, CA, US"
        },
        "title": "Morning Standup Notes",
        "preview": "Good morning everyone, let's start with...",
        "transcriptionSource": "openai",
        "transcriptionModel": "whisper-1",
        "hasTranscript": true
      }
    ],
    "textIndex": {
      "rec_1712345678901": {
        "text": "Good morning everyone, let's start with the updates...",
        "segments": [
          { "start": 0.0, "end": 3.2, "text": "Good morning everyone," },
          { "start": 3.2, "end": 6.1, "text": "let's start with the updates." }
        ]
      }
    }
  }
}
```

When `includeTextIndex` is false or omitted, the `textIndex` field is `null`.

---

#### `getAudio`
Fetch audio file content as base64.

**Parameters:** `action=getAudio`, `token`, `id` (recording ID)

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "id": "rec_1712345678901",
    "audioBase64": "<base64 encoded audio>",
    "mimeType": "audio/mp4"
  }
}
```

---

#### `getTranscript`
Fetch transcript for a recording.

**Parameters:** `action=getTranscript`, `token`, `id`

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "id": "rec_1712345678901",
    "transcript": {
      "text": "Good morning everyone...",
      "segments": [
        { "start": 0.0, "end": 3.2, "text": "Good morning everyone," }
      ],
      "source": "openai",
      "model": "whisper-1"
    }
  }
}
```

Returns `null` for `transcript` if no transcript exists.

---

#### `getRecordingData`
Combined endpoint: audio + transcript in one request. Reduces round trips.

**Parameters:** `action=getRecordingData`, `token`, `id`

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "id": "rec_1712345678901",
    "audioBase64": "<base64>",
    "mimeType": "audio/mp4",
    "transcript": {
      "text": "...",
      "segments": [...],
      "source": "openai",
      "model": "whisper-1"
    }
  }
}
```

---

#### `getTextIndex`
Fetch only the text index (for search sync).

**Parameters:** `action=getTextIndex`, `token`

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "textIndex": { ... }
  }
}
```

---

#### `getSettings`
Fetch cross-device settings.

**Parameters:** `action=getSettings`, `token`

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "settings": {
      "transcriptionMode": "openai_first",
      "autoUpgrade": true,
      "onDeviceModel": "tiny",
      "updatedAt": "2026-04-05T10:30:00Z"
    }
  }
}
```

If no settings file exists, returns defaults:
```json
{
  "transcriptionMode": "openai_first",
  "autoUpgrade": false,
  "onDeviceModel": "tiny",
  "updatedAt": null
}
```

---

#### `getApiKeyStatus`
Check if an OpenAI API key is configured. **Never returns the key itself.**

**Parameters:** `action=getApiKeyStatus`, `token`

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "configured": true,
    "valid": true
  }
}
```

`valid` is checked by making a lightweight test call to OpenAI. If the key is not configured, both fields are `false`.

---

### 6.2 POST Endpoints

POST body is a JSON string with `Content-Type: text/plain`. The `token` is passed as a query parameter (not in the body) for uniform auth handling.

The body is parsed in GAS via:
```javascript
var body = JSON.parse(e.postData.contents);
```

---

#### `requestAccess`
Initiate the authorization flow. **No token required** (this generates one).

**Body:**
```json
{
  "action": "requestAccess",
  "nickname": "My iPhone"
}
```

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "token": "a1b2c3d4e5f6...",
    "fileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "fileName": "auth_a1b2c3d4e5f6.json",
    "folderUrl": "https://drive.google.com/drive/folders/FOLDER_ID"
  }
}
```

---

#### `revokeAccess`
Revoke a browser's access. The requesting browser can revoke itself or another browser.

**Body:**
```json
{
  "action": "revokeAccess",
  "revokeToken": "a1b2c3..."
}
```

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "revoked": true
  }
}
```

---

#### `uploadRecording`
Upload a new audio recording to Drive. **Idempotent** — if a recording with the same `clientTimestamp` exists, the existing entry is returned.

**Body:**
```json
{
  "action": "uploadRecording",
  "recording": {
    "clientTimestamp": 1712345678901,
    "audioBase64": "<base64 encoded audio>",
    "mimeType": "audio/mp4",
    "duration": 312,
    "location": {
      "lat": 37.7749,
      "lng": -122.4194,
      "label": "San Francisco, CA, US"
    }
  }
}
```

**Idempotency:** The backend checks the recordings index for an entry with a matching `clientTimestamp`. If found, it returns the existing recording without creating a duplicate. This is critical for the offline queue — a request that succeeded server-side but whose response was lost will be retried by the queue, and must not create a duplicate.

**Processing:**
1. Check idempotency (return existing if duplicate).
2. Decode base64 audio to blob.
3. Create date folders (`recordings/YYYY/MM/DD/`).
4. Save audio file to Drive.
5. Create recording entry in index.json (acquire lock).
6. Return the new recording metadata.

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "recording": {
      "id": "rec_1712345678901",
      "date": "2026-04-05T10:30:00Z",
      "duration": 312,
      "mimeType": "audio/mp4",
      "fileSize": 1048576,
      "location": { "lat": 37.7749, "lng": -122.4194, "label": "San Francisco, CA, US" },
      "title": null,
      "preview": null,
      "transcriptionSource": null,
      "transcriptionModel": null,
      "hasTranscript": false
    },
    "isDuplicate": false
  }
}
```

If duplicate: same response with `"isDuplicate": true` and the existing recording data.

---

#### `deleteRecording`
Delete a recording's audio, transcript, and all index entries.

**Body:**
```json
{
  "action": "deleteRecording",
  "id": "rec_1712345678901"
}
```

**Processing:**
1. Remove audio file from Drive.
2. Remove transcript file from Drive.
3. Remove entry from index.json (lock).
4. Remove entry from text_index.json (lock).
5. Clean up empty date folders (optional, best-effort).

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "deleted": true
  }
}
```

Returns success even if the recording was already deleted (idempotent delete).

---

#### `transcribe`
Trigger cloud transcription via OpenAI Whisper API. Reads audio directly from Drive (no re-upload from browser).

**Body:**
```json
{
  "action": "transcribe",
  "id": "rec_1712345678901"
}
```

**Processing:**
1. Look up recording in index.json to find the audio file path.
2. Read audio blob from Drive.
3. Call OpenAI Whisper API (`POST https://api.openai.com/v1/audio/transcriptions`) with the audio blob.
4. Parse response into segments format.
5. Save transcript JSON file to Drive alongside the audio file, using the same human-readable timestamp: `rec_YYYY-MM-DD_HH-MM-SS.json`.
6. Update index.json with `hasTranscript: true`, `preview`, `transcriptionSource`, `transcriptionModel`.
7. Update text_index.json with full text and segments.

**OpenAI API call:**
```javascript
var options = {
  method: 'post',
  headers: {
    'Authorization': 'Bearer ' + apiKey
  },
  payload: {
    file: audioBlob,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment']
  }
};
var response = UrlFetchApp.fetch('https://api.openai.com/v1/audio/transcriptions', options);
```

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "transcript": {
      "text": "Good morning everyone...",
      "segments": [
        { "start": 0.0, "end": 3.2, "text": "Good morning everyone," }
      ],
      "source": "openai",
      "model": "whisper-1"
    }
  }
}
```

**Error cases:**
- `API_KEY_MISSING`: No OpenAI key configured. Frontend falls back to on-device.
- `API_KEY_INVALID`: Key is rejected by OpenAI. Frontend falls back to on-device.
- `RECORDING_NOT_FOUND`: No audio file for this ID.
- `TRANSCRIPTION_FAILED`: OpenAI API returned an error.

---

#### `saveTranscript`
Save a locally-produced transcript to Drive (from on-device Whisper).

**Body:**
```json
{
  "action": "saveTranscript",
  "id": "rec_1712345678901",
  "transcript": {
    "text": "Good morning everyone...",
    "segments": [
      { "start": 0.0, "end": 3.2, "text": "Good morning everyone," }
    ],
    "source": "local",
    "model": "whisper-tiny"
  }
}
```

**Processing:**
1. Look up recording in index.json to find the date folder and derive the human-readable filename from the recording's `date` field (format: `rec_YYYY-MM-DD_HH-MM-SS.json`).
2. Save transcript JSON file to Drive alongside the audio file.
3. Update index.json with transcript metadata and preview.
4. Update text_index.json.

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "saved": true
  }
}
```

---

#### `generateTitle`
Generate a short title from a transcript using an LLM.

**Body:**
```json
{
  "action": "generateTitle",
  "id": "rec_1712345678901"
}
```

**Processing:**
1. Read transcript text from Drive (or text_index.json).
2. Call OpenAI Chat API with a prompt:
   ```
   Generate a 2-4 word title for this voice memo transcript. 
   Return ONLY the title, nothing else.
   
   Transcript: <first 500 chars of transcript>
   ```
3. Save title to index.json.

**OpenAI API call:**
```javascript
var options = {
  method: 'post',
  headers: {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json'
  },
  payload: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Generate a 2-4 word title for this voice memo. Return ONLY the title.' },
      { role: 'user', content: transcriptText.substring(0, 500) }
    ],
    max_tokens: 20,
    temperature: 0.3
  })
};
var response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', options);
```

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "id": "rec_1712345678901",
    "title": "Morning Standup Notes"
  }
}
```

Title generation is non-critical. If it fails, the response returns `success: true` with `title: null` and no error. The frontend uses a date fallback.

---

#### `batchGenerateTitles`
Generate titles for multiple recordings in a single request.

**Body:**
```json
{
  "action": "batchGenerateTitles",
  "ids": ["rec_1712345678901", "rec_1712345768901"]
}
```

**Processing:**
1. For each ID, read transcript text.
2. Construct a single LLM prompt with all transcripts.
3. Parse response into individual titles.
4. Update index.json with all titles.

**Batch prompt:**
```
Generate a 2-4 word title for each of these voice memo transcripts.
Return a JSON array of objects with "id" and "title" fields.

1. ID: rec_1712345678901
Transcript: <first 300 chars>

2. ID: rec_1712345768901
Transcript: <first 300 chars>
```

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "titles": [
      { "id": "rec_1712345678901", "title": "Morning Standup Notes" },
      { "id": "rec_1712345768901", "title": "Grocery Run Plans" }
    ]
  }
}
```

---

#### `updateTitle`
Manually update a recording's title.

**Body:**
```json
{
  "action": "updateTitle",
  "id": "rec_1712345678901",
  "title": "Weekly Team Sync"
}
```

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "updated": true
  }
}
```

---

#### `saveSettings`
Save cross-device settings. Last-write-wins by timestamp.

**Body:**
```json
{
  "action": "saveSettings",
  "settings": {
    "transcriptionMode": "openai_first",
    "autoUpgrade": true,
    "onDeviceModel": "tiny"
  }
}
```

**Processing:**
1. Read existing settings.json.
2. Compare `updatedAt` timestamps. If the incoming change is older, ignore it (stale write).
3. Merge settings and write back with new `updatedAt`.

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "saved": true,
    "settings": { ... }
  }
}
```

---

#### `saveApiKey`
Validate and store an OpenAI API key.

**Body:**
```json
{
  "action": "saveApiKey",
  "apiKey": "sk-..."
}
```

**Processing:**
1. Test the key by calling OpenAI's models endpoint.
2. If valid, store in `PropertiesService.getScriptProperties().setProperty('OPENAI_API_KEY', key)`.
3. If invalid, return error.

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "valid": true,
    "saved": true
  }
}
```

---

#### `rebuildIndex`
Scan the Drive folder tree and regenerate index.json and text_index.json.

**Body:**
```json
{
  "action": "rebuildIndex"
}
```

**Processing:**
1. Recursively scan `recordings/` folder.
2. For each audio file found, extract metadata (name, size, mime type, date from path).
3. Check for corresponding transcript JSON file.
4. Build new index.json and text_index.json.
5. Write both files (with lock).

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "recordingsFound": 42,
    "transcriptsFound": 38,
    "rebuilt": true
  }
}
```

This may take a long time for large collections. If approaching the 6-minute timeout, it saves partial progress and returns with `"complete": false` and a continuation token. The frontend re-invokes with the token to continue.

---

#### `backfillTextIndex`
Populate text_index.json for recordings that have transcripts but are missing from the text index. Used after migration or recovery.

**Body:**
```json
{
  "action": "backfillTextIndex"
}
```

**Processing:**
1. Compare index.json (recordings with `hasTranscript: true`) against text_index.json.
2. For missing entries, read the transcript JSON files and add to text_index.json.

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "data": {
    "backfilled": 5
  }
}
```

---

## 7. Data Schemas

### 7.1 Recording Metadata (index.json entry)
```typescript
interface Recording {
  id: string;               // "rec_<clientTimestamp>"
  date: string;             // ISO 8601 datetime
  duration: number;         // Seconds
  mimeType: string;         // "audio/mp4" or "audio/webm"
  fileSize: number;         // Bytes
  location: {
    lat: number;
    lng: number;
    label: string;          // "San Francisco, CA, US" or "37.7749, -122.4194"
  } | null;
  title: string | null;     // Generated or manual title
  preview: string | null;   // First ~200 chars of transcript
  transcriptionSource: "openai" | "local" | null;
  transcriptionModel: string | null;  // "whisper-1", "whisper-tiny", etc.
  hasTranscript: boolean;
  audioFileId: string;      // Drive file ID for audio
  transcriptFileId: string | null;  // Drive file ID for transcript
}
```

### 7.2 index.json
```json
{
  "version": 1,
  "updatedAt": "2026-04-05T14:22:00Z",
  "recordings": [ /* Recording[] */ ]
}
```

Recordings are sorted by `date` descending (newest first).

### 7.3 Transcript File (rec_<YYYY-MM-DD_HH-MM-SS>.json)
```json
{
  "text": "Good morning everyone, let's start with the updates...",
  "segments": [
    { "start": 0.0, "end": 3.2, "text": "Good morning everyone," },
    { "start": 3.2, "end": 6.1, "text": "let's start with the updates." }
  ],
  "source": "openai",
  "model": "whisper-1",
  "createdAt": "2026-04-05T10:35:00Z"
}
```

### 7.4 text_index.json
```json
{
  "version": 1,
  "updatedAt": "2026-04-05T14:22:00Z",
  "entries": {
    "rec_1712345678901": {
      "text": "Good morning everyone...",
      "segments": [
        { "start": 0.0, "end": 3.2, "text": "Good morning everyone," }
      ]
    }
  }
}
```

### 7.5 settings.json
```json
{
  "transcriptionMode": "openai_first",
  "autoUpgrade": false,
  "onDeviceModel": "tiny",
  "updatedAt": "2026-04-05T10:30:00Z"
}
```

Valid values:
- `transcriptionMode`: `"openai_first"` | `"always_local"` | `"openai_only"`
- `onDeviceModel`: `"tiny"` | `"base"` | `"small"`

### 7.6 browsers.json
```json
{
  "browsers": [
    {
      "token": "a1b2c3d4e5f67890...",
      "nickname": "My iPhone",
      "authorizedAt": "2026-04-05T10:30:00Z",
      "lastSeen": "2026-04-05T14:22:00Z",
      "status": "active"
    }
  ]
}
```

`status`: `"active"` | `"revoked"`

---

## 8. Implementation Guide

### 8.1 Code Structure
The backend is a single `Code.gs` file organized into clearly commented sections:

```
// ========================================
// CONFIGURATION
// ========================================
var CONFIG = { ... };

// ========================================
// ENTRY POINTS
// ========================================
function doGet(e) { ... }
function doPost(e) { ... }

// ========================================
// ROUTING
// ========================================
function handleGet(action, params) { ... }
function handlePost(action, body, params) { ... }

// ========================================
// AUTHENTICATION
// ========================================
function requestAccess(nickname) { ... }
function checkAuth(token, fileId) { ... }
function validateToken(token) { ... }
function revokeAccess(token, revokeToken) { ... }

// ========================================
// RECORDINGS
// ========================================
function uploadRecording(recording) { ... }
function getRecordings(includeTextIndex) { ... }
function getAudio(id) { ... }
function getTranscript(id) { ... }
function getRecordingData(id) { ... }
function deleteRecording(id) { ... }

// ========================================
// TRANSCRIPTION
// ========================================
function transcribeRecording(id) { ... }
function saveTranscript(id, transcript) { ... }
function callWhisperApi(audioBlob, mimeType) { ... }

// ========================================
// TITLES
// ========================================
function generateTitle(id) { ... }
function batchGenerateTitles(ids) { ... }
function updateTitle(id, title) { ... }

// ========================================
// SETTINGS
// ========================================
function getSettings() { ... }
function saveSettings(settings) { ... }
function getApiKeyStatus() { ... }
function saveApiKey(apiKey) { ... }

// ========================================
// INDEX MANAGEMENT
// ========================================
function getTextIndex() { ... }
function rebuildIndex() { ... }
function backfillTextIndex() { ... }
function updateIndex(fn) { ... }   // Lock + read-modify-write helper
function updateTextIndex(fn) { ... }

// ========================================
// DRIVE HELPERS
// ========================================
function getOrCreateFolder(parent, name) { ... }
function getAppFolder() { ... }
function getRecordingsFolder() { ... }
function getAuthFolder() { ... }
function getDateFolder(date) { ... }
function readJsonFile(fileId) { ... }
function writeJsonFile(folder, name, data) { ... }
function updateJsonFile(fileId, data) { ... }

// ========================================
// UTILITIES
// ========================================
function generateToken() { ... }
function makeResponse(data) { ... }
function makeError(code, message) { ... }
function formatDate(date) { ... }
```

### 8.2 Configuration Block
```javascript
var CONFIG = {
  VERSION: '1.0.0',
  ROOT_FOLDER_NAME: 'AppsScriptRecorder',
  RECORDINGS_FOLDER: 'recordings',
  AUTH_FOLDER: 'auth',
  INDEX_FILE: 'index.json',
  TEXT_INDEX_FILE: 'text_index.json',
  SETTINGS_FILE: 'settings.json',
  BROWSERS_FILE: 'browsers.json',
  LOCK_TIMEOUT_MS: 10000,
  OPENAI_TRANSCRIPTION_URL: 'https://api.openai.com/v1/audio/transcriptions',
  OPENAI_CHAT_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_MODELS_URL: 'https://api.openai.com/v1/models',
  TITLE_MODEL: 'gpt-4o-mini',
  MAX_PREVIEW_LENGTH: 200,
  MAX_TITLE_TRANSCRIPT_LENGTH: 500,
  BATCH_TITLE_TRANSCRIPT_LENGTH: 300,
  EXECUTION_TIMEOUT_BUFFER_MS: 30000
};
```

### 8.3 Entry Points
```javascript
function doGet(e) {
  try {
    var action = e.parameter.action;
    if (!action) return makeError('INVALID_INPUT', 'Missing action parameter');
    
    // Auth check (skip for ping)
    if (action !== 'ping') {
      var token = e.parameter.token;
      if (!token) return makeError('INVALID_INPUT', 'Missing token');
      if (action !== 'checkAuth' && !validateToken(token)) {
        return makeError('UNAUTHORIZED', 'Browser not authorized');
      }
      touchLastSeen(token);
    }
    
    return handleGet(action, e.parameter);
  } catch (err) {
    return makeError('INTERNAL_ERROR', err.message);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    if (!action) return makeError('INVALID_INPUT', 'Missing action');
    
    // Auth check (skip for requestAccess)
    if (action !== 'requestAccess') {
      var token = e.parameter.token;
      if (!token) return makeError('INVALID_INPUT', 'Missing token');
      if (!validateToken(token)) {
        return makeError('UNAUTHORIZED', 'Browser not authorized');
      }
      touchLastSeen(token);
    }
    
    return handlePost(action, body, e.parameter);
  } catch (err) {
    return makeError('INTERNAL_ERROR', err.message);
  }
}
```

### 8.4 Response Helpers
```javascript
function makeResponse(data) {
  var response = {
    success: true,
    version: CONFIG.VERSION,
    data: data
  };
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function makeError(code, message) {
  var response = {
    success: false,
    version: CONFIG.VERSION,
    error: { code: code, message: message }
  };
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### 8.5 Index Read-Modify-Write Pattern
All index mutations must acquire a lock to prevent concurrent corruption:

```javascript
function updateIndex(mutationFn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
    throw new Error('Could not acquire lock for index update');
  }
  try {
    var folder = getAppFolder();
    var file = getFileInFolder(folder, CONFIG.INDEX_FILE);
    var index = file ? JSON.parse(file.getBlob().getDataAsString()) : { version: 1, recordings: [] };
    
    var result = mutationFn(index);
    
    index.updatedAt = new Date().toISOString();
    if (file) {
      file.setContent(JSON.stringify(index));
    } else {
      folder.createFile(CONFIG.INDEX_FILE, JSON.stringify(index), 'application/json');
    }
    
    return result;
  } finally {
    lock.releaseLock();
  }
}
```

### 8.6 Upload Idempotency
```javascript
function uploadRecording(recording) {
  // Check for duplicate
  var index = readIndex();
  var existingId = 'rec_' + recording.clientTimestamp;
  var existing = index.recordings.find(function(r) { return r.id === existingId; });
  if (existing) {
    return makeResponse({ recording: existing, isDuplicate: true });
  }
  
  // Decode audio
  var audioBytes = Utilities.base64Decode(recording.audioBase64);
  var date = new Date(recording.clientTimestamp);
  var pad = function(n) { return ('0' + n).slice(-2); };
  var humanTimestamp = date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + '_' +
    pad(date.getHours()) + '-' +
    pad(date.getMinutes()) + '-' +
    pad(date.getSeconds());
  var fileName = 'rec_' + humanTimestamp + getExtension(recording.mimeType);
  var blob = Utilities.newBlob(audioBytes, recording.mimeType, fileName);
  
  // Create folder structure and save
  var dateFolder = getDateFolder(date);
  var audioFile = dateFolder.createFile(blob);
  
  // Add to index
  var newEntry = {
    id: existingId,
    date: date.toISOString(),
    duration: recording.duration,
    mimeType: recording.mimeType,
    fileSize: audioBytes.length,
    location: recording.location || null,
    title: null,
    preview: null,
    transcriptionSource: null,
    transcriptionModel: null,
    hasTranscript: false,
    audioFileId: audioFile.getId(),
    transcriptFileId: null
  };
  
  updateIndex(function(index) {
    index.recordings.unshift(newEntry);
  });
  
  return makeResponse({ recording: newEntry, isDuplicate: false });
}
```

### 8.7 Whisper API Integration
```javascript
function callWhisperApi(audioBlob, mimeType) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) {
    throw { code: 'API_KEY_MISSING', message: 'No OpenAI API key configured' };
  }
  
  var ext = mimeType === 'audio/mp4' ? 'mp4' : 'webm';
  var namedBlob = audioBlob.setName('audio.' + ext);
  
  var response = UrlFetchApp.fetch(CONFIG.OPENAI_TRANSCRIPTION_URL, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: {
      file: namedBlob,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: JSON.stringify(['segment'])
    },
    muteHttpExceptions: true
  });
  
  var status = response.getResponseCode();
  var result = JSON.parse(response.getContentText());
  
  if (status === 401) {
    throw { code: 'API_KEY_INVALID', message: 'OpenAI API key is invalid' };
  }
  if (status !== 200) {
    throw { code: 'TRANSCRIPTION_FAILED', message: result.error?.message || 'Unknown error' };
  }
  
  return {
    text: result.text,
    segments: (result.segments || []).map(function(s) {
      return { start: s.start, end: s.end, text: s.text.trim() };
    }),
    source: 'openai',
    model: 'whisper-1'
  };
}
```

---

## 9. Error Codes

| Code | HTTP Context | Meaning |
|------|-------------|---------|
| `INVALID_INPUT` | Bad request | Missing or invalid parameters |
| `UNAUTHORIZED` | Auth failure | Token not found, revoked, or not yet authorized |
| `NOT_FOUND` | Resource missing | Recording ID not found in index |
| `DUPLICATE` | Upload duplicate | Recording with same timestamp exists (not an error — returns existing data) |
| `API_KEY_MISSING` | Config | No OpenAI API key stored |
| `API_KEY_INVALID` | Config | OpenAI key rejected by API |
| `TRANSCRIPTION_FAILED` | External | OpenAI transcription API returned an error |
| `TITLE_GENERATION_FAILED` | External | LLM title generation failed |
| `LOCK_FAILED` | Concurrency | Could not acquire file lock (retry) |
| `TIMEOUT` | Execution | Approaching 6-minute GAS limit |
| `INTERNAL_ERROR` | Bug | Unexpected error |

---

## 10. Testing Strategy

### 10.1 Unit Tests in GAS
GAS does not have a built-in test runner. Use a simple test harness:

```javascript
// ========================================
// TESTS (remove before deployment)
// ========================================
function runTests() {
  var results = [];
  var tests = [
    testGenerateToken,
    testMakeResponse,
    testMakeError,
    testGetOrCreateFolder,
    testUploadRecordingIdempotency,
    testAuthFlow,
    testRecordingCRUD,
    testTranscriptSave,
    testSettingsRoundTrip,
    testIndexLocking,
    testDeleteRecording,
    testRebuildIndex
  ];
  
  tests.forEach(function(test) {
    try {
      test();
      results.push({ name: test.name, passed: true });
    } catch (e) {
      results.push({ name: test.name, passed: false, error: e.message });
    }
  });
  
  Logger.log(JSON.stringify(results, null, 2));
  return results;
}
```

### 10.2 Test Categories

**Pure function tests** (no Drive dependencies):
- `generateToken()` returns 32-char hex string
- `makeResponse()` / `makeError()` produce correct envelope
- Date folder path generation
- Recording ID generation from timestamp
- Preview text truncation

**Integration tests** (require Drive — run in GAS editor):
- Create/read/update/delete a recording
- Auth flow: request → star → check → validate
- Upload idempotency (upload same recording twice)
- Index locking (simulate concurrent writes)
- Settings save and retrieve
- Rebuild index matches manual index

**API key tests** (require valid OpenAI key):
- Transcription of a short audio file
- Title generation from transcript text
- Invalid key detection

### 10.3 Test Data Setup
```javascript
function setupTestData() {
  // Create a small test audio file (silence, base64-encoded)
  var testAudioBase64 = '...'; // Minimal valid MP4 with silence
  
  uploadRecording({
    clientTimestamp: Date.now(),
    audioBase64: testAudioBase64,
    mimeType: 'audio/mp4',
    duration: 5,
    location: { lat: 0, lng: 0, label: 'Test Location' }
  });
}

function cleanupTestData() {
  // Delete test recordings and folders
  var folder = getAppFolder();
  // ... cleanup logic
}
```

### 10.4 Mock API for Frontend Development
For frontend development without a real backend, the frontend should include a mock API client that:
- Returns realistic fake data
- Simulates network delays (200-500ms)
- Simulates errors on demand
- Stores state in memory or localStorage

The mock should implement the exact same response shapes documented in Section 6. See `frontend.md` Section 4.2 for the mock implementation spec.

---

## 11. Deployment

### 11.1 First Deployment
1. Go to https://script.google.com/create
2. Name the project "AppsScriptRecorder"
3. Delete any existing code in Code.gs
4. Paste the entire backend source
5. Click Deploy > New deployment
6. Type: Web app
7. Execute as: Me
8. Who has access: Anyone
9. Click Deploy
10. Authorize when prompted (grants Drive access)
11. Copy the Web App URL

### 11.2 Updating
1. Open the existing project at https://script.google.com/home
2. Replace the code in Code.gs
3. Click Deploy > Manage deployments
4. Click the pencil icon on the existing deployment
5. Change Version to "New version"
6. Click Deploy

**Critical:** Do NOT create a new deployment. This changes the URL and breaks all connected browsers. Always edit the existing deployment.

### 11.3 Deployment URL Format
```
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```

The frontend validates this format during setup (must start with `https://script.google.com/macros/s/`).
