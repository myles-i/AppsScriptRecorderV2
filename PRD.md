# Product Requirements Document: Voice Recorder with Transcription

**Version:** 2.0
**Date:** 2026-04-05
**Status:** Approved

---

## 1. Overview

### 1.1 Problem Statement
People want to capture thoughts, conversations, and notes by voice — but audio files are unsearchable and hard to review later. Existing voice recorder apps either require paid subscriptions, don't transcribe, or store data on third-party servers the user doesn't control.

### 1.2 Solution
A mobile-first Progressive Web App that records voice memos, automatically transcribes them, and stores everything in the user's own Google Drive. It works fully offline, transcribes on-device when no internet is available, and optionally upgrades to higher-quality cloud transcription when connected.

### 1.3 Target User
A non-technical individual who:
- Records voice memos regularly (meetings, ideas, journal entries).
- Wants transcripts they can search and read later.
- Owns a Google account and prefers to keep data in their own Drive.
- Is willing to follow a guided setup wizard (10 minutes, one time) but has no knowledge of Google Apps Script or APIs.
- Uses the app primarily on their phone but occasionally on desktop.

### 1.4 Design Principles
1. **Offline-first**: Every user action completes immediately with local feedback. The user never waits for the network.
2. **Never lose a recording**: Audio is saved locally before any network call. Even if the browser crashes mid-recording, whatever was captured is preserved.
3. **Zero infrastructure**: No servers to maintain. Static frontend + user-deployed backend. Nothing to pay for beyond OpenAI usage (~$0.006/minute, optional).
4. **Data ownership**: All data lives in the user's Google Drive. Deleting the app leaves no orphaned data anywhere.

---

## 2. Priority Definitions

| Priority | Meaning |
|----------|---------|
| **P0 — Must have** | The app is broken or unusable without this. Ship-blocking. |
| **P1 — Should have** | Core experience is degraded without this. Expected in v1. |
| **P2 — Nice to have** | Polish and delight. Can ship without, but noticeably better with. |

---

## 3. User Journeys

### Journey 1: First-Time Setup (P0)

**Persona**: A new user who just found the app URL. They have a Google account but have never heard of Google Apps Script.

**Story**: *I want to set up the app so I can start recording. The setup should be guided and hard to get wrong.*

#### 3.1.1 Demo Mode (No Setup)
The user can skip setup entirely and start recording immediately.

**Acceptance Criteria:**
- On first visit, the app opens to the browse screen (not a mandatory setup wizard).
- A non-blocking banner says: "No Drive sync — recordings may be lost if cache clears. Tap to set up."
- The user can tap the record button, record audio, and play it back without any backend or API key.
- On-device transcription runs automatically (using the default small Whisper model).
- Recordings are stored locally on the device. The user is warned they are not backed up.
- When the user later completes setup, all local recordings are automatically uploaded to Drive and synced.

#### 3.1.2 Guided Backend Setup
When the user taps the setup banner (or reaches setup from Settings), a step-by-step wizard appears.

**Step 1 — Create the backend project:**
- Clear instructions: "Go to script.google.com/create and name the project AppsScriptRecorder."
- A "Copy code" button copies the entire backend source to clipboard. The backend source code is hosted as a static file within the frontend itself, so the copy button works offline.
- Instructions to delete any existing code and paste.
- A tip for returning users: "Already set up on another device? Find your existing project and skip to Step 3."

**Step 2 — Deploy as a Web App:**
- Numbered instructions: Deploy > New deployment > Web app > Execute as Me > Who has access: Anyone > Deploy > Authorize > Copy URL.
- No jargon is unexplained.

**Step 3 — Connect this browser:**
- Input field for the Web App URL with validation (must start with `https://script.google.com/macros/s/`).
- Input field for a browser nickname (e.g. "My iPhone", "Work Laptop"). Defaults to "My Browser" if left blank.
- "Request Access" button.
- On success, the app creates an authorization request file in the user's Drive folder and transitions to a pending authorization screen.

**Step 3b — Authorize via Drive:**
- The screen says: "Star this file in your Drive folder to authorize."
- A link opens the Drive folder. The filename to star is displayed.
- An explanation: "By starring this file, you are granting the browser nicknamed '[nickname]' permanent access to your recordings. Only someone with access to your Google Drive can do this."
- A spinner and "Waiting for authorization..." message.
- The app polls the backend until the file is starred or ~10 minutes elapse.
- Cancel button returns to the URL input.

**Step 4 — OpenAI API Key (optional):**
- If the backend already has a key configured (e.g. user set it up on another device), this step is skipped entirely and setup completes.
- Otherwise: explains what the key is for ("Transcription uses OpenAI Whisper. It costs about $0.03 for a 5-minute recording."), links to platform.openai.com/api-keys, and provides an input field.
- "Validate & Save" validates the key server-side before storing.
- The user can skip this — on-device transcription works without it.

**Acceptance Criteria:**
- A user with no technical background can complete setup by following the wizard sequentially.
- At no point is the user shown raw code they need to understand (they copy-paste it as a black box).
- The app is fully functional after Step 3 (without Step 4). Step 4 only adds cloud transcription.
- If the backend returns errors during setup, clear error messages appear (not raw HTTP codes).
- After setup completes, the browse screen appears with a welcome toast.

---

### Journey 2: Recording a Voice Memo (P0)

**Story**: *I want to capture a voice recording as quickly as possible — ideally one tap from the main screen.*

#### 3.2.1 Starting a Recording
- The user taps the floating microphone button on the browse screen.
- The record screen appears and recording starts automatically (no second tap needed).
- The microphone permission prompt appears on first use. If denied, a clear error message explains how to enable it.

#### 3.2.2 During Recording
- A live waveform visualization shows audio amplitude in real-time.
- A timer shows elapsed recording time (excluding paused time).
- The current location is displayed (reverse-geocoded to "City, State, Country"). If offline, raw coordinates are shown and the label is updated when connectivity returns. If location permission is denied, "Unknown location" is shown.
- The user can pause and resume recording. The timer stops while paused.
- The screen stays on during recording (wake lock, best-effort).

#### 3.2.3 Background & Interruption Handling
- If the user switches apps or locks the screen, a warning banner appears when they return: "App was in the background — recording may have paused."
- If the browser kills the recording while backgrounded (common on mobile), the app performs an emergency save: it assembles whatever audio was captured and saves it through the normal pipeline. A toast notifies: "Recording auto-saved (app was backgrounded)."
- If the user presses the back button while recording, a confirmation dialog asks: "Stop recording and discard?" Cancel keeps recording. Confirm discards and returns to browse.

#### 3.2.4 Finishing a Recording
- The user taps the stop button.
- The app immediately navigates to the browse screen.
- An optimistic card appears at the top of the recordings list showing the location, date, and an animated "Saving and transcribing..." indicator.
- Behind the scenes: audio is cached locally, then durably queued for: upload to Drive -> transcription -> title generation.
- The card updates in real-time as each pipeline stage completes:
  - "Saving and transcribing..." (upload in progress)
  - Checkmark + "Saved. Transcribing..." (upload done, transcription in progress)
  - Transcript preview text (transcription done)
  - If upload fails: "Upload failed — will retry on next visit"
  - If transcription fails: "Transcription failed — will retry on next visit"
- The user can tap the card to open playback immediately, even before upload/transcription completes (audio plays from local cache).

**Acceptance Criteria:**
- Time from tapping the mic button to audio capture starting: under 1 second (after initial permission grant).
- After tapping stop, the user sees the browse screen with their new recording within 200ms. No "Saving..." blocking screen.
- If the app is force-closed immediately after tapping stop, the recording is not lost. On next open, it resumes uploading.
- A 5-minute recording at speech quality is roughly 1-2 MB.
- Audio format: MP4 preferred (required for iOS playback), WebM as fallback (Firefox). The format is stored with the recording.

---

### Journey 3: Reviewing a Recording (P0)

**Story**: *I want to listen to a recording and read its transcript. It should feel instant — no loading screens.*

#### 3.3.1 Opening Playback
- The user taps a recording card on the browse screen.
- The playback screen appears immediately with:
  - Recording metadata (title, location, date) — always available from the local cache.
  - Transcript — rendered from local cache if available, without waiting for a network fetch.
  - Audio — loads in the background. The play button shows a subtle loading indicator until ready. If the user taps play before audio loads, playback starts automatically when it arrives.
- If the recording has no cached audio or transcript (e.g. opened on a different device), they are fetched from the server. The screen is never blank — metadata is always shown immediately.

#### 3.3.2 Playback Controls
- Play/pause (large center button).
- Skip back and forward 15 seconds.
- Scrubbable progress bar (click or touch-drag). Shows elapsed time / total time.
- Variable speed: 0.6x to 3.0x. Accessed via a speed button that opens a bottom-sheet popup with:
  - A continuous slider with draggable thumb.
  - Preset buttons: 1x, 1.2x, 1.4x, 1.6x, 1.8x, 2x.
  - Tap outside to dismiss.

#### 3.3.3 Transcript Display
- Transcript segments are displayed with timestamps (e.g. `[1:23] Hello, this is...`).
- The currently-playing segment is highlighted.
- Auto-scroll: the transcript follows playback. Once the active segment passes the vertical midpoint of the scroll area, it stays centered. Before the midpoint, no scrolling occurs (the list stays at the top and segments highlight in place).
- If the user manually scrolls the transcript, auto-scroll pauses. A floating "jump to current" button appears. Its arrow icon points up or down depending on where the active segment is relative to the viewport.
- Auto-scroll resumes when: (a) the user taps the jump button, (b) the user scrolls back to where the active segment is visible and below center, or (c) the user taps a transcript segment.
- Tapping any transcript segment seeks to that timestamp and starts playing.

#### 3.3.4 Metadata
- **Title**: Displayed prominently. Tapping it opens an inline edit field. Enter or tapping away saves. Escape cancels. Changes persist optimistically (instantly reflected locally, synced to server in background).
- **Location**: With a link to open Google Maps at those coordinates (if available).
- **Date**: With a link to search Google Photos for that date (to find related photos).

#### 3.3.5 Copy & Share
- **Copy transcript button** (next to "Transcript" header): Copies the full transcript as plain text. Shows a brief checkmark confirmation (~750ms) then reverts to the copy icon. Works even before audio has finished loading.
- **Share button**: Opens a bottom-sheet with two options:
  - "Audio file" — uses the Web Share API if available, otherwise triggers a file download.
  - "Transcript" — uses the Web Share API if available, otherwise copies to clipboard.

#### 3.3.6 Error Recovery
- If audio fails to play (corrupted cache, stale blob), the app silently clears the cached audio and retries once with a fresh server fetch.
- If the server fetch also fails, an error toast appears and the play button shows an error icon.
- Transcript remains visible and copyable even when audio is unavailable.

**Acceptance Criteria:**
- Time from tapping a recording to seeing the playback screen with metadata: under 100ms.
- If a transcript is locally cached, it renders before any network request completes.
- Copy transcript works even if the audio is still loading or unavailable.
- Speed changes take effect immediately with no audible glitch.
- All playback controls work on iOS Safari, Chrome (Android + desktop), and Firefox.

---

### Journey 4: Finding an Old Recording (P1)

**Story**: *I recorded something last week about a specific topic. I want to find it by searching for a word I remember from the conversation.*

#### 3.4.1 Search
- A search bar is always visible at the top of the browse screen.
- As the user types, recordings filter in real-time (no submit button, no debounce delay).
- Search matches against: title, location, date, and the full transcript text of every recording.
- Matching text is highlighted in the recording cards.
- Beyond the transcript preview (~200 characters), up to 3 additional context snippets from deeper in the transcript are shown with "..." ellipsis, so the user can see where in the recording their search term appears.
- If no recordings match, a "No recordings match your search" empty state appears.

#### 3.4.2 Search-to-Playback
- When the user taps a search result, playback opens scrolled to the first matching transcript segment and seeked to that segment's timestamp.
- The matching segment is visible on screen without the user needing to scroll.

#### 3.4.3 Offline Search
- Search works fully offline. The full transcript text of all recordings is cached locally.
- On first load (or when new recordings exist), the text index is fetched from the server and cached.

**Acceptance Criteria:**
- Search results appear within one frame of typing (client-side filtering, no network).
- A search across 500 recordings with full transcripts completes with no perceptible lag.
- Search works identically when offline.
- Tapping a search result starts playback at the matching moment, not the beginning.

---

### Journey 5: Deleting a Recording (P1)

**Story**: *I want to delete a recording I no longer need.*

- On the playback screen, a trash icon in the nav bar opens a confirmation dialog.
- The dialog says: "Delete this recording? This will permanently delete the audio file and transcript from your Drive. This cannot be undone."
- On confirm: the app immediately navigates to browse and removes the card from the list (optimistic delete). The actual server deletion is queued and retries if offline.
- Audio and transcript local caches are cleared immediately.

**Acceptance Criteria:**
- After confirming delete, the user sees the browse screen without the deleted recording within 200ms.
- If the app is offline when the user deletes, the recording disappears locally and is deleted from Drive when connectivity returns.
- The deleted recording does not reappear on pull-to-refresh or app restart.

---

### Journey 6: Managing the App (P1)

**Story**: *I want to check my settings, add another device, update my API key, or troubleshoot issues.*

#### 3.6.1 Settings (accessed via gear icon on browse screen)
A modal with these sections:

**Browser Info:**
- Shows the current browser's nickname.
- Link to the Drive data folder.

**OpenAI API Key:**
- Status: "API key configured" (green) or "No API key set" (orange).
- "Update key" button reveals an input field. "Validate & Save" validates server-side before storing.

**Transcription Settings:**
- **Mode** (radio buttons):
  - "OpenAI first, on-device fallback" (default) — tries cloud, falls back to on-device.
  - "Always on-device" — never calls OpenAI.
  - "OpenAI only" — skips transcription if OpenAI is unavailable.
- **Auto-upgrade** (checkbox, shown only in "OpenAI first" mode): "Upgrade local transcriptions with OpenAI when available." When enabled, recordings initially transcribed on-device are automatically re-transcribed with OpenAI when connectivity and a valid key are available.
- **On-device model** (radio buttons, hidden in "OpenAI only" mode):
  - Tiny (~75 MB) — recommended
  - Base (~145 MB)
  - Small (~480 MB)
- "Download model" button with a progress bar. On startup, the selected model auto-downloads in the background if not already cached.
- Status text: "Not downloaded", "Downloading...", "Ready", or "Error — try again".

**Adding Another Device:**
- Displays the Web App URL with a copy button.
- Instructions: "Open the app on the new device and go through the setup wizard. Use this Web App URL."

**Access & Security:**
- Explains the token model: "Your recordings are tied to this browser. Anyone who can use this browser can access them."
- Advises on compromise: "If someone had brief access to your browser, disconnect and reconnect to invalidate any copied credentials."

**Revoking Access from Drive:**
- Instructions for editing the authorized browsers file in Drive to revoke a lost/stolen device.

**Maintenance:**
- "Rebuild Index" button: For when recordings exist in Drive but don't appear in the app. Scans the Drive folder tree and regenerates the recordings list.
- "Check for updates" button: Forces the PWA to check for a new version.

**Disconnect:**
- Red button: "Disconnect this browser." Revokes the token server-side, clears all local data (caches, credentials, settings). The user's recordings in Drive are not affected.

#### 3.6.2 Backend Update Flow
- The backend includes a version number in every response.
- When the frontend detects an older backend version, an amber banner appears on the browse screen: "Apps Script update available. Update now."
- Tapping "Update now" opens a modal with:
  1. "Open your existing project" — link to script.google.com/home.
  2. "Replace the code" — copy button for the latest backend source.
  3. "Deploy a new version" — instructions to use Manage Deployments > Edit > New Version > Deploy (preserving the URL).
  - Note: "No URL change — your existing setup on all devices keeps working."

#### 3.6.3 App Update Flow
- When a new version of the PWA is available, a banner appears: "App update available. Reload."
- The user taps Reload to apply the update. Updates never apply silently or interrupt the user.

**Acceptance Criteria:**
- Settings changes take effect immediately (no save button needed for radio buttons and checkboxes).
- Transcription settings sync across devices via Drive (last-write-wins by timestamp).
- Disconnect clears everything — after disconnecting, the app behaves as if freshly installed.
- The update modal's copy button works offline (the backend source is a static file within the frontend).
- "Check for updates" either reports "Already up to date" or triggers a reload.

---

### Journey 7: Using the App Offline (P0)

**Story**: *I'm on a plane / in a basement / don't have cell service. I want to record, transcribe, and play back recordings without any internet.*

#### 3.7.1 Offline Recording
- Recording works identically to online. The record button, waveform, timer, and location all function.
- If geolocation works but reverse geocoding fails (no internet), raw coordinates are displayed and updated to a city name when connectivity returns.

#### 3.7.2 Offline Transcription
- If the transcription mode includes on-device (the default), the recording is transcribed locally immediately after saving.
- The transcript appears in the browse card and is available for playback.
- If the mode is "OpenAI only", transcription is deferred until connectivity returns.

#### 3.7.3 Offline Playback
- Recently played recordings (audio + transcript) are cached locally and play back fully offline.
- Older recordings that aren't cached show metadata and transcript (if cached) but display "Audio is not available offline" in place of the play button.
- Transcript is available for all recordings that have ever been played or transcribed on this device.

#### 3.7.4 Offline Sync Behavior
- An "Offline" banner appears on the browse screen: "Offline — recordings will upload when reconnected."
- All state-changing operations (upload, delete, title edit) are queued locally and execute when connectivity returns.
- When the device comes back online:
  - The queue starts processing immediately.
  - The recordings list refreshes from the server.
  - Any pending geocodes retry.
  - The offline banner disappears.
- Pull-to-refresh while offline shows cached data and resets the retry queue (equivalent to restarting the app).

#### 3.7.5 No-Backend Mode
- The app is fully usable without ever setting up a backend.
- A persistent banner warns: "No Drive sync — recordings may be lost if cache clears. Tap to set up."
- Recordings exist only in local browser storage. If the browser clears site data, recordings are lost.
- When a backend is later configured, all local recordings are automatically uploaded and synced to Drive.

**Acceptance Criteria:**
- The full app shell loads from cache with no network (PWA precaching).
- Recording + on-device transcription works in airplane mode.
- A recording made offline is uploaded automatically when the device reconnects — without user intervention.
- The durable queue survives: app close, browser restart, device restart. On next app open, pending operations resume.
- Queue entries expire after a reasonable period (e.g. 7 days) to avoid unbounded growth.
- If upload fails repeatedly, the card shows "Upload failed — will retry" (not an infinite spinner).

---

### Journey 8: Using Multiple Devices (P1)

**Story**: *I set up the app on my phone. Now I want to use it on my laptop too.*

- On the second device, the user opens the app URL and goes through setup.
- In Step 3, they enter the same Web App URL (available in Settings > "Adding another device" on the first device, with a copy button).
- The star-to-authorize flow runs again for the new browser.
- After authorization, the second device sees all existing recordings.
- Transcription settings sync across devices: a change on one device appears on the other after an app restart or pull-to-refresh.
- Recordings made on one device appear on the other after a refresh. There is no real-time push sync.

**Acceptance Criteria:**
- A second device can be set up in under 2 minutes using the URL from the first device.
- The API key does not need to be re-entered (it's stored server-side, shared across all browsers).
- Settings changes propagate across devices on next startup.

---

## 4. Transcription System

### 4.1 Overview (P0)
Every recording goes through a transcription pipeline that produces timestamped segments. The system supports three modes (configurable in Settings) and handles failures gracefully.

### 4.2 Cloud Transcription
- The backend calls the OpenAI Whisper API server-side. The API key is stored on the server and never sent to the browser.
- Audio is read directly from Drive (not re-uploaded from the browser).
- Returns timestamped segments.
- Cost: ~$0.006/minute. This is noted during API key setup.

### 4.3 On-Device Transcription
- Runs a Whisper model in a Web Worker (never blocks the UI thread).
- Three model sizes: Tiny (~75 MB, recommended), Base (~145 MB), Small (~480 MB).
- Models download on first use and are cached by the browser for subsequent use.
- On app startup, the selected model begins downloading in the background (so it's ready when needed).
- Audio is resampled to 16 kHz mono before inference.

### 4.4 Transcription Modes

| Mode | Online Behavior | Offline Behavior |
|------|----------------|-----------------|
| **OpenAI first, on-device fallback** (default) | Uses OpenAI | Falls back to on-device |
| **Always on-device** | Uses on-device | Uses on-device |
| **OpenAI only** | Uses OpenAI | Skips transcription (defers until online) |

### 4.5 Auto-Upgrade (P2)
When enabled, recordings that were initially transcribed on-device are automatically re-transcribed with OpenAI when connectivity and a valid key become available. The higher-quality transcript replaces the local one both locally and in Drive.

### 4.6 Invalid API Key Handling
If the OpenAI key is invalid or expired:
- The transcription falls back to on-device (in default mode) rather than failing.
- A toast notifies: "OpenAI key invalid or missing — update it in Settings."
- A banner appears on the browse screen linking to key configuration.

### 4.7 Transcript Format
Each transcript contains:
- Full plain text (for search and copy).
- Timestamped segments: `[{ start, end, text }]` (for playback sync).
- Source metadata: which engine produced it ("openai" or "local") and which model.

---

## 5. Title Generation (P2)

- After transcription completes, the backend sends the transcript to an LLM to generate a 2-4 word title (e.g. "Grocery Run Plans", "Morning Standup Notes").
- Titles appear on browse cards and the playback screen.
- Title generation is non-critical. Failures are silently ignored — the browse list falls back to a friendly date string (e.g. "Wednesday, April 2nd at 3:30 PM").
- On startup, any recordings with transcripts but no titles are batch-processed in one request.
- Users can manually edit titles by tapping them on the playback screen. Manual titles are synced to Drive.

---

## 6. Data Architecture

### 6.1 Source of Truth
- **Server (Drive)** is the authoritative source for all data.
- **Local caches** are optimistic mirrors for performance and offline access. They are rebuilt from the server on any conflict.

### 6.2 What the Backend Stores in Drive
Under a dedicated app folder in the user's Drive:
- **Audio files**: Organized by date (year/month/day subfolders). MP4 or WebM depending on the recording browser.
- **Transcript files**: JSON alongside each audio file. Contains full text and timestamped segments.
- **Recordings index**: A single JSON file listing all recordings with metadata (id, date, location, duration, preview, title). Enables fast listing without scanning the folder tree.
- **Text index**: A JSON file mapping recording IDs to full transcript text and segments. Enables full-text search.
- **Settings**: A JSON file for cross-device settings sync (transcription mode, model, auto-upgrade flag).
- **Authorized browsers**: A text file listing all authorized browser tokens with nicknames and dates.

### 6.3 What the Frontend Caches Locally
- **Recording metadata** (all entries, no eviction): For instant browse list rendering on cold start.
- **Full transcript text + segments** (all entries, no eviction): For offline search and instant playback transcript rendering.
- **Audio blobs** (recent ~10 entries, LRU eviction): For offline and instant playback of recently accessed recordings.
- **Durable mutation queue** (pending operations, TTL-based expiry): For offline-first state changes.

### 6.4 Backend API Capabilities
All requests include the browser's auth token. All responses include a backend version number.

**Authentication**: Request access, check authorization status, revoke access.
**API Key Management**: Store/validate OpenAI key, check key status (never returns the key itself).
**Recording CRUD**: Upload audio (idempotent — retries don't create duplicates), get audio, get transcript, get combined audio+transcript, delete, list all (with optional text index in single request).
**Transcription**: Trigger cloud transcription, save a locally-produced transcript to Drive.
**Titles**: Generate title (single), batch-generate titles, update title manually.
**Settings**: Get settings, save settings.
**Search**: Get text index, backfill text index for legacy recordings.
**Maintenance**: Rebuild recordings index by scanning Drive folders.

### 6.5 Upload Idempotency
The backend identifies duplicate uploads by client timestamp + location. If the same recording is uploaded twice (e.g. the app was closed before receiving the success response, and the queue retries on next open), the existing entry is returned. This is critical for the offline-first queue.

### 6.6 Backend Version Compatibility
API calls gracefully degrade when the backend is older than expected. Combined endpoints (e.g. "get audio + transcript in one request") fall back to separate calls. The user sees an update banner but the app remains functional.

---

## 7. Resilience & Data Integrity

### 7.1 Durable Mutation Queue (P0)
All state-changing operations are durably persisted locally BEFORE any network call:
- **New recording**: upload -> transcribe -> generate title (three-stage pipeline).
- **Delete**: queued, executes on server when online.
- **Title edit**: queued, syncs to server when online.

Queue characteristics:
- Processes entries in order.
- Retries failures with backoff.
- Survives app close, page refresh, device restart.
- Entries expire after a reasonable period.
- On app startup and on reconnect, retry counters reset (so failed entries get another chance).

### 7.2 Emergency Save (P0)
If the browser kills the recorder while the app is backgrounded:
- The app detects this when the user returns (visibility change).
- Whatever audio chunks were captured are assembled and saved through the normal pipeline.
- A toast notifies the user.

### 7.3 Self-Healing (P1)
On each recordings list load:
- Recordings stuck in "Transcribing..." state (no corresponding queue entry) are detected and re-queued for transcription.
- If the server has transcript text for a recording that still shows "Transcribing..." in the list, the display is corrected.
- Deleted recordings that reappear (e.g. stale cache) are cleaned up.
- Duplicate entries are deduplicated by ID.

### 7.4 Cache-Server Reconciliation (P1)
When the recordings list is fetched from the server:
- New server entries are added to the local cache and DOM.
- Changed entries (new transcript, new title) are patched in place.
- Entries deleted on the server are removed locally.
- Local-only entries (pending upload) are preserved and matched against server entries by timestamp to prevent duplicates.
- No full re-render occurs — the list updates incrementally.

---

## 8. Cross-Platform Requirements

### 8.1 Audio Format Compatibility (P0)

| Platform | Records | Plays |
|----------|---------|-------|
| iOS Safari | MP4 only | MP4 only |
| Chrome / Android | MP4 (preferred) or WebM | Both |
| Firefox | WebM only | Both |

The app prefers MP4 for maximum playback compatibility. Firefox users get WebM (their only option), which won't play on iOS Safari. The MIME type is stored per recording.

### 8.2 iOS-Specific Requirements (P0)
- Audio recording APIs must be initialized inside a user gesture (tap handler). Initializing them at page load or in a timeout will silently fail.
- After a native dialog (e.g. confirm prompt), the audio pipeline may be permanently suspended. The app must detect and recover from this.
- IndexedDB Blob storage is unreliable across sessions on iOS Safari. The caching layer must use an alternative storage strategy (e.g. ArrayBuffer).
- HTTPS is required for microphone access.

### 8.3 Mobile Backgrounding (P0)
- The app must preserve audio data when going to the background.
- If the browser kills the recorder, the app must emergency-save (see 7.2).
- A wake lock keeps the screen on during recording (best-effort).

---

## 9. PWA Requirements (P0)

### 9.1 Installable
- Web app manifest with app name, icons, and standalone display mode.
- iOS home-screen app support via appropriate meta tags.

### 9.2 Offline Shell
- All app shell assets are precached on service worker install.
- Backend API calls are never cached by the service worker (always network-only).
- CDN font/icon files are cached on first use.

### 9.3 Update Flow
- New versions prompt with a non-intrusive banner. The user explicitly triggers the reload.
- No silent takeover. No interrupting the user mid-recording.
- "Check for updates" in Settings allows manual checking.

---

## 10. Performance Targets

| Scenario | Target |
|----------|--------|
| App open (cold start, cached) | Browse list visible within 200ms from local cache |
| Tap a recording | Playback screen with metadata + cached transcript in under 100ms |
| Finish recording | Browse screen with optimistic card in under 200ms |
| Search typing | Results filter within one animation frame of input |
| Pull to refresh | Incremental DOM update (no full-page flash or re-render) |

### 10.1 Network Optimization
- The backend should offer combined endpoints (e.g. "list recordings + text index" in one request; "audio + transcript" in one request) to minimize round trips.
- The frontend should use these when available and fall back to separate calls for older backends.

---

## 11. Constraints & Limitations

### 11.1 Hard Constraints
- **GAS execution timeout**: 6 minutes per call. Cloud transcription must complete within this window.
- **GAS POST body**: No binary — audio must be text-encoded.
- **CORS**: GAS doesn't support custom response headers. Requests must be simple (no preflight).
- **Single deployment URL**: Backend updates must use the same deployment URL. A new deployment breaks all connected browsers.
- **Drive scope**: Full Drive scope is required by GAS (not the more restrictive drive.file scope). The app only touches files in its own folder.

### 11.2 Known Limitations
1. **WebM/iOS**: Recordings made in Firefox cannot play on iOS Safari.
2. **Background recording**: Cannot guarantee uninterrupted recording when backgrounded. Emergency save mitigates data loss.
3. **No real-time sync**: Changes on one device appear on others only after a refresh.
4. **Client-side search**: Searches data in memory. Suitable for hundreds of recordings, not thousands.
5. **Audio cache size**: Only ~10 recent recordings are cached for offline playback. Older ones need network.
6. **Browser storage**: If the browser clears site data (storage pressure, user action), local-only recordings (no backend) are lost. Recordings synced to Drive are safe.

---

## 12. Out of Scope (v1)

- User accounts / multi-user sharing.
- Server-side search.
- Real-time cross-device sync (push notifications).
- Audio editing (trim, split, merge).
- Automatic language detection or multi-language transcription.
- Folders or tags for organizing recordings.
- Export to other formats (PDF, SRT, etc.).

---

## 13. Success Criteria

The product is successful when:
1. A non-technical user can go from zero to first recording in under 15 minutes (including backend setup).
2. A user can go from zero to first recording in under 30 seconds (demo mode, no setup).
3. Recording and playback work reliably on iOS Safari, Chrome (Android), and Firefox.
4. No recording is ever lost due to an app or network error.
5. Search finds any word spoken in any recording, instantly.
6. The app feels native-speed on a mid-range phone — no loading spinners for cached content.
