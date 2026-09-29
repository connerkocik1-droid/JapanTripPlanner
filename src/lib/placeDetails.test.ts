import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankPlace } from './data.ts';
import {
  cuisineFromTypes, detailsPatch, mealsLine, ratingLine, shortCuisine, suggestMeals, wantsDetails,
  packCatchUp, packKey, placeTags, matchesTags,
} from './placeDetails.ts';

test('a short cuisine is left exactly as written', () => {
  assert.equal(shortCuisine('Korean BBQ'), 'Korean BBQ');
  assert.equal(shortCuisine('Sushi'), 'Sushi');
});

test('the parenthetical goes and a long list keeps its first alternative', () => {
  assert.equal(shortCuisine('Korean fine dining (3 Michelin stars)'), 'Korean fine dining');
  assert.equal(shortCuisine('Korean traditional (bossam, kimchi steam)'), 'Korean traditional');
  assert.equal(shortCuisine('Korean traditional / makgeolli pub'), 'Korean traditional');
  assert.equal(shortCuisine('Wine bar / Western'), 'Wine bar / Western');
});

test('a directory type only becomes a cuisine when it names a food', () => {
  assert.equal(cuisineFromTypes(['sushi_restaurant', 'restaurant', 'food']), 'Sushi');
  assert.equal(cuisineFromTypes(['restaurant', 'food', 'point_of_interest']), '');
  assert.equal(cuisineFromTypes(['restaurant'], 'Restaurant'), '');
  assert.equal(cuisineFromTypes(['restaurant'], 'Korean barbecue restaurant'), 'Korean barbecue');
});

test('opening hours decide the meals when there are any', () => {
  assert.deepEqual(suggestMeals({ opens: '07:00', closes: '11:00' }), ['breakfast']);
  assert.deepEqual(suggestMeals({ opens: '11:00', closes: '22:00' }), ['lunch', 'dinner']);
  assert.deepEqual(suggestMeals({ opens: '17:00', closes: '23:00' }), ['dinner']);
  assert.deepEqual(suggestMeals({ opens: '08:00', closes: '22:00' }), ['breakfast', 'lunch', 'dinner']);
});

test('a place shut before lunch ends is not a lunch', () => {
  // Open 07:00–12:00 covers only half an hour of the 11:30–14:30 window.
  assert.deepEqual(suggestMeals({ opens: '07:00', closes: '12:00' }), ['breakfast']);
});

test('closing after midnight runs to the end of the day, not backwards', () => {
  assert.deepEqual(suggestMeals({ opens: '18:00', closes: '02:00' }), ['dinner']);
});

test('with no hours, what it serves has a say', () => {
  assert.deepEqual(suggestMeals({ cuisine: 'Specialty coffee cafe' }), ['breakfast', 'lunch']);
  assert.deepEqual(suggestMeals({ cuisine: 'Korean BBQ' }), ['dinner']);
  assert.deepEqual(suggestMeals({ cuisine: 'Japanese ramen' }), ['lunch', 'dinner']);
  assert.deepEqual(suggestMeals({ cuisine: 'Korean' }), []);
});

test('nothing to go on claims nothing', () => {
  assert.deepEqual(suggestMeals({}), []);
  assert.equal(mealsLine([]), '');
});

test('the meal line reads as a sentence', () => {
  assert.equal(mealsLine(['dinner']), 'Dinner');
  assert.equal(mealsLine(['lunch', 'dinner']), 'Lunch or dinner');
  assert.equal(mealsLine(['breakfast', 'lunch', 'dinner']), 'Breakfast, lunch or dinner');
});

test('the rating line only appears when there is a rating', () => {
  assert.equal(ratingLine(0), '');
  assert.equal(ratingLine(4.5), '4.5★');
  assert.equal(ratingLine(4.6, 302), '4.6★ · 302 reviews');
  assert.equal(ratingLine(5, 1), '5.0★ · 1 review');
  assert.equal(ratingLine(4.5, 2525), '4.5★ · 2,525 reviews');
});

test('a lookup fills blanks', () => {
  const place = { ...blankPlace('eat'), name: 'Mosu' };
  const patch = detailsPatch(place, {
    rating: 4.6, ratingCount: 302, cuisine: 'Korean fine dining (2 Michelin stars)',
    images: ['/api/place-photo?ref=a'], url: 'https://example.com', opens: '18:00', closes: '22:00',
  }, '2026-09-29');
  assert.equal(patch.rating, 4.6);
  assert.equal(patch.ratingCount, 302);
  // Kept whole — the map card is where it gets cut to chip length.
  assert.equal(patch.cuisine, 'Korean fine dining (2 Michelin stars)');
  assert.deepEqual(patch.images, ['/api/place-photo?ref=a']);
  assert.deepEqual(patch.meals, ['dinner']);
  assert.equal(patch.lookedUp, '2026-09-29');
});

test('a lookup never overwrites what the travelers put there', () => {
  const place = {
    ...blankPlace('eat'), name: 'Mosu', rating: 4.9, cuisine: 'Ours', images: ['mine.jpg'],
    url: 'https://ours', opens: '09:00', closes: '11:00', meals: ['breakfast' as const],
  };
  const patch = detailsPatch(place, {
    rating: 4.6, cuisine: 'Theirs', images: ['theirs.jpg'], url: 'https://theirs',
    opens: '18:00', closes: '22:00',
  }, '2026-09-29');
  assert.deepEqual(patch, { lookedUp: '2026-09-29' });
});

test('hours from the same answer decide that answer\'s meals', () => {
  const place = { ...blankPlace('eat'), name: 'Onion' };
  const patch = detailsPatch(place, { opens: '07:00', closes: '10:00' }, '2026-09-29');
  assert.deepEqual(patch.meals, ['breakfast']);
});

test('a place with nothing found is still stamped, so it is asked about once', () => {
  const place = { ...blankPlace('do'), name: 'Somewhere' };
  const patch = detailsPatch(place, null, '2026-09-30T10:00:00.000Z');
  assert.deepEqual(patch, { lookedUp: '2026-09-30T10:00:00.000Z' });
  assert.equal(wantsDetails({ ...place, ...patch }), false);
});

test('a day-only stamp from the first version is retried once if nothing landed', () => {
  const place = { ...blankPlace('eat'), name: 'Ichiran', lookedUp: '2026-09-29' };
  assert.equal(wantsDetails(place), true);
  assert.equal(wantsDetails({ ...place, images: ['/api/place-photo?ref=x'] }), false);
});

test('the queue takes named eats and sights, once each', () => {
  assert.equal(wantsDetails({ ...blankPlace('eat'), name: 'Mingles' }), true);
  assert.equal(wantsDetails({ ...blankPlace('do'), name: 'Gyeongbokgung' }), true);
  assert.equal(wantsDetails({ ...blankPlace('stay'), name: 'A hotel' }), false);
  assert.equal(wantsDetails(blankPlace('eat')), false);
});

// The catch-up path: shortlists that learned something after they were pinned.

test('a place pinned before the shortlist knew its score catches up', () => {
  const place = { ...blankPlace('eat'), name: 'Mingles', band: '4.5★' };
  const patch = packCatchUp(
    { name: 'Mingles', rating: 4.5, reviews: 853, cuisine: 'Korean BBQ' },
    place,
  );
  assert.equal(patch.rating, 4.5);
  assert.equal(patch.ratingCount, 853);
  assert.equal(patch.cuisine, 'Korean BBQ');
  assert.deepEqual(patch.meals, ['dinner']);
  // The star band was only ever standing in for the score it now has.
  assert.equal(patch.band, '');
});

test('catching up leaves a typed price band alone', () => {
  const place = { ...blankPlace('eat'), name: 'Mingles', band: '$$' };
  const patch = packCatchUp({ name: 'Mingles', rating: 4.5 }, place);
  assert.equal(patch.band, undefined);
  assert.equal(patch.rating, 4.5);
});

test('a place that has already caught up is not written again', () => {
  const place = {
    ...blankPlace('eat'), name: 'Mingles', rating: 4.5, ratingCount: 853,
    cuisine: 'Korean BBQ', meals: ['dinner' as const], band: '',
  };
  const patch = packCatchUp(
    { name: 'Mingles', rating: 4.5, reviews: 853, cuisine: 'Korean BBQ' },
    place,
  );
  assert.deepEqual(patch, {});
});

test('names are matched the way the importer matches them', () => {
  assert.equal(packKey('  Mingles '), packKey('MINGLES'));
});

test('a sight gets its rating but never a meal', () => {
  const place = { ...blankPlace('do'), name: 'National Museum of Korea' };
  const patch = detailsPatch(place, { rating: 4.5, ratingCount: 2525, opens: '10:00', closes: '18:00' }, '2026-09-29');
  assert.equal(patch.rating, 4.5);
  assert.equal(patch.meals, undefined);
  assert.equal(packCatchUp({ name: place.name, rating: 4.5 }, place).meals, undefined);
});

// The map filter.

test('a place answers to its meals, a drinking place to bar, a sight to activity', () => {
  assert.deepEqual(placeTags({ ...blankPlace('eat'), name: 'Ichiran', meals: ['lunch', 'dinner'] }), ['lunch', 'dinner']);
  assert.deepEqual(placeTags({ ...blankPlace('eat'), name: 'Bar Benfiddich', meals: ['dinner'] }), ['dinner', 'bar']);
  assert.deepEqual(placeTags({ ...blankPlace('eat'), name: 'Torikizoku', cuisine: 'Izakaya' }), ['dinner', 'bar']);
  assert.deepEqual(placeTags({ ...blankPlace('do'), name: 'teamLab' }), ['activity']);
  assert.deepEqual(placeTags({ ...blankPlace('stay'), name: 'A hotel' }), []);
});

test('a sushi bar is not a bar, and notes do not make one', () => {
  const sushi = { ...blankPlace('eat'), name: 'Sushi Dai', cuisine: 'Sushi bar', meals: ['lunch' as const] };
  assert.equal(placeTags(sushi).includes('bar'), false);
  const noted = { ...blankPlace('eat'), name: 'Kyubey', cuisine: 'Sushi', note: 'great sake list', meals: ['dinner' as const] };
  assert.equal(placeTags(noted).includes('bar'), false);
});

test('nothing ticked shows everything; ticks are any-of', () => {
  const cafe = { ...blankPlace('eat'), name: 'Blue Bottle', cuisine: 'Cafe' };
  assert.equal(matchesTags(cafe, []), true);
  assert.equal(matchesTags(cafe, ['breakfast']), true);
  assert.equal(matchesTags(cafe, ['dinner', 'bar']), false);
  assert.equal(matchesTags({ ...blankPlace('do'), name: 'Senso-ji' }, ['dinner', 'activity']), true);
});
