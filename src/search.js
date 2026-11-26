// One search box for every page: structures on this page, common injuries and structures on the other pages,
// and the pages themselves. Matches names, abbreviations and lay words (see SYNONYMS in catalog.js).
import { PAGES, COMMON, SYNONYMS, pageOf, keepParams, commonUrl } from './catalog.js';
import * as LEG from './structures.js';
import * as HAND from './hand-structures.js';
import * as SHOULDER from './shoulder-structures.js';
import * as SPINE from './spine-structures.js';
import * as HEAD from './head-structures.js';

const SETS = { leg: LEG.STRUCTURES, hand: HAND.STRUCTURES, shoulder: SHOULDER.STRUCTURES, spine: SPINE.STRUCTURES, head: HEAD.STRUCTURES };
const norm = (t) => ` ${String(t).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const INJURY_WORDS = /\b(tear|torn|fracture|break|broken|sprain|rupture|herniat|slipped|crack|injur|separation|dislocat)/;

function buildIndex(here) {
  const out = [];
  for (const p of PAGES) if (p.limb !== here) out.push({ kind: 'page', limb: p.limb, label: p.name, sub: 'Open this body part', text: norm(`${p.name} ${p.short} ${p.blurb}`), url: `./${p.page}${keepParams()}` });
  for (const c of COMMON) {
    const p = pageOf(c.limb);
    out.push({ kind: 'injury', limb: c.limb, key: c.key, label: c.label, sub: `Common injury · ${p.name}`, text: norm(`${c.label} ${(c.aka || []).join(' ')}`), url: commonUrl(c) });
  }
  for (const [limb, set] of Object.entries(SETS)) {
    const p = pageOf(limb);
    for (const [id, s] of Object.entries(set)) {
      if (id === 'skin' && limb !== here) continue;
      out.push({ kind: 'structure', limb, id, label: s.name, sub: limb === here ? s.group : `${s.group} · ${p.name}`, text: norm(`${s.name} ${s.short || ''} ${SYNONYMS[id] || ''}`), url: `./${p.page}${keepParams({ find: id })}` });
    }
  }
  return out;
}

function score(e, words, q, here) {
  const lab = norm(e.label);
  for (const w of words) if (!e.text.includes(` ${w}`) && !(w.length >= 4 && e.text.includes(w))) return -1;
  let s = 0;
  if (lab.startsWith(` ${q}`)) s += 6;
  if (q.includes(' ') && e.text.includes(` ${q} `)) s += 4; // the whole phrase, e.g. "slipped disc"
  if (words.every((w) => lab.includes(` ${w}`))) s += 3;
  if (e.limb === here) s += 2.5;
  if (e.kind === 'injury') s += INJURY_WORDS.test(q) ? 4 : 0.5;
  if (e.kind === 'page') s += 1;
  return s;
}

// input: the text box; list: the <ul> for results; here: this page's limb ('leg' ... or 'home'/'body')
// extra(): more entries for this page only (the body page's parts); onLocal(entry): handle an entry for this page
// (returns true when handled; otherwise the browser goes to entry.url)
export function mountSearch(input, list, { here, extra = () => [], onLocal = () => false, max = 12 } = {}) {
  let index = null, shown = [], active = -1;
  const close = () => { list.hidden = true; active = -1; };
  const pick = (e) => {
    close(); input.blur();
    if (e.run) return e.run();
    if (e.limb === here && onLocal(e)) { input.value = ''; return; }
    location.href = e.url;
  };
  const render = () => {
    list.innerHTML = shown.map((e, i) => `<li role="option" tabindex="-1" data-i="${i}" class="k-${e.kind}${i === active ? ' on' : ''}">${esc(e.label)}<small>${esc(e.sub)}</small></li>`).join('')
      || `<li class="none">Nothing found. Try a body part, a bone or an injury, for example “ACL” or “slipped disc”.</li>`;
    list.hidden = false;
    list.querySelectorAll('li[data-i]').forEach((li) => li.addEventListener('pointerdown', (ev) => { ev.preventDefault(); pick(shown[Number(li.dataset.i)]); }));
  };
  input.addEventListener('input', () => {
    const q = norm(input.value).trim();
    if (q.length < 2) { close(); return; }
    index ||= buildIndex(here);
    const words = q.split(' ');
    const all = [...extra(), ...index];
    shown = all.map((e) => [e, score(e, words, q, here)]).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1]).slice(0, max).map(([e]) => e);
    active = shown.length ? 0 : -1;
    render();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { close(); input.blur(); return; }
    if (list.hidden || !shown.length) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; render(); }
    if (ev.key === 'Enter') { ev.preventDefault(); pick(shown[Math.max(0, active)]); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) input.dispatchEvent(new Event('input')); });
  return { close };
}

// The body-part menu shared by every page: a Home link and a menu of all parts.
export function mountNav(container, here) {
  const home = document.createElement('a');
  home.className = 'btnlink home-link'; home.href = `./${keepParams()}`; home.setAttribute('aria-label', 'Home: all body parts'); home.title = 'Home: all body parts';
  home.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Home</span>';
  const sel = document.createElement('select');
  sel.id = 'part-nav'; sel.setAttribute('aria-label', 'Body part');
  const embed = new URLSearchParams(location.search).get('embed') === '1' || window.self !== window.top;
  sel.innerHTML = PAGES.filter((p) => !(embed && p.limb === 'body')).map((p) => `<option value="${p.page}"${p.limb === here ? ' selected' : ''}>${esc(innerWidth <= 430 ? p.short : p.name)}</option>`).join('');
  sel.addEventListener('change', () => { location.href = `./${sel.value}${keepParams()}`; });
  container.prepend(home, sel);
  return sel;
}
