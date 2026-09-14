import { Stack, Text, Title } from '@mantine/core';
import { aiLabelStatus } from '../ai/labels';
import { useSettings } from '../config/SettingsContext';
import JsonView from './JsonView';
import ProvenanceCard from './ProvenanceCard';

export default function DetailPanel({
  resource,
  provenances,
  resolved,
}: {
  resource?: fhir4.Resource;
  provenances: fhir4.Provenance[];
  resolved: Map<string, fhir4.Resource>;
}) {
  const { settings } = useSettings();
  if (!resource) return <Text c="dimmed">Select a resource to inspect it.</Text>;
  const label = aiLabelStatus(resource, { labelCodes: settings.labelCodes });
  return (
    <Stack gap="md">
      <DetailHeader resource={resource} provenanceCount={provenances.length} />
      <JsonView value={resource} paths={label.elementPaths} />
      <ProvenanceList provenances={provenances} resolved={resolved} />
    </Stack>
  );
}

function DetailHeader({
  resource,
  provenanceCount,
}: {
  resource: fhir4.Resource;
  provenanceCount: number;
}) {
  return (
    <div>
      <Title order={3}>
        {resource.resourceType}/{resource.id ?? 'unknown'}
      </Title>
      <Text size="sm" c="dimmed">
        {provenanceCount} associated AI Provenance record(s)
      </Text>
    </div>
  );
}

function ProvenanceList({
  provenances,
  resolved,
}: {
  provenances: fhir4.Provenance[];
  resolved: Map<string, fhir4.Resource>;
}) {
  return (
    <>
      {provenances.map((provenance) => (
        <ProvenanceCard key={provenance.id} provenance={provenance} resolved={resolved} />
      ))}
    </>
  );
}
