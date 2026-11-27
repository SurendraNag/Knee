// Whole-body explorer: BodyParts3D (CC BY 4.0), one mesh per body system, loaded on demand.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import './style.css';
import { APP_VERSION } from './version.js';
import { pageOf, keepParams } from './catalog.js';
import { mountSearch, mountNav } from './search.js';
import { createModesty, modestyButton, REGIONS as PRIVATE } from './modesty.js';
import { tapStart, isTap, fingerPick, lockPageZoom } from './touch.js';
import { mountChat } from './chat.js';
lockPageZoom();

THREE.Mesh.prototype.raycast = acceleratedRaycast;
const $ = (s) => document.querySelector(s);
$('#version').textContent = 'v' + APP_VERSION;
const qs = new URLSearchParams(location.search);
// Male (BodyParts3D as scanned) or female (the same parts fitted into a female body, with female organs)
const SEX = qs.get('sex') === 'female' ? 'female' : 'male';
const DIR = SEX === 'female' ? 'body-female/' : 'body/';
document.documentElement.dataset.sex = SEX;
document.title = SEX === 'female' ? 'Body Explorer · Female' : 'Body Explorer · Male';
for (const b of document.querySelectorAll('[data-sex]')) {
  const on = b.dataset.sex === SEX; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  b.addEventListener('click', () => { if (on) return; const u = new URL(location.href); if (b.dataset.sex === 'female') u.searchParams.set('sex', 'female'); else u.searchParams.delete('sex'); location.href = u.toString(); });
}
if (SEX === 'female') $('#credit-in').innerHTML = 'Model: <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noopener">BodyParts3D</a> © The Database Center for Life Science, with female organs from the <a href="https://humanatlas.io" target="_blank" rel="noopener">Human Reference Atlas</a> (HuBMAP) via <a href="https://github.com/MervinR07/open-anatomy-3d" target="_blank" rel="noopener">open-anatomy-3d</a>, all <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Pelvis, hip, knee, ankle and foot bones, joint cartilage, knee ligaments and the hip and leg muscles from the <a href="https://doi.org/10.56902/COB.vh.2022.0" target="_blank" rel="noopener">Visible Human Female</a> lower-limb models (Center for Orthopaedic Biomechanics, University of Denver; Andreassen et al., Sci Data 2023; CC BY 4.0), fitted to this body. Organ placement and skin adapted by this project; height, build and face are the reference body\'s. <b>Female body: preview, waiting for doctor review.</b>';

// ---------- Renderer ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, 3, 2.5); scene.add(key);
const rim = new THREE.DirectionalLight(0x9fc4ff, 0.7); rim.position.set(-2, 1.5, -2.5); scene.add(rim);
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.09; controls.minDistance = 0.08; controls.maxDistance = 6;
const HOME_TARGET = new THREE.Vector3(0, 0.88, 0), HOME_DIST = 3.6;
const VIEWS = { front: [0, 0.05, 1], back: [0, 0.05, -1], left: [1, 0.05, 0], right: [-1, 0.05, 0] };
camera.position.copy(HOME_TARGET).add(new THREE.Vector3(0.25, 0.1, 1).normalize().multiplyScalar(HOME_DIST));
controls.target.copy(HOME_TARGET);
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w < h ? 44 : 32; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- Private parts: blurred unless a clinician shows them ----------
const GENITAL = /penis|glans|testis|testicular|epididym|scrot|spermatic|pubic hair/i;
const modesty = createModesty(renderer, {
  region: SEX === 'female' ? PRIVATE.bodyFemale : PRIVATE.bodyMale,
  active: () => {
    if (ui.only && ui.selected) { const p = packs[ui.selected.pack].info.parts[ui.selected.i]; return ui.selected.pack === 'skin' || GENITAL.test(p.name); }
    return ['skin', ...(SEX === 'male' ? ['organs', 'arteries', 'veins'] : [])].some((id) => packs[id]?.mesh?.visible);
  },
});

// ---------- Camera flights ----------
let anim = null;
function flyTo(target, dir, dist) {
  const from = { p: camera.position.clone(), t: controls.target.clone() };
  const d = (dir ? new THREE.Vector3(...dir) : camera.position.clone().sub(controls.target)).normalize();
  const to = { t: target.clone(), p: target.clone().add(d.multiplyScalar(dist)) };
  anim = { from, to, t0: performance.now(), dur: 700 };
}
function stepAnim(now) {
  if (!anim) return;
  const k = Math.min(1, Math.max(0, (now - anim.t0) / anim.dur)), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  camera.position.lerpVectors(anim.from.p, anim.to.p, e); controls.target.lerpVectors(anim.from.t, anim.to.t, e);
  if (k >= 1) anim = null;
}
const REGIONS = {
  whole: [[0, 0.88, 0], [0.25, 0.1, 1], 3.6], head: [[0, 1.6, 0.0], [0.35, 0.1, 1], 0.75], neck: [[0, 1.47, 0], [0.4, 0.1, 1], 0.6],
  chest: [[0, 1.3, 0.02], [0.2, 0.1, 1], 1.0], abdomen: [[0, 1.08, 0.03], [0.2, 0.1, 1], 0.95], pelvis: [[0, 0.93, 0], [0.25, 0.15, 1], 0.95],
  shoulder: [[-0.17, 1.38, -0.02], [-0.6, 0.2, 1], 0.6], elbow: [[-0.22, 1.08, -0.02], [-0.5, 0.1, 1], 0.55], hand: [[-0.27, 0.8, 0.02], [-0.4, 0.1, 1], 0.45],
  knee: [[-0.085, 0.46, 0], [-0.2, 0.05, 1], 0.55], foot: [[-0.08, 0.06, 0.04], [-0.5, 0.35, 1], 0.5],
};
function goRegion(id) { const r = REGIONS[id]; if (r) flyTo(new THREE.Vector3(...r[0]), r[1], r[2]); }

// ---------- Systems ----------
const SYSTEM_INFO = {
  integumentary: ['Skin and hair', 'Part of the skin and hair, the body\'s outer protective covering.'],
  muscular: ['Muscle', 'A muscle. Muscles pull on bones through their tendons to move and steady the body.'],
  skeletal: ['Bone', 'Part of the skeleton, the frame of bones (and teeth and cartilage) that supports and protects the body.'],
  connective: ['Ligament or tendon', 'A tough band of connective tissue that ties structures together or carries a muscle\'s pull.'],
  nervous: ['Brain and nerves', 'Part of the nervous system, which carries signals between the brain, spinal cord and the body.'],
  arterial: ['Artery', 'An artery, carrying oxygen-rich blood away from the heart.'],
  venous: ['Vein', 'A vein, carrying blood back toward the heart.'],
  cardiac: ['Heart', 'Part of the heart, the muscular pump that drives blood around the body.'],
  respiratory: ['Breathing', 'Part of the respiratory system, which brings air in and out of the lungs.'],
  digestive: ['Digestion', 'Part of the digestive system, which breaks down food and absorbs it.'],
  urinary: ['Urinary', 'Part of the urinary system, which filters the blood and removes waste as urine.'],
  reproductive: ['Reproductive', 'Part of the reproductive system.'],
  endocrine: ['Glands', 'A gland that releases hormones into the blood.'],
  lymphatic: ['Lymphatic', 'Part of the lymphatic and immune system.'],
  sensory: ['Eyes and senses', 'Part of the eye or another sense organ.'],
};
const BASE_COLOR = {
  integumentary: 0xe0b49a, muscular: 0x9a3a33, skeletal: 0xe8dcc0, connective: 0xdfe6ea, nervous: 0xf0cf63, arterial: 0xc7302d,
  venous: 0x3e5fb6, cardiac: 0xa8302c, respiratory: 0xe8a5a6, digestive: 0xd78b72, urinary: 0xb5654d, reproductive: 0xd99a90,
  endocrine: 0xcf9a5a, lymphatic: 0x8fbf6a, sensory: 0xeeeeee,
};
function partColor(p) {
  const n = p.name.toLowerCase(), c = new THREE.Color(BASE_COLOR[p.system] ?? 0xcccccc);
  if (/cartilage|meniscus|disc\b|intervertebral/.test(n)) c.set(0xb8cddd);
  else if (/tooth|incisor|molar|canine|premolar/.test(n)) c.set(0xf4f1e6);
  else if (/gingiva/.test(n)) c.set(0xd9827c);
  else if (/brain|cerebr|gyrus|lobe|cerebell|pons|medulla|thalam|hippocamp|insula/.test(n) && p.system === 'nervous') c.set(0xe5b9b0);
  else if (/liver/.test(n)) c.set(0x8e3a2c);
  else if (/lung|bronch/.test(n)) c.set(0xe9a3a8);
  else if (/kidney/.test(n)) c.set(0x9b3f32);
  else if (/spleen/.test(n)) c.set(0x7c2f45);
  else if (/stomach|intestine|colon|duodenum|jejunum|ileum|cecum|rectum|esophag/.test(n)) c.set(0xdc9a85);
  else if (/hair|eyebrow/.test(n)) c.set(0x3b2a20);
  else if (/lip/.test(n)) c.set(0xc0716a);
  else if (/iris/.test(n)) c.set(0x5a7d9a);
  else if (/lens|cornea|vitreous|chamber/.test(n)) c.set(0xcfe6f2);
  else if (/tendon|aponeurosis/.test(n)) c.set(0xe6e2d8);
  return c;
}

// Female-only parts (Human Reference Atlas organs) and what they are
const FEMALE_INFO = {
  F_BREAST_L: 'Breast tissue: the milk-producing (mammary) glands and their ducts in fat, on top of the chest muscles. It grows at puberty and changes with pregnancy and age.',
  F_BREAST_R: 'Breast tissue: the milk-producing (mammary) glands and their ducts in fat, on top of the chest muscles. It grows at puberty and changes with pregnancy and age.',
  F_UTERUS: 'The uterus (womb): a hollow, muscular organ in the pelvis between the bladder and the rectum. Its lining builds up and is shed each month, and a pregnancy grows inside it.',
  F_OVARY_L: 'An ovary: one of two almond-sized glands beside the uterus that hold the eggs and make the hormones oestrogen and progesterone.',
  F_OVARY_R: 'An ovary: one of two almond-sized glands beside the uterus that hold the eggs and make the hormones oestrogen and progesterone.',
  F_TUBES: 'The fallopian (uterine) tubes: two narrow tubes from the top of the uterus toward the ovaries. They catch the egg, and fertilisation usually happens here.',
  F_VAGINA: 'The vagina: the muscular passage from the cervix (the neck of the uterus) to the outside of the body.',
  F_URETHRA: 'The female urethra: a short tube, about 4 cm long, that carries urine from the bladder to its opening just in front of the vagina. Its shape here is simplified.',
};
// Visible Human Female parts (female body): what the new ones are
const VHF_INFO = [
  [/cartilage of .*femoral head|cartilage of .*acetabulum/i, 'Articular (hyaline) cartilage of the hip: a smooth, slippery layer, a few millimetres thick, on the ball of the femur and in the socket of the pelvis. It wears thin in hip arthritis.'],
  [/cartilage of .*(condyles|tibial plateau|patella)/i, 'Articular (hyaline) cartilage of the knee: the smooth layer on the ends of the femur and tibia and the back of the kneecap that lets the joint glide. It wears thin in knee arthritis.'],
  [/cartilage of .*(talus|tibia at the ankle)/i, 'Articular cartilage of the ankle: the smooth layer where the tibia and the talus meet.'],
  [/anterior cruciate/i, 'The anterior cruciate ligament (ACL): inside the knee, from the femur to the front of the tibia. It stops the tibia sliding forward and helps control twisting; it is often torn in pivoting sports.'],
  [/posterior cruciate/i, 'The posterior cruciate ligament (PCL): inside the knee, behind the ACL. It stops the tibia sliding backward, for example in a dashboard injury.'],
  [/medial collateral/i, 'The medial collateral ligament (MCL): on the inner side of the knee. It resists the knee being pushed inward (a blow to the outside of the knee).'],
  [/lateral collateral/i, 'The lateral collateral ligament (LCL): on the outer side of the knee, from the femur to the head of the fibula. It resists the knee being pushed outward.'],
  [/^coccyx$/i, 'The coccyx (tailbone): three to five small fused vertebrae at the bottom of the spine.'],
];
// which detailed page (with Injury mode) a part of the whole body opens in
const DETAIL = [
  ['head', /\b(frontal|parietal|temporal|occipital|sphenoid|ethmoid|nasal bone|maxilla|zygomatic|palatine|vomer|lacrimal|mandible|tooth|hyoid|gingiva|masseter|temporalis)\b/i],
  ['spine', /\b(vertebra|atlas|axis|sacrum|coccyx|intervertebral|rib|costal|sternum|manubrium|xiphoid|erector|multifidus|psoas)\b/i],
  ['hand', /\b(scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal|finger|thumb|carpal|pollicis|palmar|interosse\w* of hand)\b/i],
  ['shoulder', /\b(clavicle|scapula|humerus|radius|ulna|deltoid|supraspinatus|infraspinatus|teres|subscapularis|biceps brachii|triceps|brachialis|coracobrachialis|pectoralis|rhomboid|levator scapulae|serratus anterior|trapezius)\b/i],
  ['leg', /\b(hip bone|femur|tibia|fibula|patella|talus|calcaneus|cuboid|navicular bone|cuneiform bone|metatarsal|toe|sesamoid bone of|gluteus|quadriceps|vastus|rectus femoris|biceps femoris|semitendinosus|semimembranosus|gastrocnemius|soleus|popliteus|sartorius|gracilis|plantaris|adductor|iliotibial|tibialis|fibularis|achilles|calcaneal)\b/i],
];
function detailPage(name) {
  const hit = DETAIL.find(([, re]) => re.test(name)); if (!hit) return null;
  const pg = pageOf(hit[0]), side = /\bleft\b/i.test(name) && ['leg', 'hand', 'shoulder'].includes(hit[0]) ? 'left' : null;
  return { name: pg.name, url: `./${pg.page}${keepParams({ side })}` };
}
const KNEE_PARTS = /femur|tibia|fibula|patella|quadriceps|vastus|rectus femoris|biceps femoris|semitendinosus|semimembranosus|gastrocnemius|popliteus|sartorius|gracilis|plantaris/i;
const packs = {}; // id -> { info, mesh, state(Uint8Array RGBA), tex, parts, loaded, loading }
const allParts = []; // { pack, i, p }
let manifest;
const ui = { selected: null, only: false, glass: true };

function makeMaterial(pack) {
  const isSkin = pack.id === 'skin';
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: pack.id === 'skeleton' ? 0.62 : pack.id === 'muscles' ? 0.48 : 0.42, metalness: 0,
    clearcoat: ['organs', 'senses', 'arteries', 'veins'].includes(pack.id) ? 0.5 : 0.15, clearcoatRoughness: 0.4,
    sheen: pack.id === 'muscles' ? 0.6 : 0, sheenColor: 0xd9776a, sheenRoughness: 0.45,
    side: THREE.FrontSide, transparent: isSkin, opacity: isSkin ? 0.55 : 1, depthWrite: !isSkin,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uState = { value: pack.tex }; sh.uniforms.uTexW = { value: pack.tex.image.width };
    sh.uniforms.uSel = { value: -1 }; mat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart; uniform sampler2D uState; uniform float uTexW; uniform float uSel; varying vec4 vState; varying float vIsSel;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float pi = aPart; vec2 uvS = vec2((mod(pi, uTexW) + 0.5) / uTexW, (floor(pi / uTexW) + 0.5) / float(textureSize(uState, 0).y));
        vState = texture2D(uState, uvS); vIsSel = abs(pi - uSel) < 0.5 ? 1.0 : 0.0;
        if (vState.a < 0.1) transformed = vec3(0.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vState; varying float vIsSel;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `if (vState.a < 0.1) discard;
        vec4 diffuseColor = vec4( diffuse * vState.rgb, opacity );
        if (vIsSel > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.62, 1.0), 0.35);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vIsSel > 0.5) totalEmissiveRadiance += vec3(0.05, 0.10, 0.20);');
  };
  return mat;
}

async function fetchPack(info) {
  const res = await fetch(`${import.meta.env.BASE_URL}${DIR}${info.file}`);
  let buf = await res.arrayBuffer();
  const u8 = new Uint8Array(buf, 0, 2);
  if (u8[0] === 0x1f && u8[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return buf;
}

async function loadPack(id) {
  const pk = packs[id]; if (pk.mesh || pk.loading) return pk.loading;
  setSysState(id, 'loading');
  pk.loading = (async () => {
    const info = pk.info, buf = await fetchPack(info), L = info.layout;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Uint16Array(buf, L.pos, info.nv * 3), 3, true));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(buf, L.nrm, info.nv * 3), 3, true));
    g.setAttribute('aPart', new THREE.BufferAttribute(new Uint16Array(buf, L.pid, info.nv), 1, false));
    const local = new Uint16Array(buf, L.idx, info.nt * 3), idx = new Uint32Array(info.nt * 3);
    for (const p of info.parts) for (const [v0, , t0, tc] of p.pieces || [[p.v0, p.vc, p.t0, p.tc]]) { const a = t0 * 3, b = a + tc * 3; for (let i = a; i < b; i++) idx[i] = local[i] + v0; }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const size = new THREE.Vector3().fromArray(info.max).sub(new THREE.Vector3().fromArray(info.min));
    const mesh = new THREE.Mesh(g, makeMaterial(pk));
    mesh.position.fromArray(info.min); mesh.scale.copy(size);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.5, 0.5, 0.5), 0.9); g.boundingBox = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
    mesh.userData.pack = id; mesh.renderOrder = id === 'skin' ? 2 : 0;
    scene.add(mesh); pk.mesh = mesh;
    setSysState(id, pk.on ? 'on' : 'off'); mesh.visible = pk.on;
    applyFocus();
    (window.requestIdleCallback || setTimeout)(() => { if (!g.boundsTree) g.boundsTree = new MeshBVH(g, { indirect: true }); });
  })();
  return pk.loading;
}

function partState(pk) {
  const n = pk.info.parts.length, w = Math.min(1024, n), h = Math.ceil(n / w);
  const data = new Uint8Array(w * h * 4);
  pk.info.parts.forEach((p, i) => { const c = partColor(p); data[i * 4] = c.r * 255; data[i * 4 + 1] = c.g * 255; data[i * 4 + 2] = c.b * 255; data[i * 4 + 3] = 255; });
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); tex.needsUpdate = true;
  pk.state = data; pk.tex = tex; pk.hidden = new Set();
}
function refreshVisibility(pk) {
  const sel = ui.selected;
  pk.info.parts.forEach((p, i) => {
    let vis = !pk.hidden.has(i);
    if (ui.only && sel) vis = sel.pack === pk.info.id && sel.i === i;
    pk.state[i * 4 + 3] = vis ? 255 : 0;
  });
  pk.tex.needsUpdate = true;
}

// Glass focus: everything except the selected part turns to glass.
let selMesh = null;
function applyFocus() {
  const sel = ui.selected, glass = ui.glass && sel && !ui.only;
  for (const pk of Object.values(packs)) {
    if (!pk.mesh) continue;
    refreshVisibility(pk);
    const m = pk.mesh.material, sh = m.userData.shader;
    if (sh) sh.uniforms.uSel.value = sel && sel.pack === pk.info.id ? sel.i : -1;
    const skin = pk.info.id === 'skin';
    m.transparent = glass || skin; m.opacity = glass ? (pk.info.id === 'skeleton' ? 0.14 : 0.05) : skin ? 0.55 : 1; m.depthWrite = !(glass || skin);
    m.needsUpdate = true;
  }
  if (selMesh) { scene.remove(selMesh); selMesh.geometry.dispose(); selMesh = null; }
  if (glass) { // solid copy of the selected part drawn over the glass
    const pk = packs[sel.pack], g = pk.mesh.geometry, p = pk.info.parts[sel.i];
    const sub = new THREE.BufferGeometry();
    for (const a of ['position', 'normal']) { const src = g.attributes[a]; sub.setAttribute(a, new THREE.BufferAttribute(src.array.slice(p.v0 * 3, (p.v0 + p.vc) * 3), 3, true)); }
    const ix = new Uint16Array(p.tc * 3); for (let i = 0; i < p.tc * 3; i++) ix[i] = g.index.array[p.t0 * 3 + i] - p.v0;
    sub.setIndex(new THREE.BufferAttribute(ix, 1));
    const c = partColor(p);
    selMesh = new THREE.Mesh(sub, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.5, clearcoat: 0.3, emissive: 0x0d1a33, transparent: true, opacity: 1 }));
    selMesh.position.copy(pk.mesh.position); selMesh.scale.copy(pk.mesh.scale); selMesh.renderOrder = 10;
    scene.add(selMesh);
  }
}

// ---------- Selection and info ----------
function select(packId, i, { fly = false } = {}) {
  if (packId == null) { ui.selected = null; ui.only = false; $('#act-only').setAttribute('aria-pressed', 'false'); $('#info').classList.add('hidden'); applyFocus(); return; }
  const p = packs[packId].info.parts[i];
  ui.selected = { pack: packId, i };
  const [group, what0] = SYSTEM_INFO[p.system] || ['Part', ''];
  const fem = FEMALE_INFO[p.id];
  const vhf = p.vhf ? (VHF_INFO.find(([re]) => re.test(p.name))?.[1] || what0) + ' Shape from the Visible Human Female scans (a real woman), fitted to this body. (Preview: waiting for a doctor to review.)' : null;
  const what = fem ? fem + ' (Preview: waiting for a doctor to review.)' : vhf || what0;
  $('#info-group').textContent = group; $('#info-name').textContent = p.name; $('#info-what').textContent = what;
  const dp = detailPage(p.name);
  $('#act-knee').hidden = !dp;
  if (dp) { $('#act-knee').href = dp.url; $('#act-knee').textContent = `Open ${dp.name.toLowerCase()} injuries`; }
  $('#info').classList.remove('hidden');
  applyFocus();
  if (fly) zoomTo(packId, i);
}
function zoomTo(packId, i) { const p = packs[packId].info.parts[i]; flyTo(new THREE.Vector3(...p.c), null, Math.max(0.2, p.r * 3.8)); }
$('#info-close').onclick = () => select(null);
$('#act-zoom').onclick = () => ui.selected && zoomTo(ui.selected.pack, ui.selected.i);
$('#act-only').onclick = () => { if (!ui.selected) return; ui.only = !ui.only; $('#act-only').setAttribute('aria-pressed', String(ui.only)); applyFocus(); if (ui.only) zoomTo(ui.selected.pack, ui.selected.i); };
$('#act-hide').onclick = () => { if (!ui.selected) return; packs[ui.selected.pack].hidden.add(ui.selected.i); select(null); };
$('#showall').onclick = () => { for (const pk of Object.values(packs)) pk.hidden?.clear(); select(null); };
$('#glass').onclick = () => { ui.glass = !ui.glass; $('#glass').setAttribute('aria-pressed', String(ui.glass)); applyFocus(); };

// ---------- Picking ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
ray.firstHitOnly = false;
function partOfFace(info, f) { let lo = 0, hi = info.parts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (info.parts[m].t0 <= f) lo = m; else hi = m - 1; } return lo; }
// the part under one screen point, or null
function partAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const meshes = Object.values(packs).filter((pk) => pk.mesh && pk.mesh.visible && pk.info.id !== 'skin').map((pk) => pk.mesh);
  if (packs.skin?.mesh?.visible && !meshes.length) meshes.push(packs.skin.mesh);
  for (const m of meshes) if (!m.geometry.boundsTree) m.geometry.boundsTree = new MeshBVH(m.geometry, { indirect: true });
  const hits = ray.intersectObjects(meshes, false);
  for (const h of hits) {
    const pk = packs[h.object.userData.pack], i = partOfFace(pk.info, h.faceIndex);
    if (pk.state[i * 4 + 3] === 0) continue;
    return { id: pk.info.id, i };
  }
  return null;
}
// a fingertip is wider than a nerve or vessel: on touch screens the nearest part around the tap counts
function pick(x, y, touch) {
  const near = fingerPick(x, y, touch, partAt);
  if (near) select(near.hit.id, near.hit.i); else select(null);
}
let down = null;
canvas.addEventListener('pointerdown', (e) => { if (!e.isPrimary) return; down = tapStart(e); anim = null; });
canvas.addEventListener('pointercancel', () => { down = null; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !e.isPrimary) return;
  if (isTap(down, e)) pick(e.clientX, e.clientY, down.touch);
  down = null;
});

// ---------- UI: systems, search, views ----------
function setSysState(id, s) { const b = document.querySelector(`[data-sys="${id}"]`); if (!b) return; b.dataset.state = s; b.setAttribute('aria-pressed', String(packs[id].on)); }
async function setSystem(id, on) {
  const pk = packs[id]; pk.on = on;
  if (on && !pk.mesh) await loadPack(id);
  if (pk.mesh) pk.mesh.visible = on;
  if (!on && ui.selected?.pack === id) select(null);
  setSysState(id, on ? 'on' : 'off');
}
function buildSystemsUI() {
  const list = $('#sys-list');
  for (const info of manifest.packs) {
    const b = document.createElement('button');
    b.className = 'sys'; b.dataset.sys = info.id; b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="dot" style="background:#${new THREE.Color(BASE_COLOR[info.parts[0]?.system] ?? 0xcccccc).getHexString()}"></span>${info.label}<span class="size">${(info.bytes / 1e6).toFixed(1)} MB</span>`;
    b.onclick = () => setSystem(info.id, !packs[info.id].on);
    list.appendChild(b);
  }
  const pp = modestyButton(modesty); pp.classList.add('sys-private'); list.after(pp);
  $('#sys-toggle').onclick = () => { const c = document.querySelector('.systems').classList.toggle('collapsed'); $('#sys-toggle').textContent = c ? 'Show' : 'Hide'; $('#sys-toggle').setAttribute('aria-expanded', String(!c)); };
  if (innerWidth < 700) $('#sys-toggle').click();
}
// one search box: parts of this body first, then injuries, structures and pages elsewhere in the app
const bnorm = (t) => ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
mountSearch($('#search'), $('#results'), { here: 'body', max: 30, extra: () => allParts.map((a) => ({
  kind: 'part', limb: 'body', label: a.p.name, sub: packs[a.pack].info.label, text: a.ntext ||= bnorm(a.p.name),
  run: async () => { $('#search').value = a.p.name; await setSystem(a.pack, true); select(a.pack, a.i, { fly: true }); },
})) });
mountNav($('.modes'), 'body');
for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => flyTo(controls.target.clone(), VIEWS[b.dataset.view], camera.position.distanceTo(controls.target));
$('#reset').onclick = () => goRegion('whole');
$('#region').onchange = (e) => { goRegion(e.target.value); e.target.value = ''; };

// ---------- Loop ----------
const fpsEl = $('#fps'); let frames = 0, fpsT = performance.now();
if (qs.has('fps')) fpsEl.hidden = false;
function loop(now) {
  stepAnim(now); controls.update(); modesty.render(scene, camera);
  frames++; if (now - fpsT > 1000) { fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsT))} fps`; frames = 0; fpsT = now; }
  requestAnimationFrame(loop);
}

(async () => {
  const t0 = performance.now();
  manifest = await (await fetch(`${import.meta.env.BASE_URL}${DIR}manifest.json`)).json();
  for (const info of manifest.packs) {
    packs[info.id] = { info, on: false }; partState(packs[info.id]);
    info.parts.forEach((p, i) => allParts.push({ pack: info.id, i, p, lname: p.name.toLowerCase() }));
  }
  buildSystemsUI();
  const start = (qs.get('sys') || 'skeleton').split(',').filter((s) => packs[s]);
  await Promise.all(start.map((s) => setSystem(s, true)));
  if (qs.has('view')) camera.position.copy(controls.target).add(new THREE.Vector3(...VIEWS[qs.get('view')]).normalize().multiplyScalar(HOME_DIST));
  if (qs.has('region')) { goRegion(qs.get('region')); anim.dur = 1; }
  if (qs.has('find')) { const a = allParts.find((x) => x.lname === qs.get('find').toLowerCase()); if (a) { await setSystem(a.pack, true); select(a.pack, a.i, { fly: true }); anim.dur = 1; if (qs.has('only')) $('#act-only').click(); if (anim) anim.dur = 1; } }
  $('#loading').classList.add('done');
  window.__body = { SEX, modesty, packs, select, setSystem, camera, controls, flyTo, goRegion };
  window.__ready = { loadMs: Math.round(performance.now() - t0) };
  requestAnimationFrame(loop);
  // warm the muscles in the background so the first toggle is quick
  if (!qs.has('nowarm')) setTimeout(() => loadPack('muscles'), 1500);
})();

mountChat();
