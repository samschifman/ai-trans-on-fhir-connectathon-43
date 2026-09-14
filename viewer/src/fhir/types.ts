export interface LogEntry {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  status?: number;
  ms: number;
  count?: number;
  error?: string;
  responseBody?: unknown;
  startedAt: string;
}

export interface SearchAllResult<T> {
  resources: T[];
  pages: number;
  capped: boolean;
  warnings: string[];
}

export interface ParsedReference {
  type?: string;
  id?: string;
  absolute?: string;
  contained?: string;
  raw: string;
}

export interface CapabilitySummary {
  fhirVersion?: string;
  software?: string;
  supports: Record<string, boolean | 'unknown'>;
}

export class FhirError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly outcome?: fhir4.OperationOutcome,
  ) {
    super(message);
    this.name = 'FhirError';
  }
}
