// Classic script, not an ES module -- THREE is a global from the plain
// <script src="three.min.js"> tag in world.html. Modules are blocked from
// loading over file:// entirely (no way around it, browser security), so
// this is deliberately NOT `import * as THREE from 'three'` -- that one
// choice is what makes double-clicking world.html actually work.

/* ----------------------------------------------------------------------
 * Hollowtread — free roam, no objective. Spawn is a treehouse (safe zone,
 * holds the bestiary alcove); everything below it — hills, trees, jump
 * pads, the things that hunt at night — is one connected ground, no level
 * breaks, no loading screens.
 * ------------------------------------------------------------------- */

// Everything is wrapped in boot() and only invoked once `THREE` genuinely
// exists (see waitForThreeThenBoot at the bottom of this file). Script-tag
// order alone (three.min.js before this one, no defer/async) *should*
// guarantee that by spec, but it was observed not holding in at least one
// real environment -- THREE ending up defined, just not synchronously
// before this script's first line ran. Polling a few times is cheap
// insurance against that, whatever the exact cause.
function boot() {

const EYE_H = 1.5;          // chimp stands lower than a human
const PLAYER_R = 0.4;
const GRAVITY = -22;
// All 1.5x the original tuning (player speed/jump, and every monster's
// speed with it -- every monster's own speed constant below is derived
// from RUN_SPEED, so scaling this one number scales them all together).
const JUMP_V = 9.6 * 1.5;
const PAD_JUMP_V = 15;
const WALK_SPEED = 8.4 * 1.5;
const RUN_SPEED = 12.8 * 1.5;
const SAFE_R = 20;          // monsters can never come closer to spawn than this

const PLATFORM_H = 3.2;
const PLATFORM_HALF = 6;
const RAMP_HALF_W = 1.6;
const RAMP_Z0 = PLATFORM_HALF;      // ramp starts at the platform edge
const RAMP_Z1 = PLATFORM_HALF + 12; // and reaches the ground 12 units out

// The world's outer boundary wall's radius -- declared up here (not just
// in its own block further down) because Badland's position depends on
// it directly now (see below).
const WALL_R = 120;

// Badland: a desert town that doesn't share the forest's ground at all --
// it sits entirely past the world's own outer boundary wall, reached
// through a hole cut straight into that wall (see the boundary wall's own
// block below, and Badland's own block further down -- both holes line up
// at BADLAND_Z). Two earlier attempts tried fitting it *inside* the
// forest instead (centered at (95,95), then (68,68)) and kept colliding
// with whatever already lived in that spot -- the boundary wall itself,
// a hill, buildings clipping through geometry -- because nowhere inside
// the forest is actually empty space reserved for it. Putting it past the
// wall entirely sidesteps that class of bug for good: nothing else is
// ever placed out here, so there's nothing left to collide with.
const BADLAND_HALF = 100; // 2.5x the original 40 -- safe to just grow since nothing else is ever out here
const BADLAND_HOLE_HALF_W = 2.5; // shared by both the boundary wall's hole and Badland's own
// A winding tunnel (random turns, see buildWindingTunnel() further down)
// now fills the gap between the two holes instead of them sitting flush
// against each other -- TUNNEL_LEN is that gap's length.
const TUNNEL_LEN = 30;
const BADLAND_X = WALL_R + 1 + TUNNEL_LEN + BADLAND_HALF;
const BADLAND_Z = 0;

// Jungle: same idea as Badland now -- its own separate section entirely
// past the world's outer boundary wall, reached through a hole cut into
// that wall (see the boundary wall's own block below, and Jungle's own
// block further down -- both holes line up at JUNGLE_Z), not a themed
// pocket of the same forest ground. Put on the WEST side specifically so
// it doesn't share a wall or a hole with Badland (which already owns the
// east side). Unlike Badland's flat desert, Jungle keeps its own small
// rolling hills inside -- it gets its own hilly ground mesh further down
// rather than a flat plane, since it's now well past GROUND_EXTENT too.
const JUNGLE_HALF = 88; // 2.5x the original 35, same reasoning as Badland's
const JUNGLE_HOLE_HALF_W = 2.5; // shared by both the boundary wall's hole and Jungle's own
const JUNGLE_X = -(WALL_R + 1 + TUNNEL_LEN + JUNGLE_HALF);
const JUNGLE_Z = 0;

// City: reached a completely different way -- a hole in the treehouse
// deck itself, with a ladder down (see the deck's own block further
// down), not a hole in the world's boundary wall. The ladder only drops
// you to ground level right under the treehouse; from there a corridor
// (same buildWindingTunnel()) leads out to the building itself, which
// sits well south of the forest's own tree/hill/platform footprint (all
// of which stays within roughly |x|<=70, -60<=z<=80, except two platform
// loops near z=-31..-83) -- wide and shallow rather than square so it
// clears those loops by sitting entirely south of z=-85, not by
// out-running them in x.
// LADDER_Z = 0 is deliberate, not arbitrary: the corridor down from it
// has to cross the spawn stockade wall's own collision ring (radius
// SPAWN_WALL_R = 19 around the origin), and the only gaps in that ring
// are its 4 gates -- this one lines up with the west gate (x=-19, z=0)
// rather than the south gate, since the south gate's own approach is
// already the ramp's footprint (x in [-1.6,1.6], z in [-18,-6]), which
// would otherwise collide with the corridor the same way Badland/Jungle
// once collided with things already living where they were first placed.
const LADDER_X = -3, LADDER_Z = 0, LADDER_HOLE_HALF = 0.7;
const GATE_CROSS_X = -30; // past the ring (radius 19) through the west gate
const CITY_X = GATE_CROSS_X, CITY_Z = -98;
const CITY_HALF_X = 70, CITY_HALF_Z = 11;
const CITY_HOLE_HALF_W = 2.2;

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
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.028); // matches the sky so the fade-out has no visible seam

// Sky/fog color smoothly lerps toward whichever of these three the player
// is actually standing in (see the lerp in animate()) -- pitch black in
// the forest, a dark sunrise orange in Badland, a dark blue in Jungle.
const SKY_FOREST = new THREE.Color(0x000000);
const SKY_BADLAND = new THREE.Color(0x4a1f06);
const SKY_JUNGLE = new THREE.Color(0x060a1c);
const SKY_CITY = new THREE.Color(0x12151a);
function skyTargetFor(x, z) {
  if (Math.abs(x - BADLAND_X) <= BADLAND_HALF && Math.abs(z - BADLAND_Z) <= BADLAND_HALF) return SKY_BADLAND;
  if (Math.abs(x - JUNGLE_X) <= JUNGLE_HALF && Math.abs(z - JUNGLE_Z) <= JUNGLE_HALF) return SKY_JUNGLE;
  if (Math.abs(x - CITY_X) <= CITY_HALF_X && Math.abs(z - CITY_Z) <= CITY_HALF_Z) return SKY_CITY;
  return SKY_FOREST;
}

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

const flashlight = new THREE.SpotLight(0xfff1cf, 8.5, 40, Math.PI / 4.3, 0.5, 1.2);
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

function makeGrainTexture({ size = 96, dark = 150, light = 255, repeat = 6, blotch = 3 } = {}) {
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

// A sign's lettering, same "drawn on a canvas, not a fetched image"
// discipline as the grain textures above.
function makeTextTexture(text, { width = 512, height = 160, bg = '#1a1510', fg = '#e8c77a' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, width - 20, height - 20);
  ctx.fillStyle = fg;
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

const woodMat = new THREE.MeshStandardMaterial({ color: 0x4e3a26, roughness: 0.95, map: makeGrainTexture({ dark: 140, light: 235, repeat: 7, blotch: 4 }) });
const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x241b12, roughness: 1, map: makeGrainTexture({ dark: 110, light: 220, repeat: 5, blotch: 3 }) });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x15210f, roughness: 1, map: makeGrainTexture({ dark: 120, light: 255, repeat: 6, blotch: 2 }) });
const groundMat = new THREE.MeshStandardMaterial({ color: 0x24401c, roughness: 1, map: makeGrainTexture({ size: 192, dark: 90, light: 255, repeat: 48, blotch: 2 }) });
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
  // Jungle's own small hills -- gentler bumps than the forest's big ones
  // above (amp 4-6 here vs. 13-22 there), scattered through Jungle's own
  // zone (offsets from JUNGLE_X/Z, which is now well past the boundary
  // wall -- see JUNGLE_X's own comment above).
  { x: JUNGLE_X - 15, z: JUNGLE_Z - 10, amp: 5, r: 10 },
  { x: JUNGLE_X - 22, z: JUNGLE_Z + 12, amp: 6, r: 11 },
  { x: JUNGLE_X + 8, z: JUNGLE_Z - 18, amp: 4, r: 9 },
  { x: JUNGLE_X - 5, z: JUNGLE_Z + 20, amp: 5, r: 9 },
];

function baseHillHeight(x, z) {
  let h = 0;
  for (const hill of hills) {
    const dx = x - hill.x, dz = z - hill.z;
    h += hill.amp * Math.exp(-(dx * dx + dz * dz) / (2 * hill.r * hill.r));
  }
  return h;
}

// Small rectangular patches forced flat (y=0) regardless of any hill
// bump that happens to fall under them -- used for the floor of each
// Jungle temple/dungeon, registered when that temple is actually built
// (further down the file, well before groundHeight() is ever called for
// real at runtime -- this array only needs to be populated before the
// first *call*, not before this function is *defined*).
const flatZones = []; // { minX, maxX, minZ, maxZ }
function registerFlatZone(minX, maxX, minZ, maxZ) { flatZones.push({ minX, maxX, minZ, maxZ }); }

function groundHeight(x, z) {
  // The ladder hole -- checked before the deck's own flat-platform check
  // below, so this one small patch of the deck reports ground level (0)
  // instead of the deck height, and walking onto it without climbing the
  // ladder means falling straight through.
  if (Math.abs(x - LADDER_X) <= LADDER_HOLE_HALF && Math.abs(z - LADDER_Z) <= LADDER_HOLE_HALF) {
    return 0;
  }
  // Ramp runs along -z (south face of the platform, toward the open forest).
  if (Math.abs(x) <= RAMP_HALF_W && z <= -RAMP_Z0 && z >= -RAMP_Z1) {
    const t = (-z - RAMP_Z0) / (RAMP_Z1 - RAMP_Z0); // 0 at platform edge, 1 at ground
    return THREE.MathUtils.lerp(PLATFORM_H, 0, THREE.MathUtils.clamp(t, 0, 1));
  }
  if (Math.abs(x) <= PLATFORM_HALF && Math.abs(z) <= PLATFORM_HALF) {
    return PLATFORM_H;
  }
  // Badland: flat desert, no hills.
  if (Math.abs(x - BADLAND_X) <= BADLAND_HALF && Math.abs(z - BADLAND_Z) <= BADLAND_HALF) {
    return 0;
  }
  // City: flat floor, same deal.
  if (Math.abs(x - CITY_X) <= CITY_HALF_X && Math.abs(z - CITY_Z) <= CITY_HALF_Z) {
    return 0;
  }
  for (const fz of flatZones) {
    if (x >= fz.minX && x <= fz.maxX && z >= fz.minZ && z <= fz.maxZ) return 0;
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
  const wallMat2 = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 1, map: makeGrainTexture({ dark: 70, light: 190, repeat: 40, blotch: 3 }) });
  function boundaryWall(x0, x1, z0, z1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 12, z1 - z0), wallMat2);
    mesh.position.set((x0 + x1) / 2, 6, (z0 + z1) / 2);
    scene.add(mesh);
    boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 12, z1)));
  }
  boundaryWall(-WALL_R - 1, WALL_R + 1, -WALL_R - 1, -WALL_R + 1); // south
  boundaryWall(-WALL_R - 1, WALL_R + 1, WALL_R - 1, WALL_R + 1);   // north

  // East wall: split around a hole at BADLAND_Z -- the only way out to
  // Badland, which sits just past this same wall. A lintel caps the
  // opening at a normal doorway height instead of leaving the full
  // 12-unit wall height open -- visual only, same as every other lintel
  // in this file. collidesAt() only ever checks x/z, never y, so a
  // collider here (even one meant to float above head height) would
  // block the doorway at every height, not just above it -- a real bug
  // this shipped with once already (the "invisible barrier" in front of
  // this hole was exactly this).
  boundaryWall(WALL_R - 1, WALL_R + 1, -WALL_R - 1, BADLAND_Z - BADLAND_HOLE_HALF_W);
  boundaryWall(WALL_R - 1, WALL_R + 1, BADLAND_Z + BADLAND_HOLE_HALF_W, WALL_R + 1);
  {
    const holeH = 4.5;
    const lintelH = 12 - holeH;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2, lintelH, BADLAND_HOLE_HALF_W * 2), wallMat2);
    lintel.position.set(WALL_R, holeH + lintelH / 2, BADLAND_Z);
    scene.add(lintel);
  }

  // West wall: same deal, split around a hole at JUNGLE_Z -- the only way
  // out to Jungle, which sits just past this same wall on the other side.
  boundaryWall(-WALL_R - 1, -WALL_R + 1, -WALL_R - 1, JUNGLE_Z - JUNGLE_HOLE_HALF_W);
  boundaryWall(-WALL_R - 1, -WALL_R + 1, JUNGLE_Z + JUNGLE_HOLE_HALF_W, WALL_R + 1);
  {
    const holeH = 4.5;
    const lintelH = 12 - holeH;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2, lintelH, JUNGLE_HOLE_HALF_W * 2), wallMat2);
    lintel.position.set(-WALL_R, holeH + lintelH / 2, JUNGLE_Z);
    scene.add(lintel);
  }
}

// A small sign mounted on the wall's forest-facing surface, right above
// each hole -- the only hint either gap exists at all, labelling it
// before anyone actually walks through.
function buildEntranceSign(x, z, normalX, text, fg) {
  const tex = makeTextTexture(text, { fg });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), mat);
  sign.position.set(x, 5.3, z);
  sign.rotation.y = normalX > 0 ? Math.PI / 2 : -Math.PI / 2;
  scene.add(sign);
}
buildEntranceSign(WALL_R - 1.05, BADLAND_Z, -1, 'BADLAND', '#e8c77a');
buildEntranceSign(-WALL_R + 1.05, JUNGLE_Z, 1, 'JUNGLE', '#9fe8c9');

// A winding corridor between two points that share either the same x or
// the same z -- the forest-side boundary wall hole and Badland's/Jungle's
// own wall hole, in practice. Built as 5 straight legs with two 90-degree
// jogs partway through (randomized length and left/right via rand()),
// instead of one straight hallway. The second jog always exactly cancels
// the first, so the path reaches the exact end point regardless of how
// the jogs land -- no maze-solving needed, just pick random jogs and let
// the last leg close the gap.
//
// Two real bugs lived here before this version: (1) the ceiling got its
// own collider "above head height" -- but collidesAt() only ever checks
// x/z, never y, so that collider blocked the *entire corridor* at every
// height, including the floor, which read as an invisible wall right at
// the entrance. (2) each straight leg only covered its own exact span,
// which left a real gap -- missing floor, walls, and ceiling alike --
// at every turn, wide enough to see or fall through. Ceilings are now
// visual-only, and every turn gets an explicit junction() room sized to
// the full corridor width with solid walls on every side except the two
// the corridor actually continues through.
// Shared by buildWindingTunnel() and any one-off elbow joint built outside
// it (City's connector needs one of its own -- see below): the primitives
// for a corridor's straight legs and its 90-degree turn rooms.
function makeCorridorBuilder(holeHalfW, wallH, mat) {
  const wallT = 0.5;

  function wallBox(bx0, bx1, bz0, bz1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0, wallH, bz1 - bz0), mat);
    mesh.position.set((bx0 + bx1) / 2, wallH / 2, (bz0 + bz1) / 2);
    scene.add(mesh);
    boxColliders.push(new THREE.Box3(new THREE.Vector3(bx0, 0, bz0), new THREE.Vector3(bx1, wallH, bz1)));
  }
  function floorCeil(minX, maxX, minZ, maxZ) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.15, maxZ - minZ), mat);
    floor.position.set((minX + maxX) / 2, 0.08, (minZ + maxZ) / 2);
    scene.add(floor);
    registerFlatZone(minX, maxX, minZ, maxZ);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.2, maxZ - minZ), mat);
    ceil.position.set((minX + maxX) / 2, wallH, (minZ + maxZ) / 2);
    scene.add(ceil); // visual only -- collidesAt() has no y-axis, a collider here would block the floor too
  }

  function segment(p0, p1) {
    const sx = p1.x - p0.x, sz = p1.z - p0.z;
    if (Math.hypot(sx, sz) < 0.05) return;
    const alongX = Math.abs(sx) >= Math.abs(sz);
    const minX = Math.min(p0.x, p1.x), maxX = Math.max(p0.x, p1.x);
    const minZ = Math.min(p0.z, p1.z), maxZ = Math.max(p0.z, p1.z);
    if (alongX) {
      const cz = p0.z;
      wallBox(minX, maxX, cz - holeHalfW - wallT, cz - holeHalfW);
      wallBox(minX, maxX, cz + holeHalfW, cz + holeHalfW + wallT);
      floorCeil(minX, maxX, cz - holeHalfW, cz + holeHalfW);
    } else {
      const cx = p0.x;
      wallBox(cx - holeHalfW - wallT, cx - holeHalfW, minZ, maxZ);
      wallBox(cx + holeHalfW, cx + holeHalfW + wallT, minZ, maxZ);
      floorCeil(cx - holeHalfW, cx + holeHalfW, minZ, maxZ);
    }
  }

  // A square "room" at each turn, solid on every side except the two
  // directions (unit vectors, always axis-aligned here) a corridor
  // actually continues through.
  function junction(p, openDirs) {
    const minX = p.x - holeHalfW, maxX = p.x + holeHalfW;
    const minZ = p.z - holeHalfW, maxZ = p.z + holeHalfW;
    const isOpen = (ddx, ddz) => openDirs.some((d) => d.x === ddx && d.z === ddz);
    if (!isOpen(-1, 0)) wallBox(minX - wallT, minX, minZ - wallT, maxZ + wallT);
    if (!isOpen(1, 0)) wallBox(maxX, maxX + wallT, minZ - wallT, maxZ + wallT);
    if (!isOpen(0, -1)) wallBox(minX - wallT, maxX + wallT, minZ - wallT, minZ);
    if (!isOpen(0, 1)) wallBox(minX - wallT, maxX + wallT, maxZ, maxZ + wallT);
    floorCeil(minX - wallT, maxX + wallT, minZ - wallT, maxZ + wallT);
  }

  return { segment, junction };
}

function buildWindingTunnel(x0, z0, x1, z1, holeHalfW, wallH, mat) {
  const dx = x1 - x0, dz = z1 - z0;
  const dist = Math.hypot(dx, dz);
  const fx = dx / dist, fz = dz / dist; // forward unit vector
  const rx = -fz, rz = fx;              // right unit vector (90deg rotate)
  const { segment, junction } = makeCorridorBuilder(holeHalfW, wallH, mat);

  // >=0.3 each (and <0.5 combined) so City's corridor -- which has to
  // clear the spawn stockade wall's collision ring (radius 19) before its
  // first jog, or the jog could clip back into it -- always does, since
  // its own L1 alone (0.3 * ~90) already exceeds 19 well before any
  // lateral movement happens.
  const L1 = dist * (0.3 + rand() * 0.1);
  const L2 = dist * (0.3 + rand() * 0.1);
  const jogMag = 5 + rand() * 4;
  const side = rand() < 0.5 ? 1 : -1;

  const fwd = { x: fx, z: fz };
  const back = { x: -fx, z: -fz };
  const right = { x: rx * side, z: rz * side };
  const left = { x: -rx * side, z: -rz * side };

  const p0 = { x: x0, z: z0 };
  const p1 = { x: x0 + fwd.x * L1, z: z0 + fwd.z * L1 };
  const p2 = { x: p1.x + right.x * jogMag, z: p1.z + right.z * jogMag };
  const p3 = { x: p2.x + fwd.x * L2, z: p2.z + fwd.z * L2 };
  const p4 = { x: p3.x + left.x * jogMag, z: p3.z + left.z * jogMag };
  const p5 = { x: x1, z: z1 };

  segment(p0, p1);
  segment(p1, p2);
  segment(p2, p3);
  segment(p3, p4);
  segment(p4, p5);

  junction(p1, [back, right]);
  junction(p2, [left, fwd]);
  junction(p3, [back, left]);
  junction(p4, [right, fwd]);
}

/* ---------------- spawn perimeter: wooden stockade wall ---------------- */
/* A ring of sharpened log wall around the treehouse/ramp, just inside the
 * SAFE_R monsters can't cross anyway -- a gate, framed by two posts and a
 * lintel with an open hole between them (no center panel at all), sits
 * right where the ramp comes down so leaving never requires squeezing
 * past anything. */
{
  const SPAWN_WALL_R = 19;
  const SEGMENTS = 28;
  const WALL_H = 3.0;
  const WALL_THICK = 0.5;
  const GATE_HALF_ANGLE = 0.12; // wide enough to drop exactly one segment per gate
  // Four gates: south (the ramp) plus three more spaced evenly around the
  // ring, so leaving toward the forest never means a long walk first.
  const GATE_ANGLES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  function nearAnyGate(a) {
    for (const ga of GATE_ANGLES) {
      let d = a - ga;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(d) < GATE_HALF_ANGLE) return true;
    }
    return false;
  }

  const angleStep = (Math.PI * 2) / SEGMENTS;
  const chord = 2 * SPAWN_WALL_R * Math.sin(angleStep / 2);

  for (let i = 0; i < SEGMENTS; i++) {
    const angle = i * angleStep;
    const a = angle > Math.PI ? angle - Math.PI * 2 : angle;
    if (nearAnyGate(a)) continue; // a gate goes here instead

    const cx = SPAWN_WALL_R * Math.sin(angle), cz = -SPAWN_WALL_R * Math.cos(angle);
    const h = groundHeight(cx, cz);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(chord, WALL_H, WALL_THICK), woodDarkMat);
    seg.position.set(cx, h + WALL_H / 2, cz);
    // Negated: three.js's rotation.y maps local +X to world (cos,-sin), not
    // (cos,sin) -- using +angle here pointed each segment along the wrong
    // chord (matching the true tangent only at the four compass points),
    // so the ring looked like disconnected, crossing fence posts instead
    // of a closed wall everywhere in between.
    seg.rotation.y = -angle;
    scene.add(seg);

    // Carved spikes along the top -- a stockade, not a smooth fence.
    for (let s = -1; s <= 1; s++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), woodDarkMat);
      spike.position.set(cx + Math.cos(angle) * s * chord * 0.3, h + WALL_H + 0.25, cz + Math.sin(angle) * s * chord * 0.3);
      scene.add(spike);
    }
  }

  // Collision: a ring of overlapping circle colliders (cheap and rotation-
  // free, unlike the axis-aligned box colliders used elsewhere), gapped at
  // every gate. This used to check distance from angle 0 only, so it
  // correctly opened the south gate but left an invisible wall at the
  // other three -- they looked open (no wall mesh there) but still
  // blocked movement. nearAnyGate() checks all four, same as the wall
  // segments above.
  const COLLIDE_STEPS = 72;
  const collideStep = (Math.PI * 2) / COLLIDE_STEPS;
  for (let i = 0; i < COLLIDE_STEPS; i++) {
    const a0 = i * collideStep;
    const a = a0 > Math.PI ? a0 - Math.PI * 2 : a0;
    if (nearAnyGate(a)) continue;
    addCircleCollider(SPAWN_WALL_R * Math.sin(a0), -SPAWN_WALL_R * Math.cos(a0), WALL_THICK / 2 + 1.0);
  }

  // Each gate's own frame: two posts and a lintel around the hole -- built
  // at all four gate angles now (an earlier version only framed the south
  // one), using the same tangent direction the wall segments themselves
  // use so a post always sits flush with the wall at that point.
  for (const ga of GATE_ANGLES) {
    const cx = SPAWN_WALL_R * Math.sin(ga), cz = -SPAWN_WALL_R * Math.cos(ga);
    const tx = Math.cos(ga), tz = Math.sin(ga);
    const h = groundHeight(cx, cz);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, WALL_H + 0.4, WALL_THICK), woodDarkMat);
      post.position.set(cx + tx * s * (chord / 2 - 0.2), h + (WALL_H + 0.4) / 2, cz + tz * s * (chord / 2 - 0.2));
      post.rotation.y = -ga;
      scene.add(post);
      for (let k = 0; k < 2; k++) {
        const off = s * (chord / 2 - 0.2) + (k - 0.5) * 0.15;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), woodDarkMat);
        spike.position.set(cx + tx * off, h + WALL_H + 0.65, cz + tz * off);
        scene.add(spike);
      }
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(chord + 0.4, 0.35, WALL_THICK), woodDarkMat);
    lintel.position.set(cx, h + WALL_H + 0.2, cz);
    lintel.rotation.y = -ga;
    scene.add(lintel);
  }
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

// A low ring of posts enclosing the tree's own base -- a small fenced
// planter bed around the trunk instead of it just standing bare in the
// open deck.
{
  const ringR = 2.1, posts = 14;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 6), woodDarkMat);
    post.position.set(-4 + Math.cos(a) * ringR, PLATFORM_H + 0.275, -4 + Math.sin(a) * ringR);
    scene.add(post);
  }
  addCircleCollider(-4, -4, ringR - 0.3);
}

// The hole down to City: a dark square cut into the deck (groundHeight()
// already makes this patch fall through to ground level) framed with a
// low curb, plus a real ladder -- two rails and a run of rungs -- spanning
// the full drop. Climbing is handled in movePlayer() itself.
{
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x050504, roughness: 1 });
  const hole = new THREE.Mesh(new THREE.BoxGeometry(LADDER_HOLE_HALF * 2, 0.06, LADDER_HOLE_HALF * 2), holeMat);
  hole.position.set(LADDER_X, PLATFORM_H - 0.02, LADDER_Z);
  scene.add(hole);
  const curb = new THREE.Mesh(new THREE.BoxGeometry(LADDER_HOLE_HALF * 2 + 0.3, 0.1, LADDER_HOLE_HALF * 2 + 0.3), woodDarkMat);
  curb.position.set(LADDER_X, PLATFORM_H + 0.02, LADDER_Z);
  scene.add(curb);

  const railX = LADDER_HOLE_HALF - 0.1;
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, PLATFORM_H, 6), woodDarkMat);
    rail.position.set(LADDER_X + side * railX, PLATFORM_H / 2, LADDER_Z);
    scene.add(rail);
  }
  const rungCount = Math.floor(PLATFORM_H / 0.35);
  for (let i = 0; i < rungCount; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, railX * 2, 6), woodDarkMat);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(LADDER_X, 0.2 + i * 0.35, LADDER_Z);
    scene.add(rung);
  }
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

const faceDetailMat = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 1 });

function createChimpModel({
  bodyColor, bodyEmissive = 0x000000, bodyEmissiveIntensity = 0,
  eyeColor, eyeEmissiveIntensity = 2.5,
  torsoLen = 1.0, headScale = 1, armLen = 0.5, roughness = 0.9, arms = true,
  faceDetails = true, // false skips muzzle/eyes/brow/nostril/pupil/mouth -- a blank head
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

  // Muzzle + ears are what actually read as "chimp" instead of "blob" --
  // the muzzle is skipped below with the rest of the face for a blank-head
  // monster, but ears stay either way (they're part of the head's own
  // silhouette, not a facial feature).
  if (faceDetails) {
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.17 * headScale, 6, 5), mat);
    muzzle.scale.set(1, 0.75, 1.2);
    muzzle.position.set(0, headY - 0.1 * headScale, 0.32 * headScale);
    g.add(muzzle);
  }

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1 * headScale, 6, 5), mat);
    ear.scale.set(0.55, 1, 0.35);
    ear.position.set(side * 0.34 * headScale, headY + 0.03 * headScale, -0.03);
    g.add(ear);
  }

  // Real two-segment jointed arms -- a shoulder pivot swinging an upper arm,
  // an elbow pivot (child of it) swinging a forearm+hand -- instead of one
  // rigid capsule. The upper arm's own outward tilt is what gives it a
  // bent-elbow resting pose even before anything animates. Some creatures
  // (Peanut) skip this entirely -- torso and head only.
  const armPivots = [];    // shoulder joints -- swung by the run cycle
  const elbowPivots = [];  // elbow joints -- swung a beat behind the shoulder
  if (arms) {
    const shoulderY = torso.position.y + torsoHalfH * 0.2;
    const upperLen = armLen * 0.55, foreLen = armLen * 0.55;
    for (const side of [-1, 1]) {
      const armAngle = side * 0.6;
      const shoulder = new THREE.Vector3(side * 0.34, shoulderY, 0.05);
      const pivot = new THREE.Group();
      pivot.position.copy(shoulder);
      g.add(pivot);

      const upperDir = new THREE.Vector3(Math.sin(armAngle), -Math.cos(armAngle), 0);
      const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, upperLen, 4, 6), mat);
      upperArm.rotation.z = armAngle;
      upperArm.position.copy(upperDir.clone().multiplyScalar(upperLen / 2 + 0.05));
      pivot.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.copy(upperDir.clone().multiplyScalar(upperLen + 0.08));
      pivot.add(elbow);

      const foreArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, foreLen, 4, 6), mat);
      foreArm.position.y = -foreLen / 2 - 0.05;
      elbow.add(foreArm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat);
      hand.position.y = -foreLen - 0.09;
      elbow.add(hand);

      armPivots.push(pivot);
      elbowPivots.push(elbow);
    }
  }
  g.userData.armPivots = armPivots;
  g.userData.elbowPivots = elbowPivots;
  g.userData.head = head; // used for a running head-bob, even on armless monsters

  // Pushed out past the head sphere's own radius (0.38*headScale) so they
  // actually protrude and read as eyes instead of being buried inside it.
  // Skipped along with the rest of the face below for a blank-head
  // monster -- no eyes, no glow, nothing looking back at you at all.
  if (faceDetails) {
    const eyeMat = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: eyeEmissiveIntensity });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065 * headScale, 7, 6), eyeMat);
      eye.position.set(side * 0.17 * headScale, headY + 0.03 * headScale, 0.37 * headScale);
      g.add(eye);
    }

    // Brow ridges, nostrils, a mouth line, and pupils -- the glowing eyes
    // alone read as a blank, blind mask; these few extra low-poly details
    // are what actually makes it look like a face looking back at you.
    for (const side of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16 * headScale, 0.045 * headScale, 0.09 * headScale), faceDetailMat);
      brow.position.set(side * 0.17 * headScale, headY + 0.11 * headScale, 0.35 * headScale);
      brow.rotation.z = side * 0.15;
      g.add(brow);

      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.03 * headScale, 5, 4), faceDetailMat);
      nostril.position.set(side * 0.06 * headScale, headY - 0.14 * headScale, 0.44 * headScale);
      g.add(nostril);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032 * headScale, 5, 4), faceDetailMat);
      pupil.position.set(side * 0.17 * headScale, headY + 0.03 * headScale, 0.41 * headScale);
      g.add(pupil);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.17 * headScale, 0.03 * headScale, 0.05 * headScale), faceDetailMat);
    mouth.position.set(0, headY - 0.24 * headScale, 0.41 * headScale);
    g.add(mouth);
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

function createPeanutModel() {
  return createChimpModel({
    bodyColor: 0xc9a06b, eyeColor: 0x3a2a14, eyeEmissiveIntensity: 1.2,
    torsoLen: 1.0, headScale: 1.05, roughness: 0.85, arms: false,
  });
}

/* ---------------- Jungle: Stalker + Wanderer (same chimp factory again) ---------------- */

function createStalkerModel() {
  // torsoLen doubled again on top of the original stretch (3.0 -> 6.0),
  // then the whole model scaled 3x on top of that -- same two-knob
  // combo Hot Cheeto uses (its own proportions, then a flat scale over
  // the top). Near-black with pale glowing eyes, no other color on it at
  // all -- it's meant to read as a shape at the edge of sight long
  // before it's close, now a genuinely huge one.
  const g = createChimpModel({
    bodyColor: 0x05070a, eyeColor: 0xe4ffe8, eyeEmissiveIntensity: 3.2,
    torsoLen: 6.0, headScale: 0.65, armLen: 0.55, roughness: 0.85,
  });
  g.scale.setScalar(3);
  g.userData.hoverHeight *= 3;
  return g;
}

function createWandererModel() {
  // Dark grey, no face at all -- faceDetails: false skips muzzle, eyes,
  // brow, nostril, and mouth, leaving a blank head (ears only).
  return createChimpModel({
    bodyColor: 0x3a3a3d, eyeColor: 0x3a3a3d, eyeEmissiveIntensity: 0,
    torsoLen: 1.0, headScale: 1.0, armLen: 0.5, roughness: 0.95,
    faceDetails: false,
  });
}

function createMonumentModel() {
  // Heavy, concrete-grey, barely-visible eyes -- reads as a statue first
  // and a creature second. Scaled up 1.8x for a genuinely monumental
  // presence; it hardly ever needs to actually move fast, so there's no
  // cost to it looking like it shouldn't be able to.
  const g = createChimpModel({
    bodyColor: 0x55534c, eyeColor: 0x8a8278, eyeEmissiveIntensity: 0.4,
    torsoLen: 1.3, headScale: 1.1, armLen: 0.6, roughness: 1,
  });
  g.scale.setScalar(1.8);
  g.userData.hoverHeight *= 1.8;
  return g;
}

/* ---------------- Badland: desert-town cast (props bolted onto the same
 * chimp factory) ---------------- */
/* headY/torsoY duplicate createChimpModel's own internal math rather than
 * exposing it, since every other prop in that factory (eyes, muzzle, ears)
 * is positioned the same way -- keeping it a pure function of the same
 * torsoLen/headScale inputs instead of reaching into the model afterward. */
function chimpTorsoY(torsoLen) {
  const torsoHalfH = 0.32 * (torsoLen * 0.75);
  return torsoHalfH + 0.15;
}
function chimpHeadY(torsoLen, headScale) {
  const torsoHalfH = 0.32 * (torsoLen * 0.75);
  return chimpTorsoY(torsoLen) + torsoHalfH + 0.3 * headScale;
}

const westernPropMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.8 });
const bandanaMat = new THREE.MeshStandardMaterial({ color: 0x7a1f1f, roughness: 0.9 });

function addCowboyHat(g, headY, headScale) {
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * headScale, 0.42 * headScale, 0.05, 12), westernPropMat);
  brim.position.set(0, headY + 0.34 * headScale, 0);
  g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * headScale, 0.24 * headScale, 0.26 * headScale, 10), westernPropMat);
  crown.position.set(0, headY + 0.5 * headScale, 0);
  g.add(crown);
}

function addBandana(g, headY, headScale) {
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.2 * headScale, 0.045 * headScale, 6, 10), bandanaMat);
  band.position.set(0, headY - 0.1 * headScale, 0.03 * headScale);
  band.rotation.x = Math.PI / 2;
  g.add(band);
}

function addSkullHead(g, headY, headScale) {
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22 * headScale, 7, 6), boneMat);
  skull.position.set(0, headY + 0.4 * headScale, 0);
  g.add(skull);
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.05 * headScale, 5, 4), faceDetailMat);
    socket.position.set(side * 0.08 * headScale, headY + 0.38 * headScale, 0.18 * headScale);
    g.add(socket);
  }
}

function addTail(g, torsoY, color) {
  const tailMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.04, 1.3, 6), tailMat);
  tail.position.set(0, torsoY - 0.1, -0.45);
  tail.rotation.x = 1.0;
  g.add(tail);
}

function createLizardModel() {
  const torsoLen = 1.0, headScale = 1.0;
  const g = createChimpModel({
    bodyColor: 0x5a6b3a, eyeColor: 0xd4ff3a, eyeEmissiveIntensity: 2.5,
    torsoLen, headScale, armLen: 0.55, roughness: 0.85,
  });
  addSkullHead(g, chimpHeadY(torsoLen, headScale), headScale);
  addTail(g, chimpTorsoY(torsoLen), 0x5a6b3a);
  g.scale.setScalar(2); // 2x the player's own size
  g.userData.hoverHeight *= 2;
  return g;
}

function createGunslingerModel() {
  const torsoLen = 1.0, headScale = 1.0;
  const g = createChimpModel({
    bodyColor: 0x6b4a2f, eyeColor: 0x3a2a14, eyeEmissiveIntensity: 1.2,
    torsoLen, headScale, armLen: 0.5, roughness: 0.85,
  });
  addCowboyHat(g, chimpHeadY(torsoLen, headScale), headScale);
  g.scale.setScalar(1.2);
  g.userData.hoverHeight *= 1.2;
  return g;
}

function createOutlawModel() {
  const torsoLen = 1.0, headScale = 1.0;
  const g = createChimpModel({
    bodyColor: 0x4a3a2a, eyeColor: 0x8a1a1a, eyeEmissiveIntensity: 1.5,
    torsoLen, headScale, armLen: 0.5, roughness: 0.85,
  });
  const headY = chimpHeadY(torsoLen, headScale);
  addCowboyHat(g, headY, headScale);
  addBandana(g, headY, headScale);
  return g; // same size as the player's own chimp body
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

/* ---------------- bestiary pedestals (inside the alcove) ---------------- */
/* Pedestals are fixed furniture and stay put; which monsters stand on them
 * is a "page" that switches when you're standing close and press E --
 * one page per map (this forest, then Badland) rather than cramming
 * every monster from every area onto the same stands forever. */

const bestiaryPages = [
  { title: 'THIS FOREST', monsters: [
      { name: 'Supersonic', make: createSupersonicModel },
      { name: 'Hot Cheeto', make: createHotCheetoModel },
      { name: 'Peanut', make: createPeanutModel },
    ] },
  { title: 'BADLAND', monsters: [
      { name: 'Lizard', make: createLizardModel },
      { name: 'Gunslinger', make: createGunslingerModel },
      { name: 'Outlaw', make: createOutlawModel },
    ] },
  { title: 'JUNGLE', monsters: [
      { name: 'Stalker', make: createStalkerModel },
      { name: 'Wanderer', make: createWandererModel },
    ] },
  { title: 'CITY', monsters: [
      { name: 'Monument', make: createMonumentModel },
    ] },
];
const BESTIARY_SLOT_X = [-5.4, -4.0, -2.6];
const BESTIARY_Z = 4;

for (const x of BESTIARY_SLOT_X) {
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.8, 10), woodDarkMat);
  pedestal.position.set(x, PLATFORM_H + 0.4, BESTIARY_Z);
  scene.add(pedestal);
}

const spinningMinis = [];
const bestiaryPageGroups = bestiaryPages.map((page) => {
  const group = new THREE.Group();
  page.monsters.forEach((entry, i) => {
    const x = BESTIARY_SLOT_X[i];
    const mini = entry.make();
    mini.scale.set(0.4, 0.4, 0.4);
    mini.position.set(x, PLATFORM_H + 0.8, BESTIARY_Z);
    group.add(mini);
    spinningMinis.push(mini);

    const label = makeLabel(entry.name);
    label.position.set(x, PLATFORM_H + 2.15, BESTIARY_Z);
    group.add(label);
  });
  const title = makeLabel(page.title);
  title.scale.set(1.9, 0.45, 1);
  title.position.set(-4.0, PLATFORM_H + 2.75, BESTIARY_Z);
  group.add(title);
  scene.add(group);
  return group;
});

let bestiaryPageIndex = 0;
function showBestiaryPage(i) {
  bestiaryPageIndex = ((i % bestiaryPageGroups.length) + bestiaryPageGroups.length) % bestiaryPageGroups.length;
  bestiaryPageGroups.forEach((g, idx) => { g.visible = idx === bestiaryPageIndex; });
}
showBestiaryPage(0);
const bestiaryCenter = new THREE.Vector3(-4.0, PLATFORM_H + EYE_H, BESTIARY_Z);

/* ---------------- old computer + keyboard (color/name customizer) ---------------- */
/* An old CRT-style desk setup on the deck, in the one quadrant nothing
 * else already uses (the alcove owns the northwest corner, the tree owns
 * the southwest, the stilts sit at all four corners) -- standing close
 * and pressing E opens a panel to change the first-person arms' color
 * (a hue slider -- "a color scale", not a full Gorilla-Tag-style 3D
 * picker, which this engine has no raycast-UI system to support) and set
 * a display name, both persisted in localStorage. */

const deskMat = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.9 });
const monitorMat = new THREE.MeshStandardMaterial({ color: 0xcac6b8, roughness: 0.7 });
const screenMat = new THREE.MeshStandardMaterial({ color: 0x0a1a12, emissive: 0x1fae7a, emissiveIntensity: 0.9, roughness: 0.4 });
const keyboardMat = new THREE.MeshStandardMaterial({ color: 0xb9b5a8, roughness: 0.8 });

const DESK_X = 3, DESK_Z = 3;
{
  const topY = PLATFORM_H + 0.75;
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.0), deskMat);
  desk.position.set(DESK_X, topY, DESK_Z);
  scene.add(desk);
  for (const [lx, lz] of [[-0.75, -0.45], [0.75, -0.45], [-0.75, 0.45], [0.75, 0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.06), deskMat);
    leg.position.set(DESK_X + lx, PLATFORM_H + 0.375, DESK_Z + lz);
    scene.add(leg);
  }
  // Boxy old CRT body + a glowing screen face.
  const monBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.5), monitorMat);
  monBody.position.set(DESK_X, topY + 0.265, DESK_Z - 0.15);
  scene.add(monBody);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), screenMat);
  screen.position.set(DESK_X, topY + 0.265, DESK_Z - 0.15 + 0.26);
  scene.add(screen);
  const screenGlow = new THREE.PointLight(0x2fd69a, 1.4, 6, 2);
  screenGlow.position.set(DESK_X, topY + 0.4, DESK_Z);
  scene.add(screenGlow);
  // Keyboard, out front where you'd actually reach to press it.
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.16), keyboardMat);
  keyboard.position.set(DESK_X, topY + 0.06, DESK_Z + 0.3);
  scene.add(keyboard);
  for (let row = 0; row < 3; row++) {
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.015, 0.03), deskMat);
    key.position.set(DESK_X, topY + 0.085, DESK_Z + 0.24 + row * 0.045);
    scene.add(key);
  }
  boxColliders.push(new THREE.Box3(
    new THREE.Vector3(DESK_X - 0.85, PLATFORM_H, DESK_Z - 0.5),
    new THREE.Vector3(DESK_X + 0.85, PLATFORM_H + 1.1, DESK_Z + 0.5)
  ));
}
const keyboardCenter = new THREE.Vector3(DESK_X, PLATFORM_H + EYE_H, DESK_Z + 0.3);

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
  const TREE_SCALE = 2; // trees stand twice as tall/thick as they used to
  const trunkH = (3 + rand() * 2.5) * TREE_SCALE;
  const r = (0.3 + rand() * 0.25) * TREE_SCALE;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, trunkH, 7), trunkMat);
  t.position.set(x, h + trunkH / 2, z);
  scene.add(t);
  addCircleCollider(x, z, r + 0.15);

  // One or two bare branches per tree, jutting out at random heights/angles.
  const branchCount = rand() < 0.4 ? 2 : 1;
  for (let b = 0; b < branchCount; b++) {
    const angle = rand() * Math.PI * 2;
    const len = (1.6 + rand() * 1.3) * TREE_SCALE;
    const branchH = h + trunkH * (0.4 + rand() * 0.45);
    const tilt = (rand() - 0.5) * 0.6 * TREE_SCALE;
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

/* ---------------- platform network: connected platforms + bridges ---------------- */
/* A loop of elevated wooden platforms north of the treehouse, each one
 * walkable, linked to its neighbors by flat bridge walkways -- reuses the
 * exact same branchPlatforms support system the tree branches use, so
 * landing/walking on any of it works identically. Height stays low enough
 * (just above a normal jump) to reach straight from the ground. */

function addFlatPlatform(cx, cz, half) {
  const cy = groundHeight(cx, cz) + 2.2;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.3, half * 2), woodMat);
  mesh.position.set(cx, cy, cz);
  scene.add(mesh);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, cy, 6), woodDarkMat);
    post.position.set(cx + sx * (half - 0.2), cy / 2, cz + sz * (half - 0.2));
    scene.add(post);
  }
  branchPlatforms.push({ x0: cx - half, x1: cx + half, z0: cz - half, z1: cz + half, y: cy + 0.15 });
  return cy;
}

function addBridge(x0, z0, y0, x1, z1, y1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const midY = (y0 + y1) / 2;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, len), woodMat);
  mesh.position.set((x0 + x1) / 2, midY, (z0 + z1) / 2);
  mesh.rotation.y = Math.atan2(dx, dz);
  scene.add(mesh);
  const margin = 1.0; // generous -- walking off the edge of a thin bridge isn't fun
  branchPlatforms.push({
    x0: Math.min(x0, x1) - margin, x1: Math.max(x0, x1) + margin,
    z0: Math.min(z0, z1) - margin, z1: Math.max(z0, z1) + margin,
    y: midY + 0.15,
  });
}

// One loop builder, called at several spots across the map instead of
// just the one north of the treehouse -- same diamond-of-4 shape each
// time, just re-centered and re-sized, so the network reads as something
// that recurs through the whole forest rather than a single landmark.
function buildPlatformLoop(cx, cz, rx = 14, rz = 12) {
  const nodes = [
    { x: cx, z: cz + rz }, { x: cx - rx, z: cz }, { x: cx, z: cz - rz }, { x: cx + rx, z: cz },
  ];
  const nodeY = nodes.map((n) => addFlatPlatform(n.x, n.z, 2.4));
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    addBridge(a.x, a.z, nodeY[i], b.x, b.z, nodeY[(i + 1) % nodes.length]);
  }
}

buildPlatformLoop(0, 34);            // original -- north of the treehouse
buildPlatformLoop(55, -40, 13, 13);  // southeast, near Supersonic's corner
buildPlatformLoop(-55, 45, 13, 11);  // northwest, near Hot Cheeto's corner
buildPlatformLoop(40, 50, 12, 12);   // northeast, near Peanut's corner
buildPlatformLoop(-45, -45, 14, 14); // southwest
buildPlatformLoop(20, -70, 11, 13);  // far south

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

/* ---------------- Badland (desert town past the east boundary wall) ---------------- */

const sandMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 1, map: makeGrainTexture({ size: 150, dark: 150, light: 255, repeat: 30, blotch: 2 }) });
const cactusMat = new THREE.MeshStandardMaterial({ color: 0x3f7d4f, roughness: 0.9 });

{
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(BADLAND_HALF * 2, BADLAND_HALF * 2), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BADLAND_X, 0.03, BADLAND_Z);
  scene.add(sand);
}

// A wooden perimeter wall around the whole town -- Badland is its own
// separate section, not just an open patch of sand you wander into. The
// only way in is a hole in the west wall, lined up with the boundary
// wall's own hole a few units away across a short stretch of open ground
// -- walk through one and you're immediately at the other.
// Shared by Badland's and Jungle's own perimeter walls: a "rugged" wall
// run built from several shorter segments with independently randomized
// heights (an uneven, weathered skyline) instead of one perfectly
// flat-topped box. The collider stays a single uniform box at the full
// target height regardless of that jagged top -- it's visual only, never
// a gap a player could climb through.
function buildRuggedWall(x0, x1, z0, z1, baseH, mat) {
  const alongX = (x1 - x0) >= (z1 - z0);
  if (alongX) {
    let cx = x0;
    while (cx < x1 - 0.01) {
      const segLen = Math.min(2 + rand() * 2.5, x1 - cx);
      const segH = baseH * (0.78 + rand() * 0.5);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(segLen, segH, z1 - z0), mat);
      mesh.position.set(cx + segLen / 2, segH / 2, (z0 + z1) / 2);
      scene.add(mesh);
      cx += segLen;
    }
  } else {
    let cz = z0;
    while (cz < z1 - 0.01) {
      const segLen = Math.min(2 + rand() * 2.5, z1 - cz);
      const segH = baseH * (0.78 + rand() * 0.5);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, segH, segLen), mat);
      mesh.position.set((x0 + x1) / 2, segH / 2, cz + segLen / 2);
      scene.add(mesh);
      cz += segLen;
    }
  }
  boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, baseH, z1)));
}

const BADLAND_WALL_H = 9.0;
function badlandWallBox(x0, x1, y0, y1, z0, z1) {
  buildRuggedWall(x0, x1, z0, z1, y1, woodDarkMat);
}
{
  const bMinX = BADLAND_X - BADLAND_HALF, bMaxX = BADLAND_X + BADLAND_HALF;
  const bMinZ = BADLAND_Z - BADLAND_HALF, bMaxZ = BADLAND_Z + BADLAND_HALF;
  const wallT = 0.6;
  badlandWallBox(bMinX, bMaxX, 0, BADLAND_WALL_H, bMaxZ - wallT, bMaxZ); // north
  badlandWallBox(bMinX, bMaxX, 0, BADLAND_WALL_H, bMinZ, bMinZ + wallT); // south
  badlandWallBox(bMaxX - wallT, bMaxX, 0, BADLAND_WALL_H, bMinZ, bMaxZ); // east (dead end)
  // West wall, split around the hole.
  badlandWallBox(bMinX, bMinX + wallT, 0, BADLAND_WALL_H, bMinZ, BADLAND_Z - BADLAND_HOLE_HALF_W);
  badlandWallBox(bMinX, bMinX + wallT, 0, BADLAND_WALL_H, BADLAND_Z + BADLAND_HOLE_HALF_W, bMaxZ);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(wallT, 1.2, BADLAND_HOLE_HALF_W * 2), woodDarkMat);
  lintel.position.set(bMinX + wallT / 2, BADLAND_WALL_H - 0.6, BADLAND_Z);
  scene.add(lintel);
}

// The winding tunnel connecting the forest's own boundary-wall hole to
// this one.
buildWindingTunnel(WALL_R + 1, BADLAND_Z, BADLAND_X - BADLAND_HALF, BADLAND_Z, BADLAND_HOLE_HALF_W, 4.5, woodDarkMat);

// Hollow false-front buildings -- walls + a doorway + a roof you can see
// under but never collide with (no ceiling anywhere else in this game
// either), so walking in is as simple as walking in.
function buildWesternBuilding(cx, cz, halfW, halfD) {
  const minX = cx - halfW, maxX = cx + halfW, minZ = cz - halfD, maxZ = cz + halfD;
  const wallT = 0.3, wallH = 4.2, doorHalfW = 1.3;
  function wall(x0, x1, z0, z1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, wallH, z1 - z0), woodDarkMat);
    mesh.position.set((x0 + x1) / 2, wallH / 2, (z0 + z1) / 2);
    scene.add(mesh);
    boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, wallH, z1)));
  }
  wall(minX, maxX, maxZ - wallT, maxZ); // north (back) wall
  wall(minX, minX + wallT, minZ, maxZ); // west wall
  wall(maxX - wallT, maxX, minZ, maxZ); // east wall
  wall(minX, cx - doorHalfW, minZ, minZ + wallT); // south wall, west of the door
  wall(cx + doorHalfW, maxX, minZ, minZ + wallT); // south wall, east of the door
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorHalfW * 2, 1.2, wallT), woodDarkMat);
  lintel.position.set(cx, wallH - 0.6, minZ + wallT / 2);
  scene.add(lintel);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.5, 0.2, halfD * 2 + 0.5), woodDarkMat);
  roof.position.set(cx, wallH + 0.1, cz);
  scene.add(roof); // visual only -- no collider, so the room underneath isn't sealed

  const floor = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 - wallT * 2, 0.15, halfD * 2 - wallT * 2), woodMat);
  floor.position.set(cx, 0.08, cz);
  scene.add(floor);
}

buildWesternBuilding(BADLAND_X - 20, BADLAND_Z - 10, 6, 5);
buildWesternBuilding(BADLAND_X + 2, BADLAND_Z - 18, 7, 6);
buildWesternBuilding(BADLAND_X + 22, BADLAND_Z - 8, 5.5, 5);

function makeCactus(x, z) {
  const h = groundHeight(x, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.2, 8), cactusMat);
  trunk.position.set(x, h + 1.1, z);
  scene.add(trunk);
  addCircleCollider(x, z, 0.3);
  if (rand() < 0.7) {
    const side = rand() < 0.5 ? -1 : 1;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.0, 6), cactusMat);
    arm.position.set(x + side * 0.3, h + 1.6, z);
    arm.rotation.z = side * 0.5;
    scene.add(arm);
  }
}
let cactiPlaced = 0;
while (cactiPlaced < 22) {
  const x = BADLAND_X + (rand() - 0.5) * BADLAND_HALF * 1.8;
  const z = BADLAND_Z + (rand() - 0.5) * BADLAND_HALF * 1.8;
  makeCactus(x, z);
  cactiPlaced++;
}

function badlandPoint() {
  const x = BADLAND_X + (rand() - 0.5) * BADLAND_HALF * 1.6;
  const z = BADLAND_Z + (rand() - 0.5) * BADLAND_HALF * 1.6;
  return new THREE.Vector3(x, 0, z);
}
function clampToBadland(pos) {
  pos.x = THREE.MathUtils.clamp(pos.x, BADLAND_X - BADLAND_HALF, BADLAND_X + BADLAND_HALF);
  pos.z = THREE.MathUtils.clamp(pos.z, BADLAND_Z - BADLAND_HALF, BADLAND_Z + BADLAND_HALF);
}

/* ---------------- Jungle (small hills + dense trees + temples, southwest) ---------------- */

const jungleLeafMat = new THREE.MeshStandardMaterial({ color: 0x234d1a, roughness: 1, map: makeGrainTexture({ dark: 110, light: 255, repeat: 6, blotch: 2 }) });
const jungleTrunkMat = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 1, map: makeGrainTexture({ dark: 90, light: 210, repeat: 8, blotch: 3 }) });
const templeStoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5648, roughness: 1, map: makeGrainTexture({ dark: 90, light: 200, repeat: 20, blotch: 3 }) });
const jungleWallMat = new THREE.MeshStandardMaterial({ color: 0x3f4a35, roughness: 1, map: makeGrainTexture({ dark: 70, light: 170, repeat: 25, blotch: 3 }) });

// Jungle's own ground -- past GROUND_EXTENT just like Badland's sand
// plane is, but hilly instead of flat (the small hills registered above
// still apply out here), so it needs real per-vertex displacement from
// the same baseHillHeight() the main terrain mesh uses, not a single
// flat plane.
{
  const segs = 48;
  const jGeo = new THREE.PlaneGeometry(JUNGLE_HALF * 2, JUNGLE_HALF * 2, segs, segs);
  jGeo.rotateX(-Math.PI / 2);
  const pos = jGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, baseHillHeight(pos.getX(i) + JUNGLE_X, pos.getZ(i) + JUNGLE_Z));
  }
  pos.needsUpdate = true;
  jGeo.computeVertexNormals();
  const jGround = new THREE.Mesh(jGeo, groundMat);
  jGround.position.set(JUNGLE_X, 0, JUNGLE_Z);
  scene.add(jGround);
}

// A mossy stone perimeter wall around the whole zone, same idea as
// Badland's wooden one -- entrance is a hole in the east wall, flush
// against the boundary wall's own hole a few units away on the other
// side of the gap.
const JUNGLE_WALL_H = 10.0;
function jungleWallBox(x0, x1, y0, y1, z0, z1) {
  buildRuggedWall(x0, x1, z0, z1, y1, jungleWallMat);
}
{
  const jMinX = JUNGLE_X - JUNGLE_HALF, jMaxX = JUNGLE_X + JUNGLE_HALF;
  const jMinZ = JUNGLE_Z - JUNGLE_HALF, jMaxZ = JUNGLE_Z + JUNGLE_HALF;
  const wallT = 0.6;
  jungleWallBox(jMinX, jMaxX, 0, JUNGLE_WALL_H, jMaxZ - wallT, jMaxZ); // north
  jungleWallBox(jMinX, jMaxX, 0, JUNGLE_WALL_H, jMinZ, jMinZ + wallT); // south
  jungleWallBox(jMinX, jMinX + wallT, 0, JUNGLE_WALL_H, jMinZ, jMaxZ); // west (dead end)
  // East wall, split around the hole.
  jungleWallBox(jMaxX - wallT, jMaxX, 0, JUNGLE_WALL_H, jMinZ, JUNGLE_Z - JUNGLE_HOLE_HALF_W);
  jungleWallBox(jMaxX - wallT, jMaxX, 0, JUNGLE_WALL_H, JUNGLE_Z + JUNGLE_HOLE_HALF_W, jMaxZ);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(wallT, 1.2, JUNGLE_HOLE_HALF_W * 2), jungleWallMat);
  lintel.position.set(jMaxX - wallT / 2, JUNGLE_WALL_H - 0.6, JUNGLE_Z);
  scene.add(lintel);
}

// The winding tunnel connecting the forest's own boundary-wall hole to
// this one.
buildWindingTunnel(-(WALL_R + 1), JUNGLE_Z, JUNGLE_X + JUNGLE_HALF, JUNGLE_Z, JUNGLE_HOLE_HALF_W, 4.5, jungleWallMat);

// Temples: a stepped stone exterior with a single south-facing doorway
// into a main room, then a corridor, then a windowless back chamber --
// the "dungeon" the main room alone doesn't cover. The whole interior
// footprint (room + corridor + chamber) is registered as a flat zone
// (see groundHeight() / registerFlatZone() above) and given its own
// floor slab, so the floor reads level even where a nearby hill bulges
// up -- the same trick Badland's sand plane uses for its whole zone,
// just scoped to one building here instead.
const templeBounds = []; // { minX, maxX, minZ, maxZ } -- Stalker can never enter any of these

function buildTemple(cx, cz) {
  const wallT = 0.5, wallH = 4.5, doorHalfW = 1.3;
  const halfW = 6, halfD = 6; // main room
  const corridorHalfW = 1.1, corridorLen = 6;
  const chHalfW = 4, chHalfD = 4; // back chamber (the dungeon proper)

  const minX = cx - halfW, maxX = cx + halfW, minZ = cz - halfD, maxZ = cz + halfD;
  const corZ0 = maxZ, corZ1 = maxZ + corridorLen;
  const chMinX = cx - chHalfW, chMaxX = cx + chHalfW, chMinZ = corZ1, chMaxZ = corZ1 + chHalfD * 2;

  function wall(x0, x1, z0, z1, h = wallH) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), templeStoneMat);
    mesh.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    scene.add(mesh);
    boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, h, z1)));
  }

  // Main room: south wall carries the only outside-facing door; north
  // wall has its own opening straight into the corridor.
  wall(minX, cx - doorHalfW, minZ, minZ + wallT);
  wall(cx + doorHalfW, maxX, minZ, minZ + wallT);
  wall(minX, minX + wallT, minZ, maxZ);
  wall(maxX - wallT, maxX, minZ, maxZ);
  wall(minX, cx - corridorHalfW, maxZ - wallT, maxZ);
  wall(cx + corridorHalfW, maxX, maxZ - wallT, maxZ);
  const doorLintel = new THREE.Mesh(new THREE.BoxGeometry(doorHalfW * 2, 1.2, wallT), templeStoneMat);
  doorLintel.position.set(cx, wallH - 0.6, minZ + wallT / 2);
  scene.add(doorLintel);

  // Corridor leading back into the dungeon chamber.
  wall(cx - corridorHalfW - wallT, cx - corridorHalfW, corZ0, corZ1);
  wall(cx + corridorHalfW, cx + corridorHalfW + wallT, corZ0, corZ1);

  // Back chamber: fully enclosed, no second exit -- every dungeon here is
  // a there-and-back trip, not a loop.
  wall(chMinX, chMaxX, chMaxZ - wallT, chMaxZ);
  wall(chMinX, chMinX + wallT, chMinZ, chMaxZ);
  wall(chMaxX - wallT, chMaxX, chMinZ, chMaxZ);

  // Tiered stepped-pyramid roof over the main room -- visual only, no
  // collider, same "no ceiling anywhere" rule every other building here
  // follows (so walking in is just walking in).
  for (let t = 0; t < 3; t++) {
    const s = 1 - t * 0.28;
    const tier = new THREE.Mesh(new THREE.BoxGeometry((halfW * 2 + 1) * s, 1.1, (halfD * 2 + 1) * s), templeStoneMat);
    tier.position.set(cx, wallH + 0.1 + t * 1.1, cz);
    scene.add(tier);
  }

  // Floor slabs, flat regardless of nearby hills.
  registerFlatZone(Math.min(minX, chMinX), Math.max(maxX, chMaxX), minZ, chMaxZ);
  const mainFloor = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 - wallT * 2, 0.15, halfD * 2 - wallT * 2), templeStoneMat);
  mainFloor.position.set(cx, 0.08, cz);
  scene.add(mainFloor);
  const corFloor = new THREE.Mesh(new THREE.BoxGeometry(corridorHalfW * 2, 0.15, corridorLen), templeStoneMat);
  corFloor.position.set(cx, 0.08, (corZ0 + corZ1) / 2);
  scene.add(corFloor);
  const chFloor = new THREE.Mesh(new THREE.BoxGeometry(chHalfW * 2 - wallT * 2, 0.15, chHalfD * 2 - wallT * 2), templeStoneMat);
  chFloor.position.set(cx, 0.08, (chMinZ + chMaxZ) / 2);
  scene.add(chFloor);

  // A torch in the back chamber -- the only light back there otherwise.
  const torch = new THREE.PointLight(0xff8a3d, 1.3, 9, 2);
  torch.position.set(cx, 2.2, (chMinZ + chMaxZ) / 2);
  scene.add(torch);

  templeBounds.push({ minX: Math.min(minX, chMinX), maxX: Math.max(maxX, chMaxX), minZ, maxZ: chMaxZ });
}

buildTemple(JUNGLE_X - 12, JUNGLE_Z - 10);
buildTemple(JUNGLE_X + 4, JUNGLE_Z + 6);

// Stalker can see from afar and chase, but can never follow you through a
// temple doorway -- pushes its position back out to just outside whatever
// temple+dungeon box it would otherwise be standing inside.
function clampStalkerFromTemples(pos) {
  for (const b of templeBounds) {
    if (pos.x > b.minX && pos.x < b.maxX && pos.z > b.minZ && pos.z < b.maxZ) {
      const dLeft = pos.x - b.minX, dRight = b.maxX - pos.x;
      const dBack = pos.z - b.minZ, dFront = b.maxZ - pos.z;
      const m = Math.min(dLeft, dRight, dBack, dFront);
      if (m === dLeft) pos.x = b.minX - 0.6;
      else if (m === dRight) pos.x = b.maxX + 0.6;
      else if (m === dBack) pos.z = b.minZ - 0.6;
      else pos.z = b.maxZ + 0.6;
    }
  }
}

function insideAnyTemple(x, z) {
  for (const b of templeBounds) {
    if (x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1) return true;
  }
  return false;
}

const vineMat = new THREE.MeshStandardMaterial({ color: 0x33551f, roughness: 0.95 });

// Dense jungle canopy -- layered, broader leaf clusters and a lighter
// green than the forest's own bare trees, so this patch of ground reads
// as a different kind of place at a glance, not just "more trees". Real
// branches too (same makeBranch() the forest's own trees use -- a
// climbable platform, not just decoration), plus vines hanging down
// from somewhere in the canopy.
const JUNGLE_TREE_SCALE = 3;
function makeJungleTree(x, z) {
  const h = groundHeight(x, z);
  const trunkH = (3.5 + rand() * 2) * JUNGLE_TREE_SCALE;
  const r = (0.28 + rand() * 0.15) * JUNGLE_TREE_SCALE;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, trunkH, 7), jungleTrunkMat);
  trunk.position.set(x, h + trunkH / 2, z);
  scene.add(trunk);
  addCircleCollider(x, z, r + 0.2);

  const canopy = [];
  for (const [ox, oy, oz, rad] of [
    [0, trunkH + 0.4 * JUNGLE_TREE_SCALE, 0, (1.3 + rand() * 0.4) * JUNGLE_TREE_SCALE],
    [0.6 * JUNGLE_TREE_SCALE, trunkH + 0.1 * JUNGLE_TREE_SCALE, 0.3 * JUNGLE_TREE_SCALE, (0.9 + rand() * 0.3) * JUNGLE_TREE_SCALE],
    [-0.5 * JUNGLE_TREE_SCALE, trunkH + 0.3 * JUNGLE_TREE_SCALE, -0.4 * JUNGLE_TREE_SCALE, (0.9 + rand() * 0.3) * JUNGLE_TREE_SCALE],
  ]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(rad, 8, 7), jungleLeafMat);
    leaf.position.set(x + ox, h + oy, z + oz);
    scene.add(leaf);
    canopy.push({ x: x + ox, y: h + oy, z: z + oz, rad });
  }

  // One or two real branches, same technique (and climbable platform)
  // as the forest's own bare trees.
  const branchCount = rand() < 0.4 ? 2 : 1;
  for (let b = 0; b < branchCount; b++) {
    const angle = rand() * Math.PI * 2;
    const len = (1.6 + rand() * 1.3) * JUNGLE_TREE_SCALE;
    const branchH = h + trunkH * (0.4 + rand() * 0.45);
    const tilt = (rand() - 0.5) * 0.6 * JUNGLE_TREE_SCALE;
    const ex = x + Math.cos(angle) * (r + len);
    const ez = z + Math.sin(angle) * (r + len);
    makeBranch(x + Math.cos(angle) * r, branchH, z + Math.sin(angle) * r, ex, branchH + tilt, ez);
  }

  // Vines hanging straight down from somewhere in the canopy.
  const vineCount = 1 + Math.floor(rand() * 3);
  for (let v = 0; v < vineCount; v++) {
    const from = canopy[Math.floor(rand() * canopy.length)];
    const vineLen = trunkH * (0.4 + rand() * 0.5);
    const vx = from.x + (rand() - 0.5) * from.rad;
    const vz = from.z + (rand() - 0.5) * from.rad;
    const bottomY = Math.max(h + 0.3, from.y - vineLen);
    const actualLen = from.y - bottomY;
    if (actualLen < 0.5) continue;
    const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, actualLen, 5), vineMat);
    vine.position.set(vx, bottomY + actualLen / 2, vz);
    scene.add(vine);
  }
}
let jungleTreesPlaced = 0;
while (jungleTreesPlaced < 225) {
  const x = JUNGLE_X + (rand() - 0.5) * JUNGLE_HALF * 1.6;
  const z = JUNGLE_Z + (rand() - 0.5) * JUNGLE_HALF * 1.6;
  if (insideAnyTemple(x, z)) continue;
  makeJungleTree(x, z);
  jungleTreesPlaced++;
}

function junglePoint() {
  let x, z, tries = 0;
  do {
    x = JUNGLE_X + (rand() - 0.5) * JUNGLE_HALF * 1.6;
    z = JUNGLE_Z + (rand() - 0.5) * JUNGLE_HALF * 1.6;
    tries++;
  } while (insideAnyTemple(x, z) && tries < 10);
  return new THREE.Vector3(x, 0, z);
}
function clampToJungle(pos) {
  pos.x = THREE.MathUtils.clamp(pos.x, JUNGLE_X - JUNGLE_HALF, JUNGLE_X + JUNGLE_HALF);
  pos.z = THREE.MathUtils.clamp(pos.z, JUNGLE_Z - JUNGLE_HALF, JUNGLE_Z + JUNGLE_HALF);
}
function clampStalkerZone(pos) {
  clampToJungle(pos);
  clampStalkerFromTemples(pos);
}

/* ---------------- City (one long building, reached via the deck's ladder) ---------------- */

const cityWallMat = new THREE.MeshStandardMaterial({ color: 0x3c3f42, roughness: 1, map: makeGrainTexture({ dark: 60, light: 160, repeat: 30, blotch: 4 }) });
const cityFloorMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.95, map: makeGrainTexture({ dark: 70, light: 170, repeat: 20, blotch: 3 }) });
const shelfMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 });
const lightFixtureMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 1.4 });

// The corridor down from the ladder, in two legs: a short straight one
// (not randomized -- a jog here risks missing the stockade wall's own
// gate, only ~4.5 units wide) west from the ladder through that gate,
// then a winding buildWindingTunnel() south the rest of the way out to
// the building, same as Badland's/Jungle's.
{
  const { segment, junction } = makeCorridorBuilder(CITY_HOLE_HALF_W, 4.5, cityWallMat);
  segment({ x: LADDER_X, z: LADDER_Z }, { x: GATE_CROSS_X, z: LADDER_Z });
  junction({ x: GATE_CROSS_X, z: LADDER_Z }, [{ x: 1, z: 0 }, { x: 0, z: -1 }]);
}
buildWindingTunnel(GATE_CROSS_X, LADDER_Z, CITY_X, CITY_Z + CITY_HALF_Z, CITY_HOLE_HALF_W, 4.5, cityWallMat);

const CITY_WALL_H = 6.0;
const cMinX = CITY_X - CITY_HALF_X, cMaxX = CITY_X + CITY_HALF_X;
const cMinZ = CITY_Z - CITY_HALF_Z, cMaxZ = CITY_Z + CITY_HALF_Z;
{
  const wallT = 0.6;
  // North wall, split around the door the tunnel arrives through.
  buildRuggedWall(cMinX, CITY_X - CITY_HOLE_HALF_W, cMaxZ - wallT, cMaxZ, CITY_WALL_H, cityWallMat);
  buildRuggedWall(CITY_X + CITY_HOLE_HALF_W, cMaxX, cMaxZ - wallT, cMaxZ, CITY_WALL_H, cityWallMat);
  buildRuggedWall(cMinX, cMaxX, cMinZ, cMinZ + wallT, CITY_WALL_H, cityWallMat); // south, dead end
  buildRuggedWall(cMinX, cMinX + wallT, cMinZ, cMaxZ, CITY_WALL_H, cityWallMat); // west
  buildRuggedWall(cMaxX - wallT, cMaxX, cMinZ, cMaxZ, CITY_WALL_H, cityWallMat); // east

  const floor = new THREE.Mesh(new THREE.BoxGeometry(cMaxX - cMinX, 0.15, cMaxZ - cMinZ), cityFloorMat);
  floor.position.set(CITY_X, 0.08, CITY_Z);
  scene.add(floor);
}

// Roof over everything except a courtyard cutout left open to the rain --
// four slabs framing the gap, same technique the Jungle temples use for
// their own interior/dungeon flat zones.
const CITY_COURT_HALF_X = 18, CITY_COURT_HALF_Z = 8;
const cyMinX = CITY_X - CITY_COURT_HALF_X, cyMaxX = CITY_X + CITY_COURT_HALF_X;
const cyMinZ = CITY_Z - CITY_COURT_HALF_Z, cyMaxZ = CITY_Z + CITY_COURT_HALF_Z;
function cityRoofSlab(x0, x1, z0, z1) {
  if (x1 <= x0 || z1 <= z0) return;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, z1 - z0), cityWallMat);
  slab.position.set((x0 + x1) / 2, CITY_WALL_H + 0.15, (z0 + z1) / 2);
  scene.add(slab); // visual only -- no ceiling in this game ever collides
}
cityRoofSlab(cMinX, cMaxX, cyMaxZ, cMaxZ);
cityRoofSlab(cMinX, cMaxX, cMinZ, cyMinZ);
cityRoofSlab(cMinX, cyMinX, cyMinZ, cyMaxZ);
cityRoofSlab(cyMaxX, cMaxX, cyMinZ, cyMaxZ);

// Pillars down the length of the hall -- visual rhythm for a long open
// room, and something for the light fixtures/shelves to anchor to.
const cityPillars = [];
for (let px = cMinX + 10; px < cMaxX - 5; px += 14) {
  if (px > cyMinX - 2 && px < cyMaxX + 2) continue; // leave the courtyard clear
  for (const pz of [CITY_Z - 7, CITY_Z + 7]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, CITY_WALL_H, 8), cityWallMat);
    pillar.position.set(px, CITY_WALL_H / 2, pz);
    scene.add(pillar);
    addCircleCollider(px, pz, 0.5);
    cityPillars.push({ x: px, z: pz });

    // A light fixture and a shelf unit at most pillars.
    if (rand() < 0.7) {
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), lightFixtureMat);
      fixture.position.set(px, CITY_WALL_H - 0.3, pz);
      scene.add(fixture);
      const bulb = new THREE.PointLight(0xfff0c8, 1.1, 14, 2);
      bulb.position.set(px, CITY_WALL_H - 0.5, pz);
      scene.add(bulb);
    }
    if (rand() < 0.6) {
      const shelfX = px + (pz < CITY_Z ? 0.5 : -0.5);
      for (let s = 0; s < 3; s++) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.35), shelfMat);
        shelf.position.set(shelfX, 0.6 + s * 0.6, pz + (pz < CITY_Z ? 0.6 : -0.6));
        scene.add(shelf);
      }
      boxColliders.push(new THREE.Box3(
        new THREE.Vector3(shelfX - 0.7, 0, pz + (pz < CITY_Z ? 0.3 : -0.9)),
        new THREE.Vector3(shelfX + 0.7, 1.9, pz + (pz < CITY_Z ? 0.9 : -0.3))
      ));
    }
  }
}

// Vines everywhere -- draped from the wall tops all along the perimeter.
for (let i = 0; i < 70; i++) {
  const side = Math.floor(rand() * 4);
  let vx, vz;
  if (side === 0) { vx = cMinX + rand() * (cMaxX - cMinX); vz = cMaxZ - 0.3; }
  else if (side === 1) { vx = cMinX + rand() * (cMaxX - cMinX); vz = cMinZ + 0.3; }
  else if (side === 2) { vx = cMinX + 0.3; vz = cMinZ + rand() * (cMaxZ - cMinZ); }
  else { vx = cMaxX - 0.3; vz = cMinZ + rand() * (cMaxZ - cMinZ); }
  const vineLen = 1.5 + rand() * 3;
  const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, vineLen, 5), vineMat);
  vine.position.set(vx, CITY_WALL_H - vineLen / 2, vz);
  scene.add(vine);
}

// Rain, falling only over the open courtyard -- it's "outside" even
// though it's inside the same perimeter wall as everything else.
const RAIN_COUNT = 260;
const rainDrops = [];
const rainMat = new THREE.MeshStandardMaterial({ color: 0xaad4e6, roughness: 0.3, transparent: true, opacity: 0.55 });
for (let i = 0; i < RAIN_COUNT; i++) {
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 3), rainMat);
  const x = cyMinX + rand() * (cyMaxX - cyMinX);
  const z = cyMinZ + rand() * (cyMaxZ - cyMinZ);
  const y = rand() * CITY_WALL_H;
  drop.position.set(x, y, z);
  scene.add(drop);
  rainDrops.push(drop);
}
function tickRain(dt) {
  const speed = 16;
  for (const d of rainDrops) {
    d.position.y -= speed * dt;
    if (d.position.y < 0) {
      d.position.y = CITY_WALL_H;
      d.position.x = cyMinX + rand() * (cyMaxX - cyMinX);
      d.position.z = cyMinZ + rand() * (cyMaxZ - cyMinZ);
    }
  }
}
// A quiet rain ambience -- looping filtered noise, same procedural-audio
// discipline as every other sound in this game.
let rainNoiseStarted = false;
function startRainAmbience() {
  if (rainNoiseStarted) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  rainNoiseStarted = true;
  const bufLen = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.value = 0.12;
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start();
}

function cityPoint() {
  const x = CITY_X + (rand() - 0.5) * CITY_HALF_X * 1.5;
  const z = CITY_Z + (rand() - 0.5) * CITY_HALF_Z * 1.5;
  return new THREE.Vector3(x, 0, z);
}
function clampToCity(pos) {
  pos.x = THREE.MathUtils.clamp(pos.x, cMinX + 1, cMaxX - 1);
  pos.z = THREE.MathUtils.clamp(pos.z, cMinZ + 1, cMaxZ - 1);
}

/* ---------------- monsters ---------------- */

function clampToSafeZone(pos) {
  const d = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  if (d < SAFE_R) {
    const k = SAFE_R / Math.max(d, 0.001);
    pos.x *= k; pos.z *= k;
  }
}

// Turn rate matters as real gameplay, not just visual polish: a monster
// that can only turn slowly can be juked by cutting around it, even if
// it's faster than you in a straight line. heading is a yaw angle (the
// same convention Object3D.rotation.y uses), moved toward targetHeading
// at up to maxRate radians/sec, and that heading is what both the facing
// AND the actual movement direction are derived from -- it can't strafe
// or snap-correct onto you, only turn at its own pace.
function turnToward(heading, targetHeading, maxRate, dt) {
  let diff = targetHeading - heading;
  diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const maxStep = maxRate * dt;
  if (Math.abs(diff) <= maxStep) return targetHeading;
  return heading + Math.sign(diff) * maxStep;
}

function headingTo(dx, dz) {
  return Math.atan2(-dx, -dz); // matches Object3D's default -Z-forward convention
}

// Moving at full speed while needing a big turn is exactly what makes a
// turn-rate-limited chaser settle into a stable orbit around a target it
// can never quite curl in on (that orbit's radius is speed/turnRate, and
// if that's bigger than catchR, a catch becomes geometrically impossible
// -- this was a real bug, not just a balance choice). Slowing down while
// the heading error is large shrinks that radius so it can actually close
// the last stretch once it lines up, while a target that keeps circling
// to stay perpendicular still works as an escape, same as before.
function turnSpeedFactor(heading, targetHeading) {
  let diff = targetHeading - heading;
  diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return THREE.MathUtils.clamp(Math.cos(diff), 0.25, 1);
}

const ROAM_RADIUS = 14;
const ROAM_SPEED_FACTOR = 0.35; // a slow idle wander, well under full chase speed

// Picks a point within `radius` of home, ambles toward it at a fraction of
// chase speed (same turn-rate steering as a real chase, just slower), and
// picks a new one once it arrives or a timer runs out. Used whenever a
// monster isn't alert, so "stays near home until it notices you" now
// means an actual area, not a single frozen point.
function tickRoam(m, dt, homePos, chaseSpeed, turnRate, radius = ROAM_RADIUS) {
  if (m.roamTarget === undefined) { m.roamTarget = homePos.clone(); m.roamTimer = 0; }
  m.roamTimer -= dt;
  const dx0 = m.roamTarget.x - m.group.position.x, dz0 = m.roamTarget.z - m.group.position.z;
  if (m.roamTimer <= 0 || dx0 * dx0 + dz0 * dz0 < 1) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    m.roamTarget = new THREE.Vector3(homePos.x + Math.cos(a) * r, 0, homePos.z + Math.sin(a) * r);
    m.roamTimer = 4 + Math.random() * 4;
  }
  const dx = m.roamTarget.x - m.group.position.x, dz = m.roamTarget.z - m.group.position.z;
  if (Math.hypot(dx, dz) > 0.1) {
    const targetHeading = headingTo(dx, dz);
    const speedFactor = turnSpeedFactor(m.heading, targetHeading);
    m.heading = turnToward(m.heading, targetHeading, turnRate, dt);
    const roamSpeed = chaseSpeed * ROAM_SPEED_FACTOR;
    m.group.position.x += -Math.sin(m.heading) * roamSpeed * speedFactor * dt;
    m.group.position.z += -Math.cos(m.heading) * roamSpeed * speedFactor * dt;
    animateRunCycle(m, 2.5, 0.03, 0.15);
  }
}

// A simple running cycle for legless creatures: a bounce (feet they don't
// have still need to look like they're covering ground) plus an arm swing
// for whichever ones have arms. Rate/amp are tuned per monster so each
// reads differently -- Supersonic quick and light, Hot Cheeto heavy and
// slow, Peanut light and fast.
function animateRunCycle(m, rate, bobAmp, armSwingAmp = 0, canJump = false) {
  const t = performance.now() / 1000;
  const phase = t * rate;
  // Stashed on the monster rather than applied to position.y directly --
  // every tick function reassigns position.y from groundHeight() right
  // after calling this, which would otherwise wipe the bob/jump out the
  // instant it's added. Each tick function adds m.bobOffset back in once,
  // after that reassignment.
  let yOffset = Math.abs(Math.sin(phase)) * bobAmp;
  // A real jump while chasing -- not just the small run-cycle bounce --
  // on a repeating cycle offset per-instance (via the object's own id) so
  // a pack of the same monster doesn't all leap in lockstep.
  if (canJump) {
    const cycle = 3; // seconds
    const jumpT = ((t * 0.4 + m.group.id * 0.173) % cycle + cycle) % cycle;
    if (jumpT < 0.5) yOffset += Math.sin((jumpT / 0.5) * Math.PI) * 1.3 * 1.5;
  }
  m.bobOffset = yOffset;
  const pivots = m.group.userData.armPivots;
  if (pivots && pivots.length) {
    const swing = Math.sin(phase * 2) * armSwingAmp;
    pivots[0].rotation.x = swing;
    pivots[1].rotation.x = -swing;
    // Elbows swing a beat behind the shoulder, and only ever forward
    // (clamped to 0) -- a real joint bending, not a shoulder-only pendulum.
    const elbows = m.group.userData.elbowPivots;
    if (elbows && elbows.length) {
      const elbowSwing = Math.sin(phase * 2 + 0.8) * armSwingAmp * 0.6;
      elbows[0].rotation.x = Math.max(0, elbowSwing);
      elbows[1].rotation.x = Math.max(0, -elbowSwing);
    }
  }
  // A small head bob/twist -- works even on armless monsters (Peanut),
  // since it's keyed off the same phase rather than the arm swing itself.
  const head = m.group.userData.head;
  if (head) head.rotation.y = Math.sin(phase * 2) * 0.08;
}

const supersonic = {
  group: createSupersonicModel(),
  route: [new THREE.Vector3(70, 0, -65)], // southeast corner
  idx: 0, alert: false, alertTimer: 0, catchR: 1.2, heading: 0,
};
scene.add(supersonic.group);
supersonic.group.position.copy(supersonic.route[0]);

// 1.2x the player's own top speed — genuinely faster than you can run once
// it's alert, so outrunning it in a straight line never works. It used to
// turn almost instantly; now it's kinda bad at it (same register as
// Supersonic's old self vs. Hot Cheeto's new one) -- circling around it
// works, same as Hot Cheeto.
const SUPERSONIC_SPEED = RUN_SPEED * 1.05;
const SUPERSONIC_TURN_RATE = 2.5; // rad/sec
// It's also short -- no legs, torso tapering straight down -- so a jump
// timed right actually clears its back instead of just failing to help.
const SUPERSONIC_HOP_CLEARANCE = 1.75;

function tickSupersonic(dt, playerPos) {
  const m = supersonic;
  // Horizontal distance only -- the player's eye height sits well above
  // this thing's near-ground hover, so a 3D distance (including that
  // vertical gap) could exceed catchR and never register a catch at all.
  const toPlayer = new THREE.Vector3(playerPos.x - m.group.position.x, 0, playerPos.z - m.group.position.z);
  const dist = toPlayer.length();
  const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dirToM = new THREE.Vector3().subVectors(m.group.position, playerPos).normalize();
  const seen = dist < 20 && camForward.dot(dirToM) > 0.88;

  if (dist < 6 || seen) { m.alert = true; m.alertTimer = 4; }
  else if (m.alertTimer > 0) m.alertTimer -= dt;
  else m.alert = false;

  // Roams near home until alert -- moves in the direction it's actually
  // FACING, not straight at you -- turning is what limits it.
  if (m.alert && dist > 0.01) {
    const targetHeading = headingTo(toPlayer.x, toPlayer.z);
    const speedFactor = turnSpeedFactor(m.heading, targetHeading);
    m.heading = turnToward(m.heading, targetHeading, SUPERSONIC_TURN_RATE, dt);
    m.group.position.x += -Math.sin(m.heading) * SUPERSONIC_SPEED * speedFactor * dt;
    m.group.position.z += -Math.cos(m.heading) * SUPERSONIC_SPEED * speedFactor * dt;
    if (m.alert) animateRunCycle(m, 14, 0.08, 0.55, true);
  } else {
    tickRoam(m, dt, m.route[0], SUPERSONIC_SPEED, SUPERSONIC_TURN_RATE);
  }
  clampToSafeZone(m.group.position);
  m.group.position.y = groundHeight(m.group.position.x, m.group.position.z) + (m.group.userData.hoverHeight || 0) + (m.bobOffset || 0);
  m.group.rotation.y = m.heading;
  updateSupersonicMusic(dist);
  return {
    dist, danger: m.alert ? Math.max(0, 1 - dist / 9) : 0, catchR: m.catchR, type: 'supersonic', instance: m,
    hopY: m.group.position.y + SUPERSONIC_HOP_CLEARANCE, // feet above this clear its back entirely
  };
}

const hotCheeto = {
  group: createHotCheetoModel(),
  route: [new THREE.Vector3(-70, 0, 70)], // northwest corner, far from Supersonic
  idx: 0, alert: false, alertTimer: 0, catchR: 2.8, heading: 0, // bigger body, bigger forgiving hitbox
};
scene.add(hotCheeto.group);
hotCheeto.group.position.copy(hotCheeto.route[0]);

// Same top speed as Supersonic, but turns slowly -- a straight-line sprint
// can't outrun it, but circling around it works, since it can't correct
// its heading fast enough to cut you off.
const HOTCHEETO_TURN_RATE = 0.9; // rad/sec

function tickHotCheeto(dt, playerPos) {
  const m = hotCheeto;
  // Horizontal distance only -- see tickSupersonic for why.
  const toPlayer = new THREE.Vector3(playerPos.x - m.group.position.x, 0, playerPos.z - m.group.position.z);
  const dist = toPlayer.length();
  const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dirToM = new THREE.Vector3().subVectors(m.group.position, playerPos).normalize();
  const seen = dist < 24 && camForward.dot(dirToM) > 0.86; // bigger body, easier to spot

  if (dist < 8 || seen) { m.alert = true; m.alertTimer = 4; }
  else if (m.alertTimer > 0) m.alertTimer -= dt;
  else m.alert = false;

  // Roams near home until alert.
  if (m.alert && dist > 0.01) {
    const targetHeading = headingTo(toPlayer.x, toPlayer.z);
    const speedFactor = turnSpeedFactor(m.heading, targetHeading);
    m.heading = turnToward(m.heading, targetHeading, HOTCHEETO_TURN_RATE, dt);
    m.group.position.x += -Math.sin(m.heading) * SUPERSONIC_SPEED * speedFactor * dt;
    m.group.position.z += -Math.cos(m.heading) * SUPERSONIC_SPEED * speedFactor * dt;
    animateRunCycle(m, 4, 0.35, 0.4, true);
  } else {
    tickRoam(m, dt, m.route[0], SUPERSONIC_SPEED, HOTCHEETO_TURN_RATE);
  }
  clampToSafeZone(m.group.position);
  m.group.position.y = groundHeight(m.group.position.x, m.group.position.z) + (m.group.userData.hoverHeight || 0) + (m.bobOffset || 0);
  m.group.rotation.y = m.heading;
  return { dist, danger: m.alert ? Math.max(0, 1 - dist / 12) : 0, catchR: m.catchR, type: 'hotcheeto', instance: m };
}

const peanut = {
  group: createPeanutModel(),
  route: [new THREE.Vector3(60, 0, 70)], // northeast corner, away from the other two
  idx: 0, alert: false, alertTimer: 0, catchR: 1.0, heading: 0,
};
scene.add(peanut.group);
peanut.group.position.copy(peanut.route[0]);

// Clearly slower than you, but turns on a dime (even faster than
// Supersonic) -- it'll never win a straight chase, but it corners
// perfectly, so don't expect to lose it by weaving either.
const PEANUT_SPEED = RUN_SPEED * 0.7;
const PEANUT_TURN_RATE = 12.0; // rad/sec

function tickPeanut(dt, playerPos) {
  const m = peanut;
  const toPlayer = new THREE.Vector3(playerPos.x - m.group.position.x, 0, playerPos.z - m.group.position.z);
  const dist = toPlayer.length();
  const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dirToM = new THREE.Vector3().subVectors(m.group.position, playerPos).normalize();
  const seen = dist < 20 && camForward.dot(dirToM) > 0.88;

  if (dist < 6 || seen) { m.alert = true; m.alertTimer = 4; }
  else if (m.alertTimer > 0) m.alertTimer -= dt;
  else m.alert = false;

  if (m.alert && dist > 0.01) {
    const targetHeading = headingTo(toPlayer.x, toPlayer.z);
    const speedFactor = turnSpeedFactor(m.heading, targetHeading);
    m.heading = turnToward(m.heading, targetHeading, PEANUT_TURN_RATE, dt);
    m.group.position.x += -Math.sin(m.heading) * PEANUT_SPEED * speedFactor * dt;
    m.group.position.z += -Math.cos(m.heading) * PEANUT_SPEED * speedFactor * dt;
    animateRunCycle(m, 16, 0.1, 0, true);
  } else {
    tickRoam(m, dt, m.route[0], PEANUT_SPEED, PEANUT_TURN_RATE);
  }
  clampToSafeZone(m.group.position);
  m.group.position.y = groundHeight(m.group.position.x, m.group.position.z) + (m.group.userData.hoverHeight || 0) + (m.bobOffset || 0);
  m.group.rotation.y = m.heading;
  return { dist, danger: m.alert ? Math.max(0, 1 - dist / 9) : 0, catchR: m.catchR, type: 'peanut', instance: m };
}

/* ---------------- Badland cast: Lizard, Gunslinger, three Outlaws ---------------- */
/* One shared tick function instead of three near-identical ones -- only
 * the numbers (speed, turn rate, alert ranges, catchR) differ per type,
 * same as the forest's own monsters, just not duplicated three more times. */

function tickGenericMonster(m, dt, playerPos, speed, turnRate, type, seenRange, seenCos, alertRange, danger, zoneClamp) {
  const toPlayer = new THREE.Vector3(playerPos.x - m.group.position.x, 0, playerPos.z - m.group.position.z);
  const dist = toPlayer.length();
  const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dirToM = new THREE.Vector3().subVectors(m.group.position, playerPos).normalize();
  const seen = dist < seenRange && camForward.dot(dirToM) > seenCos;

  if (dist < alertRange || seen) { m.alert = true; m.alertTimer = 4; }
  else if (m.alertTimer > 0) m.alertTimer -= dt;
  else m.alert = false;

  if (m.alert && dist > 0.01) {
    const targetHeading = headingTo(toPlayer.x, toPlayer.z);
    const speedFactor = turnSpeedFactor(m.heading, targetHeading);
    m.heading = turnToward(m.heading, targetHeading, turnRate, dt);
    m.group.position.x += -Math.sin(m.heading) * speed * speedFactor * dt;
    m.group.position.z += -Math.cos(m.heading) * speed * speedFactor * dt;
    animateRunCycle(m, 6, 0.12, 0.3, true);
  } else {
    tickRoam(m, dt, m.route[0], speed, turnRate, 12);
  }
  clampToSafeZone(m.group.position);
  zoneClamp(m.group.position);
  m.group.position.y = groundHeight(m.group.position.x, m.group.position.z) + (m.group.userData.hoverHeight || 0) + (m.bobOffset || 0);
  m.group.rotation.y = m.heading;
  return { dist, danger: m.alert ? Math.max(0, 1 - dist / danger) : 0, catchR: m.catchR, type, instance: m };
}

function makeBadlandMonster(make, catchR) {
  const spot = badlandPoint();
  const m = { group: make(), route: [spot], idx: 0, alert: false, alertTimer: 0, catchR, heading: 0 };
  scene.add(m.group);
  m.group.position.copy(spot);
  m.group.position.y = groundHeight(spot.x, spot.z) + (m.group.userData.hoverHeight || 0);
  return m;
}

const LIZARD_SPEED = RUN_SPEED * 1.02, LIZARD_TURN_RATE = 2.0;
const lizard = makeBadlandMonster(createLizardModel, 2.2);

const GUNSLINGER_SPEED = RUN_SPEED * 0.9, GUNSLINGER_TURN_RATE = 3.0;
const gunslinger = makeBadlandMonster(createGunslingerModel, 1.6);

const OUTLAW_SPEED = RUN_SPEED * 0.7, OUTLAW_TURN_RATE = 4.0;
const outlaws = [makeBadlandMonster(createOutlawModel, 1.0), makeBadlandMonster(createOutlawModel, 1.0), makeBadlandMonster(createOutlawModel, 1.0)];

function tickLizard(dt, p) { return tickGenericMonster(lizard, dt, p, LIZARD_SPEED, LIZARD_TURN_RATE, 'lizard', 22, 0.86, 7, 9, clampToBadland); }
function tickGunslinger(dt, p) { return tickGenericMonster(gunslinger, dt, p, GUNSLINGER_SPEED, GUNSLINGER_TURN_RATE, 'gunslinger', 20, 0.88, 6, 9, clampToBadland); }
function tickOutlaw(m, dt, p) { return tickGenericMonster(m, dt, p, OUTLAW_SPEED, OUTLAW_TURN_RATE, 'outlaw', 18, 0.88, 6, 9, clampToBadland); }

/* ---------------- Jungle cast: Stalker + three Wanderers ---------------- */
/* Same tickGenericMonster/zoneClamp pattern as Badland's cast -- Stalker's
 * only real difference is which zoneClamp it gets (clampStalkerZone also
 * pushes it out of every temple/dungeon box, on top of the usual Jungle
 * bounds; Wanderer just gets clampToJungle, so it's never blocked from
 * going anywhere Jungle's own ground reaches, dungeons included). */

function makeJungleMonster(make, catchR) {
  const spot = junglePoint();
  const m = { group: make(), route: [spot], idx: 0, alert: false, alertTimer: 0, catchR, heading: 0 };
  scene.add(m.group);
  m.group.position.copy(spot);
  m.group.position.y = groundHeight(spot.x, spot.z) + (m.group.userData.hoverHeight || 0);
  return m;
}

// 1.5x the player's own speed, and it can spot you from much farther off
// than anything else out there (seenRange 45 vs. everyone else's 16-24) --
// the whole point is that outrunning it only works if you saw it first.
const STALKER_SPEED = RUN_SPEED * 1.5, STALKER_TURN_RATE = 2.2;
const stalker = makeJungleMonster(createStalkerModel, 3.5); // 3x the model, so a bigger forgiving hitbox to match
// Its own spawn point is picked the same way every roam target is (see
// junglePoint()), so it can land inside a temple/dungeon box just like
// any other roam target can -- push it back out once, the same way every
// later tick already does every frame.
clampStalkerFromTemples(stalker.group.position);
stalker.group.position.y = groundHeight(stalker.group.position.x, stalker.group.position.z) + (stalker.group.userData.hoverHeight || 0);

const WANDERER_SPEED = RUN_SPEED * 0.75, WANDERER_TURN_RATE = 2.6;
const wanderers = [
  makeJungleMonster(createWandererModel, 1.0),
  makeJungleMonster(createWandererModel, 1.0),
  makeJungleMonster(createWandererModel, 1.0),
];

function tickStalker(dt, p) { return tickGenericMonster(stalker, dt, p, STALKER_SPEED, STALKER_TURN_RATE, 'stalker', 45, 0.8, 10, 11, clampStalkerZone); }
function tickWanderer(m, dt, p) { return tickGenericMonster(m, dt, p, WANDERER_SPEED, WANDERER_TURN_RATE, 'wanderer', 16, 0.85, 6, 8, clampToJungle); }

/* ---------------- Monument (City) ---------------- */
/* Walks at 0.2x your speed -- it will basically never catch you by
 * chasing. The real threat is staring at it: see updateMonumentStare()
 * in the main loop, which tracks how long it's stayed in your forward
 * view and turns the screen grey and pixelated the longer you let it. */

const MONUMENT_SPEED = RUN_SPEED * 0.2, MONUMENT_TURN_RATE = 1.0;
const monumentSpot = cityPoint();
const monument = {
  group: createMonumentModel(), route: [monumentSpot], idx: 0,
  alert: false, alertTimer: 0, catchR: 1.8, heading: 0,
};
scene.add(monument.group);
monument.group.position.copy(monumentSpot);
clampToCity(monument.group.position);
monument.group.position.y = groundHeight(monument.group.position.x, monument.group.position.z) + (monument.group.userData.hoverHeight || 0);

function tickMonument(dt, p) { return tickGenericMonster(monument, dt, p, MONUMENT_SPEED, MONUMENT_TURN_RATE, 'monument', 20, 0.86, 5, 10, clampToCity); }

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
  } else if (type === 'peanut') {
    // Quick and sharp -- a fast little tackle, not a drawn-out scare.
    const thud = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
    const data = thud.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = thud;
    const ng = ctx.createGain();
    ng.gain.value = 0.7;
    noise.connect(ng).connect(master);
    noise.start(now);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.22);
  } else if (type === 'lizard' || type === 'gunslinger' || type === 'outlaw') {
    // A quick, sharp hit -- distinct per type via pitch alone.
    const freq = type === 'lizard' ? 180 : type === 'gunslinger' ? 260 : 320;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.3);

    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    noise.connect(ng).connect(master);
    noise.start(now);
  } else if (type === 'stalker') {
    // A low screech that rises hard then cuts -- something tall and
    // wrong, closing fast.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.35);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.75, now + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.75);
  } else if (type === 'wanderer') {
    // A flat, breathy moan -- no mouth to shape it, so it stays one dull
    // tone instead of anything expressive.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(85, now + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.55, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.55);
  } else if (type === 'monument') {
    // A deep, droning static-laced tone -- the sound of the screen
    // itself seeming to give out, not a roar or a scream.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.linearRampToValueAtTime(30, now + 1.0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 1.1);

    const buf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.value = 0.3;
    noise.connect(ng).connect(master);
    noise.start(now);
  }
}

/* ---------------- player controller ---------------- */

// Pointer Lock, implemented directly against the native API rather than
// three.js's PointerLockControls -- that addon only ships as an ES module,
// and modules are blocked entirely over file://. This is a small enough
// surface (request/track lock, apply mouse deltas) to just own outright.
const blocker = document.getElementById('blocker');
let customizeOpen = false; // the keyboard-prop color/name panel -- pauses movement/ticking while up

function isLocked() { return document.pointerLockElement === renderer.domElement; }

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

function applyLookDelta(movementX, movementY) {
  const sensitivity = 0.0025;
  lookEuler.setFromQuaternion(camera.quaternion);
  lookEuler.y -= movementX * sensitivity;
  lookEuler.x -= movementY * sensitivity;
  lookEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lookEuler.x));
  camera.quaternion.setFromEuler(lookEuler);
}

function attemptLock() {
  const now = performance.now();
  if (now - lastLockAttempt < 400) return; // dodge Chrome's brief re-lock cooldown
  lastLockAttempt = now;
  try { renderer.domElement.requestPointerLock(); } catch (err) { /* handled by pointerlockerror */ }
}

function enterFallbackLook() {
  fallbackLook = true;
  blocker.style.display = 'none';
  relockHint.classList.add('show');
}

blocker.addEventListener('click', () => {
  ensureAudio();
  attemptLock();
  if (!isLocked()) enterFallbackLook();
});
relockHint.addEventListener('click', () => attemptLock());
document.addEventListener('pointerlockchange', () => {
  if (isLocked()) {
    blocker.style.display = 'none';
    fallbackLook = false;
    dragging = false;
    relockHint.classList.remove('show');
  } else if (!fallbackLook && !customizeOpen) {
    // Exiting lock to open the customize panel shouldn't also pop the
    // "click to drop in" pause screen behind it.
    blocker.style.display = 'flex';
  }
});
document.addEventListener('pointerlockerror', () => {
  enterFallbackLook();
});

/* ---------------- customize panel (color/name, opened from the keyboard prop) ---------------- */

const customizePanel = document.getElementById('customize-panel');
const hueSlider = document.getElementById('customize-hue');
const nameInput = document.getElementById('customize-name');
const customizeDoneBtn = document.getElementById('customize-done');
const nameTag = document.getElementById('player-name-tag');

// null until the player actually customizes once -- leaves armMat at its
// originally authored brown instead of forcing hue 0 (red) by default.
let playerHue = null;
let playerName = '';
try {
  const savedHue = localStorage.getItem('hollowtread_hue');
  const savedName = localStorage.getItem('hollowtread_name');
  if (savedHue !== null) playerHue = parseFloat(savedHue);
  if (savedName) playerName = savedName;
} catch (err) { /* localStorage unavailable (private mode, etc.) -- just use defaults */ }
if (playerHue !== null) armMat.color.setHSL(playerHue / 360, 0.65, 0.5);
hueSlider.value = String(playerHue !== null ? playerHue : 0);
nameInput.value = playerName;
if (playerName) nameTag.textContent = playerName;

function openCustomizePanel() {
  customizeOpen = true;
  customizePanel.classList.add('show');
  if (isLocked()) document.exitPointerLock();
  hueSlider.value = String(playerHue !== null ? playerHue : 0);
  nameInput.value = playerName;
}
function closeCustomizePanel() {
  customizeOpen = false;
  customizePanel.classList.remove('show');
  attemptLock();
}
hueSlider.addEventListener('input', () => {
  playerHue = parseFloat(hueSlider.value);
  armMat.color.setHSL(playerHue / 360, 0.65, 0.5);
});
nameInput.addEventListener('input', () => {
  playerName = nameInput.value.slice(0, 16);
});
customizeDoneBtn.addEventListener('click', () => {
  try {
    localStorage.setItem('hollowtread_hue', String(playerHue !== null ? playerHue : 0));
    localStorage.setItem('hollowtread_name', playerName);
  } catch (err) { /* localStorage unavailable -- the choice just won't survive a reload */ }
  nameTag.textContent = playerName || '';
  closeCustomizePanel();
});

renderer.domElement.addEventListener('mousedown', () => { if (fallbackLook) dragging = true; });
window.addEventListener('mouseup', () => { dragging = false; });
document.addEventListener('mousemove', (e) => {
  if (isLocked() || (fallbackLook && dragging)) applyLookDelta(e.movementX, e.movementY);
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && customizeOpen) {
    closeCustomizePanel();
    return;
  }
  if (e.code === 'Escape' && fallbackLook) {
    fallbackLook = false;
    blocker.style.display = 'flex';
  }
  if (customizeOpen) return; // typing in the name field shouldn't also trigger game shortcuts
  if (e.code === 'KeyE' && camera.position.distanceTo(bestiaryCenter) < 3.2) {
    showBestiaryPage(bestiaryPageIndex + 1);
  } else if (e.code === 'KeyE' && camera.position.distanceTo(keyboardCenter) < 3.2) {
    openCustomizePanel();
  }
});

const keys = { w: false, a: false, s: false, d: false, shift: false };
document.addEventListener('keydown', (e) => {
  if (customizeOpen) return; // typing a name shouldn't move the player or jump
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

/* ---------------- touch controls ---------------- */
/* WASD + mouse don't exist on a phone, and Pointer Lock barely works there
 * either -- a virtual joystick (movement), a drag-anywhere look zone (reuses
 * the same manual euler rotation as desktop's click-drag fallback), and a
 * jump button. All hidden unless touch is actually detected. */

let touchMove = { x: 0, y: 0 }; // -1..1 each axis, blended into movePlayer's moveDir
let touchJumpPressed = false;

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  document.getElementById('game-root').classList.add('touch-ui');
  document.getElementById('start-hint').textContent =
    'Tap to drop in. Left stick to move, drag anywhere to look, JUMP to jump.';
  document.querySelector('#hud .hint').textContent =
    'Left stick move · drag to look · JUMP button · jump pads glow teal';

  const joystick = document.getElementById('touch-joystick');
  const knob = document.getElementById('touch-joystick-knob');
  const lookZone = document.getElementById('touch-look-zone');
  const jumpBtn = document.getElementById('touch-jump');

  let joystickTouchId = null;
  let joystickCenter = { x: 0, y: 0 };
  const JOYSTICK_RADIUS = 52;

  joystick.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joystickTouchId = t.identifier;
    const rect = joystick.getBoundingClientRect();
    joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { passive: false });

  function moveJoystick(t) {
    let dx = t.clientX - joystickCenter.x;
    let dy = t.clientY - joystickCenter.y;
    const len = Math.hypot(dx, dy);
    if (len > JOYSTICK_RADIUS) { dx = (dx / len) * JOYSTICK_RADIUS; dy = (dy / len) * JOYSTICK_RADIUS; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touchMove.x = dx / JOYSTICK_RADIUS;
    touchMove.y = dy / JOYSTICK_RADIUS;
  }
  function resetJoystick() {
    joystickTouchId = null;
    touchMove.x = 0; touchMove.y = 0;
    knob.style.transform = 'translate(0, 0)';
  }
  joystick.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joystickTouchId) moveJoystick(t);
  }, { passive: false });
  joystick.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joystickTouchId) resetJoystick();
  }, { passive: false });
  joystick.addEventListener('touchcancel', resetJoystick);

  let lookTouchId = null;
  let lookLast = { x: 0, y: 0 };
  lookZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    ensureAudio();
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lookLast = { x: t.clientX, y: t.clientY };
  }, { passive: false });
  lookZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== lookTouchId) continue;
      const dx = t.clientX - lookLast.x, dy = t.clientY - lookLast.y;
      lookLast = { x: t.clientX, y: t.clientY };
      const sensitivity = 0.0035;
      lookEuler.setFromQuaternion(camera.quaternion);
      lookEuler.y -= dx * sensitivity;
      lookEuler.x -= dy * sensitivity;
      lookEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lookEuler.x));
      camera.quaternion.setFromEuler(lookEuler);
    }
  }, { passive: false });
  lookZone.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookTouchId) lookTouchId = null;
  });

  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchJumpPressed = true;
  }, { passive: false });
}

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
  moveDir.addScaledVector(forward, -touchMove.y);
  moveDir.addScaledVector(right, touchMove.x);
  const moving = moveDir.lengthSq() > 0.0001;
  if (moving) moveDir.normalize();

  const speed = keys.shift ? RUN_SPEED : WALK_SPEED;
  const pos = camera.position;

  const nx = pos.x + moveDir.x * speed * dt;
  if (!collidesAt(nx, pos.z)) pos.x = nx;
  const nz = pos.z + moveDir.z * speed * dt;
  if (!collidesAt(pos.x, nz)) pos.z = nz;

  if (touchJumpPressed) {
    touchJumpPressed = false;
    if (onGround) { velocity.y = JUMP_V; onGround = false; }
  }

  // The ladder down to City: while standing in its narrow column, W/S
  // climbs up/down directly instead of the usual gravity/support flow --
  // groundHeight() already turns this one patch of the deck into an open
  // hole (see its own comment), so without this a player here would just
  // fall straight through rather than being able to climb back up too.
  const onLadder = Math.abs(pos.x - LADDER_X) <= LADDER_HOLE_HALF + 0.3 &&
    Math.abs(pos.z - LADDER_Z) <= LADDER_HOLE_HALF + 0.3 &&
    pos.y > EYE_H - 0.3 && pos.y < PLATFORM_H + EYE_H + 0.3;
  if (onLadder && (keys.w || keys.s)) {
    const climbSpeed = 4.5;
    if (keys.w) pos.y += climbSpeed * dt;
    if (keys.s) pos.y -= climbSpeed * dt;
    pos.y = THREE.MathUtils.clamp(pos.y, EYE_H, PLATFORM_H + EYE_H);
    velocity.y = 0;
    onGround = pos.y >= PLATFORM_H + EYE_H - 0.01 || pos.y <= EYE_H + 0.01;
  } else {
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
  }

  const t = performance.now() / 1000;
  const bob = moving && onGround ? Math.sin(t * (keys.shift ? 11 : 7.5)) * 0.03 : 0;
  armGroup.position.y = bob;
}

/* ---------------- game state ---------------- */

const vignette = document.getElementById('dread-vignette');
const jumpscareEl = document.getElementById('jumpscare-flash');
const interactHint = document.getElementById('interact-hint');

function resetAfterCatch() {
  camera.position.copy(SPAWN);
  velocity.set(0, 0, 0);
  onGround = true;
  supersonic.group.position.copy(supersonic.route[0]);
  supersonic.alert = false; supersonic.alertTimer = 0;
  hotCheeto.group.position.copy(hotCheeto.route[0]);
  hotCheeto.alert = false; hotCheeto.alertTimer = 0;
  peanut.group.position.copy(peanut.route[0]);
  peanut.alert = false; peanut.alertTimer = 0;
  lizard.group.position.copy(lizard.route[0]);
  lizard.alert = false; lizard.alertTimer = 0; lizard.roamTimer = 0;
  gunslinger.group.position.copy(gunslinger.route[0]);
  gunslinger.alert = false; gunslinger.alertTimer = 0; gunslinger.roamTimer = 0;
  for (const m of outlaws) {
    m.group.position.copy(m.route[0]);
    m.alert = false; m.alertTimer = 0; m.roamTimer = 0;
  }
  stalker.group.position.copy(stalker.route[0]);
  clampStalkerFromTemples(stalker.group.position);
  stalker.alert = false; stalker.alertTimer = 0; stalker.roamTimer = 0;
  for (const m of wanderers) {
    m.group.position.copy(m.route[0]);
    m.alert = false; m.alertTimer = 0; m.roamTimer = 0;
  }
  monument.group.position.copy(monument.route[0]);
  clampToCity(monument.group.position);
  monument.alert = false; monument.alertTimer = 0; monument.roamTimer = 0;
  monumentStareTimer = 0;
  applyStareEffect(0);
}

const monstersByType = { supersonic, hotcheeto: hotCheeto, peanut };
const SCARE_DURATION = {
  supersonic: 0.8, hotcheeto: 0.9, peanut: 0.6,
  lizard: 0.7, gunslinger: 0.65, outlaw: 0.6,
  stalker: 0.75, wanderer: 0.55, monument: 1.1,
};

let scareActive = false;

// The catch itself: the thing that got you snaps right into your face and
// the CAMERA moves through the scare in first person -- lifted, pulled in,
// shaken -- not just a static shot with a color flash over it.
let scareType = null;
let scareStart = 0;
let scareCamBase = new THREE.Vector3();
let scareCamDir = new THREE.Vector3();

function triggerJumpscare(type, instance) {
  if (scareActive) return;
  scareActive = true;
  scareType = type;
  scareStart = performance.now();
  const m = instance || monstersByType[type]; // statue has 5 instances -- needs the specific one that caught you

  scareCamBase.copy(camera.position);
  scareCamDir.set(0, 0, -1).applyQuaternion(camera.quaternion);

  const facePos = scareCamBase.clone().addScaledVector(scareCamDir, 0.85);
  m.group.position.copy(facePos);
  m.group.lookAt(scareCamBase);

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

/* ---------------- Monument's stare mechanic ---------------- */
/* Look at it (roughly centered in your own forward view, within range)
 * for too long and the screen itself starts to go: grayscale creeping
 * in, then the actual rendered resolution dropping so the image turns
 * genuinely blocky, not just filtered. Looking away decays it back down
 * faster than staring builds it up, so a glance is safe -- it's sustained
 * eye contact that kills you. */

let monumentStareTimer = 0;
const MONUMENT_STARE_DEATH = 4.0; // seconds of continuous staring before death
const MONUMENT_STARE_DECAY = 2.5; // per-second decay once you look away
let lastPixelScale = 1;

function applyStareEffect(progress) {
  renderer.domElement.style.filter = progress > 0 ? `grayscale(${Math.round(progress * 100)}%)` : '';
  const pixelScale = THREE.MathUtils.lerp(1, 0.05, Math.pow(progress, 1.6));
  if (Math.abs(pixelScale - lastPixelScale) > 0.02) {
    lastPixelScale = pixelScale;
    renderer.setPixelRatio(Math.max(0.05, window.devicePixelRatio * pixelScale));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function triggerMonumentDeath() {
  monumentStareTimer = 0;
  applyStareEffect(0); // back to full resolution/color before the jumpscare itself plays
  triggerJumpscare('monument', monument);
}

function updateMonumentStare(dt) {
  if (scareActive || customizeOpen) return;
  const toM = new THREE.Vector3().subVectors(monument.group.position, camera.position);
  const dist = toM.length();
  const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const looking = dist > 0.01 && dist < 40 && camForward.dot(toM.clone().normalize()) > 0.93;
  monumentStareTimer = looking
    ? Math.min(monumentStareTimer + dt, MONUMENT_STARE_DEATH)
    : Math.max(0, monumentStareTimer - dt * MONUMENT_STARE_DECAY);
  applyStareEffect(monumentStareTimer / MONUMENT_STARE_DEATH);
  if (monumentStareTimer >= MONUMENT_STARE_DEATH) triggerMonumentDeath();
}

function updateScareCamera(p, t) {
  const shake = (amt) => (Math.random() - 0.5) * amt;

  if (scareType === 'hotcheeto') {
    // Picked up (lifted off your feet), pulled in toward the mouth, then
    // held in the dark getting chewed on -- three readable beats.
    const lift = Math.min(p / 0.3, 1) * 1.7;
    const pull = Math.max(0, Math.min((p - 0.3) / 0.4, 1)) * 0.95;
    camera.position.copy(scareCamBase)
      .addScaledVector(new THREE.Vector3(0, 1, 0), lift)
      .addScaledVector(scareCamDir, pull);
    // (Positional shake only -- deliberately never touches camera rotation
    // here: doing that previously corrupted the look direction afterward,
    // since this game manages orientation through its own YXZ euler/
    // quaternion path, not the object's default rotation property.)
    const shakeAmt = p < 0.3 ? 0.04 : (p < 0.7 ? 0.12 : 0.2);
    camera.position.x += shake(shakeAmt);
    camera.position.y += shake(shakeAmt);
  } else if (scareType === 'supersonic') {
    // A hard grab-jerk toward it right at the start, then held close and
    // shaken while it screams.
    const jerk = p < 0.08 ? (1 - p / 0.08) * 0.5 : 0;
    camera.position.copy(scareCamBase).addScaledVector(scareCamDir, jerk);
    camera.position.x += shake(0.06);
    camera.position.y += shake(0.06);
  } else {
    camera.position.copy(scareCamBase);
    camera.position.x += shake(0.05);
    camera.position.y += shake(0.05);
  }
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
    const t = (now - scareStart) / 1000;
    const duration = SCARE_DURATION[scareType] || 0.6;
    updateScareCamera(Math.min(t / duration, 1), t);
  } else if ((isLocked() || fallbackLook) && !customizeOpen) {
    movePlayer(dt);

    const skyTarget = skyTargetFor(camera.position.x, camera.position.z);
    const skyT = Math.min(dt * 1.2, 1);
    scene.background.lerp(skyTarget, skyT);
    scene.fog.color.lerp(skyTarget, skyT);

    tickRain(dt);
    if (skyTarget === SKY_CITY) startRainAmbience();

    const nearBestiary = camera.position.distanceTo(bestiaryCenter) < 3.2;
    const nearKeyboard = camera.position.distanceTo(keyboardCenter) < 3.2;
    if (nearBestiary) {
      interactHint.textContent = 'Press E to switch map';
      interactHint.classList.add('show');
    } else if (nearKeyboard) {
      interactHint.textContent = 'Press E to customize';
      interactHint.classList.add('show');
    } else {
      interactHint.classList.remove('show');
    }

    const results = [
      tickSupersonic(dt, camera.position), tickHotCheeto(dt, camera.position),
      tickPeanut(dt, camera.position),
      tickLizard(dt, camera.position), tickGunslinger(dt, camera.position),
      ...outlaws.map((m) => tickOutlaw(m, dt, camera.position)),
      tickStalker(dt, camera.position),
      ...wanderers.map((m) => tickWanderer(m, dt, camera.position)),
      tickMonument(dt, camera.position),
    ];
    updateMonumentStare(dt);
    const danger = Math.max(...results.map((r) => r.danger));
    vignette.style.opacity = String(danger);
    const caught = results.find((r) => {
      if (r.dist >= r.catchR) return false;
      // Supersonic's short -- clear its back with a well-timed jump and it
      // doesn't count, even if you're still within catch range horizontally.
      if (r.hopY !== undefined && camera.position.y - EYE_H > r.hopY) return false;
      return true;
    });
    if (caught) triggerJumpscare(caught.type, caught.instance);
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', resizeRenderer);

} // end boot()

function waitForThreeThenBoot() {
  if (typeof THREE !== 'undefined') boot();
  else setTimeout(waitForThreeThenBoot, 10);
}
waitForThreeThenBoot();
