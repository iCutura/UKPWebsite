/**
 * Website team registration (people without the app): apps step -> form -> e-mail code -> done.
 * Talks only to the same-origin PHP proxy (/api/prijava.php), which holds the API key and forwards to
 * /api/pub-quiz-events/{id}/external-registrations on the PubQuiz API.
 */
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

    const show = (step: string) => { panel.dataset.step = step; panels.forEach(p => { p.hidden = p.dataset.stepPanel !== step; }); panel.querySelector<HTMLElement>(`[data-step-panel="${step}"] .prijava-msg`)?.setAttribute('hidden', ''); if (step === 'code') setTimeout(() => codeForm.querySelector<HTMLInputElement>('input[name=code]')?.focus(), 50); };
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
  });
}
document.addEventListener('astro:page-load', bind);
