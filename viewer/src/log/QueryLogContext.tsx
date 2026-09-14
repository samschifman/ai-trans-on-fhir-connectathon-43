import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { LogEntry } from '../fhir/types';

interface QueryLogContextValue {
  entries: LogEntry[];
  add: (entry: LogEntry) => void;
  clear: () => void;
  toCurl: (entry: LogEntry) => string;
}

const QueryLogContext = createContext<QueryLogContextValue | undefined>(undefined);

export function QueryLogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const add = useCallback((entry: LogEntry) => {
    setEntries((current) => [entry, ...current].slice(0, 500));
  }, []);
  const clear = useCallback(() => setEntries([]), []);
  const toCurl = useCallback((entry: LogEntry) => {
    const headers = Object.entries(entry.headers)
      .map(([name, value]) => ` -H ${shellQuote(`${name}: ${value}`)}`)
      .join('');
    return `curl -X ${entry.method}${headers} ${shellQuote(entry.url)}`;
  }, []);
  const value = useMemo(() => ({ entries, add, clear, toCurl }), [add, clear, entries, toCurl]);
  return <QueryLogContext.Provider value={value}>{children}</QueryLogContext.Provider>;
}

export function useQueryLog(): QueryLogContextValue {
  const value = useContext(QueryLogContext);
  if (!value) throw new Error('useQueryLog must be used inside QueryLogProvider');
  return value;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
