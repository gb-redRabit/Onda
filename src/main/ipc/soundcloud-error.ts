import type { IpcDownloadErrorCode } from '../../shared/types/ipc';
import { classifyYtDlpError } from '../downloads/error-classifier';
import { ScApiError } from './soundcloud-client';

// SoundCloud error-code mapping extracted from `soundcloud-handlers.ts` (plan 2.8).
export function errorCodeOf(e: unknown): IpcDownloadErrorCode {
  if (e instanceof ScApiError) return 'network';
  return classifyYtDlpError(e instanceof Error ? e.message : String(e));
}
