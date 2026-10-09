export const asset = (p) => (p && /^(https?:|data:)/.test(p) ? p : import.meta.env.BASE_URL + (p || '').replace(/^\//, ''));

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};
const nowMin = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

// Handles windows that cross midnight (e.g. 22:00 - 02:00)
export function inWindow(start, end, d = new Date()) {
  const s = toMin(start), e = toMin(end), n = nowMin(d);
  return s <= e ? n >= s && n < e : n >= s || n < e;
}

export const timeOfDay = (hero, d = new Date()) =>
  inWindow(hero.dayStartsAt, hero.eveningStartsAt, d) ? 'day' : 'evening';

export const activeOffers = (offers, d = new Date()) =>
  (offers || []).filter((o) => o.active && inWindow(o.start, o.end, d));

export const money = (n, currency = '€') => `${Number.isInteger(n) ? n : n.toFixed(2)}${currency}`;

// cake: { flavor, size, extras: { groupId: optionId } } | null
export function cakePrice(cakes, cake) {
  if (!cake) return 0;
  const flavor = cakes.flavors.find((f) => f.id === cake.flavor);
  const base = flavor?.prices?.[cake.size];
  if (base == null) return null; // price on request
  let total = Number(base);
  for (const g of cakes.extras) {
    const opt = g.options.find((o) => o.id === cake.extras?.[g.id]);
    total += Number(opt?.price) || 0;
  }
  return total;
}

export const treatsPrice = (treats, qty) =>
  treats.reduce((sum, t) => sum + (Number(t.price) || 0) * (qty[t.id] || 0), 0);

// Deterministic personal code: the same email always gets the same code,
// so it can be re-checked later without storing anything.
export async function personalCode(email, { prefix, salt }) {
  const data = new TextEncoder().encode(`${salt}|${email.trim().toLowerCase()}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[hash[i] % alphabet.length];
  return `${prefix}-${out}`;
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');

const norm = (c) => String(c || '').trim().toUpperCase();

// Returns { ok, percent, label, kind } or { ok: false, reason }
export async function checkCode(cfg, code, email, d = new Date()) {
  code = norm(code);
  if (!code) return { ok: false, reason: 'Enter a code.' };
  const offer = (cfg.offers || []).find((o) => norm(o.code) === code);
  if (offer) {
    if (!offer.active) return { ok: false, reason: 'This offer has ended.' };
    if (!inWindow(offer.start, offer.end, d))
      return { ok: false, reason: `This code works between ${offer.start} and ${offer.end}.` };
    return { ok: true, percent: offer.percent, label: offer.label, kind: 'offer' };
  }
  const c = cfg.coupon;
  if (c?.enabled && code.startsWith(norm(c.prefix) + '-')) {
    if ((c.redeemed || []).map(norm).includes(code)) return { ok: false, reason: 'This code has already been used.' };
    if (!isEmail(email)) return { ok: false, reason: 'Enter the email this code was sent for.' };
    if ((await personalCode(email, c)) !== code) return { ok: false, reason: "This code doesn't match that email." };
    return { ok: true, percent: c.percent, label: 'Personal welcome coupon (one-time)', kind: 'personal' };
  }
  return { ok: false, reason: 'Unknown code.' };
}

// Calendar dates in Berlin time. Europe/Berlin switches between CET and CEST
// (daylight saving) automatically, whatever the visitor's own time zone is.
export const BUSINESS_TZ = 'Europe/Berlin';
export const todayIn = (tz = BUSINESS_TZ, d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
// Adds whole calendar days to a YYYY-MM-DD date (UTC arithmetic, so no DST gaps)
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const earliestPickup = (days, d = new Date()) => addDays(todayIn(BUSINESS_TZ, d), days || 0);
