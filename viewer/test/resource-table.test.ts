import { describe, expect, it } from 'vitest';
import { resourceDisplay } from '../src/components/ResourceTable';

describe('resource table display values', () => {
  it('formats a Patient HumanName array as text', () => {
    expect(
      resourceDisplay({
        resourceType: 'Patient',
        id: 'patient-1',
        name: [{ given: ['Bunny'], family: 'Donnelly' }],
      } as fhir4.Patient),
    ).toBe('Bunny Donnelly');
  });

  it('formats CodeableConcept and status values', () => {
    expect(
      resourceDisplay({
        resourceType: 'Observation',
        code: { text: 'Blood pressure' },
      } as fhir4.Observation),
    ).toBe('Blood pressure');
    expect(
      resourceDisplay({ resourceType: 'Encounter', status: 'finished' } as fhir4.Encounter),
    ).toBe('finished');
  });
});
