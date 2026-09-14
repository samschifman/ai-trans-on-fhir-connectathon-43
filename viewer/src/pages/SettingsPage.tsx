import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useSettings } from '../config/SettingsContext';
import { summarizeCapability } from '../fhir/capability';
import { useReferenceCache } from '../hooks/useFhirClient';
import { FhirClient } from '../fhir/client';
import { useQueryLog } from '../log/QueryLogContext';
import type { Settings } from '../config/settings';

export default function SettingsPage() {
  const { settings, update, presets, savePreset, applyPreset, deletePreset, setConnection } =
    useSettings();
  const cache = useReferenceCache();
  const { entries, add } = useQueryLog();
  const [draft, setDraft] = useState<Settings>(settings);
  const [presetName, setPresetName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [capability, setCapability] = useState<ReturnType<typeof summarizeCapability>>();
  const [error, setError] = useState<string>();
  const [testing, setTesting] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const extraHeadersText = useMemo(
    () => draft.extraHeaders.map((header) => `${header.name}: ${header.value}`).join('\n'),
    [draft.extraHeaders],
  );

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const apply = () => {
    update({ ...draft, resourceTypes: draft.resourceTypes.filter(Boolean) });
    setError(undefined);
  };

  const testConnection = async () => {
    apply();
    setTesting(true);
    setError(undefined);
    try {
      const result = await new FhirClient(draft, add).capability();
      setConnection('connected');
      setCapability(summarizeCapability(result));
    } catch (testError) {
      setCapability(undefined);
      setConnection('error');
      setError(testError instanceof Error ? testError.message : 'Connection failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Connection and configuration</Title>
        <Text c="dimmed" size="sm">
          Settings are saved locally in this browser. The viewer is read-only against the FHIR
          server.
        </Text>
      </div>

      {error && (
        <Alert color="red" title="Connection failed">
          {error}
        </Alert>
      )}

      <Paper withBorder p="md">
        <Stack gap="sm">
          <TextInput
            label="FHIR server base URL"
            value={draft.baseUrl}
            onChange={(event) => set('baseUrl', event.currentTarget.value)}
          />
          <Group grow align="end">
            <SegmentedControl
              fullWidth
              value={draft.auth.mode}
              onChange={(value) =>
                set('auth', { ...draft.auth, mode: value as Settings['auth']['mode'] })
              }
              data={[
                { label: 'No auth', value: 'none' },
                { label: 'Basic', value: 'basic' },
                { label: 'Bearer', value: 'bearer' },
              ]}
            />
            <Switch
              label="Use local proxy"
              checked={draft.useProxy}
              onChange={(event) => set('useProxy', event.currentTarget.checked)}
            />
          </Group>
          {draft.auth.mode === 'basic' && (
            <Group grow>
              <TextInput
                label="Username"
                value={draft.auth.username ?? ''}
                onChange={(event) =>
                  set('auth', { ...draft.auth, username: event.currentTarget.value })
                }
              />
              <TextInput
                label="Password"
                type="password"
                value={draft.auth.password ?? ''}
                onChange={(event) =>
                  set('auth', { ...draft.auth, password: event.currentTarget.value })
                }
              />
            </Group>
          )}
          {draft.auth.mode === 'bearer' && (
            <TextInput
              label="Bearer token"
              type="password"
              value={draft.auth.token ?? ''}
              onChange={(event) => set('auth', { ...draft.auth, token: event.currentTarget.value })}
            />
          )}
          {draft.useProxy && (
            <TextInput
              label="Proxy origin (blank for same origin)"
              value={draft.proxyOrigin}
              onChange={(event) => set('proxyOrigin', event.currentTarget.value)}
            />
          )}
          <Textarea
            label="Extra headers"
            description="One name: value pair per line"
            value={extraHeadersText}
            onChange={(event) => set('extraHeaders', parseHeaders(event.currentTarget.value))}
            minRows={2}
          />
          <Group>
            <Button onClick={apply}>Apply settings</Button>
            <Button variant="light" loading={testing} onClick={testConnection}>
              Test connection
            </Button>
            <Button variant="subtle" color="gray" onClick={() => cache.clear()}>
              Clear reference cache
            </Button>
            <Badge variant="light">{entries.length} logged requests</Badge>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={4}>Search and label settings</Title>
          <Group grow>
            <NumberInput
              label="Page size"
              min={1}
              value={draft.pageSize}
              onChange={(value) => set('pageSize', numeric(value, draft.pageSize))}
            />
            <NumberInput
              label="Maximum pages"
              min={1}
              value={draft.maxPages}
              onChange={(value) => set('maxPages', numeric(value, draft.maxPages))}
            />
            <NumberInput
              label="Request timeout (ms)"
              min={1000}
              value={draft.timeoutMs}
              onChange={(value) => set('timeoutMs', numeric(value, draft.timeoutMs))}
            />
          </Group>
          <Textarea
            label="Resource types"
            description="One FHIR resource type per line"
            minRows={4}
            value={draft.resourceTypes.join('\n')}
            onChange={(event) => set('resourceTypes', lines(event.currentTarget.value))}
          />
          <Group grow>
            <TextInput
              label="AI label system"
              value={draft.labelCodes[0]?.system ?? ''}
              onChange={(event) =>
                set('labelCodes', [
                  { system: event.currentTarget.value, code: draft.labelCodes[0]?.code ?? 'AIAST' },
                ])
              }
            />
            <TextInput
              label="AI label code"
              value={draft.labelCodes[0]?.code ?? ''}
              onChange={(event) =>
                set('labelCodes', [
                  { system: draft.labelCodes[0]?.system ?? '', code: event.currentTarget.value },
                ])
              }
            />
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={4}>Server presets</Title>
          <Group align="end">
            <Select
              label="Apply preset"
              value={selectedPreset}
              onChange={(value) => {
                setSelectedPreset(value ?? '');
                const preset = presets.find((item) => item.name === value);
                if (preset) {
                  applyPreset(preset);
                  setDraft(preset.settings);
                }
              }}
              data={presets.map((preset) => preset.name)}
              searchable
            />
            <TextInput
              label="New preset name"
              value={presetName}
              onChange={(event) => setPresetName(event.currentTarget.value)}
            />
            <Button
              onClick={() => {
                savePreset(presetName);
                setPresetName('');
              }}
            >
              Save preset
            </Button>
            {selectedPreset && selectedPreset !== 'Local HAPI' && (
              <Button
                color="red"
                variant="light"
                onClick={() => {
                  deletePreset(selectedPreset);
                  setSelectedPreset('');
                }}
              >
                Delete
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>

      {capability && <CapabilityPanel summary={capability} />}
    </Stack>
  );
}

function CapabilityPanel({ summary }: { summary: ReturnType<typeof summarizeCapability> }) {
  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Title order={4}>CapabilityStatement</Title>
        <Text>FHIR version: {summary.fhirVersion ?? 'unknown'}</Text>
        <Text>Software: {summary.software ?? 'unknown'}</Text>
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Feature</Table.Th>
              <Table.Th>Advertised</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Object.entries(summary.supports).map(([name, supported]) => (
              <Table.Tr key={name}>
                <Table.Td>{name}</Table.Td>
                <Table.Td>
                  <Badge
                    color={supported === true ? 'green' : supported === false ? 'orange' : 'gray'}
                  >
                    {supported === 'unknown' ? 'not advertised' : String(supported)}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text c="dimmed" size="sm">
          Features not advertised are still attempted; the viewer falls back automatically.
        </Text>
      </Stack>
    </Paper>
  );
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseHeaders(value: string): { name: string; value: string }[] {
  return value
    .split('\n')
    .map((line) => {
      const index = line.indexOf(':');
      return index < 0
        ? { name: line.trim(), value: '' }
        : { name: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
    })
    .filter((header) => header.name);
}

function numeric(value: string | number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
