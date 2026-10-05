import { posix, win32 } from 'path';

// Destrukcyjne handlery fs IPC (delete / move / copy / mkdir) działają z pełnymi
// uprawnieniami użytkownika, a renderer jest jedyną rzeczą między przejętą
// stroną a `rm -rf`. Zamiast polegać na oknie potwierdzenia UI, proces główny
// odrzuca od razu niewielki zbiór ścieżek: korzeń wolumenu i wszystko
// bezpośrednio w nim, a także katalogi systemowe. Żadna z nich nie jest
// uzasadnionym celem usunięcia lub przeniesienia z odtwarzacza mediów, a ich
// utrata nie jest odwracalna.
//
// Każda funkcja przyjmuje jawny `platform`, aby politykę można było testować na
// jednym hoście; `path.isAbsolute` kieruje się platformą hosta i nie nadaje się
// do tego.

export type ProtectedPathReason = 'root' | 'system' | 'invalid';

/** Katalogi Windows, których utrata psuje system, plus własne katalogi domowe powłoki. */
const WINDOWS_PROTECTED = [
  'windows',
  'windows\\system32',
  'windows\\syswow64',
  'windows\\assembly',
  'windows\\winsxs',
  'program files',
  'program files (x86)',
  'programdata',
  'boot',
  'recovery',
  '$recycle.bin',
  'system volume information',
  'perflogs',
  'config.msi'
];

/**
 * Katalogi POSIX, których utrata psuje system, plus pseudosystemy plików.
 * Przechowywane bez wiodącego separatora, aby wartość można było porównać
 * bezpośrednio z ciągiem segmentów ścieżki; sam korzeń obsługuje isFilesystemRoot.
 */
const POSIX_PROTECTED = [
  'bin',
  'boot',
  'dev',
  'etc',
  'lib',
  'lib32',
  'lib64',
  'proc',
  'root',
  'run',
  'sbin',
  'srv',
  'sys',
  'usr',
  'var',
  'var/lib',
  'var/run',
  // macOS: `/etc` to symlink do `/private/etc`, a korzenie są kanonizowane
  // (`fs.realpath`) ZANIM trafią tu, więc sam wpis `etc` nigdy nie pasował na
  // macOS, przepuszczając przyznanie systemowej konfiguracji. Dodajemy tylko
  // `/private/etc` (a nie całe `/private/var`), bo `/private/var/folders` jest
  // katalogiem tymczasowym użytkownika, którego nie wolno blokować.
  'private/etc'
];

/** Niepuste segmenty ścieżki, z usuniętym wolumenem lub korzeniem. */
function segmentsOf(target: string, platform: NodeJS.Platform): string[] {
  const normalized = platform === 'win32' ? win32.normalize(target) : posix.normalize(target);
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (platform === 'win32') {
    // Usuwa dysk (`C:`) lub dwa komponenty UNC (`server`, `share`).
    if (parts.length && /^[a-z]:$/i.test(parts[0])) return parts.slice(1);
    if (parts.length > 2) return parts.slice(2);
    return parts;
  }
  return parts;
}

function isAbsoluteFor(target: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' ? win32.isAbsolute(target) : posix.isAbsolute(target);
}

function normalizeFor(target: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? win32.normalize(target).toLowerCase() : posix.normalize(target);
}

/** True, gdy `target` jest korzeniem wolumenu: `C:\`, `C:`, `\\server\share`, `/`. */
export function isFilesystemRoot(
  target: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (typeof target !== 'string' || !target) return false;
  if (platform === 'win32') {
    // `C:` jest względne wobec dysku — rozwiązuje się względem bieżącego katalogu
    // tego dysku, więc nie jest ścieżką absolutną, ale nadal nazywa korzeń.
    if (/^[a-z]:\\?$/i.test(target)) return true;
    if (!win32.isAbsolute(target)) return false;
    // Korzeń udziału UNC nie ma potomka po nazwie udziału.
    return /^\\\\[^\\]+\\[^\\]+\\?$/.test(target);
  }
  if (!posix.isAbsolute(target)) return false;
  return posix.normalize(target) === '/';
}

/**
 * Odrzuca ścieżki, które nigdy nie mogą być celem usunięcia, przeniesienia
 * ani utworzenia bezpośrednio pod nimi. Zwraca powód lub null, gdy ścieżka jest dozwolona.
 */
export function protectedPathReason(
  target: unknown,
  platform: NodeJS.Platform = process.platform
): ProtectedPathReason | null {
  if (typeof target !== 'string' || !target || target.includes('\0')) return 'invalid';
  // `C:` nazywa korzeń wolumenu mimo bycia względnym wobec dysku, więc test
  // korzenia wykonuje się przed testem ścieżki absolutnej.
  if (isFilesystemRoot(target, platform)) return 'root';
  if (!isAbsoluteFor(target, platform)) return 'invalid';

  const list = platform === 'win32' ? WINDOWS_PROTECTED : POSIX_PROTECTED;
  const segments = segmentsOf(normalizeFor(target, platform), platform);
  const joiner = platform === 'win32' ? '\\' : '/';

  // Wszystko leżące bezpośrednio w korzeniu wolumenu (`C:\Users`, `/home`) zabiera
  // ze sobą dane użytkownika całego dysku, więc jest odrzucane razem z korzeniem.
  if (segments.length <= 1) return 'system';

  // Wpis chroniony pasuje tylko jako PREFIKS: `C:\Program Files\Onda` jest
  // odrzucane, natomiast `C:\Users\u\Music` i własny `Windows.old` użytkownika nie.
  for (let end = 0; end < segments.length; end++) {
    if (list.includes(segments.slice(0, end + 1).join(joiner))) return 'system';
  }
  return null;
}

/** Wygodna otoczka dla destrukcyjnych handlerów. */
export function isProtectedPath(
  target: unknown,
  platform: NodeJS.Platform = process.platform
): boolean {
  return protectedPathReason(target, platform) !== null;
}

/**
 * Segmenty katalogów, których nie chcemy przyznawać serwerowi mediów nawet na
 * żądanie użytkownika (dane logowania, konfiguracja, profile przeglądarek).
 * To obrona w głąb wobec allowlisty rozszerzeń serwera: root i tak nie wyda
 * plików niebędących mediami, ale nie ma powodu utrwalać takich korzeni.
 */
const SENSITIVE_SEGMENTS = new Set([
  'appdata',
  '.ssh',
  '.aws',
  '.azure',
  '.gcloud',
  '.gnupg',
  '.kube',
  '.docker',
  '.config',
  '.local',
  '.cache',
  '.mozilla',
  '.thunderbird',
  'keychains',
  'login data',
  'cookies',
  '.netrc',
  '.npmrc',
  '.pypirc',
  '.git-credentials'
]);

/** True, gdy ścieżka leży w katalogu, któremu nie przyznajemy dostępu mediów. */
export function isSensitivePath(
  target: unknown,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (typeof target !== 'string' || !target) return false;
  const segments = segmentsOf(normalizeFor(target, platform), platform);
  return segments.some((seg) => SENSITIVE_SEGMENTS.has(seg.toLowerCase()));
}

/** Katalog nadrzędny ścieżki lub null, gdy ścieżka nie ma użytecznego rodzica. */
export function parentOf(target: string): string | null {
  const idx = Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'));
  if (idx <= 0) return null;
  return target.slice(0, idx);
}
