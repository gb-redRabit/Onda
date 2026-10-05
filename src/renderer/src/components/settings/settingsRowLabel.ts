import type { InjectionKey, ComputedRef } from 'vue';

/**
 * Etykieta wiersza ustawień udostępniona kontrolkom w slocie `SettingsRow`.
 *
 * `SettingsToggle` nie ma własnej dostępnej nazwy — etykieta żyje w `SettingsRow`.
 * Zamiast zmieniać ~30 miejsc wywołań, wiersz dostarcza etykietę przez `provide`,
 * a przełącznik wstrzykuje ją jako `aria-label`.
 */
export const SETTINGS_ROW_LABEL: InjectionKey<ComputedRef<string>> = Symbol('settingsRowLabel');
