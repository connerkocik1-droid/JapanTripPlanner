import { DayItem, TravelMode } from './data';
import { HopResult } from './useDayRoute';

export interface PlannedStop {
  item: DayItem;
  /** Minutes from the day's start when you arrive and leave. */
  arrive: number;
  depart: number;
  /** Travel from the previous stop, in minutes; null for the first. */
  travelMins: number | null;
  travelMode: TravelMode | null;
  /** Fare for that hop, for everyone travelling. */
  travelCost: number;
  estimated: boolean;
}

export interface DayPlan {
  stops: PlannedStop[];
  /** Minutes the whole day takes, door to last stop. */
  totalMins: number;
  movingMins: number;
  /** Fares for the day, for the whole party. */
  transitCost: number;
  /** Stop costs (tickets, meals) as entered. */
  stopCost: number;
  startMins: number;
}

const DEFAULT_START = 9 * 60;

export function parseClock(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function fmtClock(mins: number): string {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = Math.round(wrapped % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtSpan(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/**
 * Lay the day out on a clock: each stop's dwell plus the routed travel between
 * them. A stop with its own time pins the schedule from there, so a booked
 * dinner stays where it belongs.
 */
export function planDay(
  items: DayItem[],
  hops: HopResult[],
  opts: { metroFare: number; travelers: number },
): DayPlan {
  const hopFor = (id: string) => hops.find((h) => h.toId === id);
  const first = items.find((it) => parseClock(it.time) !== null);
  const startMins = first ? (parseClock(first.time) as number) : DEFAULT_START;

  let clock = startMins;
  let movingMins = 0;
  let transitCost = 0;
  let stopCost = 0;
  const stops: PlannedStop[] = [];

  items.forEach((item, i) => {
    const hop = hopFor(item.id);
    const leg = hop ? hop.options[item.mode] ?? hop.options.walk : undefined;
    const travelMins = leg ? Math.round(leg.seconds / 60) : null;
    const isTransit = !!leg && leg.mode === 'transit';
    const travelCost = isTransit ? opts.metroFare * Math.max(1, opts.travelers) : 0;

    if (i > 0 && travelMins) {
      clock += travelMins;
      movingMins += travelMins;
    }
    transitCost += travelCost;
    stopCost += Number(item.cost) || 0;

    // A stop with an explicit time waits rather than arriving early.
    const pinned = parseClock(item.time);
    const arrive = pinned !== null && pinned > clock ? pinned : clock;
    const dwell = Math.max(0, Number(item.dwell) || 0);
    clock = arrive + dwell;

    stops.push({
      item,
      arrive,
      depart: clock,
      travelMins: i > 0 ? travelMins : null,
      travelMode: i > 0 && leg ? leg.mode : null,
      travelCost: i > 0 ? travelCost : 0,
      estimated: !!leg?.estimated,
    });
  });

  return {
    stops,
    totalMins: Math.max(0, clock - startMins),
    movingMins,
    transitCost,
    stopCost,
    startMins,
  };
}
