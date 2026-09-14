import { useState } from 'react';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { deviceDisplay } from '../ai/devices';
import { summarizeProvenance } from '../ai/provenance';
import JsonView from './JsonView';
import PromptDisclosure from './PromptDisclosure';

export default function ProvenanceCard({
  provenance,
  resolved,
}: {
  provenance: fhir4.Provenance;
  resolved: Map<string, fhir4.Resource>;
}) {
  const [raw, setRaw] = useState(false);
  const navigate = useNavigate();
  const summary = summarizeProvenance(provenance);
  return (
    <Card withBorder>
      <Stack gap="xs">
        <ProvenanceHeader
          provenance={provenance}
          raw={raw}
          onToggle={() => setRaw((value) => !value)}
        />
        <ProvenanceMetadata summary={summary} />
        <ProvenanceReferences summary={summary} resolved={resolved} navigate={navigate} />
        {summary.policyUris.length > 0 && (
          <Text size="sm">Policy: {summary.policyUris.join(', ')}</Text>
        )}
        {raw && <JsonView value={provenance} />}
      </Stack>
    </Card>
  );
}

function ProvenanceHeader({
  provenance,
  raw,
  onToggle,
}: {
  provenance: fhir4.Provenance;
  raw: boolean;
  onToggle: () => void;
}) {
  return (
    <Group justify="space-between">
      <Text fw={600}>Provenance/{provenance.id ?? 'unknown'}</Text>
      <Button size="xs" variant="subtle" onClick={onToggle}>
        {raw ? 'Hide raw JSON' : 'Show raw JSON'}
      </Button>
    </Group>
  );
}

function ProvenanceMetadata({ summary }: { summary: ReturnType<typeof summarizeProvenance> }) {
  return (
    <>
      <Text size="sm">
        Recorded: {summary.recorded ?? '—'} · Activity: {summary.activity ?? '—'}
      </Text>
      <Text size="sm">Human verified: {summary.humanVerified ? 'Yes' : 'No'}</Text>
    </>
  );
}

function ProvenanceReferences({
  summary,
  resolved,
  navigate,
}: {
  summary: ReturnType<typeof summarizeProvenance>;
  resolved: Map<string, fhir4.Resource>;
  navigate: (to: string) => void;
}) {
  return (
    <>
      {summary.authorRefs.map((ref) => (
        <ReferenceRow
          key={`author-${ref}`}
          refValue={ref}
          label="Author"
          resource={resolved.get(ref)}
          onOpen={() => navigate(`/devices?ref=${encodeURIComponent(ref)}`)}
        />
      ))}
      {summary.verifierRefs.map((ref) => (
        <ReferenceRow
          key={`verifier-${ref}`}
          refValue={ref}
          label="Verifier"
          resource={resolved.get(ref)}
        />
      ))}
      {summary.entityRefs.map(({ ref, role }) => (
        <ReferenceRow
          key={`entity-${ref}`}
          refValue={ref}
          label={`Input (${role})`}
          resource={resolved.get(ref)}
          prompt
          onOpen={() => navigate(`/inputs?ref=${encodeURIComponent(ref)}`)}
        />
      ))}
      {summary.locationRef && (
        <ReferenceRow
          refValue={summary.locationRef}
          label="Location"
          resource={resolved.get(summary.locationRef)}
        />
      )}
    </>
  );
}

function ReferenceRow({
  refValue,
  label,
  resource,
  prompt,
  onOpen,
}: {
  refValue: string;
  label: string;
  resource?: fhir4.Resource;
  prompt?: boolean;
  onOpen?: () => void;
}) {
  return (
    <Group justify="space-between" align="start">
      <div>
        <Text size="sm" fw={600}>
          {label}
        </Text>
        {prompt && resource?.resourceType === 'DocumentReference' ? (
          <>
            <Text size="sm">{refValue}</Text>
            <PromptDisclosure document={resource as fhir4.DocumentReference} />
          </>
        ) : (
          <Text size="sm">
            {refValue.startsWith('#') ? 'Contained resource · ' : ''}
            {resource ? resourceDisplay(resource) : refValue}
          </Text>
        )}
      </div>
      {onOpen && (
        <Button size="xs" variant="light" onClick={onOpen}>
          Open
        </Button>
      )}
    </Group>
  );
}
function resourceDisplay(resource: fhir4.Resource): string {
  if (resource.resourceType === 'Device') {
    const display = deviceDisplay(resource as fhir4.Device);
    return `${display.name ?? resource.id ?? ''} · ${display.aiKind ?? 'AI kind unknown'} · ${display.version ?? 'version unknown'}`;
  }
  if (resource.resourceType === 'Practitioner') {
    const practitioner = resource as fhir4.Practitioner;
    const name = practitioner.name?.[0];
    return (
      name?.text ??
      ([name?.given?.join(' '), name?.family].filter(Boolean).join(' ') || resource.id || '')
    );
  }
  return `${resource.resourceType}/${resource.id ?? ''}`;
}
