import { describe, it, expect } from 'vitest';
import { parseFilterList, matchNetwork, cosmeticCssFor, scriptletsFor } from '../adblock-filters';

const LIST = [
  '! comment',
  '||ads.example.com^',
  '/tracker/*$image',
  '@@||example.com/ok^',
  'cda.pl###aa_ad',
  'ebd.cda.pl##+js(nowoif)',
  'site.com##.ad-box:style(display:block!important)'
].join('\n');

const set = parseFilterList(LIST);

function match(url: string, initiatorHost = 'page.example', type = 'xhr'): boolean {
  return matchNetwork(set, { url, initiatorHost, type });
}

describe('adblock-filters', () => {
  it('blocks a domain rule (including subdomains)', () => {
    expect(match('https://ads.example.com/x.js')).toBe(true);
    expect(match('https://sub.ads.example.com/x')).toBe(true);
    expect(match('https://example.com/x')).toBe(false);
  });

  it('honours an exception rule', () => {
    expect(match('https://example.com/ok/thing')).toBe(false);
  });

  it('respects resource-type options', () => {
    expect(match('https://cdn.example/tracker/pixel', 'page.example', 'image')).toBe(true);
    expect(match('https://cdn.example/tracker/pixel', 'page.example', 'script')).toBe(false);
  });

  it('emits cosmetic CSS for a matching host only', () => {
    expect(cosmeticCssFor(set, 'cda.pl')).toContain('#aa_ad{display:none!important}');
    expect(cosmeticCssFor(set, 'other.pl')).not.toContain('#aa_ad');
    expect(cosmeticCssFor(set, 'site.com')).toContain('.ad-box{display:block!important}');
  });

  it('collects scriptlets for a matching host', () => {
    const names = scriptletsFor(set, 'ebd.cda.pl').map((s) => s.name);
    expect(names).toContain('nowoif');
    expect(scriptletsFor(set, 'other.pl')).toHaveLength(0);
  });
});
