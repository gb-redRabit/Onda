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
  rendererCrashMessage: (reason: string) => string;
  openExecTitle: string;
  openExecMessage: (filePath: string) => string;
  openExecDetail: string;
  openExecCancel: string;
  openExecOpen: string;
  sourcesPrivateTitle: string;
  sourcesPrivateMessage: string;
  sourcesPrivateDetail: string;
  sourcesPrivateCancel: string;
  sourcesPrivateAllow: string;
  factoryResetTitle: string;
  factoryResetMessage: string;
  factoryResetDetail: string;
  factoryResetCancel: string;
  factoryResetConfirm: string;
  depYtDlp: string;
  depFfmpeg: string;
  depRemove: string;
  trayTooltip: string;
  trayPlayPause: string;
  trayNext: string;
  trayPrevious: string;
  trayToggleMode: string;
  trayShow: string;
  trayQuit: string;
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
  rendererCrashMessage: (reason) =>
    `The interface stopped responding and could not be recovered (${reason}).\nOnda will close now.`,
  openExecTitle: 'Open executable file',
  openExecMessage: (filePath) => `Are you sure you want to open an executable file?\n${filePath}`,
  openExecDetail: 'Running unknown executables can be dangerous.',
  openExecCancel: 'Cancel',
  openExecOpen: 'Open',
  sourcesPrivateTitle: 'Private network access',
  sourcesPrivateMessage:
    'This source will be allowed to connect to addresses on your local network.',
  sourcesPrivateDetail:
    'Enable it only for sources you configured yourself. It can reach routers, NAS devices and other local services.',
  sourcesPrivateCancel: 'Cancel',
  sourcesPrivateAllow: 'Allow',
  factoryResetTitle: 'Reset Onda',
  factoryResetMessage: 'Remove all local data and restart Onda?',
  factoryResetDetail:
    'Settings, library, downloads, playlists and sign-ins are deleted. Files on disk are not touched.',
  factoryResetCancel: 'Cancel',
  factoryResetConfirm: 'Reset and restart',
  depYtDlp: 'Failed to download yt-dlp',
  depFfmpeg: 'Failed to install FFmpeg',
  depRemove: 'Failed to remove the file',
  trayTooltip: 'Onda Player',
  trayPlayPause: 'Play / Pause',
  trayNext: 'Next',
  trayPrevious: 'Previous',
  trayToggleMode: 'Compact / Full window',
  trayShow: 'Show Onda',
  trayQuit: 'Quit'
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
  rendererCrashMessage: (reason) =>
    `Interfejs przestał odpowiadać i nie udało się go odzyskać (${reason}).\nOnda zostanie teraz zamknięta.`,
  openExecTitle: 'Otwieranie pliku wykonywalnego',
  openExecMessage: (filePath) => `Czy na pewno chcesz otworzyć plik wykonywalny?\n${filePath}`,
  openExecDetail: 'Uruchamianie nieznanych plików wykonywalnych może być niebezpieczne.',
  openExecCancel: 'Anuluj',
  openExecOpen: 'Otwórz',
  sourcesPrivateTitle: 'Dostęp do sieci lokalnej',
  sourcesPrivateMessage: 'To źródło będzie mogło łączyć się z adresami w Twojej sieci lokalnej.',
  sourcesPrivateDetail:
    'Włączaj tylko dla źródeł, które sam skonfigurowałeś. Może sięgnąć do routera, NAS-a i innych lokalnych usług.',
  sourcesPrivateCancel: 'Anuluj',
  sourcesPrivateAllow: 'Zezwól',
  factoryResetTitle: 'Reset Ondy',
  factoryResetMessage: 'Usunąć wszystkie lokalne dane i uruchomić Ondę ponownie?',
  factoryResetDetail:
    'Ustawienia, biblioteka, pobrania, playlisty i logowania zostaną usunięte. Pliki na dysku pozostaną nietknięte.',
  factoryResetCancel: 'Anuluj',
  factoryResetConfirm: 'Resetuj i uruchom ponownie',
  depYtDlp: 'Nie udało się pobrać yt-dlp',
  depFfmpeg: 'Nie udało się zainstalować FFmpeg',
  depRemove: 'Nie udało się usunąć pliku',
  trayTooltip: 'Odtwarzacz Onda',
  trayPlayPause: 'Odtwórz / Pauza',
  trayNext: 'Następny',
  trayPrevious: 'Poprzedni',
  trayToggleMode: 'Kompakt / Pełne okno',
  trayShow: 'Pokaż Ondę',
  trayQuit: 'Zakończ'
};

const TABLES: Record<MainLocale, MainMessages> = { en: EN, pl: PL };

let current: MainLocale = 'en';

/** Mapuje dowolny tag locale (np. "pl-PL", "en-US") na obsługiwany locale procesu głównego. */
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
