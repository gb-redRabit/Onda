import { AUDIO_EXTS, IMAGE_EXTS, VIDEO_EXTS } from './constants';
import {
  TOOL_IDS,
  TOOL_INPUTS,
  type ToolId,
  type ToolInputKind,
  type ToolWindowContext
} from './types/tools';

// Wspólna logika „czy to narzędzie przyjmie te pliki?”. Używana przez menu
// kontekstowe Eksploratora i przez widoki narzędzi przy wczytywaniu parametrów.

const KIND_BY_EXT = new Map<string, ToolInputKind>();
for (const ext of AUDIO_EXTS) KIND_BY_EXT.set(ext.replace(/^\./, ''), 'audio');
for (const ext of VIDEO_EXTS) KIND_BY_EXT.set(ext.replace(/^\./, ''), 'video');
for (const ext of IMAGE_EXTS) KIND_BY_EXT.set(ext.replace(/^\./, ''), 'image');

export function fileExtension(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export function inputKindOfPath(path: string): ToolInputKind | null {
  return KIND_BY_EXT.get(fileExtension(path)) ?? null;
}

/** Ścieżki z parametrów okna narzędzia: `paths[]` albo pojedynczy `path`. */
export function toolContextPaths(context: ToolWindowContext | null | undefined): string[] {
  const params = context?.params;
  if (!params) return [];
  const raw = Array.isArray(params['paths'])
    ? params['paths']
    : typeof params['path'] === 'string'
      ? [params['path']]
      : [];
  return raw.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function acceptedFiles(
  toolId: ToolId,
  paths: readonly string[]
): Array<{ path: string; kind: ToolInputKind }> {
  const spec = TOOL_INPUTS[toolId];
  if (!spec) return [];
  const seen = new Set<string>();
  const files: Array<{ path: string; kind: ToolInputKind }> = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    const kind = inputKindOfPath(path);
    if (!kind || !spec.kinds.includes(kind)) continue;
    const extensions = spec.extensions[kind];
    if (!extensions || !extensions.includes(fileExtension(path))) continue;
    seen.add(path);
    files.push({ path, kind });
  }
  return files;
}

/** Pliki z wejścia, które narzędzie faktycznie przyjmie (bez duplikatów, z limitem). */
export function filesForTool(toolId: ToolId, paths: readonly string[]): string[] {
  const spec = TOOL_INPUTS[toolId];
  if (!spec) return [];
  return acceptedFiles(toolId, paths)
    .slice(0, spec.maxFiles)
    .map((file) => file.path);
}

export function isToolAvailableForFiles(toolId: ToolId, paths: readonly string[]): boolean {
  const spec = TOOL_INPUTS[toolId];
  if (!spec) return false;
  const files = acceptedFiles(toolId, paths);
  if (files.length === 0) return false;
  if (!spec.multiple && files.length !== 1) return false;
  if (!spec.allowMixedKinds && new Set(files.map((file) => file.kind)).size > 1) return false;
  return true;
}

/** Narzędzia pasujące do zaznaczenia, w kolejności rejestru. */
export function toolsForFiles(paths: readonly string[]): ToolId[] {
  return TOOL_IDS.filter((toolId) => isToolAvailableForFiles(toolId, paths));
}
