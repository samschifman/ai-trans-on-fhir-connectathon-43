import { Alert, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { buildTransactionBundle } from '../fhir/bundle';
import { deviceDisplay } from '../ai/devices';
import { aiLabelStatus } from '../ai/labels';
import { summarizeProvenance, referenceKey } from '../ai/provenance';
import { useSettings } from '../config/SettingsContext';
import type { RecallResult } from '../ai/recall';
import ResourceTable, { resourceKey, type ResourceAnnotation } from './ResourceTable';
import DetailPanel from './DetailPanel';
import DownloadButton from './DownloadButton';

export default function RecallResults({
  result,
  progress,
}: {
  result: RecallResult;
  progress?: string;
}) {
  const { settings } = useSettings();
  const [selected, setSelected] = useState<fhir4.Resource>();
  const annotations = useMemo(
    () => buildAnnotations(result, settings.labelCodes),
    [result, settings.labelCodes],
  );
  const selectedProvenances = selected
    ? result.provenances.filter((provenance) =>
        (provenance.target ?? []).some(
          (target) => referenceKey(target.reference) === resourceKey(selected),
        ),
      )
    : [];
  const download = async () =>
    buildTransactionBundle([...result.targets, ...result.provenances, ...result.resolved.values()]);
  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Title order={3}>{result.provenances.length} Provenance records</Title>
        {progress && <Text c="dimmed">{progress}</Text>}
      </Paper>
      <Paper withBorder p="md">
        <Title order={4}>Resources touched by type</Title>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Type</Table.Th>
              <Table.Th>Touched</Table.Th>
              <Table.Th>Total on server</Table.Th>
              <Table.Th>Percent</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {result.byType.map((row) => (
              <Table.Tr key={row.type}>
                <Table.Td>{row.type}</Table.Td>
                <Table.Td>{row.touched}</Table.Td>
                <Table.Td>{row.total ?? 'unknown'}</Table.Td>
                <Table.Td>
                  {row.total ? `${Math.round((row.touched / row.total) * 100)}%` : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Paper withBorder p="md">
        <Title order={4}>Distinct patients ({result.patients.length})</Title>
        <Text size="sm">
          {result.patients.map((patient) => `${patient.display} (${patient.ref})`).join(', ') ||
            'No patient references found.'}
        </Text>
      </Paper>
      {result.unresolvedTargets.length > 0 && (
        <Alert color="yellow">Unresolved targets: {result.unresolvedTargets.join(', ')}</Alert>
      )}
      {result.warnings.length > 0 && <Alert color="yellow">{result.warnings.join(' ')}</Alert>}
      <Group>
        <DownloadButton
          label="Download results bundle"
          filename={`results-${Date.now()}.json`}
          produce={download}
        />
      </Group>
      <ResourceTable resources={result.targets} annotations={annotations} onSelect={setSelected} />
      <Paper withBorder p="md">
        <DetailPanel
          resource={selected}
          provenances={selectedProvenances}
          resolved={result.resolved}
        />
      </Paper>
    </Stack>
  );
}

function buildAnnotations(
  result: RecallResult,
  labelCodes: { system: string; code: string }[],
): Map<string, ResourceAnnotation> {
  const map = new Map<string, ResourceAnnotation>();
  for (const target of result.targets) {
    const provenances = result.provenances.filter((provenance) =>
      (provenance.target ?? []).some(
        (reference) => referenceKey(reference.reference) === resourceKey(target),
      ),
    );
    const summaries = provenances.map(summarizeProvenance);
    const deviceRef = summaries.flatMap((summary) => summary.authorRefs)[0];
    const device = deviceRef ? result.resolved.get(deviceRef) : undefined;
    const deviceName =
      device?.resourceType === 'Device'
        ? (deviceDisplay(device as fhir4.Device).name ?? device.id)
        : undefined;
    const targetWithPatient = target as fhir4.Resource & {
      subject?: fhir4.Reference;
      patient?: fhir4.Reference;
    };
    const patientRef = targetWithPatient.subject?.reference ?? targetWithPatient.patient?.reference;
    const patient = result.patients.find((candidate) => candidate.ref === patientRef);
    map.set(resourceKey(target), {
      label: aiLabelStatus(target, { labelCodes }),
      provenanceCount: provenances.length,
      deviceName,
      humanVerified: summaries.some((summary) => summary.humanVerified),
      patient: patient?.display ?? patientRef,
      inputRefs: summaries.flatMap((summary) =>
        summary.entityRefs.map((entity) => referenceKey(entity.ref)?.split('/')[1] ?? entity.ref),
      ),
    });
  }
  return map;
}
