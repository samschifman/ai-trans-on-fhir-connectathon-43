import type { FhirClient } from './client';
import type { SearchAllResult } from './types';

interface SearchOptions {
  pageSize: number;
  maxPages: number;
  onBundle?: (bundle: fhir4.Bundle) => void;
}

export async function searchAll<T extends fhir4.Resource>(
  client: FhirClient,
  path: string,
  query: Record<string, string>,
  options: SearchOptions,
): Promise<SearchAllResult<T>> {
  const resources: T[] = [];
  const warnings: string[] = [];
  let next: string | undefined = path;
  let first = true;
  let pages = 0;
  let capped = false;

  while (next && pages < options.maxPages) {
    try {
      const bundle = await client.searchPage(
        next,
        first ? { ...query, _count: String(options.pageSize) } : undefined,
      );
      first = false;
      pages += 1;
      options.onBundle?.(bundle);
      for (const entry of bundle.entry ?? []) {
        if (entry.resource) resources.push(entry.resource as T);
      }
      next = bundle.link?.find((link) => link.relation === 'next')?.url;
    } catch (error) {
      if (resources.length === 0) throw error;
      warnings.push(error instanceof Error ? error.message : 'A later page failed');
      next = undefined;
    }
  }

  if (next) {
    capped = true;
    warnings.push(`Pagination stopped after ${options.maxPages} pages.`);
  }
  return { resources, pages, capped, warnings };
}

export async function countResources(
  client: FhirClient,
  type: string,
  query: Record<string, string>,
  options: Pick<SearchOptions, 'pageSize' | 'maxPages'> = { pageSize: 100, maxPages: 50 },
): Promise<{
  total: number | null;
  method: 'summary' | 'total' | 'paged' | 'failed';
  warning?: string;
}> {
  try {
    const bundle = await client.searchPage(type, { ...query, _summary: 'count' });
    if (typeof bundle.total === 'number') return { total: bundle.total, method: 'summary' };
  } catch {
    // Continue through the compatibility fallbacks.
  }

  try {
    const bundle = await client.searchPage(type, { ...query, _total: 'accurate', _count: '1' });
    if (typeof bundle.total === 'number') return { total: bundle.total, method: 'total' };
  } catch {
    // Continue through the client-side fallback.
  }

  try {
    const result = await searchAll(client, type, query, options);
    return {
      total: result.resources.length,
      method: 'paged',
      warning: result.capped
        ? 'The page cap was reached; this count is incomplete.'
        : 'The server did not provide a count; resources were paged and counted client-side.',
    };
  } catch {
    return { total: null, method: 'failed', warning: `Unable to count ${type}.` };
  }
}
