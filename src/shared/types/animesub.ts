export interface AnimeSubSearchParams {
  query: string;
}

export interface AnimeSubResult {
  /** ID napisów (`id` z formularza pobierania). */
  id: string;
  /** Token sesji wymagany przy pobraniu (unieważnia się między sesjami). */
  sh: string;
  title: string;
  language: string;
}

export interface AnimeSubSearchResult {
  success: boolean;
  results: AnimeSubResult[];
  error?: string;
}

export interface AnimeSubDownloadParams {
  id: string;
  sh: string;
  videoPath?: string;
}

export interface AnimeSubDownloadResult {
  success: boolean;
  path?: string;
  format?: string;
  error?: string;
}
