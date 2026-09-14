import type { Settings } from '../config/settings';
import type { FhirClient } from '../fhir/client';
import { searchAll, countResources } from '../fhir/search';
import { ReferenceCache, resolveReference, seedCacheFromBundle } from '../fhir/references';
import { isAiProvenance, referenceKey } from './provenance';

export interface RecallResult {
  provenances: fhir4.Provenance[];
  targets: fhir4.Resource[];
  unresolvedTargets: string[];
  byType: { type: string; touched: number; total: number | null }[];
  patients: { ref: string; display: string }[];
  resolved: Map<string, fhir4.Resource>;
  warnings: string[];
}

export async function recallByProvenanceSearch(
  client: FhirClient,
  cache: ReferenceCache,
  settings: Settings,
  param: 'agent' | 'entity',
  ref: string,
  onProgress?: (message: string) => void,
): Promise<RecallResult> {
  const warnings: string[] = [];
  let resources: fhir4.Resource[];
  try {
    resources = await searchProvenances(client, cache, settings, param, ref, true, onProgress);
  } catch {
    warnings.push(
      'The server rejected _include=Provenance:target; resolving targets individually.',
    );
    resources = await searchProvenances(client, cache, settings, param, ref, false, onProgress);
  }
  const provenances = dedupe(
    resources.filter(
      (resource): resource is fhir4.Provenance => resource.resourceType === 'Provenance',
    ),
  ).filter((resource): resource is fhir4.Provenance =>
    isAiProvenance(resource as fhir4.Provenance),
  );
  const resolved = new Map<string, fhir4.Resource>();
  const targets: fhir4.Resource[] = resources.filter(
    (resource) => resource.resourceType !== 'Provenance',
  );
  const unresolvedTargets: string[] = [];
  for (const provenance of provenances) {
    for (const target of provenance.target ?? []) {
      const targetRef = target.reference;
      if (!targetRef) continue;
      const existing = targets.find(
        (candidate) =>
          referenceKey(`${candidate.resourceType}/${candidate.id}`) === referenceKey(targetRef),
      );
      if (existing) continue;
      const resolvedTarget = await resolveReference(client, cache, targetRef, provenance);
      if (resolvedTarget) {
        targets.push(resolvedTarget);
        resolved.set(targetRef, resolvedTarget);
      } else unresolvedTargets.push(targetRef);
    }
    const refs = [
      ...(provenance.agent ?? []).flatMap((agent) =>
        agent.who?.reference ? [agent.who.reference] : [],
      ),
      ...(provenance.entity ?? []).flatMap((entity) =>
        entity.what?.reference ? [entity.what.reference] : [],
      ),
      ...(provenance.location?.reference ? [provenance.location.reference] : []),
    ];
    for (const relatedRef of refs) {
      const related = await resolveReference(client, cache, relatedRef, provenance);
      if (related) resolved.set(relatedRef, related);
      else if (!relatedRef.startsWith('#') && !relatedRef.startsWith('urn:'))
        warnings.push(`Could not resolve ${relatedRef}.`);
    }
  }
  const uniqueTargets = dedupe(targets);
  const byType = await totalsByType(client, settings, uniqueTargets, warnings);
  const patients = await findPatients(client, cache, uniqueTargets, resolved);
  return {
    provenances,
    targets: uniqueTargets,
    unresolvedTargets: [...new Set(unresolvedTargets)],
    byType,
    patients,
    resolved,
    warnings: [...new Set(warnings)],
  };
}

async function searchProvenances(
  client: FhirClient,
  cache: ReferenceCache,
  settings: Settings,
  param: string,
  ref: string,
  include: boolean,
  onProgress?: (message: string) => void,
): Promise<fhir4.Resource[]> {
  onProgress?.(`Searching Provenance by ${param}…`);
  const query: Record<string, string> = { [param]: ref };
  if (include) query._include = 'Provenance:target';
  const result = await searchAll<fhir4.Resource>(client, 'Provenance', query, {
    ...settings,
    onBundle: (bundle) => seedCacheFromBundle(cache, bundle),
  });
  return result.resources;
}

async function totalsByType(
  client: FhirClient,
  settings: Settings,
  targets: fhir4.Resource[],
  warnings: string[],
): Promise<RecallResult['byType']> {
  const types = [...new Set(targets.map((target) => target.resourceType))];
  const rows: RecallResult['byType'] = [];
  for (const type of types) {
    const total = await countResources(client, type, {}, settings);
    if (total.warning) warnings.push(`${type}: ${total.warning}`);
    rows.push({
      type,
      touched: targets.filter((target) => target.resourceType === type).length,
      total: total.total,
    });
  }
  return rows;
}

async function findPatients(
  client: FhirClient,
  cache: ReferenceCache,
  targets: fhir4.Resource[],
  resolved: Map<string, fhir4.Resource>,
): Promise<RecallResult['patients']> {
  const patientRefs = targets.flatMap((target) => {
    const candidate = target as fhir4.Resource & {
      subject?: fhir4.Reference;
      patient?: fhir4.Reference;
    };
    return [candidate.subject?.reference, candidate.patient?.reference].filter(
      (ref): ref is string => !!ref && ref.split('/')[0] === 'Patient',
    );
  });
  const unique = [...new Set(patientRefs)];
  const patients: RecallResult['patients'] = [];
  for (const ref of unique) {
    const patient = resolved.get(ref) ?? (await resolveReference(client, cache, ref));
    if (patient) resolved.set(ref, patient);
    const typed = patient?.resourceType === 'Patient' ? (patient as fhir4.Patient) : undefined;
    const name = typed?.name?.[0];
    patients.push({
      ref,
      display:
        name?.text ?? ([name?.given?.join(' '), name?.family].filter(Boolean).join(' ') || ref),
    });
  }
  return patients;
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
