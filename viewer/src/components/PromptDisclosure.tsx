import { Button, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { promptBody, promptPreview } from '../ai/inputs';

export default function PromptDisclosure({ document }: { document: fhir4.DocumentReference }) {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap={4}>
      <Text size="sm" lineClamp={2}>
        {promptPreview(document) || 'No prompt text available.'}
      </Text>
      <Button size="compact-xs" variant="subtle" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide prompt' : 'Show prompt'}
      </Button>
      {open && (
        <Text
          component="pre"
          size="sm"
          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {promptBody(document) || 'No prompt text available.'}
        </Text>
      )}
    </Stack>
  );
}
