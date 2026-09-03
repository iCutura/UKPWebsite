/**
 * Three.js layer for the hero: drifting golden dust with mouse repulsion and soft volumetric light rays
 * from the top-right, matching the painted rays in the background layer. Loaded on demand (dynamic import)
 * only when motion is allowed and WebGL is available. Additive blending on a transparent canvas.
 */
import { WebGLRenderer, Scene, OrthographicCamera, Mesh, PlaneGeometry, ShaderMaterial, AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, Vector2, Color } from 'three';

export function mountHero3D(canvas: HTMLCanvasElement): () => void {
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power', premultipliedAlpha: true }); }
  catch { return () => {}; }
  const host = canvas.parentElement!;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr); renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 10); camera.position.z = 1;
  const css = getComputedStyle(document.documentElement);
  const gold = new Color(css.getPropertyValue('--gold-soft').trim() || '#E6BC5E');
  const ray = new Color(css.getPropertyValue('--accent-soft').trim() || '#D8A066');
  const mouse = new Vector2(0.5, 0.5), target = new Vector2(0.5, 0.5);
  const uniforms = { uTime: { value: 0 }, uAspect: { value: 1 }, uPixelRatio: { value: dpr }, uMouse: { value: mouse }, uGold: { value: gold }, uRay: { value: ray } };

  // --- light rays: full-screen quad ---
  const rays = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, uniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      precision mediump float; varying vec2 vUv; uniform float uTime, uAspect; uniform vec2 uMouse; uniform vec3 uRay;
      void main(){
        vec2 p = vec2(vUv.x * uAspect, vUv.y);
        vec2 src = vec2(0.92 * uAspect + (uMouse.x - 0.5) * 0.06, 1.18 + (uMouse.y - 0.5) * 0.04);
        vec2 d = p - src; float ang = atan(d.y, d.x); float dist = length(d);
        float r = 0.5 + 0.5 * sin(ang * 22.0 + uTime * 0.22);
        r *= 0.55 + 0.45 * sin(ang * 9.0 - uTime * 0.13 + 1.7);
        r *= 0.6 + 0.4 * sin(ang * 41.0 + uTime * 0.08);
        r = pow(r, 1.7);
        float cone = smoothstep(-3.05, -2.55, ang) * (1.0 - smoothstep(-1.45, -1.05, ang));
        float fall = smoothstep(2.1, 0.25, dist) * smoothstep(0.02, 0.5, dist);
        float a = r * cone * fall * 0.42;
        gl_FragColor = vec4(uRay * 1.2, a);
      }`,
  }));
  scene.add(rays);

  // --- dust particles ---
  const area = host.clientWidth * host.clientHeight;
  const N = Math.round(Math.min(680, Math.max(160, area / 3200)));
  const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N), speed = new Float32Array(N), depth = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const dz = Math.random();
    pos[i * 3] = (Math.random() * 2.4 - 1.2); pos[i * 3 + 1] = Math.random() * 2.4 - 1.2; pos[i * 3 + 2] = 0;
    depth[i] = dz; size[i] = 1.2 + Math.random() * 2.6 + (1 - dz) * 2.2; phase[i] = Math.random() * Math.PI * 2; speed[i] = 0.5 + Math.random() * 0.9;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new Float32BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
  geo.setAttribute('aSpeed', new Float32BufferAttribute(speed, 1));
  geo.setAttribute('aDepth', new Float32BufferAttribute(depth, 1));
  const dust = new Points(geo, new ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, uniforms,
    vertexShader: `
      attribute float aSize, aPhase, aSpeed, aDepth; varying float vAlpha; varying float vDepth;
      uniform float uTime, uAspect, uPixelRatio; uniform vec2 uMouse;
      void main(){
        vec3 p = position; float t = uTime * aSpeed;
        p.y = mod(p.y + t * 0.05 + 1.2, 2.4) - 1.2;
        p.x += sin(t * 0.6 + aPhase) * 0.06 * (1.0 - aDepth * 0.6);
        vec2 m = vec2((uMouse.x - 0.5) * 2.0 * uAspect, (0.5 - uMouse.y) * 2.0);
        vec2 toM = p.xy - m; float dm = length(toM);
        p.xy += normalize(toM + 0.0001) * smoothstep(0.6, 0.0, dm) * 0.16 * (1.0 - aDepth);
        gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
        gl_PointSize = aSize * uPixelRatio * (0.55 + (1.0 - aDepth) * 1.6);
        vAlpha = mix(0.85, 0.22, aDepth) * (0.55 + 0.45 * sin(t * 1.1 + aPhase)); vDepth = aDepth;
      }`,
    fragmentShader: `
      precision mediump float; varying float vAlpha; varying float vDepth; uniform vec3 uGold;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = length(c);
        float a = smoothstep(0.5, 0.08, d) * vAlpha; float core = smoothstep(0.16, 0.0, d) * (1.0 - vDepth);
        gl_FragColor = vec4(uGold + core * 0.5, a);
      }`,
  }));
  scene.add(dust);

  let w = 0, h = 0;
  const resize = () => {
    const nw = host.clientWidth, nh = host.clientHeight; if (!nw || !nh || (nw === w && nh === h)) return;
    w = nw; h = nh; renderer.setSize(w, h, false); uniforms.uAspect.value = w / h;
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(host);

  let visible = true, raf = 0, last = performance.now(), t = 0;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); }, { threshold: 0.01 });
  io.observe(host);
  const onMove = (e: PointerEvent) => { const r = host.getBoundingClientRect(); target.set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
  const onLeave = () => target.set(0.5, 0.5);
  window.addEventListener('pointermove', onMove, { passive: true }); host.addEventListener('pointerleave', onLeave);
  const onVis = () => { if (!document.hidden && visible) loop(); };
  document.addEventListener('visibilitychange', onVis);

  function loop() {
    cancelAnimationFrame(raf);
    if (!visible || document.hidden) return;
    const now = performance.now(); t += Math.min(0.05, (now - last) / 1000); last = now;
    uniforms.uTime.value = t; mouse.lerp(target, 0.06);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  loop();

  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    window.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave); document.removeEventListener('visibilitychange', onVis);
    geo.dispose(); (dust.material as ShaderMaterial).dispose(); rays.geometry.dispose(); (rays.material as ShaderMaterial).dispose(); renderer.dispose();
  };
}
