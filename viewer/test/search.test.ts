import { describe, expect, it, vi } from 'vitest';
import { countResources, searchAll } from '../src/fhir/search';

function bundle(ids: string[], next?: string): fhir4.Bundle {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: 3,
    entry: ids.map((id) => ({ resource: { resourceType: 'Patient', id } })),
    link: next ? [{ relation: 'next', url: next }] : undefined,
  };
}

describe('FHIR search helpers', () => {
  it('follows next links and reports page caps', async () => {
    const client = {
      searchPage: vi
        .fn()
        .mockResolvedValueOnce(bundle(['one'], 'next'))
        .mockResolvedValueOnce(bundle(['two'], 'next')),
    } as never;
    const result = await searchAll<fhir4.Patient>(
      client,
      'Patient',
      {},
      { pageSize: 1, maxPages: 2 },
    );
    expect(result.resources.map((resource) => resource.id)).toEqual(['one', 'two']);
    expect(result.capped).toBe(true);
    expect(client.searchPage).toHaveBeenNthCalledWith(1, 'Patient', { _count: '1' });
    expect(client.searchPage).toHaveBeenNthCalledWith(2, 'next', undefined);
  });

  it('uses the summary, total, then paged count fallback chain', async () => {
    const client = {
      searchPage: vi
        .fn()
        .mockRejectedValueOnce(new Error('summary unsupported'))
        .mockResolvedValueOnce(bundle([], undefined)),
    } as never;
    const result = await countResources(client, 'Observation', { patient: 'Patient/x' });
    expect(result).toEqual({ total: 3, method: 'total' });
    expect(client.searchPage).toHaveBeenNthCalledWith(2, 'Observation', {
      patient: 'Patient/x',
      _total: 'accurate',
      _count: '1',
    });
  });
});
