/**
 * Tests.gs — GAS-native unit test suite for Code.gs
 *
 * Run from the GAS editor: execute runAllTests() and read Logger output.
 *
 * Pattern: before each test, install mock services via the _svc overrides
 * exposed by Code.gs; after the test, restore them.
 *
 * ============================================================
 * 1. MINI TEST FRAMEWORK
 * ============================================================
 */

var _testResults = [];

function _assert(condition, message) {
  if (!condition) throw new Error('Assert failed: ' + (message || 'condition is falsy'));
}

function _assertEqual(actual, expected, label) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((label ? label + ' — ' : '') +
      'Expected ' + e + ' but got ' + a);
  }
}

function _assertDeepContains(obj, keys, label) {
  keys.forEach(function(k) {
    if (!(k in obj)) throw new Error((label || '') + ': missing key "' + k + '"');
  });
}

function _assertThrows(fn, expectedCode, label) {
  var threw = false;
  var err = null;
  try { fn(); } catch(e) { threw = true; err = e; }
  if (!threw) throw new Error((label || 'Expected throw') + ': no error thrown');
  if (expectedCode && err.message.indexOf(expectedCode) === -1) {
    throw new Error((label || '') + ': expected error containing "' + expectedCode +
      '" but got "' + err.message + '"');
  }
}

function _runTest(name, fn) {
  try {
    fn();
    _testResults.push({ name: name, passed: true });
    Logger.log('  ✓  ' + name);
  } catch(e) {
    _testResults.push({ name: name, passed: false, error: e.message });
    Logger.log('  ✗  ' + name);
    Logger.log('       ' + e.message);
  }
}

function _runSuite(suiteName, tests) {
  Logger.log('\n── ' + suiteName + ' ──');
  tests.forEach(function(t) { _runTest(t.name, t.fn); });
}

function _summarize() {
  var passed = _testResults.filter(function(r) { return r.passed; }).length;
  var failed = _testResults.length - passed;
  Logger.log('\n══════════════════════════════════════');
  Logger.log('  RESULTS: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log('══════════════════════════════════════');
  if (failed > 0) {
    Logger.log('  Failures:');
    _testResults.filter(function(r) { return !r.passed; }).forEach(function(r) {
      Logger.log('    ✗ ' + r.name + ': ' + r.error);
    });
  }
}

/**
 * ============================================================
 * 2. MOCK INFRASTRUCTURE
 * ============================================================
 */

// ── 2a. Mock Drive ────────────────────────────────────────────

function _makeMockDrive() {
  var _files = {};
  var _folders = {};
  var _nextId = 1;

  function newId() { return 'id_' + (_nextId++); }

  function makeIterator(items) {
    var i = 0;
    return {
      hasNext: function() { return i < items.length; },
      next:    function() { return items[i++]; }
    };
  }

  function MockBlob(content) {
    this._content = content || '';
  }
  MockBlob.prototype.getDataAsString = function() { return this._content; };
  MockBlob.prototype.getBytes = function() {
    var c = this._content;
    var bytes = [];
    for (var i = 0; i < c.length; i++) bytes.push(c.charCodeAt(i));
    return bytes;
  };
  MockBlob.prototype.setContentType = function() { return this; };
  MockBlob.prototype.getContentType  = function() { return 'text/plain'; };
  MockBlob.prototype.getName = function() { return ''; };
  MockBlob.prototype.setName = function() { return this; };

  function MockFile(id, name, content, mimeType, parentId) {
    this.id       = id;
    this.name     = name;
    this.content  = content || '';
    this.mimeType = mimeType || 'text/plain';
    this.parentId = parentId;
    this.starred  = false;
    this.trashed  = false;
  }
  MockFile.prototype.getId         = function() { return this.id; };
  MockFile.prototype.getName       = function() { return this.name; };
  MockFile.prototype.getMimeType   = function() { return this.mimeType; };
  MockFile.prototype.getSize       = function() { return this.content.length; };
  MockFile.prototype.isStarred     = function() { return this.starred; };
  MockFile.prototype.setStarred    = function(v) { this.starred = v; return this; };
  MockFile.prototype.setTrashed    = function(v) { this.trashed = v; return this; };
  MockFile.prototype.setContent    = function(c) { this.content = c; return this; };
  MockFile.prototype.getBlob       = function() { return new MockBlob(this.content); };
  MockFile.prototype.getParents    = function() {
    var p = _folders[this.parentId];
    return makeIterator(p ? [p] : []);
  };

  function MockFolder(id, name, parentId) {
    this.id       = id;
    this.name     = name;
    this.parentId = parentId;
    this._files   = {};   // fileId -> MockFile
    this._folders = {};   // folderId -> MockFolder
  }
  MockFolder.prototype.getId     = function() { return this.id; };
  MockFolder.prototype.getName   = function() { return this.name; };
  MockFolder.prototype.getUrl    = function() { return 'https://drive.google.com/drive/folders/' + this.id; };

  MockFolder.prototype.createFile = function(name, content, mimeType) {
    var id   = newId();
    var file = new MockFile(id, name, content, mimeType, this.id);
    this._files[id] = file;
    _files[id]      = file;
    return file;
  };

  MockFolder.prototype.createFolder = function(name) {
    var id     = newId();
    var folder = new MockFolder(id, name, this.id);
    this._folders[id] = folder;
    _folders[id]      = folder;
    return folder;
  };

  MockFolder.prototype.getFilesByName = function(name) {
    var items = Object.keys(this._files)
      .map(function(k) { return _files[k]; })
      .filter(function(f) { return f && f.name === name && !f.trashed; });
    return makeIterator(items);
  };

  MockFolder.prototype.getFoldersByName = function(name) {
    var items = Object.keys(this._folders)
      .map(function(k) { return _folders[k]; })
      .filter(function(f) { return f && f.name === name; });
    return makeIterator(items);
  };

  MockFolder.prototype.getFiles = function() {
    var items = Object.keys(this._files)
      .map(function(k) { return _files[k]; })
      .filter(function(f) { return f && !f.trashed; });
    return makeIterator(items);
  };

  MockFolder.prototype.getFolders = function() {
    var items = Object.keys(this._folders)
      .map(function(k) { return _folders[k]; });
    return makeIterator(items);
  };

  var rootFolder = new MockFolder(newId(), 'Root', null);
  _folders[rootFolder.id] = rootFolder;

  return {
    getRootFolder: function()   { return rootFolder; },
    getFileById:   function(id) {
      var f = _files[id];
      if (!f) throw new Error('File not found: ' + id);
      return f;
    },
    getFolderById: function(id) {
      var f = _folders[id];
      if (!f) throw new Error('Folder not found: ' + id);
      return f;
    },
    // Test helper
    _files:   _files,
    _folders: _folders
  };
}

// ── 2b. Mock PropertiesService ────────────────────────────────

function _makeMockPropsService() {
  var _store = {};
  var scriptProps = {
    getProperty:    function(k)    { return _store[k] !== undefined ? _store[k] : null; },
    setProperty:    function(k, v) { _store[k] = v; return this; },
    deleteProperty: function(k)    { delete _store[k]; return this; },
    getProperties:  function()     {
      var out = {};
      Object.keys(_store).forEach(function(k) { out[k] = _store[k]; });
      return out;
    },
    _store: _store
  };
  return { getScriptProperties: function() { return scriptProps; } };
}

// ── 2c. Mock LockService ─────────────────────────────────────

function _makeMockLockService(shouldFail) {
  var _held = false;
  var lock = {
    waitLock: function(timeout) {
      if (shouldFail) throw new Error('Lock timeout');
      _held = true;
    },
    tryLock:     function()  { _held = true; return true; },
    releaseLock: function()  { _held = false; },
    hasLock:     function()  { return _held; }
  };
  return { getScriptLock: function() { return lock; }, _lock: lock };
}

// ── 2d. Mock UrlFetchApp ──────────────────────────────────────

function _makeMockUrlFetch(responses) {
  // responses: array of {url (optional), code, body} in FIFO order
  var _calls = [];
  var _queue = responses ? responses.slice() : [];
  return {
    fetch: function(url, options) {
      _calls.push({ url: url, options: options });
      var resp = _queue.shift() || { code: 200, body: '{}' };
      return {
        getResponseCode:  function() { return resp.code; },
        getContentText:   function() { return resp.body; }
      };
    },
    _calls: _calls
  };
}

// ── 2e. Mock ContentService ───────────────────────────────────

var _mockContentService = {
  MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
  createTextOutput: function(content) {
    var _content = content;
    var _mime    = '';
    return {
      setMimeType: function(m) { _mime = m; return this; },
      getContent:  function()  { return _content; },
      getMimeType: function()  { return _mime; }
    };
  }
};

// ── 2f. Test setup/teardown ───────────────────────────────────

function _installMocks(opts) {
  opts = opts || {};
  var drive = opts.drive || _makeMockDrive();
  var props = opts.props || _makeMockPropsService();
  var lock  = opts.lock  || _makeMockLockService(false);
  var fetch = opts.fetch || _makeMockUrlFetch([]);

  _driveApp      = function() { return drive; };
  _propsService  = function() { return props; };
  _lockService   = function() { return lock; };
  _urlFetch      = function() { return fetch; };
  _contentSvc    = function() { return _mockContentService; };

  return { drive: drive, props: props, lock: lock, fetch: fetch };
}

function _restoreMocks() {
  _driveApp     = function() { return DriveApp; };
  _propsService = function() { return PropertiesService; };
  _lockService  = function() { return LockService; };
  _urlFetch     = function() { return UrlFetchApp; };
  _contentSvc   = function() { return ContentService; };
}

/**
 * ============================================================
 * 3. TEST SUITES
 * ============================================================
 */

// ── 3a. Utility tests ─────────────────────────────────────────

var SUITE_UTILS = {
  name: 'Utilities',
  tests: [
    {
      name: 'generateToken returns 32-char lowercase hex string',
      fn: function() {
        var tok = generateToken();
        _assert(typeof tok === 'string',    'is string');
        _assertEqual(tok.length, 32,        'length 32');
        _assert(/^[0-9a-f]{32}$/.test(tok), 'lowercase hex');
      }
    },
    {
      name: 'generateToken produces unique tokens',
      fn: function() {
        var a = generateToken(), b = generateToken();
        _assert(a !== b, 'tokens differ');
      }
    },
    {
      name: 'makeResponse wraps data with version and success:true',
      fn: function() {
        var r = makeResponse({ foo: 'bar' });
        _assertEqual(r.success, true);
        _assertEqual(r.version, CONFIG.VERSION);
        _assertEqual(r.data.foo, 'bar');
      }
    },
    {
      name: 'makeError wraps code and message with success:false',
      fn: function() {
        var r = makeError('SOME_CODE', 'something went wrong');
        _assertEqual(r.success, false);
        _assertEqual(r.version, CONFIG.VERSION);
        _assertEqual(r.error.code, 'SOME_CODE');
        _assertEqual(r.error.message, 'something went wrong');
      }
    },
    {
      name: 'formatTimestamp returns YYYY-MM-DD_HH-MM-SS string',
      fn: function() {
        var ts  = new Date('2026-04-05T10:30:00.000Z').getTime();
        var str = formatTimestamp(ts);
        _assert(typeof str === 'string', 'is string');
        _assert(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(str), 'matches pattern: ' + str);
      }
    }
  ]
};

// ── 3b. Drive helper tests ────────────────────────────────────

var SUITE_DRIVE = {
  name: 'Drive Helpers',
  tests: [
    {
      name: 'getOrCreateFolder creates a new subfolder when absent',
      fn: function() {
        var m = _installMocks();
        try {
          var root   = m.drive.getRootFolder();
          var folder = getOrCreateFolder(root, 'TestFolder');
          _assert(folder !== null, 'returned folder');
          _assertEqual(folder.getName(), 'TestFolder');
          // Second call returns same
          var same = getOrCreateFolder(root, 'TestFolder');
          _assertEqual(same.getId(), folder.getId(), 'same ID on second call');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getOrCreateFolder returns existing folder',
      fn: function() {
        var m = _installMocks();
        try {
          var root    = m.drive.getRootFolder();
          var created = root.createFolder('Existing');
          var got     = getOrCreateFolder(root, 'Existing');
          _assertEqual(got.getId(), created.getId());
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getAppFolder creates AppsScriptRecorder under root',
      fn: function() {
        var m = _installMocks();
        try {
          var folder = getAppFolder();
          _assertEqual(folder.getName(), CONFIG.ROOT_FOLDER_NAME);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'writeJsonFile creates file with JSON content',
      fn: function() {
        var m = _installMocks();
        try {
          var root   = m.drive.getRootFolder();
          var file   = writeJsonFile(root, 'test.json', { x: 1 });
          var parsed = JSON.parse(file.getBlob().getDataAsString());
          _assertEqual(parsed.x, 1);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'writeJsonFile overwrites existing file',
      fn: function() {
        var m = _installMocks();
        try {
          var root = m.drive.getRootFolder();
          writeJsonFile(root, 'test.json', { x: 1 });
          var file = writeJsonFile(root, 'test.json', { x: 2 });
          _assertEqual(JSON.parse(file.getBlob().getDataAsString()).x, 2);
          // Only one file with that name
          var count = 0;
          var it = root.getFilesByName('test.json');
          while (it.hasNext()) { it.next(); count++; }
          _assertEqual(count, 1, 'only one file');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'readJsonFile returns parsed object',
      fn: function() {
        var m = _installMocks();
        try {
          var root = m.drive.getRootFolder();
          var file = root.createFile('data.json', JSON.stringify({ a: 42 }), 'application/json');
          var data = readJsonFile(file.getId());
          _assertEqual(data.a, 42);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'readJsonFile returns null for non-existent file ID',
      fn: function() {
        _installMocks();
        try {
          var data = readJsonFile('nonexistent_id');
          _assertEqual(data, null);
        } finally { _restoreMocks(); }
      }
    }
  ]
};

// ── 3c. Authentication tests ──────────────────────────────────

var SUITE_AUTH = {
  name: 'Authentication',
  tests: [
    {
      name: 'requestAccess creates auth file and returns token + fileId',
      fn: function() {
        var m = _installMocks();
        try {
          var result = requestAccess('My iPhone');
          _assert(typeof result.token === 'string', 'has token');
          _assertEqual(result.token.length, 32, 'token is 32 chars');
          _assert(typeof result.fileId === 'string', 'has fileId');
          _assertEqual(result.fileName, 'auth_' + result.token + '.json', 'fileName matches');
          _assert(result.folderUrl.indexOf('drive.google.com') !== -1, 'folderUrl looks right');

          // Auth file should exist in Drive
          var authFile = m.drive.getFileById(result.fileId);
          var content  = JSON.parse(authFile.getBlob().getDataAsString());
          _assertEqual(content.token, result.token);
          _assertEqual(content.nickname, 'My iPhone');
          _assertEqual(content.status, 'pending');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'checkAuth returns authorized:false when file is not starred',
      fn: function() {
        var m = _installMocks();
        try {
          var req    = requestAccess('Test Browser');
          var result = checkAuth(req.token, req.fileId);
          _assertEqual(result.authorized, false);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'checkAuth returns authorized:true and adds token to browsers.json when starred',
      fn: function() {
        var m = _installMocks();
        try {
          var req  = requestAccess('Test Browser');
          // Star the auth file
          m.drive.getFileById(req.fileId).setStarred(true);

          var result = checkAuth(req.token, req.fileId);
          _assertEqual(result.authorized, true);

          // Token should now be in browsers.json
          _assertEqual(validateToken(req.token), true);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'validateToken returns false for unknown token',
      fn: function() {
        _installMocks();
        try {
          _assertEqual(validateToken('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'validateToken returns false for revoked token',
      fn: function() {
        var m = _installMocks();
        try {
          var req = requestAccess('Laptop');
          m.drive.getFileById(req.fileId).setStarred(true);
          checkAuth(req.token, req.fileId);   // authorize it
          revokeAccess(req.token, req.token);  // revoke it
          _assertEqual(validateToken(req.token), false);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'revokeAccess marks token as revoked',
      fn: function() {
        var m = _installMocks();
        try {
          var req = requestAccess('Browser');
          m.drive.getFileById(req.fileId).setStarred(true);
          checkAuth(req.token, req.fileId);

          var result = revokeAccess(req.token, req.token);
          _assertEqual(result.revoked, true);
          _assertEqual(validateToken(req.token), false);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'revokeAccess is idempotent (already revoked returns success)',
      fn: function() {
        var m = _installMocks();
        try {
          var req = requestAccess('Browser');
          m.drive.getFileById(req.fileId).setStarred(true);
          checkAuth(req.token, req.fileId);
          revokeAccess(req.token, req.token);
          var r2 = revokeAccess(req.token, req.token);  // already revoked
          _assertEqual(r2.revoked, true);
        } finally { _restoreMocks(); }
      }
    }
  ]
};

// ── 3d. Recordings tests ──────────────────────────────────────

function _makeRecordingPayload(overrides) {
  var defaults = {
    clientTimestamp: 1712345678901,
    audioBase64: 'SGVsbG8gV29ybGQ=',  // base64("Hello World")
    mimeType: 'audio/mp4',
    duration: 60,
    location: { lat: 37.7749, lng: -122.4194, label: 'San Francisco, CA, US' }
  };
  if (!overrides) return defaults;
  Object.keys(overrides).forEach(function(k) { defaults[k] = overrides[k]; });
  return defaults;
}

var SUITE_RECORDINGS = {
  name: 'Recordings',
  tests: [
    {
      name: 'uploadRecording saves audio file and returns recording metadata',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          var result  = uploadRecording(payload);

          _assert(result.recording !== undefined, 'has recording');
          _assertEqual(result.recording.id, 'rec_' + payload.clientTimestamp);
          _assertEqual(result.recording.mimeType, 'audio/mp4');
          _assertEqual(result.recording.duration, 60);
          _assertEqual(result.recording.hasTranscript, false);
          _assertEqual(result.isDuplicate, false);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'uploadRecording is idempotent: same clientTimestamp returns isDuplicate:true',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var r2 = uploadRecording(payload);
          _assertEqual(r2.isDuplicate, true);
          _assertEqual(r2.recording.id, 'rec_' + payload.clientTimestamp);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'uploadRecording creates date subfolders under recordings/',
      fn: function() {
        var m = _installMocks();
        try {
          var payload = _makeRecordingPayload({ clientTimestamp: new Date('2026-04-05T10:30:00Z').getTime() });
          uploadRecording(payload);

          // recordings/ should exist under root app folder
          var appFolder  = getAppFolder();
          var recIt      = appFolder.getFoldersByName(CONFIG.RECORDINGS_FOLDER);
          _assert(recIt.hasNext(), 'recordings/ folder exists');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'uploadRecording updates index.json',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var data = getRecordings(false);
          _assertEqual(data.recordings.length, 1);
          _assertEqual(data.recordings[0].id, 'rec_' + payload.clientTimestamp);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getRecordings returns empty array when no index',
      fn: function() {
        _installMocks();
        try {
          var data = getRecordings(false);
          _assertEqual(data.recordings.length, 0);
          _assertEqual(data.textIndex, null);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getRecordings with includeTextIndex returns textIndex field',
      fn: function() {
        _installMocks();
        try {
          var data = getRecordings(true);
          _assert(data.textIndex !== undefined, 'textIndex present');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getAudio returns base64-encoded audio for known recording',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var result = getAudio('rec_' + payload.clientTimestamp);
          _assert(typeof result.audioBase64 === 'string', 'has audioBase64');
          _assertEqual(result.mimeType, 'audio/mp4');
          _assertEqual(result.id, 'rec_' + payload.clientTimestamp);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getAudio throws RECORDING_NOT_FOUND for unknown id',
      fn: function() {
        _installMocks();
        try {
          _assertThrows(function() { getAudio('rec_9999999'); }, 'RECORDING_NOT_FOUND');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getTranscript returns null transcript when no transcript saved',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var result = getTranscript('rec_' + payload.clientTimestamp);
          _assertEqual(result.transcript, null);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getTranscript returns transcript after saveTranscript',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          var transcript = { text: 'Hello world', segments: [{ start: 0, end: 2, text: 'Hello world' }], source: 'local', model: 'whisper-tiny' };
          saveTranscript(id, transcript);
          var result = getTranscript(id);
          _assertEqual(result.transcript.text, 'Hello world');
          _assertEqual(result.transcript.source, 'local');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getRecordingData returns combined audio and transcript',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          var result = getRecordingData(id);
          _assert(typeof result.audioBase64 === 'string', 'has audio');
          _assert('transcript' in result, 'has transcript field');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'deleteRecording removes from index.json',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          var result = deleteRecording(id);
          _assertEqual(result.deleted, true);
          var data = getRecordings(false);
          _assertEqual(data.recordings.length, 0);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'deleteRecording is idempotent (already deleted returns success)',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          deleteRecording(id);
          var r2 = deleteRecording(id);
          _assertEqual(r2.deleted, true);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'deleteRecording removes entry from text_index.json',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id         = 'rec_' + payload.clientTimestamp;
          var transcript = { text: 'Test text', segments: [], source: 'local', model: 'tiny' };
          saveTranscript(id, transcript);
          deleteRecording(id);
          var ti = getTextIndex();
          _assertEqual(ti.entries[id], undefined);
        } finally { _restoreMocks(); }
      }
    }
  ]
};

// ── 3e. Transcription tests ───────────────────────────────────

var SUITE_TRANSCRIPTION = {
  name: 'Transcription',
  tests: [
    {
      name: 'saveTranscript saves transcript file and updates index hasTranscript',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          var transcript = { text: 'Test transcript', segments: [{ start: 0, end: 1, text: 'Test transcript' }], source: 'local', model: 'whisper-tiny' };
          saveTranscript(id, transcript);

          var recordings = getRecordings(false).recordings;
          var rec = recordings.filter(function(r) { return r.id === id; })[0];
          _assertEqual(rec.hasTranscript, true);
          _assertEqual(rec.transcriptionSource, 'local');
          _assert(rec.preview !== null, 'preview set');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'saveTranscript updates text_index.json',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          saveTranscript(id, { text: 'Hello there', segments: [], source: 'local', model: 'tiny' });
          var ti = getTextIndex();
          _assert(ti.entries[id] !== undefined, 'entry in text index');
          _assertEqual(ti.entries[id].text, 'Hello there');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'transcribeRecording throws API_KEY_MISSING when no key configured',
      fn: function() {
        _installMocks();
        try {
          _assertThrows(function() { transcribeRecording('rec_123'); }, 'API_KEY_MISSING');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'transcribeRecording throws RECORDING_NOT_FOUND for unknown id',
      fn: function() {
        var m = _installMocks();
        try {
          m.props.getScriptProperties().setProperty('OPENAI_API_KEY', 'sk-test');
          _assertThrows(function() { transcribeRecording('rec_nonexistent'); }, 'RECORDING_NOT_FOUND');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'transcribeRecording calls Whisper API and saves transcript',
      fn: function() {
        var whisperResponse = {
          text: 'Hello world.',
          segments: [{ start: 0, end: 2.5, text: 'Hello world.' }]
        };
        var m = _installMocks({
          fetch: _makeMockUrlFetch([
            { code: 200, body: JSON.stringify(whisperResponse) }
          ])
        });
        try {
          m.props.getScriptProperties().setProperty('OPENAI_API_KEY', 'sk-test');
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id     = 'rec_' + payload.clientTimestamp;
          var result = transcribeRecording(id);

          _assertEqual(result.transcript.text, 'Hello world.');
          _assertEqual(result.transcript.source, 'openai');

          // Verify saved to Drive
          var ti = getTextIndex();
          _assert(ti.entries[id] !== undefined, 'in text index');

          // Verify index updated
          var recs = getRecordings(false).recordings;
          var rec  = recs.filter(function(r) { return r.id === id; })[0];
          _assertEqual(rec.hasTranscript, true);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'transcribeRecording throws TRANSCRIPTION_FAILED on OpenAI error',
      fn: function() {
        var m = _installMocks({
          fetch: _makeMockUrlFetch([
            { code: 401, body: JSON.stringify({ error: { message: 'Invalid API key' } }) }
          ])
        });
        try {
          m.props.getScriptProperties().setProperty('OPENAI_API_KEY', 'sk-bad');
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          _assertThrows(function() { transcribeRecording(id); }, 'TRANSCRIPTION_FAILED');
        } finally { _restoreMocks(); }
      }
    }
  ]
};

// ── 3f. Title tests ───────────────────────────────────────────

var SUITE_TITLES = {
  name: 'Titles',
  tests: [
    {
      name: 'generateTitle returns null and does not throw on missing transcript',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var result = generateTitle('rec_' + payload.clientTimestamp);
          _assertEqual(result.title, null);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'generateTitle calls OpenAI Chat API and saves title to index',
      fn: function() {
        var chatResponse = {
          choices: [{ message: { content: 'Morning Standup Notes' } }]
        };
        var m = _installMocks({
          fetch: _makeMockUrlFetch([
            { code: 200, body: JSON.stringify(chatResponse) }
          ])
        });
        try {
          m.props.getScriptProperties().setProperty('OPENAI_API_KEY', 'sk-test');
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          saveTranscript(id, { text: 'Good morning everyone...', segments: [], source: 'local', model: 'tiny' });

          var result = generateTitle(id);
          _assertEqual(result.title, 'Morning Standup Notes');

          // Verify saved in index
          var recs = getRecordings(false).recordings;
          var rec  = recs.filter(function(r) { return r.id === id; })[0];
          _assertEqual(rec.title, 'Morning Standup Notes');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'generateTitle returns null title if API call fails (non-critical)',
      fn: function() {
        var m = _installMocks({
          fetch: _makeMockUrlFetch([
            { code: 500, body: '{}' }
          ])
        });
        try {
          m.props.getScriptProperties().setProperty('OPENAI_API_KEY', 'sk-test');
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          saveTranscript(id, { text: 'Some text', segments: [], source: 'local', model: 'tiny' });

          var result = generateTitle(id);
          _assertEqual(result.title, null);  // non-critical, no throw
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'batchGenerateTitles returns titles array for multiple ids',
      fn: function() {
        var chatResponse = {
          choices: [{
            message: {
              content: JSON.stringify([
                { id: 'rec_1', title: 'First Note' },
                { id: 'rec_2', title: 'Second Note' }
              ])
            }
          }]
        };
        var m = _installMocks({
          fetch: _makeMockUrlFetch([
            { code: 200, body: JSON.stringify(chatResponse) }
          ])
        });
        try {
          m.props.getScriptProperties().setProperty('OPENAI_API_KEY', 'sk-test');
          // Set up two recordings
          var ts1 = 1000000000001;
          var ts2 = 1000000000002;
          uploadRecording(_makeRecordingPayload({ clientTimestamp: ts1 }));
          uploadRecording(_makeRecordingPayload({ clientTimestamp: ts2 }));
          saveTranscript('rec_' + ts1, { text: 'First transcript', segments: [], source: 'local', model: 'tiny' });
          saveTranscript('rec_' + ts2, { text: 'Second transcript', segments: [], source: 'local', model: 'tiny' });

          var result = batchGenerateTitles(['rec_' + ts1, 'rec_' + ts2]);
          _assert(Array.isArray(result.titles), 'titles is array');
          _assertEqual(result.titles.length, 2);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'updateTitle saves manual title to index',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          var result = updateTitle(id, 'My Custom Title');
          _assertEqual(result.updated, true);

          var recs = getRecordings(false).recordings;
          var rec  = recs.filter(function(r) { return r.id === id; })[0];
          _assertEqual(rec.title, 'My Custom Title');
        } finally { _restoreMocks(); }
      }
    }
  ]
};

// ── 3g. Settings tests ────────────────────────────────────────

var SUITE_SETTINGS = {
  name: 'Settings',
  tests: [
    {
      name: 'getSettings returns defaults when no settings file exists',
      fn: function() {
        _installMocks();
        try {
          var s = getSettings();
          _assertEqual(s.transcriptionMode, 'openai_first');
          _assertEqual(s.autoUpgrade, false);
          _assertEqual(s.onDeviceModel, 'tiny');
          _assertEqual(s.updatedAt, null);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'saveSettings writes settings file and returns saved settings',
      fn: function() {
        _installMocks();
        try {
          var result = saveSettings({ transcriptionMode: 'always_local', autoUpgrade: true, onDeviceModel: 'base' });
          _assertEqual(result.saved, true);
          _assertEqual(result.settings.transcriptionMode, 'always_local');

          var s = getSettings();
          _assertEqual(s.transcriptionMode, 'always_local');
          _assertEqual(s.onDeviceModel, 'base');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'saveSettings ignores stale write (older timestamp)',
      fn: function() {
        _installMocks();
        try {
          // Write fresh settings
          saveSettings({ transcriptionMode: 'always_local', autoUpgrade: false, onDeviceModel: 'tiny' });
          // Now try to write older settings (simulate stale queue entry)
          var pastDate = new Date(Date.now() - 100000).toISOString();
          var result = saveSettings({ transcriptionMode: 'openai_first', autoUpgrade: true, onDeviceModel: 'small', _updatedAt: pastDate });
          // Original settings should be preserved
          var s = getSettings();
          _assertEqual(s.transcriptionMode, 'always_local', 'stale write ignored');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getApiKeyStatus returns configured:false when no key',
      fn: function() {
        _installMocks();
        try {
          var result = getApiKeyStatus();
          _assertEqual(result.configured, false);
          _assertEqual(result.valid, false);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getApiKeyStatus returns configured:true when key present',
      fn: function() {
        var m = _installMocks({
          fetch: _makeMockUrlFetch([
            { code: 200, body: JSON.stringify({ data: [{ id: 'whisper-1' }] }) }
          ])
        });
        try {
          m.props.getScriptProperties().setProperty('OPENAI_API_KEY', 'sk-test');
          var result = getApiKeyStatus();
          _assertEqual(result.configured, true);
          _assertEqual(result.valid, true);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'saveApiKey validates key with OpenAI and saves on success',
      fn: function() {
        var m = _installMocks({
          fetch: _makeMockUrlFetch([
            { code: 200, body: JSON.stringify({ data: [{ id: 'whisper-1' }] }) }
          ])
        });
        try {
          var result = saveApiKey('sk-valid');
          _assertEqual(result.valid, true);
          _assertEqual(result.saved, true);
          _assertEqual(m.props.getScriptProperties().getProperty('OPENAI_API_KEY'), 'sk-valid');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'saveApiKey returns error for invalid key',
      fn: function() {
        _installMocks({
          fetch: _makeMockUrlFetch([
            { code: 401, body: JSON.stringify({ error: { message: 'Invalid auth' } }) }
          ])
        });
        try {
          _assertThrows(function() { saveApiKey('sk-invalid'); }, 'API_KEY_INVALID');
        } finally { _restoreMocks(); }
      }
    }
  ]
};

// ── 3h. Index management tests ────────────────────────────────

var SUITE_INDEX = {
  name: 'Index Management',
  tests: [
    {
      name: 'getTextIndex returns empty entries when no index file',
      fn: function() {
        _installMocks();
        try {
          var ti = getTextIndex();
          _assert(ti.entries !== undefined, 'has entries');
          _assertEqual(Object.keys(ti.entries).length, 0);
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'getTextIndex returns saved entries',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          saveTranscript(id, { text: 'Searchable text', segments: [], source: 'local', model: 'tiny' });

          var ti = getTextIndex();
          _assert(ti.entries[id] !== undefined, 'entry exists');
          _assertEqual(ti.entries[id].text, 'Searchable text');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'rebuildIndex scans recordings folder and rebuilds index',
      fn: function() {
        _installMocks();
        try {
          // Upload a recording (creates audio file in Drive)
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;

          // Now rebuild
          var result = rebuildIndex();
          _assert(result.recordingsFound >= 1, 'found recordings: ' + result.recordingsFound);
          _assertEqual(result.rebuilt, true);

          // Index should be valid after rebuild
          var data = getRecordings(false);
          _assert(data.recordings.length >= 1, 'recordings in rebuilt index');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'backfillTextIndex adds missing text index entries',
      fn: function() {
        _installMocks();
        try {
          var payload = _makeRecordingPayload();
          uploadRecording(payload);
          var id = 'rec_' + payload.clientTimestamp;
          saveTranscript(id, { text: 'Fill me in', segments: [], source: 'local', model: 'tiny' });

          // Simulate missing text index by clearing it
          _updateTextIndex(function(ti) {
            ti.entries = {};
            return ti;
          });

          var result = backfillTextIndex();
          _assert(result.backfilled >= 1, 'backfilled ' + result.backfilled);

          var ti = getTextIndex();
          _assert(ti.entries[id] !== undefined, 'entry backfilled');
        } finally { _restoreMocks(); }
      }
    }
  ]
};

// ── 3i. Route / endpoint tests ────────────────────────────────

var SUITE_ROUTES = {
  name: 'Routes (doGet / doPost)',
  tests: [
    {
      name: 'doGet ping — no token required — returns ok status',
      fn: function() {
        _installMocks();
        try {
          var e = { parameter: { action: 'ping' }, parameters: {} };
          var output  = doGet(e);
          var body    = JSON.parse(output.getContent());
          _assertEqual(body.success, true);
          _assertEqual(body.data.status, 'ok');
          _assert('hasApiKey' in body.data, 'hasApiKey present');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'doGet returns UNAUTHORIZED for missing token on protected action',
      fn: function() {
        _installMocks();
        try {
          var e = { parameter: { action: 'getRecordings' }, parameters: {} };
          var output = doGet(e);
          var body   = JSON.parse(output.getContent());
          _assertEqual(body.success, false);
          _assertEqual(body.error.code, 'UNAUTHORIZED');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'doGet returns UNKNOWN_ACTION for unrecognised action',
      fn: function() {
        _installMocks();
        try {
          var e = { parameter: { action: 'fly' }, parameters: {} };
          var output = doGet(e);
          var body   = JSON.parse(output.getContent());
          _assertEqual(body.success, false);
          _assertEqual(body.error.code, 'UNKNOWN_ACTION');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'doPost requestAccess — no token required — returns token',
      fn: function() {
        _installMocks();
        try {
          var e = {
            parameter: {},
            parameters: {},
            postData: { contents: JSON.stringify({ action: 'requestAccess', nickname: 'Test' }) }
          };
          var output = doPost(e);
          var body   = JSON.parse(output.getContent());
          _assertEqual(body.success, true);
          _assert(typeof body.data.token === 'string', 'has token');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'doPost returns UNAUTHORIZED for missing token on protected action',
      fn: function() {
        _installMocks();
        try {
          var e = {
            parameter: {},
            parameters: {},
            postData: { contents: JSON.stringify({ action: 'uploadRecording', recording: {} }) }
          };
          var output = doPost(e);
          var body   = JSON.parse(output.getContent());
          _assertEqual(body.success, false);
          _assertEqual(body.error.code, 'UNAUTHORIZED');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'doGet getRecordings — valid token — returns recordings',
      fn: function() {
        var m = _installMocks();
        try {
          // Authorize a browser
          var req = requestAccess('Test');
          m.drive.getFileById(req.fileId).setStarred(true);
          checkAuth(req.token, req.fileId);

          var e = { parameter: { action: 'getRecordings', token: req.token }, parameters: {} };
          var output = doGet(e);
          var body   = JSON.parse(output.getContent());
          _assertEqual(body.success, true);
          _assert(Array.isArray(body.data.recordings), 'recordings array');
        } finally { _restoreMocks(); }
      }
    },
    {
      name: 'doPost returns UNKNOWN_ACTION for unrecognised action',
      fn: function() {
        var m = _installMocks();
        try {
          var req = requestAccess('Test');
          m.drive.getFileById(req.fileId).setStarred(true);
          checkAuth(req.token, req.fileId);

          var e = {
            parameter: { token: req.token },
            parameters: {},
            postData: { contents: JSON.stringify({ action: 'doSomethingWeird' }) }
          };
          var output = doPost(e);
          var body   = JSON.parse(output.getContent());
          _assertEqual(body.success, false);
          _assertEqual(body.error.code, 'UNKNOWN_ACTION');
        } finally { _restoreMocks(); }
      }
    }
  ]
};

/**
 * ============================================================
 * 4. MAIN ENTRY POINT
 * ============================================================
 */

function runAllTests() {
  _testResults = [];
  Logger.log('╔══════════════════════════════════════╗');
  Logger.log('║  AppsScriptRecorder Backend Tests    ║');
  Logger.log('╚══════════════════════════════════════╝');

  var suites = [
    SUITE_UTILS,
    SUITE_DRIVE,
    SUITE_AUTH,
    SUITE_RECORDINGS,
    SUITE_TRANSCRIPTION,
    SUITE_TITLES,
    SUITE_SETTINGS,
    SUITE_INDEX,
    SUITE_ROUTES
  ];

  suites.forEach(function(suite) {
    _runSuite(suite.name, suite.tests);
  });

  _summarize();
}
