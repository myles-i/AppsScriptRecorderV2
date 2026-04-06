import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealApiClient, ApiError } from '../../../src/api/client';

const BASE_URL = 'https://script.google.com/macros/s/TEST/exec';
const TOKEN = 'abc123token';

function makeOkResponse(data: unknown, version = '1.0.0'): Response {
  return new Response(JSON.stringify({ success: true, version, data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeErrorResponse(code: string, message: string): Response {
  return new Response(
    JSON.stringify({ success: false, version: '1.0.0', error: { code, message } }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

describe('RealApiClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let client: RealApiClient;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    client = new RealApiClient(BASE_URL, TOKEN);
  });

  // ─── GET ──────────────────────────────────────────────────────────────────

  it('sends GET with action and token query params', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse({ status: 'ok', hasApiKey: false }));

    await client.ping();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('action=ping');
    // ping does not require token, but the client still passes it if present
    expect(calledUrl).toContain(`token=${TOKEN}`);
  });

  it('includes extra params in GET request', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse({ recordings: [], textIndex: null }),
    );

    await client.getRecordings(true);

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('action=getRecordings');
    expect(calledUrl).toContain('includeTextIndex=true');
  });

  // ─── POST ─────────────────────────────────────────────────────────────────

  it('sends POST with text/plain content-type to avoid CORS preflight', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse({ token: 'tok', fileId: 'fid', fileName: 'f.json', folderUrl: 'https://drive.google.com/' }),
    );

    const tempClient = new RealApiClient(BASE_URL, null);
    await tempClient.requestAccess('My iPhone');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
  });

  it('includes action in POST body', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse({ token: 'tok', fileId: 'fid', fileName: 'f.json', folderUrl: 'https://drive.google.com/' }),
    );

    const tempClient = new RealApiClient(BASE_URL, null);
    await tempClient.requestAccess('My Phone');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.action).toBe('requestAccess');
    expect(body.nickname).toBe('My Phone');
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  it('throws ApiError when success is false', async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse('UNAUTHORIZED', 'Token not found'));
    await expect(client.getRecordings()).rejects.toThrow(ApiError);
  });

  it('ApiError message matches backend error message', async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse('UNAUTHORIZED', 'Token not found'));
    await expect(client.getRecordings()).rejects.toThrow('Token not found');
  });

  it('ApiError carries the error code', async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse('NOT_FOUND', 'Recording missing'));
    try {
      await client.getRecordings();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('NOT_FOUND');
    }
  });

  // ─── Version check ────────────────────────────────────────────────────────

  it('emits backend-update-available event when backend version is older', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, version: '0.9.0', data: { status: 'ok', hasApiKey: false } }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const eventSpy = vi.fn();
    globalThis.addEventListener('backend-update-available', eventSpy);

    await client.ping();

    globalThis.removeEventListener('backend-update-available', eventSpy);
    expect(eventSpy).toHaveBeenCalledOnce();
  });

  it('does NOT emit backend-update-available when version is current', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse({ status: 'ok', hasApiKey: false }));

    const eventSpy = vi.fn();
    globalThis.addEventListener('backend-update-available', eventSpy);

    await client.ping();

    globalThis.removeEventListener('backend-update-available', eventSpy);
    expect(eventSpy).not.toHaveBeenCalled();
  });

  // ─── Specific endpoints ───────────────────────────────────────────────────

  it('checkAuth passes token and fileId', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse({ authorized: true }));

    const result = await client.checkAuth('mytoken', 'fileabc');

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('action=checkAuth');
    expect(calledUrl).toContain('fileId=fileabc');
    expect(result.authorized).toBe(true);
  });

  it('deleteRecording sends correct action and id', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse({ deleted: true }));

    await client.deleteRecording('rec_123');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.action).toBe('deleteRecording');
    expect(body.id).toBe('rec_123');
  });

  it('updateTitle sends correct fields', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse({ updated: true }));

    await client.updateTitle('rec_456', 'New Title');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.action).toBe('updateTitle');
    expect(body.id).toBe('rec_456');
    expect(body.title).toBe('New Title');
  });
});
