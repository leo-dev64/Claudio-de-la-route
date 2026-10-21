import { renderScene } from './scene.js';

const THEMES = {
  L: 'Circulation routière', R: 'La route', U: 'Les autres usagers', C: 'Le conducteur',
  D: 'Réglementation générale', P: 'Premiers secours', A: 'Quitter le véhicule',
  M: 'Mécanique', S: 'Équipements de sécurité', E: 'Environnement',
};
const PASS = 35, EXAM_SIZE = 40, EXAM_SECONDS = 45, SERIES = 10;
const LETTERS = 'ABCD';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const app = document.getElementById('app');
const nav = document.getElementById('nav');
let me = null;          // { username, created, stats }
let Q = [], byId = new Map();
let quiz = null;        // série en cours
let last = null;        // dernière série terminée (pour la correction)

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtDate = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const isSituation = q => q.scene || q.img?.startsWith('photos/');
const isSign = q => q.img?.startsWith('signs/');

const ICONS = {
  play: '<path d="M6 3.5v17l14-8.5z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  sign: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  shuffle: '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h2a4 4 0 0 0 3.3-1.7l5.4-8.6A4 4 0 0 1 16 6h6"/><path d="M2 6h2a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6a4 4 0 0 1-3.3-1.8l-.4-.5"/>',
  retry: '<path d="M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8"/><path d="M3 3v5h5"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22"/><path d="M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8"/><path d="M18 2H6v7a6 6 0 0 0 12 0z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  eye: '<path d="M2.1 12.3a1 1 0 0 1 0-.7 10.8 10.8 0 0 1 19.8 0 1 1 0 0 1 0 .7 10.8 10.8 0 0 1-19.8 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.7 5.1a10.7 10.7 0 0 1 11.2 6.6 1 1 0 0 1 0 .7 10.7 10.7 0 0 1-1.4 2.5"/><path d="M14.1 14.2a3 3 0 0 1-4.2-4.2"/><path d="M17.5 17.5A10.8 10.8 0 0 1 2.1 12.3a1 1 0 0 1 0-.7 10.8 10.8 0 0 1 4.4-5.1"/><path d="m2 2 20 20"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.8-1.6l9.9-10.2a.5.5 0 0 1 .9.5l-1.9 6A1 1 0 0 0 13 10h7a1 1 0 0 1 .8 1.6l-9.9 10.2a.5.5 0 0 1-.9-.5l1.9-6A1 1 0 0 0 11 14z"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

async function api(path, body) {
  // keepalive : la requête aboutit même si la page se ferme juste après
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erreur réseau'), { status: res.status });
  return data;
}

// ---------- Outils d'interface ----------
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

function enter() {
  [...(app.querySelector('.page') || app).children].forEach((el, i) => { el.classList.add('enter'); el.style.setProperty('--i', Math.min(i, 8)); });
}

function countUp(root = app) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const raw = el.dataset.count, to = Number(raw), dec = raw.includes('.') ? 1 : 0;
    const fmt = v => v.toFixed(dec).replace('.', ',');
    if (reduced) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / 1100);
      el.textContent = fmt(to * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function reveal(root = app) {
  const els = root.querySelectorAll('.reveal');
  const show = el => { el.classList.add('in'); countUp(el); };
  if (!('IntersectionObserver' in window)) return els.forEach(show);
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
  }), { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => io.observe(el));
}

function toast(msg, kind = 'good') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `${icon(kind === 'bad' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  document.getElementById('toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3400);
}

// Fenêtre de confirmation ; avec `input`, renvoie la valeur saisie (ou null).
function modal({ title, text = '', confirm = 'Confirmer', danger = false, input = null }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'modal';
    // le bouton de confirmation est le premier du formulaire : c'est lui que déclenche la touche Entrée
    d.innerHTML = `<form method="dialog">
      <h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}
      ${input ? `<label class="field"><span class="lab">${esc(input.label)}</span><input name="v" type="${input.type || 'text'}" autocomplete="${input.autocomplete || 'off'}" required></label>` : ''}
      <div class="modal-actions">
        <button class="btn ${danger ? 'danger fill' : 'primary'}" value="ok">${esc(confirm)}</button>
        <button class="btn ghost" value="cancel" formnovalidate>Annuler</button>
      </div></form>`;
    document.body.append(d);
    d.addEventListener('close', () => {
      const ok = d.returnValue === 'ok', v = d.querySelector('input')?.value;
      d.remove();
      resolve(input ? (ok ? v : null) : ok);
    });
    d.showModal();
    (d.querySelector('input') || d.querySelector('.btn.ghost')).focus();
  });
}

function confetti() {
  if (reduced) return;
  const colors = ['#ffc53d', '#ff9f1c', '#3ee08f', '#f3f5f8', '#6b97ff'];
  const box = document.createElement('div');
  box.className = 'confetti';
  box.innerHTML = Array.from({ length: 90 }, () => `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};` +
    `--x:${Math.round((Math.random() * 2 - 1) * 180)}px;--r:${Math.round(Math.random() * 900 - 450)}deg;--d:${(2.2 + Math.random() * 1.8).toFixed(2)}s;--dl:${(Math.random() * .5).toFixed(2)}s"></i>`).join('');
  document.body.append(box);
  setTimeout(() => box.remove(), 5000);
}

// ---------- Choix des questions ----------
const statsOf = () => me.stats;
// Mode erreurs : une question ratée reste consultable 24 h, puis elle est masquée et ne revient que dans la série erreurs.
const DAY = 864e5;
const errAt = id => statsOf().errors.find(e => e.id === id)?.at;
const isCooling = id => { const at = errAt(id); return at !== undefined && Date.now() - at < DAY; };
const readyErrors = () => statsOf().errors.filter(e => Date.now() - e.at >= DAY);
const coolingErrors = () => statsOf().errors.filter(e => Date.now() - e.at < DAY);

// Priorité : erreurs de plus de 24 h, puis jamais vues, puis le reste ; les erreurs récentes attendent.
function pick(pool, n) {
  const seen = new Set(statsOf().seenIds);
  const ready = [], fresh = [], rest = [];
  for (const q of shuffle(pool)) {
    if (errAt(q.id) !== undefined) { if (!isCooling(q.id)) ready.push(q); }
    else (seen.has(q.id) ? rest : fresh).push(q);
  }
  return [...ready, ...fresh, ...rest].slice(0, n);
}

// Examen : tirage équilibré entre les thèmes (tourniquet), comme le vrai ETG qui couvre les 10 thèmes.
function examQuestions() {
  const pools = Object.keys(THEMES).map(t => shuffle(Q.filter(q => q.theme === t && !isCooling(q.id)))).filter(p => p.length);
  const out = [];
  while (out.length < EXAM_SIZE && pools.some(p => p.length))
    for (const p of pools) if (p.length && out.length < EXAM_SIZE) out.push(p.pop());
  return shuffle(out);
}

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// ---------- En-tête ----------
function setNav(h) {
  if (!me) {
    nav.innerHTML = (h === '/' ? '<button class="nav-link opt" data-scroll="features">Fonctionnalités</button><button class="nav-link opt" data-scroll="steps">Méthode</button>' : '') +
      `<a class="nav-link ${h === '/connexion' ? 'active' : ''}" href="#/connexion">Connexion</a><a class="btn primary sm" href="#/inscription">Commencer</a>`;
    nav.querySelectorAll('[data-scroll]').forEach(b => b.onclick = () => document.getElementById(b.dataset.scroll)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }));
    return;
  }
  const ready = readyErrors().length;
  nav.innerHTML = `<a class="nav-link ${h === '/' ? 'active' : ''}" href="#/">${icon('home')}<span class="lbl">Tableau de bord</span></a>
    <a class="nav-link ${h === '/erreurs' ? 'active' : ''}" href="#/erreurs">${icon('retry')}<span class="lbl">Erreurs</span>${ready ? `<span class="badge">${ready}</span>` : ''}</a>
    <a class="nav-link ${h === '/compte' ? 'active' : ''}" href="#/compte" aria-label="Mon compte"><span class="avatar-s">${esc(me.username[0].toUpperCase())}</span><span class="lbl">${esc(me.username)}</span></a>`;
}

// ---------- Page d'accueil publique ----------
function viewLanding() {
  const situations = Q.filter(isSituation).length, signs = Q.filter(isSign).length;
  const count = t => Q.filter(q => q.theme === t).length;
  const segs = Array.from({ length: 40 }, (_, k) => `<i style="--k:${k}" class="${[7, 19, 31].includes(k) ? 'x' : ''}"></i>`).join('');
  app.innerHTML = `
  <section class="hero">
    <div class="road" aria-hidden="true"><div class="road-plane"></div></div>
    <div class="hero-in wrap">
      <div class="hero-copy enter">
        <p class="eyebrow">${icon('zap')} Code de la route · examen ETG</p>
        <h1 class="display">Vise le <span class="hl">40/40</span>.</h1>
        <p class="lead">Entraîne-toi dans les conditions réelles de l'examen : 40 questions chronométrées, des situations vues depuis le siège conducteur et une explication claire pour chaque réponse.</p>
        <div class="cta-row">
          <a class="btn primary lg" href="#/inscription">Commencer gratuitement ${icon('arrow', 'go')}</a>
          <a class="btn ghost lg" href="#/connexion">J'ai déjà un compte</a>
        </div>
        <ul class="ticks">
          <li>${icon('check')}Gratuit, sans publicité</li><li>${icon('check')}${Q.length} questions</li><li>${icon('check')}Les 10 thèmes officiels</li>
        </ul>
      </div>
      <div class="hero-demo enter" style="--i:2">
        <div class="demo" id="demo"></div>
        <div class="float f1">${icon('clock')}45 s par question</div>
      </div>
    </div>
  </section>

  <section class="strip wrap reveal" aria-label="Chiffres clés">
    <div><b data-count="${Q.length}">0</b><span>questions originales</span></div>
    <div><b data-count="10">0</b><span>thèmes officiels</span></div>
    <div><b data-count="${situations}">0</b><span>situations de conduite</span></div>
    <div><b data-count="${signs}">0</b><span>questions panneaux</span></div>
  </section>

  <section class="section wrap" id="features">
    <header class="sec-head reveal">
      <p class="eyebrow">Fonctionnalités</p>
      <h2 class="h-display">Tout pour arriver serein le jour J</h2>
      <p>Pas de bachotage à l'aveugle : tu t'entraînes comme à l'examen et tu comprends chaque erreur.</p>
    </header>
    <div class="bento">
      <article class="feat wide reveal">
        <span class="fi">${icon('flag')}</span>
        <h3>Examens blancs en conditions réelles</h3>
        <p>40 questions tirées sur les 10 thèmes, 45 secondes par question, aucun retour en arrière, et la correction après chaque réponse.</p>
        <div class="dash-demo" aria-hidden="true">${segs}</div>
        <div class="dash-legend"><span>Question 1</span><b>35 bonnes réponses pour réussir</b><span>40</span></div>
      </article>
      <article class="feat reveal">
        <span class="fi">${icon('image')}</span>
        <h3>Questions de situation</h3>
        <p>Nuit, pluie, brouillard, ville, autoroute : tu juges la scène depuis le siège conducteur.</p>
        <div class="thumb">${renderScene({ road: 'agglo', time: 'jour', weather: 'sec', crosswalk: true, pedestrian: true }, 'feat')}</div>
      </article>
      <article class="feat reveal">
        <span class="fi">${icon('book')}</span>
        <h3>Corrections expliquées</h3>
        <p>Chaque réponse est justifiée : tu retiens la règle, pas seulement la lettre.</p>
      </article>
      <article class="feat reveal">
        <span class="fi">${icon('retry')}</span>
        <h3>Tes erreurs reviennent</h3>
        <p>Les questions ratées repassent en priorité jusqu'à ce que tu les réussisses.</p>
      </article>
      <article class="feat reveal">
        <span class="fi">${icon('chart')}</span>
        <h3>Progression par thème</h3>
        <p>Vois d'un coup d'œil où tu en es, thème par thème.</p>
        <div class="mini-meters" aria-hidden="true">
          <div><span>Circulation routière</span><span>82 %</span><span class="meter"><i style="--w:82%"></i></span></div>
          <div><span>Premiers secours</span><span>64 %</span><span class="meter"><i style="--w:64%"></i></span></div>
        </div>
      </article>
    </div>
  </section>

  <section class="section wrap" id="steps">
    <header class="sec-head reveal"><p class="eyebrow">Méthode</p><h2 class="h-display">Trois étapes jusqu'au 40/40</h2></header>
    <div class="steps">
      <article class="step reveal"><span class="step-n">01</span><h3>Crée ton compte</h3><p>Un identifiant, un mot de passe, et c'est parti. Ta progression est sauvegardée.</p></article>
      <article class="step reveal"><span class="step-n">02</span><h3>Travaille par thème</h3><p>Des séries de 10 questions avec correction immédiate. Tes erreurs reviennent en priorité.</p></article>
      <article class="step reveal"><span class="step-n">03</span><h3>Enchaîne les examens</h3><p>Quand tes 5 derniers examens blancs sont à 38/40 ou plus, tu es prêt pour le vrai.</p></article>
    </div>
  </section>

  <section class="section wrap" id="themes">
    <header class="sec-head reveal"><p class="eyebrow">Programme</p><h2 class="h-display">Les 10 thèmes de l'examen</h2></header>
    <div class="tchips">${Object.entries(THEMES).map(([k, name]) =>
      `<div class="tchip reveal"><span class="tcode">${k}</span><div><b>${name}</b><small>${plural(count(k), 'question')}</small></div></div>`).join('')}</div>
  </section>

  <section class="final wrap reveal">
    <div class="road" aria-hidden="true"><div class="road-plane"></div></div>
    <p class="eyebrow">${icon('target')} Objectif 40/40</p>
    <h2 class="h-display">Prêt à prendre la route ?</h2>
    <p class="lead">Crée ton compte en dix secondes et lance ton premier examen blanc.</p>
    <a class="btn primary lg" href="#/inscription">Je commence ${icon('arrow', 'go')}</a>
  </section>`;
  renderDemo();
  reveal();
}

// Mini question jouable sans compte sur la page d'accueil.
function renderDemo() {
  const el = document.getElementById('demo');
  if (!el) return;
  const single = Q.filter(q => !q.sub && q.ok.length === 1);
  const pool = single.filter(q => q.scene).length ? single.filter(q => q.scene) : single;
  if (!pool.length) { el.parentElement.remove(); return; }
  const q = pool[Math.floor(Math.random() * pool.length)];
  el.innerHTML = `
    <div class="demo-top"><span class="chip">${icon('zap')}Essaie maintenant</span><span class="muted small">${THEMES[q.theme] ?? ''}</span></div>
    ${media(q)}
    <p class="demo-q">${esc(q.q)}</p>
    <div class="answers">${answerButtons(q, [], false, false)}</div>
    <div class="demo-fb" aria-live="polite"></div>`;
  el.querySelectorAll('.answer').forEach(b => b.onclick = () => {
    const i = Number(b.dataset.i), ok = q.ok.includes(i);
    el.querySelector('.answers').innerHTML = answerButtons(q, [i], true, true);
    el.querySelector('.demo-fb').innerHTML = `
      <div class="exp ${ok ? 'ok' : 'ko'}"><div class="exp-h">${icon(ok ? 'check' : 'x')}${ok ? 'Bonne réponse !' : `Raté, c'était ${LETTERS[q.ok[0]]}`}</div><p>${esc(q.exp)}</p></div>
      <div class="demo-actions"><button class="btn ghost sm" id="demo-next">${icon('shuffle')}Autre question</button><a class="btn primary sm" href="#/inscription">S'entraîner ${icon('arrow', 'go')}</a></div>`;
    el.querySelector('#demo-next').onclick = renderDemo;
  });
}

// ---------- Connexion ----------
function viewAuth(mode) {
  const reg = mode === 'register';
  app.innerHTML = `
  <section class="auth enter">
    <div class="auth-visual">
      ${renderScene({ road: 'autoroute', time: 'nuit', weather: 'pluie', ahead: 'voiture' }, 'auth')}
      <div class="ov">
        <p class="eyebrow">${icon('moon')} Nuit · pluie · autoroute</p>
        <h2 class="h-display">À quelle vitesse roules-tu ?</h2>
        <p>Des situations réalistes, vues depuis le siège conducteur, pour apprendre à décider vite et bien.</p>
      </div>
    </div>
    <div class="auth-form">
      <h1>${reg ? 'Crée ton compte' : 'Bon retour !'}</h1>
      <p class="sub">${reg ? 'Gratuit et sans e-mail. Ta progression est sauvegardée.' : 'Connecte-toi pour reprendre ton entraînement.'}</p>
      <form id="auth">
        <label class="field"><span class="lab">Identifiant</span>
          <input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="30"></label>
        <label class="field"><span class="lab">Mot de passe${reg ? ' <span class="muted">· 8 caractères minimum</span>' : ''}</span>
          <span class="ctl"><input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="${reg ? 8 : 1}">
          <button type="button" class="eye" aria-label="Afficher le mot de passe">${icon('eye')}</button></span></label>
        ${reg ? `<label class="field"><span class="lab">Confirmer le mot de passe</span>
          <span class="ctl"><input name="confirm" type="password" autocomplete="new-password" required minlength="8">
          <button type="button" class="eye" aria-label="Afficher le mot de passe">${icon('eye')}</button></span></label>` : ''}
        <p class="error" role="alert"></p>
        <button class="btn primary lg block">${reg ? 'Créer mon compte' : 'Se connecter'} ${icon('arrow', 'go')}</button>
        ${reg ? '<p class="consent">En créant un compte, tu acceptes les <a href="#/conditions">conditions d\'utilisation</a> et la <a href="#/confidentialite">politique de confidentialité</a>.</p>' : ''}
      </form>
      <p class="auth-switch">${reg ? 'Déjà inscrit ? <a href="#/connexion">Se connecter</a>' : 'Pas encore de compte ? <a href="#/inscription">Créer un compte</a>'}</p>
    </div>
  </section>`;
  app.querySelector('.auth-visual svg').setAttribute('preserveAspectRatio', 'xMidYMid slice');
  app.querySelectorAll('.eye').forEach(b => b.onclick = () => {
    const input = b.previousElementSibling, show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.innerHTML = icon(show ? 'eyeOff' : 'eye');
    b.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  });
  const form = app.querySelector('#auth');
  form.querySelector('input').focus();
  form.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const err = form.querySelector('.error'), btn = form.querySelector('.btn');
    if (reg && f.password !== f.confirm) { err.textContent = 'Les mots de passe ne correspondent pas.'; return; }
    btn.disabled = true;
    try {
      await api(reg ? '/api/register' : '/api/login', { username: f.username.trim(), password: f.password });
      await loadMe();
      toast(reg ? `Bienvenue ${me.username} !` : `Content de te revoir, ${me.username} !`);
      go('#/');
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  };
}

// ---------- Tableau de bord ----------
function readiness(exams) {
  const r = exams.slice(0, 5);
  if (r.length < 5) return { title: exams.length ? 'Continue sur ta lancée.' : 'Prêt à démarrer ?', text: `Fais au moins 5 examens blancs pour mesurer ton niveau (${r.length}/5).` };
  const min = Math.min(...r.map(a => a.score));
  if (min >= 38) return { title: 'Tu es prêt pour le jour J.', text: "Tes 5 derniers examens sont tous à 38/40 ou plus. Garde le rythme jusqu'à l'examen." };
  if (min >= PASS) return { title: 'Presque prêt.', text: 'Tu réussis tes 5 derniers examens. Vise 38+ à chaque fois pour avoir de la marge le jour J.' };
  return { title: 'Encore un effort.', text: `Au moins un de tes 5 derniers examens est sous ${PASS}/40. Révise tes erreurs puis retente.` };
}

function ring(avg, n) {
  const tone = !n ? '' : avg >= 38 ? 'tone-good' : avg >= PASS ? 'tone-warn' : 'tone-bad';
  return `<div class="ring ${tone}" style="--p:${n ? avg / 40 : 0}">
    <svg viewBox="0 0 140 140" aria-hidden="true"><circle class="bg" cx="70" cy="70" r="60"/>${n ? '<circle class="fg" cx="70" cy="70" r="60"/>' : ''}</svg>
    <div class="val">${n ? `<b data-count="${avg.toFixed(1)}">0</b>` : '<b>–</b>'}<small>${n ? `moyenne sur ${plural(n, 'examen')}` : 'aucun examen'}</small></div></div>`;
}

function scoreBars(attempts) {
  if (!attempts.length) return `<div class="empty"><span class="fi">${icon('chart')}</span><b>Aucun examen blanc pour l'instant</b><span class="small">Ton historique apparaîtra ici après ton premier examen.</span></div>`;
  const list = [...attempts].reverse().slice(-15);
  return `<div class="chart" role="img" aria-label="Scores des ${list.length} derniers examens"><div class="pass"><span>35</span></div>${list.map((a, k) =>
    `<div class="bar ${a.score >= PASS ? 'ok' : 'ko'}" style="--h:${(a.score / a.total) * 100}%;--k:${k}" title="${a.score}/${a.total} · ${fmtDate(a.created)}"><span>${a.score}</span></div>`).join('')}</div>`;
}

const kpi = (ic, label, v, color) =>
  `<div class="kpi" style="--kc:${color}"><span>${icon(ic)}${label}</span><b ${v === null ? '' : `data-count="${v}"`}>${v === null ? '–' : '0'}</b></div>`;

const tile = (kind, ic, color, title, sub, n, disabled = false) =>
  `<button class="tile" data-start="${kind}" style="--c:${color}" ${disabled ? 'disabled' : ''}><span class="ti">${icon(ic)}</span><b>${title}</b><small>${sub}</small>${n === undefined ? '' : `<span class="tn">${n}</span>`}</button>`;

function viewHome() {
  const s = statsOf(), exams = s.attempts;
  const recent = exams.slice(0, 5);
  const avgOf = l => l.reduce((t, a) => t + a.score, 0) / l.length;
  const ready = readiness(exams);
  app.innerHTML = `<div class="page">
  <section class="card dash-hero">
    <div>
      <p class="eyebrow">${new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir'} ${esc(me.username)}</p>
      <h1 class="h-display">${ready.title}</h1>
      <p class="lead">${ready.text}</p>
      <button class="btn primary lg" data-start="exam">${icon('play')}Lancer un examen blanc</button>
      <div class="meta"><span>${icon('flag')}${EXAM_SIZE} questions</span><span>${icon('clock')}${EXAM_SECONDS} s par question</span><span>${icon('target')}${PASS}/40 pour réussir</span><span>${icon('book')}${Q.length} questions sur le site</span></div>
    </div>
    <div class="ring-wrap">${ring(recent.length ? avgOf(recent) : 0, recent.length)}</div>
  </section>
  ${resumeList()}
  <section class="kpis">
    ${kpi('flag', 'Examens', exams.length, 'var(--amber)')}
    ${kpi('check', 'Réussis', exams.filter(a => a.score >= PASS).length, 'var(--good)')}
    ${kpi('chart', 'Moyenne', exams.length ? avgOf(exams).toFixed(1) : null, 'var(--blue)')}
    ${kpi('trophy', 'Record', exams.length ? Math.max(...exams.map(a => a.score)) : null, 'var(--amber)')}
  </section>
  <section class="card">
    <div class="card-head"><h2>Derniers examens blancs</h2><span class="muted small">Ligne verte : ${PASS}/40</span></div>
    ${scoreBars(exams)}
  </section>
  <section>
    <h2 class="sec-title">Révisions ciblées</h2>
    <div class="tiles">
      ${tile('#/erreurs', 'retry', 'var(--bad)', 'Mode erreurs', s.errors.length ? `${readyErrors().length} à corriger · ${coolingErrors().length} à revoir` : 'aucune erreur pour l\'instant', s.errors.length)}
      ${tile('situations', 'image', 'var(--amber)', 'Situations', 'scènes vues du conducteur', Q.filter(isSituation).length)}
      ${tile('signs', 'sign', 'var(--blue)', 'Panneaux', 'reconnaître la signalisation', Q.filter(isSign).length)}
      ${tile('random', 'shuffle', 'var(--violet)', 'Série aléatoire', `${SERIES} questions, tous thèmes`)}
    </div>
  </section>
  <section>
    <h2 class="sec-title">Entraînement par thème <span class="muted">${s.seen} / ${s.total} questions vues</span></h2>
    <div class="tgrid">${Object.entries(THEMES).map(([k, name]) => {
      const t = s.themes[k];
      if (!t) return '';
      const pct = t.total ? Math.round((t.mastered / t.total) * 100) : 0;
      return `<button class="tcard ${pct === 100 ? 'done' : ''}" data-start="theme" data-theme="${k}">
        <span class="tcode">${k}</span><span class="tname">${name}</span><span class="tnum">${t.mastered}/${t.total} réussies · ${plural(t.total, 'question')}</span>
        <span class="meter"><i style="--w:${pct}%"></i></span></button>`;
    }).join('')}</div>
    <p class="muted small">La barre compte les questions réussies à leur dernier passage.</p>
  </section></div>`;
  app.querySelectorAll('[data-start]').forEach(b => b.onclick = () => b.dataset.start.startsWith('#') ? go(b.dataset.start) : startQuiz(b.dataset.start, b.dataset.theme));
  app.querySelectorAll('[data-resume]').forEach(b => b.onclick = () => resumeQuiz(b.dataset.resume));
  app.querySelectorAll('[data-drop]').forEach(b => b.onclick = async () => {
    if (await modal({ title: 'Abandonner cette série ?', text: 'Les réponses déjà données dans cette série seront perdues.', confirm: 'Abandonner', danger: true })) { dropSaved(b.dataset.drop); viewHome(); }
  });
  enter();
  countUp();
}

const ago = t => {
  const m = Math.round((Date.now() - t) / 6e4);
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${plural(Math.round(m / 1440), 'jour')}`;
};

function resumeList() {
  const saved = Object.values(loadSaved()).filter(s => s.ids?.length && s.answers?.length < s.ids.length).sort((a, b) => b.at - a.at);
  if (!saved.length) return '';
  return `<section><h2 class="sec-title">Séries en cours <span class="muted">reprends là où tu t'es arrêté</span></h2><div class="resume">${saved.map(s => `
    <div class="rs">
      <span class="ti">${icon(s.exam ? 'flag' : 'book')}</span>
      <div class="rs-t"><b>${esc(s.title)}</b><small>Question ${s.answers.length + 1} / ${s.ids.length} · ${ago(s.at)}</small>
        <span class="meter"><i style="--w:${Math.round((s.answers.length / s.ids.length) * 100)}%"></i></span></div>
      <button class="btn primary sm" data-resume="${esc(s.key)}">${icon('play')}Reprendre</button>
      <button class="icon-btn" data-drop="${esc(s.key)}" aria-label="Abandonner la série ${esc(s.title)}" title="Abandonner">${icon('trash')}</button>
    </div>`).join('')}</div></section>`;
}

// ---------- Mode erreurs ----------
function viewErrors() {
  const ready = readyErrors(), cooling = coolingErrors().sort((a, b) => b.at - a.at);
  const until = at => {
    const min = Math.ceil(Math.max(0, DAY - (Date.now() - at)) / 6e4), h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
  };
  const byTheme = {};
  for (const e of ready) { const t = byId.get(e.id)?.theme; if (t) byTheme[t] = (byTheme[t] || 0) + 1; }
  app.innerHTML = `<div class="page">
  <section class="card dash-hero">
    <div>
      <p class="eyebrow">${icon('retry')} Mode erreurs</p>
      <h1 class="h-display">Vérifie que c'est vraiment acquis.</h1>
      <p class="lead">Une question ratée reste consultable avec sa correction pendant 24 h. Ensuite, elle est masquée : elle ne revient que dans la série erreurs, pour tester ta mémoire sans aide.</p>
      <button class="btn primary lg" data-start="errors" ${ready.length ? '' : 'disabled'}>${icon('play')}Lancer la série erreurs${ready.length ? ` · ${ready.length}` : ''}</button>
      ${ready.length
        ? `<div class="err-themes left">${Object.entries(byTheme).sort((x, y) => y[1] - x[1]).map(([t, n]) => `<span class="chip bad">${THEMES[t]} · ${n}</span>`).join('')}</div>`
        : `<p class="meta">${cooling.length ? "Aucune erreur n'a encore 24 h : reviens plus tard." : "Aucune erreur pour l'instant."}</p>`}
    </div>
  </section>
  <section class="kpis two">
    ${kpi('lock', 'À corriger · plus de 24 h, masquées', ready.length, 'var(--bad)')}
    ${kpi('eye', 'À revoir · moins de 24 h', cooling.length, 'var(--amber)')}
  </section>
  <h2 class="sec-title">À revoir maintenant <span class="muted">chaque question se masque 24 h après l'erreur</span></h2>
  ${cooling.length ? cooling.map(e => {
    const q = byId.get(e.id);
    return q ? `<article class="card corr ko">
      <div class="corr-h"><span>${THEMES[q.theme] ?? ''}</span><span class="chip neutral">${icon('clock')}Masquée dans ${until(e.at)}</span></div>
      ${media(q)}
      <h3>${esc(q.q)}</h3>
      <div class="answers">${answerButtons(q, [], true, true)}</div>
      <p class="exp-text"><b>À retenir · </b>${esc(q.exp)}</p>
    </article>` : '';
  }).join('') : `<div class="card empty"><span class="fi">${icon('check')}</span><b>Rien à revoir</b><span class="small">Tes erreurs des dernières 24 h apparaîtront ici avec leur correction.</span></div>`}
  </div>`;
  app.querySelector('[data-start]').onclick = () => startQuiz('errors');
  enter();
  countUp();
}

// ---------- Pages légales ----------
// À COMPLÉTER avant la mise en ligne : identité de l'éditeur et de l'hébergeur (obligatoire, art. 6 III de la LCEN).
const LEGAL = {
  editor: '[Nom et prénom, ou raison sociale]',
  status: '[Particulier / entreprise individuelle (SIREN) / société (forme, capital, RCS)]',
  address: '[Adresse postale]',
  contact: '[Adresse e-mail de contact]',
  director: '[Nom du directeur de la publication]',
  host: '[Nom de l\'hébergeur]',
  hostAddress: '[Adresse et téléphone de l\'hébergeur]',
  updated: '22 octobre 2026',
};

function viewLegal(page) {
  const pages = {
    'mentions-legales': ['Mentions légales', `
      <h2>Éditeur du site</h2>
      <p>${LEGAL.editor}<br>${LEGAL.status}<br>${LEGAL.address}<br>Contact : ${LEGAL.contact}</p>
      <p>Directeur de la publication : ${LEGAL.director}</p>
      <h2>Hébergement</h2>
      <p>${LEGAL.host}<br>${LEGAL.hostAddress}</p>
      <h2>Nature du service</h2>
      <p>Claudio de la route est un site gratuit d'entraînement à l'épreuve théorique générale du permis de conduire (ETG). Il n'est ni affilié ni agréé par le ministère de l'Intérieur, la Sécurité routière ou un organisme agréé de passage de l'examen. Les questions sont des questions d'entraînement originales : elles ne reproduisent pas la base officielle de l'examen.</p>
      <h2>Propriété intellectuelle</h2>
      <p>Les textes des questions, les scènes dessinées et le code du site appartiennent à l'éditeur. Les panneaux, photos et polices proviennent de sources sous licence libre, listées avec leurs auteurs et licences sur la page <a href="#/credits">Crédits</a>.</p>`],
    confidentialite: ['Politique de confidentialité', `
      <p>Cette politique explique quelles données le site traite et pourquoi, conformément au Règlement général sur la protection des données (RGPD) et à la loi Informatique et Libertés.</p>
      <h2>Responsable du traitement</h2>
      <p>${LEGAL.editor}, ${LEGAL.address}. Contact : ${LEGAL.contact}</p>
      <h2>Données traitées</h2>
      <ul>
        <li><b>Compte</b> : ton identifiant et ton mot de passe. Le mot de passe n'est jamais stocké en clair : seule une empreinte (scrypt, avec sel) est conservée. Aucune adresse e-mail, aucun nom ni numéro n'est demandé.</li>
        <li><b>Progression</b> : tes réponses (juste ou fausse, date de la dernière erreur) et tes scores d'examens blancs.</li>
        <li><b>Session</b> : un cookie technique <code>sid</code> qui te garde connecté pendant ${SESSION_DAYS_LABEL}.</li>
        <li><b>Séries en cours</b> : enregistrées uniquement dans ton navigateur (stockage local), jamais envoyées au serveur.</li>
      </ul>
      <h2>Finalité et base légale</h2>
      <p>Ces données servent uniquement à fournir le service : te connecter, enregistrer ta progression et te proposer tes erreurs. La base légale est l'exécution du service que tu demandes en créant un compte (article 6.1.b du RGPD).</p>
      <h2>Cookies</h2>
      <p>Le site n'utilise qu'un cookie strictement nécessaire à la connexion. Il n'y a ni publicité, ni mesure d'audience, ni réseau social, ni police ou script chargé depuis un site tiers. Ce cookie est exempté de consentement selon les recommandations de la CNIL.</p>
      <h2>Durée de conservation</h2>
      <p>Tes données sont conservées tant que ton compte existe. Tu peux effacer ta progression ou supprimer ton compte à tout moment depuis la page <a href="#/compte">Mon compte</a> : la suppression est immédiate et définitive. Les sessions expirent après ${SESSION_DAYS_LABEL}.</p>
      <h2>Destinataires</h2>
      <p>Tes données ne sont ni vendues, ni louées, ni transmises à des tiers. Seuls l'éditeur et son hébergeur (${LEGAL.host}) y ont accès techniquement.</p>
      <h2>Tes droits</h2>
      <p>Tu disposes d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. La suppression du compte est disponible directement sur le site ; pour les autres demandes, écris à ${LEGAL.contact}. Tu peux aussi adresser une réclamation à la CNIL (<a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">cnil.fr</a>).</p>
      <h2>Sécurité</h2>
      <p>Mots de passe hachés, cookie de session protégé (HttpOnly, SameSite), connexion chiffrée (HTTPS) en production et limitation des tentatives de connexion.</p>`],
    conditions: ["Conditions d'utilisation", `
      <h2>Objet</h2>
      <p>Le site propose gratuitement des questions d'entraînement au code de la route. En créant un compte, tu acceptes les présentes conditions.</p>
      <h2>Contenu pédagogique</h2>
      <p>Les questions sont rédigées avec soin à partir des règles du Code de la route en vigueur, mais elles ne sont pas officielles et peuvent contenir des erreurs ou ne pas suivre une évolution récente de la réglementation. Le site ne garantit pas la réussite à l'examen. En cas de doute, la référence reste le Code de la route (<a href="https://www.legifrance.gouv.fr" target="_blank" rel="noopener">legifrance.gouv.fr</a>) et les informations de la <a href="https://www.securite-routiere.gouv.fr" target="_blank" rel="noopener">Sécurité routière</a>. Tu peux signaler une erreur à ${LEGAL.contact}.</p>
      <h2>Compte</h2>
      <p>Tu es responsable de la confidentialité de ton mot de passe. Il est interdit d'utiliser le site pour nuire à son fonctionnement (tentatives d'intrusion, envois automatisés massifs). L'éditeur peut supprimer un compte en cas d'abus.</p>
      <h2>Disponibilité</h2>
      <p>Le service est fourni « en l'état », sans garantie de disponibilité. L'éditeur peut le modifier ou l'interrompre.</p>
      <h2>Droit applicable</h2>
      <p>Ces conditions sont soumises au droit français.</p>`],
  };
  const [title, body] = pages[page];
  app.innerHTML = `<div class="page legal"><section class="card"><p class="eyebrow">Informations légales</p><h1 class="h-display">${title}</h1><p class="muted small">Dernière mise à jour : ${LEGAL.updated}</p>${body}</section></div>`;
  enter();
}
const SESSION_DAYS_LABEL = '30 jours';

// ---------- Série de questions ----------
// Séries en cours, sauvegardées dans le navigateur pour pouvoir les reprendre.
const savedKey = () => `cdr-series:${me.username.toLowerCase()}`;
function loadSaved() { try { return JSON.parse(localStorage.getItem(savedKey())) || {}; } catch { return {}; } }
function writeSaved(all) { try { localStorage.setItem(savedKey(), JSON.stringify(all)); } catch { /* stockage indisponible : pas de reprise */ } }
function saveQuiz() {
  if (!quiz) return;
  const all = loadSaved();
  all[quiz.key] = { key: quiz.key, title: quiz.title, exam: quiz.exam, ids: quiz.items.map(q => q.id), answers: quiz.answers, at: Date.now() };
  writeSaved(all);
}
function dropSaved(key) { const all = loadSaved(); delete all[key]; writeSaved(all); }

function newQuiz(items, title, exam, key, answers = []) {
  quiz = { key, exam, title, items, i: answers.length, answers, chosen: [], checked: false, timer: null, fresh: true, left: EXAM_SECONDS };
  saveQuiz();
  location.hash = '#/quiz';
}

function resumeQuiz(key) {
  const s = loadSaved()[key];
  if (!s) return;
  const items = s.ids.map(id => byId.get(id)).filter(Boolean);
  const answers = s.answers.filter(a => byId.has(a.id));
  if (!items.length || answers.length >= items.length) { dropSaved(key); return viewHome(); }
  newQuiz(items, s.title, s.exam, key, answers);
}

function startQuiz(kind, theme) {
  let items, title, exam = false;
  switch (kind) {
    case 'exam': items = examQuestions(); title = 'Examen blanc'; exam = true; break;
    case 'errors': items = shuffle(readyErrors().map(e => byId.get(e.id)).filter(Boolean)); title = 'Série erreurs'; break;
    case 'theme': items = pick(Q.filter(q => q.theme === theme), SERIES); title = THEMES[theme]; break;
    case 'situations': items = pick(Q.filter(isSituation), SERIES); title = 'Situations'; break;
    case 'signs': items = pick(Q.filter(isSign), SERIES); title = 'Panneaux'; break;
    default: items = shuffle(Q).slice(0, SERIES); title = 'Série aléatoire';
  }
  if (items.length) newQuiz(items, title, exam, kind + (theme || ''));
}

function media(q) {
  if (q.scene) return `<figure class="media scene">${renderScene(q.scene, q.id)}</figure>`;
  if (q.img) {
    const sign = isSign(q);
    return `<figure class="media ${sign ? 'sign' : 'photo'}"><img src="${esc(q.img)}" alt="${sign ? 'Panneau' : 'Photo de la situation'}"></figure>`;
  }
  return '';
}

function answerButtons(q, chosen, checked, given) {
  return q.a.map((text, i) => {
    const head = q.sub && i % 2 === 0 ? `<p class="subq">${esc(q.sub[i / 2])}</p>` : '';
    const sel = chosen.includes(i), good = q.ok.includes(i);
    const cls = checked ? (good ? 'good' : sel ? 'bad' : '') : sel ? 'sel' : '';
    return `${head}<button class="answer ${cls}" data-i="${i}" ${given ? 'disabled' : ''} aria-pressed="${sel}">
      <span class="key">${LETTERS[i]}</span><span class="atext">${esc(text)}</span>${checked && sel ? '<span class="mine">ta réponse</span>' : ''}${checked && (good || sel) ? icon(good ? 'check' : 'x', 'st') : ''}</button>`;
  }).join('');
}

function segments() {
  return quiz.items.map((_, k) => {
    const a = quiz.answers[k];
    return `<i class="${a ? (a.ok ? 'ok' : 'ko') : k === quiz.i ? 'cur' : ''}"></i>`;
  }).join('');
}

function viewQuiz() {
  if (!quiz) return go('#/');
  const q = quiz.items[quiz.i], m = media(q);
  const fresh = quiz.fresh;
  quiz.fresh = false;
  app.innerHTML = `
  <section class="quiz${fresh ? ' q-enter' : ''}">
    <div class="qbar">
      <button class="icon-btn" id="quit" aria-label="Quitter la série" title="Quitter">${icon('x')}</button>
      <div class="qtitle"><span class="chip">${esc(quiz.title)}</span><span class="qcount">Question <b>${quiz.i + 1}</b> / ${quiz.items.length}</span>${quiz.exam ? '<span class="chip neutral" id="tlabel"></span>' : ''}</div>
      ${quiz.exam ? '<div class="tring" id="tring" role="timer"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="tr-bg" cx="20" cy="20" r="17"/><circle class="tr-fg" cx="20" cy="20" r="17"/></svg><span></span></div>' : '<span></span>'}
    </div>
    <div class="segs" aria-hidden="true">${segments()}</div>
    <div class="qbody${m ? ' has-media' : ''}">
      ${m}
      <div>
        <p class="theme-tag">${THEMES[q.theme] ?? ''}</p>
        <h2 class="question">${esc(q.q)}</h2>
        <div class="answers">${answerButtons(q, quiz.chosen, quiz.checked, quiz.checked)}</div>
        <div class="feedback" aria-live="polite">${quiz.checked ? feedback(q) : ''}</div>
      </div>
    </div>
    <div class="qactions">
      <p class="hint"><kbd>A</kbd><kbd>B</kbd><kbd>C</kbd><kbd>D</kbd> cocher · <kbd>Entrée</kbd> valider</p>
      ${quiz.checked
        ? `<button class="btn primary lg" id="next">${quiz.i + 1 < quiz.items.length ? 'Question suivante' : 'Voir le résultat'} ${icon('arrow', 'go')}</button>`
        : `<button class="btn primary lg" id="validate" ${quiz.chosen.length ? '' : 'disabled'}>Valider ${icon('check')}</button>`}
    </div>
  </section>`;
  app.querySelectorAll('.answer').forEach(b => b.onclick = () => toggle(Number(b.dataset.i)));
  app.querySelector('#quit').onclick = quit;
  app.querySelector('#validate')?.addEventListener('click', validate);
  app.querySelector('#next')?.addEventListener('click', next);
  if (quiz.exam) { paintTimer(); if (!quiz.timer && !quiz.checked) startTimer(); }
}

async function quit() {
  const running = !!quiz.timer;
  stopTimer();
  if (await modal({ title: 'Mettre la série en pause ?', text: 'Ta progression est sauvegardée : tu pourras reprendre cette série depuis le tableau de bord.', confirm: 'Mettre en pause' })) { quiz = null; go('#/'); }
  else if (running && quiz && location.hash === '#/quiz') startTimer();
}

function feedback(q) {
  const a = quiz.answers[quiz.answers.length - 1];
  return `<div class="exp ${a.ok ? 'ok' : 'ko'}"><div class="exp-h">${icon(a.ok ? 'check' : 'x')}${a.ok ? 'Bonne réponse' : `Mauvaise réponse<span>il fallait ${q.ok.map(i => LETTERS[i]).join(', ')}</span>`}</div><p>${esc(q.exp)}</p></div>`;
}

function toggle(i) {
  if (!quiz || quiz.checked) return;
  const q = quiz.items[quiz.i];
  if (i >= q.a.length) return;
  let c = quiz.chosen;
  if (c.includes(i)) c = c.filter(x => x !== i);
  else if (q.sub) c = [...c.filter(x => Math.floor(x / 2) !== Math.floor(i / 2)), i]; // une réponse par sous-question
  else c = [...c, i];
  quiz.chosen = c;
  app.querySelectorAll('.answer').forEach(b => {
    const on = c.includes(Number(b.dataset.i));
    b.classList.toggle('sel', on);
    b.setAttribute('aria-pressed', on);
  });
  const v = app.querySelector('#validate');
  if (v) v.disabled = !c.length;
}

function validate() {
  if (!quiz || quiz.checked) return;
  const q = quiz.items[quiz.i];
  stopTimer();
  const answer = { id: q.id, chosen: [...quiz.chosen], ok: sameSet(quiz.chosen, q.ok) };
  quiz.answers.push(answer);
  quiz.checked = true;
  saveQuiz();
  // enregistrée tout de suite : une pause ou une fermeture de page ne perd rien, et l'erreur est datée de maintenant
  const sent = api('/api/results', { answers: [{ id: answer.id, ok: answer.ok }] }).then(s => { if (me) me.stats = s; }).catch(() => { answer.unsent = true; saveQuiz(); });
  (quiz.pending ??= []).push(sent);
  viewQuiz();
  app.querySelector('#next')?.focus({ preventScroll: true });
}

function next() {
  quiz.i++;
  quiz.chosen = [];
  quiz.checked = false;
  quiz.fresh = true;
  quiz.left = EXAM_SECONDS;
  if (quiz.i >= quiz.items.length) return finish();
  viewQuiz();
  window.scrollTo({ top: 0 });
}

function paintTimer() {
  const ringEl = document.getElementById('tring');
  if (!ringEl) return;
  const left = Math.max(0, quiz.left), sec = Math.ceil(left);
  ringEl.querySelector('.tr-fg').style.strokeDashoffset = (106.8 * (1 - left / EXAM_SECONDS)).toFixed(2);
  ringEl.querySelector('span').textContent = sec;
  ringEl.classList.toggle('urgent', !quiz.checked && left <= 10);
  ringEl.setAttribute('aria-label', `${sec} secondes restantes`);
  const label = document.getElementById('tlabel');
  const phase = quiz.checked ? 'done' : 'answer';
  if (label && label.dataset.phase !== phase) {
    label.dataset.phase = phase;
    label.innerHTML = phase === 'done' ? `${icon('check')}Corrigée` : `${icon('clock')}${EXAM_SECONDS} s`;
  }
}

function startTimer() {
  quiz.timer = setInterval(() => {
    quiz.left -= 0.25;
    paintTimer();
    if (quiz.left <= 0) validate(); // temps écoulé : la sélection en cours est validée (vide = faux)
  }, 250);
}
function stopTimer() { if (quiz?.timer) { clearInterval(quiz.timer); quiz.timer = null; } }

async function finish() {
  const done = quiz;
  quiz = null;
  last = done;
  document.body.classList.remove('focus');
  app.innerHTML = '<div class="loading" aria-label="Enregistrement"><span></span><span></span><span></span></div>';
  try {
    await Promise.all(done.pending || []);
    // réponses dont l'envoi immédiat a échoué (réseau) : on retente une fois
    const unsent = done.answers.filter(a => a.unsent).map(({ id, ok }) => ({ id, ok }));
    if (unsent.length) me.stats = await api('/api/results', { answers: unsent });
    if (done.exam) me.stats = await api('/api/attempt', { score: done.answers.filter(a => a.ok).length, total: done.answers.length });
    dropSaved(done.key);
  } catch (e) {
    if (e.status === 401) return logoutLocal();
    toast('Résultats non enregistrés : ' + e.message, 'bad');
  }
  go('#/resultat');
}

// ---------- Résultat ----------
function corrections(onlyErrors) {
  return last.answers.map((a, k) => ({ a, k })).filter(({ a }) => !onlyErrors || !a.ok).map(({ a, k }) => {
    const q = byId.get(a.id);
    return `<article class="card corr ${a.ok ? 'ok' : 'ko'}">
      <div class="corr-h"><span>Question ${k + 1} · ${THEMES[q.theme] ?? ''}</span><span class="chip ${a.ok ? 'good' : 'bad'}">${icon(a.ok ? 'check' : 'x')}${a.ok ? 'Juste' : 'Fausse'}</span></div>
      ${media(q)}
      <h3>${esc(q.q)}</h3>
      <div class="answers">${answerButtons(q, a.chosen, true, true)}</div>
      <p class="exp-text"><b>À retenir · </b>${esc(q.exp)}</p>
    </article>`;
  }).join('');
}

function viewResult() {
  if (!last) return go('#/');
  const total = last.answers.length, score = last.answers.filter(a => a.ok).length;
  const wrong = last.answers.filter(a => !a.ok);
  const pass = last.exam ? score >= PASS : null;
  const tone = pass === null ? (score / total >= 0.875 ? 'good' : 'amber') : pass ? 'good' : 'bad';
  const byTheme = {};
  for (const a of wrong) { const t = byId.get(a.id)?.theme; byTheme[t] = (byTheme[t] || 0) + 1; }
  const verdict = pass === null ? 'Série terminée' : pass ? (score === total ? 'Parfait, sans faute !' : 'Examen réussi !') : 'Examen échoué';
  app.innerHTML = `<div class="page">
  <section class="card result" style="--tone:var(--${tone})">
    <span class="chip neutral">${esc(last.title)}</span>
    <div class="gauge" style="--p:${score / total}">
      <svg viewBox="0 0 200 200" aria-hidden="true"><circle class="bg" cx="100" cy="100" r="88"/><circle class="fg" cx="100" cy="100" r="88"/></svg>
      <div class="g-num"><b data-count="${score}">0</b><span>/ ${total}</span></div>
    </div>
    <p class="verdict">${verdict}</p>
    ${pass === false ? `<p class="muted">Il te manquait ${PASS - score} bonne${PASS - score > 1 ? 's réponses' : ' réponse'}. Revois tes erreurs ci-dessous, puis retente.</p>` : ''}
    <div class="r-stats">
      <div><b class="good-t">${score}</b><span>${score > 1 ? 'bonnes' : 'bonne'}</span></div>
      <div><b class="bad-t">${wrong.length}</b><span>${wrong.length > 1 ? 'fautes' : 'faute'}</span></div>
      <div><b>${Math.round((score / total) * 100)} %</b><span>réussite</span></div>
    </div>
    ${wrong.length ? `<div class="err-themes">${Object.entries(byTheme).sort((x, y) => y[1] - x[1]).map(([t, n]) => `<span class="chip bad">${THEMES[t] ?? t} · ${n}</span>`).join('')}</div>` : ''}
    <div class="cta-row center">
      <button class="btn primary" data-start="exam">${icon('play')}Nouvel examen blanc</button>
      ${wrong.length ? `<a class="btn" href="#/erreurs">${icon('retry')}Mes erreurs</a>` : ''}
      <a class="btn ghost" href="#/">Tableau de bord</a>
    </div>
  </section>
  <div class="center"><div class="seg-ctrl" role="group" aria-label="Filtrer la correction">
    <button data-f="all" aria-pressed="true">Toute la correction · ${total}</button>
    <button data-f="err" aria-pressed="false" ${wrong.length ? '' : 'disabled'}>Erreurs · ${wrong.length}</button>
  </div></div>
  <section class="corrections">${corrections(false)}</section></div>`;
  app.querySelectorAll('.seg-ctrl button').forEach(b => b.onclick = () => {
    app.querySelectorAll('.seg-ctrl button').forEach(x => x.setAttribute('aria-pressed', x === b));
    app.querySelector('.corrections').innerHTML = corrections(b.dataset.f === 'err');
  });
  app.querySelector('[data-start]').onclick = () => startQuiz('exam');
  enter();
  countUp();
  if (pass && !last.celebrated) { last.celebrated = true; setTimeout(confetti, 700); }
}

// ---------- Compte ----------
function viewAccount() {
  const s = statsOf();
  app.innerHTML = `<div class="page">
  <section class="card">
    <div class="profile">
      <span class="avatar">${esc(me.username[0].toUpperCase())}</span>
      <div><h1>${esc(me.username)}</h1><p class="muted">Membre depuis le ${fmtDate(me.created)}</p></div>
      <button class="btn ghost" id="logout">${icon('logout')}Se déconnecter</button>
    </div>
    <div class="mini-stats">
      <div><b>${s.attempts.length}</b><span>examens récents</span></div>
      <div><b>${s.seen}</b><span>questions vues</span></div>
      <div><b>${s.errors.length}</b><span>erreurs à revoir</span></div>
    </div>
  </section>
  <section class="card">
    <h2>${icon('lock')} Mot de passe</h2>
    <form id="pw" class="form-narrow">
      <label class="field"><span class="lab">Mot de passe actuel</span><input type="password" name="current" autocomplete="current-password" required></label>
      <label class="field"><span class="lab">Nouveau mot de passe <span class="muted">· 8 caractères minimum</span></span><input type="password" name="next" autocomplete="new-password" required minlength="8"></label>
      <p class="error" role="alert"></p>
      <button class="btn primary">Enregistrer</button>
    </form>
  </section>
  <section class="card danger-zone">
    <h2>${icon('alert')} Zone sensible</h2>
    <p class="muted">Réinitialiser efface tes statistiques et ton historique d'examens. Supprimer efface définitivement ton compte.</p>
    <div class="cta-row">
      <button class="btn" id="reset">${icon('retry')}Réinitialiser ma progression</button>
      <button class="btn danger" id="delete">${icon('trash')}Supprimer mon compte</button>
    </div>
  </section></div>`;
  app.querySelector('#logout').onclick = async () => { await api('/api/logout', {}).catch(() => {}); logoutLocal(); toast('Tu es déconnecté. À bientôt !'); };
  const pw = app.querySelector('#pw');
  pw.onsubmit = async e => {
    e.preventDefault();
    const err = pw.querySelector('.error');
    try { await api('/api/password', Object.fromEntries(new FormData(pw))); pw.reset(); err.textContent = ''; toast('Mot de passe modifié'); }
    catch (x) { err.textContent = x.message; }
  };
  app.querySelector('#reset').onclick = async () => {
    if (!await modal({ title: 'Réinitialiser ta progression ?', text: 'Tes statistiques et ton historique d\'examens seront effacés. Cette action est définitive.', confirm: 'Réinitialiser', danger: true })) return;
    try { me.stats = await api('/api/reset', {}); toast('Progression réinitialisée'); viewAccount(); }
    catch (x) { toast(x.message, 'bad'); }
  };
  app.querySelector('#delete').onclick = async () => {
    const password = await modal({ title: 'Supprimer ton compte ?', text: 'Ton compte et toute ta progression seront effacés définitivement.', confirm: 'Supprimer', danger: true,
      input: { label: 'Mot de passe', type: 'password', autocomplete: 'current-password' } });
    if (!password) return;
    try { await api('/api/delete-account', { password }); logoutLocal(); toast('Compte supprimé'); }
    catch (x) { toast(x.message, 'bad'); }
  };
  enter();
}

async function viewCredits() {
  const credits = await api('/api/credits').catch(() => []);
  app.innerHTML = `<div class="page">
  <section class="card">
    <h1 class="h-display">Crédits</h1>
    <p>Les questions sont des questions d'entraînement originales, non officielles. Les scènes dessinées sont générées par le site.</p>
    <p>Panneaux : <a href="https://commons.wikimedia.org/wiki/Category:Diagrams_of_road_signs_of_France" target="_blank" rel="noopener">Wikimedia Commons</a>, fichiers « France road sign … » (licences CC BY-SA 3.0 / 4.0, CC0 ou domaine public, voir chaque fichier).</p>
    <p>Polices : Inter et Unbounded (SIL Open Font License).</p>
    <h2>Photos</h2>
    ${credits.length ? `<ul class="credits">${credits.map(c => `<li><a href="${/^https:\/\//.test(c.source) ? esc(c.source) : '#'}" target="_blank" rel="noopener">${esc(c.file)}</a> — ${esc(c.author)} — ${esc(c.license)}</li>`).join('')}</ul>` : '<p class="muted">Aucune photo.</p>'}
  </section></div>`;
  enter();
}

// ---------- Navigation ----------
function logoutLocal() { me = null; quiz = null; go('#/'); }

async function loadMe() {
  try { me = await api('/api/me'); } catch { me = null; }
}

function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  if (h !== '/quiz') stopTimer();
  document.body.classList.toggle('focus', h === '/quiz' && !!me && !!quiz);
  setNav(h);
  window.scrollTo(0, 0);
  if (h === '/credits') return viewCredits();
  if (['/mentions-legales', '/confidentialite', '/conditions'].includes(h)) return viewLegal(h.slice(1));
  if (!me) {
    if (h === '/connexion') return viewAuth('login');
    if (h === '/inscription') return viewAuth('register');
    return viewLanding();
  }
  if (h === '/quiz') return viewQuiz();
  if (quiz) { stopTimer(); quiz = null; } // quitter la série via le bouton retour l'abandonne
  if (h === '/resultat') return viewResult();
  if (h === '/compte') return viewAccount();
  if (h === '/erreurs') return viewErrors();
  if (h !== '/') return go('#/');
  viewHome();
}

document.addEventListener('keydown', e => {
  if (!quiz || location.hash !== '#/quiz' || document.querySelector('dialog[open]') || e.target.matches?.('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const i = LETTERS.indexOf(e.key.toUpperCase());
  if (i >= 0) { toggle(i); e.preventDefault(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (quiz.checked) next(); else if (quiz.chosen.length) validate();
  }
});

window.addEventListener('hashchange', route);

(async () => {
  try { Q = await api('/api/questions'); } catch { Q = []; }
  byId = new Map(Q.map(q => [q.id, q]));
  await loadMe();
  route();
})();
