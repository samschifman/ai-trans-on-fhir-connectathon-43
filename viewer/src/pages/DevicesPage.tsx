import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useSearchParams } from 'react-router-dom';
import { deviceDisplay, isAiDevice } from '../ai/devices';
import { recallByProvenanceSearch, type RecallResult } from '../ai/recall';
import { resolveReference } from '../fhir/references';
import { searchAll } from '../fhir/search';
import { useSettings } from '../config/SettingsContext';
import { useFhirClient, useReferenceCache } from '../hooks/useFhirClient';
import RecallResults from '../components/RecallResults';

export default function DevicesPage() {
  const client = useFhirClient();
  const cache = useReferenceCache();
  const { settings } = useSettings();
  const [searchParams] = useSearchParams();
  const [devices, setDevices] = useState<fhir4.Device[]>([]);
  const [selected, setSelected] = useState<fhir4.Device>();
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<RecallResult>();
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState('');
  const autoRunRef = useRef<string>();
  useEffect(() => {
    let active = true;
    Promise.all([
      searchAll<fhir4.Device>(
        client,
        'Device',
        { _profile: 'http://hl7.org/fhir/uv/aitransparency/StructureDefinition/AI-Device' },
        settings,
      ).catch(() => ({ resources: [] })),
      searchAll<fhir4.Device>(client, 'Device', {}, settings),
    ])
      .then(([profile, all]) => {
        if (!active) return;
        setDevices([
          ...new Map(
            [...profile.resources, ...all.resources]
              .filter((device) => isAiDevice(device))
              .map((device) => [`Device/${device.id}`, device]),
          ).values(),
        ]);
      })
      .catch((loadError) => {
        if (active)
          setError(loadError instanceof Error ? loadError.message : 'Device discovery failed');
      });
    return () => {
      active = false;
    };
  }, [client, settings]);
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setManual(ref);
  }, [searchParams]);
  const selectRef = useCallback(
    async (ref: string) => {
      setError(undefined);
      setResult(undefined);
      setProgress('');
      try {
        const parsed = ref.replace(/^.*?\/(Device\/)/, '$1');
        const resolved = await resolveReference(client, cache, parsed);
        const device =
          devices.find((candidate) => `Device/${candidate.id}` === parsed) ??
          (resolved?.resourceType === 'Device' ? (resolved as fhir4.Device) : undefined);
        if (!device) throw new Error(`Device not found: ${ref}`);
        setSelected(device);
        const recall = await recallByProvenanceSearch(
          client,
          cache,
          settings,
          'agent',
          `Device/${device.id}`,
          setProgress,
        );
        setResult(recall);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Device output lookup failed');
      } finally {
        setProgress('');
      }
    },
    [cache, client, devices, settings],
  );
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref || autoRunRef.current === ref) return;
    autoRunRef.current = ref;
    setManual(ref);
    void selectRef(ref);
  }, [searchParams, selectRef]);
  return (
    <Stack gap="md">
      <div>
        <Title order={2}>AI devices</Title>
        <Text c="dimmed">
          Find all outputs attributed to an AI Device through Provenance.agent.
        </Text>
      </div>
      <Paper withBorder p="md">
        <Group>
          <TextInput
            label="Device reference"
            placeholder="Device/ai-device-1"
            value={manual}
            onChange={(event) => setManual(event.currentTarget.value)}
          />
          <Button mt={25} onClick={() => selectRef(manual)}>
            Show outputs
          </Button>
        </Group>
      </Paper>
      {error && <Alert color="red">{error}</Alert>}
      <Paper withBorder p="md">
        <Title order={4}>Discovered AI Devices</Title>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Manufacturer</Table.Th>
              <Table.Th>Version</Table.Th>
              <Table.Th>AIKind</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {devices.map((device) => {
              const display = deviceDisplay(device);
              return (
                <Table.Tr key={device.id}>
                  <Table.Td>{device.id}</Table.Td>
                  <Table.Td>{display.name ?? '—'}</Table.Td>
                  <Table.Td>{display.manufacturer ?? '—'}</Table.Td>
                  <Table.Td>{display.version ?? '—'}</Table.Td>
                  <Table.Td>{display.aiKind ?? '—'}</Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      onClick={() => {
                        setManual(`Device/${device.id}`);
                        void selectRef(`Device/${device.id}`);
                      }}
                    >
                      Show outputs
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
      {result && <RecallResults result={result} progress={progress} />}
      {selected && !result && <Text>Selected Device/{selected.id}</Text>}
    </Stack>
  );
}
