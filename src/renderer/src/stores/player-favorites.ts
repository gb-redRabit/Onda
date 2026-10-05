import { computed } from 'vue';
import { useSettingsStore } from './settings';

// Ulubione są ustawieniem, więc żyją w stanie ustawień i są zapisywane przez
// tę samą debounce'owaną persystencję co wszystko inne. Ten moduł trzymał kiedyś własny
// ref i wywoływał `settings:set` bezpośrednio, co oznaczało drugiego pisarza jednego
// klucza: reset fabryczny lub zaimportowany profil nie wiedziały o istnieniu ulubionych, a
// przełączenie mogło zostać zgubione przez zapis, który był już w toku.

export function usePlayerFavorites() {
  const settings = useSettingsStore();
  let favoritesLoaded = false;
  let loadPromise: Promise<void> | null = null;

  async function ensureFavorites(): Promise<void> {
    if (favoritesLoaded) return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        // Store ustawień ładuje wszystko przy starcie; późny konsument (widok
        // otwarty po pierwszym malowaniu) wciąż musi na to poczekać.
        if (!settings.isLoaded) await settings.load();
      } catch {
        /* domyślne */
      } finally {
        favoritesLoaded = true;
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  // Zbiór liczony raz na zmianę ulubionych (computed cache'uje), więc `isFavorite`
  // jest O(1) zamiast `Array.includes` O(F) wołanego kilka razy na wiersz listy.
  const favoriteSet = computed(() => new Set(settings.favorites));

  function isFavorite(path: string): boolean {
    void ensureFavorites();
    return favoriteSet.value.has(path);
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
