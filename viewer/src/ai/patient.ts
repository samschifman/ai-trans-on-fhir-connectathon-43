import type { Settings } from '../config/settings';
import type { FhirClient } from '../fhir/client';
import { searchAll } from '../fhir/search';
import { ReferenceCache, resolveReference, seedCacheFromBundle } from '../fhir/references';
import { indexByTarget, isAiProvenance, referenceKey } from './provenance';
import { aiLabelStatus, isAiLabeled } from './labels';

export interface PatientData {
  patient: fhir4.Patient;
  resources: fhir4.Resource[];
  provenanceByTarget: Map<string, fhir4.Provenance[]>;
  resolved: Map<string, fhir4.Resource>;
  warnings: string[];
}

export async function loadPatientData(
  client: FhirClient,
  cache: ReferenceCache,
  settings: Settings,
  patientId: string,
  onProgress?: (message: string) => void,
): Promise<PatientData> {
  const warnings: string[] = [];
  const resolved = new Map<string, fhir4.Resource>();
  const patient = await client.read<fhir4.Patient>('Patient', patientId);
  cache.set(`Patient/${patientId}`, patient);
  let resources: fhir4.Resource[] = [];

  try {
    onProgress?.('Loading the patient $everything operation…');
    const everything = await searchAll<fhir4.Resource>(
      client,
      `Patient/${patientId}/$everything`,
      {},
      {
        pageSize: settings.pageSize,
        maxPages: settings.maxPages,
        onBundle: (bundle) => seedCacheFromBundle(cache, bundle),
      },
    );
    resources = everything.resources;
    warnings.push(...everything.warnings);
  } catch (error) {
    warnings.push(`$everything failed: ${message(error)}. Trying configured resource searches.`);
  }

  if (resources.length === 0) {
    resources = await loadByType(client, cache, settings, patientId, onProgress, warnings);
  }
  resources = dedupe([patient, ...resources]).filter(
    (resource) => resource.resourceType !== 'Provenance',
  );
  const labeled = resources.some(
    (resource) =>
      resource.resourceType !== 'Patient' &&
      isAiLabeled(aiLabelStatus(resource, { labelCodes: settings.labelCodes })),
  );
  onProgress?.('Loading AI Provenance records…');
  let provenances = await findPatientProvenance(
    client,
    cache,
    settings,
    patientId,
    resources,
    labeled,
    warnings,
  );
  provenances = provenances.filter(isAiProvenance);

  for (const provenance of provenances) {
    const refs = [
      ...(provenance.agent ?? []).flatMap((agent) =>
        agent.who?.reference ? [agent.who.reference] : [],
      ),
      ...(provenance.entity ?? []).flatMap((entity) =>
        entity.what?.reference ? [entity.what.reference] : [],
      ),
      ...(provenance.target ?? []).flatMap((target) =>
        target.reference ? [target.reference] : [],
      ),
      ...(provenance.location?.reference ? [provenance.location.reference] : []),
    ];
    for (const ref of refs) {
      const value = await resolveReference(client, cache, ref, provenance);
      if (value) resolved.set(ref, value);
      else if (!ref.startsWith('#') && !ref.startsWith('urn:'))
        warnings.push(`Could not resolve ${ref} from Provenance/${provenance.id ?? 'unknown'}.`);
    }
  }

  return {
    patient,
    resources,
    provenanceByTarget: indexByTarget(provenances),
    resolved,
    warnings: [...new Set(warnings)],
  };
}

async function loadByType(
  client: FhirClient,
  cache: ReferenceCache,
  settings: Settings,
  patientId: string,
  onProgress: ((message: string) => void) | undefined,
  warnings: string[],
): Promise<fhir4.Resource[]> {
  const resources: fhir4.Resource[] = [];
  for (const type of settings.resourceTypes.filter((item) => item !== 'Patient')) {
    onProgress?.(`Loading ${type}…`);
    try {
      const result = await searchAll<fhir4.Resource>(
        client,
        type,
        { patient: `Patient/${patientId}` },
        {
          pageSize: settings.pageSize,
          maxPages: settings.maxPages,
          onBundle: (bundle) => seedCacheFromBundle(cache, bundle),
        },
      );
      resources.push(...result.resources);
      warnings.push(...result.warnings);
    } catch {
      try {
        const result = await searchAll<fhir4.Resource>(
          client,
          type,
          { subject: `Patient/${patientId}` },
          {
            pageSize: settings.pageSize,
            maxPages: settings.maxPages,
            onBundle: (bundle) => seedCacheFromBundle(cache, bundle),
          },
        );
        resources.push(...result.resources);
        warnings.push(...result.warnings);
      } catch (error) {
        warnings.push(`${type} search failed: ${message(error)}.`);
      }
    }
  }
  return resources;
}

async function findPatientProvenance(
  client: FhirClient,
  cache: ReferenceCache,
  settings: Settings,
  patientId: string,
  resources: fhir4.Resource[],
  labeled: boolean,
  warnings: string[],
): Promise<fhir4.Provenance[]> {
  try {
    const result = await searchAll<fhir4.Provenance>(
      client,
      'Provenance',
      { patient: `Patient/${patientId}` },
      {
        pageSize: settings.pageSize,
        maxPages: settings.maxPages,
        onBundle: (bundle) => seedCacheFromBundle(cache, bundle),
      },
    );
    if (result.resources.length > 0 || !labeled) return result.resources;
  } catch (error) {
    warnings.push(`Provenance patient search failed: ${message(error)}.`);
  }

  if (!labeled) return [];
  const result: fhir4.Provenance[] = [];
  const refs = resources
    .filter((resource) => resource.resourceType !== 'Patient' && resource.id)
    .map((resource) => `${resource.resourceType}/${resource.id}`);
  for (let index = 0; index < refs.length; index += 20) {
    const chunk = refs.slice(index, index + 20).join(',');
    try {
      const page = await searchAll<fhir4.Provenance>(
        client,
        'Provenance',
        { target: chunk },
        {
          pageSize: settings.pageSize,
          maxPages: settings.maxPages,
          onBundle: (bundle) => seedCacheFromBundle(cache, bundle),
        },
      );
      result.push(...page.resources);
      warnings.push(...page.warnings);
    } catch (error) {
      warnings.push(`Provenance target search failed: ${message(error)}.`);
    }
  }
  return dedupe(result).filter(
    (resource): resource is fhir4.Provenance => resource.resourceType === 'Provenance',
  );
}

function dedupe(resources: fhir4.Resource[]): fhir4.Resource[] {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    const key =
      referenceKey(resource.id ? `${resource.resourceType}/${resource.id}` : undefined) ??
      `${resource.resourceType}:${JSON.stringify(resource)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'request error';
}
