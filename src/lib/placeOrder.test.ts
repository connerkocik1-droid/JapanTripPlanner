/**
 * What the order of the places under a day has to get right: the near, the
 * missing and the unspoken-for first, nothing dropped unless the traveler's
 * own mood drops it, and never silently.
 *
 * Run with `npm test`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blankPlace, type Place, type PlaceKind } from './data.ts';
import { clashFor } from './hours.ts';
import { orderPlaces, type PlaceOrderCtx } from './placeOrder.ts';

function place(id: string, over: Partial<Place> = {}): Place {
  return { ...blankPlace('do'), id, name: id, ...over };
}

const names = (list: Place[]) => list.map((p) => p.id);
const ranked = (places: Place[], ctx: PlaceOrderCtx) => names(orderPlaces(places, ctx).list);

describe('the order places are offered in', () => {
  it('puts the nearer one first', () => {
    const list = [place('far'), place('near')];
    assert.deepEqual(ranked(list, { seconds: { far: 40 * 60, near: 5 * 60 } }), ['near', 'far']);
  });

  it('leaves a place nobody has routed where it was, rather than at the bottom', () => {
    // An unknown distance is not a long one. Two unrouted places keep the
    // order the traveler put them in.
    const list = [place('a'), place('b'), place('c')];
    assert.deepEqual(ranked(list, { seconds: {} }), ['a', 'b', 'c']);
  });

  it('offers what the day has not got yet', () => {
    // The day is three sights and nowhere to eat.
    const list = [place('sight4', { kind: 'do' }), place('dinner', { kind: 'eat' })];
    assert.equal(ranked(list, { seconds: {}, inDayKinds: ['do', 'do', 'do'] })[0], 'dinner');
  });

  it('sinks what is already in this day, and nudges down what is on another', () => {
    const list = [place('here'), place('other'), place('free')];
    const order = ranked(list, { seconds: {}, inDay: ['here'], elsewhere: ['other'] });
    assert.deepEqual(order, ['free', 'other', 'here']);
  });

  it('sinks a place that is shut that day without hiding it', () => {
    const monday = 1;
    const list = [place('shut', { shutDays: [monday] }), place('open')];
    assert.deepEqual(ranked(list, { seconds: {}, weekday: monday }), ['open', 'shut']);
  });

  it('does not care what day it is when nobody said', () => {
    const list = [place('shut', { shutDays: [1] }), place('open')];
    assert.deepEqual(ranked(list, { seconds: {} }), ['shut', 'open']);
  });

  it('settles a tie on the rating, and only a tie', () => {
    const list = [place('dull', { rating: 3 }), place('loved', { rating: 4.9 })];
    assert.deepEqual(ranked(list, { seconds: {} }), ['loved', 'dull']);
    // Five stars twenty minutes away still loses to three stars round the corner.
    assert.deepEqual(ranked(list, { seconds: { loved: 25 * 60, dull: 2 * 60 } }), ['dull', 'loved']);
  });

  it('puts a maybe below a yes, all else being equal', () => {
    const list = [place('maybe', { vote: 'maybe' }), place('yes', { vote: 'yes' })];
    assert.deepEqual(ranked(list, { seconds: {} }), ['yes', 'maybe']);
  });

  it('never drops anything without a mood, and never invents anything', () => {
    const kinds: PlaceKind[] = ['eat', 'do', 'stay', 'other'];
    const list = kinds.map((k, i) => place('p' + i, { kind: k, vote: i % 2 ? 'maybe' : 'yes' }));
    const out = orderPlaces(list, {
      seconds: { p0: 60, p2: 5000 }, weekday: 3, inDay: ['p1'], elsewhere: ['p3'],
    });
    assert.equal(out.hidden, 0);
    assert.deepEqual(new Set(names(out.list)), new Set(names(list)));
  });

  it('leaves the list it was given alone', () => {
    const list = [place('a'), place('b')];
    orderPlaces(list, { seconds: { b: 1 } });
    assert.deepEqual(names(list), ['a', 'b']);
  });
});

describe('reading the list through a mood', () => {
  it('drops what is further than they said they would go, and counts it', () => {
    const list = [place('near'), place('trek')];
    const out = orderPlaces(list, {
      seconds: { near: 8 * 60, trek: 40 * 60 },
      lens: { distance: 'walk' },
    });
    assert.deepEqual(names(out.list), ['near']);
    assert.equal(out.hidden, 1);
  });

  it('keeps a place nobody has routed, because its distance is not known', () => {
    const list = [place('unknown')];
    const out = orderPlaces(list, { seconds: {}, lens: { distance: 'walk' } });
    assert.deepEqual(names(out.list), ['unknown']);
  });

  it('drops what is shut by the time the day would get there', () => {
    const list = [
      place('closes6', { opens: '09:00', closes: '18:00' }),
      place('late', { opens: '17:00', closes: '23:00' }),
    ];
    // The day ends at 19:00 and the walk is ten minutes.
    const ctx: PlaceOrderCtx = {
      seconds: { closes6: 600, late: 600 },
      endMins: 19 * 60,
      lens: { after: 'eat' },
      shutAt: (p, at) => clashFor(p, 2, at, at + 60)?.weight === 'hard',
    };
    const out = orderPlaces(list, ctx);
    assert.deepEqual(names(out.list), ['late']);
    assert.equal(out.hidden, 1);
    // Without a mood the shut one is still offered, as it always was.
    assert.equal(orderPlaces(list, { ...ctx, lens: {} }).hidden, 0);
  });

  it('drops somewhere to eat that serves what one of them does not eat', () => {
    const list = [
      place('shellfish', { kind: 'eat', cuisine: 'Shellfish and oysters' }),
      place('noodles', { kind: 'eat', cuisine: 'Ramen' }),
      // The restriction is about eating, so a sight with the word in its name stays.
      place('museum', { kind: 'do', name: 'Shellfish Museum' }),
    ];
    const out = orderPlaces(list, {
      seconds: {}, lens: { after: 'eat' }, diets: { anasophia: 'shellfish, pork' },
    });
    assert.deepEqual(new Set(names(out.list)), new Set(['noodles', 'museum']));
    assert.equal(out.hidden, 1);
  });

  it('ignores a word too short to mean anything', () => {
    // "nut" inside "doughnut" would take out half of Tokyo.
    const list = [place('donuts', { kind: 'eat', name: 'Doughnut Stand' })];
    const out = orderPlaces(list, { seconds: {}, lens: { after: 'eat' }, diets: { conner: 'nut' } });
    assert.equal(out.hidden, 0);
  });

  it('prefers the cheap end when they said keep it cheap, and the other way round', () => {
    const list = [place('posh', { kind: 'eat', band: '$$$$' }), place('cheap', { kind: 'eat', band: '$' })];
    assert.deepEqual(ranked(list, { seconds: {}, lens: { budget: 'cheap' } }), ['cheap', 'posh']);
    assert.deepEqual(ranked(list, { seconds: {}, lens: { budget: 'splurge' } }), ['posh', 'cheap']);
    // With nothing said about money, the band decides nothing.
    assert.deepEqual(ranked(list, { seconds: {} }), ['posh', 'cheap']);
  });

  it('prefers what they are after without ruling the rest out', () => {
    const list = [place('sight', { kind: 'do' }), place('dinner', { kind: 'eat' })];
    const out = orderPlaces(list, { seconds: {}, lens: { after: 'eat' } });
    assert.deepEqual(names(out.list), ['dinner', 'sight']);
    assert.equal(out.hidden, 0);
  });
});
