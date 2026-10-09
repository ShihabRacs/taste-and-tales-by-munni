import './admin.css';
import { personalCode } from './lib.js';

const CONFIG_PATH = 'src/data/site.json';
const IMAGE_DIR = 'public/images/gallery';
const $ = (s, r = document) => r.querySelector(s);

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

/* ---------- GitHub API ---------- */

const gh = { repo: '', branch: 'main', token: '' };

async function api(path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${gh.repo}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${gh.token}`, Accept: 'application/vnd.github+json', ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`${res.status} ${body.message || res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

const b64ToText = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function getFile(path) {
  return api(`/contents/${path}?ref=${encodeURIComponent(gh.branch)}`);
}
async function putFile(path, b64, message, sha) {
  return api(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64, branch: gh.branch, ...(sha ? { sha } : {}) }) });
}

/* ---------- State ---------- */

let cfg = null;
let sha = null;
let dirty = false;
let tab = ls.get('tt-admin-tab') || 'business';

function markDirty() {
  dirty = true;
  $('#dirty').textContent = 'Unsaved changes';
  $('#publish').disabled = false;
}
function setStatus(msg, kind = '') {
  const s = $('#status');
  s.textContent = msg;
  s.className = `status ${kind}`;
}
window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

async function load() {
  setStatus('Loading…');
  const f = await getFile(CONFIG_PATH);
  cfg = JSON.parse(b64ToText(f.content));
  sha = f.sha;
  dirty = false;
  $('#dirty').textContent = 'No unsaved changes';
  $('#publish').disabled = true;
  setStatus('Up to date', 'ok');
  render();
}

async function publish() {
  $('#publish').disabled = true;
  setStatus('Saving…');
  try {
    const text = JSON.stringify(cfg, null, 2) + '\n';
    const res = await putFile(CONFIG_PATH, bytesToB64(new TextEncoder().encode(text)), 'Update site content', sha);
    sha = res.content.sha;
    dirty = false;
    $('#dirty').textContent = 'Saved';
    watchDeploy(res.commit.sha);
  } catch (e) {
    $('#publish').disabled = false;
    setStatus(e.message.startsWith('409') ? 'Someone else saved meanwhile. Click Discard to reload, then redo your change.' : `Save failed: ${e.message}`, 'err');
  }
}

async function watchDeploy(commitSha) {
  setStatus('Saved. Website is updating…', 'busy');
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    try {
      const { workflow_runs: runs } = await api(`/actions/runs?head_sha=${commitSha}&per_page=1`);
      const run = runs?.[0];
      if (run?.status === 'completed') {
        return run.conclusion === 'success'
          ? setStatus('Live on the website ✓', 'ok')
          : setStatus(`Deploy ${run.conclusion}. Open GitHub Actions to see why.`, 'err');
      }
    } catch { /* token may lack Actions read; just stop polling */ return setStatus('Saved. The site updates in about a minute.', 'ok'); }
  }
  setStatus('Saved. Deploy is taking longer than usual.', 'busy');
}

/* ---------- Form helpers ---------- */

function field(obj, key, label, type = 'text', extra = {}) {
  const isBool = type === 'checkbox';
  const input = el('input', {
    type, value: isBool ? null : obj[key] ?? '', checked: isBool ? !!obj[key] : null, ...extra,
    oninput: (e) => {
      const v = isBool ? e.target.checked : type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
      obj[key] = v;
      markDirty();
      extra.after?.(v);
    },
  });
  return el('label', { class: isBool ? 'check' : 'field' }, isBool ? [input, ' ', label] : [label, input]);
}

function textArea(obj, key, label) {
  return el('label', { class: 'field' }, label,
    el('textarea', { rows: 2, value: obj[key] ?? '', oninput: (e) => { obj[key] = e.target.value; markDirty(); } }));
}

function strList(arr, label, placeholder = '') {
  const wrap = el('div', { class: 'field' }, el('span', {}, label));
  const draw = () => {
    wrap.replaceChildren(el('span', {}, label),
      ...arr.map((v, i) => el('div', { class: 'row' },
        el('input', { value: v, placeholder, oninput: (e) => { arr[i] = e.target.value; markDirty(); } }),
        el('button', { class: 'icon', title: 'Remove', onclick: () => { arr.splice(i, 1); markDirty(); draw(); } }, '×'))),
      el('button', { class: 'btn ghost sm', onclick: () => { arr.push(''); markDirty(); draw(); } }, '+ Add'));
  };
  draw();
  return wrap;
}

function moveBtns(arr, i, redraw) {
  const mv = (d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; markDirty(); redraw(); };
  return [
    el('button', { class: 'icon', title: 'Move up', onclick: () => mv(-1), disabled: i === 0 }, '↑'),
    el('button', { class: 'icon', title: 'Move down', onclick: () => mv(1), disabled: i === arr.length - 1 }, '↓'),
  ];
}

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || `item-${Date.now().toString(36)}`;
const card = (title, ...kids) => el('section', { class: 'card' }, title ? el('h2', {}, title) : null, ...kids);
const previews = {}; // freshly uploaded photos are not deployed yet
const imgUrl = (p) => previews[p] || (/^(https?:|data:)/.test(p) ? p : `../${p}`);
const photoById = (id) => (cfg.gallery || []).find((x) => x.id === id);

/* ---------- Image upload (resized in the browser to keep the site fast) ---------- */

async function resizeToWebp(file, maxW) {
  const bmp = await createImageBitmap(file);
  // Crop to 4:5 portrait so every photo lines up in the carousels
  let sw = bmp.width, sh = bmp.height, sx = 0, sy = 0;
  if (sw / sh > 4 / 5) { sw = Math.round(sh * 4 / 5); sx = Math.round((bmp.width - sw) / 2); }
  else { sh = Math.round(sw * 5 / 4); sy = Math.round((bmp.height - sh) / 2); }
  const w = Math.min(maxW, sw), h = Math.round(w * 5 / 4);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.8));
  return new Uint8Array(await blob.arrayBuffer());
}

async function uploadPhoto(file, caption) {
  setStatus('Uploading photo…', 'busy');
  const id = `${slug(caption).slice(0, 40)}-${Date.now().toString(36)}`;
  const item = { id, caption, flavor: null };
  for (const [key, suffix, w] of [['image', '', 960], ['thumb', '-sm', 480]]) {
    const bytes = await resizeToWebp(file, w);
    const path = `${IMAGE_DIR}/${id}${suffix}.webp`;
    await putFile(path, bytesToB64(bytes), `Add photo: ${caption}`, null);
    item[key] = path.replace(/^public\//, '');
    previews[item[key]] = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
  }
  setStatus('Photo uploaded. Click Save & publish to show it on the site.', 'ok');
  return item;
}

function menuList(key, title, newLabel) {
  cfg[key] ||= [];
  const list = cfg[key];
  const redraw = () => render();
  return [card(title,
    el('p', { class: 'hint' }, 'Sold by quantity. The section is hidden on the website when the list is empty.'),
    ...list.map((t, i) => el('div', { class: 'row wrap' },
      field(t, 'label', 'Name'), field(t, 'description', 'Description'), field(t, 'price', `Price (${cfg.site.currency})`, 'number', { min: 0, step: '0.5' }),
      ...moveBtns(list, i, redraw),
      el('button', { class: 'icon danger', title: 'Delete', onclick: () => { if (confirm(`Delete ${t.label}?`)) { list.splice(i, 1); markDirty(); redraw(); } } }, '🗑'))),
    el('button', { class: 'btn ghost', onclick: () => { list.push({ id: `${key[0]}${Date.now().toString(36)}`, label: newLabel, description: '', price: 0 }); markDirty(); redraw(); } }, `+ Add ${newLabel.replace('New ', '')}`))];
}

/* ---------- Tabs ---------- */

const tabs = {
  business: ['Business', () => {
    const s = cfg.site;
    return [
      card('Business details',
        field(s, 'name', 'Website name'),
        field(s, 'tagline', 'Tagline'),
        el('div', { class: 'grid2' },
          field(s, 'facebook', 'Facebook page link', 'url'),
          field(s, 'messenger', 'Messenger username (the part after facebook.com/)'),
          field(s, 'whatsapp', 'WhatsApp number', 'tel'),
          field(s, 'instagram', 'Instagram username'),
          field(s, 'location', 'Location'),
          field(s, 'currency', 'Currency symbol'),
          field(s, 'minDaysNotice', 'Minimum days notice for orders', 'number', { min: 0 }))),
      card('Pickup points', strList(s.pickupPoints, 'Customers choose one of these', 'e.g. Lichtenberg Bahnhof')),
      card('Badges', strList(s.badges, 'Short highlights shown in the hero', 'e.g. 100% Halal')),
    ];
  }],

  prices: ['Cakes & prices', () => {
    const { flavors, sizes } = cfg.cakes;
    const redraw = () => render();
    const table = el('table', { class: 'prices' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Flavor'), ...sizes.map((s) => el('th', {}, s.label)))),
      el('tbody', {}, ...flavors.map((f) => el('tr', {}, el('th', {}, f.label),
        ...sizes.map((s) => el('td', {}, el('input', {
          type: 'number', min: 0, step: '0.5', value: f.prices[s.id] ?? '', placeholder: 'ask', 'aria-label': `${f.label} ${s.label}`,
          oninput: (e) => { f.prices[s.id] = e.target.value === '' ? null : Number(e.target.value); markDirty(); },
        })))))));
    return [
      card('Price list', el('p', { class: 'hint' }, `Price per cake in ${cfg.site.currency}, by flavor and size. Leave a box empty to show "price on request".`), el('div', { class: 'scroll' }, table)),
      card('Flavors',
        ...flavors.map((f, i) => el('div', { class: 'item' },
          el('div', { class: 'thumb' },
            photoById(f.image) ? el('img', { src: imgUrl(photoById(f.image).thumb), alt: '' }) : el('div', { class: 'swatch', style: `background:${f.color || '#F3E3C8'}` }, 'No photo'),
            el('label', { class: 'field' }, 'Main photo',
              el('select', { onchange: (e) => { f.image = e.target.value; markDirty(); redraw(); } },
                el('option', { value: '' }, 'No photo'),
                ...(cfg.gallery || []).map((p) => el('option', { value: p.id, selected: p.id === f.image }, p.caption)))),
            field(f, 'color', 'Color (if no photo)', 'color')),
          el('div', { class: 'grow' },
            field(f, 'label', 'Name', 'text', { after: () => (table.rows[i + 1].cells[0].textContent = f.label) }),
            textArea(f, 'description', 'Description')),
          el('div', { class: 'tools' }, ...moveBtns(flavors, i, redraw),
            el('button', { class: 'icon danger', title: 'Delete flavor', onclick: () => {
              if (!confirm(`Delete ${f.label}?`)) return;
              flavors.splice(i, 1);
              markDirty(); redraw();
            } }, '🗑')))),
        el('button', { class: 'btn ghost', onclick: () => {
          flavors.push({ id: `flavor-${Date.now().toString(36)}`, label: 'New flavor', description: '', image: '', color: '#F3E3C8', prices: Object.fromEntries(sizes.map((s) => [s.id, 0])) });
          markDirty(); redraw();
        } }, '+ Add flavor')),
      card('Sizes',
        ...sizes.map((s, i) => el('div', { class: 'row wrap' },
          field(s, 'label', 'Label'), field(s, 'serves', 'Serves'),
          ...moveBtns(sizes, i, redraw),
          el('button', { class: 'icon danger', title: 'Delete size', onclick: () => {
            if (!confirm(`Delete size ${s.label}?`)) return;
            sizes.splice(i, 1); flavors.forEach((f) => delete f.prices[s.id]); markDirty(); redraw();
          } }, '🗑'))),
        el('button', { class: 'btn ghost', onclick: () => {
          const id = `s${Date.now().toString(36)}`;
          sizes.push({ id, label: 'New size', serves: '' });
          flavors.forEach((f) => (f.prices[id] = 0));
          markDirty(); redraw();
        } }, '+ Add size')),
    ];
  }],

  extras: ['Extras', () => {
    const groups = cfg.cakes.extras;
    const redraw = () => render();
    return [
      ...groups.map((g, gi) => card(null,
        el('div', { class: 'row wrap' }, field(g, 'label', 'Extra'), field(g, 'hint', 'Small note'), ...moveBtns(groups, gi, redraw),
          el('button', { class: 'icon danger', title: 'Delete', onclick: () => { if (confirm(`Delete ${g.label}?`)) { groups.splice(gi, 1); markDirty(); redraw(); } } }, '🗑')),
        el('p', { class: 'hint' }, 'The first choice is the default.'),
        ...g.options.map((o, oi) => el('div', { class: 'row wrap sub' },
          field(o, 'label', 'Choice'), field(o, 'price', `Price (${cfg.site.currency})`, 'number', { min: 0, step: '0.5' }),
          ...moveBtns(g.options, oi, redraw),
          el('button', { class: 'icon danger', title: 'Delete', onclick: () => { g.options.splice(oi, 1); markDirty(); redraw(); } }, '×'))),
        el('button', { class: 'btn ghost sm', onclick: () => { g.options.push({ id: `o${Date.now().toString(36)}`, label: 'New choice', price: 0 }); markDirty(); redraw(); } }, '+ Add choice'))),
      el('button', { class: 'btn ghost', onclick: () => {
        groups.push({ id: `x${Date.now().toString(36)}`, label: 'New extra', hint: '', options: [{ id: 'none', label: 'None', price: 0 }] });
        markDirty(); redraw();
      } }, '+ Add extra'),
    ];
  }],

  pastries: ['Pastries', () => menuList('pastries', 'Pastries', 'New pastry')],
  treats: ['Savouries', () => menuList('treats', 'Savouries', 'New item')],

  offers: ['Offers', () => {
    const list = cfg.offers;
    const redraw = () => render();
    return [card('Time-based offer codes',
      el('p', { class: 'hint' }, 'Each code only works between its start and end time (the customer\'s local time). The site shows the offers that are running right now.'),
      ...list.map((o, i) => el('div', { class: 'item col' },
        el('div', { class: 'row wrap' },
          field(o, 'code', 'Code', 'text', { style: 'text-transform:uppercase', after: (v) => (o.code = v.toUpperCase()) }),
          field(o, 'percent', '% off', 'number', { min: 1, max: 100 }),
          field(o, 'start', 'From', 'time'), field(o, 'end', 'Until', 'time'),
          field(o, 'active', 'Active', 'checkbox'),
          el('button', { class: 'icon danger', title: 'Delete', onclick: () => { if (confirm(`Delete ${o.code}?`)) { list.splice(i, 1); markDirty(); redraw(); } } }, '🗑')),
        field(o, 'label', 'Text shown to customers'))),
      el('button', { class: 'btn ghost', onclick: () => { list.push({ code: 'NEWCODE', label: 'New offer', percent: 10, start: '09:00', end: '12:00', active: true }); markDirty(); redraw(); } }, '+ Add offer'))];
  }],

  coupons: ['Coupons', () => {
    const c = cfg.coupon;
    c.redeemed ||= [];
    const out = el('p', { class: 'result' });
    const email = el('input', { type: 'email', placeholder: 'customer@email.com' });
    const code = el('input', { placeholder: `${c.prefix}-XXXXXX`, style: 'text-transform:uppercase' });
    const check = async () => {
      const real = await personalCode(email.value, c);
      const given = code.value.trim().toUpperCase();
      if (!email.value) { out.textContent = 'Enter the email.'; out.className = 'result err'; return; }
      if (!given) { out.textContent = `This email's code is ${real}.`; out.className = 'result'; return; }
      if (given !== real) { out.textContent = `✗ Not valid for this email (their code is ${real}).`; out.className = 'result err'; return; }
      if (c.redeemed.includes(given)) { out.textContent = '✗ Valid, but already used.'; out.className = 'result err'; return; }
      out.replaceChildren('✓ Valid and unused. ', el('button', { class: 'btn sm', onclick: () => { c.redeemed.push(given); markDirty(); render(); setStatus('Marked as used. Click Save & publish.', 'busy'); } }, 'Mark as used'));
      out.className = 'result ok';
    };
    return [
      card('Welcome coupon',
        el('p', { class: 'hint' }, 'Visitors enter their email and get a personal code. The same email always gets the same code, so you can check any code here.'),
        el('div', { class: 'grid2' },
          field(c, 'enabled', 'Ask visitors for their email and offer a coupon', 'checkbox'),
          field(c, 'percent', '% off', 'number', { min: 1, max: 100 }),
          field(c, 'prefix', 'Code prefix', 'text', { after: (v) => (c.prefix = v.toUpperCase()) }),
          field(c, 'popupDelaySeconds', 'Show the popup after (seconds)', 'number', { min: 0 }))),
      card('Check a coupon',
        el('div', { class: 'row wrap' }, el('label', { class: 'field' }, 'Customer email', email), el('label', { class: 'field' }, 'Code', code),
          el('button', { class: 'btn', onclick: check }, 'Check')),
        out),
      card('Used codes',
        el('p', { class: 'hint' }, 'Codes listed here are rejected on the website. Mark a code as used after the order is done.'),
        strList(c.redeemed, `${c.redeemed.length} used`, `${c.prefix}-XXXXXX`)),
    ];
  }],

  hero: ['Day & evening', () => {
    const h = cfg.hero;
    const slides = (t) => el('div', { class: 'field' }, el('span', {}, 'Photos in the slideshow'),
      el('div', { class: 'pick' }, ...(cfg.gallery || []).map((p) => el('label', { class: 'pick-item', title: p.caption },
        el('input', { type: 'checkbox', checked: h[t].slides.includes(p.id), onchange: (e) => {
          h[t].slides = e.target.checked ? [...h[t].slides, p.id] : h[t].slides.filter((x) => x !== p.id);
          markDirty();
        } }), el('img', { src: imgUrl(p.thumb), alt: p.caption })))));
    return [
      card('When does it switch?',
        el('p', { class: 'hint' }, 'Day uses the pink vanilla look, evening uses the chocolate look.'),
        el('div', { class: 'row wrap' }, field(h, 'dayStartsAt', 'Day starts', 'time'), field(h, 'eveningStartsAt', 'Evening starts', 'time'))),
      ...['day', 'evening'].map((t) => card(t === 'day' ? '☀ Day (vanilla)' : '☾ Evening (chocolate)',
        field(h[t], 'eyebrow', 'Small greeting'), field(h[t], 'title', 'Headline'), textArea(h[t], 'subtitle', 'Subtitle'), slides(t))),
    ];
  }],

  gallery: ['Gallery', () => {
    cfg.gallery ||= [];
    const list = cfg.gallery;
    const redraw = () => render();
    const cap = el('input', { placeholder: 'e.g. Chocolate cake with fresh raspberries' });
    const remove = (i) => {
      const p = list[i];
      if (!confirm(`Remove "${p.caption}" from the website?`)) return;
      list.splice(i, 1);
      for (const t of ['day', 'evening']) cfg.hero[t].slides = cfg.hero[t].slides.filter((x) => x !== p.id);
      for (const f of cfg.cakes.flavors) if (f.image === p.id) f.image = '';
      markDirty(); redraw();
    };
    return [
      card('Add a photo',
        el('p', { class: 'hint' }, 'Photos are cropped to portrait and resized automatically, so the site stays fast.'),
        el('div', { class: 'row wrap' },
          el('label', { class: 'field' }, 'Caption', cap),
          el('label', { class: 'btn' }, 'Choose photo…',
            el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              try {
                const item = await uploadPhoto(file, cap.value.trim() || file.name.replace(/\.[^.]+$/, ''));
                list.unshift(item); markDirty(); redraw();
              } catch (err) { setStatus(`Upload failed: ${err.message}`, 'err'); }
            } })))),
      card(`Photos (${list.length})`,
        el('p', { class: 'hint' }, 'Tag a flavor to show the photo in the cake builder when that flavor is picked.'),
        ...list.map((p, i) => el('div', { class: 'item' },
          el('div', { class: 'thumb' }, el('img', { src: imgUrl(p.thumb), alt: '' })),
          el('div', { class: 'grow' },
            field(p, 'caption', 'Caption'),
            el('label', { class: 'field' }, 'Flavor',
              el('select', { onchange: (e) => { p.flavor = e.target.value || null; markDirty(); } },
                el('option', { value: '' }, 'Not tagged'),
                ...cfg.cakes.flavors.map((f) => el('option', { value: f.id, selected: f.id === p.flavor }, f.label)))),
            el('details', {}, el('summary', {}, 'What this photo shows (used to match customer choices)'),
              el('div', { class: 'grid2' }, ...cfg.cakes.extras.map((g) => el('label', { class: 'field' }, g.label,
                el('select', { onchange: (e) => {
                  p.match ||= {};
                  if (e.target.value) p.match[g.id] = e.target.value; else delete p.match[g.id];
                  markDirty();
                } },
                  el('option', { value: '' }, '—'),
                  ...g.options.map((o) => el('option', { value: o.id, selected: p.match?.[g.id] === o.id }, o.label)))))))),
          el('div', { class: 'tools' }, ...moveBtns(list, i, redraw),
            el('button', { class: 'icon danger', title: 'Remove photo', onclick: () => remove(i) }, '🗑'))))),
    ];
  }],

  raw: ['Advanced', () => {
    const ta = el('textarea', { class: 'code', rows: 28, spellcheck: 'false', value: JSON.stringify(cfg, null, 2) });
    const err = el('p', { class: 'err' });
    return [card('All settings (JSON)',
      el('p', { class: 'hint' }, 'For advanced edits. Click Apply, then Save & publish.'), ta, err,
      el('button', { class: 'btn', onclick: () => {
        try { cfg = JSON.parse(ta.value); err.textContent = ''; markDirty(); setStatus('Applied. Click Save & publish.', 'busy'); }
        catch (e) { err.textContent = e.message; }
      } }, 'Apply'))];
  }],
};

function render() {
  $('#tabs').replaceChildren(...Object.entries(tabs).map(([id, [label]]) =>
    el('button', { class: id === tab ? 'on' : null, onclick: () => { tab = id; ls.set('tt-admin-tab', id); render(); } }, label)));
  $('#panel').replaceChildren(...(tabs[tab] || tabs.business)[1]());
}

/* ---------- Boot ---------- */

function guessRepo() {
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return m && seg && seg !== 'admin' ? `${m[1]}/${seg}` : 'ShihabRacs/taste-and-tales-by-munni';
}

async function connect() {
  gh.repo = $('#repo').value.trim();
  gh.branch = $('#branch').value.trim() || 'main';
  gh.token = $('#token').value.trim();
  $('#login-err').textContent = '';
  try {
    await load();
    if ($('#remember').checked) { ls.set('tt-admin-repo', gh.repo); ls.set('tt-admin-branch', gh.branch); ls.set('tt-admin-token', gh.token); }
    $('#login').hidden = true;
    $('#app').hidden = false;
  } catch (e) {
    $('#login-err').textContent = /401|403|404/.test(e.message) ? `Could not open the repository (${e.message}). Check the token and repository name.` : e.message;
    setStatus('');
  }
}

$('#repo').value = ls.get('tt-admin-repo') || guessRepo();
$('#branch').value = ls.get('tt-admin-branch') || 'main';
$('#token').value = ls.get('tt-admin-token') || '';
$('#connect').addEventListener('click', connect);
$('#token').addEventListener('keydown', (e) => e.key === 'Enter' && connect());
$('#publish').addEventListener('click', publish);
$('#reload').addEventListener('click', () => { if (!dirty || confirm('Discard unsaved changes?')) load(); });
const signOut = el('button', { class: 'btn ghost sm', onclick: () => { ['repo', 'branch', 'token'].forEach((k) => ls.set(`tt-admin-${k}`, null)); location.reload(); } }, 'Sign out');
$('.top').append(signOut);
if ($('#token').value) connect();
