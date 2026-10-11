// Minimalny silnik filtrów w stylu Adblock Plus (podzbiór), wystarczający do
// zastosowania utrzymywanych list (np. oficjalne polskie filtry) w sesji podglądu.
// Obsługiwane: reguły sieciowe (`||domena^`, `/ścieżka/`, `*`, `$domain=`, typy,
// `third-party`, wyjątki `@@`) oraz kosmetyczne (`domena##selektor`, `:style(...)`,
// `:remove()`) i proste skryptlety (`##+js(...)`). Świadomie bez pełnej składni ABP.

export interface NetworkRule {
  regex: RegExp;
  exception: boolean;
  include: string[];
  exclude: string[];
  thirdParty?: boolean;
  types?: string[];
  notTypes?: string[];
}

export interface CosmeticRule {
  include: string[];
  exclude: string[];
  selector: string;
  style: string;
}

export interface ScriptletRule {
  include: string[];
  exclude: string[];
  name: string;
  args: string[];
}

export interface FilterSet {
  network: NetworkRule[];
  cosmetic: CosmeticRule[];
  scriptlets: ScriptletRule[];
}

// ABP typ żądania → `details.resourceType` Electrona.
const TYPE_MAP: Record<string, string> = {
  document: 'mainFrame',
  subdocument: 'subFrame',
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  object: 'object',
  xmlhttprequest: 'xhr',
  media: 'media',
  font: 'font',
  websocket: 'webSocket',
  ping: 'ping',
  other: 'other'
};

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Rejestrowalna domena (ostatnie dwie etykiety) — wystarczające dla 3rd-party. */
function registrable(host: string): string {
  const parts = host.split('.');
  return parts.slice(-2).join('.');
}

function isThirdParty(host: string, initiatorHost: string): boolean {
  if (!host || !initiatorHost) return true;
  return registrable(host) !== registrable(initiatorHost);
}

/** Zamienia wzorzec ABP na RegExp (podzbiór: `||`, `|`, `^`, `*`). */
export function patternToRegex(pattern: string): RegExp {
  let s = pattern;
  let domainAnchor = false;
  let startAnchor = false;
  let endAnchor = false;
  if (s.startsWith('||')) {
    s = s.slice(2);
    domainAnchor = true;
  } else if (s.startsWith('|')) {
    s = s.slice(1);
    startAnchor = true;
  }
  if (s.endsWith('|')) {
    s = s.slice(0, -1);
    endAnchor = true;
  }
  // Escape znaków specjalnych regexa (bez `*` i `^`, obsługiwanych osobno).
  s = s.replace(/[.+?${}()|[\]\\]/g, '\\$&');
  s = s.replace(/\*/g, '.*');
  s = s.replace(/\^/g, '(?:[^a-zA-Z0-9_.%-]|$)');
  let out = s;
  if (domainAnchor) out = '^[a-z]+://(?:[^/]+\\.)?' + out;
  else if (startAnchor) out = '^' + out;
  if (endAnchor) out += '$';
  try {
    return new RegExp(out, 'i');
  } catch {
    return /$^/;
  }
}

function parseDomainList(raw: string): { include: string[]; exclude: string[] } {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const part of raw.split(',')) {
    const d = part.trim().toLowerCase();
    if (!d) continue;
    if (d.startsWith('~')) exclude.push(d.slice(1));
    else include.push(d);
  }
  return { include, exclude };
}

function parseNetworkLine(line: string): NetworkRule | null {
  let text = line;
  let exception = false;
  if (text.startsWith('@@')) {
    exception = true;
    text = text.slice(2);
  }
  let options = '';
  const dollar = text.indexOf('$');
  if (dollar >= 0) {
    options = text.slice(dollar + 1);
    text = text.slice(0, dollar);
  }
  if (!text) return null;

  const rule: NetworkRule = { regex: patternToRegex(text), exception, include: [], exclude: [] };
  if (options) {
    const types: string[] = [];
    const notTypes: string[] = [];
    for (const opt of options.split(',')) {
      const o = opt.trim();
      if (o === 'third-party') rule.thirdParty = true;
      else if (o === '~third-party') rule.thirdParty = false;
      else if (o.startsWith('domain=')) {
        const dom = parseDomainList(o.slice('domain='.length));
        rule.include = dom.include;
        rule.exclude = dom.exclude;
      } else if (o.startsWith('~')) {
        const mapped = TYPE_MAP[o.slice(1)];
        if (mapped) notTypes.push(mapped);
      } else if (TYPE_MAP[o]) {
        types.push(TYPE_MAP[o]);
      }
    }
    if (types.length) rule.types = types;
    if (notTypes.length) rule.notTypes = notTypes;
  }
  return rule;
}

function parseCosmeticLine(line: string, set: FilterSet): void {
  const marker = line.includes('#@#') ? '#@#' : line.includes('#?#') ? '#?#' : '##';
  if (marker === '#@#' || marker === '#?#') return; // wyjątki/proceduralne pomijamy
  const idx = line.indexOf('##');
  if (idx < 0) return;
  const domainsRaw = line.slice(0, idx);
  let body = line.slice(idx + 2);
  if (!body) return;
  const domains = parseDomainList(domainsRaw);

  if (body.startsWith('+js(') && body.endsWith(')')) {
    const args = body
      .slice(4, -1)
      .split(',')
      .map((a) => a.trim().replace(/^['"]|['"]$/g, ''));
    const [name, ...rest] = args;
    if (name)
      set.scriptlets.push({ include: domains.include, exclude: domains.exclude, name, args: rest });
    return;
  }

  let style = 'display:none!important';
  const styleMatch = /:style\(([^)]*)\)/.exec(body);
  if (styleMatch) {
    style = styleMatch[1] ?? 'display:none!important';
    body = body.slice(0, styleMatch.index);
  } else if (body.includes(':remove()')) {
    body = body.replace(':remove()', '');
  }
  const selector = body.trim();
  if (selector)
    set.cosmetic.push({ include: domains.include, exclude: domains.exclude, selector, style });
}

export function parseFilterList(text: string): FilterSet {
  const set: FilterSet = { network: [], cosmetic: [], scriptlets: [] };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    if (line.includes('##') || line.includes('#@#') || line.includes('#?#')) {
      parseCosmeticLine(line, set);
      continue;
    }
    if (line.startsWith('#')) continue;
    const rule = parseNetworkLine(line);
    if (rule) set.network.push(rule);
  }
  return set;
}

function domainMatches(host: string, include: string[], exclude: string[]): boolean {
  if (!include.length && !exclude.length) return true;
  const inInc = include.length === 0 || include.some((d) => host === d || host.endsWith('.' + d));
  const inExc = exclude.some((d) => host === d || host.endsWith('.' + d));
  return inInc && !inExc;
}

export interface MatchInput {
  url: string;
  initiatorHost: string;
  type: string;
}

export function matchNetwork(set: FilterSet, input: MatchInput): boolean {
  const host = hostOf(input.url);
  let blocked = false;
  for (const r of set.network) {
    if (r.types && !r.types.includes(input.type)) continue;
    if (r.notTypes && r.notTypes.includes(input.type)) continue;
    if (!domainMatches(input.initiatorHost, r.include, r.exclude)) continue;
    if (r.thirdParty !== undefined && isThirdParty(host, input.initiatorHost) !== r.thirdParty) {
      continue;
    }
    if (!r.regex.test(input.url)) continue;
    if (r.exception) return false;
    blocked = true;
  }
  return blocked;
}

export function cosmeticCssFor(set: FilterSet, host: string): string {
  const parts: string[] = [];
  for (const r of set.cosmetic) {
    if (!domainMatches(host, r.include, r.exclude)) continue;
    parts.push(`${r.selector}{${r.style}}`);
  }
  return parts.join('\n');
}

export function scriptletsFor(set: FilterSet, host: string): ScriptletRule[] {
  return set.scriptlets.filter((r) => domainMatches(host, r.include, r.exclude));
}
