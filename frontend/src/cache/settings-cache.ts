import { get, set, del } from 'idb-keyval';
import type { Settings } from '../api/types';

const KEYS = {
  BACKEND_URL: 'backend_url',
  AUTH_TOKEN: 'auth_token',
  BROWSER_NICKNAME: 'browser_nickname',
  SETTINGS: 'settings',
  LAST_SYNC: 'last_sync',
  WHISPER_MODEL_STATUS: 'whisper_model_status',
  AUTH_FILE_ID: 'auth_file_id',
  AUTH_FILE_NAME: 'auth_file_name',
  FOLDER_URL: 'folder_url',
} as const;

export function getStoredBackendUrl(): string | null {
  // Synchronous in-memory only for non-async contexts
  return _memStore.backendUrl;
}

export function getStoredToken(): string | null {
  return _memStore.token;
}

// In-memory cache so synchronous getters work
const _memStore: {
  backendUrl: string | null;
  token: string | null;
} = { backendUrl: null, token: null };

export async function loadFromStorage(): Promise<void> {
  _memStore.backendUrl = (await get<string>(KEYS.BACKEND_URL)) ?? null;
  _memStore.token = (await get<string>(KEYS.AUTH_TOKEN)) ?? null;
}

export async function saveBackendUrl(url: string): Promise<void> {
  _memStore.backendUrl = url;
  await set(KEYS.BACKEND_URL, url);
}

export async function saveToken(token: string): Promise<void> {
  _memStore.token = token;
  await set(KEYS.AUTH_TOKEN, token);
}

export async function saveBrowserNickname(nickname: string): Promise<void> {
  await set(KEYS.BROWSER_NICKNAME, nickname);
}

export async function getBrowserNickname(): Promise<string> {
  return (await get<string>(KEYS.BROWSER_NICKNAME)) ?? 'My Browser';
}

export async function saveAuthFileInfo(fileId: string, fileName: string, folderUrl: string): Promise<void> {
  await Promise.all([
    set(KEYS.AUTH_FILE_ID, fileId),
    set(KEYS.AUTH_FILE_NAME, fileName),
    set(KEYS.FOLDER_URL, folderUrl),
  ]);
}

export async function getAuthFileInfo(): Promise<{
  fileId: string | null;
  fileName: string | null;
  folderUrl: string | null;
}> {
  const [fileId, fileName, folderUrl] = await Promise.all([
    get<string>(KEYS.AUTH_FILE_ID),
    get<string>(KEYS.AUTH_FILE_NAME),
    get<string>(KEYS.FOLDER_URL),
  ]);
  return {
    fileId: fileId ?? null,
    fileName: fileName ?? null,
    folderUrl: folderUrl ?? null,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await set(KEYS.SETTINGS, settings);
}

export async function getSettings(): Promise<Settings> {
  return (
    (await get<Settings>(KEYS.SETTINGS)) ?? {
      transcriptionMode: 'openai_first',
      autoUpgrade: false,
      onDeviceModel: 'tiny',
    }
  );
}

export async function saveLastSync(timestamp: number): Promise<void> {
  await set(KEYS.LAST_SYNC, timestamp);
}

export async function getLastSync(): Promise<number | null> {
  return (await get<number>(KEYS.LAST_SYNC)) ?? null;
}

export async function clearAllSettings(): Promise<void> {
  _memStore.backendUrl = null;
  _memStore.token = null;
  await Promise.all(Object.values(KEYS).map((k) => del(k)));
}

export function hasBackend(): boolean {
  return !!_memStore.backendUrl && !!_memStore.token;
}
