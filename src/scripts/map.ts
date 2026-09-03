/**
 * Pan and zoom for the locations map.
 *
 * The view is the SVG viewBox rather than a CSS transform, so the outline stays vector-crisp at
 * any zoom and there is exactly one attribute to write per frame. Marks are counter-scaled by a
 * single CSS custom property, `--k`, so 62 city pins and 94 venue labels keep a constant
 * on-screen size without touching 156 elements individually.
 *
 * Touch deliberately leaves one finger to the page (`touch-action: pan-y`): a map that swallows
 * a scroll gesture is a trap on a phone. Two fingers drive it, and the +/- buttons cover the
 * case where someone does not know that.
 */
import gsap from 'gsap';

interface View { x: number; y: number; w: number; h: number }

/**
 * The width the mark sizes in the markup were drawn for. Sizes are scaled by how far the real
 * render departs from it, so a pin is the same number of pixels on a phone as on a laptop.
 */
const REF_WIDTH = 1000;
/** How far in the view may go, as a fraction of the whole map. Smaller number, closer view. */
const MAX_ZOOM = 0.045;
/** Venues appear once the view is at least this close, where their names stop overlapping. */
const VENUE_AT = 0.34;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initInteractiveMap() {
  const root = document.querySelector<HTMLElement>('[data-map]');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';

  const stage = root.querySelector<HTMLElement>('[data-map-stage]')!;
  const svg = root.querySelector<SVGSVGElement>('[data-map-svg]')!;
  const tip = root.querySelector<HTMLElement>('[data-map-tip]')!;
  const hint = root.querySelector<HTMLElement>('[data-map-hint]');
  const venueLayer = svg.querySelector<SVGGElement>('[data-layer="venues"]')!;
  const cityLayer = svg.querySelector<SVGGElement>('[data-layer="cities"]')!;
  const haloLayer = svg.querySelector<SVGGElement>('.map-halos');
  const resetBtn = root.querySelector<HTMLButtonElement>('[data-zoom="reset"]')!;

  const [hx, hy, hw, hh] = (root.dataset.home || '0 0 100 100').split(' ').map(Number);
  const home: View = { x: hx, y: hy, w: hw, h: hh };
  let view: View = { ...home };

  /** Screen pixels per user unit, from whatever width the SVG is currently laid out at. */
  const pxPerUnit = () => svg.getBoundingClientRect().width / view.w;

  const apply = () => {
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    const rendered = svg.getBoundingClientRect().width || REF_WIDTH;
    // Marks shrink in user units exactly as fast as the view grows, and grow on a narrow screen
    // where each user unit buys fewer pixels. Both effects, one property write.
    svg.style.setProperty('--k', String((REF_WIDTH * view.w) / (home.w * rendered)));
    const zoom = view.w / home.w;
    const close = zoom <= VENUE_AT;
    venueLayer.classList.toggle('is-on', close);
    venueLayer.setAttribute('aria-hidden', String(!close));
    venueLayer.querySelectorAll<SVGAElement>('[data-venue]').forEach(a => a.setAttribute('tabindex', close ? '0' : '-1'));
    // The cluster stood in for these venues; with them named, it is noise on top of them.
    cityLayer.classList.toggle('is-off', close);
    haloLayer?.classList.toggle('is-off', close);
    resetBtn.hidden = zoom > 0.98;
  };

  /**
   * Nudge city pins that land on top of each other apart.
   *
   * Pins hold a constant on-screen size, so at the whole-country view the Zagreb metro collapses
   * into a pile: Velika Gorica sits over Zagreb and takes its clicks. Rather than hide a city or
   * build a clustering layer, neighbours are pushed just far enough apart to be separately
   * clickable, and the nudge shrinks to nothing as you zoom in and the real distances open up.
   */
  const separate = () => {
    const pins = [...cityLayer.querySelectorAll<SVGGElement>('[data-pin]')];
    // Biggest first: the city with most venues keeps its true position.
    const nodes = pins.map(el => ({
      el,
      city: el.dataset.city!,
      x: Number(el.dataset.x), y: Number(el.dataset.y),
      dx: 0, dy: 0,
      weight: Number(el.querySelector('.pin-count')?.textContent ?? 1),
    })).sort((a, b) => b.weight - a.weight);

    const k = view.w / (svg.getBoundingClientRect().width || REF_WIDTH); // user units per screen px
    const need = 30 * k; // pin diameter plus a hair, in user units

    // Relaxation, not a single pass: clearing B of A can push it into C. A dozen rounds settles
    // the Zagreb cluster, and each round moves both neighbours so nobody drifts far from home.
    for (let round = 0; round < 12; round++) {
      let worst = 0;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let ax = a.x + a.dx, ay = a.y + a.dy, bx = b.x + b.dx, by = b.y + b.dy;
          let vx = bx - ax, vy = by - ay;
          let d = Math.hypot(vx, vy);
          // Exactly coincident pins need an arbitrary direction to escape along.
          if (d < 1e-6) { vx = (i % 2 ? 1 : -1) * 0.5; vy = 0.5; d = Math.hypot(vx, vy); }
          if (d >= need) continue;
          const push = ((need - d) / d) * 0.5;
          worst = Math.max(worst, need - d);
          // The heavier city yields less, so the biggest pin stays nearest its true place.
          const share = a.weight / (a.weight + b.weight);
          b.dx += vx * push * share; b.dy += vy * push * share;
          a.dx -= vx * push * (1 - share); a.dy -= vy * push * (1 - share);
        }
      }
      if (worst < need * 0.02) break;
    }
    for (const n of nodes) {
      const moved = Math.abs(n.dx) > 0.01 || Math.abs(n.dy) > 0.01;
      n.el.setAttribute('transform', moved ? `translate(${n.dx.toFixed(2)} ${n.dy.toFixed(2)})` : '');
      const halo = haloLayer?.querySelector<SVGCircleElement>(`[data-halo="${CSS.escape(n.city)}"]`);
      halo?.setAttribute('transform', moved ? `translate(${n.dx.toFixed(2)} ${n.dy.toFixed(2)})` : '');
    }
  };

  /**
   * Decide which venue names can be read. Central Zagreb has a dozen venues within a few hundred
   * metres, so drawn unconditionally the labels stack into an unreadable smear. Greedy pass in
   * screen space: live venues first, then anything that clears the labels already placed.
   *
   * Run when the view settles rather than every frame; it is O(n^2) over 94 venues and the answer
   * does not change mid-tween in any way a reader can see.
   */
  const declutter = () => {
    const labels = [...venueLayer.querySelectorAll<SVGTextElement>('.venue-label')];
    if (!venueLayer.classList.contains('is-on')) {
      labels.forEach(l => l.classList.remove('is-shown'));
      return;
    }
    const placed: DOMRect[] = [];
    const order = labels
      .map(el => ({ el, live: el.parentElement?.querySelector('.venue-live') != null }))
      .sort((a, b) => Number(b.live) - Number(a.live));
    for (const { el } of order) {
      el.classList.add('is-shown');
      const r = el.getBoundingClientRect();
      const clash = r.width === 0 || placed.some(q =>
        r.left < q.right + 4 && r.right + 4 > q.left && r.top < q.bottom + 2 && r.bottom + 2 > q.top);
      if (clash) el.classList.remove('is-shown');
      else placed.push(r);
    }
  };

  /** Keep the view inside the map, and stop it shrinking past the point of usefulness. */
  const clamp = (v: View): View => {
    const w = Math.min(home.w, Math.max(home.w * MAX_ZOOM, v.w));
    const h = w * (home.h / home.w);
    // A little slack so a city on the coast can still be centred.
    const slackX = w * 0.25, slackY = h * 0.25;
    return {
      w, h,
      x: Math.min(Math.max(v.x, home.x - slackX), home.x + home.w - w + slackX),
      y: Math.min(Math.max(v.y, home.y - slackY), home.y + home.h - h + slackY),
    };
  };

  const set = (next: View) => { view = clamp(next); apply(); settle(); };

  /** Labels are recomputed once the view stops moving, not on every frame of a drag. */
  let settleTimer = 0;
  const settle = () => { window.clearTimeout(settleTimer); settleTimer = window.setTimeout(() => { separate(); declutter(); }, 120); };

  /** Animate to a view; GSAP tweens a plain object and we write the attribute each tick. */
  const flyTo = (next: View, duration = 0.7) => {
    const target = clamp(next);
    if (reduced()) return set(target);
    gsap.killTweensOf(view);
    gsap.to(view, {
      ...target, duration, ease: 'power3.inOut',
      onUpdate: apply,
      onComplete: () => { view = target; apply(); separate(); declutter(); },
    });
  };

  /** Zoom by a factor, holding the given client point still under the cursor. */
  const zoomAt = (factor: number, clientX: number, clientY: number, animate = false) => {
    const box = svg.getBoundingClientRect();
    const px = (clientX - box.left) / box.width;
    const py = (clientY - box.top) / box.height;
    const anchorX = view.x + view.w * px;
    const anchorY = view.y + view.h * py;
    const w = view.w * factor;
    const h = view.h * factor;
    const next = { x: anchorX - w * px, y: anchorY - h * py, w, h };
    animate ? flyTo(next, 0.35) : set(next);
  };

  const centreOn = (x: number, y: number, w: number) => {
    const h = w * (home.h / home.w);
    flyTo({ x: x - w / 2, y: y - h / 2, w, h });
  };

  const dismissHint = () => { if (hint && !hint.hidden) { hint.style.opacity = '0'; window.setTimeout(() => { hint.hidden = true; }, 400); } };

  // ── Wheel ──────────────────────────────────────────────────────────
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    dismissHint();
    // Normalise across line/pixel/page delta modes so a trackpad and a mouse feel alike.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    zoomAt(Math.exp((e.deltaY * unit) * 0.0016), e.clientX, e.clientY);
  }, { passive: false });

  // ── Drag to pan, two fingers to pinch ──────────────────────────────
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDistance = 0;
  /** Set once a press has travelled far enough to be a drag; a click on a pin must not be one. */
  let dragging = false;
  let pressAt: { x: number; y: number } | null = null;

  svg.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Capturing here would retarget the pointerup and swallow the click on a city pin, so the
    // capture waits until the press has actually become a drag.
    pressAt = { x: e.clientX, y: e.clientY };
    dragging = false;
    gsap.killTweensOf(view);
  });

  svg.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance) {
        zoomAt(pinchDistance / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        dismissHint();
      }
      pinchDistance = d;
      return;
    }
    if (e.pointerType === 'touch') return; // a lone finger scrolls the page
    if (!pressAt) return;

    if (!dragging) {
      // Three pixels of slop, so a slightly shaky click still opens the city under it.
      if (Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) < 3) return;
      dragging = true;
      svg.setPointerCapture(e.pointerId);
      stage.classList.add('is-panning');
    }
    const scale = 1 / pxPerUnit();
    set({ ...view, x: view.x - (e.clientX - prev.x) * scale, y: view.y - (e.clientY - prev.y) * scale });
    dismissHint();
  });

  const endPointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (pointers.size === 0) { stage.classList.remove('is-panning'); pressAt = null; }
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('pointerleave', endPointer);

  // ── Buttons ────────────────────────────────────────────────────────
  root.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach(btn => {
    btn.addEventListener('click', () => {
      const box = svg.getBoundingClientRect();
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      dismissHint();
      if (btn.dataset.zoom === 'in') zoomAt(0.6, cx, cy, true);
      else if (btn.dataset.zoom === 'out') zoomAt(1 / 0.6, cx, cy, true);
      else flyTo({ ...home });
    });
  });

  // ── Keyboard ───────────────────────────────────────────────────────
  svg.addEventListener('keydown', e => {
    const step = view.w * 0.12;
    const box = svg.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => set({ ...view, x: view.x - step }),
      ArrowRight: () => set({ ...view, x: view.x + step }),
      ArrowUp: () => set({ ...view, y: view.y - step }),
      ArrowDown: () => set({ ...view, y: view.y + step }),
      '+': () => zoomAt(0.6, cx, cy, true),
      '=': () => zoomAt(0.6, cx, cy, true),
      '-': () => zoomAt(1 / 0.6, cx, cy, true),
      Escape: () => flyTo({ ...home }),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    dismissHint();
    run();
  });

  // ── City pins: fly in and hand over to the venue layer ─────────────
  const openCity = (pin: SVGGElement) => {
    const x = Number(pin.dataset.x), y = Number(pin.dataset.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    dismissHint();
    hideTip();
    centreOn(x, y, home.w * 0.16);
  };

  const showTip = (pin: SVGGElement) => {
    const [city, rest] = (pin.getAttribute('aria-label') ?? '').split(': ');
    tip.replaceChildren();
    const name = document.createElement('strong');
    name.textContent = city;
    const detail = document.createElement('span');
    detail.textContent = (rest ?? '').replace(/\. Otvori grad\.$/, '');
    tip.append(name, detail);
    const box = pin.getBoundingClientRect();
    const host = stage.getBoundingClientRect();
    tip.style.left = `${box.left + box.width / 2 - host.left}px`;
    tip.style.top = `${box.top - host.top}px`;
    tip.hidden = false;
  };
  const hideTip = () => { tip.hidden = true; };

  svg.querySelectorAll<SVGGElement>('[data-pin]').forEach(pin => {
    pin.addEventListener('pointerenter', () => showTip(pin));
    pin.addEventListener('focus', () => showTip(pin));
    pin.addEventListener('pointerleave', hideTip);
    pin.addEventListener('blur', hideTip);
    // A drag that ends over a pin is a pan, not a click on that city.
    pin.addEventListener('click', () => { if (!dragging) openCity(pin); });
    pin.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCity(pin); }
    });
  });

  stage.addEventListener('pointerleave', hideTip);

  // The map starts hidden behind the list/map switch, so the first measurement is zero-width and
  // the counter-scale would be stuck at 1 (tiny pins on a phone). This also covers rotation and
  // window resizing, where pixels-per-unit changes without the view changing at all.
  if ('ResizeObserver' in window) {
    let last = 0;
    new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0 && Math.abs(w - last) > 0.5) { last = w; apply(); separate(); declutter(); }
    }).observe(svg);
  }

  apply();
  separate();
  declutter();
}
