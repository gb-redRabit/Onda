import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../../shared/logger';
import type { MediaSource, SourceEndpoint, SourceAuth } from '../../renderer/src/types/sources';

const MAX_SOURCES = 50;
const MAX_ENDPOINTS_PER_SOURCE = 20;
const MAX_FIELD_LEN = 200;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown, max = MAX_FIELD_LEN): string | undefined {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined;
}

function sanitizeAuth(v: unknown): SourceAuth {
  const base: SourceAuth = { type: 'none' };
  if (!isPlainObject(v)) return base;
  const type = v.type;
  if (type !== 'apikey' && type !== 'bearer' && type !== 'none') return base;
  base.type = type;
  if (typeof v.apiKeyId === 'string') base.apiKeyId = v.apiKeyId.slice(0, MAX_FIELD_LEN);
  if (typeof v.headerName === 'string') base.headerName = v.headerName.slice(0, MAX_FIELD_LEN);
  if (typeof v.queryParam === 'string') base.queryParam = v.queryParam.slice(0, MAX_FIELD_LEN);
  return base;
}

function sanitizeParams(v: unknown): Record<string, string> | undefined {
  if (!isPlainObject(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string' && k.length <= MAX_FIELD_LEN) out[k.slice(0, MAX_FIELD_LEN)] = val;
    if (Object.keys(out).length >= 50) break;
  }
  return Object.keys(out).length ? out : undefined;
}

export function sanitizeEndpoint(v: unknown, index: number): SourceEndpoint | null {
  if (!isPlainObject(v)) return null;
  const name = str(v.name) || `Endpoint ${index + 1}`;
  const path = str(v.path, 1000);
  if (!path) return null;
  const method = v.method === 'POST' ? 'POST' : 'GET';
  const fields = isPlainObject(v.mapping) && isPlainObject(v.mapping.fields) ? v.mapping.fields : {};
  const cleanField = (key: string): string | undefined => {
    const val = fields[key];
    return typeof val === 'string' ? val.slice(0, MAX_FIELD_LEN) : undefined;
  };
  const pagination =
    isPlainObject(v.pagination) && Object.keys(v.pagination).length
      ? {
          pageParam: typeof v.pagination.pageParam === 'string' ? v.pagination.pageParam.slice(0, 100) : undefined,
          nextFromField:
            typeof v.pagination.nextFromField === 'string'
              ? v.pagination.nextFromField.slice(0, MAX_FIELD_LEN)
              : undefined,
          totalField:
            typeof v.pagination.totalField === 'string'
              ? v.pagination.totalField.slice(0, MAX_FIELD_LEN)
              : undefined
        }
      : undefined;
  return {
    id: typeof v.id === 'string' && v.id ? v.id : randomUUID(),
    name,
    method,
    path,
    params: sanitizeParams(v.params),
    pagination: pagination && Object.values(pagination).some((x) => !!x) ? pagination : undefined,
    mapping: {
      arrayPath:
        typeof (v.mapping as Record<string, unknown>)?.arrayPath === 'string'
          ? ((v.mapping as Record<string, unknown>).arrayPath as string).slice(0, MAX_FIELD_LEN)
          : undefined,
      fields: {
        id: cleanField('id'),
        title: cleanField('title'),
        subtitle: cleanField('subtitle'),
        thumbnail: cleanField('thumbnail'),
        mediaUrl: cleanField('mediaUrl'),
        type: cleanField('type'),
        duration: cleanField('duration'),
        sourceUrl: cleanField('sourceUrl')
      }
    }
  };
}

export function sanitizeSource(v: unknown): MediaSource | null {
  if (!isPlainObject(v)) return null;
  const name = str(v.name);
  const baseUrl = typeof v.baseUrl === 'string' ? v.baseUrl.trim() : '';
  if (!name || !baseUrl) return null;
  if (!/^https?:\/\//i.test(baseUrl) || baseUrl.length > 1000) return null;
  if (!Array.isArray(v.endpoints) || v.endpoints.length === 0) return null;
  const endpoints = v.endpoints
    .slice(0, MAX_ENDPOINTS_PER_SOURCE)
    .map((e, i) => sanitizeEndpoint(e, i))
    .filter((e): e is SourceEndpoint => !!e);
  if (endpoints.length === 0) return null;
  return {
    id: typeof v.id === 'string' && v.id ? v.id : randomUUID(),
    name,
    baseUrl,
    auth: sanitizeAuth(v.auth),
    endpoints,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now()
  };
}

let writeChain: Promise<void> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeChain.then(fn);
  writeChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function readList(filePath: string): Promise<MediaSource[]> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list: MediaSource[] = [];
    for (const item of parsed) {
      const clean = sanitizeSource(item);
      if (clean) list.push(clean);
    }
    return list.slice(0, MAX_SOURCES);
  } catch {
    return [];
  }
}

async function writeList(filePath: string, list: MediaSource[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(list, null, 2), 'utf-8');
}

export async function loadSources(filePath: string): Promise<MediaSource[]> {
  return readList(filePath);
}

export function saveSource(
  filePath: string,
  raw: unknown
): Promise<{ list: MediaSource[]; saved: MediaSource | null; error?: string }> {
  return withWriteLock(async () => {
    const source = sanitizeSource(raw);
    if (!source) {
      logger.warn('sources', 'saveSource: invalid source payload rejected');
      return { list: await readList(filePath), saved: null, error: 'Invalid source' };
    }
    const list = await readList(filePath);
    const idx = list.findIndex((s) => s.id === source.id);
    if (idx >= 0) {
      list[idx] = source;
    } else {
      if (list.length >= MAX_SOURCES) {
        return { list, saved: null, error: 'Max sources reached' };
      }
      list.push(source);
    }
    await writeList(filePath, list);
    return { list, saved: source };
  });
}

export function deleteSource(filePath: string, id: string): Promise<MediaSource[]> {
  return withWriteLock(async () => {
    const list = await readList(filePath);
    const next = list.filter((s) => s.id !== id);
    if (next.length !== list.length) await writeList(filePath, next);
    return next;
  });
}