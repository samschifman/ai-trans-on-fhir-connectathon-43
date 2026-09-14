import { describe, expect, it } from 'vitest';
import { buildCollectionBundle, buildTransactionBundle } from '../src/fhir/bundle';

const resources = [
  { resourceType: 'Patient', id: 'one' },
  { resourceType: 'Patient', id: 'one', active: true },
  { resourceType: 'Device', id: 'device' },
] as fhir4.Resource[];

describe('bundle builders', () => {
  it('deduplicates transaction entries and emits PUT requests', () => {
    const bundle = buildTransactionBundle(resources);
    expect(bundle.type).toBe('transaction');
    expect(bundle.entry).toHaveLength(2);
    expect(bundle.entry?.[0]?.request).toEqual({ method: 'PUT', url: 'Patient/one' });
  });

  it('builds a collection bundle', () => {
    const bundle = buildCollectionBundle(resources);
    expect(bundle.type).toBe('collection');
    expect(bundle.entry).toHaveLength(2);
    expect(bundle.entry?.every((entry) => !entry.request)).toBe(true);
  });
});
