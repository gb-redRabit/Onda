import { handleIpc } from './typed-handle';
import { clearAppCaches } from './app-cache';

export function registerCacheHandlers(): void {
  handleIpc('cache:clear', () => clearAppCaches());
}
