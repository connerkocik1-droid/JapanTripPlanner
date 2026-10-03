/**
 * What reading the tier out of a hotel's name has to get right: that it only
 * takes a tier off the end, that it leaves a name holding a dollar sign for
 * some other reason alone, and that putting the two back together returns the
 * name that was stored.
 *
 * Run with `npm test`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hotelName, joinTier, splitTier } from './hotelTier.ts';

describe('splitTier', () => {
  it('takes a trailing tier off the name', () => {
    assert.deepEqual(splitTier('Hotel Granbell Shinjuku $$'), {
      name: 'Hotel Granbell Shinjuku',
      tier: '$$',
    });
    assert.deepEqual(splitTier('Nine Tree Premier $'), { name: 'Nine Tree Premier', tier: '$' });
    assert.deepEqual(splitTier('Aman Tokyo $$$$'), { name: 'Aman Tokyo', tier: '$$$$' });
  });

  it('leaves a name with no tier alone', () => {
    assert.deepEqual(splitTier('Myeongdong Stay'), { name: 'Myeongdong Stay', tier: '' });
    assert.deepEqual(splitTier(''), { name: '', tier: '' });
  });

  it('only reads a tier at the end, on its own', () => {
    // A rate written into the name is not the tier, and taking it off would
    // silently lose the number.
    assert.deepEqual(splitTier('$120 a night place'), { name: '$120 a night place', tier: '' });
    assert.deepEqual(splitTier('The $$ Diner Hotel'), { name: 'The $$ Diner Hotel', tier: '' });
  });

  it('reads a bare tier as a tier with no name', () => {
    assert.deepEqual(splitTier('$$'), { name: '', tier: '$$' });
  });

  it('gives back what was stored when joined again', () => {
    for (const raw of ['Hotel Granbell Shinjuku $$', 'Myeongdong Stay', 'Aman Tokyo $$$$']) {
      const { name, tier } = splitTier(raw);
      assert.equal(joinTier(name, tier), raw);
    }
  });
});

describe('hotelName', () => {
  it('is what a reader should see', () => {
    assert.equal(hotelName('Hotel Granbell Shinjuku $$'), 'Hotel Granbell Shinjuku');
    assert.equal(hotelName('  Spaced Out  '), 'Spaced Out');
  });
});
