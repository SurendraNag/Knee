// Places the Visible Human Female pelvis and lower limbs (see vhf.mjs) in the female body and swaps them in for the
// reference body's (BodyParts3D) pelvis, leg and foot bones and leg muscles.
import { Vector3 as THREEVec } from 'three';
import { readVHF, apply, icp, bvhOf, IDT } from './vhf.mjs';

const cap = (s) => s[0].toUpperCase() + s.slice(1);
// VHF bone -> reference body part name(s) (side is 'left' / 'right')
export const BONES = {
  Pelvis: (s) => [`${cap(s)} hip bone`],
  Sacrum: () => ['Sacrum'],
  Femur: (s) => [`${cap(s)} femur`],
  Patella: (s) => [`${cap(s)} patella`],
  Tibia: (s) => [`${cap(s)} tibia`],
  Fibula: (s) => [`${cap(s)} fibula`],
  Talus: (s) => [`${cap(s)} talus`],
  Calcaneous: (s) => [`${cap(s)} calcaneus`],
  Cuboid: (s) => [`${cap(s)} cuboid bone`],
  Navicular: (s) => [`Navicular bone of ${s} foot`],
  MedialCuneiform: (s) => [`${cap(s)} medial cuneiform bone`],
  IntermediateCuneiform: (s) => [`${cap(s)} intermediate cuneiform bone`],
  LateralCuneiform: (s) => [`${cap(s)} lateral cuneiform bone`],
};
export const forefootRe = (s) => new RegExp(`(phalanx of ${s} (big|second|third|fourth|little) toe|^${s} (first|second|third|fourth|fifth) metatarsal bone|sesamoid bone of ${s} foot)`, 'i');

const concat = (list) => {
  let n = 0, m = 0; for (const p of list) { n += p.positions.length; m += p.indices.length; }
  const P = new Float32Array(n), I = new Uint32Array(m); let o = 0, q = 0;
  for (const p of list) { P.set(p.positions, o); for (let i = 0; i < p.indices.length; i++) I[q + i] = p.indices[i] + o / 3; o += p.positions.length; q += p.indices.length; }
  return { positions: P, indices: I };
};
const bbox = (P) => { const mn = [9, 9, 9], mx = [-9, -9, -9]; for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i + a]); mx[a] = Math.max(mx[a], P[i + a]); } return [mn, mx]; };

// ---------------------------------------------------------------------------------------------------------------
const words = (n) => n.replace(/Head$/, '').replace(/Illiacus/, 'Iliacus').replace(/Quadratis/, 'Quadratus').replace(/Semitendonosus/, 'Semitendinosus')
  .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
// VHF muscle -> reference body part name
export function muscleRef(name, s) {
  const w = words(name), S = cap(s);
  const special = {
    'biceps femoris long': `Long head of ${s} biceps femoris`, 'biceps femoris short': `Short head of ${s} biceps femoris`,
    'gastrocnemius lateral': `Lateral head of ${s} gastrocnemius`, 'gastrocnemius medial': `Medial head of ${s} gastrocnemius`,
    'inferior gemellus': `${S} gemellus inferior`, 'superior gemellus': `${S} gemellus superior`, 'peroneus longus': `${S} fibularis longus`,
  };
  return special[w] || `${S} ${w}`;
}
const CART = { // VHF cartilage -> [bone it moves with, name]
  FemurHead: ['Femur', (s) => `Articular cartilage of ${s} femoral head`],
  FemurDistal: ['Femur', (s) => `Articular cartilage of ${s} femoral condyles`],
  Patella: ['Patella', (s) => `Articular cartilage of ${s} patella`],
  TibiaMedial: ['Tibia', (s) => `Articular cartilage of ${s} medial tibial plateau`],
  TibiaLateral: ['Tibia', (s) => `Articular cartilage of ${s} lateral tibial plateau`],
  TibiaDistal: ['Tibia', (s) => `Articular cartilage of ${s} tibia at the ankle`],
  Talus: ['Talus', (s) => `Articular cartilage of ${s} talus`],
  PelvisAcetabulum: ['Pelvis', (s) => `Articular cartilage of ${s} acetabulum (hip socket)`],
};
const LIG = { ACL: 'anterior cruciate ligament', PCL: 'posterior cruciate ligament', MCL: 'medial collateral ligament', LCL: 'lateral collateral ligament' };
const LONG_TENDON = /tibialis|fibularis longus|(extensor|flexor) (digitorum|hallucis) longus|plantaris|gracilis|sartorius|semitendinosus/i;
const FOOT = ['Talus', 'Calcaneous', 'Cuboid', 'Navicular', 'MedialCuneiform', 'IntermediateCuneiform', 'LateralCuneiform', 'Phalanges'];

export function placeVHF(parts, file, log) {
  const V = readVHF(file);
  const sideOf = (v) => (v.side === 'Left' ? 'left' : 'right');
  const find = (n) => parts.find((p) => p.name === n);
  const get = (side, kind, name) => V.find((v) => v.side === side && v.kind === kind && v.name === name);
  const refOf = (v) => (v.name === 'Phalanges' ? parts.filter((p) => forefootRe(sideOf(v)).test(p.name)) : BONES[v.name] ? BONES[v.name](sideOf(v)).map(find).filter(Boolean) : []);
  const bones = V.filter((v) => v.kind === 'Bone' && v.name !== 'Coccyx');
  // 1. global fit of all bones
  const A = concat(bones), B = concat(bones.flatMap(refOf));
  const [amn, amx] = bbox(A.positions), [bmn, bmx] = bbox(B.positions);
  const s0 = (bmx[1] - bmn[1]) / (amx[1] - amn[1]);
  const g = icp(A.positions, bvhOf(B.positions, B.indices), { s: s0, R: IDT.R, t: [0, 1, 2].map((a) => (bmn[a] + bmx[a]) / 2 - s0 * (amn[a] + amx[a]) / 2) }, { iters: 40, sub: 3 }).T;
  log('vhf: global scale', g.s.toFixed(3));
  const fit = (vs, T0, opt = {}) => {
    const X = concat(vs), Y = concat(vs.flatMap(refOf));
    const r = icp(X.positions, bvhOf(Y.positions, Y.indices), T0, { iters: 60, Y: Y.positions, bvhOfX: bvhOf(X.positions, X.indices), sub: 2, ...opt });
    log('vhf: fit', vs.map((v) => v.side[0] + ':' + v.name).join(' '), 'rms', (r.rms * 1000).toFixed(1), 'mm, scale', r.T.s.toFixed(3));
    return r.T;
  };
  // 2. segments. The pelvis (both hip bones and the sacrum, as one piece) is fitted with one scale c. Each thigh and
  // shin bone is then placed by its joint centres (hip, knee, ankle): the centres land where the reference skeleton has
  // them, the bone is stretched along its length to fit and keeps scale c across, so the joints stay congruent. The
  // foot keeps scale c and turns about the ankle. The patella moves with the femur.
  const seg = [];
  const pel = [get('Left', 'Bone', 'Pelvis'), get('Right', 'Bone', 'Pelvis'), get('Left', 'Bone', 'Sacrum')];
  const Tp = fit(pel, g, { range: [g.s * 0.85, g.s * 1.15] });
  const c = Tp.s;
  seg.push({ id: 'pelvis', M: affOfSim(Tp), bones: [...pel, get('Left', 'Bone', 'Coccyx')] });
  for (const side of ['Left', 'Right']) {
    const b = (n) => get(side, 'Bone', n), cart = (n) => get(side, 'Cartilage', n);
    const Tleg = fit([b('Femur'), b('Tibia'), b('Fibula')], g, { range: [g.s * 0.85, g.s * 1.2] });
    const Tf = fit([b('Femur')], Tleg, { range: [Tleg.s * 0.9, Tleg.s * 1.1] });
    const Tt = fit([b('Tibia'), b('Fibula')], Tleg, { range: [Tleg.s * 0.9, Tleg.s * 1.1] });
    const Tft = fit(FOOT.map(b), g, { fixScale: c });
    const Hv = sphereCentre(cart('FemurHead').positions);
    const Kv = centroid([cart('TibiaMedial').positions, cart('TibiaLateral').positions]);
    const Av = centroid([cart('TibiaDistal').positions, cart('Talus').positions]);
    const Hb = apply(Tp, Hv), Kb = apply(Tt, Kv), Ab = apply(Tft, Av); // the shin fit follows the (longer) reference tibia from the top, so the ankle comes from the foot fit
    const mm = (p, q) => (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 1000).toFixed(1);
    log(`vhf: ${side} joint centres: hip (femur fit vs pelvis fit) ${mm(apply(Tf, Hv), Hb)} mm apart, knee (femur vs tibia) ${mm(apply(Tf, Kv), Kb)} mm, ankle (tibia vs foot) ${mm(apply(Tt, Av), apply(Tft, Av))} mm`);
    const Mf = longBone(Hv, Kv, Hb, Kb, Tf.R, c);
    // Shin twist and ankle angle: the foot hinges on the ankle axis (through the tips of the malleoli) so the talus
    // stays in its socket; the twist of the shin about its own axis and the hinge angle are chosen together so that
    // the shin bones and the foot bones best match the reference skeleton's.
    const low = (P) => { let k = 1; for (let i = 4; i < P.length; i += 3) if (P[i] < P[k]) k = i; return [P[k - 1], P[k], P[k + 1]]; };
    const medM = low(b('Tibia').positions), latM = low(b('Fibula').positions);
    const axis = unit(sub3(latM, medM)), pivot = medM.map((x, a) => (x + latM[a]) / 2);
    const Mt0 = longBone(Kv, Av, Kb, Ab, Tt.R, c), wb = unit(sub3(Ab, Kb));
    const sample = (vs, n) => { const X = concat(vs).positions, step = Math.max(1, Math.floor(X.length / 3 / n)); const out = []; for (let i = 0; i < X.length / 3; i += step) out.push(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]); return Float32Array.from(out); };
    const shinX = sample([b('Tibia'), b('Fibula')], 1500), footX = sample(FOOT.filter((n) => n !== 'Phalanges').map(b), 1500);
    const shinRef = concat([b('Tibia'), b('Fibula')].flatMap(refOf)), footRef = concat(FOOT.filter((n) => n !== 'Phalanges').map(b).flatMap(refOf));
    const shinB = bvhOf(shinRef.positions, shinRef.indices), footB = bvhOf(footRef.positions, footRef.indices);
    const meanDist = (bv, X) => { let sd = 0; for (let i = 0; i < X.length; i += 3) sd += bv.closestPointToPoint(new THREEVec(X[i], X[i + 1], X[i + 2]), {}).distance; return sd / (X.length / 3); };
    const shinM = (phi) => { const Rz = axisAngle(wb, phi); return { A: mul33(Rz, Mt0.A), t: add3(mv(Rz, sub3(Mt0.t, Kb)), Kb), R: mul33(Rz, Mt0.R) }; };
    const footM = (Ms, th) => { const A = mul33(Ms.R, axisAngle(axis, th)).map((x) => x * c), pb = applyAff(Ms, Float32Array.from(pivot)); return { A, t: sub3([...pb], mv(A, pivot)) }; };
    const cost = (phi, th) => { const Ms = shinM(phi), Mfo = footM(Ms, th); return { shin: meanDist(shinB, applyAff(Ms, shinX)), foot: meanDist(footB, applyAff(Mfo, footX)) }; };
    let best = null;
    for (let phi = -24; phi <= 24; phi += 4) for (let th = -70; th <= 70; th += 5) { const r = cost(phi * Math.PI / 180, th * Math.PI / 180); const v = r.shin + r.foot; if (!best || v < best.v) best = { phi, th, v, r }; }
    for (const [dp, dt] of [[2, 2.5], [1, 1], [0.5, 0.5]]) { const b0 = best; for (const p2 of [-dp, 0, dp]) for (const t2 of [-dt, 0, dt]) { const r = cost((b0.phi + p2) * Math.PI / 180, (b0.th + t2) * Math.PI / 180); const v = r.shin + r.foot; if (v < best.v) best = { phi: b0.phi + p2, th: b0.th + t2, v, r }; } }
    log(`vhf: ${side} shin twist ${best.phi} deg, ankle ${best.th} deg from the scan's; mean distance to the reference shin ${(best.r.shin * 1000).toFixed(1)} mm, foot ${(best.r.foot * 1000).toFixed(1)} mm (free foot fit: ${(meanDist(footB, apply(Tft, footX)) * 1000).toFixed(1)} mm)`);
    const Mt = shinM(best.phi * Math.PI / 180), Mft = footM(Mt, best.th * Math.PI / 180);
    log(`vhf: ${side} femur length x${(norm3(sub3(Kb, Hb)) / norm3(sub3(Kv, Hv))).toFixed(3)}, tibia x${(norm3(sub3(Ab, Kb)) / norm3(sub3(Av, Kv))).toFixed(3)}, across x${c.toFixed(3)}`);
    seg.push({ id: side + 'femur', M: Mf, bones: [b('Femur'), b('Patella')] },
      { id: side + 'tibia', M: Mt, bones: [b('Tibia'), b('Fibula')] }, { id: side + 'foot', M: Mft, bones: FOOT.map(b) });
  }
  const segOfBone = (v) => seg.find((s) => s.bones.includes(v));
  for (const s of seg) { const c = concat(s.bones); s.bvh = bvhOf(c.positions, c.indices); }
  // 3. soft parts: blend the segment transforms by closeness to each segment's bones (scan space)
  const blend = (P) => {
    const out = new Float32Array(P.length), tmp = new Float32Array(3);
    for (let i = 0; i < P.length; i += 3) {
      let W = 0; const acc = [0, 0, 0];
      const p3 = new THREEVec(P[i], P[i + 1], P[i + 2]);
      const ds = seg.map((s) => s.bvh.closestPointToPoint(p3, {}).distance);
      const dmin = Math.min(...ds);
      seg.forEach((s, k) => {
        const w = 1 / (ds[k] - dmin + 0.004) ** 4;
        applyAff(s.M, P.subarray(i, i + 3), tmp);
        acc[0] += w * tmp[0]; acc[1] += w * tmp[1]; acc[2] += w * tmp[2]; W += w;
      });
      out[i] = acc[0] / W; out[i + 1] = acc[1] / W; out[i + 2] = acc[2] / W;
    }
    return out;
  };
  // 4. build the new parts
  const stats = { replaced: 0, added: 0 }; let tendons = 0;
  const replace = (name, P, I) => { const p = find(name); if (!p) { log('vhf: no reference part', name); return false; }
    p.positions = P; p.indices = I; p.vhf = true; stats.replaced++; return true; };
  const addPart = (id, name, system, P, I) => { parts.push({ id, name, system, positions: P, indices: I, vhf: true }); stats.added++; };
  for (const v of V) {
    const side = sideOf(v), S = v.side[0];
    if (v.kind === 'Bone') {
      const P = applyAff(segOfBone(v).M, v.positions);
      if (v.name === 'Coccyx') addPart('VHF_COCCYX', 'Coccyx', 'skeletal', P, v.indices);
      else if (v.name === 'Phalanges') continue; // used for the fit only (see below)
      else replace(BONES[v.name](side)[0], P, v.indices);
    } else if (v.kind === 'Cartilage' && v.name === 'Talus') {
      continue; // a small patch, where the talus touched the tibia in the scan's pointed-foot position; it does not cover the dome
    } else if (v.kind === 'Cartilage') {
      const [bn, nm] = CART[v.name];
      const bone = get(v.side, 'Bone', bn);
      addPart(`VHF_CART_${S}_${v.name}`, nm(side), 'skeletal', applyAff(segOfBone(bone).M, v.positions), v.indices);
    } else if (v.kind === 'Ligament') {
      addPart(`VHF_LIG_${S}_${v.name}`, `${cap(side)} ${LIG[v.name]} of the knee`, 'connective', blend(v.positions), v.indices);
    } else if (v.kind === 'Muscle') {
      // The dataset's muscles are the fleshy bellies; the reference body's run on into their tendons. For the muscles
      // whose long, thin tendons cross the ankle or reach the inner knee (pes anserinus), the reference tendon below
      // the belly (from 10 mm inside it) is kept.
      const name = muscleRef(v.name, side), ref = find(name), P = blend(v.positions);
      if (!ref) { log('vhf: no reference part', name); continue; }
      const [a0] = bbox(ref.positions), [b0] = bbox(P), keep = [];
      if (LONG_TENDON.test(name) && b0[1] - a0[1] > 0.015) keep.push((y) => y < b0[1] + 0.01);
      const ends = endsOf(ref, keep);
      if (ends) { const m = concat([{ positions: P, indices: v.indices }, ends]); replace(name, m.positions, m.indices); tendons++; } else replace(name, P, v.indices);
    }
  }
  // the adductor magnus model includes the adductor minimus (its upper part)
  for (const n of ['Left adductor minimus', 'Right adductor minimus']) { const k = parts.findIndex((p) => p.name === n); if (k >= 0) parts.splice(k, 1); }
  log('vhf: replaced', stats.replaced, 'reference parts, added', stats.added, ',', tendons, 'muscles keep the reference tendons at their ends');
  return seg;
}

// --- affine helpers: x' = A x + t (A row-major 3x3) ---
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], norm3 = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = norm3(a); return a.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mul33 = (A, B) => { const R = new Array(9).fill(0); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) R[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c]; return R; };
const mv = (A, v) => [0, 1, 2].map((r) => A[r * 3] * v[0] + A[r * 3 + 1] * v[1] + A[r * 3 + 2] * v[2]);
function affOfSim(T) { return { A: T.R.map((x) => x * T.s), t: T.t.slice() }; }
function applyAff(M, P, out = new Float32Array(P.length)) {
  const { A, t } = M;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    out[i] = A[0] * x + A[1] * y + A[2] * z + t[0]; out[i + 1] = A[3] * x + A[4] * y + A[5] * z + t[1]; out[i + 2] = A[6] * x + A[7] * y + A[8] * z + t[2];
  }
  return out;
}
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
// rotation by angle th about unit axis k
function axisAngle(k, th) {
  const c = Math.cos(th), s = Math.sin(th), C = 1 - c, [x, y, z] = k;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}
// rotation taking unit a onto unit b (Rodrigues)
function rotBetween(a, b) {
  const v = cross(a, b), cth = a[0] * b[0] + a[1] * b[1] + a[2] * b[2], k = 1 / (1 + cth);
  return [cth + v[0] * v[0] * k, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1], v[1] * v[0] * k + v[2], cth + v[1] * v[1] * k, v[1] * v[2] * k - v[0], v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], cth + v[2] * v[2] * k];
}
// long bone from proximal/distal joint centres: P0->P1 (scan) onto Q0->Q1 (body), twist from R0, scale c across
function longBone(P0, P1, Q0, Q1, R0, c) {
  const u = unit(sub3(P1, P0)), w = unit(sub3(Q1, Q0)), lam = norm3(sub3(Q1, Q0)) / norm3(sub3(P1, P0));
  const R = mul33(rotBetween(unit(mv(R0, u)), w), R0);
  const S = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => (k % 4 === 0 ? c : 0) + (lam - c) * u[Math.floor(k / 3)] * u[k % 3]);
  const A = mul33(R, S), AP = mv(A, P0);
  return { A, R, t: [Q0[0] - AP[0], Q0[1] - AP[1], Q0[2] - AP[2]] };
}
function centroid(list) { const c = [0, 0, 0]; let n = 0; for (const P of list) for (let i = 0; i < P.length; i += 3) { c[0] += P[i]; c[1] += P[i + 1]; c[2] += P[i + 2]; n++; } return c.map((x) => x / n); }
// least-squares sphere through points: |x|^2 = 2 c.x + k
function sphereCentre(P) {
  const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], r = [0, 0, 0, 0];
  for (let i = 0; i < P.length; i += 3) {
    const row = [2 * P[i], 2 * P[i + 1], 2 * P[i + 2], 1], y = P[i] ** 2 + P[i + 1] ** 2 + P[i + 2] ** 2;
    for (let a = 0; a < 4; a++) { r[a] += row[a] * y; for (let b2 = 0; b2 < 4; b2++) M[a][b2] += row[a] * row[b2]; }
  }
  for (let col = 0; col < 4; col++) { // Gauss-Jordan
    let piv = col; for (let k = col + 1; k < 4; k++) if (Math.abs(M[k][col]) > Math.abs(M[piv][col])) piv = k;
    [M[col], M[piv]] = [M[piv], M[col]]; [r[col], r[piv]] = [r[piv], r[col]];
    for (let k = 0; k < 4; k++) if (k !== col) { const f = M[k][col] / M[col][col]; for (let b2 = 0; b2 < 4; b2++) M[k][b2] -= f * M[col][b2]; r[k] -= f * r[col]; }
  }
  return [r[0] / M[0][0], r[1] / M[1][1], r[2] / M[2][2]];
}

// triangles of part p whose three corners pass one of the height tests -> {positions, indices} or null
function endsOf(p, tests) {
  if (!tests.length) return null;
  const P = p.positions, I = p.indices, map = new Map(), Pn = [], In = [];
  for (let t = 0; t < I.length; t += 3) {
    const ok = tests.some((f) => f(P[I[t] * 3 + 1]) && f(P[I[t + 1] * 3 + 1]) && f(P[I[t + 2] * 3 + 1]));
    if (!ok) continue;
    for (let k = 0; k < 3; k++) { const v = I[t + k]; if (!map.has(v)) { map.set(v, map.size); Pn.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } In.push(map.get(v)); }
  }
  return In.length ? { positions: Float32Array.from(Pn), indices: Uint32Array.from(In) } : null;
}

// The dataset's forefoot (metatarsals, toe bones and sesamoids) is a single fused model, so the reference body's
// separate forefoot bones are kept; the fused model is used only to fit the foot.

// checks after placing: joint gaps (cartilage to cartilage) and muscle poking through the skin
export function checkVHF(parts, log) {
  const find = (n) => parts.find((p) => p.name === n);
  const gap = (a, b) => { // min distance from a's vertices to b's surface, and share of a's vertices inside 0.5 mm
    const A = find(a), B = find(b); if (!A || !B) return 'missing';
    const bv = bvhOf(B.positions, B.indices); let mn = 9, close = 0;
    for (let i = 0; i < A.positions.length; i += 3) { const d = bv.closestPointToPoint(new THREEVec(A.positions[i], A.positions[i + 1], A.positions[i + 2]), {}).distance; mn = Math.min(mn, d); if (d < 0.0005) close++; }
    return `min ${(mn * 1000).toFixed(1)} mm, ${(100 * close / (A.positions.length / 3)).toFixed(0)}% touching`;
  };
  for (const s of ['left', 'right']) {
    log(`vhf check ${s} knee medial:`, gap(`Articular cartilage of ${s} femoral condyles`, `Articular cartilage of ${s} medial tibial plateau`));
    log(`vhf check ${s} knee lateral:`, gap(`Articular cartilage of ${s} femoral condyles`, `Articular cartilage of ${s} lateral tibial plateau`));
    log(`vhf check ${s} hip:`, gap(`Articular cartilage of ${s} femoral head`, `Articular cartilage of ${s} acetabulum (hip socket)`));
    log(`vhf check ${s} patella:`, gap(`Articular cartilage of ${s} patella`, `Articular cartilage of ${s} femoral condyles`));
  }
  const skin = parts.filter((p) => p.system === 'integumentary');
  const sk = concat(skin), bv = bvhOf(sk.positions, sk.indices), P = sk.positions, I = sk.indices;
  const outside = [];
  for (const p of parts) {
    if (!p.vhf || p.system === 'integumentary') continue;
    let out = 0, worst = 0;
    for (let i = 0; i < p.positions.length; i += 3) {
      const v = new THREEVec(p.positions[i], p.positions[i + 1], p.positions[i + 2]);
      const h = bv.closestPointToPoint(v, {}); const f = h.faceIndex * 3;
      const a = I[f] * 3, b = I[f + 1] * 3, c = I[f + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const sgn = (v.x - h.point.x) * nx + (v.y - h.point.y) * ny + (v.z - h.point.z) * nz;
      if (sgn < 0) { out++; worst = Math.max(worst, h.distance); } // the skin faces wind inward
    }
    if (out) outside.push([p.name, out, p.positions.length / 3, worst]);
  }
  outside.sort((a, b) => b[3] - a[3]);
  log('vhf check: parts poking through the skin', outside.length, outside.slice(0, 40).map(([n, o, t, w]) => `${n} ${o}/${t} up to ${(w * 1000).toFixed(0)} mm`).join('; '));
  return outside;
}
