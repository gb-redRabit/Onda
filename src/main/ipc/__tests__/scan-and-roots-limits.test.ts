import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addAllowedRoot, getExtraRoots } from '../../media/media-server';
import { createScanBudget, scanDir } from '../library/library-scan';

// Dwa pułapy, które ograniczały kiedyś *wynik*, a nie *koszt*: renderer
// mógł powiększać allowlistę mediów wywołanie po wywołaniu bez limitu, a
// skan biblioteki czytał i parsował każdy plik, zanim odrzucił nadmiar.

describe('extraRoots is bounded', () => {
  const CAP = 200;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'onda-roots-'));
  });

  it('refuses new roots past the ceiling without evicting what is already granted', async () => {
    // Ta lista to stan modułu bez eksportowanego resetu, więc ten jeden test
    // odpowiada za jej zapełnienie, zamiast zakładać czysty start.
    const first = join(dir, 'first');
    await mkdir(first, { recursive: true });
    expect(await addAllowedRoot(first)).toBe(true);

    for (let i = 0; i < CAP + 5; i++) {
      const sub = join(dir, `r${i}`);
      await mkdir(sub, { recursive: true });
      const ok = await addAllowedRoot(sub);
      if (i < CAP - 1) expect(ok, `root ${i} should be accepted`).toBe(true);
      else expect(ok, `root ${i} should be refused`).toBe(false);
    }

    const roots = getExtraRoots();
    expect(roots.length).toBe(CAP);
    // Odrzucony grant nie może usuwać czegoś już dozwolonego, bo wymykający się
    // kontroli wywołujący mógłby wybić foldery, z których aplikacja aktywnie odtwarza.
    // addAllowedRoot zapisuje realpath (rozwiązane symlinki / nazwy 8.3), więc
    // oczekiwanie trzeba znormalizować tak samo — tmpdir różni się między systemami.
    expect(roots).toContain(await realpath(first));
    expect(roots).toContain(await realpath(join(dir, 'r0')));

    // Idempotentne: ponowne proszenie o już dozwolony korzeń to nie nowy korzeń, więc
    // nie jest odrzucane, nawet gdy lista jest na pułapie.
    expect(await addAllowedRoot(first)).toBe(true);
    expect(getExtraRoots().length).toBe(CAP);
  });
});

describe('scanDir budget stops the walk instead of the result', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'onda-budget-'));
  });

  async function makeTracks(count: number): Promise<void> {
    await mkdir(dir, { recursive: true });
    const id3 = Buffer.concat([
      Buffer.from('ID3'),
      Buffer.from([0x04, 0x00, 0, 0, 0, 0, 0, 0, 0, 0])
    ]);
    await Promise.all(
      Array.from({ length: count }, (_u, i) =>
        writeFile(join(dir, `t${String(i).padStart(4, '0')}.mp3`), id3)
      )
    );
  }

  it('stops reading once the budget is spent', async () => {
    await makeTracks(200);
    const budget = createScanBudget(20);
    const result = await scanDir(dir, 8, 0, undefined, undefined, budget);

    expect(result.files.length).toBeLessThanOrEqual(20);
    expect(budget.truncated).toBe(true);
  });

  it('leaves the flag alone when everything fits', async () => {
    await makeTracks(5);
    const budget = createScanBudget(500);
    const result = await scanDir(dir, 8, 0, undefined, undefined, budget);

    expect(result.files.length).toBe(5);
    expect(budget.truncated).toBe(false);
  });

  it('scans everything when no budget is supplied', async () => {
    await makeTracks(60);
    const result = await scanDir(dir, 8, 0);
    expect(result.files.length).toBe(60);
  });
});
