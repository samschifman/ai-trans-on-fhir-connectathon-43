import { useState } from 'react';
import {
  Alert,
  Button,
  Code,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { aiLabelStatus } from '../ai/labels';
import DetailPanel from '../components/DetailPanel';
import ResourceTable from '../components/ResourceTable';
import { useSettings } from '../config/SettingsContext';
import { searchAll } from '../fhir/search';
import { useFhirClient } from '../hooks/useFhirClient';
import { useQueryLog } from '../log/QueryLogContext';

export default function QueryPage() {
  const { entries, clear, toCurl } = useQueryLog();
  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Query console and log</Title>
        <Text c="dimmed">
          Every FHIR request made by the viewer appears below with its response.
        </Text>
      </div>
      <QueryConsole />
      <RequestLog entries={entries} clear={clear} toCurl={toCurl} />
    </Stack>
  );
}

function QueryConsole() {
  const client = useFhirClient();
  const { settings } = useSettings();
  const [query, setQuery] = useState('Provenance?agent=Device/ai-device-1');
  const [resources, setResources] = useState<fhir4.Resource[]>([]);
  const [selected, setSelected] = useState<fhir4.Resource>();
  const [error, setError] = useState<string>();

  const run = async () => {
    setError(undefined);
    setSelected(undefined);
    try {
      const parsed = parseQuery(query);
      const result = await searchAll<fhir4.Resource>(client, parsed.path, parsed.query, settings);
      setResources(result.resources);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Query failed');
    }
  };

  const visibleResources = resources.filter((resource) => resource.resourceType !== 'Provenance');
  const annotations = new Map(
    visibleResources.map((resource) => [
      `${resource.resourceType}/${resource.id}`,
      {
        label: aiLabelStatus(resource, { labelCodes: settings.labelCodes }),
        provenanceCount: 0,
        inputRefs: [],
      },
    ]),
  );

  return (
    <Paper withBorder p="md">
      <Group align="end">
        <TextInput
          style={{ flex: 1 }}
          label="FHIR search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Button onClick={run}>Run</Button>
      </Group>
      {error && (
        <Alert color="red" mt="sm">
          {error}
        </Alert>
      )}
      {resources.length > 0 && (
        <>
          <Text mt="sm">{resources.length} resources returned.</Text>
          <ResourceTable
            resources={visibleResources}
            annotations={annotations}
            onSelect={setSelected}
          />
          <DetailPanel resource={selected} provenances={[]} resolved={new Map()} />
        </>
      )}
    </Paper>
  );
}

function RequestLog({
  entries,
  clear,
  toCurl,
}: {
  entries: ReturnType<typeof useQueryLog>['entries'];
  clear: () => void;
  toCurl: (entry: (typeof entries)[number]) => string;
}) {
  const [openLog, setOpenLog] = useState<string>();
  return (
    <Paper withBorder p="md">
      <Group justify="space-between">
        <Title order={3}>Request log ({entries.length})</Title>
        <Button color="red" variant="light" onClick={clear}>
          Clear
        </Button>
      </Group>
      <ScrollArea>
        <Table withTableBorder striped miw={900}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Time</Table.Th>
              <Table.Th>Method / URL</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Elapsed</Table.Th>
              <Table.Th>Count</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {entries.map((entry) => (
              <RequestRow
                key={entry.id}
                entry={entry}
                open={openLog === entry.id}
                onToggle={() => setOpenLog(openLog === entry.id ? undefined : entry.id)}
                toCurl={toCurl}
              />
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}

function RequestRow({
  entry,
  open,
  onToggle,
  toCurl,
}: {
  entry: ReturnType<typeof useQueryLog>['entries'][number];
  open: boolean;
  onToggle: () => void;
  toCurl: (entry: ReturnType<typeof useQueryLog>['entries'][number]) => string;
}) {
  const headers = Object.entries(entry.headers)
    .map(([name, value]) => `${name}: ${name.toLowerCase() === 'authorization' ? '••••••' : value}`)
    .join(' · ');
  return (
    <Table.Tr>
      <Table.Td>{entry.startedAt}</Table.Td>
      <Table.Td>
        <Text size="sm">
          {entry.method} {entry.url}
        </Text>
        <Text size="xs" c="dimmed">
          {headers}
        </Text>
      </Table.Td>
      <Table.Td>
        {entry.status ?? '—'}
        {entry.error && (
          <Text c="red" size="xs">
            {entry.error}
          </Text>
        )}
      </Table.Td>
      <Table.Td>{entry.ms} ms</Table.Td>
      <Table.Td>{entry.count ?? '—'}</Table.Td>
      <Table.Td>
        <Button size="xs" variant="subtle" onClick={onToggle}>
          {open ? 'Hide' : 'Details'}
        </Button>
        {open && (
          <Stack gap="xs" mt="xs">
            <Code block>{JSON.stringify(entry.responseBody, null, 2)}</Code>
            <Code block>{toCurl(entry)}</Code>
          </Stack>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

function parseQuery(value: string): { path: string; query: Record<string, string> } {
  const trimmed = value.trim();
  const absolute = /^https?:\/\//i.test(trimmed);
  const url = absolute
    ? new URL(trimmed)
    : new URL(trimmed.replace(/^\//, ''), 'http://viewer.local/');
  const query: Record<string, string> = {};
  url.searchParams.forEach((item, key) => {
    query[key] = item;
  });
  return { path: absolute ? trimmed : url.pathname.replace(/^\//, ''), query };
}
