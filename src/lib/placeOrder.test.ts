/**
 * What the order of the places under a day has to get right: the near, the
 * missing and the unspoken-for first, and nothing ever dropped.
 *
 * Run with `npm test`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blankPlace, type Place, type PlaceKind } from './data.ts';
import { orderPlaces } from './placeOrder.ts';

function place(id: string, over: Partial<Place> = {}): Place {
  return { ...blankPlace('do'), id, name: id, ...over };
}

const names = (list: Place[]) => list.map((p) => p.id);

describe('the order places are offered in', () => {
  it('puts the nearer one first', () => {
    const list = [place('far'), place('near')];
    const order = orderPlaces(list, { seconds: { far: 40 * 60, near: 5 * 60 } });
    assert.deepEqual(names(order), ['near', 'far']);
  });

  it('leaves a place nobody has routed where it was, rather than at the bottom', () => {
    // An unknown distance is not a long one. Two unrouted places keep the
    // order the traveler put them in.
    const list = [place('a'), place('b'), place('c')];
    assert.deepEqual(names(orderPlaces(list, { seconds: {} })), ['a', 'b', 'c']);
  });

  it('offers what the day has not got yet', () => {
    // The day is three sights and nowhere to eat.
    const list = [place('sight4', { kind: 'do' }), place('dinner', { kind: 'eat' })];
    const order = orderPlaces(list, { seconds: {}, inDayKinds: ['do', 'do', 'do'] });
    assert.equal(names(order)[0], 'dinner');
  });

  it('sinks what is already in this day, and nudges down what is on another', () => {
    const list = [place('here'), place('other'), place('free')];
    const order = orderPlaces(list, { seconds: {}, inDay: ['here'], elsewhere: ['other'] });
    assert.deepEqual(names(order), ['free', 'other', 'here']);
  });

  it('sinks a place that is shut that day without hiding it', () => {
    const monday = 1;
    const list = [place('shut', { shutDays: [monday] }), place('open')];
    const order = orderPlaces(list, { seconds: {}, weekday: monday });
    assert.deepEqual(names(order), ['open', 'shut']);
  });

  it('does not care what day it is when nobody said', () => {
    const list = [place('shut', { shutDays: [1] }), place('open')];
    assert.deepEqual(names(orderPlaces(list, { seconds: {} })), ['shut', 'open']);
  });

  it('settles a tie on the rating, and only a tie', () => {
    const list = [place('dull', { rating: 3 }), place('loved', { rating: 4.9 })];
    assert.deepEqual(names(orderPlaces(list, { seconds: {} })), ['loved', 'dull']);
    // Five stars twenty minutes away still loses to three stars round the corner.
    const far = orderPlaces(list, { seconds: { loved: 25 * 60, dull: 2 * 60 } });
    assert.deepEqual(names(far), ['dull', 'loved']);
  });

  it('puts a maybe below a yes, all else being equal', () => {
    const list = [place('maybe', { vote: 'maybe' }), place('yes', { vote: 'yes' })];
    assert.deepEqual(names(orderPlaces(list, { seconds: {} })), ['yes', 'maybe']);
  });

  it('never drops anything, and never invents anything', () => {
    const kinds: PlaceKind[] = ['eat', 'do', 'stay', 'other'];
    const list = kinds.map((k, i) => place('p' + i, { kind: k, vote: i % 2 ? 'maybe' : 'yes' }));
    const order = orderPlaces(list, {
      seconds: { p0: 60, p2: 5000 }, weekday: 3, inDay: ['p1'], elsewhere: ['p3'],
    });
    assert.equal(order.length, list.length);
    assert.deepEqual(new Set(names(order)), new Set(names(list)));
  });

  it('leaves the list it was given alone', () => {
    const list = [place('a'), place('b')];
    orderPlaces(list, { seconds: { b: 1 } });
    assert.deepEqual(names(list), ['a', 'b']);
  });
});
