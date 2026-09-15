// Generates docs/ipc-inventory.md — a complete list of IPC channels with the
// main-process handler (if any) and whether the channel is allowlisted for
// invoke/send/receive in the preload. Read-only with respect to app code.
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const ROOT = process.cwd();
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'out', 'release']);

const HANDLE_RE = /ipcMain\.handle(?:Once)?\(\s*'([^']+)'/g;
const ON_RE = /ipcMain\.on\(\s*'([^']+)'/g;

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walk(join(dir, entry.name), out);
    } else if (/\.ts$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function extractSet(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return new Set();
  const open = source.indexOf('[', start);
  const close = source.indexOf(']);', open);
  const body = source.slice(open, close < 0 ? undefined : close);
  const set = new Set();
  for (const match of body.matchAll(/'([^']+)'/g)) set.add(match[1]);
  return set;
}

const handlers = new Map();
const senders = new Map();

for (const file of await walk(join(ROOT, 'src/main'))) {
  const source = await readFile(file, 'utf-8');
  const rel = file.replace(ROOT + '\\', '').replace(/\\/g, '/');
  for (const match of source.matchAll(HANDLE_RE)) {
    if (!handlers.has(match[1])) handlers.set(match[1], rel);
  }
  for (const match of source.matchAll(ON_RE)) {
    if (!senders.has(match[1])) senders.set(match[1], rel);
  }
}

const preload = await readFile(join(ROOT, 'src/preload/generated.ts'), 'utf-8');
const allowInvoke = extractSet(preload, 'const ALLOWED_INVOKE_CHANNELS');
const allowSend = extractSet(preload, 'const ALLOWED_SEND_CHANNELS');
const allowReceive = extractSet(preload, 'const ALLOWED_RECEIVE_CHANNELS');

const all = [
  ...new Set([...handlers.keys(), ...senders.keys(), ...allowInvoke, ...allowSend, ...allowReceive])
].sort();

const yes = (v) => (v ? '✓' : '');
const rows = all
  .map(
    (channel) =>
      `| \`${channel}\` | ${handlers.get(channel) || '—'} | ${yes(allowInvoke.has(channel))} | ${yes(allowSend.has(channel))} | ${yes(allowReceive.has(channel))} |`
  )
  .join('\n');

const unhandledInvoke = [...allowInvoke].filter((c) => !handlers.has(c)).sort();
const unlistedHandlers = [...handlers.keys()].filter((c) => !allowInvoke.has(c)).sort();

const out = `# Inwentaryzacja IPC

Wygenerowane przez \`npm run ipc:inventory\` (skrypt \`scripts/ipc-inventory.mjs\`).
Nie edytuj ręcznie — uruchom skrypt ponownie.

- Kanały łącznie: **${all.length}**
- Handlery w main: **${handlers.size}**
- Allowlisty preload: invoke **${allowInvoke.size}**, send **${allowSend.size}**, receive **${allowReceive.size}**

## Kanały

| Kanał | Handler (main) | invoke | send | receive |
|-------|----------------|:------:|:----:|:-------:|
${rows}

## Rozbieżności

### Allowlistowane do invoke, ale bez handlera w main (${unhandledInvoke.length})
${unhandledInvoke.length ? unhandledInvoke.map((c) => `- \`${c}\``).join('\n') : '_brak_'}

### Handlery w main poza allowlistą invoke (${unlistedHandlers.length})
Te kanały mają własne, typowane wrappery w preload (omijają guard) albo są wywoływane
przez kanały send.
${unlistedHandlers.length ? unlistedHandlers.map((c) => `- \`${c}\``).join('\n') : '_brak_'}
`;

await mkdir(join(ROOT, 'docs'), { recursive: true });
await writeFile(join(ROOT, 'docs/ipc-inventory.md'), out, 'utf-8');
console.log(`ipc-inventory: ${all.length} channels → docs/ipc-inventory.md`);
