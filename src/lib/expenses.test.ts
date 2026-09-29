/**
 * What expense logging has to get right: that a local figure keeps the dollars
 * it was worth on the day, that a day's budget adds back up to the city's, and
 * that the daily line says over when you are over.
 *
 * Run with `npm test`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blankCity, blankHotel, uid, type City, type DayItem } from './data.ts';
import {
  dayBudget, dayLine, fillExpense, insightFor, onDay, sumBudgets, sumUsd, tripLine,
  upTo, usdOf, type Expense,
} from './expenses.ts';

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: uid(), on: '2026-04-01', cityId: '', category: 'food', amount: 0,
    currency: '', rate: 0, note: '', at: 0, ...over,
  };
}

function stop(cost: number): DayItem {
  return {
    id: uid(), time: '', title: '', note: '', cost, done: false,
    placeId: null, mode: 'walk', dwell: 60,
  };
}

/** A city with a chosen hotel, which is the only kind that costs lodging. */
function city(over: Partial<City> = {}): City {
  const c = blankCity('Tokyo');
  const hotel = { ...blankHotel(), cost: 140 };
  return { ...c, hotels: [hotel], hotelSel: hotel.id, nights: 4, foodPer: 60, transitCost: 20, ...over };
}

describe('usdOf', () => {
  it('takes a dollar figure as it stands', () => {
    assert.equal(usdOf(expense({ amount: 24 })), 24);
  });

  it('prices a local figure with the rate it was logged at', () => {
    assert.equal(usdOf(expense({ amount: 2400, currency: 'JPY', rate: 150 })), 16);
  });

  it('will not guess at a local figure with no rate', () => {
    assert.equal(usdOf(expense({ amount: 2400, currency: 'JPY', rate: 0 })), null);
  });

  it('keeps the rate it was logged at, so the total does not move', () => {
    // The same lunch, logged when the yen was at 150. A later rate is irrelevant.
    const lunch = expense({ amount: 3000, currency: 'JPY', rate: 150 });
    assert.equal(usdOf(lunch), 20);
  });
});

describe('sumUsd', () => {
  it('adds dollars and local figures together', () => {
    const total = sumUsd([
      expense({ amount: 10 }),
      expense({ amount: 1500, currency: 'JPY', rate: 150 }),
      expense({ amount: 14000, currency: 'KRW', rate: 1400 }),
    ]);
    assert.equal(total, 30);
  });

  it('counts an unpriceable figure as nothing rather than throwing', () => {
    assert.equal(sumUsd([expense({ amount: 5 }), expense({ amount: 900, currency: 'JPY' })]), 5);
  });
});

describe('onDay and upTo', () => {
  const list = [
    expense({ on: '2026-03-30', amount: 5 }),
    expense({ on: '2026-04-01', amount: 10, at: 1 }),
    expense({ on: '2026-04-01', amount: 20, at: 2 }),
    expense({ on: '2026-04-02', amount: 40 }),
  ];

  it('gives one day, newest first', () => {
    const day = onDay(list, '2026-04-01');
    assert.deepEqual(day.map((e) => e.amount), [20, 10]);
  });

  it('runs the trip total up to and including the day asked for', () => {
    assert.equal(sumUsd(upTo(list, '2026-04-01')), 35);
  });

  it('leaves out anything logged before the trip started', () => {
    assert.equal(sumUsd(upTo(list, '2026-04-01', '2026-04-01')), 30);
  });

  it('ignores an entry with no day on it', () => {
    assert.equal(sumUsd(upTo([expense({ on: '', amount: 99 })], '2026-04-01')), 0);
  });
});

describe('dayBudget', () => {
  it('is a night, a day of food, a share of the transit, and the day’s stops', () => {
    const b = dayBudget({ city: city(), items: [stop(15), stop(5)] }, 2);
    // 140 lodging + 60 food + (20 × 2 travelers ÷ 4 nights) + 20 of stops.
    assert.equal(b.lodging, 140);
    assert.equal(b.food, 60);
    assert.equal(b.transit, 10);
    assert.equal(b.activities, 20);
    assert.equal(b.total, 230);
  });

  it('counts no lodging while no option is active', () => {
    assert.equal(dayBudget({ city: city({ hotelSel: null }), items: [] }, 2).lodging, 0);
  });

  it('adds back up to the city over its nights, which is what the budget card shows', () => {
    const c = city();
    const days = Array.from({ length: c.nights }, () => ({ city: c, items: [] }));
    const b = sumBudgets(days, 2);
    assert.equal(b.lodging, 140 * 4);
    assert.equal(b.food, 60 * 4);
    // The city's one-off transit figure, for both of them, spread and re-gathered.
    assert.equal(b.transit, 40);
  });

  it('survives a city with nothing filled in', () => {
    const b = dayBudget({ city: blankCity('Seoul'), items: [] }, 1);
    assert.equal(b.total, 0);
  });
});

describe('dayLine', () => {
  it('says how much more, the way you would say it', () => {
    assert.equal(dayLine(120, 95), 'You have spent $25 more than what you budgeted today.');
  });

  it('says how much less', () => {
    assert.equal(dayLine(70, 95), 'You have spent $25 less than what you budgeted today.');
  });

  it('calls a difference under a dollar on budget', () => {
    assert.equal(dayLine(95.4, 95), 'You have spent $95 today, right on budget.');
  });

  it('asks for something to be logged before it judges', () => {
    assert.equal(dayLine(0, 95), 'Nothing logged today yet. The day budgets $95.');
  });

  it('does not invent a comparison with no budget set', () => {
    assert.equal(dayLine(30, 0), 'You have spent $30 today. This day has no budget set.');
  });
});

describe('tripLine', () => {
  it('counts the days once there is more than one', () => {
    assert.equal(
      tripLine(400, 300, 3),
      'Over 3 days you are $100 over, having spent $400 of $300.',
    );
  });

  it('reads as the first day on the first day', () => {
    assert.equal(tripLine(80, 100, 1), 'So far you are $20 under, having spent $80 of $100.');
  });

  it('does not call an empty log a saving', () => {
    assert.equal(
      tripLine(0, 562, 2),
      'Nothing logged on the trip yet. The days so far budget $562.',
    );
  });
});

describe('insightFor', () => {
  const c = city();
  const days = Array.from({ length: 4 }, () => ({ city: c, items: [] as DayItem[] }));
  // Day one is 2026-04-01, so day two is the 2nd.
  const list = [
    expense({ on: '2026-04-01', amount: 200 }),
    expense({ on: '2026-04-02', amount: 45000, currency: 'JPY', rate: 150 }),
  ];

  it('compares the day against its budget and the trip against the days behind you', () => {
    const got = insightFor(list, days, 2, '2026-04-02', 2, '2026-04-01');
    assert.equal(got.spentToday, 300);
    assert.equal(got.budgetToday, 210);
    assert.equal(got.spentTrip, 500);
    assert.equal(got.budgetTrip, 420);
    assert.equal(got.today, 'You have spent $90 more than what you budgeted today.');
    assert.equal(got.trip, 'Over 2 days you are $80 over, having spent $500 of $420.');
  });

  it('holds up on a day the trip does not have', () => {
    const got = insightFor(list, days, 9, '2026-04-09', 2, '2026-04-01');
    assert.equal(got.budgetToday, 0);
    assert.equal(got.spentToday, 0);
  });
});

describe('fillExpense', () => {
  it('fills a saved entry that predates a field', () => {
    const e = fillExpense({ id: 'x', on: '2026-04-01', amount: 12 });
    assert.equal(e.currency, '');
    assert.equal(e.note, '');
    assert.equal(e.rate, 0);
    assert.equal(usdOf(e), 12);
  });

  it('puts an unrecognised category somewhere rather than dropping the money', () => {
    const e = fillExpense({ amount: 9, category: 'souvenirs' });
    assert.equal(e.category, 'other');
    assert.equal(usdOf(e), 9);
  });

  it('gives a garbled entry an id and a zero amount rather than a NaN', () => {
    const e = fillExpense({ amount: 'lots' });
    assert.ok(e.id);
    assert.equal(e.amount, 0);
  });

  it('takes nothing at all', () => {
    assert.equal(fillExpense(undefined).amount, 0);
  });
});
