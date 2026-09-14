import { useEffect, useMemo, useState } from 'react';
import { Alert, Group, Paper, Stack, Tabs, Text, Title } from '@mantine/core';
import { deviceDisplay } from '../ai/devices';
import { aiLabelStatus } from '../ai/labels';
import { loadPatientData, type PatientData } from '../ai/patient';
import { referenceKey, summarizeProvenance } from '../ai/provenance';
import { useSettings } from '../config/SettingsContext';
import ResourceTable, { resourceKey, type ResourceAnnotation } from '../components/ResourceTable';
import DetailPanel from '../components/DetailPanel';
import { useFhirClient, useReferenceCache } from '../hooks/useFhirClient';
import PatientGraph from './patient/PatientGraph';
import PatientSearch from './patient/PatientSearch';

export default function PatientPage() {
  const client = useFhirClient();
  const cache = useReferenceCache();
  const { settings } = useSettings();
  const [selectedPatient, setSelectedPatient] = useState<fhir4.Patient>();
  const [data, setData] = useState<PatientData>();
  const [selectedResource, setSelectedResource] = useState<fhir4.Resource>();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!selectedPatient?.id) return;
    let active = true;
    setLoading(true);
    setData(undefined);
    setSelectedResource(undefined);
    setError(undefined);
    loadPatientData(client, cache, settings, selectedPatient.id, setProgress)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((loadError) => {
        if (active)
          setError(loadError instanceof Error ? loadError.message : 'Patient load failed');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cache, client, selectedPatient, settings]);

  const annotations = useMemo(
    () => buildAnnotations(data, settings.labelCodes),
    [data, settings.labelCodes],
  );
  const selectedProvenances =
    selectedResource && data
      ? (data.provenanceByTarget.get(resourceKey(selectedResource)) ?? [])
      : [];

  return (
    <Stack gap="md">
      <PatientIntro />
      <PatientSearch onSelect={setSelectedPatient} />
      {selectedPatient && (
        <SelectedPatient patient={selectedPatient} loading={loading} progress={progress} />
      )}
      {error && (
        <Alert color="red" title="Patient load failed">
          {error}
        </Alert>
      )}
      {data && (
        <PatientDataView
          data={data}
          annotations={annotations}
          selectedResource={selectedResource}
          selectedProvenances={selectedProvenances}
          onSelectResource={setSelectedResource}
        />
      )}
    </Stack>
  );
}

function PatientIntro() {
  return (
    <div>
      <Title order={2}>Patient attribution</Title>
      <Text c="dimmed">
        Inspect AI labels, provenance, inputs, and human verification for one patient.
      </Text>
    </div>
  );
}

function SelectedPatient({
  patient,
  loading,
  progress,
}: {
  patient: fhir4.Patient;
  loading: boolean;
  progress: string;
}) {
  return (
    <Paper withBorder p="md">
      <Group justify="space-between">
        <div>
          <Title order={3}>{patientName(patient)}</Title>
          <Text size="sm">Patient/{patient.id}</Text>
        </div>
        {loading && <Text c="dimmed">{progress || 'Loading…'}</Text>}
      </Group>
    </Paper>
  );
}

function PatientDataView({
  data,
  annotations,
  selectedResource,
  selectedProvenances,
  onSelectResource,
}: {
  data: PatientData;
  annotations: Map<string, ResourceAnnotation>;
  selectedResource?: fhir4.Resource;
  selectedProvenances: fhir4.Provenance[];
  onSelectResource: (resource: fhir4.Resource) => void;
}) {
  return (
    <>
      <Alert
        color={data.warnings.length ? 'yellow' : 'green'}
        title={data.warnings.length ? 'Warnings' : 'Loaded'}
      >
        {data.warnings.length
          ? data.warnings.join(' ')
          : `${data.resources.length} non-Provenance resources loaded.`}
      </Alert>
      <Tabs defaultValue="graph">
        <Tabs.List>
          <Tabs.Tab value="graph">Graph</Tabs.Tab>
          <Tabs.Tab value="table">Table</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="graph" pt="md">
          <PatientGraph
            resources={data.resources}
            annotations={annotations}
            onSelect={onSelectResource}
          />
        </Tabs.Panel>
        <Tabs.Panel value="table" pt="md">
          <ResourceTable
            resources={data.resources}
            annotations={annotations}
            onSelect={onSelectResource}
          />
        </Tabs.Panel>
      </Tabs>
      <Paper withBorder p="md">
        <DetailPanel
          resource={selectedResource}
          provenances={selectedProvenances}
          resolved={data.resolved}
        />
      </Paper>
    </>
  );
}

function buildAnnotations(
  data: PatientData | undefined,
  labelCodes: { system: string; code: string }[],
): Map<string, ResourceAnnotation> {
  const map = new Map<string, ResourceAnnotation>();
  if (!data) return map;
  for (const resource of data.resources) {
    const key = resourceKey(resource);
    const provenances = data.provenanceByTarget.get(key) ?? [];
    const summaries = provenances.map(summarizeProvenance);
    const device = summaries
      .flatMap((summary) => summary.authorRefs)
      .map((ref) => data.resolved.get(ref))
      .find((resolved): resolved is fhir4.Device => resolved?.resourceType === 'Device');
    map.set(key, {
      label: aiLabelStatus(resource, { labelCodes }),
      provenanceCount: provenances.length,
      deviceName: device ? `${deviceDisplay(device).name ?? device.id}` : undefined,
      humanVerified: summaries.some((summary) => summary.humanVerified),
      inputRefs: summaries.flatMap((summary) =>
        summary.entityRefs.map((entity) => referenceKey(entity.ref)?.split('/')[1] ?? entity.ref),
      ),
    });
  }
  return map;
}

function patientName(patient: fhir4.Patient): string {
  const name = patient.name?.[0];
  return (
    name?.text ??
    ([name?.given?.join(' '), name?.family].filter(Boolean).join(' ') ||
      patient.id ||
      'Unnamed patient')
  );
}
