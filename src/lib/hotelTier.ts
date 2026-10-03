/**
 * The price tier a hotel's name is carrying.
 *
 * Booking sites put the tier in the listing's title — "Hotel Granbell Shinjuku
 * $$" — so that is how it arrives when an option is pasted in, and it has been
 * riding along in the name ever since. Read out loud that reads badly: "back to
 * Hotel Granbell Shinjuku $$" on the day's last line, "Hotel Granbell Shinjuku
 * $$" under a map pin.
 *
 * So the tier is read back out of the name for display and drawn as its own
 * badge, and the name is shown without it. Nothing is stored differently: the
 * name keeps whatever was typed, and the stay editor writes the tier back onto the
 * end of it when it is changed, so a trip opened in an older build is unchanged.
 */

/** "$" through "$$$$", at the end of the name, on its own. */
const TIER = /\s*(\$\$?\$?\$?)\s*$/;

export const TIERS = ['', '$', '$$', '$$$', '$$$$'] as const;
export type Tier = (typeof TIERS)[number];

export interface NamedTier {
  /** The name with the tier taken off, which is what a reader wants. */
  name: string;
  /** "", "$", "$$", "$$$" or "$$$$". */
  tier: Tier;
}

export function splitTier(raw: string): NamedTier {
  const name = (raw ?? '').trim();
  const hit = TIER.exec(name);
  // A name that is nothing but dollar signs is a tier with no name, not a name
  // with no tier — "$$" alone should still read as a tier.
  if (!hit) return { name, tier: '' };
  return { name: name.slice(0, hit.index).trim(), tier: hit[1] as Tier };
}

/** The name as a reader should see it, with any trailing tier taken off. */
export function hotelName(raw: string): string {
  return splitTier(raw).name;
}

/** Put a name and a tier back together, the way the name is stored. */
export function joinTier(name: string, tier: Tier): string {
  const base = name.trim();
  if (!tier) return base;
  return base ? base + ' ' + tier : tier;
}
