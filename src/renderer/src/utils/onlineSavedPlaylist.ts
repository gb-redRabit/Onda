// Stable saved-playlist id: channels use the source URL, playlists prefer the
// YouTube `list=` parameter and fall back to the URL.
export function savedPlaylistId(r: { kind: string; sourceUrl: string }): string {
  return r.kind === 'channel'
    ? r.sourceUrl
    : (r.sourceUrl.match(/[?&]list=([\w-]+)/)?.[1] ?? r.sourceUrl);
}
