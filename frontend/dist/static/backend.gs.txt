/**
 * Code.gs — AppsScriptRecorder backend
 *
 * Deployed as a GAS Web App (Execute as Me, Anyone can access).
 * All data lives in the deploying user's Google Drive.
 *
 * Entry points: doGet(e), doPost(e)
 * Service accessors are overridable vars so Tests.gs can inject mocks.
 */

// ============================================================
// SERVICE ACCESSORS  (overridden by Tests.gs during unit tests)
// ============================================================

/* eslint-disable no-var */
var _driveApp     = function() { return DriveApp; };
var _propsService = function() { return PropertiesService; };
var _lockService  = function() { return LockService; };
var _urlFetch     = function() { return UrlFetchApp; };
var _contentSvc   = function() { return ContentService; };

// ============================================================
// CONFIGURATION
// ============================================================

var CONFIG = {
  VERSION:                      '1.0.0',
  ROOT_FOLDER_NAME:             'AppsScriptRecorder',
  RECORDINGS_FOLDER:            'recordings',
  AUTH_FOLDER:                  'auth',
  INDEX_FILE:                   'index.json',
  TEXT_INDEX_FILE:              'text_index.json',
  SETTINGS_FILE:                'settings.json',
  BROWSERS_FILE:                'browsers.json',
  LOCK_TIMEOUT_MS:              10000,
  OPENAI_TRANSCRIPTION_URL:     'https://api.openai.com/v1/audio/transcriptions',
  OPENAI_CHAT_URL:              'https://api.openai.com/v1/chat/completions',
  OPENAI_MODELS_URL:            'https://api.openai.com/v1/models',
  TITLE_MODEL:                  'gpt-4o-mini',
  MAX_PREVIEW_LENGTH:           200,
  MAX_TITLE_TRANSCRIPT_LENGTH:  500,
  BATCH_TITLE_TRANSCRIPT_LENGTH: 300,
  EXECUTION_TIMEOUT_BUFFER_MS:  30000
};

// ============================================================
// ENTRY POINTS
// ============================================================

function doGet(e) {
  try {
    var params = e.parameter || {};
    var action = params.action || '';
    var token  = params.token  || '';

    // Unauthenticated actions
    if (action === 'ping') {
      return _jsonResponse(makeResponse(_ping()));
    }
    if (action === 'checkAuth') {
      return _jsonResponse(makeResponse(checkAuth(token, params.fileId)));
    }

    // All other GET actions require a valid token
    if (!validateToken(token)) {
      return _jsonResponse(makeError('UNAUTHORIZED', 'Invalid or missing token'));
    }

    switch (action) {
      case 'getRecordings':
        return _jsonResponse(makeResponse(getRecordings(params.includeTextIndex === 'true')));
      case 'getAudio':
        return _jsonResponse(makeResponse(getAudio(params.id)));
      case 'getTranscript':
        return _jsonResponse(makeResponse(getTranscript(params.id)));
      case 'getRecordingData':
        return _jsonResponse(makeResponse(getRecordingData(params.id)));
      case 'getTextIndex':
        return _jsonResponse(makeResponse({ textIndex: getTextIndex() }));
      case 'getSettings':
        return _jsonResponse(makeResponse({ settings: getSettings() }));
      case 'getApiKeyStatus':
        return _jsonResponse(makeResponse(getApiKeyStatus()));
      default:
        return _jsonResponse(makeError('UNKNOWN_ACTION', 'Unknown action: ' + action));
    }
  } catch(err) {
    return _jsonResponse(_errorFromException(err));
  }
}

function doPost(e) {
  try {
    var params = e.parameter || {};
    var token  = params.token || '';
    var body   = JSON.parse(e.postData.contents);
    var action = body.action || '';

    // Unauthenticated actions
    if (action === 'requestAccess') {
      return _jsonResponse(makeResponse(requestAccess(body.nickname || 'My Browser')));
    }

    // All other POST actions require a valid token
    if (!validateToken(token)) {
      return _jsonResponse(makeError('UNAUTHORIZED', 'Invalid or missing token'));
    }

    switch (action) {
      case 'revokeAccess':
        return _jsonResponse(makeResponse(revokeAccess(token, body.revokeToken)));
      case 'uploadRecording':
        return _jsonResponse(makeResponse(uploadRecording(body.recording)));
      case 'deleteRecording':
        return _jsonResponse(makeResponse(deleteRecording(body.id)));
      case 'transcribe':
        return _jsonResponse(makeResponse({ transcript: transcribeRecording(body.id) }));
      case 'saveTranscript':
        return _jsonResponse(makeResponse(saveTranscript(body.id, body.transcript)));
      case 'generateTitle':
        return _jsonResponse(makeResponse(generateTitle(body.id)));
      case 'batchGenerateTitles':
        return _jsonResponse(makeResponse(batchGenerateTitles(body.ids)));
      case 'updateTitle':
        return _jsonResponse(makeResponse(updateTitle(body.id, body.title)));
      case 'saveSettings':
        return _jsonResponse(makeResponse(saveSettings(body.settings)));
      case 'saveApiKey':
        return _jsonResponse(makeResponse(saveApiKey(body.apiKey)));
      case 'rebuildIndex':
        return _jsonResponse(makeResponse(rebuildIndex()));
      case 'backfillTextIndex':
        return _jsonResponse(makeResponse(backfillTextIndex()));
      default:
        return _jsonResponse(makeError('UNKNOWN_ACTION', 'Unknown action: ' + action));
    }
  } catch(err) {
    return _jsonResponse(_errorFromException(err));
  }
}

function _jsonResponse(obj) {
  return _contentSvc()
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(_contentSvc().MimeType.JSON);
}

function _errorFromException(err) {
  // Known error codes thrown as "CODE: message"
  var msg = err.message || String(err);
  var match = msg.match(/^([A-Z_]+):\s*(.*)/);
  if (match) return makeError(match[1], match[2]);
  return makeError('INTERNAL_ERROR', msg);
}

// ============================================================
// AUTHENTICATION
// ============================================================

/**
 * Initiate the star-to-authorize flow.
 * Creates auth/<token>.json in Drive and returns metadata.
 */
function requestAccess(nickname) {
  var token      = generateToken();
  var authFolder = getAuthFolder();
  var fileName   = 'auth_' + token + '.json';
  var content    = JSON.stringify({
    token:    token,
    nickname: nickname,
    created:  new Date().toISOString(),
    status:   'pending'
  });
  var file = authFolder.createFile(fileName, content, 'application/json');
  return {
    token:     token,
    fileId:    file.getId(),
    fileName:  fileName,
    folderUrl: getAppFolder().getUrl()
  };
}

/**
 * Poll for authorization: checks if the auth file has been starred.
 * On first starred check: adds token to browsers.json.
 */
function checkAuth(token, fileId) {
  if (!token || !fileId) return { authorized: false };
  var file;
  try {
    file = _driveApp().getFileById(fileId);
  } catch(e) {
    return { authorized: false };
  }
  if (!file.isStarred()) return { authorized: false };

  // Add to browsers.json
  _updateBrowsers(function(data) {
    var exists = data.browsers.filter(function(b) { return b.token === token; }).length > 0;
    if (!exists) {
      data.browsers.push({
        token:        token,
        nickname:     _nickNameFromAuthFile(file),
        authorizedAt: new Date().toISOString(),
        lastSeen:     new Date().toISOString(),
        status:       'active'
      });
    }
    return data;
  });

  return { authorized: true };
}

function _nickNameFromAuthFile(file) {
  try {
    var content = JSON.parse(file.getBlob().getDataAsString());
    return content.nickname || 'Unknown';
  } catch(e) {
    return 'Unknown';
  }
}

/**
 * Check browsers.json for an active token.
 * Also updates lastSeen if valid.
 */
function validateToken(token) {
  if (!token) return false;
  var data = _readBrowsers();
  var found = data.browsers.filter(function(b) {
    return b.token === token && b.status === 'active';
  });
  if (found.length === 0) return false;

  // Update lastSeen in background (best-effort, no lock needed for non-critical update)
  try {
    _updateBrowsers(function(d) {
      d.browsers.forEach(function(b) {
        if (b.token === token) b.lastSeen = new Date().toISOString();
      });
      return d;
    });
  } catch(e) { /* non-critical */ }
  return true;
}

/**
 * Revoke a browser's access. Idempotent.
 */
function revokeAccess(callerToken, revokeToken) {
  _updateBrowsers(function(data) {
    data.browsers.forEach(function(b) {
      if (b.token === revokeToken) b.status = 'revoked';
    });
    return data;
  });
  return { revoked: true };
}

function _readBrowsers() {
  var folder = getAppFolder();
  var files  = folder.getFilesByName(CONFIG.BROWSERS_FILE);
  if (!files.hasNext()) return { browsers: [] };
  return JSON.parse(files.next().getBlob().getDataAsString());
}

function _updateBrowsers(fn) {
  var lock = _lockService().getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    var folder = getAppFolder();
    var files  = folder.getFilesByName(CONFIG.BROWSERS_FILE);
    var data   = files.hasNext()
      ? JSON.parse(files.next().getBlob().getDataAsString())
      : { browsers: [] };
    data = fn(data);
    writeJsonFile(folder, CONFIG.BROWSERS_FILE, data);
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// RECORDINGS
// ============================================================

function uploadRecording(recording) {
  if (!recording) throw new Error('INVALID_REQUEST: Missing recording payload');
  var ts = recording.clientTimestamp;
  var id = 'rec_' + ts;

  // Idempotency check
  var existing = _findRecordingInIndex(id);
  if (existing) return { recording: existing, isDuplicate: true };

  // Store audio in Drive as base64 text (avoids binary Blob complexity;
  // files remain accessible via getAudio which returns base64 to the browser).
  var ext       = _mimeToExt(recording.mimeType);
  var date      = new Date(ts);
  var baseName  = 'rec_' + formatTimestamp(ts);
  var audioName = baseName + '.' + ext;

  var dateFolder = getDateFolder(date);
  var audioFile  = dateFolder.createFile(audioName, recording.audioBase64, recording.mimeType);

  var entry = {
    id:                  id,
    date:                date.toISOString(),
    duration:            recording.duration || 0,
    mimeType:            recording.mimeType,
    fileSize:            audioFile.getSize(),
    location:            recording.location || null,
    title:               null,
    preview:             null,
    transcriptionSource: null,
    transcriptionModel:  null,
    hasTranscript:       false,
    audioFileId:         audioFile.getId(),
    transcriptFileId:    null
  };

  _updateIndex(function(index) {
    index.recordings.unshift(entry);
    return index;
  });

  return { recording: entry, isDuplicate: false };
}

function getRecordings(includeTextIndex) {
  var index = _readIndex();
  var result = {
    recordings: index.recordings,
    textIndex:  null
  };
  if (includeTextIndex) {
    result.textIndex = getTextIndex();
  }
  return result;
}

function getAudio(id) {
  var rec = _findRecordingInIndex(id);
  if (!rec) throw new Error('RECORDING_NOT_FOUND: ' + id);
  var file = _driveApp().getFileById(rec.audioFileId);
  // Audio is stored as base64 text, so getDataAsString() returns the base64 directly.
  var audioBase64 = file.getBlob().getDataAsString();
  return { id: id, audioBase64: audioBase64, mimeType: rec.mimeType };
}

function getTranscript(id) {
  var rec = _findRecordingInIndex(id);
  if (!rec) throw new Error('RECORDING_NOT_FOUND: ' + id);
  if (!rec.transcriptFileId) return { id: id, transcript: null };
  var data = readJsonFile(rec.transcriptFileId);
  return { id: id, transcript: data };
}

function getRecordingData(id) {
  var audioResult      = getAudio(id);
  var transcriptResult = getTranscript(id);
  return {
    id:          id,
    audioBase64: audioResult.audioBase64,
    mimeType:    audioResult.mimeType,
    transcript:  transcriptResult.transcript
  };
}

function deleteRecording(id) {
  var rec = _findRecordingInIndex(id);
  if (!rec) return { deleted: true }; // already gone — idempotent

  // Remove audio file
  try { _driveApp().getFileById(rec.audioFileId).setTrashed(true); } catch(e) {}

  // Remove transcript file
  if (rec.transcriptFileId) {
    try { _driveApp().getFileById(rec.transcriptFileId).setTrashed(true); } catch(e) {}
  }

  // Remove from index.json
  _updateIndex(function(index) {
    index.recordings = index.recordings.filter(function(r) { return r.id !== id; });
    return index;
  });

  // Remove from text_index.json
  _updateTextIndex(function(ti) {
    delete ti.entries[id];
    return ti;
  });

  return { deleted: true };
}

// ============================================================
// TRANSCRIPTION
// ============================================================

function transcribeRecording(id) {
  var apiKey = _propsService().getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('API_KEY_MISSING: No OpenAI API key configured');

  var rec = _findRecordingInIndex(id);
  if (!rec) throw new Error('RECORDING_NOT_FOUND: ' + id);

  var audioFile = _driveApp().getFileById(rec.audioFileId);
  var response  = callWhisperApi(audioFile.getBlob(), rec.mimeType, apiKey);

  // Build transcript object
  var transcript = {
    text:      response.text,
    segments:  (response.segments || []).map(function(s) {
      return { start: s.start, end: s.end, text: s.text };
    }),
    source:    'openai',
    model:     'whisper-1',
    createdAt: new Date().toISOString()
  };

  // Save transcript file alongside audio
  var date     = new Date(rec.date);
  var baseName = 'rec_' + formatTimestamp(date.getTime());
  var dateFolder   = getDateFolder(date);
  var transcriptFile = writeJsonFile(dateFolder, baseName + '.json', transcript);

  // Update index
  _updateIndex(function(index) {
    index.recordings.forEach(function(r) {
      if (r.id === id) {
        r.hasTranscript       = true;
        r.transcriptionSource = 'openai';
        r.transcriptionModel  = 'whisper-1';
        r.preview             = transcript.text.substring(0, CONFIG.MAX_PREVIEW_LENGTH);
        r.transcriptFileId    = transcriptFile.getId();
      }
    });
    return index;
  });

  // Update text index
  _updateTextIndex(function(ti) {
    ti.entries[id] = { text: transcript.text, segments: transcript.segments };
    return ti;
  });

  return transcript;
}

function saveTranscript(id, transcript) {
  var rec = _findRecordingInIndex(id);
  if (!rec) throw new Error('RECORDING_NOT_FOUND: ' + id);

  var date       = new Date(rec.date);
  var baseName   = 'rec_' + formatTimestamp(date.getTime());
  var dateFolder = getDateFolder(date);

  var fileContent = {
    text:      transcript.text,
    segments:  transcript.segments || [],
    source:    transcript.source,
    model:     transcript.model,
    createdAt: new Date().toISOString()
  };
  var transcriptFile = writeJsonFile(dateFolder, baseName + '.json', fileContent);

  // Update index
  _updateIndex(function(index) {
    index.recordings.forEach(function(r) {
      if (r.id === id) {
        r.hasTranscript       = true;
        r.transcriptionSource = transcript.source;
        r.transcriptionModel  = transcript.model;
        r.preview             = transcript.text.substring(0, CONFIG.MAX_PREVIEW_LENGTH);
        r.transcriptFileId    = transcriptFile.getId();
      }
    });
    return index;
  });

  // Update text index
  _updateTextIndex(function(ti) {
    ti.entries[id] = { text: transcript.text, segments: transcript.segments || [] };
    return ti;
  });

  return { saved: true };
}

function callWhisperApi(audioBlob, mimeType, apiKey) {
  var options = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + apiKey },
    payload: {
      file:                   audioBlob,
      model:                  'whisper-1',
      response_format:        'verbose_json',
      timestamp_granularities: ['segment']
    },
    muteHttpExceptions: true
  };
  var resp = _urlFetch().fetch(CONFIG.OPENAI_TRANSCRIPTION_URL, options);
  if (resp.getResponseCode() !== 200) {
    throw new Error('TRANSCRIPTION_FAILED: OpenAI returned ' + resp.getResponseCode() + ': ' + resp.getContentText());
  }
  return JSON.parse(resp.getContentText());
}

// ============================================================
// TITLES
// ============================================================

function generateTitle(id) {
  var apiKey = _propsService().getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) return { id: id, title: null }; // non-critical

  var ti = getTextIndex();
  var entry = ti.entries[id];
  if (!entry || !entry.text) return { id: id, title: null };

  try {
    var prompt  = entry.text.substring(0, CONFIG.MAX_TITLE_TRANSCRIPT_LENGTH);
    var options = {
      method:    'post',
      headers:   { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      payload:   JSON.stringify({
        model:      CONFIG.TITLE_MODEL,
        messages:   [
          { role: 'system', content: 'Generate a 2-4 word title for this voice memo. Return ONLY the title.' },
          { role: 'user',   content: prompt }
        ],
        max_tokens:  20,
        temperature: 0.3
      }),
      muteHttpExceptions: true
    };
    var resp = _urlFetch().fetch(CONFIG.OPENAI_CHAT_URL, options);
    if (resp.getResponseCode() !== 200) return { id: id, title: null };

    var data  = JSON.parse(resp.getContentText());
    var title = (data.choices[0].message.content || '').trim();
    if (!title) return { id: id, title: null };

    _updateIndex(function(index) {
      index.recordings.forEach(function(r) { if (r.id === id) r.title = title; });
      return index;
    });

    return { id: id, title: title };
  } catch(e) {
    return { id: id, title: null }; // non-critical
  }
}

function batchGenerateTitles(ids) {
  if (!ids || ids.length === 0) return { titles: [] };

  var apiKey = _propsService().getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) return { titles: ids.map(function(id) { return { id: id, title: null }; }) };

  var ti = getTextIndex();

  // Build prompt entries for IDs that have transcripts
  var entries = ids.map(function(id, i) {
    var entry = ti.entries[id];
    return entry && entry.text
      ? (i + 1) + '. ID: ' + id + '\nTranscript: ' + entry.text.substring(0, CONFIG.BATCH_TITLE_TRANSCRIPT_LENGTH)
      : null;
  }).filter(Boolean);

  if (entries.length === 0) return { titles: ids.map(function(id) { return { id: id, title: null }; }) };

  var prompt = 'Generate a 2-4 word title for each of these voice memo transcripts.\n' +
    'Return a JSON array of objects with "id" and "title" fields.\n\n' +
    entries.join('\n\n');

  try {
    var options = {
      method:  'post',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        model:       CONFIG.TITLE_MODEL,
        messages:    [
          { role: 'system', content: 'You generate short titles for voice memos. Return only a JSON array.' },
          { role: 'user',   content: prompt }
        ],
        max_tokens:  200,
        temperature: 0.3
      }),
      muteHttpExceptions: true
    };
    var resp = _urlFetch().fetch(CONFIG.OPENAI_CHAT_URL, options);
    if (resp.getResponseCode() !== 200) {
      return { titles: ids.map(function(id) { return { id: id, title: null }; }) };
    }

    var data    = JSON.parse(resp.getContentText());
    var content = data.choices[0].message.content.trim();
    // Extract JSON array from response (may be wrapped in markdown)
    var jsonMatch = content.match(/\[[\s\S]*\]/);
    var titles  = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);

    // Save all titles to index in one pass
    var titleMap = {};
    titles.forEach(function(t) { if (t.id && t.title) titleMap[t.id] = t.title; });
    _updateIndex(function(index) {
      index.recordings.forEach(function(r) {
        if (titleMap[r.id]) r.title = titleMap[r.id];
      });
      return index;
    });

    return { titles: titles };
  } catch(e) {
    return { titles: ids.map(function(id) { return { id: id, title: null }; }) };
  }
}

function updateTitle(id, title) {
  _updateIndex(function(index) {
    index.recordings.forEach(function(r) { if (r.id === id) r.title = title; });
    return index;
  });
  return { updated: true };
}

// ============================================================
// SETTINGS
// ============================================================

var DEFAULT_SETTINGS = {
  transcriptionMode: 'openai_first',
  autoUpgrade:       false,
  onDeviceModel:     'tiny',
  updatedAt:         null
};

function getSettings() {
  var folder = getAppFolder();
  var files  = folder.getFilesByName(CONFIG.SETTINGS_FILE);
  if (!files.hasNext()) return _copyDefaults();
  try {
    var data = JSON.parse(files.next().getBlob().getDataAsString());
    return _mergeDefaults(data);
  } catch(e) {
    return _copyDefaults();
  }
}

function saveSettings(settings) {
  var lock = _lockService().getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    var folder   = getAppFolder();
    var existing = getSettings();

    // Stale-write protection: if incoming updatedAt is older than what we have, ignore
    var incomingAt = settings._updatedAt || settings.updatedAt || null;
    if (existing.updatedAt && incomingAt) {
      if (new Date(incomingAt) < new Date(existing.updatedAt)) {
        return { saved: false, settings: existing };
      }
    }

    var merged = {
      transcriptionMode: settings.transcriptionMode || existing.transcriptionMode,
      autoUpgrade:       settings.autoUpgrade !== undefined ? settings.autoUpgrade : existing.autoUpgrade,
      onDeviceModel:     settings.onDeviceModel || existing.onDeviceModel,
      updatedAt:         new Date().toISOString()
    };
    writeJsonFile(folder, CONFIG.SETTINGS_FILE, merged);
    return { saved: true, settings: merged };
  } finally {
    lock.releaseLock();
  }
}

function getApiKeyStatus() {
  var key = _propsService().getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!key) return { configured: false, valid: false };

  // Test the key with a lightweight models call
  try {
    var resp = _urlFetch().fetch(CONFIG.OPENAI_MODELS_URL, {
      method:             'get',
      headers:            { 'Authorization': 'Bearer ' + key },
      muteHttpExceptions: true
    });
    var valid = resp.getResponseCode() === 200;
    return { configured: true, valid: valid };
  } catch(e) {
    return { configured: true, valid: false };
  }
}

function saveApiKey(apiKey) {
  // Validate before storing
  var resp = _urlFetch().fetch(CONFIG.OPENAI_MODELS_URL, {
    method:             'get',
    headers:            { 'Authorization': 'Bearer ' + apiKey },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('API_KEY_INVALID: OpenAI rejected the key');
  }
  _propsService().getScriptProperties().setProperty('OPENAI_API_KEY', apiKey);
  return { valid: true, saved: true };
}

function _copyDefaults() {
  var out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function(k) { out[k] = DEFAULT_SETTINGS[k]; });
  return out;
}

function _mergeDefaults(data) {
  var out = _copyDefaults();
  Object.keys(data).forEach(function(k) { out[k] = data[k]; });
  return out;
}

// ============================================================
// INDEX MANAGEMENT
// ============================================================

function getTextIndex() {
  var folder = getAppFolder();
  var files  = folder.getFilesByName(CONFIG.TEXT_INDEX_FILE);
  if (!files.hasNext()) return { version: 1, updatedAt: null, entries: {} };
  try {
    return JSON.parse(files.next().getBlob().getDataAsString());
  } catch(e) {
    return { version: 1, updatedAt: null, entries: {} };
  }
}

function rebuildIndex() {
  var recFolder = getRecordingsFolder();
  var newIndex  = { version: 1, updatedAt: new Date().toISOString(), recordings: [] };
  var newTi     = { version: 1, updatedAt: new Date().toISOString(), entries: {} };

  _scanFolder(recFolder, newIndex, newTi);

  // Sort newest first
  newIndex.recordings.sort(function(a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  var appFolder = getAppFolder();
  writeJsonFile(appFolder, CONFIG.INDEX_FILE,      newIndex);
  writeJsonFile(appFolder, CONFIG.TEXT_INDEX_FILE, newTi);

  return {
    recordingsFound:  newIndex.recordings.length,
    transcriptsFound: newIndex.recordings.filter(function(r) { return r.hasTranscript; }).length,
    rebuilt:          true
  };
}

function _scanFolder(folder, newIndex, newTi) {
  // Scan files for audio files
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    if (_isAudioFile(name)) {
      var entry = _buildEntryFromFile(file, folder);
      if (entry) {
        // Look for companion transcript
        var transcriptName = name.replace(/\.(mp4|webm)$/, '.json');
        var tjFiles = folder.getFilesByName(transcriptName);
        if (tjFiles.hasNext()) {
          var tjFile = tjFiles.next();
          entry.transcriptFileId = tjFile.getId();
          entry.hasTranscript    = true;
          try {
            var tj = JSON.parse(tjFile.getBlob().getDataAsString());
            entry.transcriptionSource = tj.source || null;
            entry.transcriptionModel  = tj.model  || null;
            entry.preview             = (tj.text || '').substring(0, CONFIG.MAX_PREVIEW_LENGTH);
            newTi.entries[entry.id]   = { text: tj.text || '', segments: tj.segments || [] };
          } catch(e) {}
        }
        newIndex.recordings.push(entry);
      }
    }
  }
  // Recurse into subfolders
  var subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    _scanFolder(subfolders.next(), newIndex, newTi);
  }
}

function _isAudioFile(name) {
  return /\.(mp4|webm)$/i.test(name);
}

function _buildEntryFromFile(file, folder) {
  var name  = file.getName();
  var match = name.match(/^rec_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.(mp4|webm)$/i);
  if (!match) return null;
  var dateStr  = match[1].replace(/_/, 'T').replace(/-(\d{2})-(\d{2})$/, ':$1:$2');
  var date     = new Date(dateStr);
  var ts       = isNaN(date.getTime()) ? Date.now() : date.getTime();
  var mimeType = match[2].toLowerCase() === 'mp4' ? 'audio/mp4' : 'audio/webm';
  return {
    id:                  'rec_' + ts,
    date:                date.toISOString(),
    duration:            0,
    mimeType:            mimeType,
    fileSize:            file.getSize(),
    location:            null,
    title:               null,
    preview:             null,
    transcriptionSource: null,
    transcriptionModel:  null,
    hasTranscript:       false,
    audioFileId:         file.getId(),
    transcriptFileId:    null
  };
}

function backfillTextIndex() {
  var index  = _readIndex();
  var ti     = getTextIndex();
  var count  = 0;

  index.recordings.forEach(function(rec) {
    if (!rec.hasTranscript || !rec.transcriptFileId) return;
    if (ti.entries[rec.id]) return; // already present

    try {
      var tj = readJsonFile(rec.transcriptFileId);
      if (tj && tj.text) {
        ti.entries[rec.id] = { text: tj.text, segments: tj.segments || [] };
        count++;
      }
    } catch(e) {}
  });

  if (count > 0) {
    ti.updatedAt = new Date().toISOString();
    writeJsonFile(getAppFolder(), CONFIG.TEXT_INDEX_FILE, ti);
  }

  return { backfilled: count };
}

// ============================================================
// INTERNAL INDEX READ/WRITE HELPERS
// ============================================================

function _readIndex() {
  var folder = getAppFolder();
  var files  = folder.getFilesByName(CONFIG.INDEX_FILE);
  if (!files.hasNext()) return { version: 1, updatedAt: null, recordings: [] };
  try {
    return JSON.parse(files.next().getBlob().getDataAsString());
  } catch(e) {
    return { version: 1, updatedAt: null, recordings: [] };
  }
}

function _updateIndex(fn) {
  var lock = _lockService().getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    var index = _readIndex();
    index = fn(index);
    index.updatedAt = new Date().toISOString();
    writeJsonFile(getAppFolder(), CONFIG.INDEX_FILE, index);
    return index;
  } finally {
    lock.releaseLock();
  }
}

function _updateTextIndex(fn) {
  var lock = _lockService().getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    var ti = getTextIndex();
    ti = fn(ti);
    ti.updatedAt = new Date().toISOString();
    writeJsonFile(getAppFolder(), CONFIG.TEXT_INDEX_FILE, ti);
    return ti;
  } finally {
    lock.releaseLock();
  }
}

function _findRecordingInIndex(id) {
  var index = _readIndex();
  var found = index.recordings.filter(function(r) { return r.id === id; });
  return found.length > 0 ? found[0] : null;
}

// ============================================================
// DRIVE HELPERS
// ============================================================

function getOrCreateFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getAppFolder() {
  return getOrCreateFolder(_driveApp().getRootFolder(), CONFIG.ROOT_FOLDER_NAME);
}

function getRecordingsFolder() {
  return getOrCreateFolder(getAppFolder(), CONFIG.RECORDINGS_FOLDER);
}

function getAuthFolder() {
  return getOrCreateFolder(getAppFolder(), CONFIG.AUTH_FOLDER);
}

function getDateFolder(date) {
  var yyyy = date.getFullYear().toString();
  var mm   = _pad2(date.getMonth() + 1);
  var dd   = _pad2(date.getDate());
  var rec  = getRecordingsFolder();
  var yr   = getOrCreateFolder(rec, yyyy);
  var mo   = getOrCreateFolder(yr,  mm);
  return getOrCreateFolder(mo, dd);
}

function readJsonFile(fileId) {
  try {
    var file = _driveApp().getFileById(fileId);
    return JSON.parse(file.getBlob().getDataAsString());
  } catch(e) {
    return null;
  }
}

function writeJsonFile(folder, name, data) {
  var content = JSON.stringify(data);
  var it      = folder.getFilesByName(name);
  if (it.hasNext()) {
    var file = it.next();
    file.setContent(content);
    return file;
  }
  return folder.createFile(name, content, 'application/json');
}

// ============================================================
// UTILITIES
// ============================================================

function generateToken() {
  var bytes = [];
  for (var i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
  return bytes.map(function(b) { return ('0' + b.toString(16)).slice(-2); }).join('');
}

/**
 * Format a ms-since-epoch timestamp as YYYY-MM-DD_HH-MM-SS (local time).
 * GAS runs in the script owner's timezone. For consistent naming we use UTC.
 */
function formatTimestamp(ms) {
  var d    = new Date(ms);
  var yyyy = d.getUTCFullYear();
  var MM   = _pad2(d.getUTCMonth() + 1);
  var dd   = _pad2(d.getUTCDate());
  var HH   = _pad2(d.getUTCHours());
  var mm   = _pad2(d.getUTCMinutes());
  var ss   = _pad2(d.getUTCSeconds());
  return yyyy + '-' + MM + '-' + dd + '_' + HH + '-' + mm + '-' + ss;
}

function makeResponse(data) {
  return { success: true, version: CONFIG.VERSION, data: data };
}

function makeError(code, message) {
  return { success: false, version: CONFIG.VERSION, error: { code: code, message: message } };
}

function _ping() {
  var key = _propsService().getScriptProperties().getProperty('OPENAI_API_KEY');
  return { status: 'ok', hasApiKey: !!key };
}

function _pad2(n) { return n < 10 ? '0' + n : String(n); }

function _mimeToExt(mimeType) {
  if (mimeType === 'audio/mp4' || mimeType === 'audio/mpeg') return 'mp4';
  if (mimeType === 'audio/webm') return 'webm';
  return 'mp4';
}

