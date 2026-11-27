import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { STRUCTURES, LAYERS, CFG, LIMB, CARTILAGE_OF } from './limbs.js';
import { makeMaterials } from './materials.js';
import { InjuryManager, injuryTypesFor, injuryKind, typeInfo } from './injuries.js';
import './style.css';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

import { APP_VERSION } from './version.js';
import { snapshot, injuryList, encode, decode, listCases, saveCase, deleteCase, renameCase } from './cases.js';
import { COMMON } from './catalog.js';
import { qrSvg, initBigText } from './qr.js';
// every structure gets a short name for sentences ("the biceps femoris is …"); muscles, vessels and skin only have a full name
for (const s of Object.values(STRUCTURES)) if (!s.short && s.name) s.short = s.name.replace(/^([A-Z])(?![A-Z])/, (c) => c.toLowerCase());
import { mountSearch, mountNav } from './search.js';
import { createModesty, modestyButton, REGIONS as PRIVATE } from './modesty.js';
import { tapStart, isTap, fingerPick, lockPageZoom } from './touch.js';
import { mountChat } from './chat.js';
lockPageZoom();
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

// Private parts (the leg's skin reaches the groin, the spine page's skin the top of the genitals):
// blurred unless a clinician shows them; a patient link shows them only if the clinician chose so when sharing.
const modesty = createModesty(renderer, {
  region: PRIVATE[LIMB] || null,
  active: () => !!meshes.skin?.visible,
  occluders: () => Object.values(meshes).filter((m) => m.visible && !m.material.transparent),
});
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
  document.querySelectorAll('#inj-picker option[value]').forEach((op) => { if (op.value && STRUCTURES[op.value]) op.textContent = STRUCTURES[op.value].name; });
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
  // soft tissue: bring its layer back (muscle, skin) and the vessels and nerves when one of them is injured
  const info = STRUCTURES[id];
  if (info && !state.tissues && info.layer < state.peel) { state.peel = info.layer; $('#peel').value = String(state.peel); applyVisibility(); }
  if (info && VESSEL_KINDS.has(info.kind) && !state.vessels) setVessels(true);
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
  document.body.classList.toggle('pt-reading', PATIENT && !!id);
  if (!id) { panel.classList.add('hidden'); state.isolate = false; applyVisibility(); frameFreeArea(); return; }
  revealFor(id);
  const info = STRUCTURES[id];
  $('#info-group').textContent = info.group;
  $('#info-name').textContent = info.name;
  $('#info-what').textContent = info.what;
  $('#info-injuries').innerHTML = info.injuries.map((t) => `<li>${t}</li>`).join('');
  $('#info-note').hidden = !info.simplified;
  state.isolate = false; $('#isolate').setAttribute('aria-pressed', 'false');
  panel.classList.remove('hidden');
  if (PATIENT && state.mode === 'injury' && innerWidth <= 760) setPatientCard(false);
  frameFreeArea();
  // make sure the structure is visible, and turn everything else to glass
  if (info.layer < state.peel) { state.peel = info.layer; $('#peel').value = String(state.peel); }
  applyVisibility();
}

// ---------- picking (tap vs drag) ----------
const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
let down = null;
canvas.addEventListener('pointerdown', (e) => { if (e.isPrimary) down = tapStart(e); });
canvas.addEventListener('pointercancel', () => { down = null; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !e.isPrimary) return;
  const d = down; down = null;
  if (!isTap(d, e)) return;
  const r = canvas.getBoundingClientRect();
  const aim = (x, y) => ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
  // a fingertip is wider than a ligament or nerve: if the exact point misses, aim at the nearest part around it
  // (not when placing an injury on its exact spot, which snaps to the chosen structure anyway)
  const exactSpot = state.mode === 'injury' && state.step === 3 && !PATIENT;
  const near = exactSpot ? null : fingerPick(e.clientX, e.clientY, d.touch, (x, y) => { aim(x, y); return state.mode === 'injury' && !PATIENT ? injuryHit() : pickHit(); });
  if (near) aim(near.x, near.y); else aim(e.clientX, e.clientY);
  // double-click / double-tap: zoom in to the body part, then closer to the spot (not while placing an injury)
  const now = performance.now();
  const dbl = lastTap.t && now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
  lastTap = dbl ? { t: 0 } : { t: now, x: e.clientX, y: e.clientY };
  clearTimeout(pendingTap);
  if (dbl && !(state.mode === 'injury' && state.step === 3 && !PATIENT)) return zoomToTap();
  if (state.mode === 'injury' && !PATIENT) return injuryTap();
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
    // a tap on the bone's cartilage counts as a tap on the bone (chondromalacia goes on the cartilage behind the kneecap)
    const cart = (CARTILAGE_OF[state.injTarget] || []).map((c) => meshes[c]).filter((m) => m && m.visible && !m.userData.faded);
    const hit = ray.intersectObjects([mesh, ...cart], false)[0];
    let point;
    if (hit) point = hit.point;
    else { // snap: closest point on the structure to the tap ray
      const c = focusCenter(state.injTarget);
      point = ray.ray.closestPointToPoint(c, new THREE.Vector3());
    }
    const anchor = injuries.anchorFor(state.injTarget, point);
    const before = injuries.list.slice();
    if (!injuries.add(state.injTarget, state.injType, anchor)) { $('#inj-tap-msg').textContent = 'This structure already has the maximum of 6 injuries.'; return; }
    injUndo.push(before); injRedo.length = 0; updateInjHist();
    renderInjuryList();
    setStep(2);
    return;
  }
  const hit = injuryHit();
  if (hit) chooseInjTarget(hit.object.userData.id);
}
// the first structure under the ray that can be injured
const CART_PICK = { patellar_cartilage: 'patella' };
function injuryHit() {
  const pickable = Object.values(meshes).filter((m) => m.visible && !m.userData.faded && injuryKind(m.userData.id));
  const hits = ray.intersectObjects(Object.values(meshes).filter((m) => m.visible && !m.userData.faded), false).filter((h) => fadeAt(h.point) > 0.5 && inJoint(h.point));
  // the cartilage behind the kneecap picks the kneecap, whose list holds chondromalacia
  return hits.map((h) => CART_PICK[h.object.userData.id] && meshes[CART_PICK[h.object.userData.id]] ? { ...h, object: meshes[CART_PICK[h.object.userData.id]] } : h).find((h) => pickable.includes(h.object)) || null;
}

// ---------- undo / redo of injuries (arrows at the top left, only while placing injuries) ----------
const injUndo = [], injRedo = [];
function updateInjHist() {
  const h = $('#hist'); if (!h) return;
  h.hidden = state.mode !== 'injury' || PATIENT;
  $('#h-undo').disabled = !injUndo.length; $('#h-redo').disabled = !injRedo.length;
  placeInjHist();
}
function placeInjHist() { // just below the mode buttons, wherever they wrap to
  const h = $('#hist'), m = document.querySelector('.modes'); if (!h || h.hidden || !m) return;
  h.style.top = `${Math.round(m.getBoundingClientRect().bottom + 8)}px`;
  const r = h.getBoundingClientRect(), root = document.documentElement.style; // the "Showing" chip sits beside the arrows
  root.setProperty('--hist-top', `${Math.round(r.top + (r.height - 40) / 2)}px`); root.setProperty('--hist-right', `${Math.round(r.right + 10)}px`);
}
function recordInj() { injUndo.push(injuries.list.slice()); if (injUndo.length > 200) injUndo.shift(); injRedo.length = 0; updateInjHist(); }
function resetInjHist() { injUndo.length = 0; injRedo.length = 0; updateInjHist(); }
function restoreInj(list) { injuries.set(list); state.lastQuick = null; $('#inj-move').hidden = true; renderInjuryList(); updateInjHist(); }
function injUndoStep() { if (!injUndo.length) return; injRedo.push(injuries.list.slice()); restoreInj(injUndo.pop()); }
function injRedoStep() { if (!injRedo.length) return; injUndo.push(injuries.list.slice()); restoreInj(injRedo.pop()); }
function mountInjHist() {
  if (PATIENT || $('#hist')) return;
  const h = document.createElement('div');
  h.id = 'hist'; h.className = 'hist'; h.hidden = true; h.setAttribute('role', 'group'); h.setAttribute('aria-label', 'Undo and redo injuries');
  h.innerHTML = `<button id="h-undo" disabled aria-label="Undo" title="Undo (Ctrl+Z)"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Undo</span></button>`
    + `<button id="h-redo" disabled aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><span>Redo</span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  document.querySelector('.modes').after(h);
  $('#h-undo').addEventListener('click', injUndoStep);
  $('#h-redo').addEventListener('click', injRedoStep);
  addEventListener('keydown', (e) => {
    if (state.mode !== 'injury' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); injUndoStep(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); injRedoStep(); }
  });
  addEventListener('resize', placeInjHist);
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
  updateInjHist();
}
function setStep(n) {
  state.step = n;
  $('#inj-step1').hidden = n !== 1; $('#inj-step2').hidden = n !== 2; $('#inj-step3').hidden = n !== 3;
  document.querySelectorAll('.steps span').forEach((sp) => { const k = Number(sp.dataset.step); sp.classList.toggle('on', k === n); sp.classList.toggle('done', k < n); });
  if (n === 1) { state.injTarget = null; setHighlight(null); $('#inj-picker').value = ''; }
  if (n !== 2) $('#inj-move').hidden = true;
  renderInjuryList();
  frameFreeArea();
}
function chooseInjTarget(id) {
  revealFor(id);
  $('#inj-move').hidden = true;
  state.injTarget = id; setHighlight(id); ensureVisible(id);
  const info = STRUCTURES[id], kind = injuryKind(id);
  $('#inj-target-group').textContent = info.group;
  $('#inj-target').textContent = info.name;
  { let hdr = false; $('#inj-types').innerHTML = injuryTypesFor(id).map((t) => { const h = t.treatment && !hdr ? (hdr = true, '<div class="inj-types-head">After treatment</div>') : ''; return `${h}<button data-type="${t.type}">${t.label}<small>${t.sub}</small></button>`; }).join(''); }
  $('#inj-types').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.injType = Number(b.dataset.type);
    $('#inj-tap-msg').textContent = `Now tap the exact spot on the ${info.short} where the ${typeInfo(kind, state.injType).label.toLowerCase()} should appear.`;
    setStep(3);
  }));
  setStep(2);
}
function injurySentence(inj) {
  const info = STRUCTURES[inj.id]; const t = typeInfo(injuryKind(inj.id), inj.type);
  // muscles, vessels and skin have no short name: use the full name, lower case unless it starts with an abbreviation
  const short = info.short || info.name.replace(/^([A-Z])(?![A-Z])/, (c) => c.toLowerCase());
  return { title: `${short.replace(/^./, (c) => c.toUpperCase())}: ${t.label.replace(/^(?!Grade)./, (c) => c.toLowerCase())}`, text: t.say(short, info) };
}
// A herniated disc on the spine page links to Spine Movement with that disc pushed back toward its nerve root
// (paracentral, a protrusion), so the patient can see which nerve it presses on.
function moreLink(inj) {
  if (LIMB !== 'spine' || injuryKind(inj.id) !== 'spinaldisc' || inj.type !== 13 || !/^disc_/.test(inj.id)) return '';
  const d = inj.id.replace('disc_', '');
  return ` <a class="inj-more" href="spine-move.html#h=${d}:3.58:0.55&d=${d}" target="_blank" rel="noopener">See which nerve it presses on ›</a>`;
}
function renderInjuryList() {
  const list = injuries ? injuries.list : [];
  $('#inj-listwrap').hidden = list.length === 0;
  $('#inj-list').innerHTML = list.map((inj, i) => { const s = injurySentence(inj);
    return `<li><span class="num">${i + 1}</span><span><b>${s.title}.</b> ${s.text}${moreLink(inj)}</span><button class="rm" data-rm="${i}" aria-label="Remove injury ${i + 1}">×</button></li>`; }).join('');
  $('#inj-list').querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { recordInj(); injuries.remove(Number(b.dataset.rm)); state.lastQuick = null; $('#inj-move').hidden = true; renderInjuryList(); }));
  // tags
  const tags = $('#tags');
  tags.innerHTML = list.map((_, i) => `<div class="tag"${PATIENT ? ` role="button" tabindex="0" aria-label="Read about injury ${i + 1}"` : ''}>${i + 1}</div>`).join('');
  if (PATIENT) {
    const n = list.length;
    $('#pt-sum').textContent = n ? `${n} ${n === 1 ? 'injury' : 'injuries'} marked by your clinician` : '';
    $('#injury').classList.toggle('pt-empty', !n);
    [...tags.children].forEach((t, i) => t.addEventListener('click', () => {
      setPatientCard(true);
      const li = $('#inj-list').children[i]; li?.classList.add('flash'); setTimeout(() => li?.classList.remove('flash'), 1600); li?.scrollIntoView({ block: 'nearest' });
      if (innerWidth > 760) select(list[i].id);
    }));
  }
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
// The injury picker, grouped by part of the body (the nearest "Go to" region) and then by tissue
const TISSUE_PLURAL = { Bone: 'bones', Ligament: 'ligaments', Tendon: 'tendons', Meniscus: 'menisci', Labrum: 'labrum', Disc: 'discs' };
function groupedInjuryOptions() {
  const regs = Object.entries(REGIONS).filter(([k, r]) => k !== CFG.home.region && !/\(from /.test(r.label));
  const groups = new Map();
  for (const [id, s] of Object.entries(STRUCTURES)) {
    if (!injuryKind(id) || !meshes[id]) continue;
    const g = meshes[id].geometry; if (!g.boundingBox) g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    let best = null, bd = Infinity;
    for (const [, r] of regs) { const d = c.distanceTo(new THREE.Vector3(...r.target)) / Math.sqrt(r.dist); if (d < bd) { bd = d; best = r.label; } }
    const key = `${best || CFG.part} · ${TISSUE_PLURAL[s.group] || s.group.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([id, s]);
  }
  const order = regs.map(([, r]) => r.label);
  return [...groups.entries()].sort((a, b) => order.indexOf(a[0].split(' · ')[0]) - order.indexOf(b[0].split(' · ')[0]) || a[0].localeCompare(b[0]))
    .map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(([id, s]) => `<option value="${id}">${esc(s.name)}</option>`).join('')}</optgroup>`).join('');
}
// "Best view" of a structure: the camera direction and see-through setting of its first common injury
function bestView(id, c = COMMON.find((x) => x.limb === LIMB && x.id === id)) {
  if (!c || !meshes[id]) return false;
  // deep structures: see-through bone, or cut away everything outside the joint (state.quickJoint: set here, so cleared here)
  if (c.joint) { setJoint(c.joint, { fly: false }); state.quickJoint = true; } else if (state.quickJoint) { setJoint(null, { fly: false }); state.quickJoint = false; }
  for (const h of state.quickHidden || []) state.hidden.delete(h);
  state.quickHidden = (c.hide || []).filter((h) => meshes[h] && !state.hidden.has(h));
  for (const h of state.quickHidden) state.hidden.add(h);
  state.xray = !!c.xray; applyVisibility();
  const p = spotOn(id, c.at, c.from);
  zoomStack.length = 0;
  flyTo(p, new THREE.Vector3(...c.from), c.dist || focusRadius(id) * 5 + 9, 800);
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('on'));
  return true;
}
// where the tag of a common injury goes: the first surface of the structure seen from `from`, through the point `at`
const _ray2 = new THREE.Raycaster(); _ray2.firstHitOnly = true;
function spotOn(id, at = [0.5, 0.5, 0.5], from = [0, 0, 1]) {
  const mesh = meshes[id], g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox;
  const p = new THREE.Vector3(...[0, 1, 2].map((i) => THREE.MathUtils.lerp(b.min.getComponent(i), b.max.getComponent(i), at[i]))).add(mesh.position);
  const d = new THREE.Vector3(...from).normalize();
  _ray2.set(p.clone().addScaledVector(d, 300), d.clone().negate());
  const hit = _ray2.intersectObject(mesh, false)[0];
  if (hit) return hit.point.clone();
  return g.boundsTree.closestPointToPoint(p.clone().sub(mesh.position)).point.add(mesh.position);
}
// undo what a quick-pick changed in the view (hidden bones, joint cut)
function clearQuick() {
  for (const h of state.quickHidden || []) state.hidden.delete(h);
  state.quickHidden = [];
  if (state.quickJoint) { state.quickJoint = false; setJoint(null, { fly: false }); }
  applyVisibility();
}
function applyCommon(c) {
  if (!c || !meshes[c.id] || !injuries.targets[c.id]) { toast('This injury is not available on this page.'); return; }
  closePopovers();
  if (state.spread) { state.spread = 0; $('#spread').value = '0'; applySpread(); }
  if (state.mode !== 'injury') setMode('injury');
  revealFor(c.id); // after the mode change, which hides vessels and nerves
  chooseInjTarget(c.id);
  const types = injuryTypesFor(c.id), type = types.some((t) => t.type === c.type) ? c.type : types[0].type;
  const p = spotOn(c.id, c.at, c.from);
  const before = injuries.list.slice();
  if (!injuries.add(c.id, type, injuries.anchorFor(c.id, p))) { toast('This structure already has the maximum of 6 injuries.'); return; }
  const qi = injuries.list.length - 1;
  // a condition with more than one part (for example stenosis: a disc bulge plus bone spurs) adds the others too
  for (const e of c.also || []) if (meshes[e.id] && injuries.targets[e.id] && (revealFor(e.id), true)) injuries.add(e.id, e.type, injuries.anchorFor(e.id, spotOn(e.id, e.at, e.from)));
  injUndo.push(before); injRedo.length = 0; updateInjHist();
  state.lastQuick = qi;
  renderInjuryList(); setStep(2);
  $('#inj-move').hidden = false;
  bestView(c.id, c);
  toast(`${c.label} shown. Pick another type, move the tag or add more.`, 3400);
}

function wireInjuryUI() {
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  const sel = $('#inj-picker');
  sel.addEventListener('change', () => { if (sel.value) { const id = sel.value; chooseInjTarget(id); if (!bestView(id)) { state.selected = id; zoomStructure(0); state.selected = null; } } });
  // common injuries: one tap picks the structure, the injury and a view that shows it
  const mine = COMMON.filter((c) => c.limb === LIMB);
  $('#inj-common').innerHTML = mine.length ? `<h3>Common injuries</h3><div class="chips">${mine.map((c) => `<button data-common="${c.key}">${esc(c.label)}</button>`).join('')}</div><h3 class="or">Or choose the structure yourself</h3>` : '';
  $('#inj-common').querySelectorAll('[data-common]').forEach((b) => b.addEventListener('click', () => applyCommon(COMMON.find((c) => c.key === b.dataset.common))));
  $('#inj-move').addEventListener('click', () => {
    const i = state.lastQuick; if (i == null || !injuries.list[i]) return;
    const inj = injuries.list[i]; recordInj(); injuries.remove(i); state.lastQuick = null; renderInjuryList();
    state.injType = inj.type;
    $('#inj-tap-msg').textContent = `Tap the spot on the ${STRUCTURES[inj.id].short} where the ${typeInfo(injuryKind(inj.id), inj.type).label.replace(/^(?!Grade)./, (c) => c.toLowerCase())} should go.`;
    setStep(3);
  });
  const zoomT = (f) => { state.selected = state.injTarget; zoomStructure(f); state.selected = null; };
  $('#inj-zoom-in').addEventListener('click', () => zoomT(0.7));
  $('#inj-zoom-out').addEventListener('click', () => zoomT(1.4));
  $('#inj-zoom-reset').addEventListener('click', () => zoomT(0));
  $('#inj-change').addEventListener('click', () => setStep(1));
  $('#inj-cancel').addEventListener('click', () => setStep(2));
  const forget = () => { state.lastQuick = null; $('#inj-move').hidden = true; };
  $('#inj-clear').addEventListener('click', () => { if (!injuries.list.length) return; recordInj(); injuries.clear(); forget(); renderInjuryList(); toast('Cleared. Tap Undo to bring the injuries back.'); });
  mountInjHist();
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
// one search box: structures here, common injuries and structures on the other pages
function buildFind() {
  mountSearch($('#find'), $('#find-results'), { here: LIMB, onLocal(e) {
    if (e.kind === 'injury') { const c = COMMON.find((x) => x.key === e.key); if (c) { applyCommon(c); return true; } }
    if (e.kind === 'structure' && meshes[e.id]) { findStructure(e.id); return true; }
    return false;
  } });
}
function findStructure(id) {
  if (state.mode === 'injury' && !PATIENT && injuryKind(id)) { chooseInjTarget(id); bestView(id); return; }
  if (state.mode === 'injury') setMode('explore');
  select(id); zoomStructure(0);
}
function wireUI() {
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#xray').addEventListener('click', () => { state.xray = !state.xray; applyVisibility(); });
  $('#peel').addEventListener('input', (e) => { state.peel = Number(e.target.value); state.tissues = null; applyVisibility(); if (state.selected && !meshes[state.selected].visible) select(null); });
  $('#zoom-in').addEventListener('click', () => zoomStructure(0.7));
  $('#zoom-out').addEventListener('click', () => zoomStructure(1.4));
  $('#zoom-reset').addEventListener('click', () => zoomStructure(0));
  $('#reset').addEventListener('click', () => { if (PATIENT && clinicianSnap) { applySnap(clinicianSnap); toast("Back to your clinician's view"); return; } clearQuick(); select(null); resetView(); });
  if (PATIENT) { $('#reset').textContent = "My clinician's view"; $('#reset').title = 'Go back to the view your clinician sent'; }
  $('#pt-toggle').addEventListener('click', () => setPatientCard($('#injury').classList.contains('collapsed')));
  $('#info-close').addEventListener('click', () => select(null));
  $('#isolate').addEventListener('click', () => toggleIsolate());
  $('#vessels').addEventListener('click', () => { if (state.tissues) { state.tissues = null; setVessels(true); } else setVessels(!state.vessels); });
  $('#show').addEventListener('click', () => { closePopovers(); openShow(); });
  $('#labels').addEventListener('click', () => setLabels(!state.labels));
  $('#pt-labels').addEventListener('click', () => setLabels(!state.labels));
  // Larger text: a button for patients next to Labels, and in the Display panel for everyone
  const big = document.createElement('button'); big.id = 'pt-big'; big.className = 'patient-only'; big.setAttribute('aria-pressed', 'false');
  big.setAttribute('aria-label', 'Larger text'); big.title = 'Larger text'; big.innerHTML = 'A<span class="big-a">A</span>';
  $('#pt-labels').after(big);
  const big2 = document.createElement('button'); big2.id = 'big-text'; big2.className = 'toggle'; big2.setAttribute('aria-pressed', 'false'); big2.textContent = 'Larger text';
  $('#labels').after(big2);
  const setBig = initBigText(big, () => { big2.setAttribute('aria-pressed', big.getAttribute('aria-pressed')); requestAnimationFrame(() => frameFreeArea()); });
  big2.addEventListener('click', () => setBig(big.getAttribute('aria-pressed') !== 'true'));
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
  mountNav($('.modes'), LIMB); // Home and the body-part menu (hidden in the patient view)
  $('#version').textContent = `v${APP_VERSION}`;
  const reg = $('#region');
  reg.innerHTML = '<option value="">Go to…</option>' + Object.entries(REGIONS).map(([k, r]) => `<option value="${k}">${r.label}</option>`).join('');
  reg.addEventListener('change', () => goRegion(reg.value));
  if (modesty.enabled && !PATIENT) $('#display-panel .pop-row').appendChild(modestyButton(modesty));
  buildFind();
  wireInjuryUI();
  wireShareUI();
}

// ---------- share codes, image download, named cases ----------
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
function openDialog(title, html) { $('#dlg-title').textContent = title; $('#dlg-body').innerHTML = html; $('#dlg').classList.remove('hidden'); }
function closeDialog() { $('#dlg').classList.add('hidden'); }
const getSnap = () => ({ ...snapshot({ state, camera, controls, injuries }), pp: modesty.enabled && modesty.shown ? 1 : undefined });
// Links made before v0.22 name a whole finger ("thumb_bones"); each finger bone is its own structure now, so an injury
// moves to the finger bone nearest its spot, and a hidden finger hides all of its bones.
const OLD_FINGER = /^(thumb|index|middle|ring|little)_bones$/;
const fingerPieces = (f) => ['proximal', 'middle', 'distal'].map((k) => `${f}_${k}`).filter((id) => meshes[id]);
function migrateInjury(j) {
  const m = OLD_FINGER.exec(j.id); if (!m || meshes[j.id]) return j;
  const p = new THREE.Vector3(...j.anchor.p); let best = null, bd = Infinity;
  for (const id of fingerPieces(m[1])) { const r = meshes[id].geometry.boundsTree.closestPointToPoint(p); if (r && r.distance < bd) { bd = r.distance; best = id; } }
  return best ? { ...j, id: best } : j;
}
function applySnap(sn) {
  anim = null;
  setSide(sn.sd ? 'left' : 'right');
  setMode(sn.m === 1 ? 'injury' : 'explore');
  state.peel = sn.p ?? 2; $('#peel').value = String(state.peel);
  state.xray = !!sn.x;
  state.spread = sn.s || 0; $('#spread').value = String(state.spread); applySpread();
  setLabels(!!sn.l);
  setVessels(!!sn.ve);
  state.tissues = sn.t ? new Set(sn.t) : null; setJoint(sn.j || null, { fly: false });
  if (sn.c) { camera.position.set(sn.c[0], sn.c[1], sn.c[2]); controls.target.set(sn.c[3], sn.c[4], sn.c[5]); controls.update(); }
  injuries.set(injuryList(sn).map(migrateInjury).filter((j) => meshes[j.id] && injuries.targets[j.id])); renderInjuryList(); resetInjHist();
  if (sn.m !== 1) select(sn.sel && meshes[sn.sel] ? sn.sel : null);
  state.hidden.clear(); for (const id of sn.h || []) { if (meshes[id]) state.hidden.add(id); else if (OLD_FINGER.test(id)) for (const q of fingerPieces(OLD_FINGER.exec(id)[1])) state.hidden.add(q); }
  state.quickHidden = [];
  modesty.shown = !!sn.pp; $('#private-parts')?.repaint();
  applyVisibility();
}
// add ?name=1 to a link, before its #hash
function withParam(url, name) { const u = new URL(url); u.searchParams.set(name, '1'); return u.toString(); }
function iframeCode(src) { return `<iframe src="${src}" title="${CFG.title}" width="100%" height="640" style="border:0;border-radius:12px;max-width:1100px" allow="fullscreen; clipboard-write; web-share" loading="lazy"></iframe>`; }
async function shareLink(snap = getSnap()) { return `${location.origin}${location.pathname}${PATIENT ? '?patient=1' : ''}#c=${await encode(snap)}`; }
async function openShare(snap = getSnap()) {
  closePopovers();
  // links never show the private parts unless the clinician ticks the box (only offered when they are shown now)
  const asked = !!snap.pp, sn = { ...snap, pp: undefined };
  let url = await shareLink(sn), purl = withParam(url, 'patient');
  let copied = false; try { await navigator.clipboard.writeText(purl); copied = true; } catch { /* clipboard blocked: the box below still has it */ }
  openDialog('Share this view', `<h3 class="first">Send to your patient</h3>
    <p class="note">${copied ? '<b>Patient link copied.</b> ' : ''}View-only: your patient can turn, zoom and tap to read, and cannot change the injuries or leave this page by accident.
    Everything is inside the link itself; nothing is stored on a server and it holds no patient details.</p>
    ${asked ? '<label class="share-private"><input type="checkbox" id="share-pp"> Show the private parts in these links too (they are blurred unless you tick this)</label>' : ''}
    <div class="row"><input type="text" id="share-patient" readonly value="${esc(purl)}" aria-label="Patient link"><button data-copy="share-patient" class="primary">Copy</button></div>
    ${navigator.share ? '<button id="share-native" class="primary wide">Send to patient…</button>' : ''}
    <div class="qr-wrap"><div id="share-qr" class="qr">${qrSvg(purl)}</div><p class="note">In the clinic, your patient can scan this with their phone camera to open the patient link.</p></div>
    <h3>For you</h3>
    <p class="note">The same view, still editable. Keep it to carry on later, or save it under Cases (in the ⋯ menu).</p>
    <div class="row"><input type="text" id="share-url" readonly value="${esc(url)}" aria-label="Editable link"><button data-copy="share-url">Copy</button></div>
    <details class="site"><summary>Put it on a website</summary>
    <p class="note">Paste this code into a page of the clinic website. Use the second one for patients (view-only).</p>
    <div class="row"><input type="text" id="share-embed" readonly value="${esc(iframeCode(withParam(url, 'embed')))}" aria-label="Embed code"><button data-copy="share-embed">Copy</button></div>
    <div class="row"><input type="text" id="share-embed-p" readonly value="${esc(iframeCode(withParam(withParam(url, 'embed'), 'patient')))}" aria-label="Embed code for patients"><button data-copy="share-embed-p">Copy</button></div></details>`);
  $('#share-pp')?.addEventListener('change', async (e) => {
    sn.pp = e.target.checked ? 1 : undefined;
    url = await shareLink(sn); purl = withParam(url, 'patient');
    $('#share-patient').value = purl; $('#share-url').value = url; $('#share-qr').innerHTML = qrSvg(purl);
    $('#share-embed').value = iframeCode(withParam(url, 'embed')); $('#share-embed-p').value = iframeCode(withParam(withParam(url, 'embed'), 'patient'));
    toast(e.target.checked ? 'These links now show the private parts' : 'These links blur the private parts');
  });
  $('#dlg-body').querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => { const inp = $('#' + b.dataset.copy); try { await navigator.clipboard.writeText(inp.value); toast('Copied'); } catch { inp.select(); toast('Press Ctrl+C or Cmd+C to copy'); } }));
  $('#dlg-body').querySelectorAll('input[type="text"]').forEach((i) => i.addEventListener('focus', (e) => e.target.select()));
  $('#share-native')?.addEventListener('click', () => navigator.share({ title: CFG.title, url: purl }).catch(() => {}));
}
function wrapText(g, text, maxW) {
  const words = text.split(/\s+/), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
async function saveImage() {
  modesty.render(scene, camera);
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
  // Display panel and the ⋯ menu: one open at a time
  const pop = (btn, el) => btn.addEventListener('click', (e) => { e.stopPropagation(); const open = el.classList.contains('hidden'); closePopovers(); if (open) { if (el.id === 'overflow-menu') { const r = btn.getBoundingClientRect(); el.style.left = `${Math.max(16, Math.min(r.right - 170, innerWidth - 186))}px`; } el.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); if (el.id === 'display-panel') closeDialog(); } });
  pop($('#display'), $('#display-panel')); pop($('#overflow'), $('#overflow-menu'));
  $('#display-close').addEventListener('click', closePopovers);
  $('#overflow-menu').addEventListener('click', () => closePopovers());
  document.addEventListener('pointerdown', (e) => { if (!$('#overflow-menu').classList.contains('hidden') && !e.target.closest('#overflow-menu, #overflow')) closePopovers(); });
}
function closePopovers() {
  for (const [b, el] of [['#display', '#display-panel'], ['#overflow', '#overflow-menu']]) { $(el).classList.add('hidden'); $(b).setAttribute('aria-expanded', 'false'); }
}
function setLabels(on) { state.labels = on; for (const b of ['#labels', '#pt-labels']) $(b).setAttribute('aria-pressed', String(on)); }
let clinicianSnap = null;
// patient view: the injury card folds down to one line so the model stays visible
function setPatientCard(open) {
  $('#injury').classList.toggle('collapsed', !open);
  $('#pt-toggle').textContent = open ? 'Hide' : 'Read';
  $('#pt-toggle').setAttribute('aria-expanded', String(open));
  frameFreeArea();
}
async function openFromHash() {
  const m = location.hash.match(/^#c=([A-Za-z0-9_-]+)/); if (!m) return;
  try { const sn = await decode(m[1]); if (PATIENT) clinicianSnap = sn; applySnap(sn); toast(PATIENT ? 'Your clinician sent you this view' : 'Opened a shared view'); } catch { toast('This share link could not be opened. It may be cut short.', 4500); }
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
  modesty.render(scene, camera);
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
  $('#inj-picker').innerHTML = '<option value="">Choose a structure…</option>' + groupedInjuryOptions();
  applyVisibility();
  // test hooks
  window.__knee = { modesty, meshes, setJoint, setTissues, openShow, getSnap, applySnap, shareLink, saveImage, openCases, openShare, goRegion, REGIONS, setVessels, injuries, state, setMode, chooseInjTarget, renderInjuryList, THREE, camera, controls, flyTo, VIEWS, setView,
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
  // links from the home page and the search box on other pages: ?pick=<common injury>, ?find=<structure>
  if (!PATIENT && qs.has('pick')) applyCommon(COMMON.find((c) => c.key === qs.get('pick') && c.limb === LIMB));
  if (qs.has('find') && meshes[qs.get('find')]) findStructure(qs.get('find'));
  if (qs.has('pick') || qs.has('find')) { const u = new URL(location.href); u.searchParams.delete('pick'); u.searchParams.delete('find'); history.replaceState(null, '', u); }
  mountChat({ extraContext: () => [
    LIMB === 'leg' || LIMB === 'hand' ? `Side shown: ${state.side === 'left' ? 'left' : 'right'}.` : '',
    `Mode: ${state.mode === 'injury' ? 'Injury (marking injuries)' : 'Explore'}.`,
    `Layers: ${$('#peel-label').textContent}.${state.xray ? ' Bone is see-through.' : ''}`,
  ] });
  $('#loading').classList.add('done');
  window.__ready = { loadMs: Math.round(performance.now() - t0) };
  requestAnimationFrame(loop);
})();
