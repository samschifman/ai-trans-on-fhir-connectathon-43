const AI_PROVENANCE_PROFILE =
  'http://hl7.org/fhir/uv/aitransparency/StructureDefinition/AI-Provenance';
const AGENT_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/provenance-participant-type';

export interface ProvenanceSummary {
  provenance: fhir4.Provenance;
  recorded?: string;
  activity?: string;
  authorRefs: string[];
  verifierRefs: string[];
  otherAgentRefs: string[];
  entityRefs: { role: string; ref: string }[];
  targetRefs: string[];
  locationRef?: string;
  policyUris: string[];
  humanVerified: boolean;
}

export function isAiProvenance(provenance: fhir4.Provenance): boolean {
  if (provenance.meta?.profile?.includes(AI_PROVENANCE_PROFILE)) return true;
  return (provenance.agent ?? []).some((agent) => agent.who?.reference?.split('/')[0] === 'Device');
}

export function summarizeProvenance(provenance: fhir4.Provenance): ProvenanceSummary {
  const authorRefs: string[] = [];
  const verifierRefs: string[] = [];
  const otherAgentRefs: string[] = [];
  for (const agent of provenance.agent ?? []) {
    const ref = agent.who?.reference;
    if (!ref) continue;
    const code = agent.type?.coding?.find((coding) => {
      return (!coding.system || coding.system === AGENT_TYPE_SYSTEM) && !!coding.code;
    })?.code;
    if (code === 'author' || (ref.split('/')[0] === 'Device' && code !== 'verifier'))
      authorRefs.push(ref);
    else if (code === 'verifier') verifierRefs.push(ref);
    else otherAgentRefs.push(ref);
  }
  const validVerifierRefs = (provenance.agent ?? [])
    .filter((agent) => isVerifier(agent))
    .map((agent) => agent.who?.reference)
    .filter((ref): ref is string => !!ref);
  return {
    provenance,
    recorded: provenance.recorded,
    activity:
      provenance.activity?.text ??
      provenance.activity?.coding
        ?.map((coding) => coding.display ?? coding.code)
        .filter(Boolean)
        .join(', '),
    authorRefs,
    verifierRefs,
    otherAgentRefs,
    entityRefs: (provenance.entity ?? []).flatMap((entity) =>
      entity.what?.reference ? [{ role: entity.role, ref: entity.what.reference }] : [],
    ),
    targetRefs: (provenance.target ?? [])
      .map((target) => target.reference)
      .filter((ref): ref is string => !!ref),
    locationRef: provenance.location?.reference,
    policyUris: provenance.policy ?? [],
    humanVerified: validVerifierRefs.length > 0,
  };
}

export function indexByTarget(provenances: fhir4.Provenance[]): Map<string, fhir4.Provenance[]> {
  const index = new Map<string, fhir4.Provenance[]>();
  for (const provenance of provenances) {
    for (const target of provenance.target ?? []) {
      const key = referenceKey(target.reference);
      if (!key) continue;
      index.set(key, [...(index.get(key) ?? []), provenance]);
    }
  }
  return index;
}

export function referenceKey(reference: string | undefined): string | undefined {
  if (!reference || reference.startsWith('#') || reference.startsWith('urn:')) return undefined;
  const parts = reference.split('?')[0].split('/').filter(Boolean);
  const typeIndex = parts.findIndex(
    (part, index) => index < parts.length - 1 && /^[A-Z][A-Za-z]+$/.test(part),
  );
  return typeIndex >= 0 ? `${parts[typeIndex]}/${parts[typeIndex + 1]}` : undefined;
}

function isVerifier(agent: fhir4.ProvenanceAgent): boolean {
  const code = agent.type?.coding?.find((coding) => {
    return coding.code === 'verifier' && (!coding.system || coding.system === AGENT_TYPE_SYSTEM);
  })?.code;
  const type = agent.who?.reference?.split('/')[0];
  return (
    code === 'verifier' &&
    (type === 'Practitioner' || type === 'PractitionerRole' || type === 'Person')
  );
}
