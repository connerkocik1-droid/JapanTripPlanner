'use client';

import { useEffect, useRef, useState } from 'react';
import { LatLng } from '@/lib/data';
import { geocode, hitToLatLng } from '@/lib/geocode';

export const label = { fontSize: 9.5, color: 'var(--color-neutral-500)' } as const;

export const boxed = {
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-neutral-800)',
  background: 'var(--color-surface)',
} as const;

export const ghostBtn = {
  width: '100%',
  minHeight: 40,
  marginTop: 6,
  borderRadius: 'var(--radius-sm)',
  border: '1px dashed var(--color-neutral-700)',
  background: 'transparent',
  color: 'var(--color-accent-200)',
  fontSize: 11.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  cursor: 'pointer',
};

export type GeoState = 'idle' | 'looking' | 'found' | 'missing';

/** Resolves a typed address to coordinates so the pin and walk times are real. */
export function useGeocodedAddress(addr: string, onResolved: (ll: LatLng) => void): GeoState {
  const [status, setStatus] = useState<GeoState>('idle');
  const typed = useRef(addr);
  // Held in a ref: the caller passes a fresh closure every render, and putting
  // that in the dependency list would clear the debounce timer before it fires.
  const cb = useRef(onResolved);
  cb.current = onResolved;
  useEffect(() => {
    if (addr === typed.current) return;
    typed.current = addr;
    const q = addr.trim();
    if (q.length < 6) {
      setStatus('idle');
      return;
    }
    let live = true;
    setStatus('looking');
    const t = setTimeout(async () => {
      const hit = await geocode(q);
      if (!live) return;
      if (hit) {
        cb.current(hitToLatLng(hit));
        setStatus('found');
      } else {
        setStatus('missing');
      }
    }, 700);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [addr]);
  return status;
}

export function GeoStatus({ status }: { status: GeoState }) {
  return (
    <div className="mono" style={{ fontSize: 9, minHeight: 12, color: 'var(--color-neutral-600)' }}>
      {status === 'looking' ? 'Locating…' : null}
      {status === 'found' ? 'Pinned from address' : null}
      {status === 'missing' ? 'No match — pin unchanged' : null}
    </div>
  );
}

/** A number input that can be cleared instead of snapping back to 0. */
export function NumField({
  value, onChange, aria, width = 92,
}: { value: number; onChange: (v: number) => void; aria: string; width?: number }) {
  const [text, setText] = useState(value ? String(value) : '');
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value ? String(value) : '');
    }
  }, [value]);
  return (
    <input
      type="number"
      min={0}
      inputMode="decimal"
      aria-label={aria}
      value={text}
      placeholder="0"
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        last.current = Number.isFinite(n) ? n : 0;
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className="num"
      style={{ width, fontSize: 13, fontWeight: 500 }}
    />
  );
}
