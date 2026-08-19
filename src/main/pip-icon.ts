import icon from '../../resources/icon.png?asset';
import winIcon from '../../build/icon.ico?asset';

// Icon for auxiliary windows (PiP, previews, explorer, login): on Windows the
// multi-size .ico so the taskbar/pip icons stay crisp, the shared PNG elsewhere.
export function pipWindowIcon(): string | undefined {
  return process.platform === 'win32' ? winIcon : icon;
}