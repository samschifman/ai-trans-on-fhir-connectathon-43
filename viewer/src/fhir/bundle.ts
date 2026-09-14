export function buildTransactionBundle(resources: fhir4.Resource[]): fhir4.Bundle {
  const seen = new Set<string>();
  const entry: fhir4.BundleEntry[] = [];
  for (const resource of resources) {
    if (!resource.id) continue;
    const key = `${resource.resourceType}/${resource.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entry.push({
      fullUrl: key,
      resource: resource as fhir4.FhirResource,
      request: { method: 'PUT', url: key },
    });
  }
  return { resourceType: 'Bundle', type: 'transaction', entry };
}

export function buildCollectionBundle(resources: fhir4.Resource[]): fhir4.Bundle {
  const seen = new Set<string>();
  const entry: fhir4.BundleEntry[] = [];
  for (const resource of resources) {
    if (!resource.id) continue;
    const key = `${resource.resourceType}/${resource.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entry.push({ fullUrl: key, resource: resource as fhir4.FhirResource });
  }
  return { resourceType: 'Bundle', type: 'collection', entry };
}

export function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/fhir+json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
