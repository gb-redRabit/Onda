// Stabilne id zapisanej playlisty: kanały używają źródłowego URL, playlisty preferują
// parametr `list=` YouTube i wycofują się do URL.
export function savedPlaylistId(r: { kind: string; sourceUrl: string }): string {
  return r.kind === 'channel'
    ? r.sourceUrl
    : (r.sourceUrl.match(/[?&]list=([\w-]+)/)?.[1] ?? r.sourceUrl);
}
