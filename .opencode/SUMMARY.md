# Onda — Summary

## Completed

### Core

- Virtualized track list (`@tanstack/vue-virtual` row-based)
- Virtualized video grid (column-based)
- Virtualized album grid (column-based)
- Cover cache with `triggerRef` (`stores/player.ts`)
- `toFileUrl` helper for audio paths (`modules/audioEngine.ts`)
- Settings components code-split via `defineAsyncComponent`

### ID3 Tag Editing (B3)

- `node-id3` installed
- `media:writeTags` IPC handler
- `TrackTagEditor.vue` component — edit title, artist, album, year, genre, track number
  - **Name field** — rename the file
  - **Album cover** — show embedded cover art
  - **Image upload** — pick & write new cover via `dialog:openImage` + `media:writeCover`
  - `media:renameFile` IPC handler
  - `media:writeCover` / `media:readCover` IPC handlers

### Scan Fixes

- `scanDir` now populates `metadata` and `duration` via `getMetadata()` using `NodeID3.read()`
- `media:getMetadata` reads actual ID3 tags
- `refreshDerived()` in library store with `triggerRef(tracks)`
- Fixed `ListMusic` import

### MusicBrainz Integration (B4)

- `src/main/ipc/musicbrainz.ts` — service wrapping MusicBrainz API + Cover Art Archive
  - `musicbrainz:searchRelease` — search releases by query
  - `musicbrainz:lookupRelease` — get release details (track list, credits)
  - `musicbrainz:getCoverData` — fetch cover art binary data
- `MusicBrainzLookup.vue` — search modal with release list, track preview, apply button
- Button in library toolbar (tracks tab)
- Applies metadata + cover art to currently editing track

## In Progress / Not Started

- Favorites column (heart toggle per track)
- Configurable info columns
