import type { FhirClient } from './client';

export function parseReference(
  ref: string,
  _baseUrl: string,
): {
  type?: string;
  id?: string;
  absolute?: string;
  contained?: string;
  raw: string;
} {
  const raw = ref.trim();
  if (raw.startsWith('#')) return { raw, contained: raw.slice(1) };
  if (raw.startsWith('urn:uuid:')) return { raw, absolute: raw };

  let path = raw;
  let absolute: string | undefined;
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    absolute = raw;
    path = url.pathname;
  }
  const parts = path.split('?')[0].split('/').filter(Boolean);
  if (parts.at(-2) === '_history' && parts.length >= 3) parts.splice(-2, 2);
  if (parts.length < 2 || !/^[A-Z][A-Za-z]+$/.test(parts.at(-2) ?? '')) {
    return { raw, absolute };
  }
  return {
    raw,
    absolute,
    type: parts.at(-2),
    id: parts.at(-1),
  };
}

export class ReferenceCache {
  private readonly values = new Map<string, fhir4.Resource>();

  get(key: string): fhir4.Resource | undefined {
    return this.values.get(key);
  }

  set(key: string, resource: fhir4.Resource): void {
    this.values.set(key, resource);
  }

  clear(): void {
    this.values.clear();
  }
}

export function seedCacheFromBundle(cache: ReferenceCache, bundle: fhir4.Bundle): void {
  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource;
    if (!resource) continue;
    const key = resource.id ? `${resource.resourceType}/${resource.id}` : undefined;
    if (key) cache.set(key, resource);
    if (entry.fullUrl) cache.set(entry.fullUrl, resource);
  }
}

export async function resolveReference(
  client: FhirClient,
  cache: ReferenceCache,
  ref: string,
  context?: fhir4.DomainResource,
): Promise<fhir4.Resource | undefined> {
  const parsed = parseReference(ref, client.baseUrl);
  if (parsed.contained && context?.contained) {
    return context.contained.find((resource) => resource.id === parsed.contained);
  }
  const cached =
    cache.get(parsed.raw) ??
    (parsed.type && parsed.id ? cache.get(`${parsed.type}/${parsed.id}`) : undefined);
  if (cached) return cached;
  if (parsed.absolute?.startsWith('urn:uuid:')) return undefined;
  if (parsed.type && parsed.id) {
    try {
      const resource =
        parsed.absolute && !parsed.absolute.startsWith(client.baseUrl)
          ? await client.readAbsolute<fhir4.Resource>(parsed.absolute)
          : await client.read<fhir4.Resource>(parsed.type, parsed.id);
      cache.set(parsed.raw, resource);
      cache.set(`${resource.resourceType}/${resource.id ?? parsed.id}`, resource);
      return resource;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
