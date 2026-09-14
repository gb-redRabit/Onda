import type { Component } from 'vue';
import type { MediaFile } from '@renderer/types/media';

export type FlatItem =
  | { type: 'track'; track: MediaFile; label: string; sub: string }
  | { type: 'playlist'; label: string; sub: number; action: () => void }
  | { type: 'action'; label: string; icon: Component; action: () => void };

export interface SearchGroup {
  key: string;
  label: string;
  items: FlatItem[];
}

export function include(q: string, ...parts: string[]): boolean {
  return !q || parts.some((p) => p.toLowerCase().includes(q));
}
