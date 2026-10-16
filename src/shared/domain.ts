// Czy host należy do domeny `suffix`: dokładne dopasowanie lub subdomena.
// Ujednolica trzy wcześniejsze implementacje (domeny cookie providerów, cookie
// YouTube, filtry ad-blocka). Prowadzący kropkę po obu stronach normalizujemy, więc
// `.youtube.com` i `youtube.com` są równoważne.
export function domainMatches(host: string, suffix: string): boolean {
  const h = (host || '').replace(/^\./, '').toLowerCase();
  const s = (suffix || '').replace(/^\./, '').toLowerCase();
  if (!h || !s) return false;
  return h === s || h.endsWith(`.${s}`);
}
