import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function readBundle(relativePath: string): fhir4.Bundle {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), '..', relativePath), 'utf8'),
  ) as fhir4.Bundle;
}

export function resources(bundle: fhir4.Bundle): fhir4.Resource[] {
  return (bundle.entry ?? []).flatMap((entry) => (entry.resource ? [entry.resource] : []));
}
