export type PersonId = 'conner' | 'anasophia';

export interface Person {
  id: PersonId;
  name: string;
  initial: string;
  /** The outline that marks anything this person touched. */
  color: string;
  glow: string;
}

export const PEOPLE: Record<PersonId, Person> = {
  conner: {
    id: 'conner',
    name: 'Conner',
    initial: 'C',
    color: '#2f6fd0',
    glow: 'rgba(47,111,208,.12)',
  },
  anasophia: {
    id: 'anasophia',
    name: 'Anasophia',
    initial: 'A',
    color: '#cf3f78',
    glow: 'rgba(207,63,120,.12)',
  },
};

export const PERSON_LIST: Person[] = [PEOPLE.conner, PEOPLE.anasophia];

export function isPersonId(v: unknown): v is PersonId {
  return v === 'conner' || v === 'anasophia';
}

/** "4m ago", "2h ago", "Mar 12" — short enough for a badge line. */
export function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  if (s < 604800) return Math.round(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
