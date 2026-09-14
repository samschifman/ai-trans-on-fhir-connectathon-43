export interface LabelCode {
  system: string;
  code: string;
}

export interface LabelConfig {
  labelCodes: LabelCode[];
}

export function securityToken(labelCodes: LabelCode[]): string {
  const label = labelCodes[0];
  if (!label) return '';
  return label.system ? `${label.system}|${label.code}` : label.code;
}

export interface AiLabelStatus {
  resourceLevel: boolean;
  elementPaths: string[];
}

const INLINE_LABEL_URL =
  'http://hl7.org/fhir/uv/security-label-ds4p/StructureDefinition/extension-inline-sec-label';

export function aiLabelStatus(resource: fhir4.Resource, config: LabelConfig): AiLabelStatus {
  const resourceLevel = matchesCodingList(resource.meta?.security, config.labelCodes);
  const paths: string[] = [];
  walkForInlineLabels(resource, '', config.labelCodes, paths);
  return { resourceLevel, elementPaths: [...new Set(paths)] };
}

export function isAiLabeled(status: AiLabelStatus): boolean {
  return status.resourceLevel || status.elementPaths.length > 0;
}

export function labelKind(status: AiLabelStatus): 'none' | 'resource' | 'partial' | 'both' {
  if (status.resourceLevel && status.elementPaths.length > 0) return 'both';
  if (status.resourceLevel) return 'resource';
  if (status.elementPaths.length > 0) return 'partial';
  return 'none';
}

function walkForInlineLabels(
  value: unknown,
  path: string,
  codes: LabelCode[],
  paths: string[],
): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForInlineLabels(item, `${path}[${index}]`, codes, paths));
    return;
  }
  const object = value as Record<string, unknown>;
  if (path && hasInlineLabel(object.extension, codes)) paths.push(path);
  for (const [key, child] of Object.entries(object)) {
    if (key === 'meta' || key === 'contained' || key === 'extension') continue;
    const childPath = key.startsWith('_') ? `${path}${key.slice(1)}` : `${path}${key}`;
    walkForInlineLabels(child, childPath, codes, paths);
  }
}

function hasInlineLabel(value: unknown, codes: LabelCode[]): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((extension) => {
    if (!extension || typeof extension !== 'object') return false;
    const candidate = extension as {
      url?: unknown;
      valueCoding?: { code?: unknown; system?: unknown };
    };
    return candidate.url === INLINE_LABEL_URL && matchesCode(candidate.valueCoding, codes);
  });
}

function matchesCodingList(value: unknown, codes: LabelCode[]): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((coding) => matchesCode(coding, codes));
}

function matchesCode(value: unknown, codes: LabelCode[]): boolean {
  if (!value || typeof value !== 'object') return false;
  const coding = value as { code?: unknown; system?: unknown };
  return codes.some((candidate) => {
    return (
      coding.code === candidate.code && (!candidate.system || coding.system === candidate.system)
    );
  });
}
