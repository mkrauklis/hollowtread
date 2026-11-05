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
const JUMP_V = 9.6;
const PAD_JUMP_V = 15;
const WALK_SPEED = 8.4;
const RUN_SPEED = 12.8;
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
const groundMat = new THREE.MeshStandardMaterial({ color: 0x24401c, roughness: 1, map: makeGrainTexture({ dark: 90, light: 255, repeat: 48, blotch: 2 }) });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1c140c, roughness: 1, map: makeGrainTexture({ dark: 100, light: 230, repeat: 8, blotch: 3 }) });
const padMat = new THREE.MeshStandardMaterial({ color: 0x1a3a3a, emissive: 0x2fd6c4, emissiveIntensity: 0.7, roughness: 0.6 });

/* ---------------- terrain height field ---------------- */
/* Flat plateau on the treehouse, a ramp down from it, gently rolling
 * hills everywhere else. Trees/monsters/pads all sit on this surface. */

// Pushed well out past the treehouse/ramp (distance-to-radius ratio kept
// above ~2.5) so these being "giant" doesn't bulge the ground up under the
// safe zone -- their footprint stays out where the forest actually is.
const hills = [
  { x: 55, z: 0, amp: 16, r: 22 },
  { x: -60, z: 28, amp: 20, r: 24 },
  { x: 18, z: 75, amp: 15, r: 20 },
  { x: -30, z: 80, amp: 22, r: 26 },
  { x: 65, z: 58, amp: 18, r: 24 },
  { x: -62, z: -12, amp: 13, r: 20 },
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

// The actual rendered ground — groundHeight() above only ever drove
// collision/placement math; without a mesh that follows it, the forest
// floor was invisible (void) the instant you stepped off the deck.
const GROUND_EXTENT = 135;
const GROUND_SEGMENTS = 135;
const groundGeo = new THREE.PlaneGeometry(GROUND_EXTENT * 2, GROUND_EXTENT * 2, GROUND_SEGMENTS, GROUND_SEGMENTS);
groundGeo.rotateX(-Math.PI / 2);
{
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, baseHillHeight(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  groundGeo.computeVertexNormals();
}
scene.add(new THREE.Mesh(groundGeo, groundMat));

// The ramp's own slanted surface (collision already follows groundHeight's
// lerp through this span; this box just gives it something visible).
{
  const rampStart = new THREE.Vector3(0, PLATFORM_H, -RAMP_Z0);
  const rampEnd = new THREE.Vector3(0, 0, -RAMP_Z1);
  const rampDir = new THREE.Vector3().subVectors(rampEnd, rampStart);
  const rampLen = rampDir.length();
  const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(RAMP_HALF_W * 2, 0.3, rampLen), woodMat);
  rampMesh.position.copy(rampStart).addScaledVector(rampDir, 0.5);
  rampMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), rampDir.clone().normalize());
  scene.add(rampMesh);
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

// A closed perimeter wall so the forest has an actual edge instead of
// trailing off into the ground mesh's own boundary. Sits well outside
// every hill/prop/monster placement, so nothing pokes through it.
{
  const WALL_R = 120;
  const wallMat2 = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 1, map: makeGrainTexture({ dark: 70, light: 190, repeat: 40, blotch: 3 }) });
  function boundaryWall(x0, x1, z0, z1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 12, z1 - z0), wallMat2);
    mesh.position.set((x0 + x1) / 2, 6, (z0 + z1) / 2);
    scene.add(mesh);
    boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 12, z1)));
  }
  boundaryWall(-WALL_R - 1, -WALL_R + 1, -WALL_R - 1, WALL_R + 1); // west
  boundaryWall(WALL_R - 1, WALL_R + 1, -WALL_R - 1, WALL_R + 1);   // east
  boundaryWall(-WALL_R - 1, WALL_R + 1, -WALL_R - 1, -WALL_R + 1); // south
  boundaryWall(-WALL_R - 1, WALL_R + 1, WALL_R - 1, WALL_R + 1);   // north
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
/* Every creature is the same shape language: a chimp with no legs, torso
 * tapering straight down to a point and hovering off the ground instead of
 * standing on anything — reads as "wrong" at a glance, and lets one factory
 * cover all four by varying proportions, color, and glow. */

function createChimpModel({
  bodyColor, bodyEmissive = 0x000000, bodyEmissiveIntensity = 0,
  eyeColor, eyeEmissiveIntensity = 2.5,
  torsoLen = 1.0, headScale = 1, armLen = 0.5, roughness = 0.9,
}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: bodyColor, emissive: bodyEmissive, emissiveIntensity: bodyEmissiveIntensity, roughness,
  });

  // Torso: a lean ape silhouette (a squashed sphere, not a cone) tapering
  // down to nothing instead of legs. Low segment counts + an oversized
  // round head is the Gorilla-Tag-ish, simple-low-poly-avatar look.
  const torsoScaleY = torsoLen * 0.75;
  const torsoHalfH = 0.32 * torsoScaleY;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 6), mat);
  torso.scale.set(0.95, torsoScaleY, 0.85);
  torso.position.y = torsoHalfH + 0.15;
  g.add(torso);

  const headY = torso.position.y + torsoHalfH + 0.3 * headScale;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38 * headScale, 8, 7), mat);
  head.position.y = headY;
  g.add(head);

  // Muzzle + ears are what actually read as "chimp" instead of "blob".
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.17 * headScale, 6, 5), mat);
  muzzle.scale.set(1, 0.75, 1.2);
  muzzle.position.set(0, headY - 0.1 * headScale, 0.32 * headScale);
  g.add(muzzle);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1 * headScale, 6, 5), mat);
    ear.scale.set(0.55, 1, 0.35);
    ear.position.set(side * 0.34 * headScale, headY + 0.03 * headScale, -0.03);
    g.add(ear);
  }

  // Long ape arms, each ending in a hand so the limb actually looks jointed —
  // anchored to the torso's shoulder line, well below the head.
  const shoulderY = torso.position.y + torsoHalfH * 0.2;
  for (const side of [-1, 1]) {
    const armAngle = side * 0.6;
    const shoulder = new THREE.Vector3(side * 0.34, shoulderY, 0.05);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, armLen, 4, 6), mat);
    arm.position.copy(shoulder);
    arm.rotation.z = armAngle;
    g.add(arm);

    const handOffset = new THREE.Vector3(Math.sin(armAngle), -Math.cos(armAngle), 0).multiplyScalar(armLen / 2 + 0.06);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), mat);
    hand.position.copy(shoulder).add(handOffset);
    g.add(hand);
  }

  // Pushed out past the head sphere's own radius (0.38*headScale) so they
  // actually protrude and read as eyes instead of being buried inside it.
  const eyeMat = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: eyeEmissiveIntensity });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065 * headScale, 7, 6), eyeMat);
    eye.position.set(side * 0.17 * headScale, headY + 0.03 * headScale, 0.37 * headScale);
    g.add(eye);
  }

  g.userData.hoverHeight = 0.15; // feet (or lack of them) float this far off the ground
  return g;
}

function createSupersonicModel() {
  return createChimpModel({
    bodyColor: 0x0f2e40, bodyEmissive: 0x1ec8ff, bodyEmissiveIntensity: 1.3,
    eyeColor: 0xffffff, eyeEmissiveIntensity: 3.5,
    torsoLen: 2.4, headScale: 0.75, armLen: 0.6, roughness: 0.5,
  });
}

function createHotCheetoModel() {
  // Same base proportions as Supersonic, just scaled up 4x as a whole --
  // keeps it the same "shape", not a different (and re-tuned) silhouette.
  const g = createChimpModel({
    bodyColor: 0x5c1220, eyeColor: 0xff0033, eyeEmissiveIntensity: 4,
    torsoLen: 2.4, headScale: 0.75, armLen: 0.6, roughness: 0.75,
  });
  g.scale.setScalar(4);
  g.userData.hoverHeight = 0.15 * 4;
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
  { name: 'Supersonic', make: createSupersonicModel, x: -4.9, z: 4 },
  { name: 'Hot Cheeto', make: createHotCheetoModel, x: -3.1, z: 4 },
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
  label.position.set(entry.x, PLATFORM_H + 2.15, entry.z); // clears even the tallest (Supersonic) mini
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

/* ---------------- autumn clutter: pumpkins, leaf piles, scarecrows ---------------- */

const pumpkinMat = new THREE.MeshStandardMaterial({ color: 0xd9711f, emissive: 0xff7a1a, emissiveIntensity: 0.35, roughness: 0.8 });
function makePumpkin(x, z) {
  const h = groundHeight(x, z);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), pumpkinMat);
  body.scale.set(1, 0.82, 1);
  body.position.set(x, h + 0.35, z);
  scene.add(body);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 6), woodDarkMat);
  stem.position.set(x, h + 0.68, z);
  scene.add(stem);
}

const leafPileMat = new THREE.MeshStandardMaterial({ color: 0x8a4a1f, roughness: 1, map: makeGrainTexture({ dark: 90, light: 230, repeat: 3, blotch: 2 }) });
function makeLeafPile(x, z) {
  const h = groundHeight(x, z);
  const pile = new THREE.Mesh(new THREE.SphereGeometry(0.55 + rand() * 0.3, 8, 6), leafPileMat);
  pile.scale.set(1, 0.25, 0.85);
  pile.position.set(x, h + 0.12, z);
  pile.rotation.y = rand() * Math.PI;
  scene.add(pile);
}

const burlapMat = new THREE.MeshStandardMaterial({ color: 0xb79a65, roughness: 1, map: makeGrainTexture({ dark: 110, light: 230, repeat: 3, blotch: 2 }) });
function makeScarecrow(x, z) {
  const h = groundHeight(x, z);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 6), woodDarkMat);
  post.position.set(x, h + 1.2, z);
  scene.add(post);
  const crossbeam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), woodDarkMat);
  crossbeam.rotation.z = Math.PI / 2;
  crossbeam.position.set(x, h + 1.7, z);
  scene.add(crossbeam);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 8), burlapMat);
  torso.position.set(x, h + 1.5, z);
  scene.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), burlapMat);
  head.position.set(x, h + 2.15, z);
  scene.add(head);
  addCircleCollider(x, z, 0.3);
}

function scatterProp(count, make) {
  let placed = 0;
  while (placed < count) {
    const x = (rand() - 0.5) * 150;
    const z = (rand() - 0.5) * 150 + 10;
    if (isInSafeZone(x, z)) continue;
    make(x, z);
    placed++;
  }
}
scatterProp(16, makePumpkin);
scatterProp(12, makeLeafPile);
scatterProp(9, makeScarecrow);

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

const supersonic = {
  group: createSupersonicModel(),
  route: [new THREE.Vector3(70, 0, -65)], // southeast corner
  idx: 0, alert: false, alertTimer: 0, catchR: 1.2,
};
scene.add(supersonic.group);
supersonic.group.position.copy(supersonic.route[0]);

// 1.2x the player's own top speed — genuinely faster than you can run once
// it's alert, so outrunning it in a straight line never works.
const SUPERSONIC_SPEED = RUN_SPEED * 1.2;

function tickSupersonic(dt, playerPos) {
  const m = supersonic;
  const toPlayer = new THREE.Vector3().subVectors(playerPos, m.group.position);
  const dist = toPlayer.length();
  const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dirToM = new THREE.Vector3().subVectors(m.group.position, playerPos).normalize();
  const seen = dist < 20 && camForward.dot(dirToM) > 0.88;

  if (dist < 6 || seen) { m.alert = true; m.alertTimer = 4; }
  else if (m.alertTimer > 0) m.alertTimer -= dt;
  else m.alert = false;

  // Stays put until alert -- no patrol wandering.
  if (m.alert && dist > 0.01) {
    m.group.position.add(toPlayer.normalize().multiplyScalar(SUPERSONIC_SPEED * dt));
  }
  clampToSafeZone(m.group.position);
  m.group.position.y = groundHeight(m.group.position.x, m.group.position.z) + (m.group.userData.hoverHeight || 0);
  m.group.lookAt(playerPos.x, m.group.position.y, playerPos.z);
  updateSupersonicMusic(dist);
  return { dist, danger: m.alert ? Math.max(0, 1 - dist / 9) : 0, catchR: m.catchR, type: 'supersonic' };
}

const hotCheeto = {
  group: createHotCheetoModel(),
  route: [new THREE.Vector3(-70, 0, 70)], // northwest corner, far from Supersonic
  idx: 0, alert: false, alertTimer: 0, catchR: 2.8, // bigger body, bigger forgiving hitbox
};
scene.add(hotCheeto.group);
hotCheeto.group.position.copy(hotCheeto.route[0]);

function tickHotCheeto(dt, playerPos) {
  const m = hotCheeto;
  const toPlayer = new THREE.Vector3().subVectors(playerPos, m.group.position);
  const dist = toPlayer.length();
  const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dirToM = new THREE.Vector3().subVectors(m.group.position, playerPos).normalize();
  const seen = dist < 24 && camForward.dot(dirToM) > 0.86; // bigger body, easier to spot

  if (dist < 8 || seen) { m.alert = true; m.alertTimer = 4; }
  else if (m.alertTimer > 0) m.alertTimer -= dt;
  else m.alert = false;

  // Stays put until alert -- no patrol wandering. Same top speed as Supersonic.
  if (m.alert && dist > 0.01) {
    m.group.position.add(toPlayer.normalize().multiplyScalar(SUPERSONIC_SPEED * dt));
  }
  clampToSafeZone(m.group.position);
  m.group.position.y = groundHeight(m.group.position.x, m.group.position.z) + (m.group.userData.hoverHeight || 0);
  m.group.lookAt(playerPos.x, m.group.position.y, playerPos.z);
  return { dist, danger: m.alert ? Math.max(0, 1 - dist / 12) : 0, catchR: m.catchR, type: 'hotcheeto' };
}

/* ---------------- audio ---------------- */
/* Everything here is generated live with oscillators/noise buffers, same
 * "no asset files" rule as the rest of the project — no mp3s, no fetches. */

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Supersonic's "plays music when close": a small neon arpeggio that fades
// in as it closes the distance, audible well before it's actually alert.
const SUPERSONIC_MUSIC_RANGE = 26;
const supersonicNotes = [392, 523.25, 440, 659.25, 523.25, 440, 392, 587.33];
let supersonicNoteIdx = 0;
let supersonicNoteTimer = 0;
let supersonicMusicGain = null;

function updateSupersonicMusic(dist) {
  const ctx = audioCtx; // only once the player has interacted — don't force-start audio
  if (!ctx) return;
  if (!supersonicMusicGain) {
    supersonicMusicGain = ctx.createGain();
    supersonicMusicGain.gain.value = 0;
    supersonicMusicGain.connect(ctx.destination);
  }
  const target = Math.max(0, 1 - dist / SUPERSONIC_MUSIC_RANGE) * 0.35;
  supersonicMusicGain.gain.setTargetAtTime(target, ctx.currentTime, 0.2);

  supersonicNoteTimer -= 1 / 60;
  if (target > 0.01 && supersonicNoteTimer <= 0) {
    supersonicNoteTimer = 0.22;
    const freq = supersonicNotes[supersonicNoteIdx % supersonicNotes.length];
    supersonicNoteIdx++;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g).connect(supersonicMusicGain);
    const now = ctx.currentTime;
    g.gain.linearRampToValueAtTime(0.6, now + 0.02);
    g.gain.linearRampToValueAtTime(0, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

// Distinct jumpscare stings per monster — no shared sound.
function playScare(type) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  if (type === 'supersonic') {
    // A harsh pitch-dropping scream plus a noise burst under it.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1500, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.85, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.6);

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    noise.connect(ng).connect(master);
    noise.start(now);
  } else if (type === 'hotcheeto') {
    // A low growl sliding down, then a short noisy "chomp" thump.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, now);
    g.gain.exponentialRampToValueAtTime(0.2, now + 0.45);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.5);

    const chompBuf = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
    const data = chompBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const chomp = ctx.createBufferSource();
    chomp.buffer = chompBuf;
    const cg = ctx.createGain();
    cg.gain.value = 0.9;
    chomp.connect(cg).connect(master);
    chomp.start(now + 0.5);
  }
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
  ensureAudio();
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
const jumpscareEl = document.getElementById('jumpscare-flash');

function resetAfterCatch() {
  camera.position.copy(SPAWN);
  velocity.set(0, 0, 0);
  onGround = true;
  supersonic.group.position.copy(supersonic.route[0]);
  supersonic.alert = false; supersonic.alertTimer = 0;
  hotCheeto.group.position.copy(hotCheeto.route[0]);
  hotCheeto.alert = false; hotCheeto.alertTimer = 0;
}

const monstersByType = { supersonic, hotcheeto: hotCheeto };
const SCARE_DURATION = { supersonic: 0.8, hotcheeto: 0.9 };

let scareActive = false;

// The catch itself: the thing that got you snaps right into your face
// (not a generic flash) — a scream, a close-up, your own HUD frozen on
// it — before the usual reset to the treehouse.
function triggerJumpscare(type) {
  if (scareActive) return;
  scareActive = true;
  const m = monstersByType[type];

  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const facePos = camera.position.clone().addScaledVector(dir, 0.85);
  m.group.position.copy(facePos);
  m.group.lookAt(camera.position);

  playScare(type);
  jumpscareEl.className = '';
  void jumpscareEl.offsetWidth; // restart the CSS animation even if it just played
  jumpscareEl.classList.add('show', 'scare-' + type);

  const duration = SCARE_DURATION[type] || 0.6;
  setTimeout(() => {
    jumpscareEl.classList.remove('show', 'scare-' + type);
    scareActive = false;
    resetAfterCatch();
  }, duration * 1000);
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

  if (scareActive) {
    camera.position.x += (Math.random() - 0.5) * 0.05;
    camera.position.y += (Math.random() - 0.5) * 0.05;
  } else if ((controls.isLocked || fallbackLook) && !endScreen.classList.contains('show')) {
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

    const results = [tickSupersonic(dt, camera.position), tickHotCheeto(dt, camera.position)];
    const danger = Math.max(...results.map((r) => r.danger));
    vignette.style.opacity = String(danger);
    const caught = results.find((r) => r.dist < r.catchR);
    if (caught) triggerJumpscare(caught.type);

    const home = Math.sqrt(camera.position.x * camera.position.x) < PLATFORM_HALF &&
      Math.abs(camera.position.z) < PLATFORM_HALF && camera.position.y > PLATFORM_H;
    if (embersFound === embers.length && home) winGame();
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', resizeRenderer);
