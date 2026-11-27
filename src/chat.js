// "Ask AI": a chat panel that talks to an AI model running on the clinician's own computer
// (Ollama or LM Studio, or any OpenAI-compatible server). The browser talks to it directly:
// questions and answers never go to our server, and nothing is stored anywhere except this device.
// The panel tells the model what is on screen (page, selected part, injuries shown) so the
// clinician can ask "what is this?" or "how is this treated?" about the current view.
import './chat.css';

const LS = 'ae-chat-settings', SS = 'ae-chat-history';
const QS = new URLSearchParams(location.search);
const DEFAULT_URL = 'http://localhost:11434';
const PRESETS = [
  ['Ollama on this computer', 'http://localhost:11434'],
  ['LM Studio on this computer', 'http://localhost:1234'],
];
const SITE = location.origin;

const load = (k, store, d) => { try { return JSON.parse(store.getItem(k)) ?? d; } catch { return d; } };
const save = (k, store, v) => { try { store.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// small, safe Markdown: the text is escaped first, then bold, italic, code, headings and lists
export function md(src) {
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(src).replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { close(); continue; }
    if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { close(); out.push(`<p class="h">${inline(m[1].replace(/\*\*/g, ''))}</p>`); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { close(); continue; }
    if (/^\s*\|/.test(line)) { close(); if (/^\s*\|?\s*:?-{2,}/.test(line)) continue; out.push(`<p>${inline(line.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim()).join(' · '))}</p>`); continue; }
    close(); out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join('');
}

// thinking models (Qwen 3, DeepSeek R1) may put their reasoning in <think> tags inside the answer
export function stripThink(t) { return t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, ''); }

function systemPrompt(context) {
  return [
    'You are an anatomy and injury teaching assistant inside "Anatomy Explainer", a 3D web app that orthopaedic doctors and physiotherapists use to explain injuries to their patients.',
    'Answer the clinician\'s questions accurately and concisely. Use correct anatomical terms and give plain-language explanations where they help.',
    'This is for education only. Do not diagnose a particular person or give personal medical advice. Say when you are unsure, when evidence is limited, or when practice varies.',
    'When asked for words for a patient, write simply and kindly, at about a 12-year-old reading level, without frightening language.',
    'Keep answers short: a few short paragraphs or a bullet list. Do not use tables.',
    '',
    'What the clinician has on screen right now (use it when they say "this", "it" or "here"):',
    context || 'Nothing in particular is selected.',
  ].join('\n');
}

// what is on the screen, read from the page so it works on every page; pages may add more
function screenContext(extra) {
  const vis = (el) => el && !el.closest('.hidden,[hidden]') && el.offsetParent !== null;
  const txt = (sel) => { const el = document.querySelector(sel); return vis(el) ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const lines = [`Page: ${document.title}.`];
  const name = txt('#info-name');
  if (name) {
    const group = txt('#info-group'), what = txt('#info-what');
    lines.push(`Selected part: ${name}${group ? ` (${group})` : ''}.`);
    if (what) lines.push(`App description of it: ${what}`);
    const inj = [...document.querySelectorAll('#info-injuries li')].map((li) => li.textContent.trim()).filter(Boolean);
    if (inj.length && vis(document.querySelector('#info-injuries'))) lines.push(`Common injuries listed for it: ${inj.join('; ')}.`);
  }
  const shown = [...document.querySelectorAll('#inj-list > li')].map((li, i) => `${i + 1}. ${li.textContent.replace(/×\s*$/, '').replace(/See which nerve it presses on ›/, '').replace(/\s+/g, ' ').trim()}`);
  if (shown.length) lines.push(`Injuries marked on the model:\n${shown.join('\n')}`);
  const target = txt('#inj-target');
  if (target) lines.push(`In injury mode, structure being marked: ${target}.`);
  try { const more = extra && extra(); if (more) lines.push(...[].concat(more).filter(Boolean)); } catch { /* page not ready */ }
  return lines.join('\n');
}
function contextLabel() {
  const vis = (el) => el && !el.closest('.hidden,[hidden]') && el.offsetParent !== null;
  const name = document.querySelector('#info-name'), target = document.querySelector('#inj-target');
  const n = document.querySelectorAll('#inj-list > li').length;
  const bits = [];
  if (vis(name) && name.textContent.trim()) bits.push(name.textContent.trim());
  else if (vis(target) && target.textContent.trim()) bits.push(target.textContent.trim());
  if (n) bits.push(`${n} ${n === 1 ? 'injury' : 'injuries'} shown`);
  return bits.length ? bits.join(' · ') : document.title;
}

// ---------- talking to the model ----------
// Ollama has its own API (lets us turn "thinking" off so answers come quickly); anything else
// (LM Studio, llama.cpp, Jan, vLLM) gets the OpenAI-style API that they all share.
async function probe(url, signal) {
  const base = url.replace(/\/+$/, '').replace(/\/v1$/, '');
  try {
    const r = await fetch(`${base}/api/tags`, { signal });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.models)) return { kind: 'ollama', base, models: j.models.map((m) => m.name).filter((n) => !/embed/i.test(n)) };
    }
  } catch (e) { if (e.name === 'AbortError') throw e; /* try the OpenAI-style address next */ }
  const r = await fetch(`${base}/v1/models`, { signal });
  if (!r.ok) throw new Error(`The AI answered with an error (${r.status}).`);
  const j = await r.json();
  return { kind: 'openai', base, models: (j.data || []).map((m) => m.id).filter((n) => !/embed/i.test(n)) };
}
// the best general model of the ones installed: skip embedding and coding models when there is a choice
export function pickModel(models, current) {
  if (current && models.includes(current)) return current;
  return models.find((m) => !/coder|code|embed|vision|ocr/i.test(m)) || models[0] || '';
}

async function* readLines(res) {
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) yield line; }
  }
  if (buf.trim()) yield buf.trim();
}
async function errorText(res) {
  let t = ''; try { t = await res.text(); const j = JSON.parse(t); t = j.error?.message || j.error || t; } catch { /* plain text */ }
  return String(t).slice(0, 300);
}
// yields { think } while the model is reasoning and { text } as the answer arrives
async function* stream(conn, model, messages, signal) {
  if (conn.kind === 'ollama') {
    let think = false;
    const go = (body) => fetch(`${conn.base}/api/chat`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const body = { model, messages, stream: true, think, options: { temperature: 0.4 } };
    let res = await go(body);
    if (!res.ok) { const t = await errorText(res); if (/think/i.test(t)) { delete body.think; res = await go(body); } else throw new Error(t || `Error ${res.status}`); }
    if (!res.ok) throw new Error((await errorText(res)) || `Error ${res.status}`);
    for await (const line of readLines(res)) {
      let j; try { j = JSON.parse(line); } catch { continue; }
      if (j.error) throw new Error(j.error);
      if (j.message?.thinking) yield { think: j.message.thinking };
      if (j.message?.content) yield { text: j.message.content };
      if (j.done) return;
    }
    return;
  }
  const res = await fetch(`${conn.base}/v1/chat/completions`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.4 }) });
  if (!res.ok) throw new Error((await errorText(res)) || `Error ${res.status}`);
  for await (const line of readLines(res)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return;
    let j; try { j = JSON.parse(data); } catch { continue; }
    const d = j.choices?.[0]?.delta || {};
    const th = d.reasoning_content || d.reasoning;
    if (th) yield { think: th };
    if (d.content) yield { text: d.content };
  }
}

// ---------- the panel ----------
const ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/></svg>';
const GEAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

function setupHelp() {
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return `
  <details class="chat-help"${iOS ? '' : ' open'}><summary>How to connect your AI (one time)</summary>
    <p><b>On a Mac with Ollama</b> (the AI app with the llama icon):</p>
    <ol>
      <li>Open the <b>Terminal</b> app, paste this line and press Return:<br>
        <code class="copy" data-copy="launchctl setenv OLLAMA_ORIGINS &quot;${SITE}&quot;">launchctl setenv OLLAMA_ORIGINS "${esc(SITE)}"</code>
        <button class="mini chat-copy" type="button">Copy</button></li>
      <li>Quit Ollama from the llama icon at the top of the screen, then open it again.</li>
      <li>Use <b>Chrome</b> or <b>Edge</b> on that Mac. If the browser asks to let this site use <i>apps and services on this device</i> (or the <i>local network</i>), choose <b>Allow</b>.</li>
      <li>Press <b>Connect</b> above.</li>
    </ol>
    <p class="small">That line lets this website, and only this website, talk to Ollama. After restarting the Mac, run it again (or ask Claude to make it permanent).</p>
    <p><b>LM Studio</b>: choose "LM Studio on this computer" above. In LM Studio open the Developer tab, start the server, and turn on <i>Enable CORS</i>.</p>
    <p><b>iPhone or iPad</b>: the AI runs on your computer, not the phone, so the phone needs a secure (https) address for your computer. Ask Claude to set this up with you; it takes about ten minutes.</p>
    <p class="small">Safari on a Mac may refuse to reach the AI on the same Mac. If Connect fails in Safari, use Chrome.</p>
  </details>`;
}

export function mountChat({ extraContext, suggestions } = {}) {
  const patient = QS.get('patient') === '1', embed = QS.get('embed') === '1' || window.self !== window.top;
  if ((patient || embed) && QS.get('chat') !== '1') return null; // patients' devices do not have the clinician's AI
  if (QS.get('chat') === '0') return null;

  const settings = Object.assign({ url: DEFAULT_URL, model: '' }, load(LS, localStorage, {}));
  let history = load(SS, sessionStorage, []); // { role, content } — this browser tab only, gone when it is closed
  let conn = null, busy = null, connecting = null;

  const fab = document.createElement('button');
  fab.id = 'chat-fab'; fab.className = 'chat-fab'; fab.type = 'button';
  fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-controls', 'chat');
  fab.title = 'Ask the AI on your own computer about what is on screen';
  fab.innerHTML = `${ICON}<span>Ask AI</span>`;

  const el = document.createElement('section');
  el.id = 'chat'; el.className = 'chat hidden'; el.setAttribute('aria-label', 'Ask AI');
  el.innerHTML = `
    <div class="chat-head">
      <div class="chat-title"><b>Ask AI</b><span class="chat-model" id="chat-model-chip"></span></div>
      <button class="icon" id="chat-new" type="button" title="Start a new chat" aria-label="New chat">New</button>
      <button class="icon" id="chat-gear" type="button" aria-expanded="false" aria-controls="chat-settings" title="AI settings" aria-label="AI settings">${GEAR}</button>
      <button class="close" id="chat-close" type="button" aria-label="Close">×</button>
    </div>
    <p class="chat-note">Education only, not for diagnosis. Answers come from the AI on your own computer and can be wrong: check them. Do not type patient names or details.</p>
    <div class="chat-settings" id="chat-settings" hidden>
      <label for="chat-url">Where your AI runs</label>
      <div class="chat-row">
        <select id="chat-preset" aria-label="Choose your AI app">${PRESETS.map(([n, u]) => `<option value="${u}">${n}</option>`).join('')}<option value="">Other address…</option></select>
      </div>
      <div class="chat-row"><input id="chat-url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="http://localhost:11434" /><button id="chat-connect" class="primary" type="button">Connect</button></div>
      <div id="chat-status" class="chat-status" role="status"></div>
      <div class="chat-row" id="chat-model-row" hidden><label for="chat-model">Model</label><select id="chat-model"></select></div>
      ${setupHelp()}
    </div>
    <div class="chat-log" id="chat-log" aria-live="polite"></div>
    <div class="chat-suggest" id="chat-suggest"></div>
    <div class="chat-about" id="chat-about"></div>
    <form class="chat-form" id="chat-form">
      <textarea id="chat-input" rows="1" placeholder="Ask about this part or injury…" aria-label="Your question" enterkeyhint="send"></textarea>
      <button id="chat-send" class="primary" type="submit">Send</button>
    </form>`;
  const app = document.querySelector('#app') || document.body;
  app.append(fab, el);

  const $ = (s) => el.querySelector(s);
  const log = $('#chat-log'), input = $('#chat-input'), sendBtn = $('#chat-send');
  const urlIn = $('#chat-url'), preset = $('#chat-preset'), status = $('#chat-status'), modelSel = $('#chat-model');

  function setStatus(html, kind = '') { status.innerHTML = html; status.className = `chat-status ${kind}`; }
  function syncPreset() { const hit = PRESETS.find(([, u]) => u === settings.url); preset.value = hit ? hit[1] : ''; urlIn.value = settings.url; }
  function chip() { $('#chat-model-chip').textContent = conn && settings.model ? settings.model : conn ? '' : 'not connected'; }
  function openSettings(on) { $('#chat-settings').hidden = !on; $('#chat-gear').setAttribute('aria-expanded', String(on)); }

  function friendly(err) {
    const msg = String(err?.message || err);
    if (err?.name === 'TypeError' || /fetch|network|load failed/i.test(msg)) {
      const insecure = location.protocol === 'https:' && /^http:/.test(settings.url) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(settings.url);
      if (insecure) return 'This page is secure (https) so it cannot reach a plain http address on another computer. Use an https address for the AI, or open this page on the computer that runs the AI.';
      return `Could not reach your AI at <b>${esc(settings.url)}</b>. Check that the AI app is open, and that you did the one-time step below (it lets this website talk to it).`;
    }
    return esc(msg);
  }

  async function connect({ quiet = false } = {}) {
    if (connecting) return connecting;
    connecting = (async () => {
      settings.url = (urlIn.value || settings.url || DEFAULT_URL).trim().replace(/\/+$/, '');
      save(LS, localStorage, settings);
      if (!quiet) setStatus('Connecting…');
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
      try {
        conn = await probe(settings.url, ctl.signal);
        if (!conn.models.length) { conn = null; setStatus(`Connected, but no AI models are installed. In Ollama, download one first (for example <code>ollama pull qwen3:8b</code>).`, 'bad'); openSettings(true); return false; }
        settings.model = pickModel(conn.models, settings.model); save(LS, localStorage, settings);
        modelSel.innerHTML = conn.models.map((m) => `<option${m === settings.model ? ' selected' : ''}>${esc(m)}</option>`).join('');
        $('#chat-model-row').hidden = false;
        setStatus(`Connected to ${conn.kind === 'ollama' ? 'Ollama' : 'your AI'}: ${conn.models.length} ${conn.models.length === 1 ? 'model' : 'models'}.`, 'ok');
        return true;
      } catch (e) {
        conn = null;
        setStatus(e.name === 'AbortError' ? `No answer from <b>${esc(settings.url)}</b>. If the browser asked to allow access to this device, choose Allow, then press Connect again.` : friendly(e), 'bad');
        if (!quiet) openSettings(true);
        return false;
      } finally { clearTimeout(to); chip(); connecting = null; }
    })();
    return connecting;
  }

  function bubble(role, html) {
    const b = document.createElement('div'); b.className = `msg ${role}`; b.innerHTML = html; log.append(b); log.scrollTop = log.scrollHeight; return b;
  }
  function renderLog() {
    log.innerHTML = '';
    if (!history.length) bubble('hint', `<p>Ask anything about what is on screen: what a part does, how an injury happens, how it is treated, or how to explain it to a patient. Tap a part first to ask about it.</p>`);
    for (const m of history) bubble(m.role === 'user' ? 'me' : 'ai', m.role === 'user' ? `<p>${esc(m.content)}</p>` : md(m.content));
    renderSuggest();
  }
  function renderSuggest() {
    const sel = document.querySelector('#info-name'), name = sel && !sel.closest('.hidden,[hidden]') ? sel.textContent.trim() : '';
    const injCount = document.querySelectorAll('#inj-list > li').length;
    const list = (suggestions && suggestions({ name, injCount })) || (name ? [
      `What does the ${name} do?`, `What are the common injuries of the ${name}?`, `How is a ${name} injury treated?`, `Explain the ${name} to a patient in simple words.`,
    ] : injCount ? [
      'Explain the injuries shown, in simple words for the patient.', 'How are these injuries usually treated?', 'How long does recovery usually take?', 'What should the patient avoid while it heals?',
    ] : ['What can I look at on this page?', 'What are the most common injuries here?']);
    $('#chat-suggest').innerHTML = list.filter((q) => !history.some((m) => m.content === q)).slice(0, history.length ? 2 : 4).map((q) => `<button type="button" class="chip">${esc(q)}</button>`).join('');
    $('#chat-suggest').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
    $('#chat-about').textContent = `About: ${contextLabel()}`;
  }

  async function ask(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    if (!conn && !(await connect())) {
      bubble('err', `<p>${status.innerHTML || 'Not connected to your AI yet.'}</p>`);
      return;
    }
    input.value = ''; autosize();
    history.push({ role: 'user', content: text }); save(SS, sessionStorage, history);
    if (log.querySelector('.msg.hint')) log.innerHTML = '';
    bubble('me', `<p>${esc(text)}</p>`);
    $('#chat-suggest').innerHTML = '';
    const out = bubble('ai pending', '<p class="dots">Thinking<span>.</span><span>.</span><span>.</span></p>');
    const ctl = new AbortController(); busy = ctl;
    sendBtn.textContent = 'Stop'; sendBtn.classList.add('stop');
    const messages = [{ role: 'system', content: systemPrompt(screenContext(extraContext)) }, ...history.slice(-12)];
    let answer = '', thinking = false, last = 0;
    try {
      for await (const part of stream(conn, settings.model, messages, ctl.signal)) {
        if (part.think && !answer) { if (!thinking) { thinking = true; out.innerHTML = '<p class="dots">Thinking it through<span>.</span><span>.</span><span>.</span></p>'; } continue; }
        if (part.text) {
          answer += part.text;
          const now = performance.now();
          if (now - last > 60) { last = now; const shown = stripThink(answer); if (shown) { out.classList.remove('pending'); out.innerHTML = md(shown); log.scrollTop = log.scrollHeight; } }
        }
      }
      answer = stripThink(answer).trim();
      if (!answer) throw new Error('The AI sent back an empty answer. Try again, or choose another model in settings.');
      out.classList.remove('pending'); out.innerHTML = md(answer);
      history.push({ role: 'assistant', content: answer });
    } catch (e) {
      answer = stripThink(answer).trim();
      if (e.name === 'AbortError') {
        out.classList.remove('pending');
        if (answer) { out.innerHTML = md(answer) + '<p class="small">(stopped)</p>'; history.push({ role: 'assistant', content: answer }); } else { out.remove(); history.pop(); }
      } else {
        out.className = 'msg err'; out.innerHTML = `<p>${friendly(e)}</p>`;
        history.pop();
        if (e.name === 'TypeError') { conn = null; chip(); }
      }
    } finally {
      busy = null; save(SS, sessionStorage, history);
      sendBtn.textContent = 'Send'; sendBtn.classList.remove('stop');
      log.scrollTop = log.scrollHeight; renderSuggest();
    }
  }

  function autosize() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; }
  function setOpen(on) {
    el.classList.toggle('hidden', !on); fab.setAttribute('aria-expanded', String(on));
    document.body.classList.toggle('chat-open', on);
    if (on) {
      renderLog(); syncPreset(); chip();
      if (!conn) connect({ quiet: true }).then((ok) => { if (!ok) openSettings(true); });
      if (matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus(), 50);
    } else { input.blur(); }
  }

  fab.addEventListener('click', () => setOpen(el.classList.contains('hidden')));
  $('#chat-close').addEventListener('click', () => setOpen(false));
  $('#chat-gear').addEventListener('click', () => openSettings($('#chat-settings').hidden));
  $('#chat-new').addEventListener('click', () => { if (busy) busy.abort(); history = []; save(SS, sessionStorage, history); renderLog(); });
  preset.addEventListener('change', () => { if (preset.value) { urlIn.value = preset.value; conn = null; connect(); } else { urlIn.value = ''; urlIn.focus(); } });
  $('#chat-connect').addEventListener('click', () => { conn = null; connect(); });
  urlIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); conn = null; connect(); } });
  modelSel.addEventListener('change', () => { settings.model = modelSel.value; save(LS, localStorage, settings); chip(); });
  el.querySelector('.chat-copy')?.addEventListener('click', async (e) => {
    const code = el.querySelector('code.copy').dataset.copy;
    try { await navigator.clipboard.writeText(code); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Select and copy'; }
    setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
  });
  $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); if (busy) busy.abort(); else ask(input.value); });
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('#chat-form').requestSubmit(); } });
  // keys typed in the chat must not drive the 3D view's keyboard shortcuts
  el.addEventListener('keydown', (e) => e.stopPropagation());
  // iPhone: keep the panel above the on-screen keyboard
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const fit = () => { const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop); el.style.setProperty('--kb', `${kb}px`); };
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
  }
  // the suggestions follow the selection while the panel is open
  const watch = new MutationObserver(() => { if (!el.classList.contains('hidden') && !busy) renderSuggest(); });
  for (const s of ['#info', '#info-name', '#inj-list', '#injury']) { const n = document.querySelector(s); if (n) watch.observe(n, { attributes: true, attributeFilter: ['class', 'hidden'], childList: true, characterData: true, subtree: s !== '#injury' }); }

  // "Ask AI" on a part's card
  const actions = document.querySelector('#info .actions');
  if (actions) {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'info-ask'; b.className = 'ask-ai'; b.innerHTML = `${ICON}<span>Ask AI</span>`;
    b.title = 'Ask the AI on your own computer about this part';
    b.addEventListener('click', () => { const name = document.querySelector('#info-name')?.textContent.trim(); setOpen(true); if (name && !history.length) setTimeout(() => ask(`Tell me about the ${name}: what it does and how it is commonly injured.`), 0); });
    actions.prepend(b);
  }
  if (QS.get('chat') === 'open') setOpen(true);
  return { open: () => setOpen(true), close: () => setOpen(false), ask };
}
