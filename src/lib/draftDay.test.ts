/**
 * What drafting a day has to get right: that a stop naming a place the trip
 * has not got never reaches a card, that a card can be built from a tool call
 * that is only half written, and that accepting a draft produces the same kind
 * of day item as adding a stop by hand.
 *
 * Run with `npm test`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blankPlace, type Place } from './data.ts';
import { itemsFrom, parseLine, type Suggestion } from './draftDay.ts';
import {
  byClock, itemScanner, validateSuggestion,
} from '../../supabase/functions/draft-day/suggestions.ts';
import {
  briefFor, dateOfDay, dayNumber, pickable, splitKey, type DocCity,
} from '../../supabase/functions/draft-day/brief.ts';

function place(over: Partial<Place> = {}): Place {
  return { ...blankPlace('do'), name: 'Somewhere', ...over };
}

function stop(over: Partial<Suggestion> = {}): Suggestion {
  return { id: 'card', placeId: 'p1', startTime: '09:00', durationMin: 60, reason: '', ...over };
}

describe('reading the day as it is written', () => {
  it('hands back each stop as its object closes, not when the day does', () => {
    const scan = itemScanner();
    assert.deepEqual(scan('{"items":[{"place_id":"a","start_'), []);
    assert.deepEqual(scan('time":"09:00","duration_min":60,"reason":"x"}'), [
      { place_id: 'a', start_time: '09:00', duration_min: 60, reason: 'x' },
    ]);
    assert.deepEqual(scan(',{"place_id":"b"}'), [{ place_id: 'b' }]);
    assert.deepEqual(scan(']}'), []);
  });

  it('survives braces and brackets inside a reason', () => {
    const scan = itemScanner();
    const items = scan('{"items":[{"place_id":"a","reason":"the {best} [bit]"}]}');
    assert.equal(items.length, 1);
    assert.equal((items[0] as { reason: string }).reason, 'the {best} [bit]');
  });

  it('survives an escaped quote inside a reason', () => {
    const scan = itemScanner();
    const items = scan('{"items":[{"place_id":"a","reason":"they call it \\"the pit\\""}]}');
    assert.equal(items.length, 1);
    assert.equal((items[0] as { reason: string }).reason, 'they call it "the pit"');
  });

  it('gives back nothing at all when the input is cut off mid-stop', () => {
    const scan = itemScanner();
    assert.deepEqual(scan('{"items":[{"place_id":"a","reason":"half'), []);
  });
});

describe('checking a stop against the trip', () => {
  const allowed = new Set(['p1', 'p2']);

  it('drops a place the trip has never heard of', () => {
    assert.equal(
      validateSuggestion({ place_id: 'made-up', start_time: '09:00', duration_min: 60 }, allowed, new Set()),
      null,
    );
  });

  it('drops a place already proposed earlier in the same day', () => {
    const taken = new Set(['p1']);
    assert.equal(
      validateSuggestion({ place_id: 'p1', start_time: '09:00', duration_min: 60 }, allowed, taken),
      null,
    );
  });

  it('keeps a good stop, and tidies the clock and the reason', () => {
    const ok = validateSuggestion(
      { place_id: 'p1', start_time: '9:05', duration_min: 61.4, reason: '  two   lines\nhere ' },
      allowed,
      new Set(),
    );
    assert.deepEqual(ok, {
      placeId: 'p1',
      startTime: '09:05',
      durationMin: 61,
      reason: 'two lines here',
    });
  });

  it('refuses a time that is not a time', () => {
    for (const bad of ['', 'morning', '25:00', '09:70', '0900']) {
      assert.equal(
        validateSuggestion({ place_id: 'p1', start_time: bad, duration_min: 60 }, allowed, new Set()),
        null,
        bad,
      );
    }
  });

  it('pulls an absurd dwell back to something a day can hold', () => {
    const long = validateSuggestion(
      { place_id: 'p1', start_time: '09:00', duration_min: 5000 },
      allowed,
      new Set(),
    );
    assert.equal(long?.durationMin, 480);
    const short = validateSuggestion(
      { place_id: 'p2', start_time: '09:00', duration_min: 1 },
      allowed,
      new Set(),
    );
    assert.equal(short?.durationMin, 15);
  });

  it('reads the day in clock order whatever order it was written in', () => {
    const sorted = [stop({ startTime: '19:00' }), stop({ startTime: '09:00' })]
      .map((s) => ({ placeId: s.placeId, startTime: s.startTime, durationMin: 60, reason: '' }))
      .sort(byClock);
    assert.equal(sorted[0].startTime, '09:00');
  });
});

describe('which day is being drafted', () => {
  const cities: DocCity[] = [
    { id: 'seoul', name: 'Seoul', nights: 3 },
    { id: 'tokyo', name: 'Tokyo', nights: 2 },
  ];

  it('counts nights forward through the cities', () => {
    assert.equal(dayNumber(cities, 'seoul', 0), 1);
    assert.equal(dayNumber(cities, 'seoul', 2), 3);
    assert.equal(dayNumber(cities, 'tokyo', 0), 4);
  });

  it('refuses a night the city does not have', () => {
    assert.equal(dayNumber(cities, 'seoul', 3), null);
    assert.equal(dayNumber(cities, 'kyoto', 0), null);
  });

  it('dates a day without drifting a timezone', () => {
    assert.equal(dateOfDay('2026-04-01', 1), '2026-04-01');
    assert.equal(dateOfDay('2026-04-01', 4), '2026-04-04');
    assert.equal(dateOfDay('2026-02-28', 2), '2026-03-01');
    assert.equal(dateOfDay('', 1), '');
  });

  it('splits a day key on the last colon, so an id with one survives', () => {
    assert.deepEqual(splitKey('abc:2'), { cityId: 'abc', night: 2 });
    assert.deepEqual(splitKey('a:b:2'), { cityId: 'a:b', night: 2 });
    assert.equal(splitKey('abc'), null);
    assert.equal(splitKey('abc:x'), null);
  });
});

describe('what the model is allowed to propose', () => {
  it('offers everything pinned except what was voted no', () => {
    const city: DocCity = {
      id: 'c',
      name: 'Seoul',
      nights: 2,
      places: [
        { id: 'a', name: 'Yes place', vote: 'yes' },
        { id: 'b', name: 'Undecided', vote: '' },
        { id: 'c', name: 'Maybe', vote: 'maybe' },
        { id: 'd', name: 'Ruled out', vote: 'no' },
        { id: 'e', name: '  ' },
      ],
    };
    assert.deepEqual(pickable(city).map((p) => p.id), ['a', 'b', 'c']);
  });

  it('builds a brief naming only the city it is drafting, and the other days', () => {
    const brief = briefFor(
      {
        trip: { start: '2026-04-01', travelers: 2 },
        cities: [
          {
            id: 'seoul',
            name: 'Seoul',
            nights: 2,
            hotelSel: 'h1',
            hotels: [{ id: 'h1', name: 'The Place', addr: 'Myeongdong' }],
            places: [{ id: 'p1', name: 'Gwangjang Market', kind: 'eat' }],
          },
          { id: 'tokyo', name: 'Tokyo', nights: 1, places: [{ id: 'p9', name: 'Elsewhere' }] },
        ],
        days: { 'seoul:1': [{ title: 'Bukchon' }] },
      },
      'seoul:0',
    );

    assert.ok(brief);
    assert.deepEqual([...brief.allowed], ['p1']);
    assert.equal(brief.date, '2026-04-01');
    assert.match(brief.prompt, /Draft day 1 of this trip: Seoul, Wednesday 2026-04-01/);
    assert.match(brief.prompt, /The Place, Myeongdong/);
    assert.match(brief.prompt, /p1 — Gwangjang Market/);
    // Another day's stop is named so it is not proposed twice.
    assert.match(brief.prompt, /Day 2 in Seoul: Bukchon/);
    // Another city's places are not on offer.
    assert.doesNotMatch(brief.prompt, /Elsewhere/);
  });

  it('will not draft a day that is not part of the trip', () => {
    const doc = { trip: { start: '2026-04-01' }, cities: [{ id: 'seoul', name: 'Seoul', nights: 1 }] };
    assert.equal(briefFor(doc, 'seoul:5'), null);
    assert.equal(briefFor(doc, 'kyoto:0'), null);
    assert.equal(briefFor(doc, 'nonsense'), null);
  });
});

describe('reading a line of the stream', () => {
  it('reads a stop', () => {
    const msg = parseLine(
      '{"type":"stop","stop":{"placeId":"p1","startTime":"09:30","durationMin":75,"reason":"Early"}}',
    );
    assert.equal(msg?.type, 'stop');
    assert.equal(msg?.type === 'stop' && msg.stop.placeId, 'p1');
    assert.equal(msg?.type === 'stop' && msg.stop.durationMin, 75);
  });

  it('ignores a blank line, a half line and a line it does not know', () => {
    assert.equal(parseLine(''), null);
    assert.equal(parseLine('{"type":"sto'), null);
    assert.equal(parseLine('{"type":"something-new"}'), null);
  });

  it('refuses a stop missing the things a card needs', () => {
    assert.equal(parseLine('{"type":"stop","stop":{"startTime":"09:00","durationMin":60}}'), null);
    assert.equal(parseLine('{"type":"stop","stop":{"placeId":"p1","startTime":"nine"}}'), null);
    assert.equal(
      parseLine('{"type":"stop","stop":{"placeId":"p1","startTime":"09:00","durationMin":0}}'),
      null,
    );
  });

  it('always has something to say when the server says it failed', () => {
    const msg = parseLine('{"type":"error"}');
    assert.equal(msg?.type === 'error' && Boolean(msg.message), true);
  });
});

describe('accepting a draft', () => {
  const places = [place({ id: 'p1', name: 'Market', kind: 'eat' }), place({ id: 'p2', name: 'Palace' })];

  it('pins only the first stop to the clock, as a hand-built day does', () => {
    const items = itemsFrom(
      [stop({ placeId: 'p2', startTime: '14:00' }), stop({ placeId: 'p1', startTime: '09:00' })],
      places,
    );
    assert.deepEqual(items.map((i) => i.title), ['Market', 'Palace']);
    assert.equal(items[0].time, '09:00');
    assert.equal(items[1].time, '');
  });

  it('carries the reason onto the stop as its note', () => {
    const items = itemsFrom([stop({ placeId: 'p1', reason: 'Breakfast is the point here.' })], places);
    assert.equal(items[0].note, 'Breakfast is the point here.');
    assert.equal(items[0].placeId, 'p1');
  });

  it('drops a stop whose place this device does not have', () => {
    assert.deepEqual(itemsFrom([stop({ placeId: 'gone' })], places), []);
  });

  it('falls back to the usual dwell when none came through', () => {
    const items = itemsFrom([stop({ placeId: 'p1', durationMin: 0 })], places);
    assert.equal(items[0].dwell, 75);
  });
});
