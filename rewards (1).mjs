// UniPoints rules and catalogue, shared by the browser and the server so both
// work out the same balance. Points come from the student's own records.

/** What earns points, and how much. */
export const EARN = {
  verified: 100,
  award: 200,
  attended: 50,
  booked: 10,
  club: 75,
  classPresent: 5,
  classLate: 2,
  task: 15,
  feedback: 40,
  competition: 60,
  result: 200,
  resource: 80,
  quiz: 15,
};

const item = (id, name_en, name_ar, points, icon) => ({ id, name_en, name_ar, points, icon });

/** The campus outlets and what points buy there. Monogram tiles, not official logos; items and prices are illustrative. */
export const OUTLETS = [
  {
    id: 'barns', name_en: "Barn's", name_ar: 'بارنز', kind_en: 'Coffee', kind_ar: 'قهوة', color: '#5a3825', ink: '#fff4e6', mono: 'B', prefix: 'BRN',
    items: [
      item('barns-spanish', 'Iced Spanish latte', 'سبانش لاتيه مثلج', 180, 'iced'),
      item('barns-americano', 'Americano', 'أمريكانو', 120, 'coffee'),
      item('barns-saudi', 'Saudi coffee cup', 'كوب قهوة سعودية', 90, 'tea'),
      item('barns-choc', 'Hot chocolate', 'شوكولاتة ساخنة', 150, 'coffee'),
      item('barns-cookie', 'Chocolate chip cookie', 'كوكيز برقائق الشوكولاتة', 80, 'cookie'),
    ],
  },
  {
    id: 'kaftoon', name_en: 'Kaftoon', name_ar: 'كافتون', kind_en: 'Specialty coffee', kind_ar: 'قهوة مختصة', color: '#0f6b63', ink: '#eafff9', mono: 'K', prefix: 'KFT',
    items: [
      item('kaftoon-flat', 'Flat white', 'فلات وايت', 150, 'coffee'),
      item('kaftoon-v60', 'V60 drip coffee', 'قهوة مقطرة V60', 170, 'coffee'),
      item('kaftoon-karak', 'Iced karak', 'كرك مثلج', 110, 'iced'),
      item('kaftoon-cheesecake', 'Cheesecake slice', 'قطعة تشيز كيك', 200, 'cake'),
    ],
  },
  {
    id: 'key', name_en: 'Key Coffee', name_ar: 'كي كوفي', kind_en: 'Coffee and bakery', kind_ar: 'قهوة ومخبوزات', color: '#1d2433', ink: '#f6d98a', mono: 'KC', prefix: 'KEY',
    items: [
      item('key-cortado', 'Cortado', 'كورتادو', 140, 'coffee'),
      item('key-coldbrew', 'Cold brew', 'كولد برو', 160, 'iced'),
      item('key-matcha', 'Matcha latte', 'ماتشا لاتيه', 190, 'tea'),
      item('key-croissant', 'Butter croissant', 'كرواسون بالزبدة', 110, 'bread'),
    ],
  },
  {
    id: 'gogreek', name_en: 'Go Greek', name_ar: 'جو جريك', kind_en: 'Yogurt and bowls', kind_ar: 'زبادي وأطباق صحية', color: '#1746a2', ink: '#eaf2ff', mono: 'GG', prefix: 'GGK',
    items: [
      item('gogreek-honey', 'Greek yogurt, honey and walnut', 'زبادي يوناني بالعسل والجوز', 220, 'bowl'),
      item('gogreek-acai', 'Açaí bowl', 'طبق أساي', 260, 'bowl'),
      item('gogreek-froyo', 'Frozen yogurt cup', 'كوب زبادي مثلج', 150, 'icecream'),
      item('gogreek-juice', 'Fresh orange juice', 'عصير برتقال طازج', 130, 'juice'),
    ],
  },
  {
    id: 'erleens', name_en: 'Erleens Burger', name_ar: 'إيرلينز برجر', kind_en: 'Burgers', kind_ar: 'برجر', color: '#b3261e', ink: '#fff1ec', mono: 'EB', prefix: 'ERL',
    items: [
      item('erleens-classic', 'Classic beef burger', 'برجر لحم كلاسيك', 320, 'burger'),
      item('erleens-chicken', 'Crispy chicken burger', 'برجر دجاج مقرمش', 300, 'burger'),
      item('erleens-fries', 'Fries', 'بطاطس مقلية', 120, 'meal'),
      item('erleens-combo', 'Burger combo meal', 'وجبة برجر كاملة', 450, 'burger'),
    ],
  },
  {
    id: 'spar', name_en: 'SPAR Supermarket', name_ar: 'سبار سوبرماركت', kind_en: 'Groceries', kind_ar: 'بقالة', color: '#146c3c', ink: '#eefff3', mono: 'S', prefix: 'SPR',
    items: [
      item('spar-water', 'Water bottle', 'قارورة ماء', 40, 'water'),
      item('spar-bar', 'Protein bar', 'لوح بروتين', 70, 'bar'),
      item('spar-sandwich', 'Chicken sandwich', 'ساندويتش دجاج', 180, 'bread'),
      item('spar-notebook', 'A4 notebook', 'دفتر A4', 150, 'notebook'),
      item('spar-voucher', 'SAR 10 basket voucher', 'قسيمة مشتريات 10 ريال', 250, 'voucher'),
    ],
  },
  {
    id: 'dunkin', name_en: "Dunkin' Donuts", name_ar: 'دانكن دونتس', kind_en: 'Donuts and coffee', kind_ar: 'دونات وقهوة', color: '#f0761f', ink: '#3a1404', mono: 'DD', prefix: 'DNK',
    items: [
      item('dunkin-glazed', 'Glazed donut', 'دونات مزججة', 70, 'cookie'),
      item('dunkin-iced', 'Iced coffee', 'قهوة مثلجة', 140, 'iced'),
      item('dunkin-bagel', 'Bagel with cream cheese', 'بيغل بالجبنة الكريمية', 160, 'bread'),
      item('dunkin-box', 'Box of six donuts', 'علبة ست حبات دونات', 380, 'box'),
    ],
  },
];

export function findMenuItem(itemId) {
  for (const outlet of OUTLETS) {
    const hit = outlet.items.find((i) => i.id === itemId);
    if (hit) return { outlet, item: hit };
  }
  return null;
}

/** The backend records the points are worked out from, by name. */
export const RECORD_PATHS = {
  card: '/campus/me/card',
  events: '/campus/events',
  clubs: '/campus/clubs',
  attendance: '/academics/attendance',
  planner: '/academics/planner',
  feedback: '/feedback/mine',
  competitions: '/career/competitions',
  resources: '/campus/resources',
};

/** Every earning, from the student's records. One table drives the ledger on both sides. */
export function deriveEntries(r) {
  const out = [];
  const verifiedEvents = new Set();

  for (const a of r.card?.achievements ?? []) {
    if (a.event_id) verifiedEvents.add(a.event_id);
    const award = a.kind === 'award';
    out.push({ id: `ach:${a.id}`, kind: award ? 'award' : 'verified', title_en: a.title_en, title_ar: a.title_ar, points: award ? EARN.award : EARN.verified, at: a.created_at, link: '/campus/card' });
  }
  for (const e of r.events ?? []) {
    if (e.my_rsvp?.status !== 'going' || verifiedEvents.has(e.id)) continue;
    out.push({ id: `evt:${e.id}`, kind: e.is_past ? 'attended' : 'booked', title_en: e.title_en, title_ar: e.title_ar, points: e.is_past ? EARN.attended : EARN.booked, at: e.start_at, link: `/campus/events/${e.id}` });
  }
  for (const c of r.clubs ?? []) {
    if (c.my_membership?.status !== 'active') continue;
    out.push({ id: `club:${c.id}`, kind: 'club', title_en: c.name_en, title_ar: c.name_ar, points: EARN.club, at: c.my_membership.decided_at, link: `/campus/clubs/${c.id}` });
  }
  for (const c of r.attendance?.courses ?? []) {
    const points = c.counts.present * EARN.classPresent + c.counts.late * EARN.classLate;
    const label = `${c.course_code} · ${c.counts.present + c.counts.late}`;
    if (points > 0) out.push({ id: `att:${c.course_code}`, kind: 'classes', title_en: label, title_ar: label, points, at: r.attendance?.today ?? null, link: '/academics/attendance' });
  }
  for (const it of r.planner?.items ?? []) {
    if (it.done) out.push({ id: `task:${it.id}`, kind: 'task', title_en: it.title, title_ar: it.title, points: EARN.task, at: it.date, link: '/academics/study' });
  }
  for (const f of r.feedback?.responses ?? []) {
    out.push({ id: `fb:${f.id}`, kind: 'feedback', title_en: f.course_code, title_ar: f.course_code, points: EARN.feedback, at: f.created_at, link: '/feedback' });
  }
  for (const c of r.competitions?.items ?? []) {
    if (!c.entry) continue;
    out.push({ id: `comp:${c.id}`, kind: 'competition', title_en: c.title, title_ar: c.title, points: EARN.competition, at: c.starts_at, link: '/competitions' });
    if (c.entry.result) {
      const label = `${c.entry.result} · ${c.title}`;
      out.push({ id: `res:${c.id}`, kind: 'result', title_en: label, title_ar: label, points: EARN.result, at: c.starts_at, link: '/competitions' });
    }
  }
  for (const n of r.resources?.items ?? []) {
    if (n.is_owner && n.status === 'published') out.push({ id: `note:${n.id}`, kind: 'resource', title_en: n.title, title_ar: n.title, points: EARN.resource, at: n.created_at, link: '/campus/resources' });
  }
  return out;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A voucher code from random bytes: the outlet prefix and six unambiguous characters. */
export function voucherCode(prefix, bytes) {
  return `${prefix}-${Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`;
}

/** Pull a voucher code out of whatever a scanner read: a link with ?code=, the old uj:voucher: form, or the code itself. */
export function readVoucherCode(text) {
  const raw = String(text ?? '').trim();
  const fromUrl = /[?&]code=([A-Za-z0-9-]+)/.exec(raw);
  const fromScheme = /^uj:voucher:([A-Za-z0-9-]+)/.exec(raw);
  const code = (fromUrl?.[1] ?? fromScheme?.[1] ?? raw).toUpperCase();
  return /^[A-Z]{3}-[A-Z0-9]{6}$/.test(code) ? code : null;
}
