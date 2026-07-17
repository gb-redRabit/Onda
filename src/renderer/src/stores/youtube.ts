import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { YouTubeVideo, Subscription, DownloadTask } from '@renderer/types/youtube'

export const useYouTubeStore = defineStore('youtube', () => {
  const searchResults = ref<YouTubeVideo[]>([])
  const searchQuery = ref('')
  const isSearching = ref(false)
  const nextToken = ref<string | null>(null)
  const prevToken = ref<string | null>(null)
  const currentVideo = ref<YouTubeVideo | null>(null)
  const subscriptions = ref<Subscription[]>([])
  const downloads = ref<DownloadTask[]>([])

  function setResults(results: YouTubeVideo[], nextPage?: string, prevPage?: string) {
    searchResults.value = results
    nextToken.value = nextPage || null
    prevToken.value = prevPage || null
  }

  function addSubscription(sub: Subscription) {
    subscriptions.value.push(sub)
  }

  function removeSubscription(id: string) {
    subscriptions.value = subscriptions.value.filter((s) => s.id !== id)
  }

  function addDownload(task: DownloadTask) {
    downloads.value.push(task)
  }

  function updateDownload(id: string, update: Partial<DownloadTask>) {
    const idx = downloads.value.findIndex((d) => d.id === id)
    if (idx >= 0) Object.assign(downloads.value[idx], update)
  }

  function cancelDownload(id: string) {
    updateDownload(id, { status: 'cancelled' })
  }

  return {
    searchResults,
    searchQuery,
    isSearching,
    nextToken,
    prevToken,
    currentVideo,
    subscriptions,
    downloads,
    setResults,
    addSubscription,
    removeSubscription,
    addDownload,
    updateDownload,
    cancelDownload
  }
})
