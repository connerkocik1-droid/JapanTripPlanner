'use client';

import { useState } from 'react';
import { City, DayItem, Place } from '@/lib/data';
import { askFor, myAsk, plainAnswers, theOther, type Ask } from '@/lib/asks';
import { PEOPLE, type PersonId } from '@/lib/people';
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
  /** Save a place the trip did not have, when a suggestion names a new one. */
  onAddPlace: (cityId: string, place: Place) => void;

  /** Who is holding the phone. Null before anybody has picked a face. */
  me: PersonId | null;
  /** Invitations to decide together, from either traveler. */
  asks: Ask[];
  /** A round of questions here also sets the mood above the day's place list. */
  onLens: (answers: Record<string, string>) => void;
  onStartAsk: (dayKey: string, answers: Record<string, string>) => void;
  onAnswerAsk: (id: string, answers: Record<string, string>) => void;
  onEndAsk: (id: string) => void;
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
  const { code, dayKey, city, items, weekday, date, nowMins, weather, me } = props;
  /** 'mine' is my own question; 'join' is answering theirs. */
  const [deciding, setDeciding] = useState<'mine' | 'join' | null>(null);

  if (!decideConfigured()) return null;

  const other = me ? theOther(me) : null;
  const mine = me ? myAsk(props.asks, dayKey, me) : null;
  /** Their question, waiting on me. Shown until it is answered or it lapses. */
  const incoming = me ? askFor(props.asks, dayKey, me) : null;
  const asker = incoming ? PEOPLE[incoming.by] : null;

  return (
    <>
      {items.length === 0 ? (
        <DraftDay code={code} dayKey={dayKey} city={city} onAccept={props.onAdd} />
      ) : null}

      {incoming && asker ? (
        <button
          className="tap"
          onClick={() => setDeciding('join')}
          style={{
            width: '100%', minHeight: 44, marginTop: 8, borderRadius: 9999,
            border: `1px solid ${asker.color}`, background: asker.glow,
            color: 'var(--color-text)', fontSize: 12.5, fontWeight: 500,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 7,
          }}
        >
          <i className="ph ph-users-two" style={{ fontSize: 14 }} />
          {asker.name} is deciding — answer too
        </button>
      ) : null}

      <button
        className="tap"
        onClick={() => setDeciding('mine')}
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
        open={deciding !== null}
        onClose={() => setDeciding(null)}
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
        onAddPlace={(place) => props.onAddPlace(city.id, place)}
        me={me}
        other={other}
        mine={mine}
        joining={deciding === 'join' ? incoming : null}
        onLens={(answers) => props.onLens(plainAnswers(answers))}
        onStartAsk={(answers) => props.onStartAsk(dayKey, plainAnswers(answers))}
        onAnswerAsk={(id, answers) => props.onAnswerAsk(id, plainAnswers(answers))}
        onEndAsk={props.onEndAsk}
      />
    </>
  );
}
