import type { CapabilitySummary } from './types';

const SEARCH_PARAMS = ['_security', '_has', '_profile', '_summary', '_total'];

export function summarizeCapability(cs: fhir4.CapabilityStatement): CapabilitySummary {
  const rest = cs.rest?.[0];
  const resourceEntries = rest?.resource ?? [];
  const resourceParams = resourceEntries
    .flatMap((resource) => resource.searchParam ?? [])
    .map((param) => param.name);
  const globalParams = (rest?.searchParam ?? []).map((param) => param.name);
  const includes = resourceEntries.flatMap((resource) => resource.searchInclude ?? []);
  const operations = [
    ...(rest?.operation ?? []),
    ...resourceEntries
      .filter((resource) => resource.type === 'Patient')
      .flatMap((resource) => resource.operation ?? []),
  ].map((operation) => operation.name.replace(/^\$/, ''));
  const available = new Set([...resourceParams, ...globalParams]);
  const supports: Record<string, boolean | 'unknown'> = {};
  for (const name of SEARCH_PARAMS) {
    supports[name] = available.has(name) ? true : 'unknown';
  }
  supports._include = includes.length > 0 ? true : 'unknown';
  supports.everything = operations.includes('everything') ? true : 'unknown';
  const software = [cs.software?.name, cs.software?.version].filter(Boolean).join(' ');
  return {
    fhirVersion: cs.fhirVersion,
    software: software || undefined,
    supports,
  };
}
