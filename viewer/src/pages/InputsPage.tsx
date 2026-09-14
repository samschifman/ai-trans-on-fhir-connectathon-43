import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useSearchParams } from 'react-router-dom';
import { isInputDocument } from '../ai/inputs';
import { recallByProvenanceSearch, type RecallResult } from '../ai/recall';
import { resolveReference } from '../fhir/references';
import { searchAll } from '../fhir/search';
import { useSettings } from '../config/SettingsContext';
import { useFhirClient, useReferenceCache } from '../hooks/useFhirClient';
import RecallResults from '../components/RecallResults';
import PromptDisclosure from '../components/PromptDisclosure';

export default function InputsPage() {
  const client = useFhirClient();
  const cache = useReferenceCache();
  const { settings } = useSettings();
  const [searchParams] = useSearchParams();
  const [inputs, setInputs] = useState<fhir4.DocumentReference[]>([]);
  const [manual, setManual] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<RecallResult>();
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState('');
  const autoRunRef = useRef<string>();
  const discover = useCallback(async () => {
    setError(undefined);
    try {
      const [byType, byProfile] = await Promise.all([
        searchAll<fhir4.DocumentReference>(
          client,
          'DocumentReference',
          { type: 'http://hl7.org/fhir/uv/aitransparency/CodeSystem/AIinputsCS|AIInputPrompt' },
          settings,
        ),
        searchAll<fhir4.DocumentReference>(
          client,
          'DocumentReference',
          { _profile: 'http://hl7.org/fhir/uv/aitransparency/StructureDefinition/AI-InputPrompt' },
          settings,
        ).catch(() => ({ resources: [] })),
      ]);
      setInputs([
        ...new Map(
          [...byType.resources, ...byProfile.resources]
            .filter((document) => isInputDocument(document))
            .map((document) => [`DocumentReference/${document.id}`, document]),
        ).values(),
      ]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Input discovery failed');
    }
  }, [client, settings]);
  useEffect(() => {
    void discover();
    const ref = searchParams.get('ref');
    if (ref) setManual(ref);
  }, [discover, searchParams]);
  const searchDescription = async () => {
    try {
      const result = await searchAll<fhir4.DocumentReference>(
        client,
        'DocumentReference',
        { description },
        settings,
      );
      setInputs(result.resources.filter((document) => isInputDocument(document)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Input search failed');
    }
  };
  const selectRef = useCallback(
    async (ref: string) => {
      setError(undefined);
      setResult(undefined);
      try {
        const resource = await resolveReference(client, cache, ref);
        if (!resource || resource.resourceType !== 'DocumentReference')
          throw new Error(`Input not found: ${ref}`);
        setManual(`DocumentReference/${resource.id}`);
        const recall = await recallByProvenanceSearch(
          client,
          cache,
          settings,
          'entity',
          `DocumentReference/${resource.id}`,
          setProgress,
        );
        setResult(recall);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Input output lookup failed');
      } finally {
        setProgress('');
      }
    },
    [cache, client, settings],
  );
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref || autoRunRef.current === ref) return;
    autoRunRef.current = ref;
    setManual(ref);
    void selectRef(ref);
  }, [searchParams, discover, selectRef]);
  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Inputs and prompts</Title>
        <Text c="dimmed">Find outputs derived from a prompt or source DocumentReference.</Text>
      </div>
      <Paper withBorder p="md">
        <Group align="end">
          <TextInput
            label="Reference"
            placeholder="DocumentReference/prompt-1"
            value={manual}
            onChange={(event) => setManual(event.currentTarget.value)}
          />
          <Button onClick={() => selectRef(manual)}>Show outputs</Button>
          <TextInput
            label="Description search"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
          <Button variant="light" onClick={searchDescription}>
            Search
          </Button>
        </Group>
      </Paper>
      {error && <Alert color="red">{error}</Alert>}
      <Paper withBorder p="md">
        <Title order={4}>Candidate inputs</Title>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Description / prompt</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {inputs.map((input) => (
              <Table.Tr key={input.id}>
                <Table.Td>{input.id}</Table.Td>
                <Table.Td>{input.type?.coding?.[0]?.code ?? '—'}</Table.Td>
                <Table.Td>
                  <PromptDisclosure document={input} />
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    onClick={() => {
                      setManual(`DocumentReference/${input.id}`);
                      void selectRef(`DocumentReference/${input.id}`);
                    }}
                  >
                    Show outputs
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      {result && <RecallResults result={result} progress={progress} />}
    </Stack>
  );
}
