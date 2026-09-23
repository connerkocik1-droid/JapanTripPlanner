'use client';

import { useState } from 'react';
import { LatLng, PLACE_KINDS, Place, PlaceKind, blankPlace, placeKind } from '@/lib/data';
import { geocode, hitToLatLng, isApprox, precisionNote } from '@/lib/geocode';
import { ghostBtn, label } from './fields';

export interface AddPlaceProps {
  /** Adds the place and hands back what actually went in, minus any duplicate. */
  onAdd: (places: Place[]) => Place[];
  onLocate: (placeId: string, ll: LatLng) => void;
}

/** What happened to the last one added, in the words you would want back. */
interface Said {
  tone: 'good' | 'warn';
  text: string;
}

/**
 * Adding a restaurant or an activity by hand: what it is, what it is called,
 * and where it is.
 *
 * The address is resolved on the spot rather than later, because the answer is
 * the only thing that tells you whether the pin will land where you meant. A
 * miss still keeps the place — a name and a note are worth having without
 * coordinates — and says so, rather than leaving a pin that never appears.
 */
export default function AddPlace({ onAdd, onLocate }: AddPlaceProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PlaceKind>('eat');
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said | null>(null);

  const submit = async () => {
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    setSaid(null);

    const place: Place = { ...blankPlace(kind), name: title, addr: addr.trim() };
    const [added] = onAdd([place]);
    if (!added) {
      setBusy(false);
      setSaid({ tone: 'warn', text: `${title} is already on the list.` });
      return;
    }

    setName('');
    setAddr('');
    if (!place.addr) {
      setBusy(false);
      setSaid({ tone: 'warn', text: `${title} added. Give it an address below to put it on the map.` });
      return;
    }

    const hit = await geocode(place.addr);
    setBusy(false);
    if (!hit) {
      setSaid({ tone: 'warn', text: `${title} added, but that address found nothing. Check it below.` });
      return;
    }
    onLocate(added.id, hitToLatLng(hit));
    setSaid(
      isApprox(hit)
        ? { tone: 'warn', text: `${title} pinned, but ${precisionNote(hit)}.` }
        : { tone: 'good', text: `${title} is on the map.` },
    );
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button
        className="tap"
        onClick={() => setOpen((v) => !v)}
        style={{ ...ghostBtn, marginTop: 0 }}
        aria-expanded={open}
      >
        <i className={'ph ' + (open ? 'ph-caret-up' : 'ph-plus')} style={{ fontSize: 12 }} />
        Add a place
      </button>

      {open ? (
        <div
          style={{
            display: 'grid', gap: 6, marginTop: 6, padding: '9px 10px',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
            background: 'var(--color-surface)',
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={kind}
              aria-label="Kind of place"
              onChange={(e) => setKind(e.target.value as PlaceKind)}
              style={{
                flex: 'none', width: 72, height: 38, fontSize: 11, padding: '0 4px',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
                background: 'var(--color-bg)', color: placeKind(kind).color,
              }}
            >
              {PLACE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={name}
              placeholder="Name"
              aria-label="Place name"
              onChange={(e) => setName(e.target.value)}
              style={{ flex: 1, minWidth: 0, height: 38, fontSize: 12.5, fontWeight: 500 }}
            />
          </div>
          <input
            type="text"
            value={addr}
            placeholder="Address"
            aria-label="Place address"
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            style={{ width: '100%', height: 36, fontSize: 11.5 }}
          />
          <button
            className="tap"
            disabled={busy || !name.trim()}
            onClick={() => void submit()}
            style={{
              width: '100%', minHeight: 36, borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-accent-600)', background: 'transparent',
              color: name.trim() ? 'var(--color-accent-200)' : 'var(--color-neutral-700)',
              fontSize: 11.5, cursor: name.trim() ? 'pointer' : 'default',
            }}
          >
            {busy ? 'Finding the address…' : 'Add it'}
          </button>
          {said ? (
            <div
              className="mono"
              style={{ ...label, color: said.tone === 'good' ? 'var(--color-accent-300)' : '#ffc46b' }}
            >
              {said.text}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
