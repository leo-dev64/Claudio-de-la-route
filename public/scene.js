// Dessine une scène de conduite vue du siège conducteur à partir d'une description `scene` (voir README).
// Projection en perspective simple : x écran = VX + F·x/z, y écran = VY + F·H/z (x latéral, z distance, en mètres).
const W = 800, HT = 450, VX = 400, VY = 190, F = 520, CAM = 1.3;
const LANE = 3.5;

const P = (x, z, h = 0) => [VX + (F * x) / z, VY + (F * (CAM - h)) / z];
const pts = a => a.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
const poly = (a, fill, extra = '') => `<polygon points="${pts(a)}" fill="${fill}" ${extra}/>`;
// Bande au sol entre les abscisses x1 et x2, de z1 à z2.
const strip = (x1, x2, z1, z2, fill, extra) => poly([P(x1, z1), P(x2, z1), P(x2, z2), P(x1, z2)], fill, extra);

function rng(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Géométrie de chaque type de route : voies (x de gauche à droite), lignes, bas-côtés. Ma voie est centrée en x = 0.
function layout(road) {
  const h = LANE / 2;
  switch (road) {
    case 'autoroute': return { left: -h - 2 * LANE, right: h, bau: 3, lanes: [-h - LANE, -h], median: true, kind: 'auto' };
    case '2x2': return { left: -h - LANE, right: h, bau: 1.5, lanes: [-h], median: true, kind: 'auto' };
    case 'agglo': return { left: -h - 3.2, right: h, center: -h, sidewalk: 3, kind: 'ville' };
    default: return { left: -h - LANE, right: h, center: -h, shoulder: 1.2, kind: 'campagne' };
  }
}

function palette(s) {
  const night = s.time === 'nuit';
  const p = {
    sky: night ? ['#05070f', '#1a2238'] : ['#6fb1f2', '#d7ecff'],
    grass: night ? '#0d160d' : '#6c9a45',
    road: night ? '#1c1d21' : '#5f6166',
    line: night ? '#c9c9c9' : '#f4f4f4',
    sidewalk: night ? '#2a2a2e' : '#a9a7a2',
    building: night ? ['#15161c', '#1d1f27', '#191a22'] : ['#d9c9b0', '#c7b8a5', '#e4d8c6'],
    window: night ? '#e8c46a' : '#7d93a8',
  };
  if (s.weather === 'pluie') Object.assign(p, { sky: night ? ['#06080c', '#171b22'] : ['#6b7682', '#a9b2bb'], road: night ? '#16171a' : '#4a4c50' });
  if (s.weather === 'brouillard') Object.assign(p, { sky: night ? ['#202328', '#30343a'] : ['#c4c8cc', '#dfe2e4'] });
  if (s.weather === 'neige') Object.assign(p, { sky: night ? ['#0c0f16', '#272c38'] : ['#aeb8c2', '#e3e8ec'], grass: night ? '#5d6470' : '#eef2f5', road: night ? '#2b2d33' : '#7d8086' });
  return p;
}

// --- Véhicules vus de dos (ou de face pour ceux qui arrivent en sens inverse) ---
function vehicle(type, x, z, night, front = false) {
  const [cx, by] = P(x, z);
  const s = F / z; // pixels par mètre à cette distance
  const g = [];
  const r = (x0, y0, w, h, fill, rx = 0) => g.push(`<rect x="${(cx + x0 * s).toFixed(1)}" y="${(by - (y0 + h) * s).toFixed(1)}" width="${(w * s).toFixed(1)}" height="${(h * s).toFixed(1)}" rx="${(rx * s).toFixed(1)}" fill="${fill}"/>`);
  const c = (x0, y0, rad, fill, extra = '') => g.push(`<circle cx="${(cx + x0 * s).toFixed(1)}" cy="${(by - y0 * s).toFixed(1)}" r="${Math.max(0.6, rad * s).toFixed(1)}" fill="${fill}" ${extra}/>`);
  const light = (x0, y0, w, h) => {
    if (front) {
      if (night) c(x0 + w / 2, y0 + h / 2, 0.9, 'url(#glare)');
      r(x0, y0, w, h, night ? '#fffbe8' : '#e8edf2', 0.05);
    } else {
      if (night) c(x0 + w / 2, y0 + h / 2, 0.6, 'url(#redglow)');
      r(x0, y0, w, h, night ? '#ff3b30' : '#c0261d', 0.04);
    }
  };
  const shade = night ? 0.35 : 1;
  const col = hex => night ? mix(hex, '#000', 1 - shade) : hex;
  switch (type) {
    case 'camion':
      r(-1.25, 0.35, 2.5, 3.4, col('#e9e9e9'), 0.05);
      r(-1.25, 0.35, 2.5, 0.25, col('#555'));
      r(-0.35, 0.6, 0.7, 0.3, col('#f2d43c'));
      light(-1.2, 0.65, 0.3, 0.18); light(0.9, 0.65, 0.3, 0.18);
      r(-1.1, 0, 0.5, 0.45, '#111', 0.1); r(0.6, 0, 0.5, 0.45, '#111', 0.1);
      break;
    case 'bus':
      r(-1.25, 0.3, 2.5, 2.9, col('#2f7d4f'), 0.15);
      r(-1.05, 1.55, 2.1, 1.2, col('#1b2a33'), 0.1);
      r(-0.6, 2.8, 1.2, 0.28, night ? '#ffb000' : '#222');
      light(-1.15, 0.6, 0.3, 0.22); light(0.85, 0.6, 0.3, 0.22);
      r(-1.1, 0, 0.5, 0.4, '#111', 0.1); r(0.6, 0, 0.5, 0.4, '#111', 0.1);
      break;
    case 'moto':
      r(-0.12, 0, 0.24, 0.65, '#111', 0.1);
      r(-0.32, 0.55, 0.64, 0.35, col('#333'), 0.1);
      r(-0.28, 0.85, 0.56, 0.6, col('#24324a'), 0.2);
      c(0, 1.65, 0.17, col('#e6e6e6'));
      light(-0.08, 0.6, 0.16, 0.1);
      break;
    case 'cycliste':
      r(-0.03, 0, 0.06, 0.7, '#111');
      r(-0.22, 0.75, 0.44, 0.65, col('#e2572b'), 0.18);
      c(0, 1.55, 0.13, col('#f4d23c'));
      r(-0.03, 0.45, 0.06, 0.06, front ? '#fffbe8' : night ? '#ff3b30' : '#b11');
      break;
    case 'tracteur':
      r(-1.1, 0.4, 2.2, 1.2, col('#2d8a35'), 0.1);
      r(-0.7, 1.6, 1.4, 1.1, col('#9fb7c4'), 0.05);
      r(-0.75, 2.7, 1.5, 0.12, col('#2d8a35'));
      c(0, 2.95, 0.14, '#ff9500', night ? 'filter="url(#blur)"' : '');
      r(-1.35, 0, 0.6, 1.4, '#151515', 0.25); r(0.75, 0, 0.6, 1.4, '#151515', 0.25);
      r(-0.55, 0.5, 1.1, 0.32, '#f39c12');
      break;
    default: { // voiture
      const body = front ? '#2b5ea8' : '#b8bec6';
      r(-0.9, 0.25, 1.8, 0.75, col(body), 0.18);
      r(-0.72, 0.95, 1.44, 0.55, col(body), 0.2);
      r(-0.62, 1.0, 1.24, 0.42, col('#2a3540'), 0.12);
      light(-0.86, 0.62, 0.32, 0.16); light(0.54, 0.62, 0.32, 0.16);
      r(-0.26, 0.38, 0.52, 0.12, col('#f4f4f4'));
      r(-0.85, 0, 0.32, 0.28, '#111', 0.06); r(0.53, 0, 0.32, 0.28, '#111', 0.06);
    }
  }
  return g.join('');
}

function pedestrian(x, z, night) {
  const [cx, by] = P(x, z);
  const s = F / z, k = v => (v * s).toFixed(1);
  const coat = night ? '#2c2c34' : '#c0392b';
  return `<g transform="translate(${cx.toFixed(1)},${by.toFixed(1)})">
    <rect x="${k(-0.1)}" y="${k(-0.85)}" width="${k(0.08)}" height="${k(0.85)}" fill="#22252e" transform="rotate(-12)"/>
    <rect x="${k(0.03)}" y="${k(-0.85)}" width="${k(0.08)}" height="${k(0.85)}" fill="#22252e" transform="rotate(14)"/>
    <rect x="${k(-0.2)}" y="${k(-1.5)}" width="${k(0.4)}" height="${k(0.7)}" rx="${k(0.08)}" fill="${coat}"/>
    <circle cx="0" cy="${k(-1.63)}" r="${k(0.12)}" fill="#e0b48a"/></g>`;
}

function mix(a, b, t) {
  const h = x => [1, 3, 5].map(i => parseInt(x.length === 4 ? x[Math.ceil(i / 2)].repeat(2) : x.slice(i, i + 2), 16));
  const [A, B] = [h(a), h(b)];
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function sign(code, x, z) {
  const [px, py] = P(x, z);
  const s = F / z, size = 0.75 * s, top = py - 2.3 * s;
  return `<rect x="${(px - 0.04 * s).toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(1, 0.08 * s).toFixed(1)}" height="${(2.3 * s).toFixed(1)}" fill="#8d9399"/>`
    + `<image href="signs/${encodeURIComponent(code)}.svg" x="${(px - size / 2).toFixed(1)}" y="${(top - size * 0.9).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}"/>`;
}

function tree(x, z, p, night) {
  const [cx, by] = P(x, z);
  const s = F / z;
  const leaf = night ? '#0a120a' : p.grass === '#eef2f5' ? '#dfe6ea' : '#3e6b2c';
  return `<rect x="${(cx - 0.15 * s).toFixed(1)}" y="${(by - 2.5 * s).toFixed(1)}" width="${(0.3 * s).toFixed(1)}" height="${(2.5 * s).toFixed(1)}" fill="${night ? '#0b0b0b' : '#5b4128'}"/>`
    + `<ellipse cx="${cx.toFixed(1)}" cy="${(by - 4 * s).toFixed(1)}" rx="${(1.6 * s).toFixed(1)}" ry="${(2.1 * s).toFixed(1)}" fill="${leaf}"/>`;
}

let uid = 0;
export function renderScene(s, seed = JSON.stringify(s)) {
  const rand = rng(seed);
  const L = layout(s.road);
  const p = palette(s);
  const night = s.time === 'nuit';
  const far = 400, near = 2.2;
  const out = [];
  const roadL = L.left, roadR = L.right + (L.bau || 0);
  const iz = 22, iw = 7; // route qui débouche : de z = iz à iz + iw
  const sides = { droite: [1], gauche: [-1], croix: [-1, 1] }[s.intersection] || [];
  const crossing = (side, z1, z2) => sides.includes(side) && z2 > iz - 1 && z1 < iz + iw + 1;

  // Ciel, sol
  out.push(`<rect width="${W}" height="${VY + 1}" fill="url(#sky)"/>`);
  if (night && s.weather !== 'pluie' && s.weather !== 'brouillard')
    for (let i = 0; i < 40; i++) out.push(`<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * (VY - 20)).toFixed(0)}" r="${(rand() * 1.1 + 0.3).toFixed(1)}" fill="#fff" opacity="${(rand() * 0.6 + 0.2).toFixed(2)}"/>`);
  if (L.kind !== 'ville') out.push(`<path d="M0 ${VY} Q120 ${VY - 28} 260 ${VY - 8} T520 ${VY - 14} T800 ${VY - 4} V${VY + 1} H0Z" fill="${night ? '#0a0d12' : mix(p.grass, '#6d8fa8', 0.5)}"/>`);
  out.push(`<rect y="${VY}" width="${W}" height="${HT - VY}" fill="${L.kind === 'ville' ? p.sidewalk : p.grass}"/>`);

  // Bâtiments et trottoirs en ville
  if (L.kind === 'ville') {
    out.push(strip(roadL - L.sidewalk, roadL, near, far, p.sidewalk), strip(roadR, roadR + L.sidewalk, near, far, p.sidewalk));
    for (const side of [-1, 1]) {
      const x = side < 0 ? roadL - L.sidewalk : roadR + L.sidewalk;
      for (let z = 4, i = 0; z < 160; i++) {
        const h = 9 + rand() * 9;
        let z2 = z + 8 + rand() * 10;
        if (crossing(side, z, z2)) {
          if (z >= iz - 1) { z = iz + iw + 1; continue; }
          z2 = iz - 1; // le bâtiment s'arrête au coin de la rue
        }
        const col = p.building[i % 3];
        out.push(poly([P(x, z), P(x, z2), P(x, z2, h), P(x, z, h)], col, `stroke="${night ? '#0c0c10' : '#9c907f'}" stroke-width="0.6"`));
        for (let fl = 2; fl < h - 1; fl += 3)
          for (let wz = z + 1.5; wz < z2 - 1.5; wz += 3.2)
            if (!night || rand() > 0.45) out.push(poly([P(x, wz, fl), P(x, wz + 1.4, fl), P(x, wz + 1.4, fl + 1.5), P(x, wz, fl + 1.5)], p.window));
        z = z2;
      }
      for (let z = 9; z < 120; z += 26) {
        const lx = side < 0 ? roadL - 0.6 : roadR + 0.6;
        const [a, b] = [P(lx, z), P(lx, z, 6)];
        out.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${night ? '#333' : '#555'}" stroke-width="${Math.max(1, 0.12 * F / z).toFixed(1)}"/>`);
        if (night) out.push(`<circle cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="${(1.6 * F / z).toFixed(1)}" fill="url(#lamp)"/>`);
      }
    }
  } else {
    for (const z of [7, 16, 30, 55, 90, 140]) {
      if (rand() > 0.25 && !crossing(1, z - 3, z + 3)) out.push(tree(roadR + 4 + rand() * 6, z, p, night));
      if (L.kind === 'campagne' && rand() > 0.35 && !crossing(-1, z + 2, z + 8)) out.push(tree(roadL - 4 - rand() * 6, z + 5, p, night));
    }
  }

  // Chaussée
  out.push(strip(roadL, roadR, near, far, p.road));
  if (s.weather === 'pluie') out.push(strip(roadL, roadR, near, 60, 'url(#wet)'));
  if (s.weather === 'neige') out.push(strip(roadL, roadL + 0.8, near, far, '#e9eef2', 'opacity="0.8"'), strip(roadR - 0.6, roadR, near, far, '#e9eef2', 'opacity="0.8"'));

  // Routes qui débouchent (intersection)
  for (const side of sides) {
    const x0 = side > 0 ? roadR : roadL, x1 = side > 0 ? roadR + 60 : roadL - 60;
    out.push(poly([P(x0, iz), P(x1, iz), P(x1, iz + iw), P(x0, iz + iw)], p.road));
  }

  // Marquages
  const dashes = (x, w, dash, gap, z0 = near) => { for (let z = z0; z < 180; z += dash + gap) out.push(strip(x - w / 2, x + w / 2, z, z + dash, p.line)); };
  const solid = (x, w) => out.push(strip(x - w / 2, x + w / 2, near, far, p.line));
  const gapAt = (fn) => { // interrompt les lignes de rive au droit des intersections
    fn(near, iz); fn(iz + iw, far);
  };
  if (L.kind === 'auto') {
    for (const x of L.lanes) dashes(x, 0.15, 3.9, 9);
    solid(L.right, 0.25);
    solid(L.left + 0.1, 0.25);
    // glissières
    for (const x of [roadR + 0.6, L.left - 0.6]) out.push(poly([P(x, near, 0.55), P(x, far, 0.55), P(x, far, 0.8), P(x, near, 0.8)], night ? '#3a3d42' : '#c7ccd1'));
    if (L.median) out.push(strip(L.left - 6, L.left - 0.6, near, far, night ? '#111a11' : '#5b8a3a'));
  } else {
    if (s.line === 'continue') solid(L.center, 0.13);
    else if (s.line !== 'aucune') dashes(L.center, 0.13, 3, 10);
    if (L.kind === 'campagne') {
      if (sides.length) for (const x of [roadL + 0.15, roadR - 0.15]) gapAt((a, b) => out.push(strip(x - 0.06, x + 0.06, a, b, p.line)));
      else for (const x of [roadL + 0.15, roadR - 0.15]) dashes(x, 0.12, 3, 3.5);
    }
  }
  if (s.crosswalk || s.pedestrian) {
    const cz = 13;
    for (let x = roadL + 0.3; x < roadR - 0.3; x += 1) out.push(strip(x, x + 0.5, cz, cz + 3, p.line));
  }

  // Panneaux à droite
  (s.signs || []).slice(0, 2).forEach((code, i) => {
    out.push(sign(code, roadR + (L.kind === 'auto' ? 1.4 : L.kind === 'ville' ? 0.6 : 1.4) + i * 0.1, i ? 38 : 19));
  });

  // Usagers (du plus loin au plus proche)
  const users = [];
  if (s.oncoming && L.kind !== 'auto') users.push([45, () => vehicle(s.oncoming, -LANE, 45, night, true)]);
  if (s.ahead) users.push([s.ahead === 'cycliste' ? 16 : 24, z => vehicle(s.ahead, s.ahead === 'cycliste' ? 1.1 : 0, z, night)]);
  if (s.left && L.kind === 'auto') users.push([14, z => vehicle(s.left, -LANE, z, night)]);
  if (s.pedestrian) users.push([14.5, z => pedestrian(roadR - 1.6, z, night)]);
  users.sort((a, b) => b[0] - a[0]).forEach(([z, draw]) => out.push(draw(z)));

  // Nuit : faisceau des phares
  if (night) out.push(poly([P(-1.6, near), P(1.9, near), P(4, 45), P(-3.2, 45)], 'url(#beam)'));

  // Météo
  if (s.weather === 'brouillard') out.push(`<rect width="${W}" height="${HT}" fill="url(#fog)"/>`);
  if (s.weather === 'pluie') {
    for (let i = 0; i < 170; i++) {
      const x = rand() * W, y = rand() * HT, l = 10 + rand() * 18;
      out.push(`<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x - l * 0.25).toFixed(0)}" y2="${(y + l).toFixed(0)}" stroke="#dfe8f2" stroke-width="1" opacity="${(0.25 + rand() * 0.35).toFixed(2)}"/>`);
    }
    for (let i = 0; i < 45; i++) out.push(`<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * 380).toFixed(0)}" r="${(1.5 + rand() * 4).toFixed(1)}" fill="#fff" opacity="0.18" stroke="#fff" stroke-opacity="0.3"/>`);
  }
  if (s.weather === 'neige')
    for (let i = 0; i < 140; i++) out.push(`<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * HT).toFixed(0)}" r="${(1 + rand() * 2.6).toFixed(1)}" fill="#fff" opacity="${(0.55 + rand() * 0.4).toFixed(2)}"/>`);

  // Capot et bas du pare-brise
  out.push(`<path d="M0 ${HT} V418 Q400 372 800 418 V${HT}Z" fill="${night ? '#07080a' : '#23282f'}"/>`,
    `<path d="M70 ${HT} Q400 395 730 ${HT}" fill="none" stroke="${night ? '#16181c' : '#3a414b'}" stroke-width="3"/>`);
  if (s.weather === 'pluie') out.push(`<path d="M150 432 L430 300" stroke="#0b0b0b" stroke-width="5" stroke-linecap="round"/>`);

  const defs = `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient>
    <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${night ? '#3a3e44' : '#e9ecee'}" stop-opacity="0.75"/><stop offset="0.42" stop-color="${night ? '#3a3e44' : '#e9ecee'}" stop-opacity="0.92"/><stop offset="1" stop-color="${night ? '#3a3e44' : '#e9ecee'}" stop-opacity="0.25"/></linearGradient>
    <linearGradient id="wet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb3c8" stop-opacity="0.05"/><stop offset="1" stop-color="#9fb3c8" stop-opacity="0.28"/></linearGradient>
    <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff6d5" stop-opacity="0.32"/><stop offset="1" stop-color="#fff6d5" stop-opacity="0"/></linearGradient>
    <radialGradient id="glare"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.3" stop-color="#fff7d6" stop-opacity="0.7"/><stop offset="1" stop-color="#fff7d6" stop-opacity="0"/></radialGradient>
    <radialGradient id="redglow"><stop offset="0" stop-color="#ff4b3a" stop-opacity="0.9"/><stop offset="1" stop-color="#ff4b3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="lamp"><stop offset="0" stop-color="#ffe7a3" stop-opacity="1"/><stop offset="1" stop-color="#ffe7a3" stop-opacity="0"/></radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="2"/></filter></defs>`;
  // Préfixe unique des id : plusieurs scènes coexistent sur la page de correction.
  const pre = `sc${++uid}-`;
  return `<svg viewBox="0 0 ${W} ${HT}" xmlns="http://www.w3.org/2000/svg" role="img">${defs}${out.join('')}</svg>`.replace(/(id="|url\(#)/g, `$1${pre}`);
}
