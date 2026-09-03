import gsap from 'gsap';
/**
 * Website team registration (people without the app): apps step -> form -> e-mail code -> done.
 * Talks only to the same-origin PHP proxy (/api/prijava.php), which holds the API key and forwards to
 * /api/pub-quiz-events/{id}/external-registrations on the PubQuiz API.
 */
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MSG: Record<string, string> = {
  invalid_input: 'Provjeri unesene podatke: ime ekipe, ime, e-mail i mobitel su obavezni.',
  event_not_found: 'Ovaj termin više ne postoji.',
  event_cancelled: 'Termin je otkazan.',
  event_closed: 'Kviz je već odigran.',
  deadline_passed: 'Rok za prijave je prošao.',
  event_full: 'Sva su mjesta popunjena.',
  team_name_taken: 'To ime ekipe pripada ekipi iz aplikacije. Prijavi se kroz aplikaciju ili odaberi drugo ime.',
  already_registered: 'Ta je ekipa već prijavljena na ovaj termin.',
  request_not_found: 'Prijava nije pronađena. Kreni ispočetka.',
  request_used: 'Ova je prijava već potvrđena.',
  code_expired: 'Kod je istekao. Zatraži novi.',
  invalid_code: 'Kod nije točan. Provjeri e-mail i pokušaj ponovno.',
  too_many_attempts: 'Previše pogrešnih pokušaja. Zatraži novi kod.',
  resend_cooldown: 'Pričekaj minutu prije nego zatražiš novi kod.',
  rate_limited: 'Previše zahtjeva. Pokušaj za koju minutu.',
  disabled: 'Prijave putem weba trenutno nisu uključene. Prijavi se kroz aplikaciju.',
  network: 'Prijava trenutno nije moguća. Pokušaj kroz aplikaciju ili nas nazovi.',
};
const HR_DAYS = ['nedjelju', 'ponedjeljak', 'utorak', 'srijedu', 'četvrtak', 'petak', 'subotu'];

async function call(body: Record<string, unknown>) {
  const r = await fetch('/api/prijava.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { const code = j.code || (r.status === 429 ? 'rate_limited' : r.status === 503 ? 'disabled' : 'network'); throw Object.assign(new Error(MSG[code] || j.message || MSG.network), { code }); }
  return j;
}

function bind() {
  document.querySelectorAll<HTMLElement>('[data-prijava]').forEach(panel => {
    if (panel.dataset.bound) return; panel.dataset.bound = '1';
    const eventId = Number(panel.dataset.eventId);
    const panels = Array.from(panel.querySelectorAll<HTMLElement>('[data-step-panel]'));
    const form = panel.querySelector<HTMLFormElement>('form[data-step-panel="form"]')!;
    const codeForm = panel.querySelector<HTMLFormElement>('form[data-step-panel="code"]')!;
    const resendBtn = panel.querySelector<HTMLButtonElement>('[data-resend]')!;
    const state: { requestId: number | null; resendAt: number; timer: number | null } = { requestId: null, resendAt: 0, timer: null };

    /**
     * A link an organiser sends to their teams: /dogadaji/3145/?prijava opens the form straight
     * away, so scanning a code at the bar is one step rather than three. Silently ignored when
     * this event is closed or cancelled, because then there is no form to open.
     */
    const openFromLink = () => {
      const asked = new URLSearchParams(location.search).has('prijava') || location.hash === '#prijava';
      if (!asked || !panel.querySelector('[data-step-panel="form"]')) return;
      show('form');
      // Land on the panel with the first field in reach, without stealing focus on a phone
      // keyboard the reader did not ask for.
      requestAnimationFrame(() => panel.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    };

    const boxes = Array.from(panel.querySelectorAll<HTMLInputElement>('[data-code-box]'));
    const codeValue = panel.querySelector<HTMLInputElement>('[data-code-value]');

    const syncCode = () => {
      const digits = boxes.map(b => b.value.replace(/\D/g, '').slice(0, 1));
      boxes.forEach((b, i) => b.classList.toggle('is-filled', digits[i] !== ''));
      if (codeValue) codeValue.value = digits.join('');
      return digits.join('');
    };
    const resetBoxes = () => { boxes.forEach(b => { b.value = ''; b.classList.remove('is-filled', 'is-invalid'); }); syncCode(); };

    boxes.forEach((box, i) => {
      box.addEventListener('input', () => {
        box.value = box.value.replace(/\D/g, '').slice(-1);
        boxes.forEach(b => b.classList.remove('is-invalid'));
        const full = syncCode();
        if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
        // Four digits in: submit, rather than asking for a click that adds nothing.
        if (full.length === 4) codeForm.requestSubmit();
      });
      box.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !box.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].focus(); syncCode(); }
        if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
        if (e.key === 'ArrowRight' && i < boxes.length - 1) { e.preventDefault(); boxes[i + 1].focus(); }
      });
      // A code copied out of the e-mail arrives in one box; spread it across all four.
      box.addEventListener('paste', e => {
        const text = e.clipboardData?.getData('text')?.replace(/\D/g, '') ?? '';
        if (!text) return;
        e.preventDefault();
        boxes.forEach((b, j) => { b.value = text[j] ?? b.value; });
        const full = syncCode();
        boxes[Math.min(text.length, boxes.length - 1)]?.focus();
        if (full.length === 4) codeForm.requestSubmit();
      });
    });

    const drawTick = () => {
      const mark = panel.querySelector<SVGElement>('[data-done-mark]');
      if (!mark || reducedMotion()) return;
      const shapes = mark.querySelectorAll<SVGGeometryElement>('circle, path');
      shapes.forEach(shape => {
        const len = shape.getTotalLength();
        gsap.fromTo(shape,
          { strokeDasharray: len, strokeDashoffset: len },
          { strokeDashoffset: 0, duration: .6, ease: 'power2.out', delay: shape.tagName === 'path' ? .28 : 0 });
      });
    };

    const ORDER = ['apps', 'form', 'code', 'done'];
    const show = (step: string) => {
      panel.dataset.step = step;
      panels.forEach(p => { p.hidden = p.dataset.stepPanel !== step; });
      panel.querySelector<HTMLElement>(`[data-step-panel="${step}"] .prijava-msg`)?.setAttribute('hidden', '');

      // The spine: where you are, and how much is left.
      const at = ORDER.indexOf(step);
      panel.querySelectorAll<HTMLElement>('[data-step-dot]').forEach(dot => {
        const i = ORDER.indexOf(dot.dataset.stepDot!);
        dot.classList.toggle('is-now', i === at);
        dot.classList.toggle('is-done', i < at);
      });

      const incoming = panel.querySelector<HTMLElement>(`[data-step-panel="${step}"]`);
      if (incoming && !reducedMotion()) {
        gsap.fromTo(incoming, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .45, ease: 'power3.out', clearProps: 'all' });
      }
      if (step === 'code') { resetBoxes(); setTimeout(() => boxes[0]?.focus(), 60); }
      if (step === 'done') drawTick();
    };
    const msg = (f: HTMLElement, text: string, kind: 'ok' | 'error' | 'info') => {
      const el = f.querySelector<HTMLElement>('.prijava-msg')!;
      el.hidden = false; el.textContent = text; el.className = `prijava-msg is-${kind}`;
      // A message nobody scrolls to is the same as no message at all.
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const busy = (f: HTMLFormElement, on: boolean, label?: string) => { const b = f.querySelector<HTMLButtonElement>('button[type=submit]')!; b.disabled = on; if (label) b.textContent = label; };

    const tickResend = () => {
      const left = Math.ceil((state.resendAt - Date.now()) / 1000);
      if (left > 0) { resendBtn.disabled = true; resendBtn.textContent = `Novi kod za ${left} s`; state.timer = window.setTimeout(tickResend, 1000); }
      else { resendBtn.disabled = false; resendBtn.textContent = 'Pošalji novi kod'; state.timer = null; }
    };
    const started = (j: { requestId: number; maskedEmail: string; resendAvailableAt: string }) => {
      state.requestId = j.requestId; state.resendAt = new Date(j.resendAvailableAt).getTime();
      panel.querySelector<HTMLElement>('[data-masked-email]')!.textContent = j.maskedEmail;
      show('code'); if (state.timer) clearTimeout(state.timer); tickResend();
    };

    panel.querySelectorAll<HTMLButtonElement>('[data-step-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.stepGo!)));

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const fd = new FormData(form); const d = Object.fromEntries(fd.entries()) as Record<string, string>;
      /** Mark the offending fields and put the cursor in the first one, so the message has somewhere to point. */
      const flag = (names: string[], text: string) => {
        form.querySelectorAll('.input.is-invalid').forEach(el => el.classList.remove('is-invalid'));
        const fields = names.map(n => form.querySelector<HTMLElement>(`[name="${n}"]`)).filter(Boolean) as HTMLElement[];
        fields.forEach(el => el.classList.add('is-invalid'));
        msg(form, text, 'error');
        fields[0]?.focus({ preventScroll: true });
        return undefined;
      };
      const blank = ['teamName', 'contactName', 'contactEmail', 'contactPhone'].filter(n => !d[n]?.trim());
      if (blank.length) return flag(blank, MSG.invalid_input);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.contactEmail)) return flag(['contactEmail'], 'Provjeri e-mail adresu.');
      if (!fd.get('consent')) return flag(['consent'], 'Potvrdi da se slažeš s korištenjem podataka za prijavu.');
      form.querySelectorAll('.input.is-invalid').forEach(el => el.classList.remove('is-invalid'));
      busy(form, true, 'Šaljemo kod…');
      try {
        const j = await call({ action: 'start', eventId, teamName: d.teamName, contactName: d.contactName, contactEmail: d.contactEmail, contactPhone: d.contactPhone, playerCount: d.playerCount ? Number(d.playerCount) : null, website: d.website || '' });
        started(j);
      } catch (e) { msg(form, (e as Error).message, 'error'); }
      finally { busy(form, false, 'Pošalji kod za potvrdu'); }
    });

    codeForm.addEventListener('submit', async ev => {
      ev.preventDefault();
      const code = (new FormData(codeForm).get('code') as string || '').trim();
      if (!/^\d{4}$/.test(code)) return msg(codeForm, 'Kod ima četiri znamenke.', 'error');
      if (!state.requestId) return show('form');
      busy(codeForm, true, 'Provjeravamo…');
      try {
        const j = await call({ action: 'confirm', eventId, requestId: state.requestId, code });
        const d = new Date(j.eventDate); const time = String(j.startTime || '').slice(0, 5);
        panel.querySelector<HTMLElement>('[data-done-title]')!.textContent = `Ekipa ${j.teamName} je prijavljena.`;
        panel.querySelector<HTMLElement>('[data-done-text]')!.textContent = j.status === 'Confirmed'
          ? `Vidimo se u ${HR_DAYS[d.getDay()]}, ${d.getDate()}. ${d.getMonth() + 1}. u ${time} h, ${j.venueName}. Ako ne možete doći, javite voditelju.`
          : `Voditelj potvrđuje prijave za ovaj termin. Prijava je zaprimljena i čeka potvrdu; do tada je mjesto rezervirano.`;
        show('done');
      } catch (e) {
        const err = e as Error & { code?: string }; msg(codeForm, err.message, 'error');
        // A wrong code should leave the boxes ready for another try, not make the reader clear
        // four of them by hand.
        boxes.forEach(b => b.classList.add('is-invalid'));
        if (!reducedMotion()) gsap.fromTo(panel.querySelector('[data-code-boxes]'), { x: -7 }, { x: 0, duration: .5, ease: 'elastic.out(1, .4)' });
        if (err.code !== 'request_not_found' && err.code !== 'request_used') {
          resetBoxes();
          setTimeout(() => boxes[0]?.focus(), 60);
        }
        if (err.code === 'code_expired' || err.code === 'too_many_attempts') { state.resendAt = 0; tickResend(); }
        if (err.code === 'request_not_found' || err.code === 'request_used') setTimeout(() => show(err.code === 'request_used' ? 'apps' : 'form'), 1500);
      } finally { busy(codeForm, false, 'Potvrdi prijavu'); }
    });

    resendBtn.addEventListener('click', async () => {
      if (!state.requestId) return show('form');
      resendBtn.disabled = true;
      try { const j = await call({ action: 'resend', eventId, requestId: state.requestId }); started(j); msg(codeForm, 'Novi kod je poslan.', 'info'); }
      catch (e) { msg(codeForm, (e as Error).message, 'error'); resendBtn.disabled = false; }
    });
    openFromLink();
  });
}
document.addEventListener('astro:page-load', bind);
