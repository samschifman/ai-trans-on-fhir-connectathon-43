import { AppShell, Badge, Group, NavLink, Stack, Text, Title } from '@mantine/core';
import {
  IconAdjustments,
  IconDeviceAnalytics,
  IconFileText,
  IconFilter,
  IconNotes,
  IconUsers,
} from '@tabler/icons-react';
import { NavLink as RouterNavLink, Route, Routes, useLocation } from 'react-router-dom';
import SettingsPage from './pages/SettingsPage';
import { useSettings } from './config/SettingsContext';
import PatientPage from './pages/PatientPage';
import FilterPage from './pages/FilterPage';
import DevicesPage from './pages/DevicesPage';
import InputsPage from './pages/InputsPage';
import QueryPage from './pages/QueryPage';

const navigation = [
  { label: 'Settings', path: '/', icon: IconAdjustments },
  { label: 'Patient', path: '/patient', icon: IconUsers },
  { label: 'AI Filter', path: '/filter', icon: IconFilter },
  { label: 'Devices', path: '/devices', icon: IconDeviceAnalytics },
  { label: 'Inputs', path: '/inputs', icon: IconFileText },
  { label: 'Query', path: '/query', icon: IconNotes },
];

function PlaceholderPage({ title }: { title: string }) {
  return (
    <Stack gap="sm">
      <Title order={2}>{title}</Title>
      <Text c="dimmed">This screen will be implemented in the next development phase.</Text>
    </Stack>
  );
}

function Navigation() {
  const location = useLocation();
  return (
    <Stack gap={4}>
      {navigation.map(({ label, path, icon: Icon }) => (
        <NavLink
          key={path}
          component={RouterNavLink}
          to={path}
          label={label}
          leftSection={<Icon size={18} stroke={1.7} />}
          active={location.pathname === path}
        />
      ))}
    </Stack>
  );
}

export default function App() {
  const { settings, connection } = useSettings();
  return (
    <AppShell navbar={{ width: 220, breakpoint: 'sm' }} header={{ height: 64 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>FHIR Transparency Viewer</Title>
          <Group gap="xs">
            <Badge color="gray" variant="light">
              {settings.baseUrl}
            </Badge>
            <Badge
              color={connection === 'connected' ? 'green' : connection === 'error' ? 'red' : 'gray'}
              variant="dot"
            >
              {connection === 'connected'
                ? 'Connected'
                : connection === 'error'
                  ? 'Connection error'
                  : 'Not tested'}
            </Badge>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">
        <Navigation />
      </AppShell.Navbar>
      <AppShell.Main>
        <Routes>
          <Route path="/" element={<SettingsPage />} />
          <Route path="/patient" element={<PatientPage />} />
          <Route path="/filter" element={<FilterPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/inputs" element={<InputsPage />} />
          <Route path="/query" element={<QueryPage />} />
          <Route path="*" element={<PlaceholderPage title="Not found" />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
