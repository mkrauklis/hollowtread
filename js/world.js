import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/* ----------------------------------------------------------------------
 * Hollowtread — one continuous forest. Spawn is a treehouse (safe zone,
 * holds the bestiary alcove); everything below it — hills, trees, jump
 * pads, embers, the three things that hunt at night — is one connected
 * ground, no level breaks, no loading screens.
 * ------------------------------------------------------------------- */

const EYE_H = 1.5;          // chimp stands lower than a human
const PLAYER_R = 0.4;
const GRAVITY = -22;
const JUMP_V = 7.2;
const PAD_JUMP_V = 13;
const WALK_SPEED = 4.2;
const RUN_SPEED = 6.4;
const SAFE_R = 20;          // monsters can never come closer to spawn than this

const PLATFORM_H = 3.2;
const PLATFORM_HALF = 6;
const RAMP_HALF_W = 1.6;
const RAMP_Z0 = PLATFORM_HALF;      // ramp starts at the platform edge
const RAMP_Z1 = PLATFORM_HALF + 12; // and reaches the ground 12 units out

/* ---------------- deterministic scatter (no Math.random so the forest is stable) ---------------- */

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1337);

/* ---------------- renderer / scene / camera ---------------- */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070a);
scene.fog = new THREE.FogExp2(0x04070a, 0.028);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 260);
camera.position.set(0, PLATFORM_H + EYE_H, -1);

// Rendered at a reduced internal resolution, then scaled back up with
// nearest-neighbor filtering (see css/style.css) for a light pixelated
// look — the drawing buffer is small, the CSS size is full window.
const PIXEL_SCALE = 2.5;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
document.getElementById('game-root').appendChild(renderer.domElement);
renderer.domElement.classList.add('game-canvas');

function resizeRenderer() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(Math.max(1, Math.floor(w / PIXEL_SCALE)), Math.max(1, Math.floor(h / PIXEL_SCALE)), false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resizeRenderer();

scene.add(new THREE.AmbientLight(0x1a2230, 1.0));
const moon = new THREE.DirectionalLight(0x8fa3c9, 0.55);
moon.position.set(40, 70, -30);
scene.add(moon);

const flashlight = new THREE.SpotLight(0xfff1cf, 6.5, 26, Math.PI / 6.5, 0.45, 1.3);
camera.add(flashlight);
flashlight.target.position.set(0, 0, -1);
camera.add(flashlight.target);
scene.add(camera);

const armGroup = new THREE.Group();
const armMat = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.9 });
function makeArm(side) {
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), armMat);
  arm.position.set(side * 0.26, -0.42, -0.5);
  arm.rotation.z = side * 0.35;
  return arm;
}
armGroup.add(makeArm(-1), makeArm(1));
camera.add(armGroup);

/* ---------------- materials ---------------- */
/* Flat low-poly surfaces with a blotchy, hand-painted grain texture on
 * them — generated on a canvas at load, not a fetched image file — is
 * closer to the simple, slightly grimy look of a game like Gorilla Tag
 * than a clean flat color. */

function makeGrainTexture({ size = 32, dark = 150, light = 255, repeat = 6, blotch = 3 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Low-res noise, upscaled with no smoothing, reads as blotches rather
  // than fine grain — keeps it in the same chunky, pixelated register
  // as the rest of the screen instead of looking like a photo texture.
  const cells = Math.max(2, Math.floor(size / blotch));
  const small = document.createElement('canvas');
  small.width = small.height = cells;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(cells, cells);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = dark + Math.random() * (light - dark);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.repeat.set(repeat, repeat);
  return tex;
}

const woodMat = new THREE.MeshStandardMaterial({ color: 0x4e3a26, roughness: 0.95, map: makeGrainTexture({ dark: 140, light: 235, repeat: 7, blotch: 4 }) });
const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x241b12, roughness: 1, map: makeGrainTexture({ dark: 110, light: 220, repeat: 5, blotch: 3 }) });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x15210f, roughness: 1, map: makeGrainTexture({ dark: 120, light: 255, repeat: 6, blotch: 2 }) });
const groundMat = new THREE.MeshStandardMaterial({ color: 0x0d140c, roughness: 1, map: makeGrainTexture({ dark: 90, light: 255, repeat: 48, blotch: 2 }) });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1c140c, roughness: 1, map: makeGrainTexture({ dark: 100, light: 230, repeat: 8, blotch: 3 }) });
const padMat = new THREE.MeshStandardMaterial({ color: 0x1a3a3a, emissive: 0x2fd6c4, emissiveIntensity: 0.7, roughness: 0.6 });

/* ---------------- terrain height field ---------------- */
/* Flat plateau on the treehouse, a ramp down from it, gently rolling
 * hills everywhere else. Trees/monsters/pads all sit on this surface. */

const hills = [
  { x: 30, z: 0, amp: 3.2, r: 14 },
  { x: -34, z: 18, amp: 3.8, r: 16 },
  { x: 10, z: 46, amp: 2.6, r: 12 },
  { x: -18, z: 50, amp: 4.2, r: 15 },
  { x: 42, z: 38, amp: 3, r: 13 },
  { x: -40, z: -8, amp: 2.4, r: 11 },
];

function baseHillHeight(x, z) {
  let h = 0;
  for (const hill of hills) {
    const dx = x - hill.x, dz = z - hill.z;
    h += hill.amp * Math.exp(-(dx * dx + dz * dz) / (2 * hill.r * hill.r));
  }
  return h;
}

function groundHeight(x, z) {
  const onRamp = Math.abs(x) <= RAMP_HALF_W && z >= -RAMP_Z1 - 0 && z <= RAMP_Z1 && z >= RAMP_Z0 * -1;
  // Ramp runs along -z (south face of the platform, toward the open forest).
  if (Math.abs(x) <= RAMP_HALF_W && z <= -RAMP_Z0 && z >= -RAMP_Z1) {
    const t = (-z - RAMP_Z0) / (RAMP_Z1 - RAMP_Z0); // 0 at platform edge, 1 at ground
    return THREE.MathUtils.lerp(PLATFORM_H, 0, THREE.MathUtils.clamp(t, 0, 1));
  }
  if (Math.abs(x) <= PLATFORM_HALF && Math.abs(z) <= PLATFORM_HALF) {
    return PLATFORM_H;
  }
  return baseHillHeight(x, z);
}

/* ---------------- obstacle colliders (trees + pedestals) ---------------- */

const circleColliders = []; // { x, z, r }
const boxColliders = [];    // THREE.Box3

function addCircleCollider(x, z, r) { circleColliders.push({ x, z, r }); }

function collidesAt(x, z) {
  for (const c of circleColliders) {
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + PLAYER_R) * (c.r + PLAYER_R)) return true;
  }
  for (const b of boxColliders) {
    if (x + PLAYER_R > b.min.x && x - PLAYER_R < b.max.x &&
        z + PLAYER_R > b.min.z && z - PLAYER_R < b.max.z) return true;
  }
  return false;
}

/* ---------------- the treehouse (spawn, safe zone) ---------------- */

const platform = new THREE.Mesh(
  new THREE.BoxGeometry(PLATFORM_HALF * 2, 0.4, PLATFORM_HALF * 2),
  woodMat
);
platform.position.set(0, PLATFORM_H - 0.2, 0);
scene.add(platform);

// Four stilts holding the deck up.
for (const [sx, sz] of [[5, 5], [5, -5], [-5, 5], [-5, -5]]) {
  const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, PLATFORM_H, 8), trunkMat);
  stilt.position.set(sx, PLATFORM_H / 2, sz);
  scene.add(stilt);
}

// The big tree the house is built around, off to one side, canopy over the whole deck.
const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, PLATFORM_H + 6, 10), trunkMat);
trunk.position.set(-4, (PLATFORM_H + 6) / 2 - 1, -4);
scene.add(trunk);
for (const [ox, oy, oz, r] of [[-4, PLATFORM_H + 5, -4, 4.2], [-1, PLATFORM_H + 6, -2, 3.2], [-6, PLATFORM_H + 6.5, -6, 3]]) {
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), leafMat);
  leaf.position.set(ox, oy, oz);
  scene.add(leaf);
}

// Railing around the open deck (every edge except the ramp gap on -z).
function railing(x0, x1, z0, z1) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.9, z1 - z0), woodDarkMat);
  mesh.position.set((x0 + x1) / 2, PLATFORM_H + 0.45, (z0 + z1) / 2);
  scene.add(mesh);
  boxColliders.push(new THREE.Box3(
    new THREE.Vector3(x0, PLATFORM_H, z0), new THREE.Vector3(x1, PLATFORM_H + 0.9, z1)
  ));
}
railing(-6, 6, 5.7, 6);     // +z edge
railing(5.7, 6, -6, 6);     // +x edge
railing(-6, -5.7, -6, 6);   // -x edge
// -z edge: two stubs only, leaving the ramp's own width as a real, open gap
// (an earlier version also drew a full-span bar across this gap and only
// removed its collider, so the ramp looked sealed even though it wasn't).
railing(-6, -RAMP_HALF_W - 0.3, -6, -5.7);
railing(RAMP_HALF_W + 0.3, 6, -6, -5.7);

// Bestiary alcove: a small walled room on the deck, opposite the ramp.
const alcove = { x0: -6, x1: -2, z0: 2, z1: 6 };
function alcoveWall(x0, x1, z0, z1) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 2.6, z1 - z0), woodDarkMat);
  mesh.position.set((x0 + x1) / 2, PLATFORM_H + 1.3, (z0 + z1) / 2);
  scene.add(mesh);
  boxColliders.push(new THREE.Box3(
    new THREE.Vector3(x0, PLATFORM_H, z0), new THREE.Vector3(x1, PLATFORM_H + 2.6, z1)
  ));
}
alcoveWall(alcove.x0 - 0.15, alcove.x0, alcove.z0, alcove.z1);           // west wall
alcoveWall(alcove.x0, alcove.x1, alcove.z1, alcove.z1 + 0.15);           // north wall
alcoveWall(alcove.x0, alcove.x0 + 1.1, alcove.z0, alcove.z0 + 0.15);     // south wall, east stub (leaves a doorway)
alcoveWall(alcove.x1 - 1.1, alcove.x1, alcove.z0, alcove.z0 + 0.15);     // south wall, west stub
const campLight = new THREE.PointLight(0xffb15c, 1.1, 10, 2);
campLight.position.set(-4, PLATFORM_H + 2, 4);
scene.add(campLight);

/* ---------------- monster model factory (shared by minis + full size) ---------------- */

function createStalkerModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.3, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
  body.position.y = 1.1;
  g.add(body);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xcc2a22, emissive: 0xcc2a22, emissiveIntensity: 3 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
    eye.position.set(side * 0.14, 1.65, 0.38);
    g.add(eye);
  }
  return g;
}

function createLooperModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.1, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0x5a5e57, roughness: 1 }));
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.45;
  g.add(body);
  for (const [lx, lz] of [[0.3, 0.5], [-0.3, 0.5], [0.3, -0.5], [-0.3, -0.5]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), woodDarkMat);
    leg.position.set(lx, 0.25, lz);
    g.add(leg);
  }
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, emissive: 0xcfe8ff, emissiveIntensity: 2.5 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
    eye.position.set(side * 0.12, 0.6, 0.65);
    g.add(eye);
  }
  return g;
}

function createTreewatcherModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 2.0, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c2a22, roughness: 1 }));
  body.position.y = 1.3;
  g.add(body);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xe7e3c8, emissive: 0xe7e3c8, emissiveIntensity: 2 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
    eye.position.set(side * 0.1, 2.15, 0.2);
    g.add(eye);
  }
  return g;
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '700 30px Segoe UI, sans-serif';
  ctx.fillStyle = '#e6e6ea';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(1.5, 0.38, 1);
  return sprite;
}

/* ---------------- bestiary pedestals (inside the alcove, purely decorative) ---------------- */

const bestiary = [
  { name: 'Stalker', make: createStalkerModel, x: -5, z: 3 },
  { name: 'Looper', make: createLooperModel, x: -4, z: 4.6 },
  { name: 'Treewatcher', make: createTreewatcherModel, x: -2.8, z: 3 },
];
const spinningMinis = [];
for (const entry of bestiary) {
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.8, 10), woodDarkMat);
  pedestal.position.set(entry.x, PLATFORM_H + 0.4, entry.z);
  scene.add(pedestal);

  const mini = entry.make();
  mini.scale.set(0.4, 0.4, 0.4);
  mini.position.set(entry.x, PLATFORM_H + 0.8, entry.z);
  scene.add(mini);
  spinningMinis.push(mini);

  const label = makeLabel(entry.name);
  label.position.set(entry.x, PLATFORM_H + 1.7, entry.z);
  scene.add(label);
}

/* ---------------- forest: trees ---------------- */

function isInSafeZone(x, z) {
  return Math.sqrt(x * x + z * z) < SAFE_R || (Math.abs(x) <= RAMP_HALF_W + 1 && z <= 0 && z >= -RAMP_Z1 - 2);
}

// Branches are real jumpable platforms (rectangular footprints in
// branchPlatforms, checked against in movePlayer's supportHeight), not
// just decoration, so bare trees double as climbable terrain.
const branchPlatforms = []; // { x0, x1, z0, z1, y }

function makeBranch(x0, y0, z0, x1, y1, z1) {
  const start = new THREE.Vector3(x0, y0, z0);
  const end = new THREE.Vector3(x1, y1, z1);
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, len, 6), trunkMat);
  mesh.position.copy(start).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  scene.add(mesh);

  const margin = 0.45; // generous landing hitbox, easy to land on at a jog
  branchPlatforms.push({
    x0: Math.min(x0, x1) - margin, x1: Math.max(x0, x1) + margin,
    z0: Math.min(z0, z1) - margin, z1: Math.max(z0, z1) + margin,
    y: Math.max(y0, y1) + 0.15,
  });
}

let treesPlaced = 0;
while (treesPlaced < 70) {
  const x = (rand() - 0.5) * 140;
  const z = (rand() - 0.5) * 140 + 10;
  if (isInSafeZone(x, z)) continue;
  const h = groundHeight(x, z);
  const trunkH = 3 + rand() * 2.5;
  const r = 0.3 + rand() * 0.25;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, trunkH, 7), trunkMat);
  t.position.set(x, h + trunkH / 2, z);
  scene.add(t);
  addCircleCollider(x, z, r + 0.15);

  // One or two bare branches per tree, jutting out at random heights/angles.
  const branchCount = rand() < 0.4 ? 2 : 1;
  for (let b = 0; b < branchCount; b++) {
    const angle = rand() * Math.PI * 2;
    const len = 1.6 + rand() * 1.3;
    const branchH = h + trunkH * (0.4 + rand() * 0.45);
    const tilt = (rand() - 0.5) * 0.6;
    const ex = x + Math.cos(angle) * (r + len);
    const ez = z + Math.sin(angle) * (r + len);
    makeBranch(x + Math.cos(angle) * r, branchH, z + Math.sin(angle) * r, ex, branchH + tilt, ez);
  }
  treesPlaced++;
}

/* ---------------- jump pads ---------------- */

const jumpPads = [
  { x: 14, z: -18 }, { x: -22, z: -6 }, { x: 24, z: 20 },
  { x: -10, z: 40 }, { x: 36, z: 52 },
].map(({ x, z }) => {
  const h = groundHeight(x, z);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.15, 16), padMat);
  disc.position.set(x, h + 0.08, z);
  scene.add(disc);
  const glow = new THREE.PointLight(0x2fd6c4, 1.2, 6, 2);
  glow.position.set(x, h + 0.6, z);
  scene.add(glow);
  return { x, z, r: 1.3, h };
});

/* ---------------- embers (collectibles) ---------------- */

const emberGeo = new THREE.SphereGeometry(0.22, 12, 12);
function makeEmber(x, z) {
  const h = groundHeight(x, z);
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8a33d, emissive: 0xe8a33d, emissiveIntensity: 1.6 });
  const mesh = new THREE.Mesh(emberGeo, mat);
  mesh.position.set(x, h + 1.1, z);
  mesh.add(new THREE.PointLight(0xe8a33d, 1.6, 7, 2));
  scene.add(mesh);
  return { mesh, collected: false };
}
const embers = [makeEmber(30, 2), makeEmber(-34, 20), makeEmber(-18, 51)];
let embersFound = 0;
function updateEmberHud() {
  document.querySelectorAll('.ember-dot').forEach((dot, i) => dot.classList.toggle('lit', i < embersFound));
}

/* ---------------- monsters ---------------- */

function clampToSafeZone(pos) {
  const d = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  if (d < SAFE_R) {
    const k = SAFE_R / Math.max(d, 0.001);
    pos.x *= k; pos.z *= k;
  }
}

const stalker = {
  group: createStalkerModel(),
  route: [
    new THREE.Vector3(30, 0, 0), new THREE.Vector3(30, 0, 18), new THREE.Vector3(44, 0, 10),
    new THREE.Vector3(44, 0, -8), new THREE.Vector3(26, 0, -14),
  ],
  idx: 0, alert: false, alertTimer: 0, catchR: 1.1,
};
scene.add(stalker.group);
stalker.group.position.copy(stalker.route[0]);

const looper = {
  group: createLooperModel(),
  route: [
    new THREE.Vector3(-34, 0, 18), new THREE.Vector3(-44, 0, 26), new THREE.Vector3(-24, 0, 30),
    new THREE.Vector3(-34, 0, 10),
  ],
  idx: 0, alert: false, alertTimer: 0, catchR: 1.0,
};
scene.add(looper.group);
looper.group.position.copy(looper.route[0]);

const treewatcher = {
  group: createTreewatcherModel(),
  home: new THREE.Vector3(10, 0, 46),
  catchR: 1.1,
};
scene.add(treewatcher.group);
treewatcher.group.position.copy(treewatcher.home);

function tickStalker(dt, playerPos) {
  const m = stalker;
  const toPlayer = new THREE.Vector3().subVectors(playerPos, m.group.position);
  const dist = toPlayer.length();
  const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dirToM = new THREE.Vector3().subVectors(m.group.position, playerPos).normalize();
  const seen = dist < 16 && camForward.dot(dirToM) > 0.9;

  if (dist < 5 || seen) { m.alert = true; m.alertTimer = 4.5; }
  else if (m.alertTimer > 0) m.alertTimer -= dt;
  else m.alert = false;

  const speed = m.alert ? 5.4 : 1.8;
  if (m.alert && dist > 0.01) {
    m.group.position.add(toPlayer.normalize().multiplyScalar(speed * dt));
  } else if (!m.alert) {
    const target = m.route[m.idx];
    const toTarget = new THREE.Vector3().subVectors(target, m.group.position);
    if (toTarget.length() < 1) m.idx = (m.idx + 1) % m.route.length;
    else m.group.position.add(toTarget.normalize().multiplyScalar(speed * dt));
  }
  clampToSafeZone(m.group.position);
  m.group.position.y = groundHeight(m.group.position.x, m.group.position.z);
  m.group.lookAt(playerPos.x, m.group.position.y, playerPos.z);
  return { dist, danger: m.alert ? Math.max(0, 1 - dist / 7) : 0, catchR: m.catchR };
}

function tickLooper(dt, playerPos) {
  const m = looper;
  const toPlayer = new THREE.Vector3().subVectors(playerPos, m.group.position);
  const dist = toPlayer.length();
  if (dist < 9) { m.alert = true; m.alertTimer = 3.5; }
  else if (m.alertTimer > 0) m.alertTimer -= dt;
  else m.alert = false;

  const speed = m.alert ? 6.6 : 2.4;
  if (m.alert && dist > 0.01) {
    m.group.position.add(toPlayer.normalize().multiplyScalar(speed * dt));
  } else if (!m.alert) {
    const target = m.route[m.idx];
    const toTarget = new THREE.Vector3().subVectors(target, m.group.position);
    if (toTarget.length() < 1) m.idx = (m.idx + 1) % m.route.length;
    else m.group.position.add(toTarget.normalize().multiplyScalar(speed * dt));
  }
  clampToSafeZone(m.group.position);
  m.group.position.y = groundHeight(m.group.position.x, m.group.position.z);
  m.group.lookAt(playerPos.x, m.group.position.y + 0.3, playerPos.z);
  return { dist, danger: m.alert ? Math.max(0, 1 - dist / 5) : 0, catchR: m.catchR };
}

function tickTreewatcher(dt, playerPos) {
  const m = treewatcher;
  const toPlayer = new THREE.Vector3().subVectors(playerPos, m.group.position);
  const dist = toPlayer.length();
  const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dirToM = new THREE.Vector3().subVectors(m.group.position, playerPos).normalize();
  const watched = dist < 30 && camForward.dot(dirToM) > 0.86;

  if (!watched && dist > 0.01) {
    m.group.position.add(toPlayer.normalize().multiplyScalar(1.1 * dt));
  }
  clampToSafeZone(m.group.position);
  m.group.position.y = groundHeight(m.group.position.x, m.group.position.z);
  if (watched) m.group.lookAt(playerPos.x, m.group.position.y + 0.8, playerPos.z);
  return { dist, danger: !watched ? Math.max(0, 1 - dist / 10) : 0, catchR: m.catchR };
}

/* ---------------- player controller ---------------- */

const controls = new PointerLockControls(camera, renderer.domElement);
const blocker = document.getElementById('blocker');
const endScreen = document.getElementById('end-screen');

// Pointer Lock sometimes fails on the first try (or isn't available at
// all — embedded frames, some mobile browsers, some privacy settings).
// Never leave the player stuck on the start screen because of it: drop
// into click-drag mouselook immediately, but keep retrying a real lock
// on every click so it upgrades to true mouse capture the moment it can.
let fallbackLook = false;
let dragging = false;
let lastLockAttempt = 0;
const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const relockHint = document.getElementById('relock-hint');

function attemptLock() {
  const now = performance.now();
  if (now - lastLockAttempt < 400) return; // dodge Chrome's brief re-lock cooldown
  lastLockAttempt = now;
  controls.lock();
}

function enterFallbackLook() {
  fallbackLook = true;
  blocker.style.display = 'none';
  relockHint.classList.add('show');
}

blocker.addEventListener('click', () => {
  attemptLock();
  if (!controls.isLocked) enterFallbackLook();
});
relockHint.addEventListener('click', () => attemptLock());
controls.addEventListener('lock', () => {
  blocker.style.display = 'none';
  fallbackLook = false;
  dragging = false;
  relockHint.classList.remove('show');
});
controls.addEventListener('unlock', () => {
  if (!endScreen.classList.contains('show') && !fallbackLook) blocker.style.display = 'flex';
});
document.addEventListener('pointerlockerror', () => {
  enterFallbackLook();
});

renderer.domElement.addEventListener('mousedown', () => { if (fallbackLook) dragging = true; });
window.addEventListener('mouseup', () => { dragging = false; });
renderer.domElement.addEventListener('mousemove', (e) => {
  if (!fallbackLook || !dragging) return;
  const sensitivity = 0.0025;
  lookEuler.setFromQuaternion(camera.quaternion);
  lookEuler.y -= e.movementX * sensitivity;
  lookEuler.x -= e.movementY * sensitivity;
  lookEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lookEuler.x));
  camera.quaternion.setFromEuler(lookEuler);
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && fallbackLook && !endScreen.classList.contains('show')) {
    fallbackLook = false;
    blocker.style.display = 'flex';
  }
});

const keys = { w: false, a: false, s: false, d: false, shift: false };
document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.w = true; break;
    case 'KeyS': case 'ArrowDown': keys.s = true; break;
    case 'KeyA': case 'ArrowLeft': keys.a = true; break;
    case 'KeyD': case 'ArrowRight': keys.d = true; break;
    case 'ShiftLeft': case 'ShiftRight': keys.shift = true; break;
    case 'Space':
      e.preventDefault();
      if (onGround) { velocity.y = JUMP_V; onGround = false; }
      break;
  }
});
document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.w = false; break;
    case 'KeyS': case 'ArrowDown': keys.s = false; break;
    case 'KeyA': case 'ArrowLeft': keys.a = false; break;
    case 'KeyD': case 'ArrowRight': keys.d = false; break;
    case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
  }
});

const SPAWN = new THREE.Vector3(0, PLATFORM_H + EYE_H, -1);
const velocity = new THREE.Vector3();
let onGround = true;

// The terrain height, or a branch's top if you're standing on/falling onto
// one — never snaps you UP onto a branch from underneath, only lets you
// land on top of it, same as any simple platformer.
function supportHeight(x, z, footY) {
  let best = groundHeight(x, z);
  for (const p of branchPlatforms) {
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    if (p.y > best && p.y <= footY + 0.4) best = p.y;
  }
  return best;
}

function movePlayer(dt) {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  forward.y = 0; forward.normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  right.y = 0; right.normalize();

  const moveDir = new THREE.Vector3();
  if (keys.w) moveDir.add(forward);
  if (keys.s) moveDir.sub(forward);
  if (keys.d) moveDir.add(right);
  if (keys.a) moveDir.sub(right);
  const moving = moveDir.lengthSq() > 0;
  if (moving) moveDir.normalize();

  const speed = keys.shift ? RUN_SPEED : WALK_SPEED;
  const pos = camera.position;

  const nx = pos.x + moveDir.x * speed * dt;
  if (!collidesAt(nx, pos.z)) pos.x = nx;
  const nz = pos.z + moveDir.z * speed * dt;
  if (!collidesAt(pos.x, nz)) pos.z = nz;

  const footY = pos.y - EYE_H;
  const supportY = supportHeight(pos.x, pos.z, footY) + EYE_H;

  if (!onGround) {
    velocity.y += GRAVITY * dt;
    pos.y += velocity.y * dt;
    if (pos.y <= supportY) { pos.y = supportY; velocity.y = 0; onGround = true; }
  } else if (supportY < pos.y - 0.2) {
    onGround = false; // stepped off a branch/ledge — fall instead of teleporting down
  } else {
    pos.y = supportY;
    for (const pad of jumpPads) {
      const dx = pos.x - pad.x, dz = pos.z - pad.z;
      if (dx * dx + dz * dz < pad.r * pad.r) {
        velocity.y = PAD_JUMP_V;
        onGround = false;
        break;
      }
    }
  }

  const t = performance.now() / 1000;
  const bob = moving && onGround ? Math.sin(t * (keys.shift ? 11 : 7.5)) * 0.03 : 0;
  armGroup.position.y = bob;
}

/* ---------------- game state ---------------- */

const vignette = document.getElementById('dread-vignette');

function respawnFromCatch() {
  camera.position.copy(SPAWN);
  velocity.set(0, 0, 0);
  onGround = true;
  stalker.group.position.copy(stalker.route[0]);
  stalker.alert = false; stalker.alertTimer = 0;
  looper.group.position.copy(looper.route[0]);
  looper.alert = false; looper.alertTimer = 0;
  treewatcher.group.position.copy(treewatcher.home);
  document.body.style.filter = 'brightness(3) saturate(0)';
  setTimeout(() => { document.body.style.filter = ''; }, 120);
}

function winGame() {
  endScreen.classList.add('show');
  fallbackLook = false;
  if (controls.isLocked) controls.unlock();
}

/* ---------------- main loop ---------------- */

let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  for (const mini of spinningMinis) mini.rotation.y += dt * 0.6;

  if ((controls.isLocked || fallbackLook) && !endScreen.classList.contains('show')) {
    movePlayer(dt);

    for (const ember of embers) {
      if (ember.collected) continue;
      if (camera.position.distanceTo(ember.mesh.position) < 1.4) {
        ember.collected = true;
        ember.mesh.visible = false;
        embersFound += 1;
        updateEmberHud();
      }
    }

    const results = [
      tickStalker(dt, camera.position),
      tickLooper(dt, camera.position),
      tickTreewatcher(dt, camera.position),
    ];
    const danger = Math.max(...results.map((r) => r.danger));
    vignette.style.opacity = String(danger);
    for (const r of results) if (r.dist < r.catchR) respawnFromCatch();

    const home = Math.sqrt(camera.position.x * camera.position.x) < PLATFORM_HALF &&
      Math.abs(camera.position.z) < PLATFORM_HALF && camera.position.y > PLATFORM_H;
    if (embersFound === embers.length && home) winGame();
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', resizeRenderer);
