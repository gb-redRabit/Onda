import icon from '../../../resources/icon.png?asset';
import winIcon from '../../../build/icon.ico?asset';

// Ikona dla okien pomocniczych (PiP, podglądy, eksplorator, logowanie): w Windows
// wielorozmiarowy .ico dla ostrych ikon paska zadań/PiP, poza tym wspólny PNG.
export function pipWindowIcon(): string | undefined {
  return process.platform === 'win32' ? winIcon : icon;
}
