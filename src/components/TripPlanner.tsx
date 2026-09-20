'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ADDABLE, LatLng, PARTY, PLACE } from '@/lib/data';
import { derive, dayView } from '@/lib/derive';
import { dateOf, fmtD, fmtUsd } from '@/lib/format';
import { geocode, hitToLatLng } from '@/lib/geocode';
import { useTripStore } from '@/lib/tripState';
import type { MapFocus } from './TripMap';
import { PEOPLE, PERSON_LIST } from '@/lib/people';
import CityPanel from './CityPanel';
import Login from './Login';
import NotesTab from './NotesTab';
import TouchMark, { touchStyle } from './TouchMark';
import DaysTab from './DaysTab';
import ChecklistTab from './ChecklistTab';
import PrintSheet from './PrintSheet';

// MapLibre touches window on import — keep it off the server render.
const TripMap = dynamic(() => import('./TripMap'), { ssr: false });

type Tab = 'map' | 'days' | 'list' | 'notes';

const SEG_FILL: Record<string, string> = {
  Lodging: 'var(--color-accent-400)',
  Transit: 'var(--color-accent-600)',
  Food: 'var(--color-accent-800)',
};

export default function TripPlanner() {
  const store = useTripStore();
  const { doc, order } = store;

  const [tab, setTab] = useState<Tab>('map');
  const [city, setCity] = useState(order[0] ?? 'Seoul');
  const [day, setDay] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [snap, setSnap] = useState(0);
  const [dragH, setDragH] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCity, setNewCity] = useState('');
  const [tick, setTick] = useState(0);
  const shell = useRef<HTMLDivElement | null>(null);
  const dragMoved = useRef(false);
  const focusNonce = useRef(0);

  const d = useMemo(() => derive(doc, order), [doc, order]);
  const places = useMemo<Record<string, LatLng>>(() => ({ ...PLACE, ...doc.coords }), [doc.coords]);

  // Keep the selection valid when cities are removed or reordered.
  useEffect(() => {
    if (order.length && !order.includes(city)) setCity(order[0]);
  }, [order, city]);
  useEffect(() => {
    if (day > d.schedule.length) setDay(Math.max(1, d.schedule.length));
  }, [d.schedule.length, day]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, []);

  const snapPx = useCallback(
    (i: number) => {
      const h = shell.current?.clientHeight ?? 874;
      return [238, Math.round(h * 0.56), Math.round(h * 0.88)][i];
    },
    [],
  );

  const sheetH = dragH ?? (tab === 'map' ? snapPx(expanded ? snap : 0) : snapPx(2));

  const zoomTo = useCallback((ll: LatLng, zoom: number) => {
    focusNonce.current += 1;
    setFocus({ ll, zoom, nonce: focusNonce.current });
  }, []);

  const selectCity = useCallback(
    (c: string) => {
      const same = c === city && expanded;
      setCity(c);
      setExpanded(!same);
      if (snap === 0) setSnap(1);
      const ll = places[c];
      if (!same && ll) zoomTo(ll, 13.2);
      if (same) setFocus(null);
    },
    [city, expanded, snap, places, zoomTo],
  );

  const onDragStart = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startH = sheetH;
    setDragging(true);
    setDragH(startH);
    const move = (ev: PointerEvent) => {
      setDragH(Math.min(snapPx(2), Math.max(150, startH - (ev.clientY - startY))));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const h = Math.min(snapPx(2), Math.max(150, startH - (ev.clientY - startY)));
      let best = 0;
      let dist = Infinity;
      [0, 1, 2].forEach((i) => {
        const dd = Math.abs(snapPx(i) - h);
        if (dd < dist) {
          dist = dd;
          best = i;
        }
      });
      const moved = Math.abs(ev.clientY - startY) > 6;
      dragMoved.current = moved;
      setDragging(false);
      setDragH(null);
      setSnap(best);
      if (moved) setExpanded(best > 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const toggleSheet = () => {
    // A drag of more than 6px already changed the snap — don't also toggle.
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    setSnap((s) => (s === 0 ? 1 : 0));
    setExpanded((x) => (snap === 0 ? true : x && false));
  };

  const addCity = async (name: string) => {
    const c = name.trim();
    if (!c || order.includes(c)) return;
    store.setOrder([...order, c]);
    setCity(c);
    setExpanded(true);
    setAdding(false);
    setNewCity('');
    if (!places[c]) {
      // A typed city only earns a pin once it has real coordinates.
      const hit = await geocode(c);
      if (hit) store.setCoords(c, hitToLatLng(hit));
    }
  };

  const moveCity = (c: string, dir: number) => {
    const o = order.slice();
    const i = o.indexOf(c);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= o.length) return;
    o.splice(j, 0, o.splice(i, 1)[0]);
    store.setOrder(o);
  };

  const removeCity = (c: string) => {
    const o = order.filter((x) => x !== c);
    if (!o.length) return;
    store.setOrder(o);
  };

  const subs = useMemo(() => {
    const out: Record<string, string> = {};
    order.forEach((c) => {
      const n = d.meta[c].count;
      out[c] = n + (n === 1 ? ' night' : ' nights');
    });
    return out;
  }, [order, d.meta]);

  const tickers = [
    `${order.length} legs · ${d.schedule.length} days · ${PARTY} pax`,
    d.segments.map((s) => `${s.label} ${s.amount}`).join(' · '),
    '₩1,360 / $1 · ¥152 / $1',
    'Bloom window: Mar 28 – Apr 5',
    `Checklist ${d.checkedCount}/${d.checkTotal} done`,
  ];

  /** The most recent edit anyone made inside a city, for its row outline. */
  const cityTouch = useMemo(() => {
    const out: Record<string, { by: 'conner' | 'anasophia'; at: number }> = {};
    Object.entries(doc.touches).forEach(([path, t]) => {
      const c = path.split('/')[0];
      if (!out[c] || t.at > out[c].at) out[c] = t;
    });
    return out;
  }, [doc.touches]);

  const openNotes = doc.comments.filter((c) => !c.resolved).length;
  const cityNotes = useMemo(() => {
    const out: Record<string, number> = {};
    doc.comments.forEach((c) => {
      if (c.city && !c.resolved) out[c.city] = (out[c.city] ?? 0) + 1;
    });
    return out;
  }, [doc.comments]);

  const view = dayView(d, doc, Math.min(Math.max(1, day), Math.max(1, d.schedule.length)) - 1);
  const dayChips = d.schedule.map((_, i) => ({ n: i + 1, dow: dayView(d, doc, i).dow }));

  // Storage hasn't been read yet — render the shell empty so the server and
  // client markup agree, then the login screen decides.
  if (!store.ready) return <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg)' }} />;
  if (!store.user) return <Login onPick={store.signIn} />;

  const me = PEOPLE[store.user];

  return (
    <div
      ref={shell}
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--color-bg)' }}
    >
      <TripMap
        order={order}
        places={places}
        selected={city}
        subs={subs}
        sheetPx={sheetH}
        focus={focus}
        onSelect={selectCity}
      />

      {/* Header */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
          padding: '54px 16px 14px', pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(16,18,32,.94) 0%, rgba(16,18,32,.72) 62%, transparent 100%)',
        }}
      >
        <div
          className="mono"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, color: 'var(--color-accent-300)' }}
        >
          <span
            style={{
              width: 5, height: 5, borderRadius: 9999,
              background: 'var(--color-accent-400)', animation: 'blip 2.2s ease-in-out infinite',
            }}
          />
          Itinerary live · {PARTY} travelers
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, marginTop: 4, pointerEvents: 'auto',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.15 }}>Korea + Japan</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {PERSON_LIST.map((p) => {
              const on = p.id === me.id;
              return (
                <button
                  key={p.id}
                  className="tap"
                  onClick={() => store.signIn(p.id)}
                  aria-label={'Switch to ' + p.name}
                  aria-pressed={on}
                  title={on ? p.name + ' (you)' : 'Switch to ' + p.name}
                  style={{
                    width: 32, height: 32, borderRadius: 9999, cursor: 'pointer',
                    border: '1.5px solid ' + (on ? p.color : 'var(--color-neutral-800)'),
                    background: on ? p.glow : 'transparent',
                    color: on ? p.color : 'var(--color-neutral-600)',
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  {p.initial}
                </button>
              );
            })}
          </div>
        </div>
        <div
          className="mono"
          style={{ fontSize: 9.5, color: 'var(--color-neutral-400)', marginTop: 5, whiteSpace: 'nowrap' }}
        >
          {d.tripRange} / {d.tripLength} / T−{d.countdown}d
        </div>

        {/* Total budget */}
        <div
          style={{
            marginTop: 12, padding: '11px 13px', pointerEvents: 'auto',
            background: 'rgba(35,37,50,.92)', border: '1px solid var(--color-neutral-800)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)' }}>Total budget</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>{d.vsPlanned}</div>
          </div>
          <div
            key={d.grand}
            className="num"
            style={{ fontSize: 25, fontWeight: 600, animation: 'countUp .28s ease both' }}
          >
            {fmtUsd(d.grand)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{d.totalNote}</div>
          <div
            style={{
              display: 'flex', height: 5, borderRadius: 9999, overflow: 'hidden',
              background: 'var(--color-neutral-900)', margin: '9px 0 7px',
            }}
          >
            {d.segments.map((s) => (
              <div key={s.label} style={{ width: s.pct, background: SEG_FILL[s.label] }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {d.segments.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: SEG_FILL[s.label] }} />
                <span className="mono" style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>
                  {s.label} {s.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom sheet */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 8,
          height: sheetH, display: 'flex', flexDirection: 'column',
          background: 'rgba(27,30,46,.97)', backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--color-neutral-700)', borderRadius: '14px 14px 0 0',
          boxShadow: '0 -12px 40px rgba(0,0,0,.5)',
          transition: dragging ? 'none' : 'height .34s cubic-bezier(.22,1.1,.3,1)',
        }}
      >
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background:
              'linear-gradient(90deg, transparent, var(--color-accent-700) 22%, var(--color-accent-500) 50%, var(--color-accent-700) 78%, transparent)',
          }}
        />
        <div
          onPointerDown={onDragStart}
          onClick={toggleSheet}
          style={{ cursor: 'grab', touchAction: 'none', padding: '11px 16px 10px', flex: 'none' }}
        >
          <div
            style={{
              width: 40, height: 5, borderRadius: 9999, margin: '0 auto 10px',
              background: dragging ? 'var(--color-accent-400)' : 'var(--color-neutral-700)',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {tab === 'map' ? 'Route' : tab === 'days' ? 'Days' : tab === 'list' ? 'Checklist' : 'Notes'}
            </div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
              {tab === 'map'
                ? 'Tap a city to plan it'
                : tab === 'days'
                  ? `Day ${view.nn} of ${d.schedule.length}`
                  : tab === 'list'
                    ? `${d.checkedCount}/${d.checkTotal}`
                    : `${openNotes} open`}
            </div>
          </div>
          <div
            key={tick}
            className="mono"
            style={{ fontSize: 9, color: 'var(--color-accent-300)', marginTop: 6, animation: 'ticker 4s ease both' }}
          >
            {tickers[tick % tickers.length]}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 11px 96px' }}>
          {tab === 'map' ? (
            <>
              {order.map((c, i) => {
                const open = city === c && expanded;
                const m = d.meta[c];
                return (
                  <div key={c} style={{ marginBottom: 7 }}>
                    <button
                      className="tap"
                      onClick={() => selectCity(c)}
                      style={{
                        width: '100%', minHeight: 56, padding: 14, textAlign: 'left',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid ' + (open ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
                        background: open ? 'rgba(145,132,217,.10)' : 'var(--color-surface)',
                        ...(touchStyle(cityTouch[c]) ?? {}),
                        color: 'inherit', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12,
                        animation: 'riseIn .34s ease both', animationDelay: i * 60 + 'ms',
                      }}
                    >
                      <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{c}</span>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
                        {fmtD(dateOf(m.start))} – {fmtD(dateOf(m.start + m.count - 1))}
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span className="num" style={{ fontSize: 12 }}>{fmtUsd(d.picked[c].total)}</span>
                        <TouchMark touch={cityTouch[c]} align="right" />
                      </span>
                      {cityNotes[c] ? (
                        <span
                          className="mono"
                          style={{
                            fontSize: 8.5, color: 'var(--color-accent-300)',
                            border: '1px solid var(--color-accent-700)', borderRadius: 9999,
                            padding: '2px 6px', flex: 'none',
                          }}
                        >
                          {cityNotes[c]} note{cityNotes[c] > 1 ? 's' : ''}
                        </span>
                      ) : null}
                      <i
                        className={open ? 'ph ph-caret-up' : 'ph ph-caret-down'}
                        style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}
                      />
                    </button>

                    {open ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                          <IconBtn icon="ph-arrow-up" label={`Move ${c} earlier`} onClick={() => moveCity(c, -1)} />
                          <IconBtn icon="ph-arrow-down" label={`Move ${c} later`} onClick={() => moveCity(c, 1)} />
                          <IconBtn icon="ph-trash" label={`Remove ${c}`} onClick={() => removeCity(c)} />
                        </div>
                        <CityPanel
                          city={c}
                          cfg={m.cfg}
                          subtotal={d.picked[c].total}
                          onNights={(n) => store.setCfg(c, 'nights', n)}
                          onHotelSel={(idx) => store.setCfg(c, 'hotelSel', idx)}
                          onHotelField={(idx, key, val) => store.setHotel(c, idx, key, val)}
                          onCfgField={(key, val) => store.setCfg(c, key, val as never)}
                          onZoom={zoomTo}
                          touch={(suffix) => store.touch(`${c}/${suffix}`)}
                        />
                      </>
                    ) : null}
                  </div>
                );
              })}

              {adding ? (
                <div
                  style={{
                    padding: 11, borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-neutral-800)', background: 'var(--color-surface)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      autoFocus
                      value={newCity}
                      placeholder="City name"
                      onChange={(e) => setNewCity(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addCity(newCity);
                      }}
                      style={{
                        flex: 1, minWidth: 0, minHeight: 44, fontSize: 13,
                        borderBottom: '1px solid var(--color-neutral-700)',
                      }}
                    />
                    <button
                      className="tap"
                      onClick={() => void addCity(newCity)}
                      style={{
                        flex: 'none', minHeight: 44, padding: '0 15px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-accent-500)', background: 'transparent',
                        color: 'var(--color-accent-200)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      Add
                    </button>
                  </div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)', margin: '10px 0 7px' }}>
                    Suggested stops
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.keys(ADDABLE)
                      .filter((k) => !order.includes(k))
                      .slice(0, 8)
                      .map((k) => (
                        <button
                          key={k}
                          className="tap"
                          onClick={() => void addCity(k)}
                          style={{
                            minHeight: 36, padding: '0 12px', borderRadius: 9999,
                            border: '1px solid var(--color-neutral-700)', background: 'transparent',
                            color: 'var(--color-neutral-300)', fontSize: 11.5, cursor: 'pointer',
                          }}
                        >
                          {k}
                        </button>
                      ))}
                  </div>
                  <button
                    className="tap"
                    onClick={() => {
                      setAdding(false);
                      setNewCity('');
                    }}
                    style={{
                      width: '100%', marginTop: 10, minHeight: 40, borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-neutral-800)', background: 'transparent',
                      color: 'var(--color-neutral-500)', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="tap"
                  onClick={() => setAdding(true)}
                  style={{
                    width: '100%', minHeight: 48, borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--color-neutral-700)', background: 'transparent',
                    color: 'var(--color-accent-200)', fontSize: 12.5, fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    cursor: 'pointer',
                  }}
                >
                  <i className="ph ph-plus" style={{ fontSize: 14 }} />
                  Add a city
                </button>
              )}
            </>
          ) : null}

          {tab === 'days' ? (
            <DaysTab
              days={dayChips}
              selected={view.n}
              view={view}
              onSelectDay={(n) => {
                setDay(n);
                const c = d.schedule[n - 1]?.city;
                if (c) setCity(c);
              }}
              onToggleItem={store.toggleDone}
            />
          ) : null}

          {tab === 'notes' ? (
            <NotesTab
              comments={doc.comments}
              cities={order}
              current={city}
              onAdd={store.addComment}
              onToggle={store.toggleComment}
              onRemove={store.removeComment}
            />
          ) : null}

          {tab === 'list' ? (
            <ChecklistTab
              checked={doc.checked}
              count={d.checkedCount}
              total={d.checkTotal}
              onToggle={store.toggleChecked}
              onPrint={() => window.print()}
            />
          ) : null}
        </div>
      </div>

      {/* Tab pill */}
      <div
        style={{
          position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)',
          zIndex: 12, display: 'flex', gap: 3, padding: 3, borderRadius: 9999,
          background: 'rgba(35,37,50,.94)', border: '1px solid var(--color-neutral-800)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {([
          ['map', 'Map', 'ph-map-trifold'],
          ['days', 'Days', 'ph-calendar-blank'],
          ['list', 'Checklist', 'ph-check-square'],
          ['notes', 'Notes', 'ph-chat-teardrop-text'],
        ] as [Tab, string, string][]).map(([id, label, icon]) => {
          const on = tab === id;
          return (
            <button
              key={id}
              className="tap"
              onClick={() => {
                setTab(id);
                if (id !== 'map') setFocus(null);
              }}
              style={{
                minHeight: 44, padding: '0 12px', borderRadius: 9999, border: 'none',
                background: on ? 'var(--color-accent-800)' : 'transparent',
                color: on ? 'var(--color-accent-100)' : 'var(--color-neutral-400)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <i className={'ph ' + icon} style={{ fontSize: 14 }} />
              {label}
            </button>
          );
        })}
      </div>

      <PrintSheet d={d} doc={doc} />
    </div>
  );
}

function IconBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      className="tap"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 44, height: 44, borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-neutral-800)', background: 'transparent',
        color: 'var(--color-neutral-500)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <i className={'ph ' + icon} style={{ fontSize: 12 }} />
    </button>
  );
}
