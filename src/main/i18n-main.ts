import { app } from 'electron';

export type MainLocale = 'en' | 'pl';

export interface MainMessages {
  bootMediaServer: string;
  bootRestoringSettings: string;
  bootStartingUi: string;
  bootCreatingWindow: string;
  bootPipTray: string;
  loadFailedTitle: string;
  loadFailedMessage: (code: number, description: string) => string;
  loadFailedDevHint: string;
  openExecTitle: string;
  openExecMessage: (filePath: string) => string;
  openExecDetail: string;
  openExecCancel: string;
  openExecOpen: string;
  depYtDlp: string;
  depFfmpeg: string;
  depRemove: string;
}

const EN: MainMessages = {
  bootMediaServer: 'Initialising media server…',
  bootRestoringSettings: 'Restoring settings…',
  bootStartingUi: 'Starting interface…',
  bootCreatingWindow: 'Creating window…',
  bootPipTray: 'Initialising PiP and tray…',
  loadFailedTitle: 'Onda',
  loadFailedMessage: (code, description) =>
    `The interface failed to load (${code} ${description}).`,
  loadFailedDevHint: '\n\nDev build: make sure the dev server is running (npm run dev).',
  openExecTitle: 'Open executable file',
  openExecMessage: (filePath) => `Are you sure you want to open an executable file?\n${filePath}`,
  openExecDetail: 'Running unknown executables can be dangerous.',
  openExecCancel: 'Cancel',
  openExecOpen: 'Open',
  depYtDlp: 'Failed to download yt-dlp',
  depFfmpeg: 'Failed to install FFmpeg',
  depRemove: 'Failed to remove the file'
};

const PL: MainMessages = {
  bootMediaServer: 'Inicjalizowanie serwera mediów…',
  bootRestoringSettings: 'Przywracanie ustawień…',
  bootStartingUi: 'Uruchamianie interfejsu…',
  bootCreatingWindow: 'Tworzenie okna…',
  bootPipTray: 'Inicjalizacja PiP i tray…',
  loadFailedTitle: 'Onda',
  loadFailedMessage: (code, description) =>
    `Nie udało się załadować interfejsu (${code} ${description}).`,
  loadFailedDevHint: '\n\nKompilacja dev: upewnij się, że działa dev server (npm run dev).',
  openExecTitle: 'Otwieranie pliku wykonywalnego',
  openExecMessage: (filePath) => `Czy na pewno chcesz otworzyć plik wykonywalny?\n${filePath}`,
  openExecDetail: 'Uruchamianie nieznanych plików wykonywalnych może być niebezpieczne.',
  openExecCancel: 'Anuluj',
  openExecOpen: 'Otwórz',
  depYtDlp: 'Nie udało się pobrać yt-dlp',
  depFfmpeg: 'Nie udało się zainstalować FFmpeg',
  depRemove: 'Nie udało się usunąć pliku'
};

const TABLES: Record<MainLocale, MainMessages> = { en: EN, pl: PL };

let current: MainLocale = 'en';

/** Map any locale tag (e.g. "pl-PL", "en-US") to a supported main-process locale. */
export function normaliseLocale(locale: string | undefined): MainLocale {
  return locale?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

export function setMainLocale(locale: string | undefined): void {
  current = normaliseLocale(locale);
}

export function initMainLocale(): void {
  setMainLocale(app.getLocale());
}

export function getMainLocale(): MainLocale {
  return current;
}

export function mainMessages(): MainMessages {
  return TABLES[current];
}
