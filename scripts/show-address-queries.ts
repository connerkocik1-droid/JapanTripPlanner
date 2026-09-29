/**
 * What the geocoder will actually be asked, for every address in the shortlists.
 *
 * The point is to see a new CSV before importing it, without spending an hour of
 * Nominatim's patience finding out. Each address prints the ways it will be
 * tried, narrowest first, and the most exact any answer about it could claim to
 * be — so an address that is going to land on its district is visible as one
 * while it is still a line in a spreadsheet.
 *
 *   npm run addresses                       # every CSV in data/
 *   npm run addresses -- data/tokyo.csv     # one file
 *   npm run addresses -- "1-2-3 Jingumae, Shibuya-ku, Tokyo"
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeAddress, queryLadder } from '../src/lib/addressNormalize.ts';

const DATA = 'data';

/** Just enough CSV to read the shortlists, which are quoted but not exotic. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}

function addressesIn(file: string): { name: string; address: string }[] {
  const rows = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const addr = header.indexOf('address');
  const name = header.findIndex((h) => h === 'name');
  if (addr < 0) return [];
  return rows.slice(1).map((r) => ({ name: (r[name] ?? '').trim(), address: (r[addr] ?? '').trim() }));
}

function report(name: string, address: string): 'exact' | 'vague' {
  const norm = normalizeAddress(address);
  const ladder = queryLadder(address);
  const head = `${name ? name + ' — ' : ''}${address}`;
  console.log(`\n${head}`);
  console.log(
    `  ${norm.locale}, at best ${ladder[0]?.precision ?? 'nothing'}` +
      (norm.postcode ? `, postcode ${norm.postcode}` : '') +
      (norm.dropped.length ? `, set aside: ${norm.dropped.join(' / ')}` : ''),
  );
  for (const step of ladder) console.log(`    [${step.precision.padEnd(5)}] ${step.q}`);
  return ladder[0]?.precision === 'exact' ? 'exact' : 'vague';
}

const args = process.argv.slice(2);
const files = args.length
  ? args.filter((a) => a.endsWith('.csv'))
  : readdirSync(DATA)
      .filter((f) => f.endsWith('.csv'))
      .map((f) => join(DATA, f));
const loose = args.filter((a) => !a.endsWith('.csv'));

let exact = 0;
let vague = 0;
const count = (verdict: 'exact' | 'vague') => (verdict === 'exact' ? (exact += 1) : (vague += 1));

for (const raw of loose) count(report('', raw));

for (const file of files) {
  const rows = addressesIn(file);
  console.log(`\n=== ${file} — ${rows.length} addresses ===`);
  for (const { name, address } of rows) {
    if (address) count(report(name, address));
  }
}

console.log(
  `\n${exact + vague} addresses: ${exact} can name a building, ${vague} can only be placed near.`,
);
