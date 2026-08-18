export type SourceItemType = 'image' | 'video' | 'audio' | 'file';

export type SourceAuthType = 'none' | 'apikey' | 'bearer';

export interface SourceAuth {
  type: SourceAuthType;
  /** id wpisu z settings.apiKeys (klucz odszyfrowywany wyłącznie w main). */
  apiKeyId?: string;
  /** Dla apikey: nazwa nagłówka, np. 'X-API-Key'. */
  headerName?: string;
  /** Dla apikey: nazwa query parametru, np. 'api_key'. */
  queryParam?: string;
}

interface SourcePagination {
  /** Nazwa query parametru strony / tokenu (np. 'page'). */
  pageParam?: string;
  /** Numer pierwszej strony (tryb liczbowy), domyślnie 1. */
  pageStart?: number;
  /** Dot-path pola, z którego pobierany jest token następnej strony. */
  nextFromField?: string;
  /** Dot-path pola boolean "jest więcej" (np. 'pagination.has_next_page'). */
  totalField?: string;
}

interface SourceMappingFields {
  id?: string;
  title?: string;
  subtitle?: string;
  thumbnail?: string;
  mediaUrl?: string;
  /** Dot-path do URL odtwarzacza/embed (np. mega.nz/embed, cda, vk, drive) — pokazywany w iframe i pobierany przez yt-dlp. */
  playerUrl?: string;
  /** Literał ('image'|'video'|'audio'|'file') LUB dot-path do pola z typem. */
  type?: string;
  duration?: string;
  sourceUrl?: string;
}

interface SourceMapping {
  /** Dot-path do tablicy elementów (np. 'data' albo 'posts'). */
  arrayPath?: string;
  fields: SourceMappingFields;
}

interface SourceRange {
  /** Dot-path pola w kontekście (surowy JSON rodzica) z liczbą elementów, np. 'episodes'. */
  countField?: string;
  /** Stała liczba elementów (alternatywa dla countField). */
  countValue?: number;
  /** Numer pierwszego elementu, domyślnie 1. */
  startAt?: number;
  /** Szablon tytułu, np. 'Odcinek {n}'. */
  titleTemplate?: string;
}

/** Typ poziomu: 'list' = karty, 'page' = pojedynczy obiekt (strona) z opcjonalną tabelą. Brak = 'list'. */
type SourceEndpointType = 'list' | 'page';

export interface SourcePassKey {
  /** Dot-path pola w obiekcie, np. 'slug' albo 'anime_episode_number'. */
  from: string;
  /** Nazwa placeholdera w ścieżce dziecka, np. 'slug' → {slug}. */
  as: string;
  /** 'number' wstawia wartość bez zmian; 'string' przez encodeURIComponent w segmencie ścieżki. */
  type: 'string' | 'number';
}

export interface SourceTable {
  /** 'field' = tablica z odpowiedzi strony; 'endpoint' = osobny fetch po table.path. */
  mode: 'field' | 'endpoint';
  /** mode='field': dot-path do tablicy w odpowiedzi strony. */
  arrayField?: string;
  /** mode='endpoint': ścieżka z placeholderami kontekstu strony, np. '/v1/episodes/count/{slug}'. */
  path?: string;
  /** Pole klucza wiersza, np. 'anime_episode_number' (podstawiane pod {n}). */
  rowKey?: string;
  /** Szablon tytułu wiersza, np. 'Odcinek {n}'; {n} = wartość rowKey, {a.b} = pola wiersza. */
  title?: string;
  /** Dot-path miniatury w wierszu, np. 'bg'. */
  thumbnail?: string;
  /** Dot-path URL odtwarzacza w wierszu (embed/player) — pobierany przez yt-dlp. */
  playerUrl?: string;
  /** Klucze wiersza przekazywane dalej (kontrakt edytora; rozwiązywanie i tak przez kontekst). */
  passKeys?: SourcePassKey[];
  /** Poziom otwierany po kliknięciu wiersza. */
  childId?: string;
}

export interface SourceEndpoint {
  id: string;
  name: string;
  method: 'GET' | 'POST';
  path: string;
  /** Typ poziomu: 'page' = strona (single object), brak = 'list'. */
  type?: SourceEndpointType;
  /** Stałe query parametry (key=value). */
  params?: Record<string, string>;
  pagination?: SourcePagination;
  /** Id endpointu otwieranego po kliknięciu elementu (nawigacja w dół, np. lista → szczegóły). */
  childId?: string;
  /** Generator listy liczbowej (np. odcinki 1..N) zamiast fetcha; wymaga kontekstu z rodzica. */
  range?: SourceRange;
  /** Klucze przekazywane do poziomów podrzędnych (kontrakt kreatora). */
  passKeys?: SourcePassKey[];
  /** Sekcja tabeli (tylko type='page', np. odcinki serii). */
  table?: SourceTable;
  mapping: SourceMapping;
}

/** Preferencje pobierania dla źródła (edytowane w kreatorze źródła). */
export interface SourceDownloadPrefs {
  /** Katalog docelowy; domyślnie <ścieżka z ustawień Pobranych>/api. */
  outputDir?: string;
  /** true = pliki trafiają do podfolderu o nazwie źródła; false = płasko w outputDir. */
  folder?: boolean;
}

export interface MediaSource {
  id: string;
  name: string;
  /** Ikona źródła: data URL (wgrany obraz) lub adres http(s). */
  icon?: string;
  baseUrl: string;
  auth: SourceAuth;
  endpoints: SourceEndpoint[];
  download?: SourceDownloadPrefs;
  createdAt: number;
}

export interface SourceItem {
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  mediaUrl?: string;
  /** URL odtwarzacza/embed (mega/cda/vk/drive) — iframe w podglądzie, pobieranie przez yt-dlp. */
  playerUrl?: string;
  type: SourceItemType;
  duration?: string;
  sourceUrl?: string;
  extra?: Record<string, unknown>;
}

export interface SourceFetchResult {
  items: SourceItem[];
  hasMore: boolean;
  nextFrom?: string;
  error?: string;
}

export interface SourceTestResult {
  success: boolean;
  status?: number;
  sample?: SourceItem;
  error?: string;
}
