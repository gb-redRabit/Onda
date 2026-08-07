import { ref } from 'vue';

export function usePlayerFavorites() {
  const favorites = ref<string[]>([]);
  let favoritesLoaded = false;

  async function ensureFavorites(): Promise<void> {
    if (favoritesLoaded) return;
    favoritesLoaded = true;
    if (!window.api) return;
    try {
      const data = await window.api.invoke('settings:get');
      const list = data.favorites;
      if (Array.isArray(list)) favorites.value = list;
    } catch {
      /* defaults */
    }
  }

  function isFavorite(path: string): boolean {
    ensureFavorites();
    return favorites.value.includes(path);
  }

  function toggleFavorite(path: string) {
    const idx = favorites.value.indexOf(path);
    if (idx >= 0) {
      favorites.value.splice(idx, 1);
    } else {
      favorites.value.push(path);
    }
    saveFavorites();
  }

  async function saveFavorites() {
    try {
      if (window.api) {
        await window.api.invoke('settings:set', {
          favorites: favorites.value
        });
      }
    } catch {
      // silent fail
    }
  }

  return { favorites, isFavorite, toggleFavorite };
}
