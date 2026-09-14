import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_SETTINGS,
  loadPresets,
  loadSettings,
  savePresets,
  saveSettings,
  type ServerPreset,
  type Settings,
} from './settings';

interface SettingsContextValue {
  settings: Settings;
  connection: 'unknown' | 'connected' | 'error';
  setConnection: (state: 'unknown' | 'connected' | 'error') => void;
  update: (partial: Partial<Settings>) => void;
  presets: ServerPreset[];
  savePreset: (name: string) => void;
  applyPreset: (preset: ServerPreset) => void;
  deletePreset: (name: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'error'>('unknown');
  const [presets, setPresets] = useState<ServerPreset[]>(() => loadPresets());

  const value = useMemo<SettingsContextValue>(() => {
    const update = (partial: Partial<Settings>) => {
      setSettings((current) => {
        const next = { ...current, ...partial };
        saveSettings(next);
        return next;
      });
    };
    const savePreset = (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === 'Local HAPI') return;
      setPresets((current) => {
        const next = [
          ...current.filter((preset) => preset.name !== trimmed),
          { name: trimmed, settings },
        ];
        savePresets(next);
        return next;
      });
    };
    const applyPreset = (preset: ServerPreset) => {
      setSettings(preset.settings);
      saveSettings(preset.settings);
    };
    const deletePreset = (name: string) => {
      setPresets((current) => {
        const next = current.filter(
          (preset) => preset.name !== name && preset.name !== 'Local HAPI',
        );
        savePresets(next);
        return [
          current.find((preset) => preset.name === 'Local HAPI') ?? {
            name: 'Local HAPI',
            settings: DEFAULT_SETTINGS,
          },
          ...next,
        ];
      });
    };
    return {
      settings,
      connection,
      setConnection,
      update,
      presets,
      savePreset,
      applyPreset,
      deletePreset,
    };
  }, [connection, presets, settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
