import { describe, it, expect } from 'vitest';
import { runCommand } from '../exec';

describe('runCommand', () => {
  it('resolves with stdout for successful commands', async () => {
    const stdout = await runCommand(process.execPath, ['-p', '2 + 2']);
    expect(stdout.trim()).toBe('4');
  });

  it('rejects with stderr when the command exits non-zero', async () => {
    await expect(
      runCommand(process.execPath, ['-e', 'console.error("boom"); process.exit(3)'])
    ).rejects.toThrow(/boom/);
  });

  it('rejects when the binary does not exist', async () => {
    await expect(
      runCommand('onda-no-such-binary-xyz', ['--version'], { timeout: 5000 })
    ).rejects.toThrow();
  });

  it('rejects when the command times out', async () => {
    await expect(
      runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { timeout: 500 })
    ).rejects.toThrow();
  });
});
