import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import App from './App';
import './styles.css';
import { SettingsProvider } from './config/SettingsContext';
import { FhirClientProvider } from './fhir/FhirClientContext';
import { QueryLogProvider } from './log/QueryLogContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MantineProvider defaultColorScheme="light">
        <QueryLogProvider>
          <SettingsProvider>
            <FhirClientProvider>
              <App />
            </FhirClientProvider>
          </SettingsProvider>
        </QueryLogProvider>
      </MantineProvider>
    </BrowserRouter>
  </StrictMode>,
);
