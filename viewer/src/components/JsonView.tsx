import { useState } from 'react';
import { Button, Code, Group, Stack, Text } from '@mantine/core';

export default function JsonView({ value, paths = [] }: { value: unknown; paths?: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(value, null, 2);
  const copy = async () => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <Stack gap="xs">
      <JsonHeader copied={copied} onCopy={copy} />
      <InlinePaths paths={paths} />
      <Code block style={{ maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
        {text}
      </Code>
    </Stack>
  );
}

function JsonHeader({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <Group justify="space-between">
      <Text size="sm" fw={600}>
        JSON
      </Text>
      <Button size="xs" variant="subtle" onClick={onCopy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </Group>
  );
}

function InlinePaths({ paths }: { paths: string[] }) {
  return paths.length > 0 ? (
    <Text size="xs" c="dimmed">
      Inline AI-labeled elements: {paths.join(', ')}
    </Text>
  ) : null;
}
