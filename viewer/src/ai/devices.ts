const AI_DEVICE_PROFILE = 'http://hl7.org/fhir/uv/aitransparency/StructureDefinition/AI-Device';
const AI_KIND_URL =
  'http://hl7.org/fhir/uv/aitransparency/StructureDefinition/aitransparency.AIKind';

export interface DeviceDisplay {
  name?: string;
  manufacturer?: string;
  version?: string;
  aiKind?: string;
}

export function isAiDevice(device: fhir4.Device, referencedByProvenance = false): boolean {
  return (
    !!device.meta?.profile?.includes(AI_DEVICE_PROFILE) ||
    hasAiKind(device) ||
    referencedByProvenance
  );
}

export function deviceDisplay(device: fhir4.Device): DeviceDisplay {
  const deviceName = device.deviceName?.[0]?.name;
  const aiKindExtension = device.extension?.find((extension) => extension.url === AI_KIND_URL);
  const codeable = aiKindExtension?.valueCodeableConcept;
  const coding = codeable?.coding?.[0] ?? aiKindExtension?.valueCoding;
  return {
    name: deviceName,
    manufacturer: device.manufacturer,
    version: device.version?.[0]?.value ?? deviceName,
    aiKind: coding?.display ?? coding?.code,
  };
}

function hasAiKind(device: fhir4.Device): boolean {
  return device.extension?.some((extension) => extension.url === AI_KIND_URL) ?? false;
}
