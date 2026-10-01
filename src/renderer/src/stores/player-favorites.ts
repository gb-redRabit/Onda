import { useSettingsStore } from './settings';

// Favourites are a setting, so they live in the settings state and are written by
// the same debounced persistence as everything else. This module used to keep its
// own ref and call `settings:set` directly, which meant a second writer for one
// key: a factory reset or an imported profile had no idea favourites existed, and
// a toggle could be lost by a save that was already in flight.

export function usePlayerFavorites() {
  const settings = useSettingsStore();
  let favoritesLoaded = false;
  let loadPromise: Promise<void> | null = null;

  async function ensureFavorites(): Promise<void> {
    if (favoritesLoaded) return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        // The settings store loads everything at boot; a late consumer (a view
        // opened after the first paint) still has to wait for that.
        if (!settings.isLoaded) await settings.load();
      } catch {
        /* defaults */
      } finally {
        favoritesLoaded = true;
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  // Read through the store on every call rather than holding the array: the
  // store may have been assigned a new array since this was created, and a
  // captured reference would then be stale.
  function isFavorite(path: string): boolean {
    void ensureFavorites();
    return settings.favorites.includes(path);
  }

  async function toggleFavorite(path: string) {
    await ensureFavorites();
    const idx = settings.favorites.indexOf(path);
    if (idx >= 0) {
      settings.favorites.splice(idx, 1);
    } else {
      settings.favorites.push(path);
    }
    settings.save();
  }

  return { favorites: settings.favorites, isFavorite, toggleFavorite, ensureFavorites };
}
