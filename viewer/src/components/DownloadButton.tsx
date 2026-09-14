import { Button } from '@mantine/core';
import { useState } from 'react';
import { downloadJson } from '../fhir/bundle';

export default function DownloadButton({
  label,
  filename,
  produce,
  disabled = false,
}: {
  label: string;
  filename: string;
  produce: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const download = async () => {
    setLoading(true);
    try {
      downloadJson(await produce(), filename);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button loading={loading} disabled={disabled} onClick={download}>
      {label}
    </Button>
  );
}
