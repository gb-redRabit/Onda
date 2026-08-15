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

export interface SourcePagination {
  /** Nazwa query parametru strony / tokenu (np. 'page'). */
  pageParam?: string;
  /** Dot-path pola, z którego pobierany jest token następnej strony. */
  nextFromField?: string;
  /** Dot-path pola boolean "jest więcej" (np. 'pagination.has_next_page'). */
  totalField?: string;
}

export interface SourceMappingFields {
  id?: string;
  title?: string;
  subtitle?: string;
  thumbnail?: string;
  mediaUrl?: string;
  /** Literał ('image'|'video'|'audio'|'file') LUB dot-path do pola z typem. */
  type?: string;
  duration?: string;
  sourceUrl?: string;
}

export interface SourceMapping {
  /** Dot-path do tablicy elementów (np. 'data' albo 'posts'). */
  arrayPath?: string;
  fields: SourceMappingFields;
}

export interface SourceEndpoint {
  id: string;
  name: string;
  method: 'GET' | 'POST';
  path: string;
  /** Stałe query parametry (key=value). */
  params?: Record<string, string>;
  pagination?: SourcePagination;
  mapping: SourceMapping;
}

export interface MediaSource {
  id: string;
  name: string;
  baseUrl: string;
  auth: SourceAuth;
  endpoints: SourceEndpoint[];
  createdAt: number;
}

export interface SourceItem {
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  mediaUrl?: string;
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