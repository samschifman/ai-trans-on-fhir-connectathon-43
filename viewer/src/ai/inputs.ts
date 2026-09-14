const INPUT_PROFILE = 'http://hl7.org/fhir/uv/aitransparency/StructureDefinition/AI-InputPrompt';
const INPUT_SYSTEM = 'http://hl7.org/fhir/uv/aitransparency/CodeSystem/AIinputsCS';

export function isInputDocument(
  document: fhir4.DocumentReference,
  referencedByProvenance = false,
): boolean {
  const typeMatch = document.type?.coding?.some(
    (coding) => coding.system === INPUT_SYSTEM && coding.code === 'AIInputPrompt',
  );
  return !!typeMatch || !!document.meta?.profile?.includes(INPUT_PROFILE) || referencedByProvenance;
}

export interface DecodedPromptText {
  description?: string;
  text?: string;
  note?: string;
}

export function decodePromptText(document: fhir4.DocumentReference): DecodedPromptText {
  const description = document.description?.trim() || undefined;
  let text: string | undefined;
  let note: string | undefined;
  for (const content of document.content ?? []) {
    const attachment = content.attachment;
    if (!attachment?.data) continue;
    if (
      !attachment.contentType ||
      (!/^text\//i.test(attachment.contentType) && attachment.contentType !== 'application/json')
    ) {
      note ??= `binary, ${decodedByteLength(attachment.data)} bytes`;
      continue;
    }
    if (text) continue;
    try {
      text = decodeBase64Utf8(attachment.data);
    } catch {
      note ??= 'Unable to decode attachment data';
    }
  }
  return { description: description === text?.trim() ? undefined : description, text, note };
}

export function promptPreview(document: fhir4.DocumentReference, maxChars = 160): string {
  const decoded = decodePromptText(document);
  const value = (decoded.text ?? decoded.description ?? decoded.note ?? '').split(/\r?\n/, 1)[0];
  return value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 1))}…` : value;
}

export function promptBody(document: fhir4.DocumentReference): string {
  const decoded = decodePromptText(document);
  return [decoded.description, decoded.text, decoded.note].filter(Boolean).join('\n\n');
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodedByteLength(value: string): number {
  try {
    return atob(value).length;
  } catch {
    return value.length;
  }
}
