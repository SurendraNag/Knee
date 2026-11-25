import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { STRUCTURES, LAYERS, CFG, LIMB } from './limbs.js';
import { makeMaterials } from './materials.js';
import { InjuryManager, INJURY_TYPES, injuryKind, typeInfo } from './injuries.js';
import './style.css';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

import { APP_VERSION } from './version.js';
import { snapshot, injuryList, encode, decode, listCases, saveCase, deleteCase, renameCase } from './cases.js';
export { APP_VERSION };
const $ = (s) => document.querySelector(s);
// ?patient=1: view-only page for patients (no editing of injuries); ?embed=1: inside a doctor's website (iframe)
const QS = new URLSearchParams(location.search);
const PATIENT = QS.get('patient') === '1', EMBED = QS.get('embed') === '1' || window.self !== window.top;
document.documentElement.classList.toggle('patient', PATIENT);
document.documentElement.classList.toggle('embed', EMBED);

// ---------- renderer / scene ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true; // "Show": cut everything to one joint

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
const HOME_TARGET = new THREE.Vector3(...CFG.home.target);
const HOME_DIST = CFG.home.dist;
const HOME_DIR = new THREE.Vector3(...CFG.home.dir);
// fade the cut end of the model (the waist for the leg, below the elbow for the hand)
const [FADE_Y0, FADE_Y1, FADE_DIR] = CFG.fade;
function fadeY(y) { return FADE_DIR > 0 ? 1 - THREE.MathUtils.smoothstep(y, FADE_Y0, FADE_Y1) : 1 - THREE.MathUtils.smoothstep(-y, -FADE_Y0, -FADE_Y1); }
// regions cut on more than one side give their own fade function of the point
const fadeP = CFG.fadeFn || ((x, y) => fadeY(y));
// Regions: where the camera looks, from which side, and how far away.
const REGIONS = CFG.regions;
function goRegion(name) {
  const r = REGIONS[name]; if (!r) return;
  zoomStack.length = 0;
  select(null);
  flyTo(new THREE.Vector3(...r.target), new THREE.Vector3(...r.dir), r.dist, 800);
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('on'));
  const sel = $('#region'); if (sel) sel.value = name;
}

// soft studio lighting: warm key, cool fill, rim from behind, all moving with the camera
const rig = new THREE.Group(); camera.add(rig); scene.add(camera);
const key = new THREE.DirectionalLight(0xfff1e0, 2.0); key.position.set(-12, 14, 10); rig.add(key); rig.add(key.target);
const fill = new THREE.DirectionalLight(0xdbe8ff, 0.45); fill.position.set(14, 2, 8); rig.add(fill); rig.add(fill.target);
const rim = new THREE.DirectionalLight(0xcfe0ff, 1.6); rim.position.set(4, 10, -16); rig.add(rim); rig.add(rim.target);
for (const l of [key, fill, rim]) l.target.position.set(0, 0, -HOME_DIST);
scene.add(new THREE.HemisphereLight(0x9fb4cc, 0x2a2018, 0.2));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = CFG.minDistance || 6; controls.maxDistance = 280;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

// ---------- state ----------
const meshes = {}; // id -> mesh
const state = { hidden: new Set(), vessels: true, peel: 2, xray: false, selected: null, isolate: false, labels: false, spread: 0, mode: 'explore', step: 1, injTarget: null, injType: null, joint: null, tissues: null };
let injuries = null;

// ---------- side: right or left leg ----------
// A left leg is the mirror image of a right one. The model stays a right leg in its own coordinates (so injuries,
// views, regions and share codes work unchanged) and only the picture is mirrored: the projection gets a flip in x,
// triangle winding is swapped to match, and horizontal drags are reversed so the leg still follows the finger.
state.side = 'right';
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
const _baseUPM = camera.updateProjectionMatrix.bind(camera);
camera.updateProjectionMatrix = () => {
  _baseUPM();
  if (state.side === 'left') { camera.projectionMatrix.premultiply(MIRROR); camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert(); }
};
{
  const st = renderer.state, base = st.setMaterial.bind(st);
  st.setMaterial = (material, frontFaceCW) => base(material, state.side === 'left' ? !frontFaceCW : frontFaceCW);
  const rot = controls._rotateLeft.bind(controls), pan = controls._panLeft.bind(controls);
  controls._rotateLeft = (a) => rot(state.side === 'left' ? -a : a);
  controls._panLeft = (d, m) => pan(state.side === 'left' ? -d : d, m);
}
const SIDE_TEXT = {}; // original structure text, so "right" can be swapped for "left"
function sideWords(t) { return state.side === 'left' ? t.replace(/\bright\b/g, 'left').replace(/\bRight\b/g, 'Left') : t; }
function setSide(side) {
  side = side === 'left' && CFG.sides !== false ? 'left' : 'right';
  state.side = side;
  camera.updateProjectionMatrix();
  for (const [id, s] of Object.entries(STRUCTURES)) {
    const o = (SIDE_TEXT[id] ||= { name: s.name, what: s.what, short: s.short });
    s.name = sideWords(o.name); s.what = sideWords(o.what); if (o.short) s.short = sideWords(o.short);
  }
  document.querySelectorAll('#picker option[value]').forEach((op) => { if (op.value && STRUCTURES[op.value]) op.textContent = STRUCTURES[op.value].name; });
  document.querySelectorAll('[data-side]').forEach((b) => { const on = b.dataset.side === side; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  // the cube's +X face shows whichever view looks from +X (leg: inside; hand: thumb side); mirrored for the left side
  const fi = document.querySelector('#cube .f-in'), fo = document.querySelector('#cube .f-out');
  const px = Object.keys(CFG.views).find((k) => CFG.views[k][0] > 0.5), mx = Object.keys(CFG.views).find((k) => CFG.views[k][0] < -0.5);
  const cubeLabel = (k) => (CFG.cubeLabels && CFG.cubeLabels[k]) || k[0].toUpperCase() + k.slice(1);
  if (fi && fo) { const L = side === 'left'; const a = L ? mx : px, b = L ? px : mx; fi.dataset.face = a; fi.firstElementChild.textContent = cubeLabel(a); fo.dataset.face = b; fo.firstElementChild.textContent = cubeLabel(b); }
  for (const k of ['front', 'back']) { const el = document.querySelector(`#cube [data-face=${k}] span`); if (el) el.textContent = cubeLabel(k); }
  document.title = CFG.sides === false ? CFG.title : `${CFG.title} · ${side === 'left' ? 'Left' : 'Right'} ${CFG.part}`;
  if (state.selected && typeof select === 'function') select(state.selected);
  if (injuries && typeof renderInjuryList === 'function') renderInjuryList();
}

// ---------- load anatomy ----------
async function loadAnatomy() {
  const base = import.meta.env.BASE_URL;
  const [manifest, data] = await Promise.all([
    fetch(`${base}${CFG.dataDir}/manifest.json`).then((r) => r.json()),
    fetch(`${base}${CFG.dataDir}/anatomy.dat`).then((r) => r.arrayBuffer()),
  ]);
  let bin = data; const u8 = new Uint8Array(data, 0, 2);
  if (u8[0] === 0x1f && u8[1] === 0x8b) bin = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const mats = makeMaterials();
  const v2 = manifest.version >= 2;
  // byte-planar stream -> typed array (see the writer in scripts/build-anatomy.mjs)
  const unplanar = (off, n, T) => { const w = T.BYTES_PER_ELEMENT, src = new Uint8Array(bin, off, n * w), out = new T(n), dst = new Uint8Array(out.buffer); for (let b = 0; b < w; b++) { const base = b * n; for (let i = 0; i < n; i++) dst[i * w + b] = src[base + i]; } return out; };
  for (const m of manifest.meshes) {
    const info = STRUCTURES[m.id];
    if (!info) continue;
    const n = m.count;
    let q;
    if (v2) { q = unplanar(m.pos, n * 3, Uint16Array); for (let i = 3; i < q.length; i++) q[i] += q[i - 3]; }
    else q = new Uint16Array(bin, m.pos, n * 3);
    const qn = new Int8Array(bin, m.nrm, n * 3);
    const ao = new Uint8Array(bin, m.ao, n);
    const tint = m.tint !== undefined ? new Uint8Array(bin, m.tint, n) : null;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < 3; a++) {
        pos[i * 3 + a] = m.min[a] + (q[i * 3 + a] / 65535) * (m.max[a] - m.min[a]);
        nrm[i * 3 + a] = qn[i * 3 + a] / 127;
      }
      // fade the cut at the top (waist), where the leg model ends
      const fade = fadeP(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const o = (ao[i] / 255) * (0.15 + 0.85 * fade);
      if (tint) { const k = tint[i] / 255; col[i * 4] = o * (0.58 + 0.36 * k); col[i * 4 + 1] = o * (0.13 + 0.77 * k); col[i * 4 + 2] = o * (0.11 + 0.75 * k); }
      else { col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = o; } col[i * 4 + 3] = THREE.MathUtils.smoothstep(fade, 0, 0.45);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    if (m.uv !== undefined) {
      let uv;
      if (v2) { const uq = unplanar(m.uv, n * 2, Uint16Array); uv = new Float32Array(n * 2); for (let i = 0; i < n * 2; i++) { const a = i & 1; uv[i] = m.uvMin[a] + (uq[i] / 65535) * (m.uvMax[a] - m.uvMin[a]); } }
      else uv = new Float32Array(bin, m.uv, n * 2);
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    let idx;
    if (v2) { const zz = unplanar(m.idx, m.icount, Uint32Array); idx = m.idx16 ? new Uint16Array(m.icount) : new Uint32Array(m.icount); let p = 0; for (let k = 0; k < m.icount; k++) { const z = zz[k]; p += (z >>> 1) ^ -(z & 1); idx[k] = p; } }
    else idx = m.idx16 ? new Uint16Array(bin, m.idx, m.icount) : new Uint32Array(bin, m.idx, m.icount);
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
const VESSEL_KINDS = new Set(['artery', 'vein', 'nerve']);
function setVessels(on) { state.vessels = on; $('#vessels').setAttribute('aria-pressed', String(on)); applyVisibility(); }
function applyVisibility() {
  for (const mesh of Object.values(meshes)) {
    const { layer } = mesh.userData.info;
    const id = mesh.userData.id;
    const focus = state.mode === 'explore' && state.selected && state.glass !== false;
    const spreadHide = state.spread > 0.02 && !SPREAD[id];
    const shown = state.tissues ? state.tissues.has(tissueOf(id)) : layer >= state.peel && (state.vessels || !VESSEL_KINDS.has(mesh.userData.info.kind));
    mesh.visible = shown && !spreadHide && !state.hidden.has(id) && inJointBox(mesh) && !(state.isolate && focus && id !== focus);
    let faded = state.xray && (layer === 4 || layer === 3 || layer <= 1 || mesh.userData.info.kind === 'tendon');
    // glass focus: everything except the selected structure turns to glass
    if (focus && id !== focus && !state.isolate) faded = true;
    if (focus && id === focus) faded = false;
    const m = mesh.material;
    if (faded) {
      m.alphaHash = false; m.transparent = true; m.depthWrite = false;
      m.opacity = focus && id !== focus ? (layer <= 1 ? 0.07 : 0.14) : layer === 4 ? 0.16 : layer === 3 ? 0.2 : mesh.userData.info.kind === 'tendon' ? 0.22 : 0.12;
    } else {
      const op = mesh.userData.info.opacity ?? 1;
      if (op < 1) { m.alphaHash = false; m.transparent = true; m.depthWrite = false; m.opacity = op; }
      else { m.alphaHash = true; m.transparent = false; m.depthWrite = true; m.opacity = 1; }
    }
    mesh.userData.faded = faded;
    m.clippingPlanes = jointPlanes; m.clipShadows = false;
    m.needsUpdate = true;
    updateCap(mesh, faded);
  }
  $('#peel-label').textContent = state.tissues ? 'Chosen with Show' : state.peel === 0 ? 'Showing everything' : `Removed: ${LAYERS.slice(0, state.peel).join(', ')}`;
  renderShowChip();
  $('#xray').setAttribute('aria-pressed', String(state.xray));
}

// ---------- "Show": one joint only, and only the chosen kinds of tissue ----------
// A joint is a box around its cartilage, ligaments and discs (CFG.joints[k].core, padded). Everything is cut to that box with
// clipping planes; the cut faces are drawn flat (a back-face "cap" child mesh) so a cut bone reads as a cross-section.
const JOINTS = CFG.joints || {};
const TISSUES = [
  ['bone', 'Bones', ['bone']],
  ['cartilage', 'Cartilage, menisci and labrum', ['cartilage', 'meniscus', 'labrum']],
  ['ligament', 'Ligaments and joint capsule', ['ligament', 'capsule']],
  ['fascia', 'Fascia (IT band, plantar fascia)', ['fascia']],
  ['tendon', 'Tendons', ['tendon']],
  ['disc', 'Discs', ['spinaldisc', 'jawdisc']],
  ['muscle', 'Muscles', ['muscle']],
  ['nerve', 'Nerves', ['nerve']],
  ['vessel', 'Blood vessels', ['artery', 'vein']],
  ['organ', 'Brain and eyes', ['brain', 'eye']],
  ['skin', 'Skin', ['skin']],
];
const TISSUE_OF_KIND = Object.fromEntries(TISSUES.flatMap(([k, , kinds]) => kinds.map((kd) => [kd, k])));
const tissueOf = (id) => TISSUE_OF_KIND[STRUCTURES[id].kind] || 'muscle';
const PRESETS = [['Bones only', ['bone']], ['Bones and ligaments', ['bone', 'ligament']], ['Bones, cartilage and ligaments', ['bone', 'cartilage', 'ligament', 'disc']],
  ['Bones and tendons', ['bone', 'tendon']], ['Bones and muscles', ['bone', 'muscle', 'tendon']], ['Bones, nerves and vessels', ['bone', 'nerve', 'vessel']]];
let jointBox = null, jointPlanes = null;
const _bb = new THREE.Box3();
function boxOfJoint(k) {
  const j = JOINTS[k]; if (!j) return null;
  const b = new THREE.Box3();
  for (const id of j.core) if (meshes[id]) { const g = meshes[id].geometry; if (!g.boundingBox) g.computeBoundingBox(); b.union(g.boundingBox); }
  if (b.isEmpty()) return null;
  const c = b.getCenter(new THREE.Vector3()); b.expandByScalar(j.pad ?? 3);
  // half: cut through the middle of the joint, like a scan slice (for example '-x' removes the outer half of the right jaw joint)
  if (j.half) { const ax = j.half[1]; if (j.half[0] === '-') b.min[ax] = c[ax]; else b.max[ax] = c[ax]; }
  return b;
}
function inJointBox(mesh) {
  if (!jointBox) return true;
  const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
  return _bb.copy(g.boundingBox).translate(mesh.position).intersectsBox(jointBox);
}
const inJoint = (p) => !jointBox || jointBox.containsPoint(p);
function setJoint(k, { fly = true } = {}) {
  state.joint = JOINTS[k] ? k : null;
  jointBox = state.joint ? boxOfJoint(state.joint) : null;
  if (!jointBox) state.joint = null;
  const b = jointBox;
  jointPlanes = b ? [new THREE.Plane(new THREE.Vector3(1, 0, 0), -b.min.x), new THREE.Plane(new THREE.Vector3(-1, 0, 0), b.max.x),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -b.min.y), new THREE.Plane(new THREE.Vector3(0, -1, 0), b.max.y),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -b.min.z), new THREE.Plane(new THREE.Vector3(0, 0, -1), b.max.z)] : null;
  if (state.selected && meshes[state.selected] && !inJointBox(meshes[state.selected])) select(null);
  applyVisibility();
  if (fly && b) {
    const j = JOINTS[state.joint], r = REGIONS[j.region] || {};
    const size = b.getSize(new THREE.Vector3()).length();
    zoomStack.length = 0;
    flyTo(b.getCenter(new THREE.Vector3()), new THREE.Vector3(...(j.dir || r.dir || CFG.home.dir)), Math.max(size * 1.9, CFG.minDistance || 6), 800);
  }
}
// flat cut faces: a back-face copy of the mesh, only drawn where the cut opens the inside of a surface
function updateCap(mesh, faded) {
  let cap = mesh.userData.cap;
  if (!jointPlanes) { if (cap) cap.visible = false; return; }
  if (!cap) {
    const c = mesh.material.color.clone().multiplyScalar(0.72);
    cap = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide }));
    cap.raycast = () => {}; mesh.userData.cap = cap; mesh.add(cap);
  }
  cap.material.clippingPlanes = jointPlanes; cap.material.needsUpdate = true;
  cap.visible = !faded;
}
function setTissues(list) {
  state.tissues = list && list.length ? new Set(list) : null;
  if (state.selected && meshes[state.selected] && state.tissues && !state.tissues.has(tissueOf(state.selected))) select(null);
  applyVisibility();
}
// a structure chosen from the list or a label must not stay hidden by the filter
function revealFor(id) {
  if (state.tissues && !state.tissues.has(tissueOf(id))) state.tissues.add(tissueOf(id));
  if (jointBox && meshes[id] && !inJointBox(meshes[id])) setJoint(null, { fly: false });
}
const PRESENT_TISSUES = () => TISSUES.filter(([k]) => Object.keys(meshes).some((id) => tissueOf(id) === k));
function renderShowChip() {
  let chip = $('#show-chip');
  if (!state.joint && !state.tissues) { if (chip) chip.hidden = true; return; }
  if (!chip) {
    chip = document.createElement('div'); chip.id = 'show-chip'; chip.className = 'show-chip';
    chip.innerHTML = '<span class="txt"></span><button class="chg">Change</button><button class="clr" aria-label="Show everything">Show all</button>';
    document.body.appendChild(chip);
    chip.querySelector('.chg').addEventListener('click', () => openShow());
    chip.querySelector('.clr').addEventListener('click', () => { setTissues(null); setJoint(null, { fly: false }); resetView(); });
  }
  chip.hidden = false;
  const parts = [];
  if (state.joint) parts.push(JOINTS[state.joint].label);
  if (state.tissues) { const names = TISSUES.filter(([k]) => state.tissues.has(k)).map(([, n]) => n.split(',')[0].split(' and ')[0]); parts.push(names.join(', ')); }
  chip.querySelector('.txt').textContent = parts.join(' · ');
}
function openShow() {
  const present = PRESENT_TISSUES();
  const on = (k) => !state.tissues || state.tissues.has(k);
  openDialog('Show', `
    <h3>Joint</h3>
    <div class="show-joints">
      <label><input type="radio" name="show-joint" value=""${!state.joint ? ' checked' : ''}> Whole ${esc(CFG.part)}</label>
      ${Object.entries(JOINTS).map(([k, j]) => `<label><input type="radio" name="show-joint" value="${k}"${state.joint === k ? ' checked' : ''}> ${esc(j.label)} only</label>`).join('')}
    </div>
    <h3>Tissues</h3>
    <div class="show-presets">${PRESETS.filter(([, l]) => l.some((k) => present.some(([p]) => p === k))).map(([n], i) => `<button data-preset="${i}">${n}</button>`).join('')}</div>
    <div class="show-tissues">${present.map(([k, n]) => `<label><input type="checkbox" value="${k}"${on(k) ? ' checked' : ''}> ${n}</label>`).join('')}</div>
    <div class="row"><button id="show-all">Show everything</button><button id="show-done" class="primary">Done</button></div>`);
  const body = $('#dlg-body');
  const readTissues = () => { const l = [...body.querySelectorAll('.show-tissues input:checked')].map((i) => i.value); return l.length === present.length ? null : l; };
  body.querySelectorAll('[name=show-joint]').forEach((r) => r.addEventListener('change', () => { if (r.checked) { setJoint(r.value || null); if (!r.value) resetView(); } }));
  body.querySelectorAll('.show-tissues input').forEach((c) => c.addEventListener('change', () => setTissues(readTissues() || [])));
  body.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const l = PRESETS[Number(b.dataset.preset)][1];
    body.querySelectorAll('.show-tissues input').forEach((c) => { c.checked = l.includes(c.value); });
    setTissues(readTissues() || []);
  }));
  $('#show-all').addEventListener('click', () => { setTissues(null); setJoint(null, { fly: false }); closeDialog(); resetView(); });
  $('#show-done').addEventListener('click', () => closeDialog());
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
  let t = Math.min(1, Math.max(0, (now - anim.t0) / anim.ms));
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

const VIEWS = Object.fromEntries(Object.entries(CFG.views).map(([k, v]) => [k, new THREE.Vector3(...v)]));
function setView(name) {
  const dist = camera.position.distanceTo(controls.target);
  flyTo(state.selected ? focusCenter(state.selected) : controls.target.clone(), VIEWS[name], dist);
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
}
function resetView() { goRegion(CFG.home.region); }

function focusCenter(id) {
  const g = meshes[id].geometry; const s = g.boundingSphere.clone();
  // long bones and muscles: focus on the end nearest to where the camera is looking
  if (s.radius > 7) {
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox; const ty = controls.target.y;
    const margin = Math.min(6, (b.max.y - b.min.y) / 2);
    const y = THREE.MathUtils.clamp(ty, b.min.y + margin, b.max.y - margin);
    const res = g.boundsTree.closestPointToPoint(new THREE.Vector3(s.center.x, y, s.center.z));
    s.center.set(s.center.x, y, s.center.z).lerp(res.point, 0.5);
  }
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
function select(id, { glass = true } = {}) {
  setHighlight(id);
  state.selected = id; state.glass = glass;
  const panel = $('#info');
  if (!id) { panel.classList.add('hidden'); $('#picker').value = ''; state.isolate = false; applyVisibility(); frameFreeArea(); return; }
  revealFor(id);
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
  // double-click / double-tap: zoom in to the body part, then closer to the spot (not while placing an injury)
  const now = performance.now();
  const dbl = lastTap.t && now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
  lastTap = dbl ? { t: 0 } : { t: now, x: e.clientX, y: e.clientY };
  clearTimeout(pendingTap);
  if (dbl && !(state.mode === 'injury' && state.step === 3 && !PATIENT)) return zoomToTap();
  if (state.mode === 'injury') return PATIENT ? undefined : injuryTap();
  // a single tap selects, but wait a moment in case it is the first half of a double-tap
  const hit = pickHit(), id = hit ? hit.object.userData.id : null;
  pendingTap = setTimeout(() => select(id), 260);
});
let pendingTap = 0;
// in glass focus everything else is faded, so allow picking any visible structure
function pickHit() {
  const pickable = Object.values(meshes).filter((m) => m.visible && (!m.userData.faded || (state.selected && !state.xray)));
  return ray.intersectObjects(pickable, false).filter((h) => fadeAt(h.point) > 0.5 && inJoint(h.point))[0] || null;
}

// ---------- double-tap zoom levels ----------
// Each double-tap saves the current view and flies in: first to the body part, then closer to the tapped spot.
// Zooming out (scroll, pinch or the zoom buttons) past the level steps back one level; the last step returns
// to the view from before the first double-tap. Double-tapping empty space goes straight back.
const zoomStack = []; let zoomLevelDist = 0, zoomQuietUntil = 0, zoomHintShown = false;
function zoomToTap() {
  const hit = pickHit();
  if (!hit) { if (zoomStack.length) zoomHome(); return; }
  const p = hit.point.clone(), id = hit.object.userData.id;
  const dir = camera.position.clone().sub(controls.target).normalize();
  const cur = camera.position.distanceTo(controls.target);
  zoomStack.push({ pos: camera.position.clone(), target: controls.target.clone(), dist: zoomLevelDist, selected: state.selected });
  let dist;
  if (zoomStack.length === 1) {
    dist = Math.min(cur * 0.7, focusRadius(id) * 4 + (CFG.zoomPad || 9));
    if (state.mode === 'explore') select(id, { glass: false }); // show what it is, keep its surroundings solid
  } else dist = Math.max(controls.minDistance + 0.5, cur * 0.5);
  zoomLevelDist = dist;
  flyTo(p, dir, dist, 700);
  if (!zoomHintShown) { zoomHintShown = true; toast('Double-tap a spot to look closer. Zoom out to go back.', 3200); }
}
function zoomBack() {
  const v = zoomStack.pop(); if (!v) return;
  zoomLevelDist = v.dist;
  flyTo(v.target, v.pos.clone().sub(v.target), v.pos.distanceTo(v.target), 650);
  if (!zoomStack.length && state.mode === 'explore') select(null); // back to the normal view
}
function zoomHome() { const first = zoomStack[0]; zoomStack.length = 0; if (first) { zoomStack.push(first); zoomBack(); } }
controls.addEventListener('change', () => {
  if (anim) { zoomQuietUntil = performance.now() + 450; return; }
  if (!zoomStack.length || performance.now() < zoomQuietUntil) return;
  if (camera.position.distanceTo(controls.target) > zoomLevelDist * 1.45) zoomBack();
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
  const hits = ray.intersectObjects(Object.values(meshes).filter((m) => m.visible && !m.userData.faded), false).filter((h) => fadeAt(h.point) > 0.5 && inJoint(h.point));
  const hit = hits.find((h) => pickable.includes(h.object));
  if (hit) chooseInjTarget(hit.object.userData.id);
}

// ---------- injury mode ----------
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  document.body.classList.toggle('mode-injury', mode === 'injury');
  $('#injury').classList.toggle('hidden', mode !== 'injury');
  // vessels and nerves hide in injury mode so ligaments and bones are easy to reach (the button brings them back)
  if (mode === 'injury') { select(null); setVessels(false); setStep(state.injTarget ? 2 : 1); }
  else { setVessels(true); setHighlight(null); frameFreeArea(); }
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
  return { title: `${info.short.replace(/^./, (c) => c.toUpperCase())}: ${t.label.replace(/^(?!Grade)./, (c) => c.toLowerCase())}`, text: t.say(info.short, info) };
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

let lastTap = { t: 0 };
function toggleIsolate(on) {
  state.isolate = on ?? !state.isolate; state.glass = true; $('#isolate').setAttribute('aria-pressed', String(state.isolate)); applyVisibility();
  if (state.isolate) zoomStructure(0);
}

// ---------- spread apart ----------
// which structures move, and where to (cm at full spread)
const SPREAD = CFG.spread;
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
  const camDist = camera.position.distanceTo(controls.target);
  for (const el of layer.children) {
    const id = el.dataset.id, mesh = meshes[id];
    const show = mesh.visible && (!mesh.userData.faded || id === state.selected) && (!state.selected || state.isolate ? true : true);
    if (!show) { el.style.display = 'none'; continue; }
    _lp.copy(labelAnchors[id]).add(mesh.position);
    if (fadeAt(_lp) < 0.6 || !inJoint(_lp) || _lp.distanceTo(controls.target) > camDist * 0.32) { el.style.display = 'none'; continue; }
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
      const lx = THREE.MathUtils.clamp(side ? colX.true - lw : colX.false, 4, Math.max(4, w - lw - 4));
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
  // left leg: the picture is mirrored, so show the mirrored rotation (S R S, still a rotation) with Inside and Outside swapped
  if (state.side === 'left') { e[1] = -e[1]; e[2] = -e[2]; e[4] = -e[4]; e[8] = -e[8]; }
  // CSS has Y down: flip Y components
  $('#cube').style.transform = `translateZ(-32px) matrix3d(${e[0]},${-e[1]},${e[2]},0,${-e[4]},${e[5]},${-e[6]},0,${e[8]},${-e[9]},${e[10]},0,0,0,0,1)`;
}

const fadeAt = (p) => fadeP(p.x, p.y, p.z);

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
  $('#peel').addEventListener('input', (e) => { state.peel = Number(e.target.value); state.tissues = null; applyVisibility(); if (state.selected && !meshes[state.selected].visible) select(null); });
  $('#zoom-in').addEventListener('click', () => zoomStructure(0.7));
  $('#zoom-out').addEventListener('click', () => zoomStructure(1.4));
  $('#zoom-reset').addEventListener('click', () => zoomStructure(0));
  $('#reset').addEventListener('click', () => { select(null); resetView(); });
  $('#info-close').addEventListener('click', () => select(null));
  $('#isolate').addEventListener('click', () => toggleIsolate());
  $('#vessels').addEventListener('click', () => { if (state.tissues) { state.tissues = null; setVessels(true); } else setVessels(!state.vessels); });
  { const b = document.createElement('button'); b.id = 'show'; b.className = 'toggle'; b.textContent = 'Show…'; b.title = 'Show one joint only, or only some tissues (for example bones and ligaments)';
    $('#vessels').after(b); b.addEventListener('click', () => openShow()); }
  $('#labels').addEventListener('click', () => { state.labels = !state.labels; $('#labels').setAttribute('aria-pressed', String(state.labels)); });
  $('#spread').addEventListener('input', (e) => { state.spread = Number(e.target.value); applySpread(); });
  document.querySelectorAll('#cube .face').forEach((f) => f.addEventListener('click', () => {
    const v = f.dataset.face;
    if (v === 'top') flyTo(controls.target.clone(), new THREE.Vector3(0.001, 1, 0.02), camera.position.distanceTo(controls.target));
    else if (v === 'bottom') flyTo(controls.target.clone(), new THREE.Vector3(0.001, -1, 0.02), camera.position.distanceTo(controls.target));
    else setView(v);
  }));
  document.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => { setSide(b.dataset.side); toast(`${b.dataset.side === 'left' ? 'Left' : 'Right'} ${CFG.part} (mirror image of the scanned right ${CFG.part})`); }));
  if (EMBED) { // inside a website: offer the full page in a new tab (keeps the current view and injuries)
    const a = document.createElement('a'); a.className = 'btnlink embed-only'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open full screen';
    a.addEventListener('click', async () => { const u = new URL(await shareLink()); u.searchParams.delete('embed'); a.href = u.toString(); });
    a.href = location.href; $('.modes').appendChild(a);
  }
  { // switch to another body part, keeping patient and embed mode
    const PAGES = [['index.html', 'Leg'], ['hand.html', 'Hand'], ['shoulder.html', 'Shoulder'], ['spine.html', 'Spine and pelvis'], ['head.html', 'Skull and face'], ['body.html', 'Whole body']];
    const here = { leg: 'index.html', hand: 'hand.html', shoulder: 'shoulder.html', spine: 'spine.html', head: 'head.html' }[LIMB];
    const sel = $('#part-nav');
    if (sel) {
      sel.innerHTML = PAGES.filter(([p]) => !(EMBED && p === 'body.html')).map(([p, t]) => `<option value="${p}"${p === here ? ' selected' : ''}>${t}</option>`).join('');
      sel.addEventListener('change', () => { const keep = new URLSearchParams(); for (const k of ['patient', 'embed']) if (QS.get(k)) keep.set(k, QS.get(k)); const q = keep.toString(); location.href = `./${sel.value}${q ? '?' + q : ''}`; });
    }
  }
  $('#version').textContent = `v${APP_VERSION}`;
  const reg = $('#region');
  reg.innerHTML = '<option value="">Go to…</option>' + Object.entries(REGIONS).map(([k, r]) => `<option value="${k}">${r.label}</option>`).join('');
  reg.addEventListener('change', () => goRegion(reg.value));
  buildPicker();
  wireInjuryUI();
  wireShareUI();
}

// ---------- share codes, image download, named cases ----------
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
function openDialog(title, html) { $('#dlg-title').textContent = title; $('#dlg-body').innerHTML = html; $('#dlg').classList.remove('hidden'); }
function closeDialog() { $('#dlg').classList.add('hidden'); }
const getSnap = () => snapshot({ state, camera, controls, injuries });
function applySnap(sn) {
  anim = null;
  setSide(sn.sd ? 'left' : 'right');
  setMode(sn.m === 1 ? 'injury' : 'explore');
  state.peel = sn.p ?? 2; $('#peel').value = String(state.peel);
  state.xray = !!sn.x;
  state.spread = sn.s || 0; $('#spread').value = String(state.spread); applySpread();
  state.labels = !!sn.l; $('#labels').setAttribute('aria-pressed', String(state.labels));
  setVessels(!!sn.ve);
  state.tissues = sn.t ? new Set(sn.t) : null; setJoint(sn.j || null, { fly: false });
  if (sn.c) { camera.position.set(sn.c[0], sn.c[1], sn.c[2]); controls.target.set(sn.c[3], sn.c[4], sn.c[5]); controls.update(); }
  injuries.set(injuryList(sn).filter((j) => meshes[j.id] && injuries.targets[j.id])); renderInjuryList();
  if (sn.m !== 1) select(sn.sel && meshes[sn.sel] ? sn.sel : null);
  applyVisibility();
}
// add ?name=1 to a link, before its #hash
function withParam(url, name) { const u = new URL(url); u.searchParams.set(name, '1'); return u.toString(); }
function iframeCode(src) { return `<iframe src="${src}" title="${CFG.title}" width="100%" height="640" style="border:0;border-radius:12px;max-width:1100px" allow="fullscreen; clipboard-write; web-share" loading="lazy"></iframe>`; }
async function shareLink(snap = getSnap()) { return `${location.origin}${location.pathname}${PATIENT ? '?patient=1' : ''}#c=${await encode(snap)}`; }
async function openShare(snap) {
  const url = await shareLink(snap);
  let copied = false; try { await navigator.clipboard.writeText(url); copied = true; } catch { /* clipboard blocked: the box below still has it */ }
  openDialog('Share this view', `<p class="note">${copied ? '<b>Link copied.</b> ' : ''}The link reopens this exact view and these injuries on any device.
    Everything is inside the link itself; nothing is stored on a server and it holds no patient details.</p>
    <div class="row"><input type="text" id="share-url" readonly value="${esc(url)}" aria-label="Share link"><button id="share-copy">Copy</button></div>
    ${navigator.share ? '<button id="share-native">Send…</button>' : ''}
    <h3>For a patient</h3>
    <p class="note">The same view, but view-only: the patient can turn, zoom and tap to read, and cannot change the injuries.</p>
    <div class="row"><input type="text" id="share-patient" readonly value="${esc(withParam(url, 'patient'))}" aria-label="Patient link"><button data-copy="share-patient">Copy</button></div>
    <h3>Put it on a website</h3>
    <p class="note">Paste this code into a page of the clinic website. Use the second one for patients (view-only).</p>
    <div class="row"><input type="text" id="share-embed" readonly value="${esc(iframeCode(withParam(url, 'embed')))}" aria-label="Embed code"><button data-copy="share-embed">Copy</button></div>
    <div class="row"><input type="text" id="share-embed-p" readonly value="${esc(iframeCode(withParam(withParam(url, 'embed'), 'patient')))}" aria-label="Embed code for patients"><button data-copy="share-embed-p">Copy</button></div>`);
  $('#dlg-body').querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => { const inp = $('#' + b.dataset.copy); try { await navigator.clipboard.writeText(inp.value); toast('Copied'); } catch { inp.select(); toast('Press Ctrl+C or Cmd+C to copy'); } }));
  $('#dlg-body').querySelectorAll('input').forEach((i) => i.addEventListener('focus', (e) => e.target.select()));
  $('#share-url').addEventListener('focus', (e) => e.target.select());
  $('#share-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { $('#share-url').select(); toast('Press Ctrl+C or Cmd+C to copy'); } });
  $('#share-native')?.addEventListener('click', () => navigator.share({ title: CFG.title, url }).catch(() => {}));
}
function wrapText(g, text, maxW) {
  const words = text.split(/\s+/), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
async function saveImage() {
  renderer.render(scene, camera);
  const w = canvas.width, h = canvas.height, k = w / canvas.clientWidth;
  const list = injuries ? injuries.list : [];
  const side = list.length ? Math.round(340 * k) : 0, foot = Math.round(58 * k);
  const out = document.createElement('canvas'); out.width = w + side; out.height = h + foot;
  const g = out.getContext('2d');
  g.fillStyle = '#0b0f14'; g.fillRect(0, 0, out.width, out.height);
  g.drawImage(canvas, 0, 0);
  // labels and leader lines, as on screen
  if (state.labels) {
    g.strokeStyle = 'rgba(233,238,244,0.7)'; g.fillStyle = 'rgba(233,238,244,0.9)'; g.lineWidth = 1 * k;
    for (const l of $('#leaders').querySelectorAll('line')) { g.beginPath(); g.moveTo(+l.getAttribute('x1') * k, +l.getAttribute('y1') * k); g.lineTo(+l.getAttribute('x2') * k, +l.getAttribute('y2') * k); g.stroke(); }
    g.font = `600 ${12 * k}px system-ui, sans-serif`; g.textBaseline = 'middle';
    for (const el of $('#labels-layer').children) {
      if (el.style.display === 'none') continue;
      const x = el.offsetLeft * k, y = el.offsetTop * k, bw = el.offsetWidth * k, bh = el.offsetHeight * k;
      g.fillStyle = 'rgba(11,15,20,0.78)'; g.beginPath(); g.roundRect(x, y, bw, bh, 6 * k); g.fill();
      g.fillStyle = '#e9eef4'; g.fillText(el.textContent, x + 6 * k, y + bh / 2);
    }
  }
  // numbered injury tags
  const v = new THREE.Vector3();
  list.forEach((inj, i) => {
    v.copy(injuries.tagPoint(inj)).addScaledVector(new THREE.Vector3().fromArray(inj.anchor.n), 0.35).project(camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h, r = 11 * k;
    g.fillStyle = '#e5484d'; g.strokeStyle = '#fff'; g.lineWidth = 2 * k; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = `700 ${12 * k}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), x, y + 0.5 * k); g.textAlign = 'left';
  });
  // injury list on the right
  if (side) {
    let y = 28 * k; const x0 = w + 18 * k, maxW = side - 34 * k;
    g.fillStyle = '#9aa7b6'; g.font = `700 ${12 * k}px system-ui, sans-serif`; g.textBaseline = 'alphabetic'; g.fillText('INJURIES SHOWN', x0, y); y += 22 * k;
    list.forEach((inj, i) => {
      const s = injurySentence(inj);
      g.fillStyle = '#e5484d'; g.beginPath(); g.arc(x0 + 9 * k, y - 4 * k, 9 * k, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = `700 ${11 * k}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillText(String(i + 1), x0 + 9 * k, y); g.textAlign = 'left';
      g.font = `700 ${13 * k}px system-ui, sans-serif`; g.fillStyle = '#e9eef4';
      for (const ln of wrapText(g, s.title + '.', maxW - 26 * k)) { g.fillText(ln, x0 + 26 * k, y); y += 17 * k; }
      g.font = `${13 * k}px system-ui, sans-serif`; g.fillStyle = '#c9d2dc';
      for (const ln of wrapText(g, s.text, maxW - 26 * k)) { g.fillText(ln, x0 + 26 * k, y); y += 17 * k; }
      y += 12 * k;
    });
  }
  // footer: what it is, the disclaimer and the credit
  g.fillStyle = '#e9eef4'; g.font = `700 ${13 * k}px system-ui, sans-serif`; g.textBaseline = 'alphabetic';
  g.fillText(`${CFG.title} v${APP_VERSION} · ${state.side} ${CFG.part} · ${new Date().toLocaleDateString()}`, 16 * k, h + 22 * k);
  g.fillStyle = '#ff8a8e'; const dis = 'Educational illustration, not for diagnosis.'; g.fillText(dis, out.width - 16 * k - g.measureText(dis).width, h + 22 * k);
  g.fillStyle = '#9aa7b6'; g.font = `${11 * k}px system-ui, sans-serif`;
  g.fillText(`Anatomy: BodyParts3D, © The Database Center for Life Science, CC BY 4.0 (modified). ${CFG.modelledNote}${CFG.preview ? ' Preview, pending doctor review.' : ''}`, 16 * k, h + 42 * k);
  const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${CFG.part}-explainer-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Image saved to your downloads');
}
function openCases() {
  const list = listCases();
  const n = injuries ? injuries.list.length : 0;
  openDialog('Cases', `<p class="note">Save this view and its ${n} ${n === 1 ? 'injury' : 'injuries'} under a name. Cases stay on this device only.
    Use a short label such as "ACL tear, side view", not a patient's name.</p>
    <div class="row"><input type="text" id="case-name" maxlength="60" placeholder="Name this case" aria-label="Case name"><button id="case-save">Save</button></div>
    ${list.length ? '' : '<p class="note">No saved cases yet.</p>'}
    <ul class="cases">${list.map((c, i) => `<li data-i="${i}"><span class="nm">${esc(c.name)}<small>${esc(new Date(c.at).toLocaleString())} · ${(c.snap.i || []).length} injuries</small></span>
      <button data-act="open">Open</button><button data-act="share">Share</button><button data-act="ren" aria-label="Rename ${esc(c.name)}">Rename</button><button data-act="del" aria-label="Delete ${esc(c.name)}">×</button></li>`).join('')}</ul>`);
  const name = $('#case-name');
  const doSave = () => {
    const nm = name.value.trim(); if (!nm) { name.focus(); return; }
    const exists = list.some((c) => c.name === nm);
    if (exists && name.dataset.confirm !== nm) { name.dataset.confirm = nm; toast(`"${nm}" exists. Press Save again to replace it.`); return; }
    if (saveCase(nm, getSnap())) { toast(`Saved "${nm}"`); openCases(); } else toast('This browser is blocking storage, so cases cannot be saved here. Use Share instead.', 4500);
  };
  $('#case-save').addEventListener('click', doSave);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });
  $('#dlg-body').querySelectorAll('.cases button').forEach((b) => b.addEventListener('click', () => {
    const li = b.closest('li'), c = list[Number(li.dataset.i)];
    if (b.dataset.act === 'open') { applySnap(c.snap); closeDialog(); toast(`Opened "${c.name}"`); }
    if (b.dataset.act === 'share') openShare(c.snap);
    if (b.dataset.act === 'del') { if (b.dataset.sure) { deleteCase(c.name); openCases(); } else { b.dataset.sure = '1'; b.textContent = 'Delete?'; b.classList.add('danger'); } }
    if (b.dataset.act === 'ren') {
      const nm = li.querySelector('.nm'); nm.innerHTML = `<input type="text" maxlength="60" value="${esc(c.name)}" aria-label="New name">`;
      const inp = nm.querySelector('input'); inp.focus(); inp.select();
      b.textContent = 'OK'; b.dataset.act = 'ren-ok';
      const ok = () => { const to = inp.value.trim(); if (to && to !== c.name && !renameCase(c.name, to)) { toast('That name is taken'); return; } openCases(); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      b.addEventListener('click', ok, { once: true });
    }
  }));
}
function wireShareUI() {
  $('#share').addEventListener('click', () => openShare());
  $('#snap').addEventListener('click', () => saveImage());
  $('#cases').addEventListener('click', () => openCases());
  $('#dlg-close').addEventListener('click', closeDialog);
  $('#more').addEventListener('click', () => { const tb = $('.toolbar'); const open = tb.classList.toggle('open'); $('#more').setAttribute('aria-expanded', String(open)); $('#more').textContent = open ? 'Less' : 'More'; frameFreeArea(); });
}
async function openFromHash() {
  const m = location.hash.match(/^#c=([A-Za-z0-9_-]+)/); if (!m) return;
  try { applySnap(await decode(m[1])); toast('Opened a shared view'); } catch { toast('This share link could not be opened. It may be cut short.', 4500); }
}
window.addEventListener('hashchange', openFromHash);

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
  document.documentElement.style.setProperty('--tbh', `${$('.toolbar').offsetHeight}px`);
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
  camera.position.copy(HOME_TARGET).add(HOME_DIR.clone().normalize().multiplyScalar(HOME_DIST));
  controls.target.copy(HOME_TARGET);
  const t0 = performance.now();
  await loadAnatomy();
  injuries = new InjuryManager(scene, meshes);
  computeLabelAnchors(); buildLabels();
  applyVisibility();
  // test hooks
  window.__knee = { meshes, setJoint, setTissues, openShow, getSnap, applySnap, shareLink, saveImage, openCases, openShare, goRegion, REGIONS, setVessels, injuries, state, setMode, chooseInjTarget, renderInjuryList, THREE, camera, controls, flyTo, VIEWS, setView,
    look(i, dist = 9, dir) { const inj = injuries.list[i]; const p = injuries.tagPoint(inj); const n = dir ? new THREE.Vector3(...dir).normalize() : new THREE.Vector3().fromArray(inj.anchor.n);
      anim = null; controls.target.copy(p); camera.position.copy(p).addScaledVector(n, dist); controls.update(); },
    addAt(id, type, frac, side = 0) { // frac along a swept structure, or [x,y,z] near a bone
      const m = meshes[id]; let p;
      if (Array.isArray(frac)) p = new THREE.Vector3(...frac);
      else { const rings = m.geometry.userData.rings; const r = rings[Math.round(frac * (rings.length - 1))]; p = r.center.clone(); if (side) p.addScaledVector(r.side, side); }
      const inj = injuries.add(id, type, injuries.anchorFor(id, p), 0.37); renderInjuryList(); return inj; } };
  // test hooks for screenshots
  const qs = new URLSearchParams(location.search);
  setSide(qs.get('side') === 'left' ? 'left' : 'right');
  if (qs.get('vessels') === '0') setVessels(false);
  if (qs.has('hide')) { for (const k of qs.get('hide').split(',')) for (const id of Object.keys(meshes)) if (id === k || STRUCTURES[id].kind === k) state.hidden.add(id); applyVisibility(); }
  if (qs.has('tissues')) setTissues(qs.get('tissues').split(','));
  if (qs.has('joint')) setJoint(qs.get('joint'), { fly: !qs.has('cam') });
  if (qs.has('peel')) { state.peel = Number(qs.get('peel')); $('#peel').value = qs.get('peel'); applyVisibility(); }
  if (qs.has('xray')) { state.xray = true; applyVisibility(); }
  if (qs.has('labels')) { state.labels = true; }
  if (qs.has('spread')) { state.spread = Number(qs.get('spread')); $('#spread').value = qs.get('spread'); applySpread(); }
  if (qs.has('region')) { const r = REGIONS[qs.get('region')]; controls.target.set(...r.target); camera.position.copy(controls.target).add(new THREE.Vector3(...r.dir).normalize().multiplyScalar(r.dist)); $('#region').value = qs.get('region'); }
  if (qs.has('view')) { const v = VIEWS[qs.get('view')]; const d = camera.position.distanceTo(controls.target); camera.position.copy(controls.target).add(v.clone().normalize().multiplyScalar(d)); }
  if (qs.has('cam')) { // test hook: cam=dx,dy,dz,dist[,tx,ty,tz]
    const [x, y, z, d, tx, ty, tz] = qs.get('cam').split(',').map(Number);
    if (tx !== undefined) controls.target.set(tx, ty, tz);
    camera.position.copy(controls.target).add(new THREE.Vector3(x, y, z).normalize().multiplyScalar(d || HOME_DIST));
  }
  if (qs.has('sel')) { select(qs.get('sel')); if (qs.has('iso')) toggleIsolate(true); if (qs.has('zoom')) { anim = null; const c = focusCenter(state.selected); const d = camera.position.clone().sub(controls.target).normalize(); camera.position.copy(c).add(d.multiplyScalar(focusRadius(state.selected) * 5 + 9)); controls.target.copy(c); } }
  await openFromHash();
  $('#loading').classList.add('done');
  window.__ready = { loadMs: Math.round(performance.now() - t0) };
  requestAnimationFrame(loop);
})();
