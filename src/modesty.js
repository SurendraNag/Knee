// Private parts: the external genitals are blurred on screen, in saved images and in shared links,
// unless a clinician turns "Show private parts" on. The blur is drawn into the WebGL picture itself
// (after the scene, before the frame is shown), so anything taken from the canvas is blurred too.
import * as THREE from 'three';

const VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
// Step 1: shrink the picture D times (each small pixel = average of a D x D block), cheap and already soft.
const DOWN = `
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uD;
void main() {
  vec2 base = (floor(gl_FragCoord.xy) * uD);
  vec4 acc = vec4(0.0);
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) acc += texture2D(uTex, (base + (vec2(float(i), float(j)) + 0.5) * uD / 4.0) / uRes);
  gl_FragColor = acc / 16.0;
}`;
// Step 2: inside an ellipse (drawing-buffer pixels) every pixel becomes a wide average of the small picture
// (golden-angle disk of 40 taps, turned per pixel so it reads as soft grain, not a pattern), feathered at the edge.
const FRAG = `
precision highp float;
uniform sampler2D uTex; uniform sampler2D uSmall; uniform vec2 uSmallPx; uniform vec2 uRes; uniform vec2 uC; uniform vec2 uR; uniform float uBlur;
void main() {
  vec2 p = gl_FragCoord.xy;
  float d = length((p - uC) / uR);
  if (d > 1.0) discard;
  vec4 orig = texture2D(uTex, p / uRes);
  float rot = fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
  vec4 acc = vec4(0.0); float wsum = 0.0;
  for (int i = 0; i < 40; i++) {
    float fi = float(i) + 0.5, r = sqrt(fi / 40.0) * uBlur, a = fi * 2.39996 + rot;
    vec2 s = clamp(p + vec2(cos(a), sin(a)) * r, vec2(0.5), uRes - 0.5);
    float w = 1.0 - 0.5 * (r / uBlur);
    acc += texture2D(uSmall, s / uSmallPx) * w; wsum += w;
  }
  vec4 blur = acc / wsum;
  float m = 1.0 - smoothstep(0.8, 1.0, d);
  gl_FragColor = mix(orig, blur, m);
}`;

// The regions, per model (centre and half-size of a box around the genitals, in that model's units)
export const REGIONS = {
  bodyMale: { c: [0, 0.825, 0.06], r: [0.08, 0.105, 0.095] },
  bodyFemale: { c: [0, 0.83, 0.03], r: [0.058, 0.075, 0.07] },
  leg: { c: [5.4, 36.8, 8], r: [2.2, 7.4, 5.6] },
  spine: { c: [0, -15.5, 13.2], r: [5, 4.6, 4.8] },
};

const SAMPLES = [[0, 0, 0], [0, 0, 0.7], [0, -0.6, 0.5], [0, 0.6, 0.5], [0.6, 0, 0.4], [-0.6, 0, 0.4], [0, -0.7, 0]];

/**
 * renderer: the page's WebGLRenderer. region: { c, r }.
 * active(): is anything that shows the genitals on screen right now (skin, genital organs)?
 * occluders(): optional, the opaque meshes that can hide the region (for example the thigh or the buttock).
 */
export function createModesty(renderer, { region, active = () => true, occluders = null, shown = false }) {
  const st = { shown, region, lastCheck: -1e9, visible: true, enabled: !!region };
  const quadScene = new THREE.Scene(), quadCam = new THREE.Camera();
  const res = new THREE.Vector2(), D = 6;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    uniforms: { uTex: { value: null }, uSmall: { value: null }, uSmallPx: { value: new THREE.Vector2() }, uRes: { value: res }, uC: { value: new THREE.Vector2() }, uR: { value: new THREE.Vector2() }, uBlur: { value: 10 } },
  });
  const downMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: DOWN, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    uniforms: { uTex: { value: null }, uRes: { value: res }, uD: { value: D } },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; quadScene.add(quad);
  let tex = null, small = null;
  const size = new THREE.Vector2(), v = new THREE.Vector3(), box = new THREE.Box3(), ray = new THREE.Raycaster(), dir = new THREE.Vector3();

  // Is any part of the region in direct view (not behind the thigh, the buttock or a bone)?
  function inView(camera) {
    if (!occluders) return true;
    const now = performance.now();
    if (now - st.lastCheck < 150) return st.visible;
    st.lastCheck = now;
    const list = occluders(); if (!list.length) return (st.visible = true);
    const { c, r } = st.region, big = new THREE.Box3(new THREE.Vector3(c[0] - r[0] * 1.15, c[1] - r[1] * 1.15, c[2] - r[2] * 1.15), new THREE.Vector3(c[0] + r[0] * 1.15, c[1] + r[1] * 1.15, c[2] + r[2] * 1.15));
    const eye = camera.getWorldPosition(new THREE.Vector3());
    if (big.containsPoint(eye)) return (st.visible = true);
    ray.firstHitOnly = true;
    for (const s of SAMPLES) {
      v.set(c[0] + s[0] * r[0], c[1] + s[1] * r[1], c[2] + s[2] * r[2]);
      dir.subVectors(v, eye); const dist = dir.length(); dir.divideScalar(dist);
      ray.set(eye, dir); ray.far = dist + 1e-3;
      const hits = ray.intersectObjects(list, false);
      if (!hits.length || big.containsPoint(hits[0].point)) return (st.visible = true);
    }
    return (st.visible = false);
  }

  // Where the region falls on screen: an ellipse around its projected box, in drawing-buffer pixels.
  function screenEllipse(camera, W, H) {
    const { c, r } = st.region;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    camera.updateMatrixWorld();
    for (let i = 0; i < 8; i++) {
      v.set(c[0] + (i & 1 ? r[0] : -r[0]), c[1] + (i & 2 ? r[1] : -r[1]), c[2] + (i & 4 ? r[2] : -r[2]));
      v.applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -camera.near) return { cx: W / 2, cy: H / 2, rx: W * 2, ry: H * 2 }; // too close: blur everything
      v.applyMatrix4(camera.projectionMatrix);
      const x = (v.x * 0.5 + 0.5) * W, y = (v.y * 0.5 + 0.5) * H;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) return null;
    // the ellipse inside the box's outline, grown so it covers the corners of the shape too
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: ((x1 - x0) / 2) * 1.15, ry: ((y1 - y0) / 2) * 1.15 };
  }

  // Blur the region of what is already drawn on the canvas.
  function blurNow(camera) {
    if (!st.enabled || st.shown || !st.region || !active() || !inView(camera)) return false;
    renderer.getDrawingBufferSize(size);
    const W = Math.floor(size.x), H = Math.floor(size.y);
    const e = screenEllipse(camera, W, H); if (!e) return false;
    if (!tex || tex.image.width !== W || tex.image.height !== H) {
      tex?.dispose(); tex = new THREE.FramebufferTexture(W, H); tex.minFilter = tex.magFilter = THREE.LinearFilter;
      small?.dispose(); small = new THREE.WebGLRenderTarget(Math.ceil(W / D), Math.ceil(H / D), { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    }
    renderer.setRenderTarget(null);
    renderer.copyFramebufferToTexture(tex, null);
    res.set(W, H);
    const ac = renderer.autoClear; renderer.autoClear = false;
    downMat.uniforms.uTex.value = tex; quad.material = downMat;
    renderer.setRenderTarget(small); renderer.render(quadScene, quadCam); renderer.setRenderTarget(null);
    const u = mat.uniforms;
    u.uTex.value = tex; u.uSmall.value = small.texture; u.uSmallPx.value.set(small.width * D, small.height * D); u.uC.value.set(e.cx, e.cy);
    u.uR.value.set(Math.max(e.rx, 4), Math.max(e.ry, 4));
    u.uBlur.value = Math.max(6, Math.min(e.rx, e.ry) * 0.42);
    quad.material = mat; renderer.render(quadScene, quadCam);
    renderer.autoClear = ac;
    return true;
  }

  return {
    get shown() { return st.shown; },
    set shown(on) { st.shown = !!on; },
    setRegion(r) { st.region = r; st.enabled = !!r; st.lastCheck = -1e9; },
    get enabled() { return st.enabled; },
    /** draw the scene, then blur the private region */
    render(scene, camera) { renderer.render(scene, camera); blurNow(camera); },
    blurNow,
  };
}

/** A clinician's switch: "Private parts: blurred" / "shown". Returns the button. */
export function modestyButton(m, { onChange } = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'private-parts'; b.className = 'toggle private-toggle';
  b.title = 'For clinicians: the genitals are blurred unless you show them. Patient links and saved images follow this setting only if you choose so when sharing.';
  const paint = () => { b.setAttribute('aria-pressed', String(m.shown)); b.textContent = m.shown ? 'Private parts: shown' : 'Private parts: blurred'; };
  b.addEventListener('click', () => {
    if (!m.shown && !b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Show private parts? Tap again'; setTimeout(() => { delete b.dataset.sure; paint(); }, 4000); return; }
    delete b.dataset.sure; m.shown = !m.shown; paint(); onChange?.(m.shown);
  });
  paint();
  b.repaint = paint;
  return b;
}
