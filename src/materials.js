import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
varying vec3 vObj;
uniform vec3 uNScale;
uniform float uBump;
uniform float uColorVar;
uniform float uPores;
float kh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float kn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kh(i), kh(i + vec3(1,0,0)), f.x), mix(kh(i + vec3(0,1,0)), kh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(kh(i + vec3(0,0,1)), kh(i + vec3(1,0,1)), f.x), mix(kh(i + vec3(0,1,1)), kh(i + vec3(1,1,1)), f.x), f.y), f.z); }
float kfbm(vec3 p){ return 0.55 * kn(p) + 0.3 * kn(p * 2.03 + 7.1) + 0.15 * kn(p * 4.1 + 3.7); }
float kheight(vec3 p){
  vec3 q = p * uNScale;
  float h = kfbm(q);
  // small pits: porous look
  float pit = kn(q * 3.3 + 11.0);
  h -= uPores * smoothstep(0.62, 0.9, pit);
  return h;
}
vec3 kperturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir){
  vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos));
  vec3 R1 = cross(vSigmaY, surf_norm); vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`;

// Adds a procedural object-space bump + colour variation to a standard/physical material.
export function addSurfaceNoise(mat, { scale = [6, 6, 6], bump = 0.02, colorVar = 0.08, pores = 0 } = {}) {
  const uniforms = {
    uNScale: { value: new THREE.Vector3(...scale) }, uBump: { value: bump }, uColorVar: { value: colorVar }, uPores: { value: pores },
  };
  mat.userData.noise = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat kH = kheight(vObj);\ndiffuseColor.rgb *= mix(1.0 - uColorVar, 1.0 + uColorVar * 0.4, kH);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = kperturb(-vViewPosition, normal, vec2(dFdx(kH), dFdy(kH)) * uBump * 40.0, faceDirection);');
  };
  mat.customProgramCacheKey = () => 'knoise';
  return mat;
}

function fiberTexture({ base = [232, 224, 208], contrast = 38, crimp = 0.0 } = {}) {
  const w = 512, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  // row brightness: fibres run along x (u = length)
  const rows = new Float32Array(h);
  let v = 0;
  for (let y = 0; y < h; y++) { v = v * 0.55 + (Math.random() - 0.5); rows[y] = v; }
  // make it tile vertically
  for (let y = 0; y < 8; y++) { const t = y / 8; rows[h - 8 + y] = rows[h - 8 + y] * (1 - t) + rows[y] * t; }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wave = crimp ? Math.sin((x / w) * Math.PI * 2 * 24 + y * 0.35) * crimp : 0;
      const yy = (y + Math.round(wave * 2) + h) % h;
      const b = rows[yy] * contrast + (Math.random() - 0.5) * 6;
      const i = (y * w + x) * 4;
      img.data[i] = base[0] + b; img.data[i + 1] = base[1] + b; img.data[i + 2] = base[2] + b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeMaterials() {
  const ligTex = fiberTexture({ base: [226, 218, 202], contrast: 34, crimp: 0.6 });
  const tenTex = fiberTexture({ base: [236, 232, 222], contrast: 26, crimp: 0.3 });
  const ligBump = ligTex.clone(); ligBump.colorSpace = THREE.NoColorSpace; ligBump.needsUpdate = true;
  const tenBump = tenTex.clone(); tenBump.colorSpace = THREE.NoColorSpace; tenBump.needsUpdate = true;
  for (const t of [ligTex, ligBump]) t.repeat.set(0.35, 1);
  for (const t of [tenTex, tenBump]) t.repeat.set(0.25, 1.5);

  const common = { vertexColors: true, alphaHash: true };
  return {
    bone: () => addSurfaceNoise(new THREE.MeshPhysicalMaterial({
      ...common, color: 0xdcd0b8, roughness: 0.88, metalness: 0, sheen: 0.25, sheenRoughness: 0.8, sheenColor: 0xfff4e0,
    }), { scale: [7, 7, 7], bump: 0.022, colorVar: 0.1, pores: 0.35 }),
    cartilage: () => addSurfaceNoise(new THREE.MeshPhysicalMaterial({
      ...common, color: 0xe2e2d8, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25, sheen: 0.25, sheenColor: 0xdbe9ff,
    }), { scale: [3, 3, 3], bump: 0.006, colorVar: 0.05 }),
    ligament: () => new THREE.MeshPhysicalMaterial({
      ...common, color: 0xffffff, map: ligTex, bumpMap: ligBump, bumpScale: 2.2, roughness: 0.48, sheen: 0.7, sheenRoughness: 0.4, sheenColor: 0xffffff,
    }),
    tendon: () => new THREE.MeshPhysicalMaterial({
      ...common, color: 0xffffff, map: tenTex, bumpMap: tenBump, bumpScale: 1.6, roughness: 0.38, sheen: 0.9, sheenRoughness: 0.35, sheenColor: 0xf2f6ff,
    }),
    meniscus: () => addSurfaceNoise(new THREE.MeshPhysicalMaterial({
      ...common, color: 0xebe0c8, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.5, sheenColor: 0xfff8ec,
    }), { scale: [4, 4, 4], bump: 0.008, colorVar: 0.06 }),
    muscle: () => addSurfaceNoise(new THREE.MeshPhysicalMaterial({
      ...common, color: 0x9a3b31, roughness: 0.55, sheen: 0.6, sheenColor: 0xff9a8a, clearcoat: 0.2, clearcoatRoughness: 0.5,
    }), { scale: [9, 0.6, 9], bump: 0.03, colorVar: 0.18 }),
    skin: () => addSurfaceNoise(new THREE.MeshPhysicalMaterial({
      ...common, color: 0xd6a48a, roughness: 0.6, sheen: 0.5, sheenColor: 0xffd9c4,
    }), { scale: [14, 14, 14], bump: 0.006, colorVar: 0.05 }),
  };
}
