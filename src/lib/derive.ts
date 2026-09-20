import { CHECKLIST, DAYS, EATS, ItineraryItem, PARTY, PLANNED, PLACE, TRANSIT, WEATHER } from './data';
import { fmtD, fmtDow, fmtUsd, dateOf, money, walkLabel } from './format';
import { CityCfg, TripDoc, cfgFor } from './tripState';

export interface DayEntry {
  city: string;
  /** null for a night added past the seed schedule — "nothing planned yet". */
  items: ItineraryItem[] | null;
}

export interface CityMeta {
  cfg: CityCfg;
  start: number;
  count: number;
  seedDays: number[];
}

export interface CitySpend {
  hotel: number;
  transit: number;
  food: number;
  total: number;
}

export interface Derived {
  order: string[];
  schedule: DayEntry[];
  meta: Record<string, CityMeta>;
  picked: Record<string, CitySpend>;
  spend: { Lodging: number; Transit: number; Food: number };
  grand: number;
  ground: number;
  tripRange: string;
  tripLength: string;
  countdown: number;
  totalNote: string;
  vsPlanned: string;
  segments: { label: string; amount: string; pct: string }[];
  checkedCount: number;
  checkTotal: number;
}

export function derive(doc: TripDoc, order: string[]): Derived {
  const cityDayIdx: Record<string, number[]> = {};
  DAYS.forEach((d, i) => {
    (cityDayIdx[d.city] = cityDayIdx[d.city] ?? []).push(i);
  });

  // The schedule is derived from the nights picked per city, so dates, day
  // blocks, pins and money all read from the same numbers.
  const schedule: DayEntry[] = [];
  const meta: Record<string, CityMeta> = {};
  order.forEach((c) => {
    const idx = cityDayIdx[c] ?? [];
    const cfg = cfgFor(doc, c);
    meta[c] = { cfg, start: schedule.length, count: cfg.nights, seedDays: idx };
    for (let j = 0; j < cfg.nights; j++) {
      schedule.push({ city: c, items: idx[j] !== undefined ? DAYS[idx[j]].items : null });
    }
  });

  const ground = schedule.reduce(
    (a, e) => a + (e.items ?? []).reduce((b, it) => b + (it.cost || 0), 0),
    0,
  );

  // Budget comes from the selected options, not from the itinerary rows.
  const picked: Record<string, CitySpend> = {};
  const spend = { Lodging: 0, Transit: 0, Food: 0 };
  order.forEach((c) => {
    const cfg = meta[c].cfg;
    const hotel = (Number(cfg.hotels[cfg.hotelSel]?.cost) || 0) * cfg.nights;
    const transit = (Number(cfg.trainCost) || 0) * PARTY;
    const food = (Number(cfg.foodPer) || 0) * cfg.nights;
    picked[c] = { hotel, transit, food, total: hotel + transit + food };
    spend.Lodging += hotel;
    spend.Transit += transit;
    spend.Food += food;
  });

  const grand = spend.Lodging + spend.Transit + spend.Food;

  const checkKeys: string[] = [];
  CHECKLIST.forEach((g, gi) => g[1].forEach((_, li) => checkKeys.push('c' + gi + ':' + li)));
  const checkedCount = checkKeys.filter((k) => doc.checked[k]).length;

  const lastDay = Math.max(0, schedule.length - 1);

  return {
    order,
    schedule,
    meta,
    picked,
    spend,
    grand,
    ground,
    tripRange: fmtD(dateOf(0)) + ' – ' + fmtD(dateOf(lastDay)),
    tripLength: schedule.length + ' days',
    countdown: Math.max(0, Math.ceil((dateOf(0).getTime() - Date.now()) / 86400000)),
    totalNote: fmtUsd(grand / PARTY) + ' each · plus ' + fmtUsd(ground) + ' of activities',
    vsPlanned:
      grand + ground > PLANNED
        ? fmtUsd(grand + ground - PLANNED) + ' over plan'
        : fmtUsd(PLANNED - grand - ground) + ' left of ' + fmtUsd(PLANNED),
    segments: (['Lodging', 'Transit', 'Food'] as const).map((k) => ({
      label: k,
      amount: fmtUsd(spend[k]),
      pct: Math.round((spend[k] / (grand || 1)) * 100) + '%',
    })),
    checkedCount,
    checkTotal: checkKeys.length,
  };
}

export interface DayView {
  n: number;
  nn: string;
  dow: string;
  date: string;
  city: string;
  weather: string;
  total: string;
  planned: boolean;
  items: { key: string; time: string; title: string; note: string; cost: string; done: boolean }[];
}

export function dayView(d: Derived, doc: TripDoc, i: number): DayView {
  const dt = dateOf(i);
  const e = d.schedule[i];
  const rows = e?.items ?? [];
  return {
    n: i + 1,
    nn: String(i + 1).padStart(2, '0'),
    dow: fmtDow(dt),
    date: fmtDow(dt) + ' ' + fmtD(dt),
    city: e?.city ?? '',
    weather: WEATHER[e?.city] ?? '',
    total: rows.length ? money(rows.reduce((a, it) => a + (it.cost || 0), 0), e.city) : 'Open',
    planned: !!e?.items,
    items: rows.map((it, j) => ({
      key: i + ':' + j,
      time: it.time,
      title: it.title,
      note: it.note,
      cost: money(it.cost, e.city),
      done: !!doc.done[i + ':' + j],
    })),
  };
}

export function transitLabel(city: string): string {
  return TRANSIT[city]?.label ?? 'Getting to ' + city;
}

export function eatsFor(city: string, cfg: CityCfg) {
  const hotel = cfg.hotels[cfg.hotelSel];
  return (EATS[city] ?? []).map((e) => ({
    ...e,
    walk: walkLabel(hotel?.ll ?? PLACE[city] ?? null, e.ll),
  }));
}
