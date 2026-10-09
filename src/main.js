import './style.css';
import cfg from './data/site.json';
import { asset, timeOfDay, activeOffers, money, cakePrice, treatsPrice, personalCode, isEmail, checkCode } from './lib.js';

const $ = (s, r = document) => r.querySelector(s);
const cur = cfg.site.currency;
const fmt = (n) => money(Math.round(n * 100) / 100, cur);
const { cakes, treats } = cfg;
const flavorById = (id) => cakes.flavors.find((f) => f.id === id);
const sizeById = (id) => cakes.sizes.find((s) => s.id === id);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
};

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

/* ---------- Theme & hero ---------- */

let slideTimer;
function applyTheme(t) {
  document.documentElement.dataset.time = t;
  $('meta[name="theme-color"]').content = t === 'day' ? '#F9D5DE' : '#2B1C17';
  $('#theme-toggle').textContent = t === 'day' ? '☾' : '☀';
  $('#theme-toggle').title = t === 'day' ? 'Switch to the chocolate evening look' : 'Switch to the vanilla day look';

  const h = cfg.hero[t];
  $('#hero-eyebrow').textContent = h.eyebrow || '';
  $('#hero-title').textContent = h.title;
  $('#hero-subtitle').textContent = h.subtitle;

  const box = $('#hero-slides');
  const tag = $('#hero-tag');
  const slides = (h.slides || []).map(flavorById).filter(Boolean);
  box.replaceChildren(...slides.map((f, i) =>
    el('img', { src: asset(f.image), alt: '', class: i === 0 ? 'on' : null, width: 348, height: 178, fetchpriority: i === 0 ? 'high' : null, loading: i === 0 ? null : 'lazy' })));
  const setTag = (f) => tag.replaceChildren(el('span', {}, f.label), el('small', {}, `from ${fmt(Math.min(...Object.values(f.prices)))}`));
  let i = 0;
  if (slides[0]) setTag(slides[0]);
  clearInterval(slideTimer);
  if (slides.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    slideTimer = setInterval(() => {
      const imgs = box.children;
      imgs[i].classList.remove('on');
      i = (i + 1) % imgs.length;
      imgs[i].classList.add('on');
      setTag(slides[i]);
    }, 4500);
  }
}

function initTheme() {
  const q = new URLSearchParams(location.search).get('theme');
  if (q === 'day' || q === 'evening') session.set('tt-theme', q);
  applyTheme(session.get('tt-theme') || timeOfDay(cfg.hero));
  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.time === 'day' ? 'evening' : 'day';
    session.set('tt-theme', next);
    applyTheme(next);
  });
  // Re-check every few minutes so an open tab moves from day to evening
  setInterval(() => { if (!session.get('tt-theme')) {
    const t = timeOfDay(cfg.hero);
    if (t !== document.documentElement.dataset.time) applyTheme(t);
  } }, 5 * 60 * 1000);
}

/* ---------- Offers & welcome coupon ---------- */

const claimed = () => store.get('tt-claimed', null); // { email, code }

function renderOffers() {
  const list = $('#offers-list');
  const items = activeOffers(cfg.offers).map((o) =>
    el('button', { class: 'offer', type: 'button', onclick: () => applyCodeFromUI(o.code) },
      el('span', { class: 'offer-pct' }, `${o.percent}%`),
      el('span', { class: 'offer-text' }, el('strong', {}, o.label), el('small', {}, `Code ${o.code} · tap to apply · until ${o.end}`))));
  if (cfg.coupon.enabled) {
    const c = claimed();
    items.push(c
      ? el('button', { class: 'offer gift', type: 'button', onclick: () => applyCodeFromUI(c.code) },
          el('span', { class: 'offer-pct' }, '🎁'),
          el('span', { class: 'offer-text' }, el('strong', {}, `Your personal code: ${c.code}`), el('small', {}, `${cfg.coupon.percent}% off, one time only · tap to apply`)))
      : el('button', { class: 'offer gift', type: 'button', onclick: openGate },
          el('span', { class: 'offer-pct' }, `${cfg.coupon.percent}%`),
          el('span', { class: 'offer-text' }, el('strong', {}, 'Welcome gift for you'), el('small', {}, 'Get your personal one-time coupon'))));
  }
  list.replaceChildren(...items);
  $('#offers').hidden = !items.length;
}

const gate = $('#email-gate');
function openGate() {
  $('#gate-percent').textContent = `${cfg.coupon.percent}%`;
  const c = claimed();
  $('#gate-ask').hidden = !!c;
  $('#gate-result').hidden = !c;
  if (c) $('#gate-code').textContent = c.code;
  if (!gate.open) gate.showModal();
}

function initGate() {
  if (!cfg.coupon.enabled) return;
  $('#gate-form').addEventListener('submit', async (e) => {
    const action = e.submitter?.value;
    if (action !== 'ok') { session.set('tt-gate-dismissed', '1'); if (action === 'done') location.hash = '#builder'; return; }
    e.preventDefault();
    const email = new FormData(e.target).get('email').trim();
    if (!isEmail(email)) return toast('Please enter a valid email.');
    const code = await personalCode(email, cfg.coupon);
    store.set('tt-claimed', { email, code });
    $('#order-form').email.value ||= email;
    $('#gate-code').textContent = code;
    $('#gate-ask').hidden = true;
    $('#gate-result').hidden = false;
    renderOffers();
    applyCode(code, true);
  });
  gate.addEventListener('close', () => session.set('tt-gate-dismissed', '1'));
  if (!claimed() && !session.get('tt-gate-dismissed')) {
    setTimeout(() => { if (!document.querySelector('dialog[open]')) openGate(); }, (cfg.coupon.popupDelaySeconds ?? 6) * 1000);
  }
}

/* ---------- Flavor cards ---------- */

function renderFlavorGrid() {
  $('#flavor-grid').replaceChildren(...cakes.flavors.map((f) =>
    el('button', { class: 'flavor-card', type: 'button', onclick: () => { setFlavor(f.id); $('#builder').scrollIntoView({ behavior: 'smooth' }); } },
      el('img', { src: asset(f.image), alt: `${f.label} cake`, loading: 'lazy', width: 348, height: 178 }),
      el('span', { class: 'fc-body' },
        el('strong', {}, f.label),
        el('span', {}, f.description),
        el('em', {}, `from ${fmt(Math.min(...Object.values(f.prices)))}`)))));
}

/* ---------- Builder ---------- */

const defaults = () => ({
  flavor: cakes.flavors[0]?.id,
  size: cakes.sizes[0]?.id,
  extras: Object.fromEntries(cakes.extras.map((g) => [g.id, g.options[0]?.id])),
  message: '',
});
const builder = defaults();

function chip(name, value, checked, onChange, ...content) {
  return el('label', { class: 'chip' },
    el('input', { type: 'radio', name, value, checked, onchange: onChange }),
    el('span', {}, ...content));
}

function renderBuilder() {
  const f = flavorById(builder.flavor);
  $('#opt-flavor').replaceChildren(...cakes.flavors.map((x) =>
    chip('flavor', x.id, x.id === builder.flavor, () => setFlavor(x.id),
      el('img', { src: asset(x.image), alt: '', loading: 'lazy', width: 48, height: 48 }), x.label)));
  $('#opt-size').replaceChildren(...cakes.sizes.map((s) =>
    chip('size', s.id, s.id === builder.size, () => { builder.size = s.id; renderBuilder(); },
      el('b', {}, s.label), el('small', {}, f?.prices?.[s.id] != null ? fmt(f.prices[s.id]) : '–'), s.serves ? el('small', { class: 'muted' }, `serves ${s.serves}`) : null)));
  $('#opt-extras').replaceChildren(...cakes.extras.map((g) =>
    el('fieldset', {}, el('legend', {}, g.label, g.hint ? el('small', {}, ` · ${g.hint}`) : null),
      el('div', { class: 'chips' }, ...g.options.map((o) =>
        chip(`x-${g.id}`, o.id, builder.extras[g.id] === o.id, () => { builder.extras[g.id] = o.id; updatePreview(); },
          o.label, o.price ? el('small', {}, `+${fmt(o.price)}`) : null))))));
  updatePreview();
}

let lastImg;
function updatePreview() {
  const f = flavorById(builder.flavor);
  if (!f) return;
  const img = $('#cake-img');
  if (lastImg !== f.image) {
    lastImg = f.image;
    img.classList.add('swap');
    const next = new Image();
    next.onload = next.onerror = () => { img.src = next.src; img.alt = `${f.label} cake`; requestAnimationFrame(() => img.classList.remove('swap')); };
    next.src = asset(f.image);
  }
  $('#cake-name').textContent = `${f.label} · ${sizeById(builder.size)?.label || ''}`;
  $('#cake-desc').textContent = f.description;
  $('#cake-price').textContent = fmt(cakePrice(cakes, builder));
}

function setFlavor(id) {
  builder.flavor = id;
  renderBuilder();
}

function cakeLine(c) {
  const f = flavorById(c.flavor);
  const parts = cakes.extras.map((g) => {
    const o = g.options.find((x) => x.id === c.extras[g.id]);
    return o && o.id !== g.options[0].id ? (o.price ? `${o.label} (+${fmt(o.price)})` : o.label) : null;
  }).filter(Boolean);
  if (c.message) parts.push(`Message: "${c.message}"`);
  return { title: `${f?.label || c.flavor} cake, ${sizeById(c.size)?.label || c.size}`, detail: parts.join(' · ') };
}

/* ---------- Treats ---------- */

function renderTreats() {
  $('#treats-list').replaceChildren(...treats.map((t) => {
    const q = cart.treats[t.id] || 0;
    return el('li', { class: 'treat' },
      el('span', { class: 'treat-name' }, el('strong', {}, t.label), t.description ? el('small', {}, t.description) : null),
      el('span', { class: 'dots-fill', 'aria-hidden': 'true' }),
      el('span', { class: 'treat-price' }, fmt(t.price)),
      el('span', { class: 'stepper' },
        el('button', { type: 'button', 'aria-label': `One less ${t.label}`, disabled: !q, onclick: () => setTreat(t.id, q - 1) }, '−'),
        el('output', { 'aria-live': 'polite' }, String(q)),
        el('button', { type: 'button', 'aria-label': `One more ${t.label}`, onclick: () => setTreat(t.id, q + 1) }, '+')));
  }));
}

function setTreat(id, q) {
  if (q > 0) cart.treats[id] = Math.min(q, 20); else delete cart.treats[id];
  saveCart();
  renderTreats();
  renderCart();
}

/* ---------- Cart & totals ---------- */

const cart = (() => {
  const c = store.get('tt-cart', { cakes: [], treats: {} });
  // Drop anything no longer on the menu
  c.cakes = (c.cakes || []).filter((x) => flavorById(x.flavor) && sizeById(x.size));
  c.treats = Object.fromEntries(Object.entries(c.treats || {}).filter(([id]) => treats.some((t) => t.id === id)));
  return c;
})();
const saveCart = () => store.set('tt-cart', cart);
let applied = null; // { code, percent, label, kind }

const subtotal = () => cart.cakes.reduce((s, c) => s + cakePrice(cakes, c), 0) + treatsPrice(treats, cart.treats);

function renderCart() {
  const rows = [
    ...cart.cakes.map((c, i) => {
      const { title, detail } = cakeLine(c);
      return el('li', {},
        el('span', {}, el('strong', {}, title), detail ? el('small', {}, detail) : null),
        el('span', { class: 'amt' }, fmt(cakePrice(cakes, c))),
        el('button', { class: 'x', type: 'button', 'aria-label': `Remove ${title}`, onclick: () => { cart.cakes.splice(i, 1); saveCart(); renderCart(); } }, '×'));
    }),
    ...treats.filter((t) => cart.treats[t.id]).map((t) =>
      el('li', {},
        el('span', {}, el('strong', {}, `${cart.treats[t.id]} × ${t.label}`)),
        el('span', { class: 'amt' }, fmt(t.price * cart.treats[t.id])),
        el('button', { class: 'x', type: 'button', 'aria-label': `Remove ${t.label}`, onclick: () => setTreat(t.id, 0) }, '×'))),
  ];
  $('#cart').replaceChildren(...(rows.length ? rows : [el('li', { class: 'empty' }, 'Nothing here yet. Build a cake or add some treats.')]));

  const count = cart.cakes.length + Object.values(cart.treats).reduce((a, b) => a + b, 0);
  $('#cart-count').hidden = !count;
  $('#cart-count').textContent = count;

  const sub = subtotal();
  const disc = applied ? Math.round(sub * applied.percent) / 100 : 0;
  $('#subtotal').textContent = fmt(sub);
  $('#discount').textContent = disc ? `−${fmt(disc)}` : fmt(0);
  $('#total').textContent = fmt(sub - disc);
}

/* ---------- Codes ---------- */

const usedHere = () => store.get('tt-used', []);

async function applyCode(code, quiet) {
  const email = $('#order-form').email.value || claimed()?.email || '';
  const res = await checkCode(cfg, code, email);
  const msg = $('#coupon-msg');
  $('#coupon-input').value = code.toUpperCase();
  if (res.ok && res.kind === 'personal' && usedHere().includes(code.toUpperCase())) {
    Object.assign(res, { ok: false, reason: 'This code has already been used.' });
  }
  if (res.ok) {
    applied = { code: code.toUpperCase(), ...res };
    msg.textContent = `✓ ${res.label}: ${res.percent}% off`;
    msg.className = 'ok';
    if (!quiet) toast(`Code applied: ${res.percent}% off`);
  } else {
    applied = null;
    msg.textContent = res.reason;
    msg.className = 'err';
  }
  renderCart();
  return res.ok;
}

function applyCodeFromUI(code) {
  applyCode(code);
  $('#order').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- Order ---------- */

function orderText(data) {
  const L = [`Hello Munni! I'd like to order from ${cfg.site.name}:`, ''];
  for (const c of cart.cakes) {
    const { title, detail } = cakeLine(c);
    L.push(`🎂 ${title}: ${fmt(cakePrice(cakes, c))}`);
    if (detail) L.push(`   ${detail}`);
  }
  for (const t of treats) if (cart.treats[t.id]) L.push(`🧁 ${cart.treats[t.id]} × ${t.label}: ${fmt(t.price * cart.treats[t.id])}`);
  const sub = subtotal();
  L.push('', `Subtotal: ${fmt(sub)}`);
  if (applied) {
    const d = Math.round(sub * applied.percent) / 100;
    L.push(`Code ${applied.code} (${applied.percent}% off): −${fmt(d)}`, `Total: ${fmt(sub - d)}`);
  } else L.push(`Total: ${fmt(sub)}`);
  L.push('', `Name: ${data.name}`, `Phone: ${data.phone}`, `Email: ${data.email}`, `Pickup: ${data.date} at ${data.pickup}`);
  if (data.notes) L.push(`Notes: ${data.notes}`);
  return L.join('\n');
}

function initOrder() {
  const form = $('#order-form');
  const min = new Date();
  min.setDate(min.getDate() + (cfg.site.minDaysNotice || 0));
  form.date.min = min.toISOString().slice(0, 10);
  $('#pickup-select').replaceChildren(...cfg.site.pickupPoints.map((p) => el('option', {}, p)));
  if (claimed()) form.email.value = claimed().email;
  const saved = store.get('tt-contact', {});
  for (const k of ['name', 'phone', 'email']) if (saved[k] && !form[k].value) form[k].value = saved[k];

  if (!cfg.site.messenger) $('#send-messenger').hidden = true;
  if (!cfg.site.whatsapp) $('#send-whatsapp').hidden = true;
  if (!cfg.site.messenger && cfg.site.whatsapp) $('#send-whatsapp').className = 'btn btn-primary';

  form.email.addEventListener('change', () => { if (applied?.kind === 'personal') applyCode(applied.code, true); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const via = e.submitter?.dataset.via || (cfg.site.messenger ? 'messenger' : 'whatsapp');
    const msg = $('#order-msg');
    if (!cart.cakes.length && !Object.keys(cart.treats).length) {
      msg.textContent = 'Your order is empty. Add a cake or some treats first.';
      return $('#builder').scrollIntoView({ behavior: 'smooth' });
    }
    if (!form.reportValidity()) return;
    if (applied && !(await applyCode(applied.code, true))) {
      msg.textContent = 'Your code is not valid for this order. Remove it or fix the email.';
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    const text = orderText(data);
    store.set('tt-contact', { name: data.name, phone: data.phone, email: data.email });
    navigator.clipboard?.writeText(text).catch(() => {});
    const url = via === 'whatsapp'
      ? `https://wa.me/${cfg.site.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
      : `https://m.me/${cfg.site.messenger}?text=${encodeURIComponent(text)}`;
    const w = window.open(url, '_blank');
    if (w) w.opener = null; else location.href = url;
    if (applied?.kind === 'personal') store.set('tt-used', [...new Set([...usedHere(), applied.code])]);
    msg.textContent = via === 'messenger'
      ? 'Messenger is opening. Your order is also copied, so you can paste it if the message box is empty. Press send to finish.'
      : 'WhatsApp is opening with your order. Press send to finish.';
  });
}

/* ---------- Info & static bits ---------- */

function renderInfo() {
  const s = cfg.site;
  $('#badges').replaceChildren(...(s.badges || []).map((b) => el('li', {}, b)));
  $('#pickup-list').replaceChildren(...s.pickupPoints.map((p) => el('li', {}, p)));
  $('#notes-list').replaceChildren(...(s.badges || []).map((b) => el('li', {}, b)), el('li', {}, 'Extra charge for any customisation'));
  const links = [
    s.facebook && el('a', { href: s.facebook, target: '_blank', rel: 'noopener' }, 'Facebook'),
    s.messenger && el('a', { href: `https://m.me/${s.messenger}`, target: '_blank', rel: 'noopener' }, 'Messenger'),
    s.instagram && el('a', { href: `https://instagram.com/${s.instagram}`, target: '_blank', rel: 'noopener' }, `Instagram @${s.instagram}`),
    s.whatsapp && el('a', { href: `https://wa.me/${s.whatsapp.replace(/\D/g, '')}`, target: '_blank', rel: 'noopener' }, `WhatsApp ${s.whatsapp}`),
    s.location && el('span', {}, `📍 ${s.location}`),
  ].filter(Boolean);
  $('#contact-links').replaceChildren(...links.map((a) => el('li', {}, a)));
  $('#year').textContent = new Date().getFullYear();
  $('#footer-loc').textContent = s.location;
}

/* ---------- Boot ---------- */

initTheme();
renderOffers();
renderFlavorGrid();
renderBuilder();
renderTreats();
renderInfo();
initOrder();
renderCart();
initGate();

$('#builder-form').addEventListener('submit', (e) => {
  e.preventDefault();
  builder.message = $('#opt-message').value.trim();
  cart.cakes.push(structuredClone(builder));
  saveCart();
  renderCart();
  $('#opt-message').value = '';
  toast(`${flavorById(builder.flavor).label} cake added to your order`);
});
$('#coupon-apply').addEventListener('click', () => applyCode($('#coupon-input').value));
$('#coupon-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode(e.target.value); } });

if (claimed() && !usedHere().includes(claimed().code)) applyCode(claimed().code, true);
