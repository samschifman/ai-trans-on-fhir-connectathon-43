import { ScrollArea, Table, Text, Tooltip } from '@mantine/core';
import { useMemo, useState, type ReactNode } from 'react';
import { type AiLabelStatus, isAiLabeled, labelKind } from '../ai/labels';
import AiBadge from './AiBadge';

export interface ResourceAnnotation {
  label: AiLabelStatus;
  provenanceCount: number;
  deviceName?: string;
  humanVerified?: boolean;
  patient?: string;
  inputRefs: string[];
}

export function resourceKey(resource: fhir4.Resource): string {
  return `${resource.resourceType}/${resource.id ?? ''}`;
}

export default function ResourceTable({
  resources,
  annotations,
  onSelect,
}: {
  resources: fhir4.Resource[];
  annotations?: Map<string, ResourceAnnotation>;
  onSelect: (resource: fhir4.Resource) => void;
}) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const types = useMemo(
    () => ['all', ...new Set(resources.map((resource) => resource.resourceType))],
    [resources],
  );
  const visible = resources.filter((resource) => {
    const annotation = annotations?.get(resourceKey(resource));
    const labeled = annotation ? isAiLabeled(annotation.label) : false;
    return (
      (typeFilter === 'all' || resource.resourceType === typeFilter) &&
      (labelFilter === 'all' ||
        (labelFilter === 'ai' && labeled) ||
        (labelFilter === 'none' && !labeled))
    );
  });
  const showPatient = [...(annotations?.values() ?? [])].some((annotation) => annotation.patient);

  return (
    <ScrollArea>
      <div className="filter-row">
        <select
          aria-label="Filter by resource type"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.currentTarget.value)}
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {type === 'all' ? 'All resource types' : type}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by AI label"
          value={labelFilter}
          onChange={(event) => setLabelFilter(event.currentTarget.value)}
        >
          <option value="all">All labels</option>
          <option value="ai">AI-labeled</option>
          <option value="none">Not AI-labeled</option>
        </select>
      </div>
      <Table striped highlightOnHover withTableBorder miw={900}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>
              <HeaderTip label="FHIR resource type, such as Patient or Observation.">
                Type
              </HeaderTip>
            </Table.Th>
            <Table.Th>
              <HeaderTip label="FHIR logical ID. Select the row to inspect the complete resource JSON.">
                ID
              </HeaderTip>
            </Table.Th>
            {showPatient && (
              <Table.Th>
                <HeaderTip label="Patient associated with this target resource.">Patient</HeaderTip>
              </Table.Th>
            )}
            <Table.Th>
              <HeaderTip label="A short human-readable value derived from the resource name, code, or status.">
                Display
              </HeaderTip>
            </Table.Th>
            <Table.Th miw={120}>
              <HeaderTip
                label={
                  'AI label status: resource means the whole resource is labeled; partial means ' +
                  'inline elements are labeled; both means both forms are present.'
                }
              >
                AI label
              </HeaderTip>
            </Table.Th>
            <Table.Th>
              <HeaderTip label="Number of AI Provenance records targeting this resource.">
                Provenance
              </HeaderTip>
            </Table.Th>
            <Table.Th>
              <HeaderTip label="The AI Device identified as the Provenance author.">
                AI Device
              </HeaderTip>
            </Table.Th>
            <Table.Th>
              <HeaderTip label="Whether a qualifying Practitioner, PractitionerRole, or Person verifier is recorded in Provenance.">
                Verified
              </HeaderTip>
            </Table.Th>
            <Table.Th>
              <HeaderTip label="DocumentReference IDs recorded as Provenance inputs.">
                Inputs
              </HeaderTip>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visible.map((resource) => {
            const annotation = annotations?.get(resourceKey(resource));
            const kind = annotation ? labelKind(annotation.label) : 'none';
            const display = resourceDisplay(resource);
            const inputRefs = annotation?.inputRefs.join(', ') || '—';
            return (
              <Table.Tr
                key={resourceKey(resource)}
                onClick={() => onSelect(resource)}
                style={{ cursor: 'pointer' }}
              >
                <Table.Td>
                  <CellTip label={`FHIR resource type: ${resource.resourceType}`}>
                    {resource.resourceType}
                  </CellTip>
                </Table.Td>
                <Table.Td>
                  <CellTip
                    label={`Full FHIR reference: ${resource.resourceType}/${resource.id ?? 'unknown'}`}
                  >
                    {resource.id ?? '—'}
                  </CellTip>
                </Table.Td>
                {showPatient && (
                  <Table.Td>
                    <CellTip label={annotation?.patient ?? 'No patient reference found.'}>
                      {annotation?.patient ?? '—'}
                    </CellTip>
                  </Table.Td>
                )}
                <Table.Td>
                  <CellTip label={display}>{display}</CellTip>
                </Table.Td>
                <Table.Td>
                  <Tooltip label={labelDescription(kind)} withArrow multiline maw={360}>
                    <AiBadge status={annotation?.label} humanVerified={annotation?.humanVerified} />
                  </Tooltip>
                </Table.Td>
                <Table.Td>
                  <CellTip
                    label={`${annotation?.provenanceCount ?? 0} AI Provenance record(s) target this resource.`}
                  >
                    {annotation?.provenanceCount ?? 0}
                  </CellTip>
                </Table.Td>
                <Table.Td>
                  <CellTip
                    label={
                      annotation?.deviceName
                        ? `AI author Device: ${annotation.deviceName}`
                        : 'No AI author Device was resolved.'
                    }
                  >
                    {annotation?.deviceName ?? '—'}
                  </CellTip>
                </Table.Td>
                <Table.Td>
                  <CellTip
                    label={
                      annotation?.humanVerified
                        ? 'A qualifying human verifier is recorded.'
                        : annotation?.provenanceCount
                          ? 'No qualifying human verifier was found in the associated Provenance.'
                          : 'No associated Provenance to verify.'
                    }
                  >
                    {annotation?.humanVerified ? 'Yes' : annotation?.provenanceCount ? 'No' : '—'}
                  </CellTip>
                </Table.Td>
                <Table.Td>
                  <CellTip
                    label={
                      inputRefs === '—'
                        ? 'No Provenance input references.'
                        : `Provenance input references: ${inputRefs}`
                    }
                  >
                    {inputRefs}
                  </CellTip>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      {visible.length === 0 && (
        <Text c="dimmed" mt="sm">
          No resources match the filters.
        </Text>
      )}
    </ScrollArea>
  );
}

function HeaderTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip label={label} withArrow multiline maw={360}>
      <span>{children} ⓘ</span>
    </Tooltip>
  );
}

function CellTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip label={label} withArrow multiline maw={360}>
      <span className="table-tooltip-value">{children}</span>
    </Tooltip>
  );
}

function labelDescription(kind: ReturnType<typeof labelKind>): string {
  switch (kind) {
    case 'resource':
      return 'Resource-level AI label: the entire FHIR resource is labeled as AI-generated.';
    case 'partial':
      return 'Inline AI label: one or more elements inside this resource are labeled as AI-generated.';
    case 'both':
      return 'Both labels: the entire resource and one or more inline elements are labeled as AI-generated.';
    default:
      return 'No configured AI label was found on this resource.';
  }
}

export function resourceDisplay(resource: fhir4.Resource): string {
  const value = resource as fhir4.Resource & { name?: unknown; code?: unknown; status?: unknown };
  const name = displayName(value.name);
  if (name) return name;
  if (typeof value.code === 'string') return value.code;
  if (value.code && typeof value.code === 'object') {
    const code = value.code as { text?: unknown; coding?: unknown };
    if (typeof code.text === 'string' && code.text) return code.text;
    if (Array.isArray(code.coding)) {
      const display = code.coding.find((coding): coding is { display?: unknown } => {
        return (
          !!coding &&
          typeof coding === 'object' &&
          typeof (coding as { display?: unknown }).display === 'string'
        );
      })?.display;
      if (typeof display === 'string' && display) return display;
    }
  }
  return typeof value.status === 'string' ? value.status : '—';
}

function displayName(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const name = item as { text?: unknown; given?: unknown; family?: unknown };
    if (typeof name.text === 'string' && name.text) return name.text;
    const parts = [
      Array.isArray(name.given)
        ? name.given.filter((part): part is string => typeof part === 'string').join(' ')
        : undefined,
      typeof name.family === 'string' ? name.family : undefined,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }
  return undefined;
}
