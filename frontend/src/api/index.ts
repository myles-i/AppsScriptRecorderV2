import { RealApiClient } from './client';
import { MockApiClient } from './mock-client';
import type { ApiClient } from './types';
import { getStoredBackendUrl, getStoredToken } from '../cache/settings-cache';

let _client: ApiClient | null = null;

export function createApiClient(): ApiClient {
  if (import.meta.env.VITE_MOCK_API === 'true') {
    return new MockApiClient();
  }
  const url = getStoredBackendUrl();
  const token = getStoredToken();
  return new RealApiClient(url ?? '', token);
}

export function getApiClient(): ApiClient {
  if (!_client) {
    _client = createApiClient();
  }
  return _client;
}

/** Call this when backend URL or token changes (after setup/disconnect). */
export function resetApiClient(): void {
  _client = null;
}

export type { ApiClient };
