import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/pages/patient/PatientGraph';

describe('patient graph layout', () => {
  it('places the Patient at the center with related resources around it', () => {
    const resources = [
      { resourceType: 'Patient', id: 'patient-1' },
      { resourceType: 'Observation', id: 'one', subject: { reference: 'Patient/patient-1' } },
      { resourceType: 'Observation', id: 'two', subject: { reference: 'Patient/patient-1' } },
      { resourceType: 'Condition', id: 'three', subject: { reference: 'Patient/patient-1' } },
      { resourceType: 'Procedure', id: 'four', subject: { reference: 'Patient/patient-1' } },
    ] as fhir4.Resource[];
    const annotations = new Map([
      [
        'Observation/one',
        { label: { resourceLevel: true, elementPaths: [] }, provenanceCount: 1, inputRefs: [] },
      ],
    ]);
    const { nodes } = buildGraph(resources, annotations);
    const patient = nodes.find((node) => node.id === 'Patient/patient-1');
    const aiNode = nodes.find((node) => node.id === 'Observation/one');
    const others = nodes.filter((node) => node.id !== 'Patient/patient-1');

    expect(patient?.position).toEqual({ x: -95, y: -35 });
    expect(others.some((node) => node.position.x > 0)).toBe(true);
    expect(others.some((node) => node.position.x < 0)).toBe(true);
    expect(others.some((node) => node.position.y > 0)).toBe(true);
    expect(others.some((node) => node.position.y < 0)).toBe(true);
    expect(aiNode?.data.aiKind).toBe('resource');
    expect(aiNode?.data.fullReference).toBe('Observation/one');
  });
});
