export type AuthMode = 'none' | 'basic' | 'bearer';

export interface LabelCode {
  system: string;
  code: string;
}

export interface ExtraHeader {
  name: string;
  value: string;
}

export interface Settings {
  baseUrl: string;
  auth: { mode: AuthMode; username?: string; password?: string; token?: string };
  extraHeaders: ExtraHeader[];
  useProxy: boolean;
  proxyOrigin: string;
  resourceTypes: string[];
  labelCodes: LabelCode[];
  pageSize: number;
  maxPages: number;
  timeoutMs: number;
}

export interface ServerPreset {
  name: string;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'http://localhost:8080/fhir',
  auth: { mode: 'none' },
  extraHeaders: [],
  useProxy: false,
  proxyOrigin: '',
  resourceTypes: [
    'Observation',
    'Condition',
    'DiagnosticReport',
    'AllergyIntolerance',
    'MedicationRequest',
    'Procedure',
    'Immunization',
    'Encounter',
    'DocumentReference',
    'ClaimResponse',
    'Patient',
  ],
  labelCodes: [
    {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationValue',
      code: 'AIAST',
    },
  ],
  pageSize: 100,
  maxPages: 50,
  timeoutMs: 30000,
};

const SETTINGS_KEY = 'fhir-transparency-viewer.settings';
const PRESETS_KEY = 'fhir-transparency-viewer.presets';

function copySettings(settings: Settings): Settings {
  return JSON.parse(JSON.stringify(settings)) as Settings;
}

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return copySettings(DEFAULT_SETTINGS);
  const candidate = value as Partial<Settings>;
  const auth = candidate.auth && typeof candidate.auth === 'object' ? candidate.auth : {};
  return {
    ...copySettings(DEFAULT_SETTINGS),
    ...candidate,
    auth: {
      ...DEFAULT_SETTINGS.auth,
      ...auth,
    },
    extraHeaders: Array.isArray(candidate.extraHeaders) ? candidate.extraHeaders : [],
    resourceTypes: Array.isArray(candidate.resourceTypes)
      ? candidate.resourceTypes.filter((type): type is string => typeof type === 'string')
      : DEFAULT_SETTINGS.resourceTypes,
    labelCodes: Array.isArray(candidate.labelCodes)
      ? candidate.labelCodes
      : DEFAULT_SETTINGS.labelCodes,
    pageSize:
      Number.isFinite(candidate.pageSize) && candidate.pageSize! > 0
        ? candidate.pageSize!
        : DEFAULT_SETTINGS.pageSize,
    maxPages:
      Number.isFinite(candidate.maxPages) && candidate.maxPages! > 0
        ? candidate.maxPages!
        : DEFAULT_SETTINGS.maxPages,
    timeoutMs:
      Number.isFinite(candidate.timeoutMs) && candidate.timeoutMs! > 0
        ? candidate.timeoutMs!
        : DEFAULT_SETTINGS.timeoutMs,
  };
}

export function loadSettings(): Settings {
  const storage = browserStorage();
  if (!storage) return copySettings(DEFAULT_SETTINGS);
  try {
    return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return copySettings(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings: Settings): void {
  browserStorage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadPresets(): ServerPreset[] {
  const builtIn: ServerPreset = { name: 'Local HAPI', settings: copySettings(DEFAULT_SETTINGS) };
  const storage = browserStorage();
  if (!storage) return [builtIn];
  try {
    const saved = JSON.parse(storage.getItem(PRESETS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(saved)) return [builtIn];
    return [
      builtIn,
      ...saved
        .filter((item): item is { name: string; settings: unknown } => {
          return (
            !!item &&
            typeof item === 'object' &&
            typeof (item as { name?: unknown }).name === 'string'
          );
        })
        .map((item) => ({ name: item.name, settings: normalizeSettings(item.settings) })),
    ];
  } catch {
    return [builtIn];
  }
}

export function savePresets(presets: ServerPreset[]): void {
  const saved = presets.filter((preset) => preset.name !== 'Local HAPI');
  browserStorage()?.setItem(PRESETS_KEY, JSON.stringify(saved));
}
