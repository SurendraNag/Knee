// Injury rendering: shader-driven tears/breaks on the anatomy meshes plus small extra geometry
// (frayed fibres, bone fragments). Every injury is anchored to a structure-local coordinate so
// it can be serialised (structure id + type + anchor) and restored exactly.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { STRUCTURES, CARTILAGE_OF, CFG } from './limbs.js';

const MAX = 6;
export const T = {
  G1: 1, G2: 2, G3: 3, // ligament / tendon
  SPLIT: 11, BUCKET: 12, FLAP: 13, // meniscus
  BRUISE: 21, STRESS: 22, HAIRLINE: 23, DISPLACED: 24, SHATTERED: 25, // bone
  ARTHRITIS: 26, SLIP: 27, // bone: worn joint edge with bone spurs; a vertebra slipped forward (spondylolisthesis)
  WORN: 14, STENOSIS: 15, // spinal disc: worn and flattened; broad bulge narrowing the canal
  // soft tissue (v0.23): muscle, skin, nerve, blood vessel
  STRAIN: 31, MTEAR: 32, CONTUSION: 33, CRUSH: 34, COMPART: 35,
  CUT: 41, OPENFX: 42, GRAZE: 43, DEGLOVE: 44,
  NBRUISE: 51, NCUT: 52, VTEAR: 53, CLOT: 54,
  // after treatment (v0.24): drawn as extra parts (metal, cast, brace) on top of the anatomy
  PLATE: 61, ROD: 62, SCREWS: 63, CAST: 64, BRACE: 65, GRAFT: 66, REPLACE: 67,
};

export const INJURY_TYPES = {
  muscle: [
    { type: T.STRAIN, label: 'Strain (partial tear)', sub: 'Some muscle fibres torn', say: (s) => `Some fibres of the ${s} are torn (a muscle strain or "pulled muscle"), with bleeding into the muscle.` },
    { type: T.MTEAR, label: 'Complete tear', sub: 'Torn across, ends pulled back', say: (s) => `The ${s} is torn across, and its two ends have pulled back from each other.` },
    { type: T.CONTUSION, label: 'Bruised muscle (contusion)', sub: 'Bleeding and swelling', say: (s) => `The ${s} is bruised from a direct blow: bleeding and swelling inside the muscle, without a tear.` },
    { type: T.CRUSH, label: 'Crush damage', sub: 'Bruised, swollen, damaged', say: (s) => `The ${s} has been crushed: the muscle is badly bruised and swollen, and some of it may be damaged.` },
    { type: T.COMPART, label: 'Compartment syndrome', sub: 'Pressure building up', say: (s) => `Swelling of the ${s} is trapped inside its tight wrapping (fascia), so pressure builds up and can squeeze the blood supply and nerves. This is an emergency that is often treated by opening the wrapping (fasciotomy).` },
  ],
  skin: [
    { type: T.CUT, label: 'Cut (laceration)', sub: 'Slit through the skin', say: (s) => `The ${s} is cut through here.` },
    { type: T.OPENFX, label: 'Wound over a break (open fracture)', sub: 'Bone broke through the skin', say: (s) => `There is a wound in the ${s} over a broken bone (an open fracture): the break is open to the outside, so it needs cleaning to prevent infection.` },
    { type: T.GRAZE, label: 'Graze (abrasion)', sub: 'Top layer scraped off', say: (s) => `The top layer of the ${s} is scraped off here (a graze).` },
    { type: T.DEGLOVE, label: 'Skin torn away (degloving)', sub: 'Large area lifted off', say: (s) => `A large area of ${s} has been torn away from the tissue underneath (degloving), as happens in crush and run-over injuries.` },
  ],
  nerve: [
    { type: T.NBRUISE, label: 'Bruised or stretched nerve', sub: 'Swollen, not cut', say: (s) => `The ${s} is bruised or stretched but not cut. This can cause numbness, tingling or weakness, which often recovers slowly.` },
    { type: T.NCUT, label: 'Nerve cut through', sub: 'Ends separated', say: (s) => `The ${s} is cut through, so feeling and movement it controls are lost below this point until it is repaired and regrows.` },
  ],
  vessel: [
    { type: T.VTEAR, label: 'Torn blood vessel', sub: 'Bleeding', say: (s) => `The ${s} is torn here, which causes bleeding.` },
    { type: T.CLOT, label: 'Blood clot', sub: 'Vessel blocked', say: (s) => `A blood clot is blocking the ${s} here. In a deep leg vein this is a deep vein thrombosis (DVT), a risk after leg injuries, operations and long rest in bed.` },
  ],
  ligament: [
    { type: T.G1, label: 'Mild sprain (grade I)', sub: 'Stretched, not torn', say: (s) => `The ${s} is stretched but not torn. This kind of injury often heals with rest and exercises; your clinician will say what applies to you.` },
    { type: T.G2, label: 'Partial tear (grade II)', sub: 'Some fibres torn', say: (s) => `The ${s} is partly torn: some of its fibres are frayed and broken, so it is looser and weaker.` },
    { type: T.G3, label: 'Complete tear (grade III)', sub: 'Torn all the way through', say: (s, i = {}) => `The ${s} is torn all the way through, so its two ends have pulled apart and it no longer holds the ${i.joint || CFG.defaultJoint} steady.` },
    { type: T.GRAFT, treatment: true, label: 'Reconstructed (graft)', sub: 'New ligament from a tendon', say: (s) => `The torn ${s} has been replaced by a graft (usually a piece of tendon) held in tunnels in the bone with screws: a reconstruction.` },
  ],
  tendon: [
    { type: T.G2, label: 'Partial tear', sub: 'Frayed fibres', say: (s) => `The ${s} is partly torn: some fibres are frayed and broken.` },
    { type: T.G3, label: 'Complete tear', sub: 'Torn through', say: (s, i = {}) => `The ${s} is torn all the way through, so ${i.tearEffect || CFG.defaultTearEffect}.` },
  ],
  meniscus: [
    { type: T.SPLIT, label: 'Split tear', sub: 'Radial split from the inner edge', say: (s) => `The ${s} has a split running in from its inner edge, like a cut across a rubber ring.` },
    { type: T.BUCKET, label: 'Bucket-handle tear', sub: 'Strip flipped into the joint', say: (s) => `A long strip of the ${s} has torn loose and flipped toward the middle of the knee like a bucket handle, which can lock the knee.` },
    { type: T.FLAP, label: 'Flap tear', sub: 'Loose flap lifted up', say: (s) => `A loose flap of the ${s} has peeled up and can catch in the joint.` },
  ],
  labrum: [
    { type: T.SPLIT, label: 'Labral tear', sub: 'Split at the rim', say: (s, i = {}) => `The ${s} is split where it joins the rim of the socket, so it no longer seals the joint and ${i.labrumEffect || 'can catch, click or cause groin pain'}.` },
    { type: T.FLAP, label: 'Flap tear', sub: 'Loose flap lifted up', say: (s) => `A flap of the ${s} has torn loose and can catch between the ball and the socket.` },
  ],
  disc: [
    { type: T.SPLIT, label: 'Central tear', sub: 'Split through the pad', say: (s) => `The ${s} has a tear through its thin centre, which can cause clicking and pain on the little-finger side of the wrist.` },
    { type: T.FLAP, label: 'Peripheral tear', sub: 'Torn loose at its edge', say: (s) => `The ${s} has torn loose at its edge, so it no longer holds the ends of the forearm bones firmly together.` },
  ],
  spinaldisc: [
    { type: T.FLAP, label: 'Herniated disc', sub: 'Soft centre pushed out backward', say: (s) => `The ${s} is herniated ("slipped"): its soft centre has pushed out through a tear in the tough outer ring, backward toward the spinal canal, where it can press on a nerve root or the spinal cord.` },
    { type: T.SPLIT, label: 'Annular tear', sub: 'Crack in the outer ring', say: (s) => `The outer ring of the ${s} has a crack. It can be painful on its own and is often the first step before a herniation.` },
    { type: T.WORN, label: 'Worn disc (degeneration)', sub: 'Dried out, flatter', say: (s) => `The ${s} has worn with time: it has dried out and lost height, so it cushions less and the joints behind it take more load. This is very common with age and does not always cause pain.` },
    { type: T.STENOSIS, label: 'Bulge narrowing the canal (stenosis)', sub: 'Broad bulge backward', say: (s) => `The ${s} bulges broadly backward into the spinal canal. Together with thickened ligaments and bone spurs this narrows the space for the nerves (spinal stenosis), which can cause leg pain or heaviness when walking that eases on sitting or bending forward.` },
  ],
  jawdisc: [
    { type: T.FLAP, label: 'Displaced disc', sub: 'Slipped forward', say: (s) => `The ${s} has slipped forward off the top of the jaw bone. The jaw clicks when the disc pops back in on opening, or locks when it cannot.` },
    { type: T.SPLIT, label: 'Disc tear', sub: 'Torn or worn through', say: (s) => `The ${s} is torn or worn through, so the bones of the jaw joint can grind, which is painful when chewing.` },
  ],
  bone: [
    { type: T.HAIRLINE, label: 'Hairline crack', sub: 'Thin crack, no shift', say: (s) => `A thin crack runs through the ${s}; the pieces have not moved apart.` },
    { type: T.DISPLACED, label: 'Displaced break', sub: 'Pieces shifted apart', say: (s) => `The ${s} is broken clean through and the pieces have shifted out of line.` },
    { type: T.SHATTERED, label: 'Break in several pieces', sub: 'Comminuted fracture', say: (s) => `The ${s} is broken into several pieces at this spot (a comminuted fracture).` },
    { type: T.BRUISE, label: 'Bone bruise', sub: 'Soft discoloured patch', say: (s) => `The ${s} is bruised inside: bleeding and swelling in the bone, without a break.` },
    { type: T.STRESS, label: 'Stress fracture', sub: 'Faint line, slight swelling', say: (s) => `A small crack in the ${s} from repeated strain, with slight swelling around it.` },
    { type: T.ARTHRITIS, label: 'Arthritis (bone spurs)', sub: 'Worn joint edge, bony lumps', say: (s) => `The joint surface of the ${s} is worn here, and the bone has grown small lumps (bone spurs) at the edge. This is osteoarthritis; it can cause stiffness and aching.` },
    { type: T.PLATE, treatment: true, label: 'Plate and screws', sub: 'Metal plate on the bone', say: (s) => `A metal plate is screwed onto the ${s} to hold the broken pieces in line while the bone heals.` },
    { type: T.ROD, treatment: true, only: 'long', label: 'Rod inside the bone (nail)', sub: 'Metal rod down the middle', say: (s) => `A metal rod (an intramedullary nail) runs down the inside of the ${s}, locked with a screw at each end, to hold the break in line while it heals. It usually stays in.` },
    { type: T.SCREWS, treatment: true, label: 'Screws', sub: 'Screws across the break', say: (s) => `Metal screws hold the pieces of the ${s} together.` },
    { type: T.CAST, treatment: true, label: 'Cast', sub: 'Hard cast around the limb', say: (s) => `A cast around the limb holds the ${s} still while it heals.` },
    { type: T.BRACE, treatment: true, label: 'Brace or splint', sub: 'Straps and side supports', say: (s) => `A brace around the joint near the ${s} supports it and limits movement while it heals.` },
    { type: T.REPLACE, treatment: true, label: 'Joint replacement', sub: 'Worn joint end replaced with metal', say: (s) => `The worn joint end of the ${s} has been replaced with a metal part (a joint replacement). The other side of the joint usually gets a metal or plastic part too.` },
    { type: T.SLIP, only: 'vertebra', label: 'Slipped forward (spondylolisthesis)', sub: 'Vertebra shifted over the one below', say: (s) => `The ${s} has slipped forward over the vertebra below it (spondylolisthesis), which can narrow the space for the nerves.` },
  ],
};
export const injuryKind = (id) => {
  let k = STRUCTURES[id]?.injury || STRUCTURES[id]?.kind;
  if (k === 'artery' || k === 'vein') k = 'vessel';
  return k === 'muscle' || k === 'skin' || k === 'nerve' || k === 'vessel' || k === 'bone' || k === 'ligament' || k === 'tendon' || k === 'meniscus' || k === 'labrum' || k === 'disc' || k === 'spinaldisc' || k === 'jawdisc' ? k : null;
};
export const typeInfo = (kind, type) => INJURY_TYPES[kind].find((t) => t.type === type);
// The injury types offered for one structure: a structure can narrow its kind's list with `injuryTypes` (for example, no
// stress fractures or bone bruises on skull bones or teeth). Saved injuries of other types still render through typeInfo.
// `only`: a type for some structures only (`vertebra`: vertebrae; `long`: the long bones, which can take a rod)
const LONG = new Set(['femur', 'tibia', 'humerus', 'radius', 'ulna', 'fibula']);
const onlyOk = (t, id) => !t.only || (t.only === 'long' ? LONG.has(id) : STRUCTURES[id]?.[t.only]);
export const injuryTypesFor = (id) => { const k = injuryKind(id), only = STRUCTURES[id]?.injuryTypes; return k ? INJURY_TYPES[k].filter((t) => (!only || only.includes(t.type) || (t.treatment && t.type !== T.ROD && t.type !== T.REPLACE)) && onlyOk(t, id)) : []; };

// ---------------- GLSL ----------------
const NOISE = /* glsl */ `
float ih(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float inz(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ih(i), ih(i + vec3(1,0,0)), f.x), mix(ih(i + vec3(0,1,0)), ih(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ih(i + vec3(0,0,1)), ih(i + vec3(1,0,1)), f.x), mix(ih(i + vec3(0,1,1)), ih(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 irot(vec3 v, vec3 axis, float a){ return v * cos(a) + cross(axis, v) * sin(a) + axis * dot(axis, v) * (1.0 - cos(a)); }
`;
const UNI = /* glsl */ `
uniform int uInjN;
uniform vec4 uInjA[${MAX}];
uniform vec4 uInjB[${MAX}];
uniform vec4 uInjC[${MAX}];
uniform vec4 uFlap;
varying vec3 vIP; varying float vIU; varying float vIV; varying float vIR; varying float vSide;
`;

// bone: A = point.xyz, type   B = dir.xyz, seed   C = surface normal.xyz, sideSign
const BONE_VERT_NORMAL = /* glsl */ `
vec3 injPos = position; vSide = 0.0;
for (int i = 0; i < ${MAX}; i++) { if (i >= uInjN) break;
  int ty = int(uInjA[i].w + 0.5); vec3 p = uInjA[i].xyz;
  if (ty == 24) {
    vec3 pn = uInjB[i].xyz; float s = dot(position - p, pn) + (inz(position * 2.2 + uInjB[i].w) - 0.5) * 0.5;
    if (s * uInjC[i].w > 0.0) {
      vec3 shiftDir = normalize(cross(pn, vec3(0.31, 0.0, 0.95)));
      vec3 ax = normalize(cross(pn, shiftDir));
      injPos = p + irot(position - p, ax, 0.16 * uInjC[i].w) + shiftDir * 0.55 + pn * uInjC[i].w * 0.25;
      objectNormal = irot(objectNormal, ax, 0.16 * uInjC[i].w);
      vSide = 1.0;
    }
  }
  if (ty == 22) { float d = length(position - p); injPos += objectNormal * 0.14 * exp(-d * d / 0.35); }
  if (ty == 26) { float d = length(position - p); float f = 1.0 - smoothstep(0.4, 1.4, d);
    float bump = smoothstep(0.45, 0.8, inz(position * 3.2 + uInjB[i].w)); injPos += objectNormal * (0.1 + 0.5 * bump) * f; }
  if (ty == 27) { injPos += vec3(0.0, 0.0, 0.75); }
  // soft tissue
  if (ty == 32) { vec3 r0 = position - p; float dy = r0.y; float rad = length(r0 - vec3(0.0, dy, 0.0));
    injPos += vec3(0.0, sign(dy) * 0.6 * exp(-abs(dy) / 2.5), 0.0) * (1.0 - smoothstep(2.5, 5.0, rad)); }
  if (ty == 33 || ty == 34 || ty == 35 || ty == 51 || ty == 54) { float d = length(position - p);
    float R = ty == 35 ? 7.0 : ty == 34 ? 4.5 : ty == 33 ? 2.5 : ty == 54 ? 3.0 : 1.6; float a = ty == 35 ? 0.65 : ty == 34 ? 0.5 : ty == 33 ? 0.25 : ty == 54 ? 0.25 : 0.12;
    injPos += objectNormal * a * (1.0 - smoothstep(R * 0.3, R, d)); }
}
`;
const BONE_FRAG = /* glsl */ `
{
  vec3 col = diffuseColor.rgb;
  if (vSide > 0.001 && vSide < 0.999) discard;
  for (int i = 0; i < ${MAX}; i++) { if (i >= uInjN) break;
    int ty = int(uInjA[i].w + 0.5); vec3 p = uInjA[i].xyz; vec3 rel = vIP - p;
    vec3 dir = uInjB[i].xyz; vec3 n0 = uInjC[i].xyz; float seed = uInjB[i].w;
    vec3 perp = normalize(cross(n0, dir));
    float s = dot(rel, dir), q = dot(rel, perp), depth = abs(dot(rel, n0));
    if (ty == 21) {
      float d = length(rel) + (inz(vIP * 3.0 + seed) - 0.5) * 0.5;
      float f = 1.0 - smoothstep(0.3, 1.5, d);
      vec3 bruise = mix(vec3(0.72, 0.62, 0.30), vec3(0.42, 0.16, 0.30), smoothstep(0.2, 0.75, f));
      col = mix(col, bruise, f * 0.85 * (0.75 + 0.25 * inz(vIP * 9.0)));
    }
    if (ty == 22 || ty == 23) {
      float L = ty == 22 ? 0.7 : 1.8; float w = ty == 22 ? 0.03 : 0.04;
      float jit = (inz(vec3(s * 5.0, seed, 1.0)) - 0.5) * 0.16 + (inz(vec3(s * 17.0, seed, 3.0)) - 0.5) * 0.04;
      float line = (1.0 - smoothstep(w * 0.4, w, abs(q - jit))) * (1.0 - smoothstep(L * 0.75, L, abs(s))) * step(depth, 0.9);
      if (ty == 23) { // a short branch
        vec3 bd = normalize(dir + perp * 0.8); float bs = dot(rel - dir * 0.5, bd); float bq = dot(rel - dir * 0.5, normalize(cross(n0, bd)));
        float bj = (inz(vec3(bs * 6.0, seed, 7.0)) - 0.5) * 0.1;
        line = max(line, (1.0 - smoothstep(w * 0.3, w * 0.8, abs(bq - bj))) * step(0.0, bs) * (1.0 - smoothstep(0.35, 0.6, bs)) * step(depth, 0.9));
      }
      col = mix(col, vec3(0.16, 0.08, 0.06), line * (ty == 22 ? 0.55 : 0.92));
      if (ty == 22) col = mix(col, vec3(0.78, 0.45, 0.42), 0.35 * exp(-dot(rel, rel) / 0.3));
    }
    if (ty == 31) { float d = length(rel) + (inz(vIP * 1.2 + seed) - 0.5) * 1.2; float f = 1.0 - smoothstep(1.2, 3.4, d);
      float fib = inz(vec3(vIP.x * 6.0, vIP.y * 0.9, vIP.z * 6.0) + seed);
      if (f > 0.4 && fib > 0.74) discard;
      col = mix(col, mix(vec3(0.38, 0.04, 0.12), vec3(0.2, 0.02, 0.06), smoothstep(0.5, 0.74, fib)), f * 0.85); }
    if (ty == 32) { float d = length(rel - vec3(0.0, rel.y, 0.0)); float band = abs(rel.y) - (inz(vIP * 2.0 + seed) - 0.5) * 0.5;
      if (band < 0.45 && d < 4.0) discard;
      col = mix(col, vec3(0.6, 0.1, 0.1), (1.0 - smoothstep(0.45, 1.6, band)) * (1.0 - smoothstep(3.0, 4.0, d)) * 0.8); }
    if (ty == 33 || ty == 34) { float R = ty == 34 ? 4.5 : 2.5; float d = length(rel) + (inz(vIP * 1.5 + seed) - 0.5) * R * 0.4;
      float f = 1.0 - smoothstep(R * 0.2, R, d);
      vec3 b = ty == 34 ? mix(vec3(0.45, 0.12, 0.2), vec3(0.25, 0.05, 0.12), inz(vIP * 4.0)) : vec3(0.45, 0.16, 0.32);
      col = mix(col, b, f * 0.8); }
    if (ty == 35) { float d = length(rel); float f = 1.0 - smoothstep(2.0, 7.0, d);
      col = mix(col, vec3(0.55, 0.16, 0.36), f * 0.6); }
    if (ty == 41) { vec3 dd = normalize(cross(n0, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.35, 0.0)); float sl = dot(rel, dd); float w = length(rel - dd * sl - n0 * dot(rel, n0));
      float L = 2.2; float wid = 0.1 * (1.0 - smoothstep(L * 0.6, L, abs(sl)));
      if (w < wid && abs(sl) < L && depth < 1.0) discard;
      col = mix(col, vec3(0.65, 0.12, 0.12), (1.0 - smoothstep(wid, wid + 0.25, w)) * step(abs(sl), L) * step(depth, 1.0) * 0.8); }
    if (ty == 42 || ty == 44) { float R = ty == 44 ? 3.6 : 1.2; float d = length(rel - n0 * dot(rel, n0)) + (inz(vIP * (ty == 44 ? 0.9 : 2.5) + seed) - 0.5) * R * 0.5;
      if (d < R && depth < 1.5) discard;
      col = mix(col, vec3(0.6, 0.1, 0.1), (1.0 - smoothstep(R, R + 0.6, d)) * step(depth, 1.5) * 0.85); }
    if (ty == 43) { float d = length(rel) + (inz(vIP * 2.0 + seed) - 0.5) * 0.9; float f = 1.0 - smoothstep(0.6, 2.0, d);
      col = mix(col, mix(vec3(0.85, 0.42, 0.4), vec3(0.62, 0.15, 0.15), inz(vIP * 14.0)), f * 0.85); }
    if (ty == 51) { float f = 1.0 - smoothstep(0.3, 1.6, length(rel)); col = mix(col, vec3(0.8, 0.35, 0.35), f * 0.7); }
    if (ty == 52 || ty == 53) { float band = abs(rel.y) - (inz(vIP * 4.0 + seed) - 0.5) * 0.15;
      if (band < 0.3 && length(rel) < 2.5) discard;
      col = mix(col, ty == 53 ? vec3(0.45, 0.02, 0.04) : vec3(0.8, 0.3, 0.3), (1.0 - smoothstep(0.3, 1.2, band)) * (1.0 - smoothstep(1.5, 2.5, length(rel))) * 0.8); }
    if (ty == 54) { float f = 1.0 - smoothstep(1.0, 3.6, length(rel)); col = mix(col, vec3(0.3, 0.03, 0.08), f * 0.9); }
    if (ty == 26) {
      float d = length(rel); float f = 1.0 - smoothstep(0.4, 1.5, d);
      #ifdef INJ_CART
      if (d + (inz(vIP * 2.5 + seed) - 0.5) * 0.6 < 1.15) discard; // the cartilage is worn through here
      #endif
      col = mix(col, vec3(0.80, 0.72, 0.52), f * 0.55 * (0.6 + 0.4 * inz(vIP * 6.0)));
    }
    if (ty == 24) {
      float sd = dot(rel, uInjB[i].xyz) + (inz(vIP * 2.2 + seed) - 0.5) * 0.5;
      col = mix(col, vec3(0.35, 0.2, 0.15), (1.0 - smoothstep(0.0, 0.16, abs(sd))) * 0.7);
    }
    if (ty == 25) {
      vec3 flat_ = rel - n0 * dot(rel, n0); float d = length(flat_);
      float ang = atan(q, s);
      float R = 0.85 * (0.75 + 0.5 * inz(vec3(ang * 2.0, seed, 0.0)));
      if (d < R && depth < 1.1) discard;
      float rays = 0.0;
      for (int k = 0; k < 5; k++) {
        float a = float(k) * 1.2566 + seed;
        vec3 rd = dir * cos(a) + perp * sin(a);
        float rs = dot(flat_, rd); float rq = dot(flat_, normalize(cross(n0, rd)));
        float jit = (inz(vec3(rs * 6.0, seed + float(k), 2.0)) - 0.5) * 0.12;
        rays = max(rays, (1.0 - smoothstep(0.006, 0.022, abs(rq - jit))) * step(R * 0.9, rs) * (1.0 - smoothstep(1.4, 2.2, rs)));
      }
      col = mix(col, vec3(0.15, 0.08, 0.06), rays * step(depth, 1.1));
      col = mix(col, vec3(0.45, 0.2, 0.15), (1.0 - smoothstep(R, R + 0.12, d)) * 0.6 * step(depth, 1.1));
    }
  }
  if (!gl_FrontFacing) col = vec3(0.5, 0.17, 0.13) * (0.6 + 0.5 * inz(vIP * 9.0));
  diffuseColor.rgb = col;
}
`;

// sweeps: A = u0, type   B.x = seed
const SWEEP_VERT = /* glsl */ `
vec3 injPos = position; vSide = 0.0;
vec3 cen = aCen; vec3 tg = normalize(aTan);
for (int i = 0; i < ${MAX}; i++) { if (i >= uInjN) break;
  int ty = int(uInjA[i].w + 0.5); float du = uv.x - uInjA[i].x; float ad = abs(du); float sg = du < 0.0 ? -1.0 : 1.0;
  if (ty == 1) { float w = 1.0 - smoothstep(0.0, 0.9, ad); injPos = mix(injPos, cen + (injPos - cen) * 0.8, w); }
  if (ty == 2) { float w = 1.0 - smoothstep(0.0, 0.7, ad); injPos = mix(injPos, cen + (injPos - cen) * 0.62, w);
    injPos += normal * w * (inz(vec3(uv.y * 40.0, uv.x * 4.0, 1.0)) - 0.5) * 0.12; }
  if (ty == 3) { float gap = 0.32, L = 1.0;
    if (ad < gap + L) {
      float k = 1.0 - clamp((ad - gap) / L, 0.0, 1.0); float kk = k * k;
      injPos = cen + (injPos - cen) * mix(1.0, 0.45, k) + tg * sg * k * 0.35;
      vec3 perp = normalize(cross(tg, vec3(0.3, 1.0, 0.2)));
      vec3 perp2 = cross(tg, perp);
      float a = kk * 2.6 * sg;
      injPos += (perp * (1.0 - cos(a)) + perp2 * sin(a) * 0.6) * 0.55 * k;
    }
  }
  if (ty == 11) { float w = 1.0 - smoothstep(0.0, 0.7, ad);
    injPos += tg * sg * 0.22 * w * smoothstep(0.2, 0.7, aRad); }
  if (ty == 12) { float env = 1.0 - smoothstep(0.9, 1.7, ad);
    float inner = step(0.5, aRad);
    injPos += (-aSide * 0.85 + vec3(0.0, 0.22, 0.0)) * env * inner; }
  if (ty == 14) { injPos.y = cen.y + (injPos.y - cen.y) * 0.55; injPos += aSide * 0.12 * (1.0 - aRad); }
  if (ty == 15) { float back = smoothstep(0.1, 0.8, -aSide.z); injPos += aSide * 0.85 * back * (1.0 - aRad * 0.7); }
  if (ty == 13) { bool toward = uFlap.w > 0.5;
    if (du > 0.0 && du < 1.1 && (toward || aRad > 0.42)) {
      float lift = (1.0 - du / 1.1); float r = toward ? 1.0 : smoothstep(0.42, 1.0, aRad);
      if (toward) injPos += normalize(uFlap.xyz - cen) * 0.6 * lift + normal * 0.08 * lift;
      else injPos += vec3(0.0, 0.85, 0.0) * lift * r + (-aSide) * 0.35 * lift * r; } }
}
vIU = uv.x; vIV = uv.y; vIR = aRad;
`;
const SWEEP_FRAG = /* glsl */ `
{
  vec3 col = diffuseColor.rgb;
  for (int i = 0; i < ${MAX}; i++) { if (i >= uInjN) break;
    int ty = int(uInjA[i].w + 0.5); float du = vIU - uInjA[i].x; float ad = abs(du);
    if (ty == 1) col = mix(col, col * vec3(1.0, 0.82, 0.8), (1.0 - smoothstep(0.0, 0.9, ad)) * 0.7);
    if (ty == 2) { float w = 1.0 - smoothstep(0.0, 0.55, ad);
      if (w > 0.05 && inz(vec3(vIV * 46.0, 0.0, uInjB[i].x)) > 0.74 - 0.16 * w) discard;
      col = mix(col, vec3(0.72, 0.35, 0.33), w * 0.6); }
    if (ty == 3) { if (ad < 0.32) discard; col = mix(col, vec3(0.7, 0.3, 0.28), (1.0 - smoothstep(0.32, 1.0, ad)) * 0.75); }
    if (ty == 11) { if (ad < 0.09 && vIR > 0.22) discard; col = mix(col, vec3(0.7, 0.45, 0.4), (1.0 - smoothstep(0.0, 0.25, ad)) * 0.35 * step(0.2, vIR)); }
    if (ty == 12) { if (ad < 1.55 && abs(vIR - 0.5) < 0.05) discard; }
    if (ty == 14) col = mix(col, vec3(0.55, 0.48, 0.36), 0.75);
    if (ty == 66) col = mix(col, vec3(0.93, 0.85, 0.62), 0.7) * (0.9 + 0.1 * step(0.5, fract(vIV * 12.0)));
    if (ty == 15) col = mix(col, vec3(0.78, 0.5, 0.45), 0.3);
    if (ty == 13) { if ((du > 0.0 && du < 1.1 && abs(vIR - 0.42) < 0.04) || (abs(du) < 0.035 && vIR > 0.42)) discard; }
  }
  if (!gl_FrontFacing) col *= vec3(0.75, 0.55, 0.5);
  diffuseColor.rgb = col;
}
`;

function patchMaterial(mat, uniforms, family, cartilage = false) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${NOISE}\n${UNI}\n${family === 'sweep' ? 'attribute vec3 aCen; attribute vec3 aTan; attribute vec3 aSide; attribute float aRad;' : ''}`);
    if (family === 'bone') {
      sh.vertexShader = sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${BONE_VERT_NORMAL}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = injPos; vIP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${cartilage ? '#define INJ_CART 1' : ''}\n${NOISE}\n${UNI}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${BONE_FRAG}`);
    } else {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWEEP_VERT}\ntransformed = injPos; vIP = position;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}\n${UNI}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${SWEEP_FRAG}`);
    }
  };
  const prevKey = mat.customProgramCacheKey?.() || '';
  mat.customProgramCacheKey = () => `${prevKey}-inj-${family}${cartilage ? "-cart" : ""}`;
  mat.needsUpdate = true;
}

// Ring data for swept meshes (ligaments, tendons, menisci): per-vertex ring centre, tangent,
// outward side direction and normalised radial depth (0 = outer rim, 1 = inner edge).
function addSweepAttributes(geom) {
  const P = geom.attributes.position.array, UV = geom.attributes.uv.array, n = P.length / 3;
  const rings = new Map();
  for (let i = 0; i < n; i++) {
    const u = UV[i * 2];
    if (!rings.has(u)) rings.set(u, []);
    rings.get(u).push(i);
  }
  const keys = [...rings.keys()].sort((a, b) => a - b);
  const centers = keys.map((k) => { const c = new THREE.Vector3(); for (const i of rings.get(k)) c.add(new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])); return c.divideScalar(rings.get(k).length); });
  const all = centers.reduce((a, c) => a.add(c), new THREE.Vector3()).divideScalar(centers.length);
  const cen = new Float32Array(n * 3), tan = new Float32Array(n * 3), side = new Float32Array(n * 3), rad = new Float32Array(n);
  const ringInfo = [];
  keys.forEach((k, r) => {
    const t = centers[Math.min(r + 1, keys.length - 1)].clone().sub(centers[Math.max(r - 1, 0)]).normalize();
    const s = new THREE.Vector3(-t.z, 0, t.x).normalize();
    if (s.dot(centers[r].clone().sub(all)) < 0) s.negate();
    const idx = rings.get(k);
    let mn = Infinity, mx = -Infinity, rmax = 0;
    const proj = idx.map((i) => { const v = new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(centers[r]); rmax = Math.max(rmax, v.length()); const p = v.dot(s); mn = Math.min(mn, p); mx = Math.max(mx, p); return p; });
    idx.forEach((i, j) => {
      cen.set([centers[r].x, centers[r].y, centers[r].z], i * 3); tan.set([t.x, t.y, t.z], i * 3); side.set([s.x, s.y, s.z], i * 3);
      rad[i] = (mx - proj[j]) / ((mx - mn) || 1);
    });
    ringInfo.push({ u: k, center: centers[r], tangent: t, side: s, radius: rmax });
  });
  geom.setAttribute('aCen', new THREE.BufferAttribute(cen, 3));
  geom.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
  geom.setAttribute('aSide', new THREE.BufferAttribute(side, 3));
  geom.setAttribute('aRad', new THREE.BufferAttribute(rad, 1));
  geom.userData.rings = ringInfo;
}
function ringAt(geom, u) {
  const rings = geom.userData.rings; let best = rings[0];
  for (const r of rings) if (Math.abs(r.u - u) < Math.abs(best.u - u)) best = r;
  return best;
}

// deterministic random
function rng(seed) { let s = Math.floor(seed * 1e6) || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }


export class InjuryManager {
  constructor(scene, meshes) {
    this.scene = scene; this.meshes = meshes; this.list = []; this.targets = {};
    this.extraGroup = new THREE.Group(); scene.add(this.extraGroup);
    this.fiberMat = new THREE.MeshStandardMaterial({ color: 0xd9b9ae, roughness: 0.6 });
    this.fragMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb2, roughness: 0.85, flatShading: true });
    this.metalMat = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide });
    this.castMat = new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 0.95, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    this.braceMat = new THREE.MeshStandardMaterial({ color: 0x2c3e66, roughness: 0.7, side: THREE.DoubleSide });
    const linkedCart = new Set();
    for (const [id, mesh] of Object.entries(meshes)) {
      const kind = injuryKind(id);
      if (!kind) continue;
      const uniforms = {
        uInjN: { value: 0 },
        uInjA: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
        uInjB: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
        uInjC: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
        uFlap: { value: STRUCTURES[id].flapToward ? new THREE.Vector4(...STRUCTURES[id].flapToward, 1) : new THREE.Vector4() },
      };
      // soft tissue is drawn like bone (by position on the surface), whatever the mesh's shape
      const family = ['bone', 'muscle', 'skin', 'nerve', 'vessel'].includes(kind) ? 'bone' : 'sweep';
      if (family === 'sweep') addSweepAttributes(mesh.geometry);
      patchMaterial(mesh.material, uniforms, family);
      const linked = [mesh];
      // a cartilage mesh shared by several bones (foot) follows the first bone that claims it
      for (const c of CARTILAGE_OF[id] || []) if (meshes[c] && !linkedCart.has(c)) { linkedCart.add(c); patchMaterial(meshes[c].material, uniforms, 'bone', true); linked.push(meshes[c]); }
      this.targets[id] = { kind, family, uniforms, linked };
    }
  }

  // Snap a world-space hit to the structure and build the anchor for an injury.
  anchorFor(id, point) {
    const mesh = this.meshes[id];
    const res = mesh.geometry.boundsTree.closestPointToPoint(mesh.worldToLocal(point.clone()));
    const p = res.point;
    const g = mesh.geometry, ia = g.index.array[res.faceIndex * 3];
    const nrm = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, ia).normalize();
    if (g.attributes.uv && this.targets[id].family === 'sweep') return { u: g.attributes.uv.array[ia * 2], p: p.toArray(), n: nrm.toArray() };
    return { p: p.toArray(), n: nrm.toArray() };
  }

  add(id, type, anchor, seed = Math.random()) {
    if (this.list.filter((x) => x.id === id).length >= MAX) return null;
    const inj = { id, type, anchor, seed: Math.round(seed * 1000) / 1000 };
    this.list.push(inj);
    this.rebuild();
    return inj;
  }
  undo() { this.list.pop(); this.rebuild(); }
  remove(i) { this.list.splice(i, 1); this.rebuild(); }
  clear() { this.list = []; this.rebuild(); }
  set(list) { this.list = list.slice(); this.rebuild(); }

  // world position for the numbered tag
  tagPoint(inj) { return this.meshes[inj.id].localToWorld(this._tagLocal(inj)); }
  _tagLocal(inj) {
    const t = this.targets[inj.id];
    const p = new THREE.Vector3().fromArray(inj.anchor.p);
    if (t.family === 'sweep' && inj.type === T.BUCKET) {
      const r = ringAt(this.meshes[inj.id].geometry, inj.anchor.u);
      return r.center.clone().addScaledVector(r.side, -0.9).add(new THREE.Vector3(0, 0.35, 0));
    }
    if (t.family === 'sweep' && inj.type === T.FLAP) {
      const to = STRUCTURES[inj.id].flapToward;
      return to ? p.lerp(new THREE.Vector3(...to), 0.18) : p.add(new THREE.Vector3(0, 0.45, 0));
    }
    if (inj.type === T.DISPLACED) return p;
    return p;
  }

  rebuild() {
    for (const c of [...this.extraGroup.children]) { this.extraGroup.remove(c); c.geometry.dispose(); }
    for (const [id, t] of Object.entries(this.targets)) {
      const mine = this.list.filter((x) => x.id === id);
      t.uniforms.uInjN.value = mine.length;
      const needsBack = mine.some((x) => [T.G2, T.G3, T.SPLIT, T.BUCKET, T.FLAP, T.DISPLACED, T.SHATTERED, T.STRAIN, T.MTEAR, T.CUT, T.OPENFX, T.DEGLOVE, T.NCUT, T.VTEAR].includes(x.type));
      for (const m of t.linked) { if (m.material.side !== (needsBack ? THREE.DoubleSide : THREE.FrontSide)) { m.material.side = needsBack ? THREE.DoubleSide : THREE.FrontSide; m.material.needsUpdate = true; } }
      this._owner = id;
      mine.forEach((inj, i) => {
        const A = t.uniforms.uInjA.value[i], B = t.uniforms.uInjB.value[i], C = t.uniforms.uInjC.value[i];
        const p = new THREE.Vector3().fromArray(inj.anchor.p), n = new THREE.Vector3().fromArray(inj.anchor.n);
        if (t.family === 'bone') {
          A.set(p.x, p.y, p.z, inj.type);
          // crack direction: roughly around the bone (perpendicular to its long axis), randomised by seed
          const axis = new THREE.Vector3(0, 1, 0);
          let dir = new THREE.Vector3().crossVectors(n, axis);
          if (dir.lengthSq() < 0.05) dir.set(1, 0, 0);
          dir.normalize().applyAxisAngle(n, (inj.seed - 0.5) * 0.9);
          if (inj.type === T.DISPLACED) {
            // break plane: mostly transverse, slightly oblique; the joint-side piece shifts
            const pn = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), (inj.seed - 0.5) * 0.7).normalize();
            const jointSide = id === 'femur' || id === 'patella' ? (id === 'patella' ? 1 : -1) : 1;
            B.set(pn.x, pn.y, pn.z, inj.seed * 10);
            C.set(n.x, n.y, n.z, jointSide);
          } else {
            B.set(dir.x, dir.y, dir.z, inj.seed * 10);
            C.set(n.x, n.y, n.z, 1);
          }
          if (inj.type === T.SHATTERED) this.addFragments(p, n, dir, inj.seed);
          if (inj.type >= 61 && inj.type <= 67) this.addTreatment(id, inj, p, n);
        } else {
          A.set(inj.anchor.u, 0, 0, inj.type); B.set(inj.seed * 10, 0, 0, 0);
          if (inj.type === T.G2 || inj.type === T.G3) this.addFibres(id, inj);
          if (inj.type === T.GRAFT) this.addGraftScrews(id);
        }
      });
    }
  }

  // ---------- after treatment: implants, casts and braces (simplified illustrations, for doctor review) ----------
  _put(geom, mat) { const m = new THREE.Mesh(geom, mat); m.userData.owner = this._owner; this.extraGroup.add(m); return m; }
  _cyl(a, b, r, mat, r2 = r) { // a cylinder from a to b
    const d = b.clone().sub(a), L = d.length(); const g = new THREE.CylinderGeometry(r2, r, L, 14);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return this._put(g, mat);
  }
  // centre line of a long bone: centroids of thin horizontal slices
  _centre(id) {
    const g = this.meshes[id].geometry; if (g.userData.centre) return g.userData.centre;
    if (!g.boundingBox) g.computeBoundingBox();
    const P = g.attributes.position.array, b = g.boundingBox, n = 24, pts = [];
    for (let k = 0; k <= n; k++) {
      const y = b.min.y + (b.max.y - b.min.y) * (0.06 + 0.88 * k / n); const c = new THREE.Vector3(); let m = 0;
      for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < 0.5) { c.x += P[i]; c.z += P[i + 2]; m++; }
      if (m) pts.push(new THREE.Vector3(c.x / m, y, c.z / m));
    }
    return (g.userData.centre = pts);
  }
  _surface(id, q) { const mesh = this.meshes[id]; const r = mesh.geometry.boundsTree.closestPointToPoint(q); const g = mesh.geometry; const ia = g.index.array[r.faceIndex * 3];
    return { p: r.point.clone(), n: new THREE.Vector3().fromBufferAttribute(g.attributes.normal, ia).normalize() }; }
  // part of the skin around the limb between two heights, pushed out (cast) or cut into bands (brace)
  _skinBand(y0, y1, push, keep = () => true) {
    const skin = this.meshes.skin; if (!skin) return null;
    const g = skin.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array;
    const pos = [], map = new Map(), idx = [];
    const vert = (i) => { if (map.has(i)) return map.get(i); const k = pos.length / 3; pos.push(P[i * 3] + N[i * 3] * push, P[i * 3 + 1] + N[i * 3 + 1] * push, P[i * 3 + 2] + N[i * 3 + 2] * push); map.set(i, k); return k; };
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2]; const y = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
      if (y < y0 || y > y1 || !keep(y)) continue; idx.push(vert(a), vert(b), vert(c));
    }
    if (!idx.length) return null;
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx); out.computeVertexNormals(); return out;
  }
  addTreatment(id, inj, p, n) {
    const sc = CFG.injuryScale ?? 1, up = new THREE.Vector3(0, 1, 0);
    if (inj.type === T.PLATE) {
      const t = up.clone().addScaledVector(n, -n.dot(up)).normalize(); if (t.lengthSq() < 0.1) t.set(1, 0, 0);
      const L = 10 * sc, W = 0.65 * sc, steps = 16, pos = [], idx = [];
      const holes = [];
      for (let k = 0; k <= steps; k++) {
        const s = -L / 2 + (L * k) / steps; const sf = this._surface(id, p.clone().addScaledVector(t, s));
        const b = new THREE.Vector3().crossVectors(t, sf.n).normalize(); const c = sf.p.clone().addScaledVector(sf.n, 0.28 * sc);
        pos.push(...c.clone().addScaledVector(b, -W).toArray(), ...c.clone().addScaledVector(b, W).toArray());
        if (k) { const o = (k - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
        if (k % 3 === 1 && k !== 7 && k !== 10) holes.push(sf);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); this._put(g, this.metalMat);
      for (const h of holes) { const a = h.p.clone().addScaledVector(h.n, 0.42 * sc); this._cyl(a, h.p.clone().addScaledVector(h.n, -2.6 * sc), 0.17 * sc, this.metalMat); this._cyl(a, a.clone().addScaledVector(h.n, 0.12 * sc), 0.34 * sc, this.metalMat); }
    } else if (inj.type === T.ROD) {
      const c = this._centre(id); if (c.length < 3) return;
      // smooth the centre line (a gentle quadratic through the shaft) so the rod does not follow the bumps of the joint ends
      const mid = c.slice(3, -3), fit = (k) => { let S = [0, 0, 0, 0, 0], T = [0, 0, 0]; for (const q of mid) { const y = q.y, v = q.getComponent(k); for (let e = 0; e < 5; e++) S[e] += y ** e; for (let e = 0; e < 3; e++) T[e] += v * y ** e; }
        const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]], det = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
        const D = det(M); return [0, 1, 2].map((j) => det(M.map((r, i) => r.map((x, jj) => (jj === j ? T[i] : x)))) / D); };
      const fx = fit(0), fz = fit(2), at = (y) => new THREE.Vector3(fx[0] + fx[1] * y + fx[2] * y * y, y, fz[0] + fz[1] * y + fz[2] * y * y);
      const y0 = c[1].y, y1 = c[c.length - 1].y, line = []; for (let k = 0; k <= 12; k++) line.push(at(y0 + ((y1 - y0) * k) / 12));
      const curve = new THREE.CatmullRomCurve3(line); this._put(new THREE.TubeGeometry(curve, 48, 0.5 * sc, 12, false), this.metalMat);
      for (const q of [line[1], line[line.length - 2]]) this._cyl(q.clone().add(new THREE.Vector3(-3.2 * sc, 0, 0.4)), q.clone().add(new THREE.Vector3(3.2 * sc, 0, -0.4)), 0.22 * sc, this.metalMat);
    } else if (inj.type === T.SCREWS) {
      let d = n.clone().negate(); if (id === 'femur') d.addScaledVector(up, 0.55).normalize(); // hip screws run up the neck
      const a = new THREE.Vector3().crossVectors(d, up); if (a.lengthSq() < 0.05) a.set(1, 0, 0); a.normalize(); const b = new THREE.Vector3().crossVectors(d, a);
      const offs = [[0, 0.55], [-0.5, -0.35], [0.5, -0.35]];
      for (const [u, v] of offs) { const s0 = p.clone().addScaledVector(a, u * sc * 1.4).addScaledVector(b, v * sc * 1.4).addScaledVector(d, (id === 'femur' ? 1.2 : -0.2) * sc);
        this._cyl(s0, s0.clone().addScaledVector(d, (id === 'femur' ? 7.6 : 4) * sc), 0.28 * sc, this.metalMat); this._cyl(s0, s0.clone().addScaledVector(d, -0.15), 0.5 * sc, this.metalMat); }
    } else if (inj.type === T.CAST) {
      const L = 14 * sc; const g = this._skinBand(p.y - L, p.y + L * 0.8, 0.7 * sc); if (g) this._put(g, this.castMat);
    } else if (inj.type === T.BRACE) {
      const L = 12 * sc; const band = (y) => { const r = Math.abs(y - p.y) / L; return (r > 0.3 && r < 0.48) || (r > 0.8); };
      const g = this._skinBand(p.y - L, p.y + L, 0.55 * sc, band); if (g) this._put(g, this.braceMat);
      // hinged side bars
      const skin = this.meshes.skin; if (skin) { const P = skin.geometry.attributes.position.array; let mn = Infinity, mx = -Infinity, z = 0, m = 0;
        for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - p.y) < 1) { mn = Math.min(mn, P[i]); mx = Math.max(mx, P[i]); z += P[i + 2]; m++; }
        if (m) { z /= m; for (const x of [mn - 0.6 * sc, mx + 0.6 * sc]) { this._cyl(new THREE.Vector3(x, p.y - L, z), new THREE.Vector3(x, p.y + L, z), 0.3 * sc, this.braceMat); this._cyl(new THREE.Vector3(x - 0.01, p.y, z - 0.5), new THREE.Vector3(x + 0.01, p.y, z + 0.5), 0.9 * sc, this.metalMat); } } }
    } else if (inj.type === T.REPLACE) {
      // metal surface over the joint end, plus a stem into the bone toward its middle
      const g = this.meshes[id].geometry, P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array, R = 3.4 * sc;
      const pos = [], map = new Map(), idx = [];
      const near = (i) => (P[i * 3] - p.x) ** 2 + (P[i * 3 + 1] - p.y) ** 2 + (P[i * 3 + 2] - p.z) ** 2 < R * R;
      const vert = (i) => { if (map.has(i)) return map.get(i); const k = pos.length / 3; pos.push(P[i * 3] + N[i * 3] * 0.45, P[i * 3 + 1] + N[i * 3 + 1] * 0.45, P[i * 3 + 2] + N[i * 3 + 2] * 0.45); map.set(i, k); return k; };
      for (let t = 0; t < I.length; t += 3) if (near(I[t]) && near(I[t + 1]) && near(I[t + 2])) idx.push(vert(I[t]), vert(I[t + 1]), vert(I[t + 2]));
      if (idx.length) { const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setIndex(idx); cg.computeVertexNormals(); this._put(cg, this.metalMat); }
      if (LONG.has(id)) { const c = this._centre(id); const mid = c[Math.floor(c.length / 2)]; const sgn = p.y > mid.y ? -1 : 1;
        const near0 = c.reduce((a, q) => (Math.abs(q.y - (p.y + sgn * 3 * sc)) < Math.abs(a.y - (p.y + sgn * 3 * sc)) ? q : a));
        const far = c.reduce((a, q) => (Math.abs(q.y - (p.y + sgn * 15 * sc)) < Math.abs(a.y - (p.y + sgn * 15 * sc)) ? q : a));
        this._cyl(id === 'femur' && sgn < 0 ? p.clone().lerp(near0, 0.45) : near0, far, 0.75 * sc, this.metalMat, 0.4 * sc); }
    }
  }
  addGraftScrews(id) {
    const g = this.meshes[id].geometry, U = g.attributes.uv.array; let u0 = Infinity, u1 = -Infinity;
    for (let i = 0; i < U.length; i += 2) { u0 = Math.min(u0, U[i]); u1 = Math.max(u1, U[i]); }
    for (const u of [u0 + 0.05 * (u1 - u0), u1 - 0.05 * (u1 - u0)]) { const r = ringAt(g, u); const t = r.tangent.clone().multiplyScalar(u < (u0 + u1) / 2 ? -1 : 1);
      this._cyl(r.center.clone().addScaledVector(t, 0.3), r.center.clone().addScaledVector(t, 1.4), 0.3, this.metalMat); }
  }

  syncExtras() {
    for (const c of this.extraGroup.children) { const o = this.meshes[c.userData.owner]; if (o) { c.position.copy(o.position); c.visible = o.visible; } }
  }

  addFragments(p, n, dir, seed) {
    const r = rng(seed + 0.17);
    const perp = new THREE.Vector3().crossVectors(n, dir).normalize();
    const count = 9;
    for (let k = 0; k < count; k++) {
      const sc = CFG.injuryScale ?? 1;
      const a = (k / count) * Math.PI * 2 + r() * 0.5, d = (0.15 + r() * 0.6) * sc;
      const c = p.clone().addScaledVector(dir, Math.cos(a) * d).addScaledVector(perp, Math.sin(a) * d).addScaledVector(n, -0.05 + r() * 0.25);
      const size = (0.18 + r() * 0.26) * sc;
      const pts = [];
      for (let j = 0; j < 7; j++) pts.push(new THREE.Vector3((r() - 0.5) * size * 2.2, (r() - 0.5) * size * 1.2, (r() - 0.5) * size * 1.6));
      const g = new ConvexGeometry(pts);
      g.translate(c.x, c.y, c.z);
      const m = new THREE.Mesh(g, this.fragMat);
      m.userData.owner = this._owner;
      this.extraGroup.add(m);
    }
  }

  addFibres(id, inj) {
    const geom = this.meshes[id].geometry; const r = rng(inj.seed + 0.31);
    const sides = inj.type === T.G3 ? [-1, 1] : [0];
    for (const sg of sides) {
      const u = inj.anchor.u + sg * (inj.type === T.G3 ? 0.34 : 0);
      const ring = ringAt(geom, u);
      // follow the same end deformation used in the shader (k = 1 at the torn end)
      const t = ring.tangent;
      let c = ring.center.clone();
      if (inj.type === T.G3) {
        c.addScaledVector(t, sg * 0.35);
        const perp = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0.3, 1, 0.2)).normalize();
        const perp2 = new THREE.Vector3().crossVectors(t, perp);
        const a = 2.6 * sg;
        c.addScaledVector(perp, (1 - Math.cos(a)) * 0.55).addScaledVector(perp2, Math.sin(a) * 0.6 * 0.55);
      }
      const rad = ring.radius * (inj.type === T.G3 ? 0.45 : 0.9);
      const nF = inj.type === T.G3 ? 14 : 10;
      for (let k = 0; k < nF; k++) {
        const ang = r() * Math.PI * 2;
        const off = new THREE.Vector3(Math.cos(ang), Math.sin(ang), (r() - 0.5)).cross(t).normalize().multiplyScalar(rad * (0.3 + r() * 0.7));
        const start = c.clone().add(off);
        const outDir = inj.type === T.G3 ? t.clone().multiplyScalar(-sg) : off.clone().normalize();
        const len = (0.25 + r() * 0.45) * (CFG.injuryScale ?? 1);
        const mid = start.clone().addScaledVector(outDir, len * 0.5).add(new THREE.Vector3((r() - 0.5) * 0.15, (r() - 0.5) * 0.15, (r() - 0.5) * 0.15));
        const end = start.clone().addScaledVector(outDir, len).add(new THREE.Vector3((r() - 0.5) * 0.3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3));
        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const g = new THREE.TubeGeometry(curve, 6, 0.022 + r() * 0.018, 4, false);
        const fm = new THREE.Mesh(g, this.fiberMat); fm.userData.owner = this._owner; this.extraGroup.add(fm);
      }
    }
  }
}
