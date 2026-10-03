'use client';

import { useState } from 'react';
import { City, DayItem } from '@/lib/data';
import { decideConfigured } from '@/lib/decide';
import type { WeatherHint } from '@/lib/decide';
import DecideSheet from './DecideSheet';
import DraftDay from './DraftDay';

export interface DayAssistProps {
  /** The trip's own code — the only thing that gets the server to answer. */
  code: string | null;
  /** `cityId:nightIndex`, the day this sits under. */
  dayKey: string;
  city: City;
  /** The day as it stands. An empty one is offered a whole draft. */
  items: DayItem[];
  weekday: number;
  /** YYYY-MM-DD, so a budget answer can be reused for the rest of the day. */
  date: string;
  /** Minutes past midnight — only on the day you are actually living. */
  nowMins: number | null;
  weather: WeatherHint | null;
  diets: Record<string, string>;
  onSetDiet: (who: string, text: string) => void;
  onAdd: (items: DayItem[]) => void;
}

/**
 * The two things Claude can do for a day, where the day is filled in.
 *
 * An empty day gets the whole-day draft, because that is the question an empty
 * day asks. Both an empty day and a half-built one get "Help me decide", which
 * is the question you have standing on a pavement at six o'clock with one
 * thing already booked.
 *
 * Neither writes anything. A drafted stop and a suggested pick both become
 * part of the plan only when somebody accepts one.
 */
export default function DayAssist(props: DayAssistProps) {
  const { code, dayKey, city, items, weekday, date, nowMins, weather } = props;
  const [deciding, setDeciding] = useState(false);

  if (!decideConfigured()) return null;

  return (
    <>
      {items.length === 0 ? (
        <DraftDay code={code} dayKey={dayKey} city={city} onAccept={props.onAdd} />
      ) : null}

      <button
        className="tap"
        onClick={() => setDeciding(true)}
        style={{
          width: '100%', minHeight: 44, marginTop: 8, borderRadius: 9999,
          border: '1px solid var(--color-accent-600)', background: 'transparent',
          color: 'var(--color-accent-200)', fontSize: 12.5, fontWeight: 500,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 7,
        }}
      >
        <i className="ph ph-sparkle" style={{ fontSize: 14 }} />
        Help me decide
      </button>

      <DecideSheet
        open={deciding}
        onClose={() => setDeciding(false)}
        code={code}
        dayKey={dayKey}
        city={city}
        items={items}
        weekday={weekday}
        date={date}
        nowMins={nowMins}
        weather={weather}
        diets={props.diets}
        onSetDiet={props.onSetDiet}
        onAdd={(item) => props.onAdd([item])}
      />
    </>
  );
}
