// NapiProjekt (polskie napisy dopasowane po zawartości pliku). Typy współdzielone
// między procesem main (klient HTTP + hash) a rendererem.

export interface NapiProjektDownloadParams {
  videoPath: string;
}

export interface NapiProjektDownloadResult {
  success: boolean;
  /** Ścieżka zapisanego pliku (obok wideo). */
  path?: string;
  format?: string;
  /** `not-found`, `missing-file`, `network` lub surowy komunikat. */
  error?: string;
}
