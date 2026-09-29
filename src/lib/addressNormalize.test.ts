/**
 * What the normaliser has to get right, written as the addresses that made each
 * rule necessary. Every Korean address here is one Conner actually sent, copied
 * out of the shortlists in `data/`; the Japanese ones are the forms Tokyo
 * listings use, since the Tokyo shortlists are not in yet.
 *
 * Run with `npm test`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectLocale, normalizeAddress, queryLadder } from './addressNormalize.ts';

/** The queries the ladder would try, for asserting about without the precisions. */
const queries = (raw: string) => queryLadder(raw).map((s) => s.q);
/** The precision of the narrowest rung — the best any answer could claim. */
const best = (raw: string) => queryLadder(raw)[0].precision;

describe('detectLocale', () => {
  it('reads Korean off a romanised Seoul address', () => {
    assert.equal(detectLocale('137 Seobinggo-ro, Yongsan-gu, Seoul'), 'kr');
  });

  it('reads Japanese off a romanised Tokyo address', () => {
    assert.equal(detectLocale('1-2-3 Jingumae, Shibuya-ku, Tokyo'), 'jp');
  });

  it('is not fooled by -ku looking like -gu', () => {
    assert.equal(detectLocale('Ginza, Chuo-ku, Tokyo'), 'jp');
    assert.equal(detectLocale('Insadong, Jongno-gu, Seoul'), 'kr');
  });

  it('reads the script when there is one', () => {
    assert.equal(detectLocale('서울 종로구 북촌로 16'), 'kr');
    assert.equal(detectLocale('東京都新宿区歌舞伎町1-2-3'), 'jp');
  });

  it('leaves an address from neither country alone', () => {
    assert.equal(detectLocale('1600 Pennsylvania Avenue NW, Washington'), 'other');
  });
});

describe('the address as given is always tried first', () => {
  it('never reorders an address that already works', () => {
    const asked = queries('137 Seobinggo-ro, Yongsan-gu, Seoul');
    assert.equal(asked[0], '137 Seobinggo-ro, Yongsan-gu, Seoul');
  });

  it('keeps the original text whatever it does to the queries', () => {
    const messy = '2F Hilltop Bldg, 19 Dosan-daero 67-gil, Gangnam-gu, Seoul';
    assert.equal(normalizeAddress(messy).original, messy);
  });
});

describe('naming the country', () => {
  it('adds South Korea, which is what a romanised Korean road usually needs', () => {
    assert.ok(queries('121 Daesagwan-ro, Seongbuk-gu, Seoul').includes(
      '121 Daesagwan-ro, Seongbuk-gu, Seoul, South Korea',
    ));
  });

  it('adds Japan for a Tokyo address', () => {
    assert.ok(queries('1-2-3 Jingumae, Shibuya-ku, Tokyo').some((q) => q.endsWith(', Japan')));
  });

  it('does not add a country twice', () => {
    for (const q of queries('60 Yulgok-ro, Jongno-gu, Seoul, South Korea')) {
      assert.equal(q.match(/South Korea/g)?.length ?? 0, q.includes('South Korea') ? 1 : 0);
    }
  });

  it('leaves an address from neither country without one', () => {
    for (const q of queries('1600 Pennsylvania Avenue NW, Washington')) {
      assert.ok(!/South Korea|Japan/.test(q));
    }
  });
});

describe('floors, buildings and prose', () => {
  it('drops a floor and a building from in front of the address', () => {
    assert.ok(queries('2F Hilltop Bldg, 19 Dosan-daero 67-gil, Gangnam-gu, Seoul').includes(
      '19 Dosan-daero 67-gil, Gangnam-gu, Seoul',
    ));
  });

  it('drops a floor from the middle of one', () => {
    assert.ok(queries('8-1 Dosan-daero 45-gil, 1F-2F, Gangnam-gu, Seoul').includes(
      '8-1 Dosan-daero 45-gil, Gangnam-gu, Seoul',
    ));
  });

  it('drops a basement written on its own', () => {
    assert.ok(queries('B1, 41-26 Yeonmujang-gil, Seongdong-gu, Seoul').includes(
      '41-26 Yeonmujang-gil, Seongdong-gu, Seoul',
    ));
  });

  it('keeps the road when a building name is bolted to the same piece', () => {
    // "63 Hanwha Life Bldg" is how you find the lift; "50 63-ro" is the address.
    assert.ok(queries('60F, 63 Hanwha Life Bldg, 50 63-ro, Yeongdeungpo-gu, Seoul').some(
      (q) => q.startsWith('50 63-ro, Yeongdeungpo-gu, Seoul'),
    ));
  });

  it('drops prose bolted onto the front', () => {
    assert.ok(queries('Trail entrance: 29 Inwangsan-ro 1-gil, Jongno-gu, Seoul').includes(
      '29 Inwangsan-ro 1-gil, Jongno-gu, Seoul',
    ));
  });

  it('drops a place name in front of the address', () => {
    assert.ok(queries('UNESCO House, 26 Myeongdong-gil, Jung-gu, Seoul').some(
      (q) => q.startsWith('26 Myeongdong-gil, Jung-gu, Seoul'),
    ));
  });

  it('does not call a street address a district just because a name preceded it', () => {
    const rung = queryLadder('UNESCO House, 26 Myeongdong-gil, Jung-gu, Seoul').find(
      (s) => s.q.startsWith('26 Myeongdong-gil'),
    );
    assert.equal(rung?.precision, 'exact');
  });

  it('drops a bracketed gloss but keeps it as a fallback', () => {
    const asked = queries('4 Hoenamu-ro 41-gil, Yongsan-gu (Hannam-dong), Seoul');
    assert.ok(asked.includes('4 Hoenamu-ro 41-gil, Yongsan-gu, Seoul'));
    assert.ok(asked.some((q) => q.startsWith('Hannam-dong,')));
  });
});

describe('Korean shapes', () => {
  it('joins a house number stranded in its own comma group', () => {
    assert.ok(queries('19, Dosan-daero 67-gil, Gangnam-gu, Seoul').includes(
      '19 Dosan-daero 67-gil, Gangnam-gu, Seoul',
    ));
  });

  it('puts an old lot number in front of its neighbourhood', () => {
    assert.ok(queries('Donggyo-dong 150-2, Mapo-gu, Seoul').some(
      (q) => q.startsWith('150-2 Donggyo-dong, Mapo-gu, Seoul'),
    ));
  });

  it('offers a multi-word road as the one word a gazetteer indexes', () => {
    assert.ok(queries('32 World Cup buk-ro 11-gil, Mapo-gu, Seoul').some(
      (q) => /Worldcupbuk-ro 11-gil/i.test(q),
    ));
  });

  it('falls back to the road without the number', () => {
    const rung = queryLadder('16 Bukchon-ro 7-gil, Jongno-gu, Seoul').find(
      (s) => s.q.startsWith('Bukchon-ro 7-gil'),
    );
    assert.equal(rung?.precision, 'road');
  });

  it('lifts a postcode out of the widened queries and tries it on its own', () => {
    const norm = normalizeAddress('29 Itaewon-ro, Yongsan-gu, Seoul 04353');
    assert.equal(norm.postcode, '04353');
    const asked = queries('29 Itaewon-ro, Yongsan-gu, Seoul 04353');
    assert.ok(asked.includes('29 Itaewon-ro, Yongsan-gu, Seoul'));
    assert.ok(asked.some((q) => q.startsWith('04353,')));
  });

  it('never proposes a chome for a Korean address', () => {
    for (const raw of ['127-27 Jingwan-dong, Eunpyeong-gu, Seoul', '8-1 Dosan-daero 45-gil, Gangnam-gu, Seoul']) {
      for (const q of queries(raw)) assert.ok(!/chome/i.test(q), q);
    }
  });
});

describe('Japanese shapes', () => {
  it('falls back to the chome, which is mapped where a banchi is not', () => {
    const rung = queryLadder('1-2-3 Jingumae, Shibuya-ku, Tokyo').find((s) => /Jingumae 1-chome/.test(s.q));
    assert.equal(rung?.precision, 'block');
  });

  it('reads a chome that is already spelled out', () => {
    assert.ok(queries('2-chome-3-1 Kabukicho, Shinjuku City, Tokyo').some(
      (q) => q.startsWith('Kabukicho 2-chome,'),
    ));
  });

  it('flattens macrons, which the gazetteer more often holds without', () => {
    assert.ok(queries('4F Shibuya Bldg, 1-15-3 Shibuya, Shibuya-ku, Tōkyō').includes(
      '1-15-3 Shibuya, Shibuya-ku, Tokyo',
    ));
  });

  it('cuts the ward out of a native address, which carries no commas', () => {
    const asked = queries('〒160-0021 東京都新宿区歌舞伎町1-2-3');
    assert.ok(asked.includes('東京都新宿区歌舞伎町1-2-3'));
    assert.ok(asked.includes('東京都新宿区'));
  });
});

describe('an address is never turned into a different place', () => {
  it('caps a mountain with no street address at the district', () => {
    assert.equal(best('Dobong-gu, Seoul (mountain - no single street address)'), 'area');
  });

  it('caps an address that admits the number is unconfirmed', () => {
    assert.equal(best('Mapo-gu (Seogyo-dong/Mangwon area), Seoul - exact street number unconfirmed'), 'area');
  });

  it('caps a park that spans several districts', () => {
    assert.equal(best('Ui-dong area, Gangbuk-gu, Seoul (park spans several districts)'), 'area');
  });

  it('caps an address that names no building number', () => {
    assert.equal(best('Yeouido-dong, Yeongdeungpo-gu, Seoul'), 'area');
  });

  it('calls a chome with no banchi a block, not a door', () => {
    assert.equal(best('Ginza 4-chome, Chuo-ku, Tokyo'), 'block');
  });

  it('never widens past the district to the city alone', () => {
    for (const q of queries('137 Seobinggo-ro, Yongsan-gu, Seoul')) {
      assert.notEqual(q.replace(/, South Korea$/, ''), 'Seoul');
    }
  });

  it('widens, and stops', () => {
    // Every rung is paced a second apart upstream, so a ladder that never ends
    // is an import that never finishes.
    for (const raw of [
      '2F Hilltop Bldg, 19 Dosan-daero 67-gil, Gangnam-gu, Seoul',
      '60F, 63 Hanwha Life Bldg, 50 63-ro, Yeongdeungpo-gu, Seoul',
      '1-2-3 Jingumae, Shibuya-ku, Tokyo 150-0001',
    ]) {
      assert.ok(queryLadder(raw).length <= 9, `${raw} → ${queryLadder(raw).length} rungs`);
    }
  });

  it('asks each thing once', () => {
    const asked = queries('21 Bukchon-ro, B1, Jongno-gu, Seoul');
    assert.equal(new Set(asked.map((q) => q.toLowerCase())).size, asked.length);
  });

  it('gets no rung wrong enough to be empty or a fragment', () => {
    for (const q of queries('B1, Bluestone Tower, 9-16 Yeonmujang 5-gil, Seongdong-gu, Seoul')) {
      assert.ok(q.length >= 4, q);
      assert.ok(!/^[,\s]|[,\s]$/.test(q), JSON.stringify(q));
    }
  });
});
