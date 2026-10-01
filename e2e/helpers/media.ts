import { mkdtempSync, writeFileSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

// Generates real media fixtures so the scan and the player run against the
// actual filesystem instead of mocks.

export interface MediaFixture {
  dir: string;
  wavPath: string;
}

function buildToneWav(seconds: number, frequency: number, sampleRate: number): Buffer {
  const samples = Math.floor(seconds * sampleRate);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    buffer.writeInt16LE(Math.round(sample * 0.2 * 32767), 44 + i * 2);
  }
  return buffer;
}

export function createMediaFixture(): MediaFixture {
  const dir = mkdtempSync(join(tmpdir(), 'onda-media-'));
  const wavPath = join(dir, 'tone.wav');
  writeFileSync(wavPath, buildToneWav(1, 440, 8000));
  return { dir, wavPath };
}

// A folder with `count` real PNGs (copies of the app icon) for the image viewer
// / thumbnail strip stress tests.
export interface ImageFixture {
  dir: string;
  files: string[];
}

export function createImageFixture(count = 55): ImageFixture {
  const dir = mkdtempSync(join(tmpdir(), 'onda-images-'));
  const source = resolve(__dirname, '..', '..', 'resources', 'icon.png');
  const files: string[] = [];
  for (let i = 1; i <= count; i++) {
    const dest = join(dir, `img-${String(i).padStart(3, '0')}.png`);
    copyFileSync(source, dest);
    files.push(dest);
  }
  return { dir, files };
}
