import { describe, expect, it } from 'vitest';
import { collectAiLabeled, countByType } from '../src/ai/filter';
import { isAiProvenance, summarizeProvenance } from '../src/ai/provenance';
import { loadPatientData } from '../src/ai/patient';
import { recallByProvenanceSearch } from '../src/ai/recall';
import { DEFAULT_SETTINGS } from '../src/config/settings';
import { FhirClient } from '../src/fhir/client';
import { ReferenceCache } from '../src/fhir/references';

const baseUrl = process.env.VIEWER_LIVE_BASE_URL;
const settings = baseUrl ? { ...DEFAULT_SETTINGS, baseUrl } : DEFAULT_SETTINGS;
const bunny = 'bc6c0979-d5ea-df89-4c8e-66a8bf793efd';
const lacey = 'c3e0ca99-dda5-3867-7dd4-6b63882af19e';
const devices = ['ai-device-1', 'ai-device-2', 'ai-device-3'];

describe.skipIf(!baseUrl)('live HAPI data', () => {
  const client = new FhirClient(settings, () => undefined);

  it('loads Bunny with five AI targets and the documented verification flags', async () => {
    const data = await loadPatientData(client, new ReferenceCache(), settings, bunny);
    expect(data.resources).toHaveLength(36);
    expect(data.provenanceByTarget.size).toBe(5);
    expect(
      data.resources.some((resource) =>
        ['Device', 'DocumentReference', 'Practitioner', 'Provenance'].includes(
          resource.resourceType,
        ),
      ),
    ).toBe(false);
    const verified = new Map(
      [...data.provenanceByTarget.entries()].map(([key, records]) => [
        key,
        summarizeProvenance(records[0]).humanVerified,
      ]),
    );
    expect(verified).toEqual(
      new Map([
        ['MedicationRequest/bc6c0979-d5ea-df89-300a-70745d3c607d', true],
        ['Observation/bc6c0979-d5ea-df89-dfdb-edd34d7f380f', false],
        ['Observation/bc6c0979-d5ea-df89-32db-761e2f4d4fa9', false],
        ['Observation/bc6c0979-d5ea-df89-71ee-6d4504ec2bc5', true],
        ['Observation/bc6c0979-d5ea-df89-a015-5477bb4ce448', false],
      ]),
    );
  }, 120_000);

  it('loads Lacey without AI targets or warnings', async () => {
    const data = await loadPatientData(client, new ReferenceCache(), settings, lacey);
    expect(data.provenanceByTarget.size).toBe(0);
    expect(data.warnings).toHaveLength(0);
  }, 120_000);

  it('counts and collects the documented AI resources', async () => {
    const cache = new ReferenceCache();
    const rows = await countByType(client, cache, settings, {});
    const labeledTypes = [
      'Observation',
      'Condition',
      'DiagnosticReport',
      'AllergyIntolerance',
      'MedicationRequest',
    ];
    expect(
      rows
        .filter((row) => labeledTypes.includes(row.type))
        .reduce((sum, row) => sum + (row.ai ?? 0), 0),
    ).toBe(106);
    const result = await collectAiLabeled(client, cache, settings, {}, () => undefined);
    const labeled = result.resources.filter((resource) =>
      labeledTypes.includes(resource.resourceType),
    );
    expect(labeled).toHaveLength(106);
    expect(result.resources.filter((resource) => isAiProvenance(resource)).length).toBe(106);
    expect(result.resources.filter((resource) => resource.resourceType === 'Device')).toHaveLength(
      3,
    );
    expect(
      result.resources.filter((resource) => resource.resourceType === 'DocumentReference'),
    ).toHaveLength(5);
    expect(
      result.resources.filter((resource) => resource.resourceType === 'Practitioner'),
    ).toHaveLength(1);
  }, 120_000);

  it.each([
    ['ai-device-1', 40, 7],
    ['ai-device-2', 34, 7],
    ['ai-device-3', 32, 6],
  ])(
    'recalls %s with %i Provenances and %i patients',
    async (id, provenanceCount, patientCount) => {
      const result = await recallByProvenanceSearch(
        client,
        new ReferenceCache(),
        settings,
        'agent',
        `Device/${id}`,
      );
      expect(result.provenances).toHaveLength(provenanceCount);
      expect(result.patients).toHaveLength(patientCount);
    },
    120_000,
  );

  it('has pairwise-disjoint device target sets', async () => {
    const sets = await Promise.all(
      devices.map(async (id) => {
        const result = await recallByProvenanceSearch(
          client,
          new ReferenceCache(),
          settings,
          'agent',
          `Device/${id}`,
        );
        return new Set(result.targets.map((resource) => `${resource.resourceType}/${resource.id}`));
      }),
    );
    expect([...sets[0]].some((key) => sets[1].has(key) || sets[2].has(key))).toBe(false);
    expect([...sets[1]].some((key) => sets[2].has(key))).toBe(false);
  }, 120_000);

  it.each([
    ['prompt-1', 29, 0],
    ['prompt-2', 19, 13],
    ['prompt-3', 24, 0],
    ['prompt-4', 10, 0],
    ['prompt-5', 24, 0],
  ])(
    'recalls %s with %i Provenances and the expected patient span',
    async (id, provenanceCount, patientCount) => {
      const result = await recallByProvenanceSearch(
        client,
        new ReferenceCache(),
        settings,
        'entity',
        `DocumentReference/${id}`,
      );
      expect(result.provenances).toHaveLength(provenanceCount);
      if (patientCount) expect(result.patients).toHaveLength(patientCount);
    },
    120_000,
  );
});
