import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { useSettings } from '../config/SettingsContext';
import { useQueryLog } from '../log/QueryLogContext';
import { FhirClient } from './client';
import { ReferenceCache } from './references';

const FhirClientContext = createContext<FhirClient | undefined>(undefined);
const ReferenceCacheContext = createContext<ReferenceCache | undefined>(undefined);

export function FhirClientProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { add } = useQueryLog();
  const client = useMemo(() => new FhirClient(settings, add), [add, settings]);
  const cacheState = useRef<{ baseUrl: string; cache: ReferenceCache }>({
    baseUrl: settings.baseUrl,
    cache: new ReferenceCache(),
  });
  if (cacheState.current.baseUrl !== settings.baseUrl) {
    cacheState.current = { baseUrl: settings.baseUrl, cache: new ReferenceCache() };
  }
  const cache = cacheState.current.cache;
  return (
    <FhirClientContext.Provider value={client}>
      <ReferenceCacheContext.Provider value={cache}>{children}</ReferenceCacheContext.Provider>
    </FhirClientContext.Provider>
  );
}

export function useFhirClient(): FhirClient {
  const value = useContext(FhirClientContext);
  if (!value) throw new Error('useFhirClient must be used inside FhirClientProvider');
  return value;
}

export function useReferenceCache(): ReferenceCache {
  const value = useContext(ReferenceCacheContext);
  if (!value) throw new Error('useReferenceCache must be used inside FhirClientProvider');
  return value;
}
