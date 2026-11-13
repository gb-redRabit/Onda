import { describe, expect, it } from 'vitest';
import {
  cosmeticCssFor,
  hostOf,
  matchNetwork,
  parseFilterList,
  patternToRegex,
  scriptletsFor
} from '../adblock-filters';

// Subset Adblock Plus engine: network/cosmetic/scriptlet parsing and matching.

describe('hostOf', () => {
  it('lowercases the URL host and tolerates invalid URLs', () => {
    expect(hostOf('https://Ads.Example.com/path')).toBe('ads.example.com');
    expect(hostOf('not a url')).toBe('');
  });
});

describe('patternToRegex', () => {
  it('supports domain anchors, start/end anchors, wildcards and separators', () => {
    expect(patternToRegex('||example.com^').test('https://cdn.example.com/x')).toBe(true);
    expect(patternToRegex('||example.com^').test('https://example.com.evil/x')).toBe(false);

    expect(patternToRegex('|https://example.com').test('https://example.com/x')).toBe(true);
    expect(patternToRegex('ad.js|').test('https://x/ad.js')).toBe(true);
    expect(patternToRegex('ad.js|').test('https://x/ad.js?v=1')).toBe(false);
    expect(patternToRegex('/ads/*/banner').test('https://x/ads/a/banner')).toBe(true);
    expect(patternToRegex('foo.bar').test('https://x/fooXbar')).toBe(false);
  });
});

describe('parseFilterList', () => {
  it('parses network rules with options', () => {
    const set = parseFilterList(
      [
        '! comment',
        '[Adblock Plus 2.0]',
        '||ads.example^',
        '@@||allowed.example^$script',
        '||cdn.example^$third-party,image,~media,domain=site.example|~skip.example'
      ].join('\n')
    );

    expect(set.network).toHaveLength(3);
    expect(set.network[0]).toMatchObject({ exception: false });
    expect(set.network[1]).toMatchObject({ exception: true, types: ['script'] });
    expect(set.network[2]).toMatchObject({
      thirdParty: true,
      types: ['image'],
      notTypes: ['media'],
      include: ['site.example'],
      exclude: ['skip.example']
    });
  });

  it('parses cosmetic rules, style overrides and remove rules', () => {
    const set = parseFilterList(
      [
        'example.com##.ad',
        '##.global-ad',
        'example.com##.box:style(visibility:hidden)',
        'example.com##.gone:remove()',
        'example.com#@#.exception',
        'example.com#?#.procedural'
      ].join('\n')
    );

    expect(set.cosmetic).toHaveLength(4);
    expect(set.cosmetic[0]).toMatchObject({
      include: ['example.com'],
      selector: '.ad',
      style: 'display:none!important'
    });
    expect(set.cosmetic[1]).toMatchObject({ include: [], selector: '.global-ad' });
    expect(set.cosmetic[2]).toMatchObject({ selector: '.box', style: 'visibility:hidden' });
    expect(set.cosmetic[3]).toMatchObject({ selector: '.gone' });
  });

  it('parses scriptlet rules and strips quotes', () => {
    const set = parseFilterList("example.com##+js(set-constant, 'foo', 'bar')\nbad##+js()");

    expect(set.scriptlets).toEqual([
      {
        include: ['example.com'],
        exclude: [],
        name: 'set-constant',
        args: ['foo', 'bar']
      }
    ]);
  });

  it('skips malformed and unsupported lines', () => {
    const set = parseFilterList(
      ['', '# comment', '##', 'example.com##', 'example.com#@#.x', '@@'].join('\n')
    );

    expect(set.network).toEqual([]);
    expect(set.cosmetic).toEqual([]);
    expect(set.scriptlets).toEqual([]);
  });

  it('ignores unknown option names and empty cosmetic selectors', () => {
    const set = parseFilterList(
      ['||x.example^$bogus,~unknown', 'example.com##:remove()', 'example.com##:style()'].join('\n')
    );

    expect(set.network[0]!.types).toBeUndefined();
    expect(set.network[0]!.notTypes).toBeUndefined();
    expect(set.cosmetic).toEqual([]);
  });
});

describe('matchNetwork', () => {
  const set = parseFilterList(
    [
      '||ads.example^',
      '@@||ads.example/allowed^',
      '||images.example^$third-party,image',
      '||first.example^$third-party',
      '||same.example^$~third-party',
      '||sub.example^$domain=site.example',
      '||skip.example^$domain=~skip.example'
    ].join('\n')
  );

  it('blocks a matching request and lets exceptions win', () => {
    expect(
      matchNetwork(set, {
        url: 'https://ads.example/banner.png',
        initiatorHost: 'site.example',
        type: 'image'
      })
    ).toBe(true);
    expect(
      matchNetwork(set, {
        url: 'https://ads.example/allowed/file.png',
        initiatorHost: 'site.example',
        type: 'image'
      })
    ).toBe(false);
  });

  it('filters by resource type', () => {
    expect(
      matchNetwork(set, {
        url: 'https://images.example/a.png',
        initiatorHost: 'other.example',
        type: 'image'
      })
    ).toBe(true);
    expect(
      matchNetwork(set, {
        url: 'https://images.example/a.png',
        initiatorHost: 'other.example',
        type: 'script'
      })
    ).toBe(false);
    expect(
      matchNetwork(set, {
        url: 'https://images.example/a.png',
        initiatorHost: 'other.example',
        type: 'media'
      })
    ).toBe(false);
  });

  it('honours third-party and first-party constraints', () => {
    expect(
      matchNetwork(set, {
        url: 'https://first.example/a',
        initiatorHost: 'site.example',
        type: 'other'
      })
    ).toBe(true);
    expect(
      matchNetwork(set, {
        url: 'https://first.example/a',
        initiatorHost: 'www.first.example',
        type: 'other'
      })
    ).toBe(false);
    expect(
      matchNetwork(set, {
        url: 'https://same.example/a',
        initiatorHost: 'www.same.example',
        type: 'other'
      })
    ).toBe(true);
    expect(
      matchNetwork(set, {
        url: 'https://same.example/a',
        initiatorHost: 'other.example',
        type: 'other'
      })
    ).toBe(false);
  });

  it('honours domain includes and excludes', () => {
    expect(
      matchNetwork(set, {
        url: 'https://sub.example/a',
        initiatorHost: 'site.example',
        type: 'other'
      })
    ).toBe(true);
    expect(
      matchNetwork(set, {
        url: 'https://sub.example/a',
        initiatorHost: 'other.example',
        type: 'other'
      })
    ).toBe(false);
    expect(
      matchNetwork(set, {
        url: 'https://skip.example/a',
        initiatorHost: 'skip.example',
        type: 'other'
      })
    ).toBe(false);
  });

  it('returns false without a matching rule or with no rules', () => {
    expect(
      matchNetwork(set, {
        url: 'https://clean.example/a',
        initiatorHost: 'site.example',
        type: 'other'
      })
    ).toBe(false);
    expect(
      matchNetwork(parseFilterList(''), {
        url: 'https://ads.example/a',
        initiatorHost: '',
        type: 'other'
      })
    ).toBe(false);
  });

  it('treats missing hosts as third-party', () => {
    const onlyThirdParty = parseFilterList('||cdn.example^$third-party');

    expect(
      matchNetwork(onlyThirdParty, { url: 'not a url', initiatorHost: '', type: 'other' })
    ).toBe(false);
    expect(
      matchNetwork(onlyThirdParty, {
        url: 'https://cdn.example/x',
        initiatorHost: '',
        type: 'other'
      })
    ).toBe(true);
  });

  it('honours excluded resource types on their own', () => {
    const set2 = parseFilterList('||media.example^$~media');

    expect(
      matchNetwork(set2, {
        url: 'https://media.example/x',
        initiatorHost: 'site.example',
        type: 'media'
      })
    ).toBe(false);
    expect(
      matchNetwork(set2, {
        url: 'https://media.example/x',
        initiatorHost: 'site.example',
        type: 'image'
      })
    ).toBe(true);
  });
});

describe('cosmetic and scriptlet selection', () => {
  const set = parseFilterList(
    [
      'example.com##.ad',
      'other.com##.other',
      'example.com##+js(noop)',
      'other.com##+js(other)'
    ].join('\n')
  );

  it('returns CSS only for the matching host', () => {
    expect(cosmeticCssFor(set, 'example.com')).toBe('.ad{display:none!important}');
    expect(cosmeticCssFor(set, 'other.com')).toBe('.other{display:none!important}');
    expect(cosmeticCssFor(set, 'third.com')).toBe('');
  });

  it('returns scriptlets for the matching host', () => {
    expect(scriptletsFor(set, 'example.com').map((r) => r.name)).toEqual(['noop']);
    expect(scriptletsFor(set, 'third.com')).toEqual([]);
  });
});
