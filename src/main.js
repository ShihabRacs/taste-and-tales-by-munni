import './style.css';
import cfg from './data/site.json';
import { asset, timeOfDay, activeOffers, money, cakePrice, treatsPrice, personalCode, isEmail, checkCode, earliestPickup } from './lib.js';

const $ = (s, r = document) => r.querySelector(s);
const cur = cfg.site.currency;
const fmt = (n) => (n == null ? 'price on request' : money(Math.round(n * 100) / 100, cur));
const { cakes } = cfg;
const treats = [...(cfg.treats || []), ...(cfg.pastries || [])]; // everything sold by quantity
const flavorById = (id) => cakes.flavors.find((f) => f.id === id);
const sizeById = (id) => cakes.sizes.find((s) => s.id === id);
const gallery = (cfg.gallery || []).filter((p) => !p.hidden);
const photoById = (id) => gallery.find((p) => p.id === id);
const fromPrice = (f) => Math.min(...Object.values(f.prices).filter((v) => v != null));
// Main photo first, then every gallery photo tagged with that flavor
const flavorPhotos = (f) => {
  const main = photoById(f.image);
  return [...(main ? [main] : []), ...gallery.filter((p) => p.flavor === f.id && p !== main)];
};
// How many of the customer's choices a photo shows (frosting, filling, decoration, …)
const matchCount = (p, sel) =>
  Object.entries(p.match || {}).filter(([g, o]) => sel.extras?.[g] === o).length;
// Photos for the current selection: same flavor first, best option match first.
// Untagged photos (e.g. themed cakes) join in when they match a choice.
function photosFor(sel) {
  const f = flavorById(sel.flavor);
  const main = photoById(f?.image);
  return gallery
    .filter((p) => p.flavor === sel.flavor || (!flavorById(p.flavor) && matchCount(p, sel) > 0))
    .map((p) => ({ p, score: matchCount(p, sel) * 2 + (p.flavor === sel.flavor ? 5 : 0) + (p === main ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => ({ ...p, matched: matchCount(p, sel) }));
}

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
  const slides = (h.slides || []).map(photoById).filter(Boolean);
  box.replaceChildren(...slides.map((p, i) =>
    el('img', { src: asset(p.image), alt: p.caption, class: i === 0 ? 'on' : null, width: 960, height: 1200, fetchpriority: i === 0 ? 'high' : null, loading: i === 0 ? null : 'lazy' })));
  const setTag = (p) => {
    const f = flavorById(p.flavor);
    tag.replaceChildren(el('span', {}, p.caption), f ? el('small', {}, `${f.label} from ${fmt(fromPrice(f))}`) : null);
  };
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
      el('span', { class: 'offer-text' }, el('strong', {}, o.label), el('small', {}, `Code ${o.code} · tap to apply`))));
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

const swatch = (f, big) =>
  el('span', { class: `swatch${big ? ' big' : ''}`, style: `--c:${f.color || '#F3E3C8'}` },
    el('span', {}, f.label), el('small', {}, 'Photo coming soon'));

function renderFlavorGrid() {
  $('#flavor-grid').replaceChildren(...cakes.flavors.map((f) => {
    const p = flavorPhotos(f)[0];
    return el('button', { class: 'flavor-card', type: 'button', onclick: () => { setFlavor(f.id); $('#builder').scrollIntoView({ behavior: 'smooth' }); } },
      p ? el('img', { src: asset(p.thumb), alt: `${f.label} cake: ${p.caption}`, loading: 'lazy', width: 480, height: 600 }) : swatch(f),
      el('span', { class: 'fc-body' },
        el('strong', {}, f.label),
        el('span', {}, f.description),
        el('em', {}, `from ${fmt(fromPrice(f))}`)));
  }));
}

/* ---------- Gallery carousel & lightbox ---------- */

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lbIndex = 0;

function renderGallery() {
  const sec = $('#gallery');
  if (!gallery.length) { sec.hidden = true; return; }
  const track = $('#gallery-track');
  track.replaceChildren(...gallery.map((p, i) =>
    el('button', { class: 'slide', type: 'button', onclick: () => openLightbox(i), 'aria-label': `View: ${p.caption}` },
      el('img', { src: asset(p.thumb), alt: p.caption, loading: 'lazy', width: 480, height: 600 }),
      el('span', {}, p.caption))));
  const step = () => track.firstElementChild.getBoundingClientRect().width + 16;
  const go = (dir) => {
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
    const atStart = track.scrollLeft <= 8;
    if (dir > 0 && atEnd) track.scrollTo({ left: 0, behavior: 'smooth' });
    else if (dir < 0 && atStart) track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
    else track.scrollBy({ left: dir * step(), behavior: 'smooth' });
  };
  $('#gal-prev').onclick = () => go(-1);
  $('#gal-next').onclick = () => go(1);
  if (reduceMotion) return;
  let paused = false, visible = false;
  for (const ev of ['pointerenter', 'focusin', 'touchstart']) sec.addEventListener(ev, () => (paused = true), { passive: true });
  for (const ev of ['pointerleave', 'focusout']) sec.addEventListener(ev, () => (paused = false));
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(track);
  setInterval(() => { if (visible && !paused && !document.hidden) go(1); }, 3500);
}

function showLightbox() {
  const p = gallery[lbIndex];
  const img = $('#lb-img');
  img.src = asset(p.image);
  img.alt = p.caption;
  $('#lb-cap').textContent = p.caption;
  $('#lb-count').textContent = `${lbIndex + 1} / ${gallery.length}`;
}
function openLightbox(i) {
  lbIndex = i;
  showLightbox();
  $('#lightbox').showModal();
}
function initLightbox() {
  const lb = $('#lightbox');
  const move = (d) => { lbIndex = (lbIndex + d + gallery.length) % gallery.length; showLightbox(); };
  $('#lb-prev').onclick = () => move(-1);
  $('#lb-next').onclick = () => move(1);
  lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') move(-1); if (e.key === 'ArrowRight') move(1); });
  lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
  let x0 = null;
  lb.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
    x0 = null;
  });
  $('#lb-want').onclick = () => {
    const p = gallery[lbIndex];
    const notes = $('#order-form').notes;
    const line = `Design like: "${p.caption}"`;
    if (!notes.value.includes(line)) notes.value = notes.value ? `${notes.value}\n${line}` : line;
    if (flavorById(p.flavor)) setFlavor(p.flavor);
    lb.close();
    $('#builder').scrollIntoView({ behavior: 'smooth' });
    toast('Design noted in your order. Now pick a size.');
  };
}

/* ---------- Builder ---------- */

const defaults = () => ({
  flavor: cakes.flavors[0]?.id,
  size: cakes.sizes[0]?.id,
  extras: Object.fromEntries(cakes.extras.map((g) => [g.id, g.options[0]?.id])),
  message: '',
});
const builder = defaults();
Object.assign(builder.extras, flavorById(builder.flavor)?.defaults || {});

function chip(name, value, checked, onChange, ...content) {
  return el('label', { class: 'chip' },
    el('input', { type: 'radio', name, value, checked, onchange: onChange }),
    el('span', {}, ...content));
}

function renderBuilder() {
  const f = flavorById(builder.flavor);
  $('#opt-flavor').replaceChildren(...cakes.flavors.map((x) => {
    const p = flavorPhotos(x)[0];
    return chip('flavor', x.id, x.id === builder.flavor, () => setFlavor(x.id),
      p ? el('img', { src: asset(p.thumb), alt: '', loading: 'lazy', width: 48, height: 48 }) : el('i', { class: 'dot', style: `background:${x.color || '#F3E3C8'}` }), x.label);
  }));
  $('#opt-size').replaceChildren(...cakes.sizes.map((s) =>
    chip('size', s.id, s.id === builder.size, () => { builder.size = s.id; renderBuilder(); },
      el('b', {}, s.label), el('small', {}, f?.prices?.[s.id] != null ? fmt(f.prices[s.id]) : 'on request'), s.serves ? el('small', { class: 'muted' }, `≈ ${s.serves} people`) : null)));
  // Groups with showIf (e.g. filling, decoration) only appear under their parent choice;
  // hidden ones fall back to their default so they never add to the price
  const visible = (g) => !(g.hideFor || []).includes(builder.flavor) &&
    (!g.showIf || Object.entries(g.showIf).every(([k, v]) => builder.extras[k] === v));
  for (const g of cakes.extras) if (!visible(g)) builder.extras[g.id] = g.options[0]?.id;
  const hasChildren = (g) => cakes.extras.some((x) => x.showIf && g.id in x.showIf);
  // A flavor can fix a group to one included choice (e.g. red velvet → cream cheese filling)
  const fixed = f?.fixed || {};
  for (const id of Object.keys(fixed)) builder.extras[id] = cakes.extras.find((g) => g.id === id)?.options[0]?.id;
  $('#opt-extras').replaceChildren(...cakes.extras.filter((g) => fixed[g.id] || visible(g)).map((g) => fixed[g.id]
    ? el('fieldset', {}, el('legend', {}, g.label, el('small', {}, ' · included with this cake')),
        el('div', { class: 'chips' }, chip(`x-${g.id}`, 'fixed', true, null, fixed[g.id], el('small', {}, 'included'))))
    : el('fieldset', { class: g.showIf ? 'sub' : null }, el('legend', {}, g.label, g.hint ? el('small', {}, ` · ${g.hint}`) : null),
      el('div', { class: 'chips' }, ...g.options.map((o) =>
        chip(`x-${g.id}`, o.id, builder.extras[g.id] === o.id, () => { builder.extras[g.id] = o.id; hasChildren(g) ? renderBuilder() : updatePreview(); },
          o.label, o.price ? el('small', {}, `${o.from ? 'from ' : ''}+${fmt(o.price)}`) : null))))));
  updatePreview();
}

let shownKey, photoIdx = 0, photos = [];
function showPhoto(i) {
  const f = flavorById(builder.flavor);
  const img = $('#cake-img');
  const multi = photos.length > 1;
  $('#photo-prev').hidden = $('#photo-next').hidden = $('#photo-count').hidden = !multi;
  if (!photos.length) {
    img.hidden = true;
    $('#cake-swatch').replaceChildren(swatch(f, true));
    $('#cake-swatch').hidden = false;
    $('#cake-photo-cap').textContent = '';
    $('#cake-thumbs').replaceChildren();
    return;
  }
  photoIdx = (i + photos.length) % photos.length;
  const p = photos[photoIdx];
  img.hidden = false;
  $('#cake-swatch').hidden = true;
  img.classList.add('swap');
  const next = new Image();
  next.onload = next.onerror = () => { img.src = next.src; img.alt = p.caption; requestAnimationFrame(() => img.classList.remove('swap')); };
  next.src = asset(p.image);
  $('#cake-photo-cap').textContent = p.caption;
  $('#photo-count').textContent = `${photoIdx + 1} / ${photos.length}`;
  $('#cake-thumbs').replaceChildren(...(multi ? photos : []).map((x, j) =>
    el('button', { type: 'button', class: j === photoIdx ? 'on' : null, 'aria-label': x.caption, onclick: () => showPhoto(j) },
      el('img', { src: asset(x.thumb), alt: '', loading: 'lazy', width: 64, height: 80 }))));
}

function updatePreview() {
  const f = flavorById(builder.flavor);
  if (!f) return;
  const ranked = photosFor(builder);
  const key = ranked.map((p) => `${p.id}:${p.matched}`).join();
  if (key !== shownKey) { shownKey = key; photos = ranked; showPhoto(0); }
  $('#cake-name').textContent = `${f.label} · ${sizeById(builder.size)?.label || ''}`;
  $('#cake-desc').textContent = f.description;
  const price = cakePrice(cakes, builder);
  $('#cake-price').textContent = price == null ? 'On request' : (isFromCake(builder) ? 'from ' : '') + fmt(price);
}

// Each flavor can preselect choices (e.g. red velvet → cream cheese frosting)
function applyFlavorDefaults(prevId, id) {
  for (const k of Object.keys(flavorById(prevId)?.defaults || {}))
    builder.extras[k] = cakes.extras.find((g) => g.id === k)?.options[0]?.id;
  Object.assign(builder.extras, flavorById(id)?.defaults || {});
}

function setFlavor(id) {
  applyFlavorDefaults(builder.flavor, id);
  builder.flavor = id;
  renderBuilder();
}

function cakeLine(c) {
  const f = flavorById(c.flavor);
  const parts = cakes.extras.map((g) => {
    const o = g.options.find((x) => x.id === c.extras[g.id]);
    return o && o.id !== g.options[0].id ? (o.price ? `${o.label} (${o.from ? 'from ' : ''}+${fmt(o.price)})` : o.label) : null;
  }).filter(Boolean);
  for (const v of Object.values(f?.fixed || {})) parts.unshift(`${v} (included)`);
  if (c.message) parts.push(`Message: "${c.message}"`);
  return { title: `${f?.label || c.flavor} cake, ${sizeById(c.size)?.label || c.size}`, detail: parts.join(' · ') };
}

/* ---------- Treats ---------- */

function renderTreats() {
  for (const [list, target] of [[cfg.treats || [], '#treats-list'], [cfg.pastries || [], '#pastries-list']]) {
    $(target).closest('section').hidden = !list.length;
    renderMenuList(list, target);
  }
}

function renderMenuList(list, target) {
  $(target).replaceChildren(...list.map((t) => {
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

const subtotal = () => cart.cakes.reduce((s, c) => s + (cakePrice(cakes, c) ?? 0), 0) + treatsPrice(treats, cart.treats);
// Any chosen option with a starting price ("from 3€") makes the total a starting price
const isFromCake = (c) => cakes.extras.some((g) => g.options.find((o) => o.id === c.extras?.[g.id])?.from);
const hasFrom = () => cart.cakes.some(isFromCake);
const hasOnRequest = () => cart.cakes.some((c) => cakePrice(cakes, c) == null);

function renderCart() {
  const rows = [
    ...cart.cakes.map((c, i) => {
      const { title, detail } = cakeLine(c);
      return el('li', {},
        el('span', {}, el('strong', {}, title), detail ? el('small', {}, detail) : null),
        el('span', { class: 'amt' }, (isFromCake(c) ? 'from ' : '') + fmt(cakePrice(cakes, c))),
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
  $('#total').textContent = (hasFrom() ? 'from ' : '') + fmt(sub - disc) + (hasOnRequest() ? ' + price on request' : '');
  $('#final-note').hidden = !hasFrom();
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
    L.push(`🎂 ${title}: ${isFromCake(c) ? 'from ' : ''}${fmt(cakePrice(cakes, c))}`);
    if (detail) L.push(`   ${detail}`);
  }
  for (const t of treats) if (cart.treats[t.id]) L.push(`🧁 ${cart.treats[t.id]} × ${t.label}: ${fmt(t.price * cart.treats[t.id])}`);
  const sub = subtotal();
  L.push('', `Subtotal: ${fmt(sub)}`);
  if (applied) {
    const d = Math.round(sub * applied.percent) / 100;
    L.push(`Code ${applied.code} (${applied.percent}% off): −${fmt(d)}`, `Total: ${hasFrom() ? 'from ' : ''}${fmt(sub - d)}`);
  } else L.push(`Total: ${hasFrom() ? 'from ' : ''}${fmt(sub)}`);
  if (hasOnRequest()) L.push('(plus the cake priced on request)');
  if (hasFrom()) L.push('(starting price, final price to be confirmed by Munni)');
  L.push('', `Name: ${data.name}`, `Phone: ${data.phone}`, `Email: ${data.email}`, `Pickup: ${data.date}, ${data.time} at ${data.pickup}`);
  if (data.notes) L.push(`Notes: ${data.notes}`);
  return L.join('\n');
}

function initOrder() {
  const form = $('#order-form');
  // Earliest pickup: today in Berlin (CET/CEST) + notice days; refreshed in case the tab stays open past midnight
  const setMin = () => (form.date.min = earliestPickup(cfg.site.minDaysNotice));
  setMin();
  form.date.addEventListener('focus', setMin);
  $('#pickup-select').replaceChildren(...cfg.site.pickupPoints.map((p) => el('option', {}, p)));
  // Pickup time slots, e.g. 13:30, 14:00 … until the closing time
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const slots = [];
  for (let m = toMin(cfg.site.pickupFrom || '13:30'); m <= toMin(cfg.site.pickupUntil || '20:00'); m += cfg.site.pickupSlotMinutes || 30)
    slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  $('#time-select').replaceChildren(el('option', { value: '' }, 'Choose a time'), ...slots.map((t) => el('option', {}, t)));
  if (claimed()) form.email.value = claimed().email;
  const saved = store.get('tt-contact', {});
  for (const k of ['name', 'phone', 'email']) if (saved[k] && !form[k].value) form[k].value = saved[k];


  form.date.addEventListener('input', () => form.date.setCustomValidity(''));
  form.email.addEventListener('change', () => { if (applied?.kind === 'personal') applyCode(applied.code, true); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#order-msg');
    if (!cart.cakes.length && !Object.keys(cart.treats).length) {
      msg.textContent = 'Your order is empty. Add a cake or some treats first.';
      return $('#builder').scrollIntoView({ behavior: 'smooth' });
    }
    setMin();
    if (form.date.value && form.date.value < form.date.min) {
      form.date.setCustomValidity(`Please choose ${form.date.min} or later. Orders need ${cfg.site.minDaysNotice} days notice (Berlin time).`);
    } else form.date.setCustomValidity('');
    if (!form.reportValidity()) return;
    if (applied && !(await applyCode(applied.code, true))) {
      msg.textContent = 'Your code is not valid for this order. Remove it or fix the email.';
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    const text = orderText(data);
    store.set('tt-contact', { name: data.name, phone: data.phone, email: data.email });
    navigator.clipboard?.writeText(text).catch(() => {});
    const url = `https://m.me/${cfg.site.messenger}?text=${encodeURIComponent(text)}`;
    const w = window.open(url, '_blank');
    if (w) w.opener = null; else location.href = url;
    if (applied?.kind === 'personal') store.set('tt-used', [...new Set([...usedHere(), applied.code])]);
    msg.textContent = 'Messenger is opening. Your order is also copied, so you can paste it if the message box is empty. Press send to finish.';
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
renderGallery();
initLightbox();
renderBuilder();
$('#photo-prev').onclick = () => showPhoto(photoIdx - 1);
$('#photo-next').onclick = () => showPhoto(photoIdx + 1);
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
