import * as THREE from 'three';

/* =====================================================================
   Along! — Berger to Wuse
   A shared-taxi runner for start.ng. Static files only.
   Inspired by everyday Abuja commuting. Not affiliated with any transport
   operator or app.
   ===================================================================== */

/* ---------------------------------------------------------------
   start.ng connect page (pattern from https://start.ng/docs.md)
   --------------------------------------------------------------- */
const START_NG = 'https://start.ng';
let connectP;

function connectFrame() {
  connectP ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return connectP;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sends a message and resolves to start.ng's reply, or null if it didn't answer.
async function askStartNg(message, replyType, timeoutMs = 5000) {
  let el;
  try {
    el = await Promise.race([connectFrame(), sleep(timeoutMs).then(() => null)]);
  } catch (e) {
    return null;
  }
  if (!el) return null;
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}

/* ---------------------------------------------------------------
   Player + character style
   --------------------------------------------------------------- */
const HEX = /^#[0-9a-fA-F]{6}$/;
const HAIRS = ['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald'];
const HATS = ['none', 'cap', 'beanie', 'tophat', 'crown'];
const ACCESSORIES = ['none', 'glasses', 'earrings', 'beard', 'scarf', 'backpack'];

const DEFAULT_STYLE = {
  body: 'male',
  primaryColor: '#2f9e6a',
  secondaryColor: '#2b2f4a',
  skinColor: '#8d5524',
  hairColor: '#17120f',
  hair: 'short',
  hat: 'none',
  accessory: 'none',
};

function sanitizeStyle(style) {
  const s = style && typeof style === 'object' ? style : {};
  const color = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  return {
    body: s.body === 'female' ? 'female' : 'male',
    primaryColor: color(s.primaryColor, DEFAULT_STYLE.primaryColor),
    secondaryColor: color(s.secondaryColor, DEFAULT_STYLE.secondaryColor),
    skinColor: color(s.skinColor, DEFAULT_STYLE.skinColor),
    hairColor: color(s.hairColor, DEFAULT_STYLE.hairColor),
    hair: pick(s.hair, HAIRS, 'short'),
    hat: pick(s.hat, HATS, 'none'),
    accessory: pick(s.accessory, ACCESSORIES, 'none'),
  };
}

let player = {
  id: null,
  name: 'Guest',
  account: null,
  style: sanitizeStyle(DEFAULT_STYLE),
  face: null,
  signedIn: false,
};

const $ = (id) => document.getElementById(id);
const signInHref = () => `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;

async function refreshPlayer() {
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user', 3500);
  if (!reply) return; // start.ng didn't answer (for example when opened as a local file): keep the guest look
  const p = reply.user ?? reply.guest ?? {};
  player = {
    id: reply.user?.id ?? null,
    name: String(p.name ?? 'Guest').slice(0, 40),
    account: reply.user?.account ? String(reply.user.account).slice(0, 40) : null,
    style: sanitizeStyle(p.style),
    face: typeof p.face === 'string' && p.face.startsWith('data:image/') ? p.face : null,
    signedIn: !!reply.user,
  };
  applyPlayer();
}

function applyPlayer() {
  $('playerName').textContent = player.name;
  $('playerAccount').textContent = player.account ? `@${player.account}` : 'Not signed in';
  const img = $('playerFace');
  if (player.face) {
    img.src = player.face;
    img.hidden = false;
  } else {
    img.hidden = true;
  }
  for (const id of ['signInTitle', 'signInOver']) {
    $(id).hidden = player.signedIn;
    $(id).href = signInHref();
  }
  setDriver();
}

const clampInt = (n) => Math.min(1_000_000_000, Math.max(0, Math.floor(Number(n) || 0)));

async function saveRun(stats) {
  if (!player.signedIn) return { ok: false, reason: 'guest' };
  const clean = { fares: clampInt(stats.fares), passengers: clampInt(stats.passengers) };
  const reply = await askStartNg({ type: 'startng:score', stats: clean }, 'startng:scoreSaved', 6000);
  if (!reply) return { ok: false, reason: 'offline' };
  if (reply.ok) return { ok: true, ...reply.result };
  return { ok: false, reason: 'error', error: reply.error };
}

async function loadBoard(limit = 5) {
  const reply = await askStartNg({ type: 'startng:leaderboard', limit }, 'startng:leaderboardData', 6000);
  return reply?.ok && Array.isArray(reply.entries) ? reply.entries : null;
}

/* ---------------------------------------------------------------
   Game constants
   --------------------------------------------------------------- */
const LANES = [-3.4, 0, 3.4];
const BAY_X = -6.1;
const STOPS = [
  { name: 'Berger', short: 'Berger', color: '#ff6b6b' },
  { name: 'Area 1', short: 'Area 1', color: '#e8a317' },
  { name: 'Banex', short: 'Banex', color: '#2aa6d1' },
  { name: 'Wuse Zone 4', short: 'Zone 4', color: '#18a77a' },
  { name: 'Wuse Market', short: 'Market', color: '#9b59d0' },
];
const SEATS = 4;
const FAR = -170;
const TIPS = [
  'Real-life tip: board only painted, registered green-and-white taxis.',
  'Real-life tip: check the cab colour and registration before you get in.',
  'Real-life tip: tell someone your route when you ride at night.',
  'Real-life tip: keep small change handy for the driver.',
];

/* ---------------------------------------------------------------
   Three.js setup
   --------------------------------------------------------------- */
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = new THREE.Color('#bfe3f5');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 70, 190);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight('#ffffff', '#9bb58a', 1.05));
const sun = new THREE.DirectionalLight('#fff4d6', 1.15);
sun.position.set(-20, 40, 12);
scene.add(sun);

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 72 : 62;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ---------------------------------------------------------------
   Characters (drawn from the start.ng style fields)
   --------------------------------------------------------------- */
function makeCharacter(styleIn) {
  const s = sanitizeStyle(styleIn);
  const g = new THREE.Group();
  const skin = mat(s.skinColor);
  const top = mat(s.primaryColor);
  const bottom = mat(s.secondaryColor);
  const hair = mat(s.hairColor);
  const gold = mat('#f1c40f');
  const dark = mat('#222222');

  // legs or skirt
  if (s.body === 'female') {
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.72, 12), bottom);
    skirt.position.y = 0.6;
    g.add(skirt);
    for (const x of [-0.12, 0.12]) {
      const leg = box(0.1, 0.3, 0.1, skin);
      leg.position.set(x, 0.15, 0);
      g.add(leg);
    }
  } else {
    for (const x of [-0.16, 0.16]) {
      const leg = box(0.22, 0.8, 0.24, bottom);
      leg.position.set(x, 0.4, 0);
      g.add(leg);
    }
  }
  // torso, arms
  const torso = box(0.64, 0.72, 0.36, top);
  torso.position.y = 1.18;
  g.add(torso);
  for (const x of [-0.42, 0.42]) {
    const arm = box(0.16, 0.66, 0.18, top);
    arm.position.set(x, 1.15, 0);
    g.add(arm);
    const hand = box(0.14, 0.14, 0.16, skin);
    hand.position.set(x, 0.78, 0);
    g.add(hand);
  }
  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 12), skin);
  head.position.y = 1.8;
  g.add(head);
  for (const x of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark);
    eye.position.set(x, 1.84, 0.28);
    g.add(eye);
  }

  // hair
  const cap = (r = 0.335) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hair);
    m.position.y = 1.82;
    return m;
  };
  const strand = (x, z, len = 0.55, y = 1.55) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, len, 6), hair);
    m.position.set(x, y, z);
    return m;
  };
  switch (s.hair) {
    case 'afro': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), hair);
      m.position.set(0, 1.9, -0.06);
      g.add(m);
      break;
    }
    case 'braids':
      g.add(cap());
      for (const [x, z] of [[-0.3, 0], [-0.22, -0.2], [0.22, -0.2], [0.3, 0], [0, -0.28], [-0.1, -0.27], [0.1, -0.27]]) g.add(strand(x, z));
      break;
    case 'bun': {
      g.add(cap());
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), hair);
      b.position.set(0, 2.17, -0.05);
      g.add(b);
      break;
    }
    case 'ponytail': {
      g.add(cap());
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.6, 8), hair);
      t.position.set(0, 1.7, -0.36);
      t.rotation.x = -0.45;
      g.add(t);
      break;
    }
    case 'dreads':
      g.add(cap());
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        g.add(strand(Math.cos(a) * 0.3, Math.sin(a) * 0.3 - 0.04, 0.5, 1.62));
      }
      break;
    case 'bald':
      break;
    default:
      g.add(cap());
  }

  // hat
  switch (s.hat) {
    case 'cap': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.35, 0.16, 14), mat(s.secondaryColor));
      c.position.y = 2.06;
      g.add(c);
      const brim = box(0.4, 0.04, 0.26, mat(s.secondaryColor));
      brim.position.set(0, 1.99, 0.34);
      g.add(brim);
      break;
    }
    case 'beanie': {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.37, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(s.secondaryColor));
      c.position.y = 1.9;
      g.add(c);
      break;
    }
    case 'tophat': {
      const brimH = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 16), dark);
      brimH.position.y = 2.04;
      g.add(brimH);
      const tall = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.46, 14), dark);
      tall.position.y = 2.28;
      g.add(tall);
      break;
    }
    case 'crown': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.26, 5), gold);
      c.position.y = 2.12;
      g.add(c);
      break;
    }
    default:
  }

  // accessory
  switch (s.accessory) {
    case 'glasses':
      for (const x of [-0.12, 0.12]) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 12), dark);
        r.position.set(x, 1.84, 0.3);
        g.add(r);
      }
      break;
    case 'earrings':
      for (const x of [-0.31, 0.31]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), gold);
        e.position.set(x, 1.7, 0);
        g.add(e);
      }
      break;
    case 'beard': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), hair);
      b.scale.set(1, 0.7, 0.8);
      b.position.set(0, 1.62, 0.12);
      g.add(b);
      break;
    }
    case 'scarf': {
      const sc = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 8, 14), mat(s.secondaryColor));
      sc.rotation.x = Math.PI / 2;
      sc.position.y = 1.52;
      g.add(sc);
      break;
    }
    case 'backpack': {
      const bp = box(0.5, 0.6, 0.24, mat(s.secondaryColor));
      bp.position.set(0, 1.18, -0.3);
      g.add(bp);
      break;
    }
    default:
  }
  return g;
}

const SKINS = ['#8d5524', '#c68642', '#e0ac69', '#5b3a1e', '#3b2415', '#a9743d'];
const HAIR_COLORS = ['#17120f', '#2b1d12', '#3b2415'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

function makeWaiting(color) {
  return makeCharacter({
    body: Math.random() < 0.5 ? 'female' : 'male',
    primaryColor: color,
    secondaryColor: pickOne(['#2b2f4a', '#4a3b2b', '#3a3a3a', '#1f4a5a']),
    skinColor: pickOne(SKINS),
    hairColor: pickOne(HAIR_COLORS),
    hair: pickOne(['short', 'short', 'afro', 'braids', 'bun', 'bald', 'ponytail']),
    hat: Math.random() < 0.2 ? 'cap' : 'none',
    accessory: Math.random() < 0.2 ? pickOne(['glasses', 'backpack', 'scarf']) : 'none',
  });
}

/* ---------------------------------------------------------------
   Taxi
   --------------------------------------------------------------- */
function makeCar({ bodyColor, painted }) {
  const g = new THREE.Group();
  const body = box(2.1, 0.8, 4.4, mat(bodyColor));
  body.position.y = 0.72;
  g.add(body);
  const hood = box(2.0, 0.34, 1.2, mat(bodyColor));
  hood.position.set(0, 0.92, -1.75);
  g.add(hood);
  if (painted) {
    const stripe = box(2.14, 0.14, 4.44, mat('#ffffff'));
    stripe.position.y = 0.98;
    g.add(stripe);
  }
  // open-top cabin frame so the driver and passengers can be seen from behind
  for (const [x, z] of [[-0.98, -0.75], [0.98, -0.75], [-0.98, 1.7], [0.98, 1.7]]) {
    const p = box(0.08, 0.95, 0.08, mat('#e9e9e9'));
    p.position.set(x, 1.55, z);
    g.add(p);
  }
  const roof = box(2.1, 0.06, 2.6, mat(painted ? '#ffffff' : '#6c727a', { transparent: true, opacity: painted ? 0.22 : 0.22 }));
  roof.position.set(0, 2.05, 0.48);
  g.add(roof);
  const wind = box(1.9, 0.04, 0.6, mat('#bfe9ff', { transparent: true, opacity: 0.4 }));
  wind.position.set(0, 1.36, -0.95);
  wind.rotation.x = -0.6;
  g.add(wind);
  for (const x of [-1.07, 1.07]) {
    for (const z of [-1.4, 1.4]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), mat('#222222'));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.42, z);
      g.add(w);
    }
  }
  for (const x of [-0.7, 0.7]) {
    const hl = box(0.4, 0.2, 0.06, new THREE.MeshBasicMaterial({ color: '#fff3b0' }));
    hl.position.set(x, 0.85, -2.22);
    g.add(hl);
    const tl = box(0.4, 0.2, 0.06, new THREE.MeshBasicMaterial({ color: '#ff3b3b' }));
    tl.position.set(x, 0.85, 2.22);
    g.add(tl);
  }
  return g;
}

function signTexture(text, bg, fg = '#ffffff', w = 512, h = 128, font = '800 66px system-ui, sans-serif') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(255,255,255,.85)';
  x.lineWidth = 8;
  x.strokeRect(6, 6, w - 12, h - 12);
  x.fillStyle = fg;
  x.font = font;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const taxi = new THREE.Group();
const taxiBody = makeCar({ bodyColor: '#0b8f4e', painted: true });
taxi.add(taxiBody);
{
  const pole = box(0.06, 0.4, 0.06, mat('#dddddd'));
  pole.position.set(0, 2.3, 0.48);
  taxi.add(pole);
  const signBox = box(0.8, 0.26, 0.3, new THREE.MeshBasicMaterial({ map: signTexture('TAXI', '#ffd23f', '#1d2b24', 256, 80, '800 54px system-ui, sans-serif') }));
  signBox.position.set(0, 2.55, 0.48);
  taxi.add(signBox);
}
const driverSlot = new THREE.Group();
driverSlot.position.set(-0.5, 0.42, -0.35);
driverSlot.rotation.y = Math.PI;
driverSlot.scale.setScalar(0.72);
taxi.add(driverSlot);

const SEAT_POS = [
  [0.5, 0.42, -0.35],
  [-0.55, 0.42, 1.05],
  [0, 0.42, 1.05],
  [0.55, 0.42, 1.05],
];
const seatFigures = SEAT_POS.map(([x, y, z]) => {
  const f = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.34), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  torso.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), new THREE.MeshLambertMaterial({ color: '#8d5524' }));
  head.position.y = 1.56;
  f.add(torso, head);
  f.userData = { torso, head };
  f.position.set(x, y, z);
  f.scale.setScalar(0.72);
  f.visible = false;
  taxi.add(f);
  return f;
});
scene.add(taxi);

let driverFigure = null;
function setDriver() {
  if (driverFigure) driverSlot.remove(driverFigure);
  driverFigure = makeCharacter(player.style);
  driverSlot.add(driverFigure);
}
setDriver();

/* ---------------------------------------------------------------
   Road and scenery (recycled tiles)
   --------------------------------------------------------------- */
const TILE_LEN = 40;
const TILE_COUNT = 7;
const tiles = [];
const BUILD_COLORS = ['#f1e7d2', '#d9d4c7', '#c9dbe6', '#e6cfb6', '#dfe8d4', '#cfc9e3'];
const ROAD = mat('#4a4f57');
const CURB = mat('#cfc8b4');
const GRASS = mat('#8fbf6a');
const LINE = mat('#f4f1e6');

function buildTile() {
  const g = new THREE.Group();
  const road = box(11.2, 0.2, TILE_LEN, ROAD);
  road.position.y = -0.1;
  g.add(road);
  for (const side of [-1, 1]) {
    const curb = box(5, 0.34, TILE_LEN, CURB);
    curb.position.set(side * 8.2, -0.03, 0);
    g.add(curb);
    const grass = box(60, 0.2, TILE_LEN, GRASS);
    grass.position.set(side * 40.7, -0.12, 0);
    g.add(grass);
    const edge = box(0.16, 0.02, TILE_LEN, LINE);
    edge.position.set(side * 5.2, 0.02, 0);
    g.add(edge);
  }
  for (const x of [-1.7, 1.7]) {
    for (let i = 0; i < 5; i++) {
      const dash = box(0.16, 0.02, 2.6, LINE);
      dash.position.set(x, 0.02, -TILE_LEN / 2 + 4 + i * 8);
      g.add(dash);
    }
  }
  g.userData.buildings = [];
  g.userData.trees = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const b = box(1, 1, 1, mat('#ffffff'));
      g.add(b);
      g.userData.buildings.push({ mesh: b, side });
    }
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.5, 6), mat('#6b4a2b'));
      trunk.position.y = 0.75;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 7), mat('#2f8f4a'));
      crown.position.y = 2.6;
      t.add(trunk, crown);
      g.add(t);
      g.userData.trees.push({ mesh: t, side });
    }
  }
  return g;
}

function decorateTile(tile) {
  for (const { mesh, side } of tile.userData.buildings) {
    const w = rnd(4, 8);
    const h = rnd(4, 20);
    const d = rnd(6, 9);
    mesh.scale.set(w, h, d);
    mesh.position.set(side * (14 + rnd(0, 7) + w / 2), h / 2, rnd(-TILE_LEN / 2, TILE_LEN / 2));
    mesh.material.color.set(pickOne(BUILD_COLORS));
  }
  for (const { mesh, side } of tile.userData.trees) {
    mesh.position.set(side * rnd(9.4, 11), 0.1, rnd(-TILE_LEN / 2, TILE_LEN / 2));
    mesh.scale.setScalar(rnd(0.8, 1.25));
  }
}

for (let i = 0; i < TILE_COUNT; i++) {
  const t = buildTile();
  t.position.z = -i * TILE_LEN + TILE_LEN;
  decorateTile(t);
  scene.add(t);
  tiles.push(t);
}

function scrollTiles(dz) {
  for (const t of tiles) t.position.z += dz;
  for (const t of tiles) {
    if (t.position.z > TILE_LEN * 1.5) {
      const minZ = Math.min(...tiles.map((x) => x.position.z));
      t.position.z = minZ - TILE_LEN;
      decorateTile(t);
    }
  }
}

/* ---------------------------------------------------------------
   Entities: obstacles, pickups, stops, unpainted cars
   --------------------------------------------------------------- */
const entities = [];

function addEntity(e) {
  scene.add(e.mesh);
  entities.push(e);
  return e;
}

function removeEntity(e) {
  scene.remove(e.mesh);
  const i = entities.indexOf(e);
  if (i >= 0) entities.splice(i, 1);
}

function makePothole() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.03, 14), mat('#23262b'));
  m.position.y = 0.03;
  return m;
}
function makeCones() {
  const g = new THREE.Group();
  for (const dx of [-0.5, 0, 0.5]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 10), mat('#ff7a1a'));
    c.position.set(dx, 0.45, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.12, 10), mat('#ffffff'));
    band.position.set(dx, 0.5, 0);
    g.add(c, band);
  }
  return g;
}
function makeMinibus() {
  const g = new THREE.Group();
  const body = box(2.3, 1.6, 7, mat('#2d6fb5'));
  body.position.y = 1.15;
  g.add(body);
  const stripe = box(2.34, 0.3, 7.04, mat('#ffffff'));
  stripe.position.y = 1.25;
  g.add(stripe);
  const win = box(2.34, 0.5, 5.8, mat('#cfe9f7'));
  win.position.y = 1.75;
  g.add(win);
  for (const x of [-1.15, 1.15]) for (const z of [-2.3, 2.3]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), mat('#222222'));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.5, z);
    g.add(w);
  }
  const tl = box(1.6, 0.2, 0.06, new THREE.MeshBasicMaterial({ color: '#ff3b3b' }));
  tl.position.set(0, 0.8, 3.52);
  g.add(tl);
  return g;
}
function makeFuelCan() {
  const g = new THREE.Group();
  const can = box(0.7, 0.9, 0.4, mat('#d6322b'));
  can.position.y = 0.75;
  const cap = box(0.2, 0.22, 0.2, mat('#222222'));
  cap.position.set(0.15, 1.3, 0);
  const label = box(0.5, 0.35, 0.42, mat('#ffe066'));
  label.position.y = 0.75;
  g.add(can, cap, label);
  g.scale.setScalar(1.3);
  return g;
}
function makeWarnSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffd23f';
  x.beginPath();
  x.moveTo(64, 8);
  x.lineTo(120, 112);
  x.lineTo(8, 112);
  x.closePath();
  x.fill();
  x.lineWidth = 8;
  x.strokeStyle = '#c0392b';
  x.stroke();
  x.fillStyle = '#c0392b';
  x.font = '800 70px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('!', 64, 78);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(1.8, 1.8, 1);
  s.renderOrder = 10;
  return s;
}

function makeStop(idx) {
  const info = STOPS[idx % STOPS.length];
  const g = new THREE.Group();
  const pole = box(0.12, 3.4, 0.12, mat('#444444'));
  pole.position.set(BAY_X - 1.4, 1.7, 0);
  g.add(pole);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.85),
    new THREE.MeshBasicMaterial({ map: signTexture(info.name, info.color), side: THREE.DoubleSide })
  );
  board.position.set(BAY_X - 1.4, 3.5, 0);
  board.rotation.y = 0.95;
  g.add(board);
  const shelter = box(2.6, 0.12, 3.4, mat('#e4e0d2'));
  shelter.position.set(BAY_X - 2.4, 2.7, 0);
  g.add(shelter);
  for (const dz of [-1.5, 1.5]) {
    const leg = box(0.1, 2.7, 0.1, mat('#777777'));
    leg.position.set(BAY_X - 1.4, 1.35, dz);
    g.add(leg);
  }
  const mark = box(3.2, 0.02, 12, mat(info.color, { transparent: true, opacity: 0.35 }));
  mark.position.set(-3.4, 0.045, 0);
  g.add(mark);
  return g;
}

/* ---------------------------------------------------------------
   Game state
   --------------------------------------------------------------- */
const S = {
  mode: 'title', // title | playing | over
  t: 0,
  v: 8,
  dist: 0,
  laneIndex: 1,
  taxiX: 0,
  braking: false,
  fares: 0,
  passengers: 0,
  combo: 0,
  bestCombo: 0,
  warns: 0,
  fuel: 100,
  bumps: 3,
  aboard: [],
  stop: null,
  stopCount: 0,
  nextStopAt: 120,
  nextObstacleAt: 80,
  dwell: 0,
  hitCooldown: 0,
  shake: 0,
  honkCooldown: 0,
  reason: '',
  paused: false,
};

const hud = {
  fares: $('fares'),
  fuel: $('fuelFill'),
  fuelBar: $('fuelBar'),
  hearts: $('hearts'),
  seats: $('seats'),
  next: $('nextStop'),
  toast: $('toast'),
};

for (let i = 0; i < SEATS; i++) {
  const el = document.createElement('div');
  el.className = 'seat';
  el.textContent = 'free';
  el.style.color = '#555';
  hud.seats.appendChild(el);
}

let toastTimer;
function toast(text, kind = '', ms = 1700) {
  hud.toast.textContent = text;
  hud.toast.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (hud.toast.className = ''), ms);
}

function naira(n) {
  return `₦${Math.floor(n).toLocaleString('en-NG')}`;
}

function updateHud() {
  hud.fares.textContent = naira(S.fares);
  hud.fuel.style.width = `${Math.max(0, S.fuel)}%`;
  hud.fuelBar.classList.toggle('low', S.fuel < 25);
  hud.hearts.textContent = '♥'.repeat(Math.max(0, S.bumps)) + '♡'.repeat(Math.max(0, 3 - S.bumps));
  hud.hearts.style.color = '#e4572e';
  [...hud.seats.children].forEach((el, i) => {
    const p = S.aboard[i];
    if (p) {
      el.textContent = STOPS[p.dest].short;
      el.style.background = STOPS[p.dest].color;
      el.style.color = '#fff';
      el.classList.add('full');
    } else {
      el.textContent = 'free';
      el.style.background = '';
      el.style.color = '#555';
      el.classList.remove('full');
    }
  });
  seatFigures.forEach((f, i) => {
    const p = S.aboard[i];
    f.visible = !!p;
    if (p) {
      f.userData.torso.material.color.set(STOPS[p.dest].color);
      f.userData.head.material.color.set(p.skin);
    }
  });
  if (S.stop && !S.stop.done) {
    const st = S.stop;
    const waiting = st.waiting.length;
    const drops = S.aboard.filter((p) => p.dest === st.idx % STOPS.length).length;
    hud.next.textContent = `Next: ${STOPS[st.idx % STOPS.length].name}` + (waiting ? ` · ${waiting} waiting` : '') + (drops ? ` · ${drops} getting off` : '');
  } else {
    hud.next.textContent = S.mode === 'playing' ? 'Road clear — mind the potholes' : 'Get ready…';
  }
}

/* ---------------------------------------------------------------
   Sound (tiny synthesised beeps, no files)
   --------------------------------------------------------------- */
let audio = null;
let muted = false;
try { muted = localStorage.getItem('along_muted') === '1'; } catch (e) { /* storage can be blocked */ }
$('mute').textContent = muted ? '🔇' : '🔊';

function ensureAudio() {
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      try { audio = new Ctx(); } catch (e) { audio = null; }
    }
  }
  if (audio && audio.state === 'suspended') audio.resume();
}
function beep(freq, dur = 0.15, type = 'square', vol = 0.06, slide = 0) {
  if (!audio || muted) return;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, audio.currentTime);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, audio.currentTime + dur);
  g.gain.setValueAtTime(vol, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  o.connect(g).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + dur);
}
/* A car horn is two notes sounding together (about 420 Hz and 520 Hz), buzzy and nasal.
   Built here from sawtooth waves through a band-pass filter, played as two quick taps. */
function hornBlast(start, dur) {
  if (!audio || muted) return;
  const t0 = audio.currentTime + start;
  const out = audio.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.22, t0 + 0.015);
  out.gain.setValueAtTime(0.2, t0 + dur - 0.05);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const band = audio.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1100;
  band.Q.value = 0.55;
  const low = audio.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 3200;
  band.connect(low).connect(out).connect(audio.destination);
  for (const [f, v] of [[418, 0.9], [523, 0.9], [836, 0.25], [1046, 0.2]]) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 1.012, t0);
    o.frequency.linearRampToValueAtTime(f, t0 + 0.05);
    g.gain.value = v;
    o.connect(g).connect(band);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
}
function carHorn() {
  hornBlast(0, 0.2);
  hornBlast(0.27, 0.42);
}
const sfx = {
  honk: () => carHorn(),
  coin: () => { beep(760, 0.09, 'sine', 0.08); setTimeout(() => beep(1040, 0.14, 'sine', 0.08), 80); },
  bump: () => beep(110, 0.3, 'sawtooth', 0.09, -60),
  pot: () => beep(160, 0.18, 'triangle', 0.08, -40),
  fuel: () => beep(520, 0.18, 'triangle', 0.07, 300),
  bad: () => beep(200, 0.25, 'sawtooth', 0.06, -80),
};
$('mute').addEventListener('click', () => {
  muted = !muted;
  $('mute').textContent = muted ? '🔇' : '🔊';
  try { localStorage.setItem('along_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
});

/* ---------------------------------------------------------------
   Spawning
   --------------------------------------------------------------- */
function spawnObstacleRow() {
  const difficulty = Math.min(1, S.t / 150);
  const stopZ = S.stop ? S.stop.mesh.position.z : null;
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  const count = Math.random() < 0.35 + difficulty * 0.3 ? 2 : 1;
  for (let k = 0; k < count; k++) {
    const lane = lanes[k];
    const roll = Math.random();
    let kind;
    if (roll < 0.3) kind = 'pothole';
    else if (roll < 0.58) kind = 'cones';
    else if (roll < 0.82 - difficulty * 0.1) kind = 'bus';
    else kind = 'fuel';
    // keep the bus stop's bay lane clear around the stop
    if (stopZ !== null && Math.abs(stopZ - FAR) < 55 && lane === 0) continue;
    if (kind === 'fuel' && S.fuel > 70 && Math.random() < 0.6) kind = 'pothole';
    const e = { kind, lane, z: FAR - rnd(0, 12), own: 0, half: 1, hw: 1.15, done: false };
    if (kind === 'pothole') { e.mesh = makePothole(); e.half = 0.9; e.hw = 1.0; }
    else if (kind === 'cones') { e.mesh = makeCones(); e.half = 0.5; e.hw = 1.3; }
    else if (kind === 'bus') { e.mesh = makeMinibus(); e.half = 3.5; e.hw = 1.2; e.own = rnd(6, 13); }
    else { e.mesh = makeFuelCan(); e.half = 0.8; e.hw = 1.2; }
    e.mesh.position.set(LANES[lane], 0, e.z);
    addEntity(e);
  }
}

function spawnStop() {
  const idx = S.stopCount++;
  const info = STOPS[idx % STOPS.length];
  const mesh = makeStop(idx);
  mesh.position.set(0, 0, FAR);
  scene.add(mesh);
  const n = 1 + Math.floor(Math.random() * Math.min(4, 2 + S.stopCount * 0.5));
  const waiting = [];
  for (let i = 0; i < n; i++) {
    const k = 1 + Math.floor(Math.random() * 3);
    const dest = (idx + k) % STOPS.length;
    const fig = makeWaiting(STOPS[dest].color);
    fig.position.set(BAY_X + 0.2 - (i % 2) * 0.9, 0.1, -1.1 + i * 0.75);
    fig.rotation.y = Math.PI / 2;
    fig.scale.setScalar(0.95);
    mesh.add(fig);
    const skin = fig.children[0] ? '#8d5524' : '#8d5524';
    waiting.push({ dest, k, fig, skin: pickOne(SKINS) || skin });
  }
  S.stop = { idx, mesh, waiting, done: false, fake: null };
  // sometimes an unpainted car lurks at the stop
  if (S.stopCount >= 2 && Math.random() < Math.min(0.6, 0.3 + S.stopCount * 0.04)) {
    const car = makeCar({ bodyColor: pickOne(['#5a6068', '#6b4f4f', '#454b57']), painted: false });
    car.position.set(-5.2, 0, FAR - 11);
    const warn = makeWarnSprite();
    warn.position.set(0, 4, 0);
    car.add(warn);
    scene.add(car);
    S.stop.fake = { mesh: car, z: FAR - 11, state: 'lurking', timer: 0, own: 0, triggered: false };
  }
  S.nextStopAt = S.dist + 230 + Math.random() * 90;
}

/* ---------------------------------------------------------------
   Core gameplay
   --------------------------------------------------------------- */
function resetRun() {
  for (const e of [...entities]) removeEntity(e);
  if (S.stop) {
    scene.remove(S.stop.mesh);
    if (S.stop.fake) scene.remove(S.stop.fake.mesh);
  }
  Object.assign(S, {
    t: 0, v: 8, dist: 0, laneIndex: 1, taxiX: 0, braking: false, fares: 0, passengers: 0, combo: 0,
    bestCombo: 0, warns: 0, fuel: 100, bumps: 3, aboard: [], stop: null, stopCount: 0,
    nextStopAt: 100, nextObstacleAt: 70, dwell: 0, hitCooldown: 0, shake: 0, honkCooldown: 0, reason: '', paused: false,
  });
}

function startRun() {
  ensureAudio();
  $('pauseScreen').hidden = true;
  resetRun();
  S.mode = 'playing';
  S.v = 14;
  $('titleScreen').hidden = true;
  $('overScreen').hidden = true;
  updateHud();
  toast('Left lane + hold STOP at the bus stop', '', 2400);
}

function comboMult() {
  return 1 + 0.25 * Math.min(4, Math.max(0, S.combo - 1));
}

function transactAtStop() {
  const st = S.stop;
  const here = st.idx % STOPS.length;
  let earned = 0;
  let dropped = 0;
  // drop passengers whose stop this is
  const stay = [];
  for (const p of S.aboard) {
    if (p.dest === here) {
      const fare = Math.round((p.fare * comboMult()) / 10) * 10;
      earned += fare;
      dropped++;
    } else stay.push(p);
  }
  S.aboard = stay;
  // board waiting passengers
  let boarded = 0;
  const left = [];
  for (const w of st.waiting) {
    if (S.aboard.length < SEATS) {
      S.aboard.push({ dest: w.dest, fare: 300 * w.k + 50 * Math.floor(Math.random() * 3), skin: w.skin });
      st.mesh.remove(w.fig);
      boarded++;
    } else left.push(w);
  }
  st.waiting = left;
  S.combo++;
  S.bestCombo = Math.max(S.bestCombo, S.combo);
  if (dropped) {
    S.fares += earned;
    S.passengers += dropped;
    S.fuel = Math.min(100, S.fuel + 12 * dropped);
    sfx.coin();
    toast(`+${naira(earned)}${S.combo > 1 ? `  ·  combo x${comboMult().toFixed(2).replace(/\.?0+$/, '')}` : ''}`, 'good');
  } else if (boarded) {
    sfx.coin();
    toast(`${boarded} on board`, 'good', 1100);
  }
  st.done = true;
  S.dwell = 0;
  if (st.fake && st.fake.state === 'lurking') {
    // unpainted car is still around while you stopped: it just drives away
    st.fake.state = 'leaving';
  }
}

function missedStop() {
  const st = S.stop;
  const here = st.idx % STOPS.length;
  const losing = S.aboard.filter((p) => p.dest === here);
  if (losing.length) {
    S.aboard = S.aboard.filter((p) => p.dest !== here);
    toast(`Missed ${STOPS[here].name}! No fare`, 'bad', 1600);
    sfx.bad();
  }
  S.combo = 0;
}

function honk() {
  if (S.mode !== 'playing' || S.paused || S.honkCooldown > 0) return;
  S.honkCooldown = 0.5;
  sfx.honk();
  const st = S.stop;
  if (st && st.fake && st.fake.state === 'lurking') {
    st.fake.state = 'warned';
    st.fake.timer = 0;
    S.warns++;
    S.fares += 200;
    toast('Passengers wait for the painted taxi!  +₦200', 'good', 1800);
    setTimeout(sfx.coin, 150);
  }
}

function hitSomething(kind) {
  if (S.hitCooldown > 0) return;
  S.hitCooldown = 0.7;
  S.combo = 0;
  if (kind === 'pothole') {
    S.v *= 0.55;
    S.shake = 0.4;
    sfx.pot();
    toast('Pothole!', 'warn', 900);
  } else if (kind === 'cones') {
    S.v *= 0.7;
    S.fuel = Math.max(0, S.fuel - 8);
    S.shake = 0.5;
    sfx.pot();
    toast('Cones! Lost some fuel', 'warn', 1000);
  } else {
    S.bumps--;
    S.v = Math.min(S.v, 6);
    S.shake = 0.9;
    sfx.bump();
    toast('Bump! Mind the minibus', 'bad', 1200);
  }
}

function endRun(reason) {
  if (S.mode !== 'playing') return;
  S.mode = 'over';
  S.reason = reason;
  S.braking = false;
  $('brake').classList.remove('down');
  showOver();
}

function update(dt) {
  S.t += dt;
  S.hitCooldown = Math.max(0, S.hitCooldown - dt);
  S.honkCooldown = Math.max(0, S.honkCooldown - dt);
  S.shake = Math.max(0, S.shake - dt * 1.6);

  // lane + speed
  const targetX = LANES[S.laneIndex];
  S.taxiX += (targetX - S.taxiX) * Math.min(1, dt * 11);
  const cruise = Math.min(36, 22 + S.t * 0.06);
  if (S.braking) S.v = Math.max(2.5, S.v - 36 * dt);
  else S.v = Math.min(cruise, S.v + 13 * dt);
  const dz = S.v * dt;
  S.dist += dz;
  S.fuel -= (S.v < 5 ? 0.5 : 1.7) * dt;

  scrollTiles(dz);

  // spawns
  if (S.dist >= S.nextObstacleAt) {
    spawnObstacleRow();
    const difficulty = Math.min(1, S.t / 150);
    S.nextObstacleAt = S.dist + rnd(34, 58) - difficulty * 14;
  }
  if (!S.stop && S.dist >= S.nextStopAt) spawnStop();

  // entities
  for (const e of [...entities]) {
    e.z += (S.v - e.own) * dt;
    e.mesh.position.z = e.z;
    if (e.z > 25) { removeEntity(e); continue; }
    if (e.done) continue;
    const dzTaxi = Math.abs(e.z);
    const dxTaxi = Math.abs(LANES[e.lane] - S.taxiX);
    if (dzTaxi < e.half + 2.0 && dxTaxi < e.hw + 0.9) {
      if (e.kind === 'fuel') {
        e.done = true;
        removeEntity(e);
        S.fuel = Math.min(100, S.fuel + 28);
        sfx.fuel();
        toast('Fuel! +28%', 'good', 900);
      } else {
        hitSomething(e.kind);
        if (e.kind === 'bus') { e.done = true; e.own = 40; } else e.done = true;
      }
    }
  }

  // stop handling
  const st = S.stop;
  if (st) {
    st.mesh.position.z += dz;
    const sz = st.mesh.position.z;
    if (st.fake) {
      const f = st.fake;
      f.z += dz;
      if (f.state === 'lurking') {
        if (sz > -125 && !f.triggered) {
          f.triggered = true;
          toast('Unpainted car at the stop!  HONK to warn them', 'warn', 2200);
          sfx.bad();
        }
        if (f.triggered) f.timer += dt;
        if (f.triggered && f.timer > 5) {
          f.state = 'took';
          f.timer = 0;
          if (st.waiting.length) {
            const w = st.waiting.shift();
            st.mesh.remove(w.fig);
            S.combo = 0;
            toast('A passenger got into an unpainted car. Honk next time!', 'bad', 2200);
            sfx.bad();
          }
        }
      } else if (f.state === 'warned' || f.state === 'took' || f.state === 'leaving') {
        f.z -= 45 * dt;
        if (f.z < -260) {
          scene.remove(f.mesh);
          st.fake = null;
        }
      }
      if (st.fake) st.fake.mesh.position.z = st.fake.z;
    }
    // dwell in the bay
    const inBay = Math.abs(S.taxiX - LANES[0]) < 1.3 && Math.abs(sz) < 10;
    if (!st.done && inBay && S.v < 8) {
      S.dwell += dt;
      if (S.dwell > 0.55) transactAtStop();
    } else if (!st.done) {
      S.dwell = Math.max(0, S.dwell - dt);
    }
    if (sz > 14) {
      if (!st.done) missedStop();
      scene.remove(st.mesh);
      if (st.fake) scene.remove(st.fake.mesh);
      S.stop = null;
    }
  }

  // lose conditions
  if (S.fuel <= 0) { S.fuel = 0; endRun('Out of fuel. Stop to drop passengers — each fare buys fuel.'); }
  else if (S.bumps <= 0) endRun('Too many bumps. The minibus won that one.');

  updateHud();
}

/* ---------------------------------------------------------------
   Camera, taxi pose, render loop
   --------------------------------------------------------------- */
let idleT = 0;
function poseTaxiAndCamera(dt) {
  taxi.position.x = S.taxiX;
  taxi.position.z = 0;
  const lean = (LANES[S.laneIndex] - S.taxiX) * -0.04;
  taxi.rotation.z = lean;
  taxi.rotation.y = (LANES[S.laneIndex] - S.taxiX) * -0.035;
  taxi.position.y = Math.sin((S.mode === 'playing' ? S.t : idleT) * 14) * 0.015 * (S.v / 20);
  const sh = S.shake;
  const jx = (Math.random() - 0.5) * sh * 0.5;
  const jy = (Math.random() - 0.5) * sh * 0.4;
  const portrait = camera.aspect < 0.8;
  const camY = portrait ? 10.5 : 8;
  const camZ = portrait ? 15.5 : 13;
  camera.position.set(S.taxiX * 0.45 + jx, camY + jy, camZ);
  camera.lookAt(S.taxiX * 0.45, 1.2, -14);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (S.mode === 'playing' && !S.paused) {
    update(dt);
  } else if (S.mode === 'playing') {
    // paused: keep drawing the frozen scene
  } else {
    idleT += dt;
    // gentle idle scroll behind the menus
    S.v = 7;
    scrollTiles(S.v * dt);
  }
  poseTaxiAndCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------
   Game over
   --------------------------------------------------------------- */
let bestLocal = 0;
try { bestLocal = Number(localStorage.getItem('along_best') || 0) || 0; } catch (e) { /* ignore */ }

async function showOver() {
  $('overTitle').textContent = S.fares > 0 ? 'Journey over' : 'Taxi parked';
  $('overReason').textContent = S.reason;
  $('overFares').textContent = naira(S.fares);
  $('overPass').textContent = String(S.passengers);
  $('overCombo').textContent = String(S.bestCombo);
  $('overWarn').textContent = String(S.warns);
  $('overTip').textContent = pickOne(TIPS);
  $('overSave').textContent = player.signedIn ? 'Saving your run…' : 'Sign in with start.ng to save your score to the leaderboard.';
  $('board').hidden = true;
  $('board').replaceChildren();
  $('overScreen').hidden = false;
  try {
    if (S.fares > bestLocal) {
      bestLocal = S.fares;
      localStorage.setItem('along_best', String(bestLocal));
    }
  } catch (e) { /* ignore */ }

  const result = await saveRun({ fares: S.fares, passengers: S.passengers });
  if (result.ok) {
    $('overSave').textContent = result.improved ? `New personal best! You are #${result.rank} on the leaderboard.` : `Saved. Your best is still ahead (you are #${result.rank}).`;
  } else if (player.signedIn) {
    $('overSave').textContent = "Couldn't reach start.ng to save this run.";
  }
  const entries = await loadBoard(5);
  if (entries && entries.length) {
    const board = $('board');
    for (const e of entries) {
      const li = document.createElement('li');
      const value = e.stats?.fares ?? e.score ?? 0;
      li.textContent = `${e.name} — ${naira(value)}`;
      if (player.id !== null && e.player_id === player.id) li.className = 'me';
      board.appendChild(li);
    }
    board.hidden = false;
  }
}

/* ---------------------------------------------------------------
   Input
   --------------------------------------------------------------- */
function setPaused(on) {
  if (S.mode !== 'playing' || S.paused === on) return;
  S.paused = on;
  setBrake(false);
  $('pauseScreen').hidden = !on;
  $('pause').textContent = on ? '▶' : '❚❚';
  $('pause').setAttribute('aria-label', on ? 'Play' : 'Pause');
  if (audio) { if (on) audio.suspend?.(); else audio.resume?.(); }
}

function moveLane(d) {
  if (S.mode !== 'playing' || S.paused) return;
  S.laneIndex = Math.max(0, Math.min(2, S.laneIndex + d));
}
function setBrake(on) {
  if (on && S.paused) return;
  S.braking = on;
  $('brake').classList.toggle('down', on);
}

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key;
  if (S.mode === 'title' && (k === 'Enter' || k === ' ')) { e.preventDefault(); startRun(); return; }
  if (S.mode === 'over' && k === 'Enter') { startRun(); return; }
  if (S.mode === 'playing' && (k === 'p' || k === 'P' || k === 'Escape')) { setPaused(!S.paused); return; }
  if (S.paused) { if (k === 'Enter') setPaused(false); return; }
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') moveLane(-1);
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') moveLane(1);
  else if (k === 'ArrowDown' || k === ' ' || k === 's' || k === 'S') { e.preventDefault(); setBrake(true); }
  else if (k === 'h' || k === 'H' || k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); honk(); }
  else if (k === 'm' || k === 'M') $('mute').click();
});
addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowDown' || k === ' ' || k === 's' || k === 'S') setBrake(false);
});
addEventListener('blur', () => { setBrake(false); setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

const brakeBtn = $('brake');
brakeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); ensureAudio(); setBrake(true); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) brakeBtn.addEventListener(ev, () => setBrake(false));
$('honk').addEventListener('pointerdown', (e) => { e.preventDefault(); ensureAudio(); honk(); });

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (S.mode !== 'playing' || S.paused) return;
  ensureAudio();
  moveLane(e.clientX < window.innerWidth / 2 ? -1 : 1);
});

$('playBtn').addEventListener('click', startRun);
$('pause').addEventListener('click', () => { ensureAudio(); setPaused(!S.paused); });
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('againBtn').addEventListener('click', startRun);

/* Ask start.ng again when the player comes back to the tab (they may have signed in or out). */
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.mode !== 'playing') refreshPlayer(); });
addEventListener('focus', () => { if (S.mode !== 'playing') refreshPlayer(); });

/* ---------------------------------------------------------------
   Boot
   --------------------------------------------------------------- */
const params = new URLSearchParams(location.search);
if (params.has('cover')) {
  document.body.classList.add('cover');
  S.mode = 'title';
  taxi.position.set(-3.4, 0, 0);
  S.taxiX = -3.4;
  S.laneIndex = 0;
  // a stop with passengers beside the taxi for the cover picture
  const cs = makeStop(2);
  cs.position.set(0, 0, -8);
  for (let i = 0; i < 3; i++) {
    const fig = makeWaiting(STOPS[(i + 3) % 5].color);
    fig.position.set(BAY_X + 0.2 - (i % 2) * 0.9, 0.1, -1.4 + i * 0.9);
    fig.rotation.y = Math.PI / 2;
    cs.add(fig);
  }
  scene.add(cs);
  S.aboard = [{ dest: 3, fare: 600, skin: '#8d5524' }, { dest: 4, fare: 900, skin: '#c68642' }];
  updateHud();
  const coneRow = makeCones();
  coneRow.position.set(3.4, 0, -22);
  scene.add(coneRow);
  const bus = makeMinibus();
  bus.position.set(0, 0, -34);
  scene.add(bus);
  const ghost = makeCar({ bodyColor: '#5a6068', painted: false });
  ghost.position.set(-5.2, 0, -19);
  const w = makeWarnSprite();
  w.position.set(0, 4, 0);
  ghost.add(w);
  scene.add(ghost);
} else {
  $('titleScreen').hidden = false;
}
applyPlayer();
updateHud();
requestAnimationFrame(frame);
refreshPlayer();

if (params.has('debug')) {
  window.__along = {
    state: S,
    entities,
    LANES,
    startRun,
    laneTo: (i) => { S.laneIndex = i; },
    brake: setBrake,
    honk,
    pause: setPaused,
    player: () => player,
  };
}
