// Auto-vérification : `node test.js` valide la banque de questions puis teste l'API (base en mémoire).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.DB_FILE = ':memory:';
const { questions, server } = await import('./server.js');
const PUB = path.join(import.meta.dirname, 'public');

// --- Banque de questions ---
const THEMES = new Set('LRUCDPAMSE');
const SCENE = {
  road: ['autoroute', '2x2', 'route', 'agglo'], time: ['jour', 'nuit'], weather: ['sec', 'pluie', 'brouillard', 'neige'],
  ahead: ['voiture', 'camion', 'bus', 'moto', 'cycliste', 'tracteur'], left: ['voiture', 'camion', 'bus', 'moto'],
  oncoming: ['voiture', 'camion', 'bus', 'moto', 'cycliste', 'tracteur'], line: ['continue', 'discontinue', 'aucune'],
  crosswalk: [true, false], pedestrian: [true, false], intersection: ['droite', 'gauche', 'croix'],
};
const problems = [];
const ids = new Set();
for (const q of questions) {
  const bad = msg => problems.push(`${q.id ?? '?'} : ${msg}`);
  if (typeof q.id !== 'string' || ids.has(q.id)) bad('id manquant ou en double');
  ids.add(q.id);
  if (!THEMES.has(q.theme)) bad(`thème inconnu ${q.theme}`);
  if (typeof q.q !== 'string' || q.q.length < 5) bad('énoncé manquant');
  if (typeof q.exp !== 'string' || q.exp.length < 10) bad('explication manquante');
  if (!Array.isArray(q.a) || q.a.length < 2 || q.a.length > 4 || q.a.some(x => typeof x !== 'string' || !x)) bad('2 à 4 réponses attendues');
  if (!Array.isArray(q.ok) || !q.ok.length || new Set(q.ok).size !== q.ok.length || q.ok.some(i => !Number.isInteger(i) || i < 0 || i >= q.a?.length)) bad('ok invalide');
  if (q.sub) {
    if (!Array.isArray(q.sub) || q.sub.length !== 2 || q.a.length !== 4) bad('sub : 2 sous-questions et 4 réponses');
    else if (q.ok.filter(i => i < 2).length !== 1 || q.ok.filter(i => i >= 2).length !== 1) bad('sub : une bonne réponse par paire');
  }
  if (q.img && !fs.existsSync(path.join(PUB, q.img))) bad(`image absente ${q.img}`);
  if (q.img && q.scene) bad('img et scene ensemble');
  if (q.scene) {
    for (const [k, v] of Object.entries(q.scene)) {
      if (k === 'signs') {
        if (!Array.isArray(v) || v.length > 2) bad('scene.signs : 0 à 2 panneaux');
        else for (const s of v) if (!fs.existsSync(path.join(PUB, 'signs', s + '.svg'))) bad(`panneau de scène absent ${s}`);
      } else if (!SCENE[k]?.includes(v)) bad(`scene.${k} = ${JSON.stringify(v)} invalide`);
    }
    if (!q.scene.road) bad('scene.road manquant');
  }
  // la longueur ne doit pas trahir la bonne réponse
  for (const g of q.sub ? [[0, 1], [2, 3]] : [q.a.map((_, i) => i)]) {
    const good = g.filter(i => q.ok.includes(i)).map(i => q.a[i].length), wrong = g.filter(i => !q.ok.includes(i)).map(i => q.a[i].length);
    if (good.length && wrong.length && Math.max(...good) >= Math.max(...wrong) * 1.3 && Math.max(...good) - Math.max(...wrong) >= 12) bad('bonne réponse nettement plus longue que les autres');
  }
}
const single = questions.filter(q => !q.sub && q.ok.length === 1);
const longest = single.filter(q => q.a[q.ok[0]].length === Math.max(...q.a.map(x => x.length))).length;
if (longest > single.length * 0.4) problems.push(`bonne réponse = la plus longue dans ${longest}/${single.length} questions à réponse unique (max 40 %)`);
if (problems.length) console.log(problems.join('\n'));
assert.equal(problems.length, 0, `${problems.length} problème(s) dans la banque de questions`);
const perTheme = {};
for (const q of questions) perTheme[q.theme] = (perTheme[q.theme] || 0) + 1;
console.log(`✔ ${questions.length} questions valides`, perTheme);

// --- API ---
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
let cookie = '';
async function call(p, body, extra = {}) {
  const res = await fetch(base + p, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { cookie } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json() };
}
try {
  assert.equal((await call('/api/me')).status, 401);
  assert.equal((await call('/api/register', { username: 'ab', password: 'motdepasse' })).status, 400, 'identifiant trop court');
  assert.equal((await call('/api/register', { username: 'leo', password: 'court' })).status, 400, 'mot de passe trop court');
  assert.equal((await call('/api/register', { username: 'leo', password: 'motdepasse1' })).status, 200);
  assert.equal((await call('/api/register', { username: 'LEO', password: 'motdepasse1' })).status, 409, 'doublon insensible à la casse');
  assert.equal((await call('/api/me')).data.username, 'leo');

  // CSRF : un POST sans JSON est refusé
  const form = await fetch(base + '/api/reset', { method: 'POST', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
  assert.equal(form.status, 415);

  const [q1, q2] = questions;
  assert.equal((await call('/api/results', { answers: [{ id: 'inexistante', ok: true }] })).status, 400);
  const r = await call('/api/results', { exam: true, answers: [{ id: q1.id, ok: true }, { id: q2.id, ok: false }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.errors.map(e => e.id), [q2.id]);
  assert.ok(Math.abs(r.data.errors[0].at - Date.now()) < 60e3, "date de l'erreur enregistrée");
  assert.equal(r.data.attempts[0].score, 1);
  assert.equal((await call('/api/attempt', { score: 41, total: 40 })).status, 400, 'score impossible refusé');
  assert.equal((await call('/api/attempt', { score: 36, total: 40 })).data.attempts[0].score, 36);
  // repasser la question ratée et la réussir la retire des erreurs
  assert.deepEqual((await call('/api/results', { answers: [{ id: q2.id, ok: true }] })).data.errors, []);

  // mot de passe, déconnexion, connexion
  assert.equal((await call('/api/password', { current: 'faux', next: 'nouveaumdp1' })).status, 403);
  assert.equal((await call('/api/password', { current: 'motdepasse1', next: 'nouveaumdp1' })).status, 200);
  await call('/api/logout', {});
  assert.equal((await call('/api/me')).status, 401);
  assert.equal((await call('/api/login', { username: 'leo', password: 'motdepasse1' })).status, 401);
  assert.equal((await call('/api/login', { username: 'Leo', password: 'nouveaumdp1' })).status, 200);
  assert.equal((await call('/api/me')).data.stats.seen, 2);

  // contact : validation puis 503 tant que l'envoi n'est pas configuré
  assert.equal((await call('/api/contact', { name: 'A', email: 'pas-un-mail', message: 'bonjour à toi' })).status, 400);
  assert.equal((await call('/api/contact', { name: 'A', email: 'a@b.fr\r\nBcc: x@y.fr', message: 'bonjour à toi' })).status, 400, "injection d'en-tête refusée");
  assert.equal((await call('/api/contact', { name: 'A', email: 'a@b.fr', message: 'bonjour à toi', website: 'spam' })).status, 200, 'robot ignoré');
  assert.equal((await call('/api/contact', { name: 'A', email: 'a@b.fr', message: 'bonjour à toi' })).status, 503);

  // fichiers statiques et traversée de répertoire
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/..%2fserver.js')).status, 403);

  // suppression du compte
  assert.equal((await call('/api/delete-account', { password: 'faux' })).status, 403);
  assert.equal((await call('/api/delete-account', { password: 'nouveaumdp1' })).status, 200);
  assert.equal((await call('/api/login', { username: 'leo', password: 'nouveaumdp1' })).status, 401);
  console.log('✔ API : comptes, résultats, mot de passe, suppression, sécurité');
} finally {
  server.close();
}
