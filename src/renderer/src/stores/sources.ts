import { defineStore } from 'pinia';
import type { MediaSource } from '@renderer/types/sources';
import { createSourcesList } from './sources/list';
import { createSourcesItems } from './sources/items';
import { createSourcesNavigation } from './sources/navigation';
import { createSourcesTest } from './sources/test';
import { createSourcesDownloads } from './sources/downloads';

export const useSourcesStore = defineStore('sources', () => {
  const {
    sources,
    activeSourceId,
    activeEndpointId,
    isLoaded,
    activeSource,
    activeEndpoint,
    paginationMode,
    startPage,
    loadSources,
    saveSource: persistSource,
    deleteSource: removeSource
  } = createSourcesList();

  const {
    items,
    loading,
    hasMore,
    nextFrom,
    lastError,
    currentPage,
    context,
    tableRows,
    tableLoading,
    resetItems,
    fetchItems,
    fetchMore,
    setPage
  } = createSourcesItems({ activeSource, activeEndpoint, paginationMode, startPage });

  const {
    navStack,
    setActive,
    openItem,
    openTableRow,
    goBack,
    goBackTo,
    forgetSource: forgetSourceNavigation,
    resetNavigation
  } = createSourcesNavigation({
    sources,
    activeSourceId,
    activeEndpointId,
    activeEndpoint,
    startPage,
    context,
    currentPage,
    resetItems,
    fetchItems
  });

  const {
    testStatus,
    testSource,
    tableRowsTest,
    forgetSource: forgetSourceTest
  } = createSourcesTest();

  const { enqueueDownload, enqueueAll } = createSourcesDownloads({ activeSource });

  // Zapis/usunięcie źródła unieważnia zapamiętaną nawigację i status testu
  // (moduły nav/test są tworzone po liście, więc spinamy to w store).
  async function saveSource(source: MediaSource): Promise<{ ok: boolean; error?: string }> {
    const res = await persistSource(source);
    if (res.ok) {
      resetItems();
      if (res.id) {
        forgetSourceNavigation(res.id);
        forgetSourceTest(res.id);
      }
    }
    return { ok: res.ok, error: res.error };
  }

  async function deleteSource(id: string) {
    const res = await removeSource(id);
    if (!res.ok) return;
    forgetSourceNavigation(id);
    forgetSourceTest(id);
    if (res.wasActive) {
      resetNavigation();
      resetItems();
    }
  }

  return {
    sources,
    activeSourceId,
    activeEndpointId,
    activeSource,
    activeEndpoint,
    paginationMode,
    currentPage,
    startPage,
    context,
    navStack,
    items,
    loading,
    hasMore,
    nextFrom,
    lastError,
    isLoaded,
    loadSources,
    saveSource,
    deleteSource,
    setActive,
    openItem,
    openTableRow,
    goBack,
    goBackTo,
    tableRows,
    tableLoading,
    testStatus,
    fetchItems,
    fetchMore,
    setPage,
    testSource,
    tableRowsTest,
    enqueueDownload,
    enqueueAll
  };
});
