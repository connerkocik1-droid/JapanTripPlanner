import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, parseWeather, toC } from './weather.ts';

const sample = {
  current: { time: '2026-09-30T14:15', temperature_2m: 71.6, apparent_temperature: 73.1, weather_code: 2, is_day: 1 },
  hourly: {
    time: ['2026-09-30T13:00', '2026-09-30T14:00', '2026-09-30T15:00', '2026-09-30T16:00'],
    temperature_2m: [70, 71, 72.4, 70.2],
    precipitation_probability: [0, 5, 10, 40],
    weather_code: [1, 2, 3, 61],
  },
  daily: {
    temperature_2m_max: [75.2], temperature_2m_min: [63.9],
    precipitation_probability_max: [40], sunrise: ['2026-09-30T05:34'], sunset: ['2026-09-30T17:29'],
  },
};

test('Open-Meteo is flattened to what the card shows', () => {
  const w = parseWeather(sample, 'x');
  assert.ok(w);
  assert.equal(w.tempF, 72);
  assert.equal(w.feelsF, 73);
  assert.equal(w.highF, 75);
  assert.equal(w.lowF, 64);
  assert.equal(w.rainPct, 40);
  assert.equal(w.sunrise, '05:34');
  assert.equal(w.sunset, '17:29');
  assert.equal(w.isDay, true);
});

test('the hours shown start after the current one', () => {
  const w = parseWeather(sample, 'x');
  assert.deepEqual(w?.hours.map((h) => h.hour), ['15:00', '16:00']);
  assert.equal(w?.hours[1].rainPct, 40);
});

test('an answer without a current reading is nothing', () => {
  assert.equal(parseWeather({}, 'x'), null);
  assert.equal(parseWeather(null, 'x'), null);
});

test('codes read as words and glyphs, night included', () => {
  assert.equal(describe(0).icon, 'ph-sun');
  assert.equal(describe(0, false).icon, 'ph-moon-stars');
  assert.equal(describe(63).text, 'Rain');
  assert.equal(describe(95).icon, 'ph-cloud-lightning');
  assert.equal(toC(72), 22);
});
