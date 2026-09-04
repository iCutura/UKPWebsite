import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

function motionOff(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('motion');
    if (q === 'off' || q === '0') localStorage.setItem('ukp-motion', 'off');
    if (q === 'on' || q === '1') localStorage.removeItem('ukp-motion');
    return localStorage.getItem('ukp-motion') === 'off';
  } catch { return false; }
}
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || motionOff();
const fine = () => matchMedia('(pointer: fine)').matches;

function header() {
  const h = document.querySelector<HTMLElement>('[data-header]'); if (!h) return;
  let last = scrollY, ticking = false;
  const update = () => {
    const y = scrollY; h.classList.toggle('is-scrolled', y > 24);
    if (y > 240 && y > last + 6 && !document.body.classList.contains('nav-open')) h.classList.add('is-hidden');
    else if (y < last - 6 || y < 240) h.classList.remove('is-hidden');
    last = y; ticking = false;
  };
  update();
  addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
}

function nav() {
  const btn = document.querySelector<HTMLButtonElement>('[data-nav-toggle]'); const panel = document.querySelector<HTMLElement>('[data-nav-panel]');
  if (!btn || !panel || btn.dataset.bound) return; btn.dataset.bound = '1';
  const close = () => { document.body.classList.remove('nav-open'); btn.setAttribute('aria-expanded', 'false'); panel.hidden = true; };
  const open = () => { panel.hidden = false; document.body.classList.add('nav-open'); btn.setAttribute('aria-expanded', 'true'); if (!reduce()) gsap.fromTo(panel.querySelectorAll('[data-nav-item]'), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: .5, stagger: .05, ease: 'power3.out', clearProps: 'all' }); };
  btn.addEventListener('click', () => btn.getAttribute('aria-expanded') === 'true' ? close() : open());
  panel.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.addEventListener('astro:before-swap', close, { once: true });
}

let destroy3d: (() => void) | null = null;

/** Pointer parallax on each layer's inner .drift wrapper: near layers move more. */
function pointerParallax(root: HTMLElement, layers: HTMLElement[], sx: number, sy: number) {
  if (!fine() || !layers.length) return;
  const setters = layers.map(l => { const d = parseFloat(l.dataset.depth || '0.5'); const el = l.firstElementChild as HTMLElement; return { d, x: gsap.quickTo(el, 'x', { duration: .9, ease: 'power3.out' }), y: gsap.quickTo(el, 'y', { duration: .9, ease: 'power3.out' }) }; });
  const onMove = (e: PointerEvent) => { const r = root.getBoundingClientRect(); const dx = (e.clientX - r.left) / r.width - .5, dy = (e.clientY - r.top) / r.height - .5; setters.forEach(s => { s.x(dx * s.d * sx); s.y(dy * s.d * sy); }); };
  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerleave', () => setters.forEach(s => { s.x(0); s.y(0); }));
}

function hero() {
  const hero = document.querySelector<HTMLElement>('[data-hero]'); if (!hero) return;
  const words = hero.querySelectorAll('[data-split] .wi');
  const layers = Array.from(hero.querySelectorAll<HTMLElement>('[data-scene] [data-depth]'));
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  if (layers.length) tl.from(layers.map(l => l.firstElementChild), { scale: 1.08, opacity: 0, duration: 1.6, stagger: .08, ease: 'power3.out' }, 0);
  if (words.length) tl.from(words, { yPercent: 115, rotate: 2, duration: 1.1, stagger: .045 }, .25);
  tl.from(hero.querySelectorAll('[data-hero-fade]'), { y: 18, opacity: 0, duration: .9, stagger: .08 }, .6);

  // Scroll parallax on the outer layer: far layers lag behind the page, near layers keep up.
  layers.forEach(l => {
    const d = parseFloat(l.dataset.depth || '0.5');
    gsap.to(l, { y: () => (1 - d) * 160, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  });
  gsap.to(hero.querySelector('.hero-content'), { y: 80, opacity: .2, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });

  pointerParallax(hero, layers, 44, 26);
  const mascot = hero.querySelector('[data-float]'); if (mascot) gsap.to(mascot, { y: -14, duration: 4.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  const glow = hero.querySelector('[data-breathe]'); if (glow) gsap.to(glow, { scale: 1.07, opacity: .75, duration: 7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  hero.querySelectorAll('[data-hero-float]').forEach((el, i) => gsap.to(el, { y: i % 2 ? -14 : 14, duration: 3 + i * .4, yoyo: true, repeat: -1, ease: 'sine.inOut' }));

  // Three.js dust + rays, loaded on demand.
  const gl = hero.querySelector<HTMLCanvasElement>('canvas[data-hero-gl]');
  if (gl && !destroy3d && hasWebGL()) {
    const start = () => import('./hero3d').then(m => { destroy3d = m.mountHero3D(gl); }).catch(() => {});
    'requestIdleCallback' in window ? (window as any).requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 300);
  }
}
function hasWebGL(): boolean { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
document.addEventListener('astro:before-swap', () => { destroy3d?.(); destroy3d = null; });

/**
 * Layered scenes outside the hero (LayeredScene.astro): the hero's layer contract in a card, with
 * the scroll parallax measured over the card's own trip through the viewport, so the layers sit
 * in line when the card is centred and drift apart as it enters and leaves.
 */
function scenes() {
  document.querySelectorAll<HTMLElement>('[data-scene-card]').forEach(scene => {
    const layers = Array.from(scene.querySelectorAll<HTMLElement>('[data-depth]'));
    layers.forEach(l => {
      const d = parseFloat(l.dataset.depth || '0.5');
      gsap.fromTo(l, { y: -(1 - d) * 60 }, { y: (1 - d) * 60, ease: 'none', scrollTrigger: { trigger: scene, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    pointerParallax(scene, layers, 30, 20);
    const mascot = scene.querySelector('[data-float]'); if (mascot) gsap.to(mascot, { y: -10, duration: 4.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    const glow = scene.querySelector('[data-breathe]'); if (glow) gsap.to(glow, { scale: 1.07, opacity: .75, duration: 7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  });
}

/**
 * The app pitch's phones (PhoneShowcase.astro): each floats on its own rhythm, keeping the lean
 * its stylesheet gives it. The pointer tilt on the trio comes from tilt() through data-tilt.
 * Under reduced motion none of this runs.
 */
function phones() {
  document.querySelectorAll<HTMLElement>('[data-phone-stage] [data-phone]').forEach((phone, i) => {
    const lean = parseFloat((getComputedStyle(phone).rotate || '0').replace('deg', '')) || 0;
    gsap.set(phone, { rotate: lean });
    gsap.to(phone, { y: i % 2 ? 10 : -12, rotate: lean + (i % 2 ? .8 : -.8), duration: 4.2 + i * .6, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: i * .35 });
  });
}

function reveals() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));
  if (!els.length) return;
  ScrollTrigger.batch(els, {
    start: 'top 90%', once: true,
    onEnter: batch => { batch.forEach(b => b.classList.add('is-in')); gsap.fromTo(batch, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: .9, ease: 'power3.out', stagger: .07, overwrite: true, clearProps: 'transform' }); },
  });
}

function counters() {
  document.querySelectorAll<HTMLElement>('[data-counter]').forEach(el => {
    const end = parseFloat(el.dataset.counter || '0'); const suffix = el.dataset.suffix || ''; const start = el.textContent;
    ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => {
      const o = { v: 0 }; gsap.to(o, { v: end, duration: 1.8, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v).toLocaleString('hr-HR') + suffix; }, onComplete: () => { el.textContent = start; } });
    } });
  });
}

function parallax() {
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
    gsap.to(el, { yPercent: parseFloat(el.dataset.parallax || '12'), ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: .6 } });
  });
}

function magnetic() {
  if (!fine()) return;
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach(el => {
    if (el.dataset.bound) return; el.dataset.bound = '1';
    const strength = parseFloat(el.dataset.magnetic || '18');
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); gsap.to(el, { x: x * strength, y: y * strength, duration: .5, ease: 'power3.out' }); });
    el.addEventListener('pointerleave', () => gsap.to(el, { x: 0, y: 0, duration: .7, ease: 'elastic.out(1, .5)' }));
  });
}

function tilt() {
  if (!fine()) return;
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach(el => {
    if (el.dataset.bound) return; el.dataset.bound = '1';
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; gsap.to(el, { rotateY: x * 8, rotateX: -y * 8, transformPerspective: 900, duration: .5, ease: 'power3.out' }); });
    el.addEventListener('pointerleave', () => gsap.to(el, { rotateX: 0, rotateY: 0, duration: .8, ease: 'power3.out' }));
  });
}

export function initMotion() {
  ScrollTrigger.getAll().forEach(t => t.kill());
  header(); nav();
  if (reduce()) { document.querySelectorAll('[data-reveal]').forEach(e => e.classList.add('is-in')); return; }
  hero(); scenes(); phones(); reveals(); counters(); parallax(); magnetic(); tilt();
  requestAnimationFrame(() => ScrollTrigger.refresh());
}
document.addEventListener('astro:page-load', initMotion);
