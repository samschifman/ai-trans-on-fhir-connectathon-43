import { useState } from 'react';
import { Alert, Button, Group, List, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useSettings } from '../../config/SettingsContext';
import { useFhirClient } from '../../hooks/useFhirClient';
import { searchAll } from '../../fhir/search';

export default function PatientSearch({
  onSelect,
}: {
  onSelect: (patient: fhir4.Patient) => void;
}) {
  const client = useFhirClient();
  const { settings } = useSettings();
  const [given, setGiven] = useState('');
  const [family, setFamily] = useState('');
  const [id, setId] = useState('');
  const [results, setResults] = useState<fhir4.Patient[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    setError(undefined);
    setResults([]);
    try {
      if (id.trim()) {
        try {
          setResults([await client.read<fhir4.Patient>('Patient', id.trim())]);
        } catch (readError) {
          if (
            !(readError instanceof Error) ||
            !('status' in readError) ||
            (readError as { status: number }).status !== 404
          )
            throw readError;
          const byId = await searchAll<fhir4.Patient>(
            client,
            'Patient',
            { _id: id.trim() },
            settings,
          );
          const found =
            byId.resources.length > 0
              ? byId.resources
              : (
                  await searchAll<fhir4.Patient>(
                    client,
                    'Patient',
                    { identifier: id.trim() },
                    settings,
                  )
                ).resources;
          setResults(found);
        }
      } else {
        const query: Record<string, string> = {};
        if (given.trim()) query.given = given.trim();
        if (family.trim()) query.family = family.trim();
        const result = await searchAll<fhir4.Patient>(client, 'Patient', query, settings);
        setResults(result.resources);
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Patient search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={3}>Find a patient</Title>
        <Group grow>
          <TextInput
            label="Given name starts with"
            value={given}
            onChange={(event) => setGiven(event.currentTarget.value)}
          />
          <TextInput
            label="Family name starts with"
            value={family}
            onChange={(event) => setFamily(event.currentTarget.value)}
          />
        </Group>
        <TextInput
          label="Or ID / identifier"
          value={id}
          onChange={(event) => setId(event.currentTarget.value)}
        />
        <Button loading={loading} onClick={search}>
          Search patients
        </Button>
        {error && <Alert color="red">{error}</Alert>}
        {results.length > 0 && (
          <List spacing="xs">
            {results.map((patient) => (
              <List.Item
                key={patient.id}
                onClick={() => onSelect(patient)}
                style={{ cursor: 'pointer' }}
              >
                <Text fw={600}>{patientName(patient)}</Text>
                <Text size="sm" c="dimmed">
                  {patient.id} · {patient.birthDate ?? 'birth date unknown'} ·{' '}
                  {patient.gender ?? 'gender unknown'}
                </Text>
              </List.Item>
            ))}
          </List>
        )}
        {!loading && results.length === 0 && (
          <Text size="sm" c="dimmed">
            No patient results yet.
          </Text>
        )}
      </Stack>
    </Paper>
  );
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
