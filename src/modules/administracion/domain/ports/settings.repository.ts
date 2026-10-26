import type { Settings } from '../settings';

export const SETTINGS_REPOSITORY = Symbol('SettingsRepository');

export interface SettingsRepository {
  get(): Promise<Settings | null>;
  save(settings: Settings): Promise<Settings>;
}
