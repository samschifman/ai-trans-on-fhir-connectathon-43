import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config/settings';
import { FhirClient } from '../src/fhir/client';
import {
  parseReference,
  ReferenceCache,
  resolveReference,
  seedCacheFromBundle,
} from '../src/fhir/references';

describe('FHIR references', () => {
  it('parses relative, absolute, contained, and UUID forms', () => {
    expect(parseReference('Device/x', DEFAULT_SETTINGS.baseUrl)).toMatchObject({
      type: 'Device',
      id: 'x',
    });
    expect(parseReference('Device/ai-device-1', 'https://host/FHIR')).toMatchObject({
      type: 'Device',
      id: 'ai-device-1',
    });
    expect(
      parseReference('https://example.org/fhir/Patient/p', DEFAULT_SETTINGS.baseUrl),
    ).toMatchObject({ type: 'Patient', id: 'p', absolute: 'https://example.org/fhir/Patient/p' });
    expect(parseReference('https://host/FHIR/Device/x', 'https://host/FHIR')).toMatchObject({
      type: 'Device',
      id: 'x',
      absolute: 'https://host/FHIR/Device/x',
    });
    expect(parseReference('Observation/o1/_history/3', DEFAULT_SETTINGS.baseUrl)).toMatchObject({
      type: 'Observation',
      id: 'o1',
    });
    expect(parseReference('Patient/p?x=1', DEFAULT_SETTINGS.baseUrl)).toMatchObject({
      type: 'Patient',
      id: 'p',
    });
    expect(parseReference('#contained', DEFAULT_SETTINGS.baseUrl)).toMatchObject({
      contained: 'contained',
    });
    expect(parseReference('urn:uuid:abc', DEFAULT_SETTINGS.baseUrl)).toMatchObject({
      absolute: 'urn:uuid:abc',
    });
  });

  it('seeds and resolves UUID and contained references without requests', async () => {
    const resource = { resourceType: 'Patient', id: 'p' } as fhir4.Patient;
    const cache = new ReferenceCache();
    seedCacheFromBundle(cache, {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ fullUrl: 'urn:uuid:abc', resource }],
    });
    const client = new FhirClient(DEFAULT_SETTINGS, vi.fn());
    expect(await resolveReference(client, cache, 'urn:uuid:abc')).toBe(resource);
    const contained = { resourceType: 'DocumentReference', id: 'doc' } as fhir4.DocumentReference;
    const provenance = { resourceType: 'Provenance', contained: [contained] } as fhir4.Provenance;
    expect(await resolveReference(client, cache, '#doc', provenance)).toBe(contained);
  });

  it('resolves a relative reference through the client and caches it', async () => {
    const resource = { resourceType: 'Device', id: 'device' } as fhir4.Device;
    const client = {
      baseUrl: DEFAULT_SETTINGS.baseUrl,
      read: vi.fn().mockResolvedValue(resource),
    } as never;
    const cache = new ReferenceCache();
    expect(await resolveReference(client, cache, 'Device/device')).toBe(resource);
    expect(await resolveReference(client, cache, 'Device/device')).toBe(resource);
    expect(client.read).toHaveBeenCalledTimes(1);
  });
});
