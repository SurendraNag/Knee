// "Where does it hurt?": a patient marks spots and areas of pain on a 3D body and sends the map to their doctor.
// Everything travels inside the link (#p=...) or the saved picture; nothing is stored on a server.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import './style.css';
import './pain.css';
import { APP_VERSION } from './version.js';
import { createModesty, REGIONS as PRIVATE } from './modesty.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const EMBED = qs.get('embed') === '1' || window.self !== window.top;
document.documentElement.classList.toggle('embed', EMBED);
$('#version').textContent = 'v' + APP_VERSION;
let SEX = qs.get('sex') === 'female' ? 'female' : 'male';

// ---------- words ----------
const TYPES = ['Sharp or stabbing', 'Dull ache', 'Burning', 'Throbbing', 'Shooting or spreading', 'Tingling, pins and needles', 'Numb', 'Stiff', 'Sore to touch', 'Cramping'];
const WHEN = ['All the time', 'When moving', 'When resting', 'At night', 'In the morning', 'Sitting', 'Standing or walking', 'Lifting or bending'];
const STARTED = ['', 'today', 'in the last few days', '1 to 4 weeks ago', '1 to 3 months ago', '3 to 12 months ago', 'more than a year ago'];
const LEVEL_WORD = (l) => (l === 0 ? 'no pain' : l <= 3 ? 'mild' : l <= 6 ? 'moderate' : l <= 8 ? 'severe' : 'very severe');
// pain colour: yellow (mild) to deep red (worst)
const STOPS = [[0, 0xf7e26b], [3, 0xf5c542], [5, 0xf08c2e], [7, 0xe5484d], [10, 0x9e0f2e]];
function levelColor(l) {
  for (let i = 1; i < STOPS.length; i++) if (l <= STOPS[i][0]) { const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i]; return new THREE.Color(ca).lerp(new THREE.Color(cb), (l - a) / (b - a)); }
  return new THREE.Color(STOPS.at(-1)[1]);
}
const css = (c) => '#' + c.getHexString();
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- where on the body is a point? (patient's own right and left; right is -x, front is +z) ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function segs(s) { // one side's limbs, s = -1 right, +1 left
  const X = (x) => -x * s; // x given for the right side (negative); flipped for the left
  return [
    ['upperarm', V(X(-0.18), 1.40, -0.03), V(X(-0.225), 1.10, -0.03), 0.05],
    ['forearm', V(X(-0.225), 1.10, -0.03), V(X(-0.275), 0.86, 0.0), 0.04],
    ['hand', V(X(-0.275), 0.86, 0.0), V(X(-0.315), 0.725, 0.0), 0.035],
    ['thigh', V(X(-0.09), 0.90, -0.01), V(X(-0.083), 0.465, 0.0), 0.075],
    ['shin', V(X(-0.083), 0.465, 0.0), V(X(-0.072), 0.075, -0.02), 0.05],
    ['foot', V(X(-0.072), 0.075, -0.02), V(X(-0.085), 0.01, 0.13), 0.04],
  ].map(([k, a, b, r]) => ({ k, a, b, r, side: s < 0 ? 'right' : 'left' }));
}
const SEGS = [
  { k: 'head', a: V(0, 1.6, 0.005), b: V(0, 1.66, 0.0), r: 0.09 },
  { k: 'neck', a: V(0, 1.45, -0.02), b: V(0, 1.53, -0.01), r: 0.05 },
  { k: 'trunk', a: V(0, 0.84, -0.01), b: V(0, 1.42, -0.02), r: 0.13 },
  ...segs(-1), ...segs(1),
];
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3(), _vp = new THREE.Vector3();
// the nearest limb, trunk, neck or head segment, how far along it, and the closest point on its centre line
function nearestAxis(p) {
  let best = null, bd = Infinity, bt = 0;
  for (const s of SEGS) {
    _ab.subVectors(s.b, s.a); _ap.subVectors(p, s.a);
    const t = THREE.MathUtils.clamp(_ap.dot(_ab) / _ab.lengthSq(), 0, 1);
    const d = _ap.sub(_ab.multiplyScalar(t)).length() - s.r;
    if (d < bd) { bd = d; best = s; bt = t; }
  }
  return { seg: best, t: bt, point: best.a.clone().lerp(best.b, bt) };
}
function whereIs(p, n) {
  const { seg: best, t: bt } = nearestAxis(p);
  const side = p.x < 0 ? 'right' : 'left', S = side;
  const sx = Math.sign(p.x) || 1;
  const front = n.z > 0.45, back = n.z < -0.45, up = n.y > 0.6, down = n.y < -0.55;
  const outer = n.x * (best.side ? (best.side === 'left' ? 1 : -1) : sx) > 0.45, inner = n.x * (best.side ? (best.side === 'left' ? 1 : -1) : sx) < -0.45;
  const mid = Math.abs(p.x) < 0.03;
  const y = p.y, t = bt, L = best.side;
  switch (best.k) {
    case 'head':
      if (y < 1.565 && n.z > 0) return mid ? 'Chin' : `${cap(S)} jaw`;
      if (n.z > 0.35 && y < 1.66) return mid ? 'Face (nose and mouth)' : `${cap(S)} side of the face`;
      if (n.z > 0.35) return 'Forehead';
      if (y > 1.69 && n.y > 0.5) return 'Top of the head';
      if (n.z < -0.3) return 'Back of the head';
      return `${cap(S)} side of the head (temple and ear)`;
    case 'neck':
      return front ? 'Front of the neck' : back ? (mid ? 'Back of the neck (over the spine)' : `Back of the neck, ${S} side`) : `${cap(S)} side of the neck`;
    case 'trunk':
      if (front) {
        if (y > 1.22) return mid ? 'Centre of the chest (breastbone)' : `${cap(S)} side of the chest`;
        if (y > 1.08) return Math.abs(p.x) < 0.04 ? 'Upper belly, centre' : `Upper belly, ${S} side`;
        if (y > 0.95) return Math.abs(p.x) < 0.035 ? 'Lower belly, centre (around the belly button)' : `Lower belly, ${S} side`;
        return Math.abs(p.x) < 0.04 ? 'Lower belly, just above the pubic bone' : `${cap(S)} groin`;
      }
      if (back) {
        const spine = Math.abs(p.x) < 0.03 ? ' (over the spine)' : `, ${S} side`;
        if (y > 1.25) return Math.abs(p.x) > 0.07 ? `${cap(S)} shoulder blade` : `Upper back${spine}`;
        if (y > 1.12) return `Middle of the back${spine}`;
        if (y > 0.97) return `Lower back${spine}`;
        return Math.abs(p.x) < 0.035 ? 'Tailbone and sacrum' : `${cap(S)} buttock`;
      }
      if (y > 1.36 && up) return `Top of the ${S} shoulder`;
      if (y > 1.18) return `${cap(S)} side of the ribs (under the arm)`;
      if (y > 0.97) return `${cap(S)} side of the waist (flank)`;
      return `Outer ${S} hip`;
    case 'upperarm':
      if (t < 0.17) return front ? `Front of the ${L} shoulder` : back ? `Back of the ${L} shoulder` : `${cap(L)} shoulder`;
      if (t > 0.86) return elbow(L, front, back, inner, outer);
      return `${cap(L)} upper arm` + (front ? ', front (biceps)' : back ? ', back (triceps)' : inner ? ', inner side' : outer ? ', outer side' : '');
    case 'forearm':
      if (t < 0.13) return elbow(L, front, back, inner, outer);
      if (t > 0.88) return `${cap(L)} wrist` + (front ? ', palm side' : back ? ', back' : outer ? ', thumb side' : inner ? ', little-finger side' : '');
      return `${cap(L)} forearm` + (front ? ', palm side' : back ? ', back' : outer ? ', thumb side' : inner ? ', little-finger side' : '');
    case 'hand':
      if (t < 0.12) return `${cap(L)} wrist` + (front ? ', palm side' : back ? ', back' : '');
      if (t > 0.5) return `${cap(L)} fingers`;
      return front ? `${cap(L)} palm` : back ? `Back of the ${L} hand` : outer ? `${cap(L)} hand, thumb side` : `${cap(L)} hand, little-finger side`;
    case 'thigh':
      if (t < 0.16) return front ? `Front of the ${L} hip (groin crease)` : back ? `${cap(L)} buttock` : outer ? `Outer ${L} hip` : `Inner ${L} thigh, top`;
      if (t > 0.86) return knee(L, front, back, inner, outer);
      return `${cap(L)} thigh` + (front ? ', front' : back ? ', back (hamstrings)' : inner ? ', inner side' : outer ? ', outer side' : '');
    case 'shin':
      if (t < 0.12) return knee(L, front, back, inner, outer);
      if (t > 0.86) return back ? `Back of the ${L} ankle (Achilles tendon)` : inner ? `Inner ${L} ankle` : outer ? `Outer ${L} ankle` : `Front of the ${L} ankle`;
      return front ? `${cap(L)} shin` : back ? `${cap(L)} calf` : inner ? `Inner side of the ${L} lower leg` : outer ? `Outer side of the ${L} lower leg` : `${cap(L)} lower leg`;
    case 'foot':
      if (down || y < 0.012) return t < 0.3 ? `${cap(L)} heel, underneath` : `Sole of the ${L} foot`;
      if (t < 0.12) return back ? `${cap(L)} heel` : inner ? `Inner ${L} ankle` : outer ? `Outer ${L} ankle` : `Front of the ${L} ankle`;
      if (p.z < -0.04) return `${cap(L)} heel`;
      if (t > 0.78) return `${cap(L)} toes`;
      return `Top of the ${L} foot` + (inner ? ', inner side' : outer ? ', outer side' : '');
  }
  return 'Body';
}
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function elbow(L, front, back, inner, outer) { return front ? `Inside of the ${L} elbow` : back ? `Point of the ${L} elbow` : outer ? `Outer ${L} elbow (thumb side)` : inner ? `Inner ${L} elbow (funny-bone side)` : `${cap(L)} elbow`; }
function knee(L, front, back, inner, outer) { return front ? `Front of the ${L} knee (kneecap)` : back ? `Back of the ${L} knee` : inner ? `Inner side of the ${L} knee` : outer ? `Outer side of the ${L} knee` : `${cap(L)} knee`; }

// ---------- renderer ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
// the genitals are always blurred here (on screen and in the picture sent to the doctor); pain marks there still show as colour
let modestySex = 'male';
const modesty = createModesty(renderer, { region: PRIVATE.bodyMale, active: () => !!body, occluders: () => (body ? [body.mesh] : []) });
scene.add(camera);
const key = new THREE.DirectionalLight(0xfff4ea, 1.7); key.position.set(-1.2, 2.2, 3); camera.add(key); camera.add(key.target); key.target.position.set(0, 0, -3);
const rim = new THREE.DirectionalLight(0xb9d3ff, 0.6); rim.position.set(2, 1, -2); camera.add(rim); camera.add(rim.target); rim.target.position.set(0, 0, -3);
scene.add(new THREE.HemisphereLight(0xbfd0e6, 0x2a2018, 0.35));
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.09; controls.minDistance = 0.25; controls.maxDistance = 6;
controls.screenSpacePanning = true; controls.zoomToCursor = true;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
const HOME = { t: V(0, 0.87, 0), dir: V(0, 0.05, 1), dist: 4.25 };
const VIEWS = { front: V(0, 0.05, 1), back: V(0, 0.05, -1), left: V(1, 0.05, 0), right: V(-1, 0.05, 0) };
const REGIONS = [
  ['whole', 'Whole body', [0, 0.87, 0], [0, 0.05, 1], 4.25],
  ['head', 'Head and face', [0, 1.6, 0.02], [0.3, 0.05, 1], 0.8],
  ['neck', 'Neck and shoulders', [0, 1.44, 0], [0, 0.1, 1], 1.1],
  ['upperback', 'Upper back', [0, 1.3, -0.05], [0, 0.05, -1], 1.1],
  ['lowback', 'Lower back and buttocks', [0, 1.0, -0.05], [0, 0.05, -1], 1.1],
  ['chest', 'Chest', [0, 1.28, 0.05], [0, 0.05, 1], 1.0],
  ['belly', 'Belly and groin', [0, 1.02, 0.05], [0, 0.05, 1], 1.1],
  ['rshoulder', 'Right shoulder and arm', [-0.2, 1.22, 0], [-0.6, 0.1, 1], 1.0],
  ['lshoulder', 'Left shoulder and arm', [0.2, 1.22, 0], [0.6, 0.1, 1], 1.0],
  ['rhand', 'Right wrist and hand', [-0.29, 0.82, 0.01], [-0.3, 0.05, 1], 0.55],
  ['lhand', 'Left wrist and hand', [0.29, 0.82, 0.01], [0.3, 0.05, 1], 0.55],
  ['hips', 'Hips', [0, 0.9, 0], [0, 0.05, 1], 1.1],
  ['rknee', 'Right knee', [-0.083, 0.47, 0.02], [-0.25, 0.05, 1], 0.6],
  ['lknee', 'Left knee', [0.083, 0.47, 0.02], [0.25, 0.05, 1], 0.6],
  ['legs', 'Both legs', [0, 0.45, 0], [0, 0.05, 1], 2.2],
  ['rfoot', 'Right ankle and foot', [-0.08, 0.06, 0.03], [-0.5, 0.45, 1], 0.55],
  ['lfoot', 'Left ankle and foot', [0.08, 0.06, 0.03], [0.5, 0.45, 1], 0.55],
];
// phones in portrait: stand further back so the whole body fits above the panel
if (innerWidth <= 760 && innerHeight > innerWidth) { HOME.dist = 5.4; HOME.t.y = 0.84; REGIONS[0][4] = 5.4; REGIONS[0][2] = [0, 0.84, 0]; }
camera.position.copy(HOME.t).addScaledVector(HOME.dir.clone().normalize(), HOME.dist); controls.target.copy(HOME.t);

let anim = null;
function flyTo(target, dir, dist, ms = 700) {
  const d = (dir ? dir.clone() : camera.position.clone().sub(controls.target)).normalize();
  anim = { fp: camera.position.clone(), ft: controls.target.clone(), tt: target.clone(), tp: target.clone().addScaledVector(d, dist), t0: performance.now(), ms };
}
function stepAnim(now) {
  if (!anim) return;
  const k = Math.min(1, (now - anim.t0) / anim.ms), e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
  const a = anim.fp.clone().sub(anim.ft), b = anim.tp.clone().sub(anim.tt);
  const qa = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), a.clone().normalize()), qb = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), b.clone().normalize());
  const t = anim.ft.clone().lerp(anim.tt, e);
  camera.position.copy(t).add(V(0, 0, 1).applyQuaternion(qa.slerp(qb, e)).multiplyScalar(THREE.MathUtils.lerp(a.length(), b.length(), e)));
  controls.target.copy(t);
  if (k >= 1) anim = null;
}
function setView(k) { flyTo(controls.target.clone(), VIEWS[k], camera.position.distanceTo(controls.target)); }
function goRegion(id) { const r = REGIONS.find((x) => x[0] === id); if (r) flyTo(V(...r[2]), V(...r[3]), r[4]); }

// ---------- the body (skin of the whole-body model) ----------
let body = null; // { mesh, pos, nrm, paint, grid }
const SKIN = 0xcdb7a6, HAIR = 0x3b2c22, LIP = 0xb98278;
async function loadBody() {
  const dir = SEX === 'female' ? 'body-female/' : 'body/';
  const man = await (await fetch(`${import.meta.env.BASE_URL}${dir}manifest.json`)).json();
  const info = man.packs.find((p) => p.id === 'skin');
  let buf = await (await fetch(`${import.meta.env.BASE_URL}${dir}${info.file}`)).arrayBuffer();
  const u8 = new Uint8Array(buf, 0, 2);
  if (u8[0] === 0x1f && u8[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const L = info.layout, nv = info.nv;
  const q = new Uint16Array(buf, L.pos, nv * 3), qn = new Int8Array(buf, L.nrm, nv * 3), local = new Uint16Array(buf, L.idx, info.nt * 3);
  const mn = info.min, sz = info.max.map((v, i) => v - mn[i]);
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    for (let a = 0; a < 3; a++) pos[i * 3 + a] = mn[a] + (q[i * 3 + a] / 65535) * sz[a];
  }
  const idx = [];
  for (const p of info.parts) {
    if (/pubic/i.test(p.name)) continue; // keep the body plain for patients
    const c = new THREE.Color(/hair|eyebrow/i.test(p.name) ? HAIR : /lip/i.test(p.name) ? LIP : SKIN).convertSRGBToLinear();
    for (let v = p.v0; v < p.v0 + p.vc; v++) { col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
    for (let k = p.t0 * 3; k < (p.t0 + p.tc) * 3; k++) idx.push(local[k] + p.v0);
    p.skin = /^skin$/i.test(p.name);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const paint = new Float32Array(nv * 4);
  g.setAttribute('aPaint', new THREE.BufferAttribute(paint, 4));
  g.setIndex(idx);
  // the stored normals are not reliably outward; the triangle winding is, so rebuild them from it
  g.computeVertexNormals();
  nrm.set(g.attributes.normal.array);
  g.computeBoundingSphere();
  g.boundsTree = new MeshBVH(g);
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: 0xffd9c7 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aPaint; varying vec4 vPaint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaint = aPaint;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vPaint;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vPaint.rgb, clamp(vPaint.a, 0.0, 1.0) * 0.92);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vPaint.rgb * clamp(vPaint.a, 0.0, 1.0) * 0.22;');
  };
  const mesh = new THREE.Mesh(g, mat);
  // paintable vertices: skin only (not hair), in a grid for quick lookups
  const skinPart = info.parts.find((p) => p.skin) || info.parts[0];
  const grid = new Map(), C = 0.03;
  const keyOf = (x, y, z) => `${Math.floor(x / C)},${Math.floor(y / C)},${Math.floor(z / C)}`;
  for (let v = 0; v < nv; v++) { if (v < skinPart.v0 || v >= skinPart.v0 + skinPart.vc) continue; const k = keyOf(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(v); }
  function near(p, r, fn) {
    const x0 = Math.floor((p.x - r) / C), x1 = Math.floor((p.x + r) / C), y0 = Math.floor((p.y - r) / C), y1 = Math.floor((p.y + r) / C), z0 = Math.floor((p.z - r) / C), z1 = Math.floor((p.z + r) / C);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const a = grid.get(`${x},${y},${z}`); if (a) for (const v of a) fn(v); }
  }
  if (body) { scene.remove(body.mesh); body.mesh.geometry.dispose(); }
  body = { mesh, pos, nrm, paint, near, attr: g.attributes.aPaint };
  scene.add(mesh);
}
// normal at a point: from the nearest skin vertex on the outer surface (the skin is a thin shell, so the
// inner layer's vertices, whose normals point inward, sit only millimetres away)
function normalAt(p) {
  const out = p.clone().sub(nearestAxis(p).point);
  let best = -1, bd = Infinity, any = -1, ad = Infinity;
  for (const r of [0.02, 0.05, 0.12]) {
    body.near(p, r, (v) => {
      const d = (body.pos[v * 3] - p.x) ** 2 + (body.pos[v * 3 + 1] - p.y) ** 2 + (body.pos[v * 3 + 2] - p.z) ** 2;
      if (d < ad) { ad = d; any = v; }
      if (d < bd && body.nrm[v * 3] * out.x + body.nrm[v * 3 + 1] * out.y + body.nrm[v * 3 + 2] * out.z > 0) { bd = d; best = v; }
    });
    if (best >= 0) break;
  }
  const v = best >= 0 ? best : any;
  return v < 0 ? V(0, 0, 1) : V(body.nrm[v * 3], body.nrm[v * 3 + 1], body.nrm[v * 3 + 2]);
}

// ---------- marks ----------
// { kind: 'spot'|'area', pts: [Vector3], nrm: [Vector3], r, level, types: Set, when: Set, note }
let marks = [];
let editing = -1; // index of the mark in the editor
let viewOnly = false, received = null; // a map opened from a link
const SPOT_R = 0.03;
const _c = new THREE.Color();
function repaint() {
  if (!body) return;
  const P = body.paint; P.fill(0);
  const _p = new THREE.Vector3();
  marks.forEach((m, mi) => {
    const col = levelColor(m.level).convertSRGBToLinear();
    const dim = editing >= 0 && mi !== editing ? 0.55 : 1;
    const core = m.kind === 'spot' ? 0.45 : 0.6;
    m.pts.forEach((p, k) => {
      const n = m.nrm[k];
      body.near(p, m.r, (v) => {
        _p.set(body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]);
        const d = _p.distanceTo(p); if (d > m.r) return;
        const dn = body.nrm[v * 3] * n.x + body.nrm[v * 3 + 1] * n.y + body.nrm[v * 3 + 2] * n.z; if (dn < 0.1) return; // not through to the other leg or arm
        let w = d < core * m.r ? 1 : 1 - (d - core * m.r) / ((1 - core) * m.r);
        w = w * w * (3 - 2 * w) * dim;
        if (w > P[v * 4 + 3]) { P[v * 4] = col.r; P[v * 4 + 1] = col.g; P[v * 4 + 2] = col.b; P[v * 4 + 3] = w; }
      });
    });
  });
  body.attr.needsUpdate = true;
}
function anchorOf(m) { // where the number tag sits: the stroke point nearest to the middle of the area
  if (m.kind === 'spot' || m.pts.length < 3) return 0;
  const c = new THREE.Vector3(); for (const p of m.pts) c.add(p); c.divideScalar(m.pts.length);
  let bi = 0, bd = Infinity; m.pts.forEach((p, i) => { const d = p.distanceToSquared(c); if (d < bd) { bd = d; bi = i; } }); return bi;
}
function markWhere(m) { const i = anchorOf(m); return whereIs(m.pts[i], m.nrm[i]); }
function describe(m, i) {
  const bits = [`${m.level}/10 (${LEVEL_WORD(m.level)})`];
  if (m.types.size) bits.push([...m.types].sort((a, b) => a - b).map((t) => TYPES[t].toLowerCase()).join(', '));
  if (m.when.size) bits.push('worse: ' + [...m.when].sort((a, b) => a - b).map((t) => WHEN[t].toLowerCase()).join(', '));
  return { title: `${i + 1}. ${markWhere(m)}${m.kind === 'area' ? ' (area)' : ''}`, text: bits.join('; ') + (m.note ? `. "${m.note}"` : '') };
}

// ---------- UI: tools, list, editor ----------
let tool = 'point', brush = 0.045;
function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach((b) => { const on = b.dataset.tool === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  $('#brush-row').hidden = t !== 'area';
  $('#lead').innerHTML = t === 'area' ? 'Drag your finger over the body to paint where it hurts. Drag the background to turn the body.' : t === 'turn' ? 'Drag to turn the body, pinch or scroll to zoom. Choose Spot or Area to mark again.' : 'Tap the body where it hurts. Use <b>Area</b> to paint a bigger patch.';
}
document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
document.querySelectorAll('[data-brush]').forEach((b) => b.addEventListener('click', () => {
  brush = Number(b.dataset.brush); document.querySelectorAll('[data-brush]').forEach((x) => x.classList.toggle('on', x === b));
}));
function chips(el, list, set) {
  el.innerHTML = list.map((t, i) => `<button type="button" data-i="${i}" aria-pressed="${set.has(i)}">${t}</button>`).join('');
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i); if (set.has(i)) set.delete(i); else set.add(i); b.setAttribute('aria-pressed', String(set.has(i))); renderList();
  }));
}
function openEditor(i) {
  editing = i; const m = marks[i];
  if (!m) { closeEditor(); return; }
  $('#editor').hidden = false; $('#tools-wrap').hidden = m.kind !== 'area';
  $('#ed-num').textContent = String(i + 1); $('#ed-num').style.background = css(levelColor(m.level));
  $('#ed-kind').textContent = m.kind === 'area' ? 'Area' : 'Spot';
  $('#ed-where').textContent = markWhere(m);
  $('#ed-level').value = String(m.level); levelText(m);
  chips($('#ed-types'), TYPES, m.types); chips($('#ed-when'), WHEN, m.when);
  $('#ed-note').value = m.note || '';
  $('#ed-more').hidden = m.kind !== 'area';
  $('#lead').innerHTML = m.kind === 'area' ? 'Drag over the body to add to this area.' : $('#lead').innerHTML;
  repaint(); renderList(); frame();
  $('#panel').scrollTop = 0;
}
function closeEditor() {
  editing = -1; $('#editor').hidden = true; $('#tools-wrap').hidden = viewOnly; setTool(tool === 'area' ? 'area' : tool);
  repaint(); renderList(); frame();
}
function levelText(m) {
  $('#ed-level-val').textContent = String(m.level); $('#ed-level-word').textContent = LEVEL_WORD(m.level);
  const c = css(levelColor(m.level)); $('#ed-level').style.setProperty('--thumb', c); $('#ed-num').style.background = c;
}
$('#ed-level').addEventListener('input', (e) => { const m = marks[editing]; if (!m) return; m.level = Number(e.target.value); levelText(m); repaint(); renderList(); });
$('#ed-note').addEventListener('input', (e) => { const m = marks[editing]; if (m) m.note = e.target.value.slice(0, 160); });
$('#ed-done').addEventListener('click', () => closeEditor());
$('#ed-more').addEventListener('click', () => { setTool('area'); toast('Drag over the body to add to this area'); });
$('#ed-del').addEventListener('click', () => { if (editing < 0) return; record(); marks.splice(editing, 1); closeEditor(); });

// ---------- undo and redo: every spot, every painted stroke, every removal and Clear all is one step ----------
const undoStack = [], redoStack = [];
const copyMarks = (ms) => ms.map((m) => ({ ...m, pts: m.pts.map((p) => p.clone()), nrm: m.nrm.map((n) => n.clone()), types: new Set(m.types), when: new Set(m.when) }));
const state = () => ({ marks: copyMarks(marks), editing });
function record() { undoStack.push(state()); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0; updateHist(); }
function restore(st) {
  marks = copyMarks(st.marks);
  if (st.editing >= 0 && marks[st.editing]) openEditor(st.editing); else closeEditor();
  updateHist();
}
function undo() { if (stroke || !undoStack.length) return; redoStack.push(state()); restore(undoStack.pop()); }
function redo() { if (stroke || !redoStack.length) return; undoStack.push(state()); restore(redoStack.pop()); }
function updateHist() { $('#h-undo').disabled = !undoStack.length; $('#h-redo').disabled = !redoStack.length; }
$('#h-undo').addEventListener('click', undo);
$('#h-redo').addEventListener('click', redo);
addEventListener('keydown', (e) => {
  if (viewOnly || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && document.activeElement.type !== 'range') return; // let text boxes undo their own typing
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});
$('#clear').addEventListener('click', (e) => {
  const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Clear all?'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Clear all'; }, 2500); return; }
  delete b.dataset.sure; b.textContent = 'Clear all'; record(); marks = []; closeEditor(); toast('Cleared. Tap Undo to bring the marks back.');
});
function renderList() {
  const ol = $('#marks');
  $('#empty').hidden = marks.length > 0; $('#list-actions').hidden = viewOnly || marks.length === 0;
  ol.innerHTML = marks.map((m, i) => { const d = describe(m, i);
    return `<li data-i="${i}" class="${i === editing ? 'sel' : ''}"><span class="num" style="background:${css(levelColor(m.level))}">${i + 1}</span>
      <button class="mk" data-act="go"><b>${esc(d.title.replace(/^\d+\. /, ''))}</b><small>${esc(d.text)}</small></button>
      ${viewOnly ? '' : `<button class="rm" data-act="rm" aria-label="Remove mark ${i + 1}">×</button>`}</li>`; }).join('');
  ol.querySelectorAll('li').forEach((li) => {
    const i = Number(li.dataset.i);
    li.querySelector('[data-act=go]').addEventListener('click', () => { lookAt(i); if (!viewOnly) openEditor(i); });
    li.querySelector('[data-act=rm]')?.addEventListener('click', () => { record(); marks.splice(i, 1); closeEditor(); });
  });
  // number tags on the body
  $('#tags').innerHTML = marks.map((m, i) => `<div class="tag" style="background:${css(levelColor(m.level))}">${i + 1}</div>`).join('');
  $('#send').disabled = !marks.length && !viewOnly;
}
function lookAt(i) {
  const m = marks[i], a = anchorOf(m), p = m.pts[a], n = m.nrm[a];
  const dir = V(n.x, Math.max(n.y, -0.2) + 0.05, n.z).normalize();
  flyTo(p, dir, m.kind === 'area' ? 0.8 : 0.65);
}
const _tp = new THREE.Vector3(), _cd = new THREE.Vector3();
function updateTags() {
  const els = $('#tags').children, w = canvas.clientWidth, h = canvas.clientHeight;
  marks.forEach((m, i) => {
    const el = els[i]; if (!el) return; const a = anchorOf(m), p = m.pts[a], n = m.nrm[a];
    _cd.subVectors(camera.position, p).normalize();
    _tp.copy(p).addScaledVector(n, 0.012).project(camera);
    const vis = _tp.z < 1 && n.dot(_cd) > 0.05;
    el.style.display = vis ? '' : 'none';
    if (vis) { el.style.left = `${(_tp.x * 0.5 + 0.5) * w}px`; el.style.top = `${(-_tp.y * 0.5 + 0.5) * h}px`; }
  });
  // "Your right" and "Your left" at the screen edges when looking from the front or back
  const right = V(1, 0, 0).applyQuaternion(camera.quaternion);
  const show = Math.abs(right.x) > 0.6 && camera.position.distanceTo(controls.target) > 1.2;
  $('#edge-r').hidden = $('#edge-l').hidden = !show;
  // screen right = +x when looking from the front; patient's left is +x
  $('#edge-r').classList.toggle('left', right.x > 0); $('#edge-r').classList.toggle('right', right.x <= 0);
  $('#edge-l').classList.toggle('right', right.x > 0); $('#edge-l').classList.toggle('left', right.x <= 0);
}

// ---------- tapping and painting ----------
const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
function hitAt(e) {
  if (!body) return null;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const h = ray.intersectObject(body.mesh, false)[0];
  return h ? h.point.clone() : null;
}
let down = null, stroke = null; const pointers = new Set();
canvas.addEventListener('pointerdown', (e) => {
  pointers.add(e.pointerId);
  if (pointers.size > 1) { if (stroke) endStroke(true); controls.enabled = true; down = null; return; }
  anim = null;
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (viewOnly || tool !== 'area' || e.button > 0) return;
  const p = hitAt(e); if (!p) return;
  controls.enabled = false; // painting, not turning (runs before OrbitControls: capture phase)
  canvas.setPointerCapture(e.pointerId);
  record(); // the stroke about to be painted is one undo step
  const cont = editing >= 0 && marks[editing]?.kind === 'area';
  if (cont) stroke = { m: marks[editing], fresh: false, n0: marks[editing].pts.length };
  else { const m = { kind: 'area', pts: [], nrm: [], r: brush, level: 5, types: new Set(), when: new Set(), note: '' }; marks.push(m); stroke = { m, fresh: true, n0: 0 }; editing = marks.length - 1; }
  addStrokePoint(p);
}, { capture: true });
canvas.addEventListener('pointermove', (e) => {
  if (!stroke) return;
  const p = hitAt(e); if (p) addStrokePoint(p);
});
function addStrokePoint(p) {
  const m = stroke.m, last = m.pts.at(-1);
  if (last && last.distanceTo(p) < m.r * 0.4) return;
  if (m.pts.length >= 240) { toast('This area is as big as it can get. Start a new area for more.'); return; }
  if (last && last.distanceTo(p) > m.r * 1.2) { // fill gaps when the finger moves fast
    const steps = Math.min(20, Math.ceil(last.distanceTo(p) / (m.r * 0.5)));
    for (let s = 1; s < steps; s++) { const q = last.clone().lerp(p, s / steps); const h = snapToSkin(q); if (h) { m.pts.push(h); m.nrm.push(normalAt(h)); } }
  }
  m.pts.push(p); m.nrm.push(normalAt(p));
  repaint(); if (stroke.fresh && m.pts.length === 1) renderList();
}
function snapToSkin(q) { const r = body.mesh.geometry.boundsTree.closestPointToPoint(q); return r ? r.point.clone() : null; }
function endStroke(cancel) {
  const s = stroke; stroke = null; controls.enabled = true;
  if (!s) return;
  if (cancel && s.m.pts.length - s.n0 < 3) { restore(undoStack.pop()); return; } // a stray touch before a pinch: not a stroke
  openEditor(marks.indexOf(s.m));
}
const upHandler = (e) => {
  pointers.delete(e.pointerId);
  if (stroke) { endStroke(false); down = null; return; }
  if (!down || viewOnly || tool !== 'point') { down = null; return; }
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (moved > 8 || dt > 650) return;
  const p = hitAt(e); if (!p) { if (editing >= 0) closeEditor(); return; }
  // tapping on an existing spot opens it rather than adding another
  const hitMark = marks.findIndex((m) => m.pts.some((q) => q.distanceTo(p) < Math.max(m.r * 0.7, 0.015)));
  if (hitMark >= 0) { openEditor(hitMark); return; }
  if (marks.length >= 30) { toast('That is the most marks one map can hold (30).'); return; }
  record();
  marks.push({ kind: 'spot', pts: [p], nrm: [normalAt(p)], r: SPOT_R, level: 5, types: new Set(), when: new Set(), note: '' });
  openEditor(marks.length - 1);
};
canvas.addEventListener('pointerup', upHandler);
canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); if (stroke) endStroke(true); down = null; });

// ---------- views and zoom ----------
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('#reset').addEventListener('click', () => flyTo(HOME.t, HOME.dir, HOME.dist));
const reg = $('#region');
reg.innerHTML = '<option value="">Zoom to…</option>' + REGIONS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
reg.addEventListener('change', () => { goRegion(reg.value); reg.value = ''; });
const zoomBy = (f) => { const d = camera.position.distanceTo(controls.target); flyTo(controls.target.clone(), null, THREE.MathUtils.clamp(d * f, controls.minDistance, controls.maxDistance), 400); };
$('#zin').addEventListener('click', () => zoomBy(0.7)); $('#zout').addEventListener('click', () => zoomBy(1.45));
for (const b of document.querySelectorAll('[data-sex]')) {
  b.addEventListener('click', async () => { if (b.dataset.sex === SEX) return; SEX = b.dataset.sex; setSexButtons(); await loadBody(); for (const m of marks) m.nrm = m.pts.map((p) => normalAt(p)); repaint(); });
}
function setSexButtons() { for (const b of document.querySelectorAll('[data-sex]')) { const on = b.dataset.sex === SEX; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } }

// ---------- encode / decode (all in the link) ----------
const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
const bits = (set) => [...set].reduce((a, i) => a | (1 << i), 0);
const unbits = (n) => new Set([...Array(16).keys()].filter((i) => n & (1 << i)));
function snap() {
  return { v: 1, sx: SEX === 'female' ? 1 : 0, st: Number($('#started').value) || 0, g: $('#msg').value.trim().slice(0, 600), d: new Date().toISOString().slice(0, 10),
    m: marks.map((m) => { const flat = []; let px = 0, py = 0, pz = 0; for (const p of m.pts) { const x = Math.round(p.x * 1000), y = Math.round(p.y * 1000), z = Math.round(p.z * 1000); flat.push(x - px, y - py, z - pz); px = x; py = y; pz = z; }
      return [m.kind === 'area' ? 1 : 0, Math.round(m.r * 1000), m.level, bits(m.types), bits(m.when), m.note || '', flat]; }) };
}
function unsnap(s) {
  SEX = s.sx ? 'female' : 'male';
  $('#started').value = s.st ? String(s.st) : ''; $('#msg').value = s.g || '';
  marks = (s.m || []).slice(0, 30).map(([k, r, level, ty, wh, note, flat]) => {
    const pts = []; let x = 0, y = 0, z = 0; for (let i = 0; i + 2 < flat.length && pts.length < 240; i += 3) { x += flat[i]; y += flat[i + 1]; z += flat[i + 2]; pts.push(V(x / 1000, y / 1000, z / 1000)); }
    return { kind: k ? 'area' : 'spot', pts, nrm: [], r: THREE.MathUtils.clamp(r / 1000, 0.01, 0.1), level: THREE.MathUtils.clamp(level | 0, 0, 10), types: unbits(ty), when: unbits(wh), note: String(note || '').slice(0, 160) };
  }).filter((m) => m.pts.length);
  return s;
}
async function encode(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  const z = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return b64u(new Uint8Array(z));
}
async function decode(code) {
  const raw = await new Response(new Blob([unb64u(code)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  const s = JSON.parse(new TextDecoder().decode(raw)); if (s.v !== 1) throw new Error('version'); return s;
}
async function link() { const u = new URL(location.href); u.hash = ''; u.searchParams.delete('embed'); return `${u.toString()}#p=${await encode(snap())}`; }

// ---------- summary text and picture ----------
function summaryLines() {
  const lines = marks.map((m, i) => { const d = describe(m, i); return `${d.title}: ${d.text}`; });
  const st = Number($('#started').value); const msg = $('#msg').value.trim();
  if (st) lines.push(`Started: ${STARTED[st]}.`);
  if (msg) lines.push(`Message: ${msg}`);
  return lines;
}
function wrap(g, text, maxW) { const out = []; let line = ''; for (const w of text.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
async function picture() {
  const W = 460, H = 860, pr = 2, k = pr;
  const saved = { p: camera.position.clone(), t: controls.target.clone(), aspect: camera.aspect, fov: camera.fov, view: camera.view && { ...camera.view } };
  const prevEdit = editing; editing = -1; repaint();
  renderer.setPixelRatio(pr); renderer.setSize(W, H, false); camera.clearViewOffset(); camera.aspect = W / H; camera.fov = 32; camera.updateProjectionMatrix();
  const shots = [];
  for (const [name, dir] of [['Front', VIEWS.front], ['Back', VIEWS.back]]) {
    camera.position.copy(HOME.t).addScaledVector(dir.clone().normalize(), 3.75); camera.lookAt(HOME.t); camera.updateMatrixWorld();
    modesty.setRegion(SEX === 'female' ? PRIVATE.bodyFemale : PRIVATE.bodyMale); modestySex = SEX; modesty.render(scene, camera);
    const c = document.createElement('canvas'); c.width = W * pr; c.height = H * pr; const g = c.getContext('2d'); g.drawImage(canvas, 0, 0);
    // number tags
    marks.forEach((m, i) => {
      const a = anchorOf(m), p = m.pts[a], n = m.nrm[a];
      if (n.dot(_cd.subVectors(camera.position, p).normalize()) < 0.05) return;
      const v = p.clone().addScaledVector(n, 0.012).project(camera); const x = (v.x * 0.5 + 0.5) * c.width, y = (-v.y * 0.5 + 0.5) * c.height, r = 11 * k;
      g.fillStyle = css(levelColor(m.level)); g.strokeStyle = '#fff'; g.lineWidth = 2 * k; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = m.level <= 4 ? '#1a1a1a' : '#fff'; g.font = `700 ${12 * k}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), x, y + 0.5 * k);
    });
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#9aa7b6'; g.font = `700 ${14 * k}px system-ui, sans-serif`; g.fillText(name.toUpperCase(), 16 * k, 28 * k);
    const sides = name === 'Front' ? ['Right', 'Left'] : ['Left', 'Right'];
    g.font = `${12 * k}px system-ui, sans-serif`; g.fillText(sides[0], 16 * k, c.height / 2); g.fillText(sides[1], c.width - 16 * k - g.measureText(sides[1]).width, c.height / 2);
    shots.push(c);
  }
  // restore the live view
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); camera.position.copy(saved.p); controls.target.copy(saved.t); camera.fov = saved.fov; resize(); controls.update();
  editing = prevEdit; repaint();
  // compose: two views and the list
  const listW = 520 * k, foot = 56 * k;
  const out = document.createElement('canvas'); out.width = shots[0].width * 2 + listW; out.height = shots[0].height + foot;
  const g = out.getContext('2d');
  g.fillStyle = '#0b0f14'; g.fillRect(0, 0, out.width, out.height);
  g.drawImage(shots[0], 0, 0); g.drawImage(shots[1], shots[0].width, 0);
  let y = 40 * k; const x0 = shots[0].width * 2 + 22 * k, maxW = listW - 44 * k;
  g.fillStyle = '#e9eef4'; g.font = `700 ${22 * k}px system-ui, sans-serif`; g.fillText('Where it hurts', x0, y); y += 22 * k;
  g.fillStyle = '#9aa7b6'; g.font = `${13 * k}px system-ui, sans-serif`; g.fillText(`Marked on ${new Date().toLocaleDateString()} · ${marks.length} ${marks.length === 1 ? 'mark' : 'marks'}`, x0, y); y += 28 * k;
  marks.forEach((m, i) => {
    const d = describe(m, i);
    g.fillStyle = css(levelColor(m.level)); g.beginPath(); g.arc(x0 + 10 * k, y - 5 * k, 10 * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = m.level <= 4 ? '#1a1a1a' : '#fff'; g.font = `700 ${11 * k}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillText(String(i + 1), x0 + 10 * k, y - 1 * k); g.textAlign = 'left';
    g.fillStyle = '#e9eef4'; g.font = `700 ${14 * k}px system-ui, sans-serif`;
    for (const ln of wrap(g, d.title.replace(/^\d+\. /, ''), maxW - 30 * k)) { g.fillText(ln, x0 + 30 * k, y); y += 18 * k; }
    g.fillStyle = '#c9d2dc'; g.font = `${13 * k}px system-ui, sans-serif`;
    for (const ln of wrap(g, d.text, maxW - 30 * k)) { g.fillText(ln, x0 + 30 * k, y); y += 17 * k; }
    y += 10 * k;
  });
  const st = Number($('#started').value), msg = $('#msg').value.trim();
  if (st || msg) { y += 6 * k; g.fillStyle = '#9aa7b6'; g.font = `700 ${12 * k}px system-ui, sans-serif`; g.fillText('ABOUT THE PAIN', x0, y); y += 20 * k; g.font = `${13 * k}px system-ui, sans-serif`; g.fillStyle = '#e9eef4'; }
  if (st) { g.fillText(`Started ${STARTED[st]}.`, x0, y); y += 18 * k; }
  if (msg) for (const ln of wrap(g, msg, maxW)) { g.fillText(ln, x0, y); y += 17 * k; }
  // scale bar
  g.fillStyle = '#9aa7b6'; g.font = `${11 * k}px system-ui, sans-serif`;
  const sy = out.height - foot - 40 * k; let sx = x0;
  for (const l of [1, 3, 5, 7, 9, 10]) { g.fillStyle = css(levelColor(l)); g.fillRect(sx, sy, 28 * k, 10 * k); sx += 30 * k; }
  g.fillStyle = '#9aa7b6'; g.fillText('mild → worst', sx + 8 * k, sy + 10 * k);
  // footer
  g.fillStyle = '#ff8a8e'; g.font = `700 ${13 * k}px system-ui, sans-serif`;
  g.fillText('Marked by the patient. Not a diagnosis. In an emergency call your local emergency number.', 16 * k, shots[0].height + 22 * k);
  g.fillStyle = '#9aa7b6'; g.font = `${11 * k}px system-ui, sans-serif`;
  g.fillText(`Where does it hurt? v${APP_VERSION} · Body: BodyParts3D, © The Database Center for Life Science, CC BY 4.0 (modified). Place names are approximate.`, 16 * k, shots[0].height + 42 * k);
  return new Promise((res) => out.toBlob(res, 'image/png'));
}
async function downloadPicture() {
  const blob = await picture();
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `where-it-hurts-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Picture saved to your downloads');
}

// ---------- send ----------
function toast(msg, ms = 2800) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
const aboutEl = $('#about');
function openDialog(title, html) { $('#about-home').appendChild(aboutEl); $('#dlg-title').textContent = title; $('#dlg-body').innerHTML = html; $('#dlg').classList.remove('hidden'); }
function closeDialog() { $('#about-home').appendChild(aboutEl); $('#dlg').classList.add('hidden'); }
$('#dlg-close').addEventListener('click', closeDialog);
// step 1: a little more about the pain; step 2: how to send it
function openSend() {
  if (editing >= 0) closeEditor();
  openDialog('Before you send', '<div id="about-slot"></div><div class="row"><button id="s-next" class="primary big">Next: send it</button></div>');
  $('#about-slot').appendChild(aboutEl);
  $('#s-next').addEventListener('click', () => openSendWays());
}
async function openSendWays() {
  const url = await link();
  const text = `Where it hurts (marked ${new Date().toLocaleDateString()}):\n${summaryLines().join('\n')}\n\nOpen the 3D map: ${url}`;
  const canFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.png', { type: 'image/png' })] }));
  openDialog('Send to your doctor', `
    <p class="note">Send it the way you usually contact your doctor or clinic: by text message, WhatsApp, email or the clinic's patient portal.
      The link opens your marks in 3D. Everything is inside the link and the picture; nothing is saved on our server.</p>
    ${navigator.share ? `<button id="s-share" class="primary big">Send…</button><p class="note">Opens your phone's sharing menu${canFiles ? ' with the picture and the link' : ''}.</p>` : ''}
    <div class="send-grid">
      <a id="s-mail" class="btnlink" href="mailto:?subject=${encodeURIComponent('Where it hurts')}&body=${encodeURIComponent(text)}">Email it</a>
      <button id="s-copy">Copy link and text</button>
      <button id="s-pic">Save picture</button>
    </div>
    <h3>What your doctor will get</h3>
    <pre class="summary">${esc(summaryLines().join('\n'))}</pre>
    <div class="row"><input type="text" id="s-url" readonly value="${esc(url)}" aria-label="Link to your pain map"><button id="s-copy-url">Copy link</button></div>
    <p class="note">Anyone with the link can see your marks, so send it only to your doctor or clinic.</p>
    <button id="s-back">Back</button>`);
  $('#s-back').addEventListener('click', () => openSend());
  $('#s-url').addEventListener('focus', (e) => e.target.select());
  const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch { $('#s-url').select(); toast('Press Ctrl+C or Cmd+C to copy'); } };
  $('#s-copy').addEventListener('click', () => copy(text, 'Copied. Paste it into a message to your doctor.'));
  $('#s-copy-url').addEventListener('click', () => copy(url, 'Link copied'));
  $('#s-pic').addEventListener('click', () => downloadPicture());
  $('#s-share')?.addEventListener('click', async () => {
    try {
      const data = { title: 'Where it hurts', text: text.replace(`\n\nOpen the 3D map: ${url}`, '\n\nOpen the 3D map:'), url };
      if (canFiles) { const blob = await picture(); data.files = [new File([blob], 'where-it-hurts.png', { type: 'image/png' })]; }
      await navigator.share(data);
    } catch (e) { if (e && e.name !== 'AbortError') toast('Sharing did not work here. Use Copy or Email instead.', 4000); }
  });
}
$('#send').addEventListener('click', () => { if (viewOnly) downloadPicture(); else openSend(); });

// ---------- a map opened from a link (the doctor's view) ----------
function setViewOnly(on, s) {
  viewOnly = on; received = on ? s : null;
  document.documentElement.classList.toggle('pain-received', on);
  $('#from-patient').hidden = !on; $('#tools-wrap').hidden = on; $('#edit-copy').hidden = !on; $('#new-map').hidden = !on;
  $('#list-title').textContent = on ? 'Marks' : 'Your marks';
  $('#edge-r').textContent = on ? "Patient's right" : 'Your right'; $('#edge-l').textContent = on ? "Patient's left" : 'Your left';
  document.querySelector('[data-view=left]').textContent = on ? 'Their left' : 'Your left'; document.querySelector('[data-view=right]').textContent = on ? 'Their right' : 'Your right';
  $('#send').textContent = on ? 'Save picture' : 'Send to my doctor';
  if (on) {
    const st = s.st ? `Started ${STARTED[s.st]}. ` : '';
    $('#fp-meta').textContent = `Marked by the patient on ${s.d ? new Date(s.d + 'T12:00').toLocaleDateString() : 'an unknown date'}. ${marks.length} ${marks.length === 1 ? 'mark' : 'marks'}. ${st}`;
    $('#fp-msg').hidden = !s.g; $('#fp-msg').textContent = s.g ? `“${s.g}”` : '';
  } else $('#fp-msg').hidden = true;
  closeEditor();
}
$('#edit-copy').addEventListener('click', () => { setViewOnly(false); toast('You can change the marks now. Send creates a new link.'); });
$('#new-map').addEventListener('click', () => { undoStack.length = redoStack.length = 0; updateHist(); marks = []; $('#msg').value = ''; $('#started').value = ''; history.replaceState(null, '', location.pathname + location.search); setViewOnly(false); });
async function openFromHash() {
  const m = location.hash.match(/^#p=([A-Za-z0-9_-]+)/); if (!m) return false;
  try {
    const s = await decode(m[1]); const sex = SEX; unsnap(s); setSexButtons();
    if (SEX !== sex || !body) await loadBody();
    for (const mk of marks) mk.nrm = mk.pts.map((p) => normalAt(p));
    setViewOnly(true, s); repaint(); renderList();
    return true;
  } catch (e) { console.error(e); toast('This link could not be opened. It may be cut short.', 4500); return false; }
}
window.addEventListener('hashchange', openFromHash);

// ---------- layout ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.8 ? 40 : 30; frame();
}
// keep the body in the free part of the screen (beside the panel on wide screens, above it on phones)
function frame() {
  const w = canvas.clientWidth, h = canvas.clientHeight; if (!w) return;
  const phone = w <= 760, panel = $('#panel').getBoundingClientRect();
  document.documentElement.style.setProperty('--tbh', `${$('.toolbar').offsetHeight}px`);
  let dx = 0, dy = 0;
  if (phone) { const top = $('.topbar').getBoundingClientRect().bottom + 4, bottom = Math.min(panel.top, $('.toolbar').getBoundingClientRect().top) - 4; dy = h / 2 - (top + bottom) / 2; }
  else dx = panel.left > w / 2 ? (w - panel.left + 16) / 2 : -(panel.right + 16) / 2;
  camera.setViewOffset(w, h, dx, dy, w, h); camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
new ResizeObserver(() => frame()).observe($('#panel'));

function loop(now) {
  stepAnim(now); controls.update(); updateTags();
  if (modestySex !== SEX) { modestySex = SEX; modesty.setRegion(SEX === 'female' ? PRIVATE.bodyFemale : PRIVATE.bodyMale); }
  modesty.render(scene, camera);
  requestAnimationFrame(loop);
}
(async () => {
  setSexButtons(); setTool('point'); resize();
  const t0 = performance.now();
  if (!(await openFromHash())) await loadBody();
  renderList();
  $('#loading').classList.add('done');
  if (!viewOnly && !EMBED && !qs.has('quiet')) toast('Tap where it hurts. Turn the body to mark the back.', 4200);
  window.__pain = { marks, get list() { return marks; }, whereIs, normalAt, repaint, renderList, openEditor, closeEditor, openSend, picture, link, setView, goRegion, flyTo, camera, controls, THREE, setTool,
    add(kind, pts, level = 5, extra = {}) { const P = pts.map((p) => { const v = V(...p); return snapToSkin(v) || v; }); marks.push({ kind, pts: P, nrm: P.map((p) => normalAt(p)), r: kind === 'spot' ? SPOT_R : extra.r || 0.045, level, types: new Set(extra.types || []), when: new Set(extra.when || []), note: extra.note || '' }); repaint(); renderList(); return marks.length - 1; },
    get body() { return body; } };
  window.__ready = { loadMs: Math.round(performance.now() - t0) };
  requestAnimationFrame(loop);
})();
