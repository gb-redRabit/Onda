import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import os, { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const h = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({ app: { getPath: () => h.userData } }));

import {
  decryptConf,
  encryptConf,
  encryptConfWithIv,
  legacyStoreKey,
  migrateLegacyStore
} from '../store-crypto';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'onda-store-crypto-'));
  h.userData = join(root, 'user-data');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('legacyStoreKey', () => {
  it('derives a 32 character key from the hostname', () => {
    const expected = createHash('sha256')
      .update(`onda-settings-${os.hostname()}`)
      .digest('hex')
      .slice(0, 32);

    expect(legacyStoreKey()).toBe(expected);
    expect(legacyStoreKey()).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('conf encryption', () => {
  it('round-trips utf-8 text', () => {
    const encrypted = encryptConf('{"theme":"ciemny"}', 'k'.repeat(32));

    expect(decryptConf(encrypted, 'k'.repeat(32))).toBe('{"theme":"ciemny"}');
  });

  it('rejects structurally corrupted payloads', () => {
    const key = 'a'.repeat(32);
    const encrypted = encryptConf('secret', key);

    expect(decryptConf(Buffer.from('too short'), key)).toBeNull();
    // Brak separatora po IV.
    expect(decryptConf(Buffer.alloc(17, 7), key)).toBeNull();
    // Szyfrogram nie jest wielokrotnością bloku — padding zawsze zawodzi.
    expect(decryptConf(encrypted.subarray(0, encrypted.length - 1), key)).toBeNull();
  });

  it('does not return the plaintext when the key is wrong', () => {
    // AES-CBC nie uwierzytelnia danych: przy złym kluczu padding może przejść
    // (średnio 1/256). Produkcyjnie odrzuca to walidacja JSON w migracji, więc
    // ten test nie może wymagać `null` — sprawdza tylko, że nie wycieka tekst.
    const encrypted = encryptConf('secret', 'a'.repeat(32));

    expect(decryptConf(encrypted, 'b'.repeat(32))).not.toBe('secret');
  });
});

describe('migrateLegacyStore', () => {
  const keyPath = () => join(h.userData, 'store.key');
  const configPath = () => join(h.userData, 'config.json');

  it('returns null when there is no config file', async () => {
    expect(await migrateLegacyStore(keyPath())).toBeNull();
  });

  it('skips empty and plain-JSON configs', async () => {
    await mkdir(h.userData, { recursive: true });
    await writeFile(configPath(), '');
    expect(await migrateLegacyStore(keyPath())).toBeNull();

    await writeFile(configPath(), '{"legacy":true}');
    expect(await migrateLegacyStore(keyPath())).toBeNull();
  });

  it('skips encrypted payloads with a bad header or wrong key', async () => {
    await mkdir(h.userData, { recursive: true });

    await writeFile(configPath(), Buffer.from('short'));
    expect(await migrateLegacyStore(keyPath())).toBeNull();

    const noSeparator = Buffer.alloc(17, 7);
    await writeFile(configPath(), noSeparator);
    expect(await migrateLegacyStore(keyPath())).toBeNull();

    await writeFile(configPath(), encryptConf('{"a":1}', 'wrong-key'));
    expect(await migrateLegacyStore(keyPath())).toBeNull();
  });

  it('re-encrypts a legacy config with a fresh key and keeps the contents', async () => {
    const plain = JSON.stringify({ theme: 'dark', volume: 0.5 });
    await mkdir(h.userData, { recursive: true });
    await writeFile(configPath(), encryptConf(plain, legacyStoreKey()));

    const fresh = await migrateLegacyStore(keyPath());

    expect(fresh).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(keyPath(), 'utf-8')).toBe(fresh);
    const rewritten = await readFile(configPath());
    expect(decryptConf(rewritten, fresh!)).toBe(plain);
  });

  it('creates the user data directory when missing', async () => {
    const nested = join(root, 'nested', 'user-data');
    h.userData = nested;
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, 'config.json'), encryptConf('{"x":1}', legacyStoreKey()));

    const fresh = await migrateLegacyStore(join(nested, 'store.key'));

    expect(fresh).toBeTruthy();
    expect(await readFile(join(nested, 'store.key'), 'utf-8')).toBe(fresh);
  });

  it('migrates even when the encrypted IV starts with a JSON brace', async () => {
    // Regresja: losowy IV zaczynający się od 0x7b (`{`) był brany za jawny JSON,
    // więc migracja zwracała null mniej więcej raz na 256 uruchomień.
    await mkdir(h.userData, { recursive: true });
    const iv = Buffer.concat([Buffer.from('{'), Buffer.alloc(15, 7)]);
    await writeFile(configPath(), encryptConfWithIv('{"legacy":true}', legacyStoreKey(), iv));

    const fresh = await migrateLegacyStore(keyPath());

    expect(fresh).toBeTruthy();
    expect(decryptConf(await readFile(configPath()), fresh!)).toBe('{"legacy":true}');
  });
});
