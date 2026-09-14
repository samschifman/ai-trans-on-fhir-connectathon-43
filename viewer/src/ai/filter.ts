import type { Settings } from '../config/settings';
import type { FhirClient } from '../fhir/client';
import { searchAll, countResources } from '../fhir/search';
import { ReferenceCache, resolveReference, seedCacheFromBundle } from '../fhir/references';
import { aiLabelStatus, isAiLabeled, securityToken } from './labels';
import { isAiProvenance } from './provenance';
import { loadPatientData } from './patient';

export interface FilterScope {
  patientId?: string;
}
export interface CountRow {
  type: string;
  total: number | null;
  ai: number | null;
  nonAi: number | null;
  method: string;
  warnings: string[];
}
export interface CollectionResult {
  resources: fhir4.Resource[];
  warnings: string[];
}

export async function countByType(
  client: FhirClient,
  cache: ReferenceCache,
  settings: Settings,
  scope: FilterScope,
): Promise<CountRow[]> {
  if (scope.patientId) return countPatientResources(client, cache, settings, scope.patientId);
  const rows: CountRow[] = [];
  for (const type of settings.resourceTypes) {
    const warnings: string[] = [];
    const query = {
      _security: securityToken(settings.labelCodes),
    };
    const [total, ai] = await Promise.all([
      countResources(client, type, {}, settings),
      countResources(client, type, query, settings),
    ]);
    if (total.warning) warnings.push(total.warning);
    if (ai.warning)
      warnings.push(
        `${ai.warning} Server-wide AI counts reflect resource-level security labels only.`,
      );
    rows.push({
      type,
      total: total.total,
      ai: ai.total,
      nonAi: total.total === null || ai.total === null ? null : total.total - ai.total,
      method: `${total.method}/${ai.method}`,
      warnings,
    });
  }
  return rows;
}

async function countPatientResources(
  client: FhirClient,
  cache: ReferenceCache,
  settings: Settings,
  patientId: string,
): Promise<CountRow[]> {
  const data = await loadPatientData(client, cache, settings, patientId);
  return settings.resourceTypes.map((type) => {
    const resources = data.resources.filter((resource) => resource.resourceType === type);
    const ai = resources.filter((resource) =>
      isAiLabeled(aiLabelStatus(resource, { labelCodes: settings.labelCodes })),
    ).length;
    return {
      type,
      total: resources.length,
      ai,
      nonAi: resources.length - ai,
      method: 'patient/client',
      warnings: data.warnings,
    };
  });
}

export async function collectAiLabeled(
  client: FhirClient,
  cache: ReferenceCache,
  settings: Settings,
  scope: FilterScope,
  onProgress?: (message: string) => void,
): Promise<CollectionResult> {
  const warnings: string[] = [];
  let labeled: fhir4.Resource[];
  if (scope.patientId) {
    const data = await loadPatientData(client, cache, settings, scope.patientId, onProgress);
    labeled = data.resources.filter(
      (resource) =>
        settings.resourceTypes.includes(resource.resourceType) &&
        isAiLabeled(aiLabelStatus(resource, { labelCodes: settings.labelCodes })),
    );
    warnings.push(...data.warnings);
  } else {
    labeled = [];
    for (const type of settings.resourceTypes) {
      onProgress?.(`Collecting AI-labeled ${type} resources…`);
      const result = await searchAll<fhir4.Resource>(
        client,
        type,
        {
          _security: securityToken(settings.labelCodes),
        },
        { ...settings, onBundle: (bundle) => seedCacheFromBundle(cache, bundle) },
      );
      labeled.push(...result.resources);
      warnings.push(...result.warnings);
    }
  }
  const resources = dedupe(labeled);
  const provenances = await findProvenances(
    client,
    cache,
    settings,
    resources,
    warnings,
    onProgress,
  );
  const related = [...resources, ...provenances];
  for (const provenance of provenances) {
    const refs = [
      ...(provenance.agent ?? []).flatMap((agent) =>
        agent.who?.reference ? [agent.who.reference] : [],
      ),
      ...(provenance.entity ?? []).flatMap((entity) =>
        entity.what?.reference ? [entity.what.reference] : [],
      ),
      ...(provenance.location?.reference ? [provenance.location.reference] : []),
    ];
    for (const ref of refs) {
      const resolved = await resolveReference(client, cache, ref, provenance);
      if (resolved) related.push(resolved);
      else if (!ref.startsWith('#') && !ref.startsWith('urn:'))
        warnings.push(`Could not resolve ${ref}.`);
    }
  }
  return { resources: dedupe(related), warnings: [...new Set(warnings)] };
}

async function findProvenances(
  client: FhirClient,
  cache: ReferenceCache,
  settings: Settings,
  resources: fhir4.Resource[],
  warnings: string[],
  onProgress?: (message: string) => void,
): Promise<fhir4.Provenance[]> {
  const refs = resources
    .filter((resource) => resource.id)
    .map((resource) => `${resource.resourceType}/${resource.id}`);
  const result: fhir4.Provenance[] = [];
  for (let index = 0; index < refs.length; index += 20) {
    onProgress?.(
      `Collecting Provenance records (${Math.min(index + 20, refs.length)} of ${refs.length})…`,
    );
    const page = await searchAll<fhir4.Provenance>(
      client,
      'Provenance',
      { target: refs.slice(index, index + 20).join(',') },
      { ...settings, onBundle: (bundle) => seedCacheFromBundle(cache, bundle) },
    );
    result.push(...page.resources.filter(isAiProvenance));
    warnings.push(...page.warnings);
  }
  return dedupe(result).filter(
    (resource): resource is fhir4.Provenance => resource.resourceType === 'Provenance',
  );
}

export async function collectNonAi(
  client: FhirClient,
  cache: ReferenceCache,
  settings: Settings,
  scope: FilterScope,
  onProgress?: (message: string) => void,
): Promise<CollectionResult> {
  if (scope.patientId) {
    const data = await loadPatientData(client, cache, settings, scope.patientId, onProgress);
    return {
      resources: data.resources.filter(
        (resource) =>
          settings.resourceTypes.includes(resource.resourceType) &&
          !isAiLabeled(aiLabelStatus(resource, { labelCodes: settings.labelCodes })),
      ),
      warnings: data.warnings,
    };
  }
  const resources: fhir4.Resource[] = [];
  const warnings: string[] = [];
  let usedSecurityNot = false;
  const fallbackTypes: string[] = [];
  for (const type of settings.resourceTypes) {
    onProgress?.(`Collecting non-AI ${type} resources…`);
    const query = {
      '_security:not': securityToken(settings.labelCodes),
    };
    try {
      const result = await searchAll<fhir4.Resource>(client, type, query, {
        ...settings,
        onBundle: (bundle) => seedCacheFromBundle(cache, bundle),
      });
      resources.push(
        ...result.resources.filter(
          (resource) => !isAiLabeled(aiLabelStatus(resource, { labelCodes: settings.labelCodes })),
        ),
      );
      warnings.push(...result.warnings);
      usedSecurityNot = true;
    } catch {
      const result = await searchAll<fhir4.Resource>(
        client,
        type,
        {},
        { ...settings, onBundle: (bundle) => seedCacheFromBundle(cache, bundle) },
      );
      resources.push(
        ...result.resources.filter(
          (resource) => !isAiLabeled(aiLabelStatus(resource, { labelCodes: settings.labelCodes })),
        ),
      );
      fallbackTypes.push(type);
    }
  }
  if (usedSecurityNot)
    warnings.push(
      'Server-side _security:not does not exclude inline-only labels; inline-only labels were excluded client-side.',
    );
  if (fallbackTypes.length > 0)
    warnings.push(
      `_security:not unsupported for ${fallbackTypes.join(', ')}; fetched and filtered client-side.`,
    );
  return { resources: dedupe(resources), warnings: [...new Set(warnings)] };
}

function dedupe(resources: fhir4.Resource[]): fhir4.Resource[] {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    const key = `${resource.resourceType}/${resource.id ?? JSON.stringify(resource)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
