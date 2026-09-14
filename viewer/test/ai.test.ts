import { describe, expect, it } from 'vitest';
import { aiLabelStatus, labelKind, securityToken } from '../src/ai/labels';
import { deviceDisplay, isAiDevice } from '../src/ai/devices';
import { decodePromptText, isInputDocument } from '../src/ai/inputs';
import { isAiProvenance, summarizeProvenance } from '../src/ai/provenance';
import { DEFAULT_SETTINGS } from '../src/config/settings';
import { readBundle, resources } from './fixtures';

const labelConfig = { labelCodes: DEFAULT_SETTINGS.labelCodes };

describe('AI resource logic', () => {
  it('formats security tokens with or without a coding system', () => {
    expect(securityToken([{ system: 'urn:test', code: 'AIAST' }])).toBe('urn:test|AIAST');
    expect(securityToken([{ system: '', code: 'AIAST' }])).toBe('AIAST');
  });

  it("finds all five resource-level labels in Bunny's bundle", () => {
    const bunny = resources(readBundle('test_data/labeled/bunny_donnelly_bundle.json'));
    const labeled = bunny.filter((resource) => aiLabelStatus(resource, labelConfig).resourceLevel);
    expect(labeled).toHaveLength(5);
  });

  it('classifies verifier and author-only Provenance records', () => {
    const provenances = resources(
      readBundle('test_data/labeled/bunny_donnelly_bundle.json'),
    ).filter((resource): resource is fhir4.Provenance => resource.resourceType === 'Provenance');
    expect(provenances.every(isAiProvenance)).toBe(true);
    expect(summarizeProvenance(provenances[0]).humanVerified).toBe(true);
    expect(summarizeProvenance(provenances[1]).humanVerified).toBe(false);
    expect(summarizeProvenance(provenances[0]).authorRefs).toEqual(['Device/ai-device-3']);
  });

  it('recognizes all infrastructure devices and displays AIKind/version', () => {
    const devices = resources(
      readBundle('test_data/infrastructure/infrastructure_bundle.json'),
    ).filter((resource): resource is fhir4.Device => resource.resourceType === 'Device');
    expect(devices).toHaveLength(3);
    expect(devices.every((device) => isAiDevice(device))).toBe(true);
    expect(deviceDisplay(devices[0]).aiKind).toBeTruthy();
    expect(deviceDisplay(devices[0]).version).toBeTruthy();
  });

  it('recognizes and decodes all five input prompts', () => {
    const documents = resources(
      readBundle('test_data/infrastructure/infrastructure_bundle.json'),
    ).filter(
      (resource): resource is fhir4.DocumentReference =>
        resource.resourceType === 'DocumentReference',
    );
    expect(documents).toHaveLength(5);
    expect(documents.every((document) => isInputDocument(document))).toBe(true);
    for (const document of documents) {
      const decoded = decodePromptText(document);
      expect(decoded.text?.match(/System Prompt/g)).toHaveLength(1);
      expect(decoded.description).toBeUndefined();
    }
  });

  it('tracks resource and inline labels independently', () => {
    const report = {
      resourceType: 'DiagnosticReport',
      id: 'f202',
      meta: { security: [{ system: labelConfig.labelCodes[0].system, code: 'AIAST' }] },
      conclusion: 'AI conclusion',
      _conclusion: {
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/security-label-ds4p/StructureDefinition/extension-inline-sec-label',
            valueCoding: { system: labelConfig.labelCodes[0].system, code: 'AIAST' },
          },
        ],
      },
      conclusionCode: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/uv/security-label-ds4p/StructureDefinition/extension-inline-sec-label',
              valueCoding: { system: labelConfig.labelCodes[0].system, code: 'AIAST' },
            },
          ],
        },
      ],
    } as fhir4.DiagnosticReport;
    const status = aiLabelStatus(report, labelConfig);
    expect(status.resourceLevel).toBe(true);
    expect(status.elementPaths).toEqual(['conclusion', 'conclusionCode[0]']);
    expect(labelKind(status)).toBe('both');
  });
});
