import { ref } from 'vue';

export function usePlayerFavorites() {
  const favorites = ref<string[]>([]);
  let favoritesLoaded = false;
  let loadPromise: Promise<void> | null = null;

  async function ensureFavorites(): Promise<void> {
    if (favoritesLoaded) return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      if (!window.api) {
        favoritesLoaded = true;
        return;
      }
      try {
        const data = (await window.api.invoke('settings:get')) as { favorites?: unknown } | undefined;
        const list = (data as { favorites?: unknown })?.favorites;
        if (Array.isArray(list)) {
          if (favorites.value.length === 0) {
            favorites.value = list as string[];
          } else {
            // merge — nie nadpisuj ♥ dodanych przed zakończeniem loadu (wyścig cold start)
            const merged = new Set<string>([...favorites.value, ...(list as string[])]);
            favorites.value = [...merged];
          }
        }
      } catch {
        /* defaults */
      } finally {
        favoritesLoaded = true;
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  function isFavorite(path: string): boolean {
    void ensureFavorites();
    return favorites.value.includes(path);
  }

  async function toggleFavorite(path: string) {
    await ensureFavorites();
    const idx = favorites.value.indexOf(path);
    if (idx >= 0) {
      favorites.value.splice(idx, 1);
    } else {
      favorites.value.push(path);
    }
    await saveFavorites();
  }

  async function saveFavorites() {
    try {
      if (window.api) {
        await window.api.invoke('settings:set', {
          favorites: [...favorites.value]
        });
      }
    } catch {
      // silent fail
    }
  }

  return { favorites, isFavorite, toggleFavorite };
}
