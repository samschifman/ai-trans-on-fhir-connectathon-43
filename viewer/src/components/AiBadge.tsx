import { Badge } from '@mantine/core';
import { labelKind, type AiLabelStatus } from '../ai/labels';

export default function AiBadge({
  status,
  humanVerified = false,
}: {
  status?: AiLabelStatus;
  humanVerified?: boolean;
}) {
  const kind = labelKind(status ?? { resourceLevel: false, elementPaths: [] });
  if (kind === 'none')
    return (
      <Badge color="gray" variant="light">
        None
      </Badge>
    );
  const label = kind === 'both' ? 'AI + partial' : kind === 'partial' ? 'Partial AI' : 'AI';
  return (
    <Badge color={humanVerified ? 'teal' : 'violet'} variant="light">
      {label}
      {humanVerified ? ' · verified' : ''}
    </Badge>
  );
}
