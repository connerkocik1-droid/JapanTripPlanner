'use client';

import { useRef, useState } from 'react';
import { Trip } from '@/lib/data';
import { fmtUsd } from '@/lib/format';
import { SyncState, Touch } from '@/lib/tripState';
import TouchMark from './TouchMark';

export interface TripSettingsProps {
  trip: Trip;
  spent: number;
  onChange: <K extends keyof Trip>(key: K, val: Trip[K]) => void;
  touch: (path: string) => Touch | undefined;
  onClose: () => void;
  onExport: () => void;
  onImport: (input: unknown) => void;
  /** Whether the browser promised to keep this origin's storage. */
  persisted: boolean;
  /** How the shared copy is doing; 'off' when this build has nowhere to sync. */
  syncState: SyncState;
  /** The link that puts another device on this trip, or '' when there is none. */
  deviceLink: string;
  /** The short code someone types to join this trip, or '' when it has none. */
  joinCode: string;
  onSetJoinCode: (short: string) => Promise<{ ok: boolean; message: string }>;
  /** Put the trip picker back up. */
  onSwitchTrip: () => void;
}

const label = { fontSize: 9.5, color: 'var(--color-neutral-500)' } as const;
const row = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 48,
  borderTop: '1px solid var(--color-neutral-900)',
} as const;

export default function TripSettings({
  trip, spent, onChange, touch, onClose, onExport, onImport, persisted,
  syncState, deviceLink, joinCode, onSetJoinCode, onSwitchTrip,
}: TripSettingsProps) {
  const left = trip.planned ? trip.planned - spent : 0;
  const file = useRef<HTMLInputElement | null>(null);
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saveCode = async () => {
    if (codeDraft === null || saving) return;
    setSaving(true);
    const res = await onSetJoinCode(codeDraft.trim());
    setSaving(false);
    setProblem(res.ok ? '' : res.message);
    if (res.ok) setCodeDraft(null);
  };
  return (
    <div
      style={{
        padding: '4px 12px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-neutral-800)',
        marginBottom: 10,
        animation: 'fadeIn .22s ease both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
        <div className="mono" style={label}>Trip</div>
        <button
          className="tap"
          onClick={onClose}
          aria-label="Close trip settings"
          style={{
            width: 34, height: 34, border: 'none', background: 'transparent',
            color: 'var(--color-neutral-500)', cursor: 'pointer',
          }}
        >
          <i className="ph ph-x" style={{ fontSize: 13 }} />
        </button>
      </div>

      <input
        type="text"
        value={trip.name}
        placeholder="Trip name"
        onChange={(e) => onChange('name', e.target.value)}
        style={{ width: '100%', height: 40, fontSize: 16, fontWeight: 500 }}
      />
      <TouchMark touch={touch('trip/name')} />

      <div style={row}>
        <div className="mono" style={{ ...label, flex: 1 }}>Starts</div>
        <input
          type="date"
          value={trip.start}
          aria-label="Trip start date"
          onChange={(e) => onChange('start', e.target.value)}
          className="num"
          style={{
            fontSize: 13, background: 'transparent', border: 'none',
            color: 'var(--color-text)', colorScheme: 'dark',
          }}
        />
      </div>

      <div style={row}>
        <div className="mono" style={{ ...label, flex: 1 }}>Travelers</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            className="tap"
            aria-label="One traveler fewer"
            onClick={() => onChange('travelers', Math.max(1, trip.travelers - 1))}
            style={mini}
          >
            &minus;
          </button>
          <span className="num" style={{ minWidth: 22, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
            {trip.travelers}
          </span>
          <button
            className="tap"
            aria-label="One traveler more"
            onClick={() => onChange('travelers', Math.min(12, trip.travelers + 1))}
            style={mini}
          >
            +
          </button>
        </div>
      </div>

      <div style={row}>
        <div className="mono" style={{ ...label, flex: 1 }}>Budget</div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>$</span>
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={trip.planned || ''}
          placeholder="0"
          aria-label="Total budget"
          onChange={(e) => onChange('planned', Number(e.target.value) || 0)}
          className="num"
          style={{ width: 96, fontSize: 14, fontWeight: 600, textAlign: 'right' }}
        />
      </div>
      {trip.planned ? (
        <div className="mono num" style={{ ...label, fontSize: 9, textAlign: 'right', marginTop: 4 }}>
          {left >= 0 ? `${fmtUsd(left)} left` : `${fmtUsd(-left)} over`}
        </div>
      ) : null}

      {/* A short code to type, or one link — either puts another device on this trip. */}
      {deviceLink ? (
        <>
        <div style={{ ...row, gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={label}>Trip code</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)' }}>
              Type it on a new device to open this trip
            </div>
          </div>
          <input
            value={codeDraft ?? joinCode}
            onChange={(e) => setCodeDraft(e.target.value)}
            onBlur={() => void saveCode()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveCode();
            }}
            placeholder="none"
            style={{
              flex: '0 0 auto', width: 108, minHeight: 40, padding: '0 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-neutral-800)',
              background: 'transparent', color: 'inherit',
              fontSize: 13, textAlign: 'center', letterSpacing: '.08em',
              opacity: saving ? 0.5 : 1,
            }}
          />
        </div>

        <div style={{ ...row, gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={label}>Your other devices</div>
            <div
              className="mono"
              style={{
                fontSize: 9, color: 'var(--color-neutral-600)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {deviceLink}
            </div>
          </div>
          <button
            className="tap"
            style={{ ...backupBtn, flex: '0 0 auto', padding: '0 12px' }}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(deviceLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              } catch {
                setProblem('Could not copy — select the link and copy it by hand.');
              }
            }}
          >
            <i className={copied ? 'ph ph-check' : 'ph ph-link-simple'} style={{ fontSize: 13 }} />
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        </>
      ) : null}

      {/* The plan lives on this device, so it needs a way off it. */}
      <div style={{ ...row, gap: 8 }}>
        <button className="tap" onClick={onExport} style={backupBtn}>
          <i className="ph ph-download-simple" style={{ fontSize: 13 }} />
          Back up
        </button>
        <button className="tap" onClick={onSwitchTrip} style={backupBtn}>
          <i className="ph ph-arrows-left-right" style={{ fontSize: 13 }} />
          Switch trip
        </button>
        <button className="tap" onClick={() => file.current?.click()} style={backupBtn}>
          <i className="ph ph-upload-simple" style={{ fontSize: 13 }} />
          Restore
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const { readFile } = await import('@/lib/storage');
              onImport(await readFile(f));
              setProblem('');
            } catch (err) {
              setProblem(err instanceof Error ? err.message : 'Could not read that file.');
            }
          }}
        />
      </div>
      <div className="mono" style={{ ...label, fontSize: 8.5, lineHeight: 1.5 }}>
        {problem ? (
          <span style={{ color: '#ff8fae' }}>{problem}</span>
        ) : syncState === 'error' ? (
          <span style={{ color: '#ffd08a' }}>
            Saved on this device · your other devices are not getting it right now
          </span>
        ) : syncState === 'off' ? (
          persisted
            ? 'Saved on this device · storage protected from cleanup'
            : 'Saved on this device · back up before you travel'
        ) : (
          'Saved on this device and shared with your other devices'
        )}
      </div>
    </div>
  );
}

const backupBtn = {
  flex: 1,
  minHeight: 40,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-neutral-800)',
  background: 'transparent',
  color: 'var(--color-neutral-300)',
  fontSize: 11.5,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
} as const;

const mini = {
  width: 36, height: 36, borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-neutral-700)', background: 'transparent',
  color: 'var(--color-neutral-300)', fontSize: 13, cursor: 'pointer',
} as const;
