import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/config/settings';
import { FhirClient } from '../src/fhir/client';

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
    auth: { ...DEFAULT_SETTINGS.auth, ...overrides.auth },
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/fhir+json' },
  });
}

describe('FhirClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('builds direct URLs and auth headers', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response({ resourceType: 'CapabilityStatement' }));
    const client = new FhirClient(settings({ auth: { mode: 'bearer', token: 'secret' } }), vi.fn());
    await client.request('GET', 'metadata', { _summary: 'true' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/fhir/metadata?_summary=true',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      }),
    );
  });

  it('sends relative requests through the proxy and rewrites next links', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => response({ resourceType: 'Bundle', type: 'searchset' }));
    const client = new FhirClient(
      settings({ useProxy: true, proxyOrigin: 'http://localhost:5173' }),
      vi.fn(),
    );
    await client.searchPage('Provenance', { agent: 'Device/x' });
    await client.searchPage('http://localhost:8080/fhir/Provenance?page=2');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:5173/proxy/Provenance?agent=Device%2Fx',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost:5173/proxy/Provenance?page=2');
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Fhir-Base': DEFAULT_SETTINGS.baseUrl }),
      }),
    );
  });

  it('logs timeout failures and aborts the request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        ),
      );
    });
    const logs: unknown[] = [];
    const client = new FhirClient(settings({ timeoutMs: 10 }), (entry) => logs.push(entry));
    const promise = client.request('GET', 'metadata');
    const rejection = expect(promise).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(11);
    await rejection;
    expect(fetchMock).toHaveBeenCalled();
    expect(logs).toHaveLength(1);
    vi.useRealTimers();
  });

  it('redacts credentials and sensitive extra headers from the request log', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response({ resourceType: 'CapabilityStatement' }));
    const logs: { headers: Record<string, string> }[] = [];
    const client = new FhirClient(
      settings({
        auth: { mode: 'bearer', token: 'secret-token' },
        extraHeaders: [
          { name: 'X-Api-Key', value: 'api-key-secret' },
          { name: 'X-Trace-Id', value: 'safe-trace-id' },
        ],
      }),
      (entry) => logs.push(entry),
    );
    await client.request('GET', 'metadata');
    expect(fetchMock).toHaveBeenCalled();
    expect(logs[0]?.headers).toEqual({
      Accept: 'application/fhir+json',
      Authorization: '[redacted]',
      'X-Api-Key': '[redacted]',
      'X-Trace-Id': 'safe-trace-id',
    });
  });
});
