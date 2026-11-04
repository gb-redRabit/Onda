import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { colorRefFromHex, resolveDwmDllPath } from '../dwm';

describe('colorRefFromHex', () => {
  it('converts #RRGGBB to COLORREF (0x00BBGGRR)', () => {
    expect(colorRefFromHex('#112233')).toBe(0x332211);
    expect(colorRefFromHex('#ff0000')).toBe(0x0000ff);
    expect(colorRefFromHex('#000000')).toBe(0);
  });

  it('rejects invalid colors', () => {
    expect(colorRefFromHex('112233')).toBeNull();
    expect(colorRefFromHex('#fff')).toBeNull();
    expect(colorRefFromHex('#gggggg')).toBeNull();
  });
});

describe('resolveDwmDllPath', () => {
  it('loads dwmapi.dll from System32 instead of the DLL search path', () => {
    expect(resolveDwmDllPath({ SystemRoot: 'C:\\Windows' } as NodeJS.ProcessEnv)).toBe(
      join('C:\\Windows', 'System32', 'dwmapi.dll')
    );
  });

  it('falls back to windir and then to the bare name', () => {
    expect(resolveDwmDllPath({ windir: 'D:\\Win' } as NodeJS.ProcessEnv)).toBe(
      join('D:\\Win', 'System32', 'dwmapi.dll')
    );
    expect(resolveDwmDllPath({} as NodeJS.ProcessEnv)).toBe('dwmapi.dll');
  });
});
