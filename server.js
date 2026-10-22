// Serveur du site d'entraînement au code : comptes, questions, statistiques. Aucune dépendance (Node >= 22.13).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ROOT = import.meta.dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const SESSION_DAYS = 30;
const scrypt = promisify(crypto.scrypt);

// --- Questions (data/questions/*.json) ---
const QDIR = path.join(ROOT, 'data', 'questions');
export const questions = fs.readdirSync(QDIR).filter(f => f.endsWith('.json')).sort()
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(QDIR, f), 'utf8')));
const byId = new Map(questions.map(q => [q.id, q]));
const creditsFile = path.join(ROOT, 'data', 'photos-credits.json');
const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, 'utf8')) : [];

// --- Base de données ---
const db = new DatabaseSync(process.env.DB_FILE || path.join(ROOT, 'data', 'app.db'));
db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, hash TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, score INTEGER NOT NULL, total INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS stats (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, qid TEXT NOT NULL, seen INTEGER NOT NULL, wrong INTEGER NOT NULL, last_ok INTEGER NOT NULL, PRIMARY KEY (user_id, qid));
`);
// wrong_at : date de la dernière erreur (le mode erreurs attend 24 h avant de reproposer la question)
if (!db.prepare('PRAGMA table_info(stats)').all().some(c => c.name === 'wrong_at')) db.exec('ALTER TABLE stats ADD COLUMN wrong_at INTEGER NOT NULL DEFAULT 0');
const sql = {
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  addUser: db.prepare('INSERT INTO users (username, hash, created) VALUES (?, ?, ?)'),
  setHash: db.prepare('UPDATE users SET hash = ? WHERE id = ?'),
  delUser: db.prepare('DELETE FROM users WHERE id = ?'),
  addSession: db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)'),
  session: db.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires > ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  delOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?'),
  purgeSessions: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
  addAttempt: db.prepare('INSERT INTO attempts (user_id, score, total, created) VALUES (?, ?, ?, ?)'),
  attempts: db.prepare('SELECT score, total, created FROM attempts WHERE user_id = ? ORDER BY id DESC LIMIT 30'),
  stats: db.prepare('SELECT qid, seen, wrong, last_ok, wrong_at FROM stats WHERE user_id = ?'),
  upsertStat: db.prepare(`INSERT INTO stats (user_id, qid, seen, wrong, last_ok, wrong_at) VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT (user_id, qid) DO UPDATE SET seen = seen + 1, wrong = wrong + excluded.wrong, last_ok = excluded.last_ok,
      wrong_at = CASE WHEN excluded.last_ok = 0 THEN excluded.wrong_at ELSE stats.wrong_at END`),
  resetStats: db.prepare('DELETE FROM stats WHERE user_id = ?'),
  resetAttempts: db.prepare('DELETE FROM attempts WHERE user_id = ?'),
};
sql.purgeSessions.run(Date.now());

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + (await scrypt(pw, salt, 64)).toString('hex');
}
async function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const got = await scrypt(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));

// Anti force brute : 8 échecs -> blocage 15 min (par identifiant).
// shortcut: compteur en mémoire, remis à zéro au redémarrage ; suffisant pour un seul serveur.
const failures = new Map();
const blocked = key => (failures.get(key)?.until ?? 0) > Date.now();
function fail(key) {
  const f = failures.get(key) ?? { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 8) { f.until = Date.now() + 15 * 60e3; f.n = 0; }
  failures.set(key, f);
}

// Limite de débit par IP sur connexion et inscription (chaque appel coûte un scrypt).
// shortcut: en mémoire, par processus ; derrière un proxy, définir TRUST_PROXY=1 pour lire X-Forwarded-For.
const hits = new Map();
const clientIp = req => (process.env.TRUST_PROXY && req.headers['x-forwarded-for']?.split(',').at(-1).trim()) || req.socket.remoteAddress;
function rateLimit(req, max = 20, windowMs = 60e3, bucket = 'auth') {
  const key = bucket + ' ' + clientIp(req), now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) return void hits.set(key, { n: 1, reset: now + windowMs });
  if (++h.n > max) throw new HttpError(429, 'Trop de requêtes, réessayez plus tard');
}

// --- Formulaire de contact : envoi par msmtp (configuré dans /etc/msmtprc sur le serveur) ---
const CONTACT_TO = process.env.CONTACT_TO;
const oneLine = s => String(s).replace(/[\r\n\t]+/g, ' ').trim();
function sendMail({ replyTo, subject, text }) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.MSMTP || '/usr/bin/msmtp', ['-t'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error('msmtp ' + code + ' ' + err))));
    const b64 = s => `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;
    p.stdin.end(`To: ${CONTACT_TO}\r\nReply-To: ${replyTo}\r\nSubject: ${b64(subject)}\r\nMIME-Version: 1.0\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${text.replace(/\r?\n/g, '\r\n')}\r\n`);
  });
}
setInterval(() => {
  const now = Date.now();
  for (const [k, f] of failures) if (f.until < now && f.n === 0) failures.delete(k);
  for (const [k, h] of hits) if (h.reset < now) hits.delete(k);
}, 5 * 60e3).unref();

// --- HTTP ---
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const send = (res, status, data, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
};
function readJson(req) {
  // Exiger du JSON bloque les formulaires d'autres sites (protection CSRF avec SameSite=Lax).
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'JSON attendu');
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 1e6) { reject(new HttpError(413, 'Requête trop grosse')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(new HttpError(400, 'JSON invalide')); } });
    req.on('error', reject);
  });
}
const cookieToken = req => /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
function sessionCookie(req, token, maxAge) {
  const secure = /^https\b/.test(req.headers['x-forwarded-proto'] || '') ? '; Secure' : '';
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
function currentUser(req) {
  const token = cookieToken(req);
  const row = token && sql.session.get(sha(token), Date.now());
  return row ? sql.userById.get(row.user_id) : null;
}
function needUser(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Non connecté');
  return u;
}
function openSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sql.addSession.run(sha(token), userId, Date.now() + SESSION_DAYS * 864e5);
  res.setHeader('Set-Cookie', sessionCookie(req, token, SESSION_DAYS * 86400));
}
function validCredentials(username, password) {
  if (typeof username !== 'string' || !/^[\p{L}\p{N}_.-]{3,30}$/u.test(username))
    throw new HttpError(400, "Identifiant : 3 à 30 caractères (lettres, chiffres, . _ -)");
  validPassword(password);
}
function validPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 200) throw new HttpError(400, 'Mot de passe : 8 caractères minimum');
}

function userStats(userId) {
  const rows = sql.stats.all(userId).filter(r => byId.has(r.qid));
  const themes = {};
  for (const q of questions) (themes[q.theme] ??= { total: 0, seen: 0, mastered: 0 }).total++;
  for (const r of rows) {
    const t = themes[byId.get(r.qid).theme];
    t.seen++;
    if (r.last_ok) t.mastered++;
  }
  return {
    attempts: sql.attempts.all(userId),
    themes,
    errors: rows.filter(r => !r.last_ok).map(r => ({ id: r.qid, at: r.wrong_at })),
    seenIds: rows.map(r => r.qid),
    seen: rows.length,
    total: questions.length,
  };
}

const api = {
  'GET /api/questions': () => questions,
  'GET /api/credits': () => credits,
  'GET /api/me': req => {
    const u = needUser(req);
    return { username: u.username, created: u.created, stats: userStats(u.id) };
  },
  'POST /api/register': async (req, res) => {
    rateLimit(req, 10);
    const { username, password } = await readJson(req);
    validCredentials(username, password);
    if (sql.userByName.get(username)) throw new HttpError(409, 'Cet identifiant est déjà pris');
    const { lastInsertRowid } = sql.addUser.run(username, await hashPassword(password), Date.now());
    openSession(req, res, Number(lastInsertRowid));
    return { ok: true };
  },
  'POST /api/login': async (req, res) => {
    rateLimit(req);
    const { username, password } = await readJson(req);
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 30 || password.length > 200) throw new HttpError(400, 'Identifiant et mot de passe requis');
    const key = username.toLowerCase();
    if (blocked(key)) throw new HttpError(429, 'Trop de tentatives, réessayez dans 15 minutes');
    fail(key); // compté avant l'attente du scrypt : des essais en parallèle ne contournent pas le blocage
    const u = sql.userByName.get(username);
    // empreinte factice : même durée de calcul que l'identifiant existe ou non
    if (!(await checkPassword(password, u?.hash ?? DUMMY_HASH)) || !u) throw new HttpError(401, 'Identifiant ou mot de passe incorrect');
    failures.delete(key);
    openSession(req, res, u.id);
    return { ok: true };
  },
  'POST /api/logout': (req, res) => {
    const token = cookieToken(req);
    if (token) sql.delSession.run(sha(token));
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    return { ok: true };
  },
  'POST /api/results': async req => {
    const u = needUser(req);
    const { exam, answers } = await readJson(req);
    if (!Array.isArray(answers) || answers.length === 0 || answers.length > 200) throw new HttpError(400, 'Réponses invalides');
    const valid = answers.filter(a => byId.has(a?.id) && typeof a.ok === 'boolean');
    if (valid.length !== answers.length) throw new HttpError(400, 'Réponses invalides');
    db.exec('BEGIN');
    try {
      const now = Date.now();
      for (const a of valid) sql.upsertStat.run(u.id, a.id, a.ok ? 0 : 1, a.ok ? 1 : 0, a.ok ? 0 : now);
      if (exam === true) sql.addAttempt.run(u.id, valid.filter(a => a.ok).length, valid.length, Date.now());
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return userStats(u.id);
  },
  // Formulaire de contact des deux sites (leodev.fr passe par le même serveur via Caddy).
  'POST /api/contact': async req => {
    rateLimit(req, 5, 60 * 60e3, 'contact');
    const { name, email, message, site, website } = await readJson(req);
    if (website) return { ok: true }; // champ piège invisible rempli : robot, on ignore sans le dire
    if (typeof name !== 'string' || !oneLine(name) || name.length > 80) throw new HttpError(400, 'Indique ton nom (80 caractères max).');
    if (typeof email !== 'string' || email.length > 120 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) throw new HttpError(400, 'Adresse e-mail invalide.');
    if (typeof message !== 'string' || message.trim().length < 10 || message.length > 4000) throw new HttpError(400, 'Message : entre 10 et 4 000 caractères.');
    const from = site === 'leodev.fr' ? 'leodev.fr' : 'claudio.leodev.fr';
    if (!CONTACT_TO) throw new HttpError(503, "Le formulaire n'est pas encore configuré.");
    try {
      await sendMail({ replyTo: email, subject: `[${from}] Message de ${oneLine(name)}`, text: `De : ${oneLine(name)} <${email}>\nSite : ${from}\n\n${message.trim()}` });
    } catch (e) { console.error(e); throw new HttpError(502, "L'envoi a échoué, réessaie plus tard."); }
    return { ok: true };
  },
  // Score d'un examen blanc terminé ; les réponses elles-mêmes sont envoyées une par une via /api/results.
  'POST /api/attempt': async req => {
    const u = needUser(req);
    const { score, total } = await readJson(req);
    if (!Number.isInteger(score) || !Number.isInteger(total) || total < 1 || total > 200 || score < 0 || score > total) throw new HttpError(400, 'Score invalide');
    sql.addAttempt.run(u.id, score, total, Date.now());
    return userStats(u.id);
  },
  'POST /api/password': async req => {
    const u = needUser(req);
    const { current, next } = await readJson(req);
    validPassword(next);
    if (typeof current !== 'string' || !(await checkPassword(current, u.hash))) throw new HttpError(403, 'Mot de passe actuel incorrect');
    sql.setHash.run(await hashPassword(next), u.id);
    sql.delOtherSessions.run(u.id, sha(cookieToken(req)));
    return { ok: true };
  },
  'POST /api/reset': async req => {
    const u = needUser(req);
    await readJson(req);
    sql.resetStats.run(u.id);
    sql.resetAttempts.run(u.id);
    return userStats(u.id);
  },
  'POST /api/delete-account': async (req, res) => {
    const u = needUser(req);
    const { password } = await readJson(req);
    if (typeof password !== 'string' || !(await checkPassword(password, u.hash))) throw new HttpError(403, 'Mot de passe incorrect');
    sql.delUser.run(u.id);
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    return { ok: true };
  },
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

function serveStatic(req, res) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(PUBLIC, url === '/' ? 'index.html' : url);
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: 'Interdit' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'Introuvable' });
    // SVG venant de Wikimedia : CSP stricte pour qu'ils ne puissent jamais exécuter de script même ouverts directement.
    const extra = file.endsWith('.svg') ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }
      : file.endsWith('.html') ? {
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      } : {};
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': /\.(html|js|css)$/.test(file) ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', ...extra });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

export const server = http.createServer(async (req, res) => {
  try {
    const route = api[`${req.method} ${new URL(req.url, 'http://x').pathname}`];
    if (!route) return req.url.startsWith('/api/') ? send(res, 404, { error: 'Introuvable' }) : serveStatic(req, res);
    send(res, 200, await route(req, res));
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) send(res, e.status || 400, { error: e.status ? e.message : 'Requête invalide' });
  }
});

if (process.argv[1] === import.meta.filename) {
  server.listen(PORT, process.env.HOST, () => console.log(`Code de la route : http://localhost:${PORT}  (${questions.length} questions)`));
}
