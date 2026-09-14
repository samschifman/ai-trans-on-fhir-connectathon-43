import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  NumberFormatter,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { buildCollectionBundle, buildTransactionBundle } from '../fhir/bundle';
import {
  collectAiLabeled,
  collectNonAi,
  countByType,
  type CountRow,
  type FilterScope,
} from '../ai/filter';
import { useSettings } from '../config/SettingsContext';
import { useFhirClient, useReferenceCache } from '../hooks/useFhirClient';
import DownloadButton from '../components/DownloadButton';

export default function FilterPage() {
  const client = useFhirClient();
  const cache = useReferenceCache();
  const { settings } = useSettings();
  const [scopeMode, setScopeMode] = useState('server');
  const [patientId, setPatientId] = useState('');
  const [rows, setRows] = useState<CountRow[]>();
  const [format, setFormat] = useState<'transaction' | 'collection'>('transaction');
  const [progress, setProgress] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [counting, setCounting] = useState(false);
  const patientScopeReady = scopeMode !== 'patient' || !!patientId.trim();
  const scope: FilterScope =
    scopeMode === 'patient' && patientScopeReady ? { patientId: patientId.trim() } : {};
  const count = async () => {
    setWarnings([]);
    setCounting(true);
    try {
      setRows(await countByType(client, cache, settings, scope));
    } catch (error) {
      setWarnings([error instanceof Error ? error.message : 'Count failed']);
    } finally {
      setCounting(false);
    }
  };
  const aiDownload = async () => {
    const result = await collectAiLabeled(client, cache, settings, scope, setProgress);
    setWarnings(result.warnings);
    return format === 'transaction'
      ? buildTransactionBundle(result.resources)
      : buildCollectionBundle(result.resources);
  };
  const nonAiDownload = async () => {
    const result = await collectNonAi(client, cache, settings, scope, setProgress);
    setWarnings(result.warnings);
    return format === 'transaction'
      ? buildTransactionBundle(result.resources)
      : buildCollectionBundle(result.resources);
  };
  return (
    <Stack gap="md">
      <div>
        <Title order={2}>AI versus non-AI</Title>
        <Text c="dimmed">Count and export resources according to the configured AI label.</Text>
      </div>
      <Paper withBorder p="md">
        <Stack gap="sm">
          <SegmentedControl
            value={scopeMode}
            onChange={setScopeMode}
            data={[
              { label: 'Server-wide', value: 'server' },
              { label: 'One patient', value: 'patient' },
            ]}
          />
          {scopeMode === 'patient' && (
            <TextInput
              label="Patient ID"
              value={patientId}
              onChange={(event) => setPatientId(event.currentTarget.value)}
            />
          )}
          <Button loading={counting} disabled={!patientScopeReady} onClick={count}>
            Count resources
          </Button>
          {!patientScopeReady && (
            <Text c="dimmed" size="sm">
              Enter a patient ID
            </Text>
          )}
        </Stack>
      </Paper>
      {progress && <Text c="dimmed">{progress}</Text>}
      {warnings.length > 0 && (
        <Alert color="yellow" title="Warnings">
          {warnings.join(' ')}
        </Alert>
      )}
      {rows && (
        <Paper withBorder p="md">
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Total</Table.Th>
                <Table.Th>AI (resource-level label)</Table.Th>
                <Table.Th>Without AI</Table.Th>
                <Table.Th>Count method</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.type}>
                  <Table.Td>{row.type}</Table.Td>
                  <Table.Td>
                    <NumberFormatter value={row.total ?? 0} />
                  </Table.Td>
                  <Table.Td>
                    <NumberFormatter value={row.ai ?? 0} />
                  </Table.Td>
                  <Table.Td>
                    <NumberFormatter value={row.nonAi ?? 0} />
                  </Table.Td>
                  <Table.Td>{row.method}</Table.Td>
                </Table.Tr>
              ))}
              <Table.Tr>
                <Table.Td fw={700}>Total</Table.Td>
                <Table.Td>{sumRows(rows, 'total')}</Table.Td>
                <Table.Td>{sumRows(rows, 'ai')}</Table.Td>
                <Table.Td>{sumRows(rows, 'nonAi')}</Table.Td>
                <Table.Td>—</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Paper>
      )}
      <Group align="center" gap="sm">
        <Text size="sm" fw={500}>
          Download bundle as:
        </Text>
        <SegmentedControl
          value={format}
          onChange={(value) => setFormat(value as typeof format)}
          data={[
            { label: 'Transaction', value: 'transaction' },
            { label: 'Collection', value: 'collection' },
          ]}
        />
        <DownloadButton
          label="Download AI-labeled only"
          filename={`ai-labeled-${scopeMode}-${Date.now()}.json`}
          produce={aiDownload}
          disabled={!patientScopeReady}
        />
        <DownloadButton
          label="Download non-AI only"
          filename={`non-ai-${scopeMode}-${Date.now()}.json`}
          produce={nonAiDownload}
          disabled={!patientScopeReady}
        />
      </Group>
    </Stack>
  );
}

function sumRows(rows: CountRow[], key: 'total' | 'ai' | 'nonAi'): number | string {
  if (rows.some((row) => row[key] === null)) return '—';
  return rows.reduce((sum, row) => sum + (row[key] ?? 0), 0);
}
