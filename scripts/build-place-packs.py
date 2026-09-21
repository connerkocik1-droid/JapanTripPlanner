#!/usr/bin/env python3
"""Turn the shortlist CSVs in `data/` into the place packs in `public/places/`.

The CSVs are what the travelers actually compiled, one row per place, with the
address written the way a listing writes it: a floor, a building, a district
gloss in brackets. None of that helps a geocoder, so this script splits each
address into the part a gazetteer can match and the part worth reading on the
card, and leaves the coordinates to the app — which resolves them through the
same `/api/geocode` every other pin in the app goes through, and says out loud
when a pin only matched a road or a district.

Run it after editing a CSV:

    python3 scripts/build-place-packs.py
"""

import csv
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
OUT = ROOT / 'public' / 'places'

# A floor on its own, or a floor bolted to a building name.
FLOOR = re.compile(r'^(B\d|\d+F(?:-\d+F)?|Lobby Fl\.?)$', re.I)
BLDG = re.compile(r'(Bldg\.?|Tower|Center|Centre|Hall|UNESCO House|Conrad Seoul)', re.I)
PAREN_FLOOR = re.compile(r'\s*\((B\d|\d+F(?:-\d+F)?)\)')
UNSURE = re.compile(
    r'\s*[-–]?\s*(exact street number unconfirmed|mountain - no single street address)\s*\.?',
    re.I,
)
PREFIX = re.compile(r'^(Trail entrance|Address)\s*:\s*', re.I)

# Places that are a mountain, a river park or a warren of alleys rather than a
# door. Each is pinned where you would actually start, and the reason rides
# along in the note so the map never claims more precision than it has.
PIN_AT = {
    'Ikseon-dong Hanok Street': (
        'Donhwamun-ro, Jongno-gu, Seoul',
        'pinned on Donhwamun-ro, the street the alleys run off',
    ),
    'Bukhansan National Park': (
        'Ui-dong, Gangbuk-gu, Seoul',
        'pinned at the Ui-dong trailhead; the park spans several districts',
    ),
    'Dobongsan Mountain': (
        'Dobongsan Station, Dobong-gu, Seoul',
        'pinned at Dobongsan Station, where the trails start',
    ),
    'Gwanaksan Mountain': (
        'Gwanaksan, Gwanak-gu, Seoul',
        'pinned on the mountain itself; trailheads ring it',
    ),
    'Haneul Park (Sky Park)': (
        'World Cup Park, Sangam-dong, Mapo-gu, Seoul',
        'pinned at World Cup Park, below the stairs up',
    ),
    'Yeouido Hangang Park': (
        'Yeouido-dong, Yeongdeungpo-gu, Seoul',
        'pinned on Yeouido; the park runs the length of the riverbank',
    ),
}


def split_addr(raw):
    """A street address a gazetteer can match, plus the detail worth reading."""
    detail, gloss = [], []
    raw = PREFIX.sub('', UNSURE.sub('', raw.strip()).strip(' ,-'))
    m = PAREN_FLOOR.search(raw)
    if m:
        detail.append(m.group(1))
        raw = PAREN_FLOOR.sub('', raw)
    # "(Hannam-dong)" hung off a district is a neighbourhood gloss, not part of
    # the postal address, and it stops the geocoder matching the road.
    gloss += re.findall(r'\(([^)]+)\)', raw)
    raw = re.sub(r'\s*\([^)]*\)', '', raw)
    keep = []
    for part in (s.strip() for s in raw.split(',')):
        if not part:
            continue
        if FLOOR.match(part) or BLDG.search(part):
            detail.append(part)
        else:
            keep.append(part)
    return ', '.join(keep), detail, [g for g in gloss if not FLOOR.match(g)]


def review_note(raw):
    """The review column, cut down to what is worth a line on the card."""
    text = raw.strip()
    if not text:
        return ''
    count = re.search(r'\b([\d,]+) reviews', text)
    small = 'small sample' in text.lower()
    if count:
        return f'{count.group(1)} reviews' + (', small sample' if small else '')
    if 'unconfirmed' in text.lower() or 'not independently re-confirmed' in text.lower():
        return 'address unconfirmed'
    if 'tripadvisor rating' in text.lower():
        return 'TripAdvisor rating'
    if 'cited by blog' in text.lower():
        return 'rating cited secondhand'
    return text


def stars(raw):
    value = float(raw)
    return f'{value:.1f}★' if value else ''


def build(csv_name, kind, pack_id, name, city, summary, source):
    places = []
    with open(DATA / csv_name, encoding='utf-8-sig') as fh:
        for row in csv.DictReader(fh):
            title = row['Name'].strip()
            if not title:
                continue
            raw_addr = row['Address']
            override = PIN_AT.get(title)
            addr, detail, gloss = split_addr(override[0] if override else raw_addr)
            hood = row['Neighborhood'].strip()
            gloss = [g for g in gloss if g.lower() not in hood.lower()]
            raw_notes = row['Notes / Review Count']
            caveats = [review_note(raw_notes)]
            # The caveat matters even when the row also carries a review count:
            # an address nobody has confirmed is the thing to check before going.
            said = (raw_notes + ' ' + raw_addr).lower()
            # Said differently in different rows; all of it means "check this".
            unsure = any(
                phrase in said
                for phrase in ('unconfirmed', 'not independently re-confirmed', 'not shown on')
            )
            if unsure and 'unconfirmed' not in caveats[0]:
                caveats.append('address unconfirmed')
            if 'unclear' in said:
                caveats.append('rating source unclear')
            if override:
                caveats.append(override[1])
            bits = [
                row.get('Cuisine', row.get('Category', '')).strip(),
                hood, *detail, *gloss, *caveats,
            ]
            places.append({
                'name': title,
                'korean': row['Korean Name'].strip(),
                'addr': addr,
                'kind': kind,
                'band': stars(row['Rating (out of 5)']),
                'note': ' · '.join(b for b in bits if b),
                'url': row['Google Maps Link'].strip(),
            })

    pack = {
        'id': pack_id,
        'name': name,
        'city': city,
        'summary': summary.format(n=len(places)),
        'source': source,
        'places': places,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f'{pack_id}.json').write_text(
        json.dumps(pack, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    return {
        'id': pack_id, 'name': name, 'city': city,
        'summary': pack['summary'], 'file': f'{pack_id}.json', 'count': len(places),
    }


PACKS = [
    dict(
        csv_name='seoul_restaurants_4.5plus.csv', kind='eat', pack_id='seoul-restaurants-45',
        name='Seoul restaurants, 4.5★ and up', city='Seoul',
        summary='{n} places rated 4.5 or better on Google Maps and TripAdvisor.',
        source='Compiled from Google Maps and TripAdvisor ratings, September 2026.',
    ),
    dict(
        csv_name='seoul_activities_4.5plus.csv', kind='do', pack_id='seoul-activities-45',
        name='Seoul activities, 4.5★ and up', city='Seoul',
        summary='{n} museums, temples, parks and experiences rated 4.5 or better.',
        source='Compiled from TripAdvisor and Google Maps ratings, September 2026.',
    ),
]

if __name__ == '__main__':
    listings = [build(**spec) for spec in PACKS]
    (OUT / 'index.json').write_text(
        json.dumps({'packs': listings}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    for listing in listings:
        print(f"{listing['count']:3} places → public/places/{listing['file']}")
