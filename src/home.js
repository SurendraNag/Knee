// Home page: one search box and a tile per body part, with its common injuries one tap away.
import './style.css';
import './home.css';
import { PAGES, COMMON, commonUrl, keepParams } from './catalog.js';
import { mountSearch } from './search.js';
import { APP_VERSION } from './version.js';

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SHOW = 6; // common injuries listed on a tile before "more"

document.getElementById('version').textContent = `v${APP_VERSION}`;
const base = import.meta.env.BASE_URL;
document.getElementById('tiles').innerHTML = PAGES.map((p) => {
  const inj = COMMON.filter((c) => c.limb === p.limb);
  const url = `./${p.page}${keepParams()}`;
  const list = p.limb === 'body'
    ? `<ul class="inj"><li><a href="./body.html${keepParams()}">Male body</a></li><li><a href="./body.html${keepParams({ sex: 'female' })}">Female body</a></li></ul>`
    : `<ul class="inj">${inj.slice(0, SHOW).map((c) => `<li><a href="${commonUrl(c)}">${esc(c.label)}</a></li>`).join('')}${inj.length > SHOW
      ? `<li class="more"><button type="button" data-more="${p.limb}">${inj.length - SHOW} more…</button></li>${inj.slice(SHOW).map((c) => `<li class="extra" hidden><a href="${commonUrl(c)}">${esc(c.label)}</a></li>`).join('')}` : ''}</ul>`;
  return `<article class="tile">
    <a class="tile-main" href="${url}">
      <img src="${base}home/${p.thumb}.jpg" alt="" width="480" height="300" loading="lazy" decoding="async">
      <span class="tile-name">${esc(p.name)}</span>
      <span class="tile-blurb">${esc(p.blurb)}</span>
    </a>
    ${p.limb === 'body' ? '<h3>Explore</h3>' : '<h3>Common injuries</h3>'}
    ${list}
  </article>`;
}).join('');
document.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => {
  const ul = b.closest('ul'); ul.querySelectorAll('.extra').forEach((li) => { li.hidden = false; }); b.parentElement.remove();
}));
mountSearch(document.getElementById('find'), document.getElementById('find-results'), { here: 'home', max: 14 });
