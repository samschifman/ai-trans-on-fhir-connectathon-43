import type { Settings } from '../config/settings';
import type { CapabilitySummary, LogEntry } from './types';
import { FhirError } from './types';

function trimBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function isBundle(value: unknown): value is fhir4.Bundle {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { resourceType?: unknown }).resourceType === 'Bundle'
  );
}

function isOperationOutcome(value: unknown): value is fhir4.OperationOutcome {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { resourceType?: unknown }).resourceType === 'OperationOutcome'
  );
}

export class FhirClient {
  readonly baseUrl: string;

  constructor(
    private readonly settings: Settings,
    private readonly onLog: (entry: LogEntry) => void,
  ) {
    this.baseUrl = trimBase(settings.baseUrl);
  }

  private headers(targetBase?: string): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/fhir+json' };
    if (this.settings.auth.mode === 'basic') {
      const value = btoa(
        `${this.settings.auth.username ?? ''}:${this.settings.auth.password ?? ''}`,
      );
      headers.Authorization = `Basic ${value}`;
    } else if (this.settings.auth.mode === 'bearer' && this.settings.auth.token) {
      headers.Authorization = `Bearer ${this.settings.auth.token}`;
    }
    for (const extra of this.settings.extraHeaders) {
      if (!extra.name.trim()) continue;
      const name = this.settings.useProxy ? `X-Extra-${extra.name}` : extra.name;
      headers[name] = extra.value;
    }
    if (this.settings.useProxy) headers['X-Fhir-Base'] = targetBase ?? this.baseUrl;
    return headers;
  }

  private proxyOrigin(): string {
    return trimBase(
      this.settings.proxyOrigin || (typeof window === 'undefined' ? '' : window.location.origin),
    );
  }

  private urlFor(
    pathOrUrl: string,
    query?: Record<string, string>,
  ): { url: string; headers: Record<string, string> } {
    const absolute = /^https?:\/\//i.test(pathOrUrl);
    if (!this.settings.useProxy) {
      const url = absolute
        ? new URL(pathOrUrl)
        : new URL(`${this.baseUrl}/${pathOrUrl.replace(/^\/+/, '')}`);
      appendQuery(url, query);
      return { url: url.toString(), headers: this.headers() };
    }

    const target = absolute
      ? new URL(pathOrUrl)
      : new URL(`${this.baseUrl}/${pathOrUrl.replace(/^\/+/, '')}`);
    const base =
      absolute && !target.href.startsWith(`${this.baseUrl}/`) ? target.origin : this.baseUrl;
    const configuredPath = new URL(this.baseUrl).pathname.replace(/\/$/, '');
    const rest =
      base === this.baseUrl && target.pathname.startsWith(configuredPath)
        ? target.pathname.slice(configuredPath.length).replace(/^\/+/, '')
        : target.pathname.replace(/^\/+/, '');
    const proxyBase = this.proxyOrigin();
    const url = new URL(`${proxyBase}/proxy/${rest}`);
    url.search = target.search;
    appendQuery(url, query);
    return { url: url.toString(), headers: this.headers(base) };
  }

  async request<T>(method: 'GET', path: string, query?: Record<string, string>): Promise<T> {
    return this.requestUrl<T>(method, path, query);
  }

  async requestUrl<T>(
    method: 'GET',
    pathOrUrl: string,
    query?: Record<string, string>,
  ): Promise<T> {
    const request = this.urlFor(pathOrUrl, query);
    const started = performance.now();
    const startedAt = new Date().toISOString();
    const logBase = {
      id: globalThis.crypto.randomUUID(),
      method,
      url: request.url,
      headers: redactHeaders(request.headers),
      startedAt,
    };
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.settings.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method,
        headers: request.headers,
        signal: controller.signal,
      });
      const text = await response.text();
      const body = text ? parseJson(text) : undefined;
      const elapsed = Math.round(performance.now() - started);
      const count = isBundle(body) ? (body.total ?? body.entry?.length) : undefined;
      this.onLog({ ...logBase, status: response.status, ms: elapsed, count, responseBody: body });
      if (!response.ok) {
        throw new FhirError(
          `FHIR request failed: HTTP ${response.status}`,
          response.status,
          request.url,
          isOperationOutcome(body) ? body : undefined,
        );
      }
      return body as T;
    } catch (error) {
      const elapsed = Math.round(performance.now() - started);
      if (error instanceof FhirError) throw error;
      const timedOut = error instanceof DOMException && error.name === 'AbortError';
      const message = timedOut
        ? 'Request timed out'
        : error instanceof Error
          ? error.message
          : 'Request failed';
      this.onLog({ ...logBase, status: 0, ms: elapsed, error: message });
      throw new FhirError(message, 0, request.url);
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  read<T extends fhir4.Resource>(type: string, id: string): Promise<T> {
    return this.request<T>('GET', `${encodeURIComponent(type)}/${encodeURIComponent(id)}`);
  }

  readAbsolute<T extends fhir4.Resource>(url: string): Promise<T> {
    return this.requestUrl<T>('GET', url);
  }

  searchPage(pathOrUrl: string, query?: Record<string, string>): Promise<fhir4.Bundle> {
    return this.requestUrl<fhir4.Bundle>('GET', pathOrUrl, query);
  }

  capability(): Promise<fhir4.CapabilityStatement> {
    return this.request<fhir4.CapabilityStatement>('GET', 'metadata');
  }
}

function appendQuery(url: URL, query?: Record<string, string>): void {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      isSensitiveHeader(name) ? '[redacted]' : value,
    ]),
  );
}

function isSensitiveHeader(name: string): boolean {
  return (
    /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i.test(name) ||
    /(token|secret|password|credential|private-key)/i.test(name)
  );
}

export type { CapabilitySummary, FhirError };
