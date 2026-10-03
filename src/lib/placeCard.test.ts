/**
 * What a place's card has to get right: that it only claims what is stored,
 * and that the tier and the rating are not said twice.
 *
 * Run with `npm test`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blankPlace } from './data.ts';
import { bandRest, legToShow, photoOf, priceTier, ratingOf } from './placeCard.ts';

const place = (over: Record<string, unknown> = {}) => ({ ...blankPlace('eat'), ...over });

describe('priceTier', () => {
  it('reads a tier standing on its own', () => {
    assert.equal(priceTier('$$'), '$$');
    assert.equal(priceTier('4.7★ $$$'), '$$$');
    assert.equal(priceTier('$ reservation'), '$');
  });

  it('does not read a price written out as a tier', () => {
    assert.equal(priceTier('$12 bowls'), '');
    assert.equal(priceTier('about $30pp'), '');
  });

  it('has none to give when the band is empty', () => {
    assert.equal(priceTier(''), '');
  });
});

describe('ratingOf', () => {
  it('gives the score and how many it is out of', () => {
    assert.deepEqual(ratingOf(place({ rating: 4.65, ratingCount: 1240 })), {
      score: '4.7', count: '1.2k',
    });
    assert.deepEqual(ratingOf(place({ rating: 4, ratingCount: 38 })), { score: '4.0', count: '38' });
  });

  it('keeps a score that has no count behind it', () => {
    assert.deepEqual(ratingOf(place({ rating: 4.2, ratingCount: 0 })), { score: '4.2', count: '' });
  });

  it('invents nothing when there is no score', () => {
    assert.equal(ratingOf(place({ rating: 0, ratingCount: 900 })), null);
  });
});

describe('bandRest', () => {
  it('drops what the tier and the rating already say', () => {
    assert.equal(bandRest('$$ 4.7★'), '');
    assert.equal(bandRest('4.5 stars'), '');
  });

  it('keeps what nothing else says', () => {
    assert.equal(bandRest('$$ reservation'), 'reservation');
    assert.equal(bandRest('cash only'), 'cash only');
  });
});

describe('photoOf', () => {
  it('takes the first usable URL', () => {
    assert.equal(photoOf(place({ images: ['  ', 'https://x/a.jpg', 'https://x/b.jpg'] })), 'https://x/a.jpg');
  });

  it('has none when there are no images', () => {
    assert.equal(photoOf(place({ images: [] })), null);
  });
});

describe('legToShow', () => {
  const walk = (mins: number) => ({ seconds: mins * 60, meters: mins * 80 });

  it('walks when the walk is short', () => {
    assert.deepEqual(legToShow({ walk: walk(12), transit: { seconds: 400 } }),
      { kind: 'walk', seconds: 720, meters: 960 });
  });

  it('takes the metro once the walk is long', () => {
    assert.deepEqual(legToShow({ walk: walk(35), transit: { seconds: 900 } }),
      { kind: 'transit', seconds: 900, meters: 0 });
  });

  it('offers the long walk when there is no metro leg', () => {
    assert.equal(legToShow({ walk: walk(40) })?.kind, 'walk');
  });

  it('offers nothing when nothing is routed', () => {
    assert.equal(legToShow(undefined), null);
    assert.equal(legToShow({}), null);
  });
});
