import { describe, expect, it } from 'vitest';
import { summarizeCapability } from '../src/fhir/capability';

describe('CapabilityStatement summary', () => {
  it('summarizes advertised search features and operations', () => {
    const summary = summarizeCapability({
      resourceType: 'CapabilityStatement',
      fhirVersion: '4.0.1',
      software: { name: 'Test HAPI', version: '1.0' },
      rest: [
        {
          mode: 'server',
          operation: [{ name: 'everything', definition: 'x' }],
          resource: [
            {
              type: 'Patient',
              searchInclude: ['Provenance:target'],
            },
          ],
        },
      ],
    });
    expect(summary.fhirVersion).toBe('4.0.1');
    expect(summary.software).toBe('Test HAPI 1.0');
    expect(summary.supports._include).toBe(true);
    expect(summary.supports._summary).toBe('unknown');
    expect(summary.supports.everything).toBe(true);
  });
});
