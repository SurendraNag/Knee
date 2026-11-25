import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { STRUCTURES, LAYERS } from './structures.js';
import { makeMaterials } from './materials.js';
import { InjuryManager, INJURY_TYPES, injuryKind, typeInfo } from './injuries.js';
import './style.css';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const APP_VERSION = '0.3.0-preview';
const $ = (s) => document.querySelector(s);

// ---------- renderer / scene ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
const HOME_TARGET = new THREE.Vector3(0, 0.8, 0);
const HOME_DIST = 44;

// soft studio lighting: warm key, cool fill, rim from behind, all moving with the camera
const rig = new THREE.Group(); camera.add(rig); scene.add(camera);
const key = new THREE.DirectionalLight(0xfff1e0, 2.0); key.position.set(-12, 14, 10); rig.add(key); rig.add(key.target);
const fill = new THREE.DirectionalLight(0xdbe8ff, 0.45); fill.position.set(14, 2, 8); rig.add(fill); rig.add(fill.target);
const rim = new THREE.DirectionalLight(0xcfe0ff, 1.6); rim.position.set(4, 10, -16); rig.add(rim); rig.add(rim.target);
for (const l of [key, fill, rim]) l.target.position.set(0, 0, -HOME_DIST);
scene.add(new THREE.HemisphereLight(0x9fb4cc, 0x2a2018, 0.2));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 6; controls.maxDistance = 80;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

// ---------- state ----------
const meshes = {}; // id -> mesh
const state = { peel: 2, xray: false, selected: null, isolate: false, labels: false, spread: 0, mode: 'explore', step: 1, injTarget: null, injType: null };
let injuries = null;

// ---------- load anatomy ----------
async function loadAnatomy() {
  const base = import.meta.env.BASE_URL;
  const [manifest, bin] = await Promise.all([
    fetch(`${base}anatomy/manifest.json`).then((r) => r.json()),
    fetch(`${base}anatomy/anatomy.bin`).then((r) => r.arrayBuffer()),
  ]);
  const mats = makeMaterials();
  for (const m of manifest.meshes) {
    const info = STRUCTURES[m.id];
    if (!info) continue;
    const n = m.count;
    const q = new Uint16Array(bin, m.pos, n * 3);
    const qn = new Int8Array(bin, m.nrm, n * 3);
    const ao = new Uint8Array(bin, m.ao, n);
    const tint = m.tint !== undefined ? new Uint8Array(bin, m.tint, n) : null;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < 3; a++) {
        pos[i * 3 + a] = m.min[a] + (q[i * 3 + a] / 65535) * (m.max[a] - m.min[a]);
        nrm[i * 3 + a] = qn[i * 3 + a] / 127;
      }
      // fade the cut ends of long bones / muscles so the knee stays the focus
      const y = pos[i * 3 + 1];
      const fade = 1 - THREE.MathUtils.smoothstep(Math.abs(y - 0.8), 7.5, 11.5);
      const o = (ao[i] / 255) * (0.15 + 0.85 * fade);
      if (tint) { const k = tint[i] / 255; col[i * 4] = o * (0.58 + 0.36 * k); col[i * 4 + 1] = o * (0.13 + 0.77 * k); col[i * 4 + 2] = o * (0.11 + 0.75 * k); }
      else { col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = o; } col[i * 4 + 3] = THREE.MathUtils.smoothstep(fade, 0, 0.45);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    if (m.uv !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, m.uv, n * 2), 2));
    const idx = m.idx16 ? new Uint16Array(bin, m.idx, m.icount) : new Uint32Array(bin, m.idx, m.icount);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundsTree();
    const mat = mats[info.kind]();
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = m.id;
    mesh.userData = { id: m.id, info, baseOpacity: 1 };
    mesh.renderOrder = info.layer <= 1 ? 2 : 0;
    meshes[m.id] = mesh;
    scene.add(mesh);
  }
}

// ---------- visibility: layers + see-through ----------
function applyVisibility() {
  for (const mesh of Object.values(meshes)) {
    const { layer } = mesh.userData.info;
    const id = mesh.userData.id;
    const focus = state.mode === 'explore' && state.selected;
    const spreadHide = state.spread > 0.02 && !SPREAD[id];
    mesh.visible = layer >= state.peel && !spreadHide && !(state.isolate && focus && id !== focus);
    let faded = state.xray && (layer === 4 || layer === 3 || layer <= 1 || mesh.userData.info.kind === 'tendon');
    // glass focus: everything except the selected structure turns to glass
    if (focus && id !== focus && !state.isolate) faded = true;
    if (focus && id === focus) faded = false;
    const m = mesh.material;
    if (faded) {
      m.alphaHash = false; m.transparent = true; m.depthWrite = false;
      m.opacity = focus && id !== focus ? (layer <= 1 ? 0.07 : 0.14) : layer === 4 ? 0.16 : layer === 3 ? 0.2 : mesh.userData.info.kind === 'tendon' ? 0.22 : 0.12;
    } else {
      m.alphaHash = true; m.transparent = false; m.depthWrite = true; m.opacity = 1;
    }
    mesh.userData.faded = faded;
    m.needsUpdate = true;
  }
  $('#peel-label').textContent = state.peel === 0 ? 'Showing everything' : `Removed: ${LAYERS.slice(0, state.peel).join(', ')}`;
  $('#xray').setAttribute('aria-pressed', String(state.xray));
}

// ---------- camera animation ----------
let anim = null;
function flyTo(target, dir, dist, ms = 650) {
  const fromPos = camera.position.clone(), fromTarget = controls.target.clone();
  const toTarget = target.clone();
  const toPos = toTarget.clone().add(dir.clone().normalize().multiplyScalar(dist));
  anim = { t0: performance.now(), ms, fromPos, fromTarget, toPos, toTarget };
}
function stepAnim(now) {
  if (!anim) return;
  let t = Math.min(1, (now - anim.t0) / anim.ms);
  t = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  // interpolate around the target so the camera arcs rather than cutting through the model
  const target = anim.fromTarget.clone().lerp(anim.toTarget, t);
  const a = anim.fromPos.clone().sub(anim.fromTarget), b = anim.toPos.clone().sub(anim.toTarget);
  const la = a.length(), lb = b.length();
  const qa = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.clone().normalize());
  const qb = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().normalize());
  const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(qa.slerp(qb, t));
  camera.position.copy(target).add(dir.multiplyScalar(THREE.MathUtils.lerp(la, lb, t)));
  controls.target.copy(target);
  if (t >= 1) anim = null;
}

const VIEWS = {
  front: new THREE.Vector3(0, 0.08, 1),
  back: new THREE.Vector3(0, 0.08, -1),
  inside: new THREE.Vector3(1, 0.08, 0), // medial
  outside: new THREE.Vector3(-1, 0.08, 0), // lateral
};
function setView(name) {
  const dist = camera.position.distanceTo(controls.target);
  flyTo(state.selected ? focusCenter(state.selected) : controls.target.clone(), VIEWS[name], dist);
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
}
function resetView() {
  flyTo(HOME_TARGET, new THREE.Vector3(0.35, 0.12, 1), HOME_DIST);
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('on'));
}

function focusCenter(id) {
  const g = meshes[id].geometry; const s = g.boundingSphere.clone();
  // long bones and muscles: focus on the part near the joint
  if (s.radius > 5) { s.center.y = THREE.MathUtils.clamp(s.center.y, -2.5, 4); }
  return s.center;
}
function focusRadius(id) {
  const r = meshes[id].geometry.boundingSphere.radius;
  return Math.min(r, 5.5);
}
function zoomStructure(factor) {
  if (!state.selected) return;
  const c = focusCenter(state.selected);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const cur = camera.position.distanceTo(controls.target);
  const base = focusRadius(state.selected) * 5 + 9;
  const dist = factor === 0 ? base : THREE.MathUtils.clamp(cur * factor, controls.minDistance, controls.maxDistance);
  flyTo(c, dir, dist);
}

// ---------- selection ----------
const HILITE = new THREE.Color(0x3d8bff);
let highlighted = null;
function setHighlight(id) {
  if (highlighted && meshes[highlighted]) meshes[highlighted].material.emissive.set(0x000000);
  highlighted = id;
  if (id && meshes[id]) meshes[id].material.emissive.copy(HILITE).multiplyScalar(0.22);
}
function ensureVisible(id) {
  const info = STRUCTURES[id];
  if (info.layer < state.peel) { state.peel = info.layer; $('#peel').value = String(state.peel); }
  applyVisibility();
}
function select(id) {
  setHighlight(id);
  state.selected = id;
  const panel = $('#info');
  if (!id) { panel.classList.add('hidden'); $('#picker').value = ''; state.isolate = false; applyVisibility(); frameFreeArea(); return; }
  const info = STRUCTURES[id];
  $('#info-group').textContent = info.group;
  $('#info-name').textContent = info.name;
  $('#info-what').textContent = info.what;
  $('#info-injuries').innerHTML = info.injuries.map((t) => `<li>${t}</li>`).join('');
  $('#info-note').hidden = !info.simplified;
  state.isolate = false; $('#isolate').setAttribute('aria-pressed', 'false');
  $('#picker').value = id;
  panel.classList.remove('hidden');
  frameFreeArea();
  // make sure the structure is visible, and turn everything else to glass
  if (info.layer < state.peel) { state.peel = info.layer; $('#peel').value = String(state.peel); }
  applyVisibility();
}

// ---------- picking (tap vs drag) ----------
const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
let down = null;
canvas.addEventListener('pointerdown', (e) => { if (e.isPrimary) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !e.isPrimary) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const dt = performance.now() - down.t; down = null;
  if (moved > 8 || dt > 600) return;
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (state.mode === 'injury') return injuryTap();
  // in glass focus everything else is faded, so allow picking any visible structure
  const pickable = Object.values(meshes).filter((m) => m.visible && (!m.userData.faded || (state.selected && !state.xray)));
  const hits = ray.intersectObjects(pickable, false).filter((h) => fadeAt(h.point) > 0.5);
  const id = hits.length ? hits[0].object.userData.id : null;
  const now = performance.now();
  if (id && id === lastTap.id && now - lastTap.t < 400) { select(id); toggleIsolate(true); lastTap = { id: null, t: 0 }; return; }
  lastTap = { id, t: now };
  select(id);
});
function injuryTap() {
  if (state.step === 3) {
    const mesh = meshes[state.injTarget];
    const hit = ray.intersectObject(mesh, false)[0];
    let point;
    if (hit) point = hit.point;
    else { // snap: closest point on the structure to the tap ray
      const c = focusCenter(state.injTarget);
      point = ray.ray.closestPointToPoint(c, new THREE.Vector3());
    }
    const anchor = injuries.anchorFor(state.injTarget, point);
    if (!injuries.add(state.injTarget, state.injType, anchor)) { $('#inj-tap-msg').textContent = 'This structure already has the maximum of 6 injuries.'; return; }
    renderInjuryList();
    setStep(2);
    return;
  }
  const pickable = Object.values(meshes).filter((m) => m.visible && !m.userData.faded && injuryKind(m.userData.id));
  const hits = ray.intersectObjects(Object.values(meshes).filter((m) => m.visible && !m.userData.faded), false).filter((h) => fadeAt(h.point) > 0.5);
  const hit = hits.find((h) => pickable.includes(h.object));
  if (hit) chooseInjTarget(hit.object.userData.id);
}

// ---------- injury mode ----------
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  document.body.classList.toggle('mode-injury', mode === 'injury');
  $('#injury').classList.toggle('hidden', mode !== 'injury');
  if (mode === 'injury') { select(null); setStep(state.injTarget ? 2 : 1); }
  else { setHighlight(null); frameFreeArea(); }
}
function setStep(n) {
  state.step = n;
  $('#inj-step1').hidden = n !== 1; $('#inj-step2').hidden = n !== 2; $('#inj-step3').hidden = n !== 3;
  document.querySelectorAll('.steps span').forEach((sp) => { const k = Number(sp.dataset.step); sp.classList.toggle('on', k === n); sp.classList.toggle('done', k < n); });
  if (n === 1) { state.injTarget = null; setHighlight(null); $('#inj-picker').value = ''; }
  renderInjuryList();
  frameFreeArea();
}
function chooseInjTarget(id) {
  state.injTarget = id; setHighlight(id); ensureVisible(id);
  const info = STRUCTURES[id], kind = injuryKind(id);
  $('#inj-target-group').textContent = info.group;
  $('#inj-target').textContent = info.name;
  $('#inj-types').innerHTML = INJURY_TYPES[kind].map((t) => `<button data-type="${t.type}">${t.label}<small>${t.sub}</small></button>`).join('');
  $('#inj-types').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.injType = Number(b.dataset.type);
    $('#inj-tap-msg').textContent = `Now tap the exact spot on the ${info.short} where the ${typeInfo(kind, state.injType).label.toLowerCase()} should appear.`;
    setStep(3);
  }));
  setStep(2);
}
function injurySentence(inj) {
  const info = STRUCTURES[inj.id]; const t = typeInfo(injuryKind(inj.id), inj.type);
  return { title: `${info.short.replace(/^./, (c) => c.toUpperCase())}: ${t.label.replace(/^(?!Grade)./, (c) => c.toLowerCase())}`, text: t.say(info.short) };
}
function renderInjuryList() {
  const list = injuries ? injuries.list : [];
  $('#inj-listwrap').hidden = list.length === 0;
  $('#inj-list').innerHTML = list.map((inj, i) => { const s = injurySentence(inj);
    return `<li><span class="num">${i + 1}</span><span><b>${s.title}.</b> ${s.text}</span><button class="rm" data-rm="${i}" aria-label="Remove injury ${i + 1}">×</button></li>`; }).join('');
  $('#inj-list').querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { injuries.remove(Number(b.dataset.rm)); renderInjuryList(); }));
  // tags
  const tags = $('#tags');
  tags.innerHTML = list.map((_, i) => `<div class="tag">${i + 1}</div>`).join('');
  frameFreeArea();
}
const _tp = new THREE.Vector3();
function updateTags() {
  if (!injuries) return;
  const els = $('#tags').children; const w = canvas.clientWidth, h = canvas.clientHeight;
  injuries.list.forEach((inj, i) => {
    const el = els[i]; if (!el) return;
    _tp.copy(injuries.tagPoint(inj));
    const n = new THREE.Vector3().fromArray(inj.anchor.n);
    _tp.addScaledVector(n, 0.35).project(camera);
    el.style.left = `${(_tp.x * 0.5 + 0.5) * w}px`; el.style.top = `${(-_tp.y * 0.5 + 0.5) * h}px`;
    el.style.display = _tp.z < 1 ? '' : 'none';
  });
}
function wireInjuryUI() {
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  const sel = $('#inj-picker');
  sel.innerHTML = '<option value="">Choose a structure…</option>' + Object.entries(STRUCTURES).filter(([id]) => injuryKind(id))
    .map(([id, s]) => `<option value="${id}">${s.name}</option>`).join('');
  sel.addEventListener('change', () => { if (sel.value) { chooseInjTarget(sel.value); state.selected = sel.value; zoomStructure(0); state.selected = null; } });
  const zoomT = (f) => { state.selected = state.injTarget; zoomStructure(f); state.selected = null; };
  $('#inj-zoom-in').addEventListener('click', () => zoomT(0.7));
  $('#inj-zoom-out').addEventListener('click', () => zoomT(1.4));
  $('#inj-zoom-reset').addEventListener('click', () => zoomT(0));
  $('#inj-change').addEventListener('click', () => setStep(1));
  $('#inj-cancel').addEventListener('click', () => setStep(2));
  $('#inj-undo').addEventListener('click', () => { injuries.undo(); renderInjuryList(); });
  $('#inj-clear').addEventListener('click', () => { injuries.clear(); renderInjuryList(); });
}

let lastTap = { id: null, t: 0 };
function toggleIsolate(on) {
  state.isolate = on ?? !state.isolate; $('#isolate').setAttribute('aria-pressed', String(state.isolate)); applyVisibility();
  if (state.isolate) zoomStructure(0);
}

// ---------- spread apart ----------
// which structures move, and where to (cm at full spread)
const SPREAD = {
  femur: [0, 3.2, 0], femoral_cartilage: [0, 3.2, 0],
  patella: [0, 2.2, 4.2], patellar_cartilage: [0, 2.2, 4.2],
  tibia: [0, -2.6, 0], tibial_cartilage: [0, -2.6, 0], fibula: [-1.6, -3.2, -0.6],
  medial_meniscus: [0.4, -0.6, 0], lateral_meniscus: [-0.4, -0.6, 0],
  acl: [-0.2, 0.6, 1.2], pcl: [0.2, 0.6, -1.2],
};
function applySpread() {
  for (const [id, off] of Object.entries(SPREAD)) if (meshes[id]) meshes[id].position.set(off[0], off[1], off[2]).multiplyScalar(state.spread);
  applyVisibility();
}

// ---------- labels with leader lines ----------
const labelAnchors = {};
function computeLabelAnchors() {
  for (const [id, mesh] of Object.entries(meshes)) {
    if (id === 'skin') continue;
    const c = focusCenter(id).clone();
    const res = mesh.geometry.boundsTree.closestPointToPoint(c);
    labelAnchors[id] = res.point.clone();
  }
}
function buildLabels() {
  const layer = $('#labels-layer');
  layer.innerHTML = Object.keys(labelAnchors).map((id) => `<div class="lbl" data-id="${id}">${STRUCTURES[id].name.replace(/ \(.*\)$/, '')}</div>`).join('');
  layer.querySelectorAll('.lbl').forEach((el) => el.addEventListener('click', () => { if (state.mode === 'explore') { select(el.dataset.id); zoomStructure(0); } }));
}
const _lp = new THREE.Vector3(), _ln = new THREE.Vector3();
function updateLabels() {
  const layer = $('#labels-layer'), svg = $('#leaders');
  if (!state.labels) { if (layer.childElementCount) { layer.style.display = 'none'; svg.innerHTML = ''; } return; }
  layer.style.display = '';
  const w = canvas.clientWidth, h = canvas.clientHeight, cx = w / 2;
  const top = $('.modes').getBoundingClientRect().bottom + 12, bottom = $('.toolbar').getBoundingClientRect().top - 12;
  const items = [];
  for (const el of layer.children) {
    const id = el.dataset.id, mesh = meshes[id];
    const show = mesh.visible && (!mesh.userData.faded || id === state.selected) && (!state.selected || state.isolate ? true : true);
    if (!show) { el.style.display = 'none'; continue; }
    _lp.copy(labelAnchors[id]).add(mesh.position);
    if (fadeAt(_lp) < 0.6) { el.style.display = 'none'; continue; }
    _ln.copy(_lp).project(camera);
    if (_ln.z > 1) { el.style.display = 'none'; continue; }
    const x = (_ln.x * 0.5 + 0.5) * w, y = (-_ln.y * 0.5 + 0.5) * h;
    items.push({ el, id, x, y, left: x < cx });
  }
  const lines = [];
  const colX = { true: Math.max(12, cx - Math.min(w * 0.36, 330)), false: Math.min(w - 12, cx + Math.min(w * 0.36, 330)) };
  for (const side of [true, false]) {
    const col = items.filter((i) => i.left === side).sort((a, b) => a.y - b.y);
    let prev = top - 24;
    for (const it of col) { it.ly = Math.max(it.y, prev + 24); prev = it.ly; }
    // push up from the bottom if we overflowed
    let next = bottom + 24;
    for (let k = col.length - 1; k >= 0; k--) { col[k].ly = Math.min(col[k].ly, next - 24); next = col[k].ly; }
    for (const it of col) {
      it.el.style.display = '';
      it.el.classList.toggle('sel', it.id === state.selected);
      const lw = it.el.offsetWidth;
      const lx = side ? colX.true - lw : colX.false;
      it.el.style.left = `${lx}px`; it.el.style.top = `${it.ly}px`;
      lines.push(`<line x1="${it.x}" y1="${it.y}" x2="${side ? lx + lw : lx}" y2="${it.ly}"/><circle cx="${it.x}" cy="${it.y}" r="2.2"/>`);
    }
  }
  svg.innerHTML = lines.join('');
}

// ---------- orientation cube ----------
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
function updateCube() {
  // rotate the cube by the inverse camera rotation so its faces match the model
  _q.copy(camera.quaternion).invert();
  _m4.makeRotationFromQuaternion(_q);
  const e = _m4.elements;
  // CSS has Y down: flip Y components
  $('#cube').style.transform = `translateZ(-32px) matrix3d(${e[0]},${-e[1]},${e[2]},0,${-e[4]},${e[5]},${-e[6]},0,${e[8]},${-e[9]},${e[10]},0,0,0,0,1)`;
}

const fadeAt = (p) => 1 - THREE.MathUtils.smoothstep(Math.abs(p.y - 0.8), 7.5, 11.5);

// ---------- UI wiring ----------
function buildPicker() {
  const sel = $('#picker');
  const groups = {};
  for (const [id, s] of Object.entries(STRUCTURES)) (groups[s.group] ||= []).push([id, s]);
  sel.innerHTML = '<option value="">Find a structure…</option>' + Object.entries(groups).map(([g, list]) =>
    `<optgroup label="${g}">${list.map(([id, s]) => `<option value="${id}">${s.name}</option>`).join('')}</optgroup>`).join('');
  sel.addEventListener('change', () => { select(sel.value || null); if (sel.value) zoomStructure(0); });
}
function wireUI() {
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#xray').addEventListener('click', () => { state.xray = !state.xray; applyVisibility(); });
  $('#peel').addEventListener('input', (e) => { state.peel = Number(e.target.value); applyVisibility(); if (state.selected && !meshes[state.selected].visible) select(null); });
  $('#zoom-in').addEventListener('click', () => zoomStructure(0.7));
  $('#zoom-out').addEventListener('click', () => zoomStructure(1.4));
  $('#zoom-reset').addEventListener('click', () => zoomStructure(0));
  $('#reset').addEventListener('click', () => { select(null); resetView(); });
  $('#info-close').addEventListener('click', () => select(null));
  $('#isolate').addEventListener('click', () => toggleIsolate());
  $('#labels').addEventListener('click', () => { state.labels = !state.labels; $('#labels').setAttribute('aria-pressed', String(state.labels)); });
  $('#spread').addEventListener('input', (e) => { state.spread = Number(e.target.value); applySpread(); });
  document.querySelectorAll('#cube .face').forEach((f) => f.addEventListener('click', () => {
    const v = f.dataset.face;
    if (v === 'top') flyTo(controls.target.clone(), new THREE.Vector3(0.001, 1, 0.02), camera.position.distanceTo(controls.target));
    else if (v === 'bottom') flyTo(controls.target.clone(), new THREE.Vector3(0.001, -1, 0.02), camera.position.distanceTo(controls.target));
    else setView(v);
  }));
  $('#version').textContent = `v${APP_VERSION}`;
  buildPicker();
  wireInjuryUI();
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the knee framed on narrow (portrait) screens
  camera.fov = w / h < 0.8 ? 42 : 30;
  frameFreeArea();
}
// Shift the rendered image so the knee sits in the middle of the area not covered by panels.
function frameFreeArea() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const top = $('.modes').getBoundingClientRect().bottom + 8;
  const info = state.mode === 'injury' ? $('#injury') : $('#info');
  const phone = w <= 760;
  let bottom = $('.toolbar').getBoundingClientRect().top - 8;
  if (phone && !info.classList.contains('hidden')) bottom = info.getBoundingClientRect().top - 8;
  const shift = phone ? (h / 2 - (top + bottom) / 2) : 0;
  camera.setViewOffset(w, h, 0, shift, w, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// fps counter (shown with ?fps)
const fpsEl = $('#fps'); let frames = 0, fpsT = performance.now();
if (new URLSearchParams(location.search).has('fps')) fpsEl.hidden = false;

function loop(now) {
  stepAnim(now);
  controls.update();
  updateTags();
  updateLabels();
  updateCube();
  if (injuries) injuries.syncExtras();
  renderer.render(scene, camera);
  frames++;
  if (now - fpsT > 1000) { fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsT))} fps`; frames = 0; fpsT = now; }
  requestAnimationFrame(loop);
}

(async function start() {
  wireUI();
  resize();
  camera.position.copy(HOME_TARGET).add(new THREE.Vector3(0.35, 0.12, 1).normalize().multiplyScalar(HOME_DIST));
  controls.target.copy(HOME_TARGET);
  const t0 = performance.now();
  await loadAnatomy();
  injuries = new InjuryManager(scene, meshes);
  computeLabelAnchors(); buildLabels();
  applyVisibility();
  // test hooks
  window.__knee = { meshes, injuries, state, setMode, chooseInjTarget, renderInjuryList, THREE, camera, controls, flyTo, VIEWS, setView,
    look(i, dist = 9, dir) { const inj = injuries.list[i]; const p = injuries.tagPoint(inj); const n = dir ? new THREE.Vector3(...dir).normalize() : new THREE.Vector3().fromArray(inj.anchor.n);
      anim = null; controls.target.copy(p); camera.position.copy(p).addScaledVector(n, dist); controls.update(); },
    addAt(id, type, frac, side = 0) { // frac along a swept structure, or [x,y,z] near a bone
      const m = meshes[id]; let p;
      if (Array.isArray(frac)) p = new THREE.Vector3(...frac);
      else { const rings = m.geometry.userData.rings; const r = rings[Math.round(frac * (rings.length - 1))]; p = r.center.clone(); if (side) p.addScaledVector(r.side, side); }
      const inj = injuries.add(id, type, injuries.anchorFor(id, p), 0.37); renderInjuryList(); return inj; } };
  // test hooks for screenshots
  const qs = new URLSearchParams(location.search);
  if (qs.has('peel')) { state.peel = Number(qs.get('peel')); $('#peel').value = qs.get('peel'); applyVisibility(); }
  if (qs.has('xray')) { state.xray = true; applyVisibility(); }
  if (qs.has('labels')) { state.labels = true; }
  if (qs.has('spread')) { state.spread = Number(qs.get('spread')); $('#spread').value = qs.get('spread'); applySpread(); }
  if (qs.has('view')) { const v = VIEWS[qs.get('view')]; camera.position.copy(HOME_TARGET).add(v.clone().normalize().multiplyScalar(HOME_DIST)); }
  if (qs.has('sel')) { select(qs.get('sel')); if (qs.has('iso')) toggleIsolate(true); if (qs.has('zoom')) { anim = null; const c = focusCenter(state.selected); const d = camera.position.clone().sub(controls.target).normalize(); camera.position.copy(c).add(d.multiplyScalar(focusRadius(state.selected) * 5 + 9)); controls.target.copy(c); } }
  $('#loading').classList.add('done');
  window.__ready = { loadMs: Math.round(performance.now() - t0) };
  requestAnimationFrame(loop);
})();
