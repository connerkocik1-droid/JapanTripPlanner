/**
 * What you actually spent, against what the plan said you would.
 *
 * Everything else about money in this app is a plan: a nightly rate, a food
 * allowance, a fare. On the trip you hand over a card and the number is real,
 * and the only question worth answering at the end of a day is whether you are
 * ahead or behind. So an expense is logged in the currency you paid in, kept
 * with the rate that applied when you logged it, and compared against the same
 * figures the budget card already sums.
 *
 * The rate is stored on the expense rather than looked up again later. A ¥2,400
 * lunch was a particular number of dollars on the day you ate it, and the trip
 * total should not move because the yen did.
 */

// The extension is spelled out because `npm test` loads this module directly
// through node's type stripper, which resolves no extensions of its own.
import { uid, type City, type DayItem } from './data.ts';

/** The budget's own breakdown, plus a slot for everything else. */
export type ExpenseCategory = 'food' | 'transit' | 'activities' | 'lodging' | 'other';

/** Food leads: on the trip it is what gets logged, several times a day. */
export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string; icon: string }[] = [
  { id: 'food', label: 'Food', icon: 'ph-fork-knife' },
  { id: 'transit', label: 'Transit', icon: 'ph-train-simple' },
  { id: 'activities', label: 'Activities', icon: 'ph-ticket' },
  { id: 'lodging', label: 'Lodging', icon: 'ph-bed' },
  { id: 'other', label: 'Other', icon: 'ph-tag' },
];

export function expenseCategory(id: ExpenseCategory): (typeof EXPENSE_CATEGORIES)[number] {
  return EXPENSE_CATEGORIES.find((c) => c.id === id) ?? EXPENSE_CATEGORIES[4];
}

export interface Expense {
  id: string;
  /**
   * The calendar day it was spent, YYYY-MM-DD local. A date rather than a trip
   * day number, so moving the trip's start does not move what you spent.
   */
  on: string;
  /** The city it was spent in, or '' when it is not tied to one. */
  cityId: string;
  category: ExpenseCategory;
  /** The figure as typed, in `currency`. */
  amount: number;
  /** A code from `CURRENCIES`, or '' when the figure is already in dollars. */
  currency: string;
  /**
   * Units of `currency` per dollar as at logging time; 0 alongside a blank
   * currency, since a dollar figure needs no rate.
   */
  rate: number;
  note: string;
  /** When it was logged, epoch ms. Ordering only. */
  at: number;
}

export function blankExpense(on: string, cityId = '', currency = '', rate = 0): Expense {
  return {
    id: uid(), on, cityId, category: 'food', amount: 0, currency, rate, note: '', at: Date.now(),
  };
}

const CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id) as string[];

/**
 * Fill the gaps in a saved expense, the way `fillCity` does for a city: a plan
 * written before a field existed has to keep working, and a category nobody
 * recognises has to land somewhere rather than disappear.
 */
export function fillExpense(input: unknown): Expense {
  const e = (input ?? {}) as Partial<Expense>;
  const amount = Number(e.amount);
  const rate = Number(e.rate);
  return {
    id: typeof e.id === 'string' && e.id ? e.id : uid(),
    on: typeof e.on === 'string' ? e.on : '',
    cityId: typeof e.cityId === 'string' ? e.cityId : '',
    category: CATEGORY_IDS.includes(e.category as string) ? (e.category as ExpenseCategory) : 'other',
    amount: Number.isFinite(amount) ? amount : 0,
    currency: typeof e.currency === 'string' ? e.currency : '',
    rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    note: typeof e.note === 'string' ? e.note : '',
    at: Number.isFinite(Number(e.at)) ? Number(e.at) : 0,
  };
}

/**
 * What it cost in dollars, or null when it cannot be said — a local figure
 * saved without the rate that priced it. Null rather than zero: an expense the
 * app cannot convert is one it must not quietly count as free.
 */
export function usdOf(e: Expense): number | null {
  if (!Number.isFinite(e.amount)) return null;
  if (!e.currency) return e.amount;
  return e.rate > 0 ? e.amount / e.rate : null;
}

/** The dollars in a list of expenses. Anything unpriceable is left out. */
export function sumUsd(list: Expense[]): number {
  return list.reduce((a, e) => a + (usdOf(e) ?? 0), 0);
}

/** YYYY-MM-DD for a date, in the device's own day rather than UTC's. */
export function dayStamp(d: Date = new Date()): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

export interface Budget {
  lodging: number;
  transit: number;
  food: number;
  activities: number;
  total: number;
}

const ZERO: Budget = { lodging: 0, transit: 0, food: 0, activities: 0, total: 0 };

/** A day of the trip, as much of it as a budget needs to know. */
export interface BudgetDay {
  city: City;
  items: DayItem[];
}

/**
 * What the plan budgets for one day.
 *
 * Lodging and food are already per-day figures — a night in the chosen hotel,
 * a day's food allowance — and the day's own stops carry their own costs. The
 * city's transit figure is the one-off for getting in and around, so it is
 * spread across the nights you are there. Summed over a city's days this comes
 * back to exactly what the budget card shows for that city.
 */
export function dayBudget(day: BudgetDay, travelers: number): Budget {
  const city = day.city;
  const heads = Math.max(1, travelers || 1);
  const nights = Math.max(1, city.nights || 1);
  const hotel = city.hotels.find((h) => h.id === city.hotelSel) ?? null;

  const lodging = Number(hotel?.cost) || 0;
  const transit = ((Number(city.transitCost) || 0) * heads) / nights;
  const food = Number(city.foodPer) || 0;
  const activities = day.items.reduce((a, it) => a + (Number(it.cost) || 0), 0);

  return { lodging, transit, food, activities, total: lodging + transit + food + activities };
}

/** The same, over a run of days — the trip so far, usually. */
export function sumBudgets(days: BudgetDay[], travelers: number): Budget {
  return days.reduce<Budget>((a, day) => {
    const b = dayBudget(day, travelers);
    return {
      lodging: a.lodging + b.lodging,
      transit: a.transit + b.transit,
      food: a.food + b.food,
      activities: a.activities + b.activities,
      total: a.total + b.total,
    };
  }, ZERO);
}

/** The expenses logged on one calendar day, newest first. */
export function onDay(list: Expense[], on: string): Expense[] {
  return list.filter((e) => e.on === on).sort((a, b) => b.at - a.at);
}

/**
 * Everything logged between two days inclusive — the trip so far. `from` keeps
 * a figure typed in before departure out of the trip's running total.
 */
export function upTo(list: Expense[], on: string, from = ''): Expense[] {
  return list.filter((e) => e.on && e.on <= on && (!from || e.on >= from));
}

/** Dollars spent per category, for the ones that have anything in them. */
export function byCategory(list: Expense[]): { id: ExpenseCategory; usd: number }[] {
  return EXPENSE_CATEGORIES.map((c) => ({
    id: c.id,
    usd: sumUsd(list.filter((e) => e.category === c.id)),
  })).filter((c) => c.usd > 0);
}

function usd(n: number): string {
  return '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
}

/**
 * The day's verdict, in the words you would use about it. A difference under a
 * dollar is not a difference worth a sentence, so it reads as on budget.
 */
export function dayLine(spent: number, budget: number): string {
  if (budget <= 0) {
    return spent > 0
      ? `You have spent ${usd(spent)} today. This day has no budget set.`
      : 'Nothing logged today, and no budget set for the day.';
  }
  if (spent <= 0) return `Nothing logged today yet. The day budgets ${usd(budget)}.`;
  const diff = spent - budget;
  if (Math.abs(diff) < 1) return `You have spent ${usd(spent)} today, right on budget.`;
  return diff > 0
    ? `You have spent ${usd(diff)} more than what you budgeted today.`
    : `You have spent ${usd(diff)} less than what you budgeted today.`;
}

/** The same for everything logged so far, which is the number that compounds. */
export function tripLine(spent: number, budget: number, dayN: number): string {
  const lead = dayN <= 1 ? 'So far' : `Over ${dayN} days`;
  if (spent <= 0) {
    return budget > 0
      ? `Nothing logged on the trip yet. The days so far budget ${usd(budget)}.`
      : 'Nothing logged on the trip yet.';
  }
  if (budget <= 0) return `${lead} you have spent ${usd(spent)}.`;
  const diff = spent - budget;
  if (Math.abs(diff) < 1) return `${lead} you are level with the budget, at ${usd(spent)}.`;
  return diff > 0
    ? `${lead} you are ${usd(diff)} over, having spent ${usd(spent)} of ${usd(budget)}.`
    : `${lead} you are ${usd(diff)} under, having spent ${usd(spent)} of ${usd(budget)}.`;
}

export interface Insight {
  /** The day it is about, YYYY-MM-DD — also what a dismissal remembers. */
  on: string;
  dayN: number;
  spentToday: number;
  budgetToday: number;
  spentTrip: number;
  budgetTrip: number;
  today: string;
  trip: string;
}

/**
 * The once-a-day read on the money: today against the day's budget, and the
 * trip so far against the budget for the days behind you.
 */
export function insightFor(
  expenses: Expense[], days: BudgetDay[], dayN: number, on: string, travelers: number, from = '',
): Insight {
  const past = days.slice(0, Math.max(0, dayN));
  const spentToday = sumUsd(onDay(expenses, on));
  const budgetToday = days[dayN - 1] ? dayBudget(days[dayN - 1], travelers).total : 0;
  const spentTrip = sumUsd(upTo(expenses, on, from));
  const budgetTrip = sumBudgets(past, travelers).total;

  return {
    on,
    dayN,
    spentToday,
    budgetToday,
    spentTrip,
    budgetTrip,
    today: dayLine(spentToday, budgetToday),
    trip: tripLine(spentTrip, budgetTrip, dayN),
  };
}

const SEEN_KEY = 'trip-planner:insight-seen';

/**
 * Which day's insight this device has already been shown. Device-local on
 * purpose: it is an acknowledgement of having read something, not part of the
 * trip, and dismissing it on a phone should not dismiss it on the other one.
 */
export function insightSeen(): string {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function markInsightSeen(on: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, on);
  } catch {
    /* storage blocked — the insight shows again, which is the safe way to fail */
  }
}
