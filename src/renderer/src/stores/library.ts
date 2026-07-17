import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MediaFile, Playlist } from '@renderer/types/media'

export const useLibraryStore = defineStore('library', () => {
  const tracks = ref<MediaFile[]>([])
  const playlists = ref<Playlist[]>([])
  const scannedPaths = ref<string[]>([])
  const isScanning = ref(false)
  const scanProgress = ref({ current: 0, total: 0 })

  const totalCount = computed(() => tracks.value.length)
  const audioCount = computed(() => tracks.value.filter((t) => t.type === 'audio').length)
  const videoCount = computed(() => tracks.value.filter((t) => t.type === 'video').length)
  const recentTracks = computed(() =>
    [...tracks.value]
      .filter((t) => t.lastPlayed)
      .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
      .slice(0, 20)
  )
  const mostPlayed = computed(() =>
    [...tracks.value].sort((a, b) => b.playCount - a.playCount).slice(0, 20)
  )

  const artists = computed(() => {
    const map = new Map<string, MediaFile[]>()
    tracks.value.forEach((t) => {
      const artist = t.metadata?.artist || 'Unknown Artist'
      if (!map.has(artist)) map.set(artist, [])
      map.get(artist)!.push(t)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  })

  const albums = computed(() => {
    const map = new Map<string, MediaFile[]>()
    tracks.value.forEach((t) => {
      const album = t.metadata?.album || 'Unknown Album'
      if (!map.has(album)) map.set(album, [])
      map.get(album)!.push(t)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  })

  function addTrack(track: MediaFile) {
    const existing = tracks.value.findIndex((t) => t.path === track.path)
    if (existing >= 0) {
      tracks.value[existing] = track
    } else {
      tracks.value.push(track)
    }
  }

  function removeTrack(path: string) {
    tracks.value = tracks.value.filter((t) => t.path !== path)
  }

  function createPlaylist(name: string, description?: string): Playlist {
    const playlist: Playlist = {
      id: `playlist-${Date.now()}`,
      name,
      description,
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    playlists.value.push(playlist)
    return playlist
  }

  function addToPlaylist(playlistId: string, track: MediaFile) {
    const playlist = playlists.value.find((p) => p.id === playlistId)
    if (playlist) {
      playlist.tracks.push(track)
      playlist.updatedAt = Date.now()
    }
  }

  function removeFromPlaylist(playlistId: string, trackPath: string) {
    const playlist = playlists.value.find((p) => p.id === playlistId)
    if (playlist) {
      playlist.tracks = playlist.tracks.filter((t) => t.path !== trackPath)
      playlist.updatedAt = Date.now()
    }
  }

  function deletePlaylist(playlistId: string) {
    playlists.value = playlists.value.filter((p) => p.id !== playlistId)
  }

  function search(query: string): MediaFile[] {
    const q = query.toLowerCase()
    return tracks.value.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.metadata?.title?.toLowerCase().includes(q) ||
        t.metadata?.artist?.toLowerCase().includes(q) ||
        t.metadata?.album?.toLowerCase().includes(q)
    )
  }

  return {
    tracks,
    playlists,
    scannedPaths,
    isScanning,
    scanProgress,
    totalCount,
    audioCount,
    videoCount,
    recentTracks,
    mostPlayed,
    artists,
    albums,
    addTrack,
    removeTrack,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    search
  }
})
