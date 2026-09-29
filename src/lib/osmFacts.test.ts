import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commonsFileUrl, cuisineFromOsm, hoursFromOsm, imageFromTag, sameName, wikipediaRef,
} from './osmFacts.ts';

test('the most particular cuisine wins, and vague ones are skipped', () => {
  assert.equal(cuisineFromOsm('ramen;japanese'), 'Ramen');
  assert.equal(cuisineFromOsm('regional;sushi'), 'Sushi');
  assert.equal(cuisineFromOsm('coffee_shop'), 'Coffee');
  assert.equal(cuisineFromOsm('korean_bbq'), 'Korean BBQ');
  assert.equal(cuisineFromOsm('okonomiyaki'), 'Okonomiyaki');
});

test('with no cuisine tag, the amenity speaks for a bar or a cafe only', () => {
  assert.equal(cuisineFromOsm(undefined, 'bar'), 'Bar');
  assert.equal(cuisineFromOsm('', 'cafe'), 'Cafe');
  assert.equal(cuisineFromOsm('', 'restaurant'), '');
});

test('everyday opening hours are read, days nobody mentions are shut', () => {
  assert.deepEqual(hoursFromOsm('Mo-Sa 11:00-22:00'), { opens: '11:00', closes: '22:00', shutDays: [0] });
  assert.deepEqual(
    hoursFromOsm('Mo-Fr 11:30-14:00,17:00-22:00; Sa,Su 11:00-21:00'),
    { opens: '11:30', closes: '22:00', shutDays: [] },
  );
  assert.deepEqual(hoursFromOsm('Mo-Su 17:00-24:00; Tu off'), { opens: '17:00', closes: '00:00', shutDays: [2] });
  assert.deepEqual(hoursFromOsm('Fr-Mo 18:00-26:00'), { opens: '18:00', closes: '02:00', shutDays: [2, 3, 4] });
});

test('a rule with no days covers the whole week; 24/7 is open, not shut', () => {
  assert.deepEqual(hoursFromOsm('09:00-17:00'), { opens: '09:00', closes: '17:00', shutDays: [] });
  assert.deepEqual(hoursFromOsm('24/7'), { opens: '', closes: '', shutDays: [] });
});

test('holiday and seasonal rules are skipped, not guessed at', () => {
  assert.deepEqual(hoursFromOsm('Mo-Su 10:00-18:00; PH off'), { opens: '10:00', closes: '18:00', shutDays: [] });
  assert.equal(hoursFromOsm('sunrise-sunset'), null);
  assert.equal(hoursFromOsm(''), null);
  assert.equal(hoursFromOsm('by appointment'), null);
});

test('Wikipedia and Wikimedia references are read, other image links are not trusted', () => {
  assert.deepEqual(wikipediaRef('ja:浅草寺'), { lang: 'ja', title: '浅草寺' });
  assert.equal(wikipediaRef('Sensoji'), null);
  assert.equal(commonsFileUrl('File:Senso-ji.jpg'), 'https://commons.wikimedia.org/wiki/Special:FilePath/Senso-ji.jpg?width=640');
  assert.equal(imageFromTag('File:A b.jpg'), commonsFileUrl('A b.jpg'));
  assert.equal(imageFromTag('https://upload.wikimedia.org/x.jpg'), 'https://upload.wikimedia.org/x.jpg');
  assert.equal(imageFromTag('https://example.com/shop.jpg'), '');
});

test('a Wikipedia hit has to be about the place that was asked for', () => {
  assert.equal(sameName('Sensō-ji', 'Senso-ji'), true);
  assert.equal(sameName('Fushimi Inari-taisha', 'Fushimi Inari Taisha'), true);
  assert.equal(sameName('Meiji Shrine', 'Senso-ji'), false);
  assert.equal(sameName('A', 'A'), false);
});
