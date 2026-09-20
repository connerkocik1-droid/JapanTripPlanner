// Trip content. In production this comes from the backend; here it is the
// seed the planner starts from.

export type LatLng = [number, number];

export interface ItineraryItem {
  time: string;
  title: string;
  note: string;
  cost: number;
}

export interface SeedDay {
  city: string;
  transit?: string;
  items: ItineraryItem[];
}

export interface HotelOption {
  ll: LatLng;
  name: string;
  note: string;
  per: number;
}

export interface TransitOption {
  name: string;
  note: string;
  per: number;
}

export interface EatOption {
  ll: LatLng;
  name: string;
  note: string;
  band: string;
}

export const PARTY = 2;
export const PLANNED = 9800;
export const START = new Date(2027, 2, 21);

export const RATE: Record<string, number> = { Seoul: 1360, Osaka: 152, Kyoto: 152, Tokyo: 152 };
export const CUR: Record<string, string> = { Seoul: '₩', Osaka: '¥', Kyoto: '¥', Tokyo: '¥' };

const day = (city: string, transit: string | undefined, rows: [string, string, string, number][]): SeedDay => ({
  city,
  transit,
  items: rows.map(([time, title, note, cost]) => ({ time, title, note, cost })),
});

export const DAYS: SeedDay[] = [
  day('Seoul', 'AUS → DFW → ICN · 18h 10m', [
    ['06:20', 'Land at Incheon', 'KE 32 · immigration, SIM pickup', 0],
    ['09:00', 'AREX to Myeongdong', 'Express, 43 min', 9],
    ['13:00', 'Check in — Nine Tree Premier', 'Myeongdong · 4 nights', 592],
    ['19:00', 'Gwangjang Market dinner', 'Bindaetteok, mayak gimbap', 24],
  ]),
  day('Seoul', undefined, [
    ['09:30', 'Gyeongbokgung', 'Free in hanbok · guard change 10:00', 12],
    ['13:00', 'Bukchon Hanok Village', 'Quiet lanes, marked route', 0],
    ['16:00', 'Ikseon-dong coffee', 'No reservation needed', 9],
    ['20:00', 'Hongdae night walk', 'Buskers after 21:00', 14],
  ]),
  day('Seoul', undefined, [
    ['10:00', 'Seoul Forest', 'Cherry stand on the north path', 0],
    ['14:00', 'Seongsu coffee crawl', 'Three roasters, walkable', 14],
    ['19:30', 'Korean BBQ — Geumdwaeji', 'Queue by 19:00', 52],
  ]),
  day('Seoul', undefined, [
    ['09:00', 'DMZ half-day tour', 'Passport required · hotel pickup', 88],
    ['18:00', 'Namsan sunset', 'Cable car up, walk down', 11],
    ['21:00', 'Repack for Osaka', 'Laundry done', 0],
  ]),
  day('Osaka', 'GMP → KIX · Peach MM 216 · 1h 45m', [
    ['08:40', 'Flight to Osaka', 'Peach MM 216', 264],
    ['12:30', 'Check in — Namba', 'Hotel Il Cuore · 3 nights', 288],
    ['15:00', 'Kuromon Market', 'Uni, scallops, standing only', 18],
    ['19:00', 'Dotonbori', 'Takoyaki, neon, river walk', 21],
  ]),
  day('Osaka', undefined, [
    ['09:00', 'Osaka Castle', 'Nishinomaru garden for blossoms', 6],
    ['13:00', 'Shinsekai kushikatsu', 'No double dipping', 16],
    ['16:00', 'Umeda Sky Building', 'Floating garden', 14],
    ['20:00', 'Standing bar, Tenma', 'Cash only', 22],
  ]),
  day('Osaka', undefined, [
    ['10:00', 'Nara day trip', 'Kintetsu express, 40 min', 11],
    ['13:00', 'Todai-ji + deer park', 'Crackers outside the gate', 6],
    ['19:00', 'Okonomiyaki — Chibo', 'Counter seat', 20],
  ]),
  day('Kyoto', 'Osaka → Kyoto · JR Special Rapid · 29 min', [
    ['09:10', 'Train to Kyoto', 'JR from Osaka Station', 8],
    ['11:00', 'Check in — ryokan, Gion', 'Yoshi-ima · 3 nights, tatami', 630],
    ['15:00', 'Fushimi Inari', 'Go late, walk past the crowds', 0],
    ['19:00', 'Pontocho dinner', 'Riverside, reserved', 46],
  ]),
  day('Kyoto', undefined, [
    ['07:30', 'Arashiyama bamboo', 'Before 08:00 or not at all', 0],
    ['11:00', 'Tenryu-ji garden', 'Sogenchi pond', 4],
    ['14:00', 'Nishiki Market', 'Lunch in pieces', 15],
    ['17:00', 'Kiyomizu-dera', 'Stay for the lanterns', 4],
  ]),
  day('Kyoto', undefined, [
    ['09:00', "Philosopher's Path", 'Peak bloom window', 0],
    ['12:00', 'Ginkaku-ji', 'Moss garden', 5],
    ['15:00', 'Tea ceremony', 'Booked · 45 min', 42],
    ['19:00', 'Izakaya, Kiyamachi', 'Order by pointing', 30],
  ]),
  day('Tokyo', 'Kyoto → Tokyo · Nozomi 224 · 2h 15m', [
    ['10:20', 'Nozomi to Tokyo', 'Reserved · E seats for Fuji', 184],
    ['13:30', 'Check in — Shibuya', 'Trunk House · 3 nights', 504],
    ['16:00', 'Meiji Jingu', 'Torii walk, then Omotesando', 0],
    ['20:00', 'Yakitori, Nonbei Yokocho', 'Six seats, smoke, perfect', 28],
  ]),
  day('Tokyo', undefined, [
    ['08:00', 'Tsukiji Outer Market', 'Tamagoyaki first', 22],
    ['11:00', 'teamLab Borderless', 'Timed entry 11:00', 34],
    ['15:00', 'Shimokitazawa', 'Vintage, records, no plan', 18],
    ['19:30', 'Sushi counter, Ebisu', 'Omakase · the one splurge', 190],
  ]),
  day('Tokyo', undefined, [
    ['09:00', 'Ueno Park hanami', 'Blanket, konbini haul', 12],
    ['12:00', 'Akihabara', 'Camera parts, arcade floor 4', 0],
    ['16:00', 'Souvenirs — Tokyu Hands', 'Knives, stationery', 60],
    ['19:00', 'Last ramen — Nakiryu', 'Tantanmen, 40 min queue', 14],
  ]),
  day('Tokyo', 'Tokyo → NRT → AUS · 19h 40m', [
    ['07:00', 'Narita Express', 'From Shibuya, 78 min', 18],
    ['11:05', 'NRT → DFW → AUS', 'AA 168 · arrive 20:40', 0],
  ]),
];

export const WEATHER: Record<string, string> = {
  Seoul: '12° / 4° · partly cloudy · blossom starting',
  Osaka: '16° / 8° · clear · near peak bloom',
  Kyoto: '17° / 7° · light rain Wed · peak bloom',
  Tokyo: '18° / 9° · clear · petals falling',
};

export const ADDABLE: Record<string, LatLng> = {
  Busan: [35.1796, 129.0756], Jeju: [33.4996, 126.5312], Gyeongju: [35.8562, 129.2247],
  Fukuoka: [33.5904, 130.4017], Hiroshima: [34.3853, 132.4553], Nara: [34.6851, 135.8048],
  Kanazawa: [36.5613, 136.6562], Hakone: [35.2324, 139.1069], Nikko: [36.7198, 139.6982],
  Sapporo: [43.0618, 141.3545], Takayama: [36.1461, 137.2522], Naoshima: [34.4597, 133.9950],
};

export const PLACE: Record<string, LatLng> = {
  Seoul: [37.5665, 126.9780],
  Osaka: [34.6937, 135.5023],
  Kyoto: [35.0116, 135.7681],
  Tokyo: [35.6762, 139.6503],
  ...ADDABLE,
};

export const AUSTIN: LatLng = [30.2672, -97.7431];

// Osaka and Kyoto are 40 km apart — push their labels apart at trip zoom.
export const LABEL_OFFSET: Record<string, [number, number]> = {
  Seoul: [0, 0], Osaka: [-26, 2], Kyoto: [24, -34], Tokyo: [0, 0],
};

export const HOTELS: Record<string, HotelOption[]> = {
  Seoul: [
    { ll: [37.5636, 126.9835], name: 'Nine Tree Premier', note: 'Myeongdong · 4★, central', per: 148 },
    { ll: [37.5626, 126.9861], name: 'Hotel 28 Myeongdong', note: 'Boutique · quieter block', per: 112 },
    { ll: [37.5563, 126.9236], name: 'Hongdae guesthouse', note: 'Private twin, shared bath', per: 58 },
  ],
  Osaka: [
    { ll: [34.6640, 135.5020], name: 'Hotel Il Cuore', note: 'Namba · above the subway', per: 96 },
    { ll: [34.6698, 135.5027], name: 'Cross Hotel Osaka', note: 'Dotonbori view rooms', per: 164 },
    { ll: [34.7025, 135.4959], name: 'Capsule, Umeda', note: 'Two pods · station side', per: 44 },
  ],
  Kyoto: [
    { ll: [35.0040, 135.7760], name: 'Yoshi-ima ryokan', note: 'Gion · tatami, breakfast', per: 210 },
    { ll: [34.9955, 135.7580], name: 'Hotel Kanra', note: 'Machiya-style, Karasuma', per: 168 },
    { ll: [34.9950, 135.7480], name: 'Machiya guesthouse', note: 'Whole house, 20 min walk', per: 88 },
  ],
  Tokyo: [
    { ll: [35.6995, 139.7380], name: 'Trunk House, Shibuya', note: 'One-room house, Kagurazaka', per: 168 },
    { ll: [35.7110, 139.7960], name: 'Hotel Gracery Asakusa', note: 'River side · quiet nights', per: 124 },
    { ll: [35.6950, 139.7020], name: 'Nine Hours Shinjuku', note: 'Two pods · last night only', per: 52 },
  ],
};

export const TRANSIT: Record<string, { label: string; opts: TransitOption[] }> = {
  Seoul: { label: 'Getting there', opts: [
    { name: 'AA + KE via DFW', note: '18h 10m · 2 stops', per: 1180 },
    { name: 'UA via SFO + NRT', note: '21h · cheapest fare', per: 1040 },
    { name: 'ANA via NRT', note: '17h 40m · best timing', per: 1320 },
  ] },
  Osaka: { label: 'Seoul → Osaka', opts: [
    { name: 'Peach GMP → KIX', note: '1h 45m · 20kg bag', per: 132 },
    { name: 'Korean Air ICN → KIX', note: '1h 40m · full service', per: 198 },
    { name: 'Ferry from Busan', note: 'Overnight · 19h', per: 96 },
  ] },
  Kyoto: { label: 'Osaka → Kyoto', opts: [
    { name: 'JR Special Rapid', note: '29 min · unreserved', per: 4 },
    { name: 'Kintetsu limited express', note: '45 min · reserved seat', per: 11 },
  ] },
  Tokyo: { label: 'Kyoto → Tokyo', opts: [
    { name: 'Nozomi, reserved', note: '2h 15m · E seats for Fuji', per: 92 },
    { name: 'Hikari, unreserved', note: '2h 40m · JR Pass valid', per: 76 },
    { name: 'Night bus', note: '7h 30m · arrive 06:00', per: 32 },
  ] },
};

export const EATS: Record<string, EatOption[]> = {
  Seoul: [
    { ll: [37.5701, 126.9997], name: 'Gwangjang Market', note: 'Bindaetteok · cash, standing', band: '$' },
    { ll: [37.5595, 127.0089], name: 'Geumdwaeji Sikdang', note: 'Pork neck BBQ · queue by 19:00', band: '$$' },
  ],
  Osaka: [
    { ll: [34.6685, 135.5010], name: 'Chibo, Dotonbori', note: 'Okonomiyaki · counter seat', band: '$$' },
    { ll: [34.6520, 135.5060], name: 'Daruma kushikatsu', note: 'Shinsekai · no double dipping', band: '$' },
  ],
  Kyoto: [
    { ll: [35.0055, 135.7710], name: 'Pontocho riverside', note: 'Kaiseki · reserved 19:00', band: '$$$' },
    { ll: [35.0050, 135.7645], name: 'Nishiki Market', note: 'Lunch in pieces, walking', band: '$' },
  ],
  Tokyo: [
    { ll: [35.6595, 139.7010], name: 'Nonbei Yokocho yakitori', note: 'Six seats, smoke, perfect', band: '$$' },
    { ll: [35.6465, 139.7100], name: 'Sushi counter, Ebisu', note: 'Omakase · the one splurge', band: '$$$' },
  ],
};

export const CHECKLIST: [string, string[]][] = [
  ['Before you fly', ['Korea K-ETA approved', 'Japan Visit Web registration', 'Passports valid past Oct 2027', 'Travel insurance bought', 'Card travel notice filed']],
  ['Book + confirm', ['Nozomi seats reserved', 'teamLab timed entry', 'Ryokan deposit paid', 'Tea ceremony confirmed', 'Airport transfer booked']],
  ['Pack', ['Type-A adapters × 2', '20,000 mAh battery', 'Rain shell', 'Two pairs walkable shoes', 'Packing cubes × 4']],
  ['On arrival', ['SIM or eSIM active', 'Suica + T-money loaded', 'Offline maps downloaded', 'Cash withdrawn (¥ and ₩)', 'Hotel addresses saved in Korean/Japanese']],
];

export const FOODS = [
  { label: 'Street', per: 26 },
  { label: 'Mixed', per: 48 },
  { label: 'Splurge', per: 95 },
];
