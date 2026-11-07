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

// Winter Wonderland: same architecture again, on the one remaining side
// (north) -- flat snowy ground (like Badland's flat desert, not Jungle's
// hilly one), reached the same way through a boundary-wall hole and its
// own winding tunnel. The biggest of the three by a clear margin, since
// nothing constrains it any differently than Badland/Jungle were.
const WINTER_HALF = 120;
const WINTER_HOLE_HALF_W = 2.5;
const WINTER_X = 0;
const WINTER_Z = WALL_R + 1 + TUNNEL_LEN + WINTER_HALF;

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
const SKY_WINTER = new THREE.Color(0xc7d2da);
// Overrides every zone's own sky while the god event (see "summon shrine"
// below) is active -- deliberately the same color in every map at once,
// not just Winter Wonderland where the shrine itself lives.
const SKY_GOD_EVENT = new THREE.Color(0x6b0000);
function skyTargetFor(x, z) {
  if (Math.abs(x - BADLAND_X) <= BADLAND_HALF && Math.abs(z - BADLAND_Z) <= BADLAND_HALF) return SKY_BADLAND;
  if (Math.abs(x - JUNGLE_X) <= JUNGLE_HALF && Math.abs(z - JUNGLE_Z) <= JUNGLE_HALF) return SKY_JUNGLE;
  if (Math.abs(x - WINTER_X) <= WINTER_HALF && Math.abs(z - WINTER_Z) <= WINTER_HALF) return SKY_WINTER;
  return SKY_FOREST;
}
// Winter Wonderland also thickens the fog itself (a real snowy-whiteout
// haze, not just a color change) -- the other two zones keep the
// forest's own density.
const FOG_DENSITY_FOREST = 0.028;
const FOG_DENSITY_WINTER = 0.065;
const FOG_DENSITY_GOD_EVENT = 0.045;
function fogDensityFor(x, z) {
  if (Math.abs(x - WINTER_X) <= WINTER_HALF && Math.abs(z - WINTER_Z) <= WINTER_HALF) return FOG_DENSITY_WINTER;
  return FOG_DENSITY_FOREST;
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
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = 72;
  while (fontSize > 24) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    if (ctx.measureText(text).width <= width - 40) break;
    fontSize -= 4;
  }
  ctx.fillText(text, width / 2, height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

const woodMat = new THREE.MeshStandardMaterial({ color: 0x4e3a26, roughness: 0.95, map: makeGrainTexture({ dark: 140, light: 235, repeat: 7, blotch: 4 }) });
const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x241b12, roughness: 1, map: makeGrainTexture({ dark: 110, light: 220, repeat: 5, blotch: 3 }) });
// Every winding tunnel's own walls -- a single shared material, deliberately
// higher-contrast and coarser-grained than the general-purpose ones above,
// so the walls themselves read as a distinct, textured surface rather than
// nearly-flat color in the dark (reused regardless of which map a given
// tunnel leads to, same as one shared tunnel style for all of them).
const tunnelWallMat = new THREE.MeshStandardMaterial({ color: 0x2c2520, roughness: 0.95, map: makeGrainTexture({ dark: 40, light: 230, repeat: 10, blotch: 4 }) });
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
  // Winter Wonderland's own snow hills -- gentle drifts, not real
  // mountains (amp 7-12, between Jungle's small bumps and the forest's
  // big ones), spread around WINTER_X/Z. Gingerbread-house interiors and
  // the tunnel mouth stay flat regardless, since the snow ground mesh
  // below is flatZone-aware the same way the forest's and Jungle's are.
  { x: WINTER_X - 35, z: WINTER_Z + 5, amp: 10, r: 22 },
  { x: WINTER_X + 30, z: WINTER_Z + 30, amp: 12, r: 24 },
  { x: WINTER_X - 10, z: WINTER_Z + 50, amp: 8, r: 20 },
  { x: WINTER_X + 40, z: WINTER_Z - 25, amp: 7, r: 18 },
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
  for (const fz of flatZones) {
    if (x >= fz.minX && x <= fz.maxX && z >= fz.minZ && z <= fz.maxZ) return 0;
  }
  return baseHillHeight(x, z);
}

const GROUND_EXTENT = 135;
const GROUND_SEGMENTS = 135;

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
// Separate from both of the above on purpose: every existing collider stays
// exactly as height-blind as it's always been (collidesAt below never took
// a y at all, which was itself a real bug once already -- see
// buildWindingTunnel's own notes), so adding height awareness everywhere
// at once would quietly make things hoppable that were never meant to be
// (building walls, boundary walls, ...). This list alone is checked
// against the player's own foot height, and only ever holds things
// deliberately built short enough to clear -- the spawn stockade fence.
const hoppableColliders = []; // { circle: bool, ...bounds, maxY }

function addCircleCollider(x, z, r) { circleColliders.push({ x, z, r }); }
function addHoppableCircle(x, z, r, maxY) { hoppableColliders.push({ circle: true, x, z, r, maxY }); }

function collidesAt(x, z, footY = -Infinity) {
  for (const c of circleColliders) {
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + PLAYER_R) * (c.r + PLAYER_R)) return true;
  }
  for (const b of boxColliders) {
    if (x + PLAYER_R > b.min.x && x - PLAYER_R < b.max.x &&
        z + PLAYER_R > b.min.z && z - PLAYER_R < b.max.z) return true;
  }
  for (const h of hoppableColliders) {
    if (footY >= h.maxY - 0.1) continue; // cleared it
    if (h.circle) {
      const dx = x - h.x, dz = z - h.z;
      if (dx * dx + dz * dz < (h.r + PLAYER_R) * (h.r + PLAYER_R)) return true;
    }
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

  // North wall: split around a hole at WINTER_X -- the only way out to
  // Winter Wonderland.
  boundaryWall(-WALL_R - 1, WINTER_X - WINTER_HOLE_HALF_W, WALL_R - 1, WALL_R + 1);
  boundaryWall(WINTER_X + WINTER_HOLE_HALF_W, WALL_R + 1, WALL_R - 1, WALL_R + 1);
  {
    const holeH = 4.5;
    const lintelH = 12 - holeH;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(WINTER_HOLE_HALF_W * 2, lintelH, 2), wallMat2);
    lintel.position.set(WINTER_X, holeH + lintelH / 2, WALL_R);
    scene.add(lintel);
  }
}

// A small sign mounted on the wall's forest-facing surface, right above
// each hole -- the only hint either gap exists at all, labelling it
// before anyone actually walks through. (normalX, normalZ) is the unit
// vector the sign's face should point along -- (±1,0) for the east/west
// walls, (0,±1) for the north one.
function buildEntranceSign(x, z, normalX, normalZ, text, fg, width = 3.2) {
  const tex = makeTextTexture(text, { fg });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.0), mat);
  sign.position.set(x, 5.3, z);
  sign.rotation.y = Math.atan2(normalX, normalZ);
  scene.add(sign);
}
buildEntranceSign(WALL_R - 1.05, BADLAND_Z, -1, 0, 'BADLAND', '#e8c77a');
buildEntranceSign(-WALL_R + 1.05, JUNGLE_Z, 1, 0, 'JUNGLE', '#9fe8c9');
buildEntranceSign(WINTER_X, WALL_R - 1.05, 0, -1, 'WINTER WONDERLAND', '#bfe8ff', 5.2);

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
// it: the primitives for a corridor's straight legs and its 90-degree
// turn rooms.
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
      const light = new THREE.PointLight(0xd8c8a0, 0.8, 16, 2);
      light.position.set((minX + maxX) / 2, wallH * 0.75, cz);
      scene.add(light);
    } else {
      const cx = p0.x;
      wallBox(cx - holeHalfW - wallT, cx - holeHalfW, minZ, maxZ);
      wallBox(cx + holeHalfW, cx + holeHalfW + wallT, minZ, maxZ);
      floorCeil(cx - holeHalfW, cx + holeHalfW, minZ, maxZ);
      const light = new THREE.PointLight(0xd8c8a0, 0.8, 16, 2);
      light.position.set(cx, wallH * 0.75, (minZ + maxZ) / 2);
      scene.add(light);
    }
  }

  // A room at each turn, lit so the turn is actually visible coming
  // (unlike before), solid on every side except the two directions (unit
  // vectors, always axis-aligned here) a corridor actually continues
  // through. Deliberately the SAME width as the corridor itself
  // (holeHalfW, not wider) -- a wider turning bay was tried and pulled
  // again: its walls sat at a different offset than the connecting
  // segment's own narrower walls, and the gap between the two read as
  // an invisible platform / a way to walk past the wall, not a room.
  function junction(p, openDirs) {
    const minX = p.x - holeHalfW, maxX = p.x + holeHalfW;
    const minZ = p.z - holeHalfW, maxZ = p.z + holeHalfW;
    const isOpen = (ddx, ddz) => openDirs.some((d) => d.x === ddx && d.z === ddz);
    if (!isOpen(-1, 0)) wallBox(minX - wallT, minX, minZ - wallT, maxZ + wallT);
    if (!isOpen(1, 0)) wallBox(maxX, maxX + wallT, minZ - wallT, maxZ + wallT);
    if (!isOpen(0, -1)) wallBox(minX - wallT, maxX + wallT, minZ - wallT, minZ);
    if (!isOpen(0, 1)) wallBox(minX - wallT, maxX + wallT, maxZ, maxZ + wallT);
    floorCeil(minX - wallT, maxX + wallT, minZ - wallT, maxZ + wallT);
    const light = new THREE.PointLight(0xd8c8a0, 1.1, holeHalfW * 7, 2);
    light.position.set(p.x, wallH * 0.75, p.z);
    scene.add(light);
  }

  return { segment, junction, wallT };
}

function buildWindingTunnel(x0, z0, x1, z1, holeHalfW, wallH, mat) {
  const dx = x1 - x0, dz = z1 - z0;
  const dist = Math.hypot(dx, dz);
  const fx = dx / dist, fz = dz / dist; // forward unit vector
  const rx = -fz, rz = fx;              // right unit vector (90deg rotate)
  const { segment, junction, wallT } = makeCorridorBuilder(holeHalfW, wallH, mat);

  const L1 = dist * (0.2 + rand() * 0.12);
  const L2 = dist * (0.2 + rand() * 0.12);
  // The jog leg (p1->p2, then its mirror p3->p4) shares its own exact x
  // (or z) with the straight legs immediately before and after it, since
  // the jog is purely perpendicular -- no offset along the direction of
  // travel. That means the straight legs' own confining walls (built to
  // keep THEM within holeHalfW, same as every other leg) reach right up
  // to that shared coordinate, each eating wallT past its own edge, and
  // the player's own radius eats further still into whatever's left
  // between them. A jog magnitude picked without that in mind (this used
  // to be a flat 5..9) could leave less than 2*PLAYER_R of real clearance
  // there -- passable in theory, not in practice -- which is exactly why
  // "can't get into Badland/Jungle/Winter Wonderland, there's a wall in
  // the way" came and went depending on the random seed of the page load
  // (roughly 45% of the old range was too tight) rather than failing
  // every time. +3 of slack on top of the bare minimum so it's never a
  // photo finish even at the low end of the random range.
  const jogClearance = holeHalfW * 2 + wallT * 2 + PLAYER_R * 2 + 3;
  const jogMag = jogClearance + rand() * 4;
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
  // segments above. Hoppable, not a plain block: it's a 3-unit fence, and
  // the player's own jump clears well past that now.
  const COLLIDE_STEPS = 72;
  const collideStep = (Math.PI * 2) / COLLIDE_STEPS;
  for (let i = 0; i < COLLIDE_STEPS; i++) {
    const a0 = i * collideStep;
    const a = a0 > Math.PI ? a0 - Math.PI * 2 : a0;
    if (nearAnyGate(a)) continue;
    addHoppableCircle(SPAWN_WALL_R * Math.sin(a0), -SPAWN_WALL_R * Math.cos(a0), WALL_THICK / 2 + 1.0, WALL_H);
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
  bodyColor, bodyEmissive = 0x000000, bodyEmissiveIntensity = 0, bodyMap = null,
  eyeColor, eyeEmissiveIntensity = 2.5,
  torsoLen = 1.0, headScale = 1, armLen = 0.5, roughness = 0.9, arms = true,
  faceDetails = true, // false skips muzzle/eyes/brow/nostril/pupil/mouth -- a blank head
  pupils = true, // false keeps the glowing eyes themselves but drops just the pupil dot -- a blank, pupil-less stare
}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: bodyColor, emissive: bodyEmissive, emissiveIntensity: bodyEmissiveIntensity, roughness, map: bodyMap,
  });

  // Torso: a lean ape silhouette (a squashed sphere, not a cone) tapering
  // down to nothing instead of legs. Low segment counts + an oversized
  // round head and broad shoulders is the Gorilla-Tag look this factory
  // is explicitly going for -- a stocky, big-headed, big-handed avatar
  // rather than a realistic chimp. torsoHalfH (the Y-axis math every
  // add*() prop helper and chimpHeadY/chimpTorsoY key off) is untouched
  // by the broader X/Z footprint below, so hats/horns/beards on every
  // existing monster still land in the same place.
  const torsoScaleY = torsoLen * 0.75;
  const torsoHalfH = 0.32 * torsoScaleY;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 6), mat);
  torso.scale.set(1.2, torsoScaleY, 1.08);
  torso.position.y = torsoHalfH + 0.15;
  g.add(torso);

  // Head radius bumped from the original 0.38 to 0.46 (headScale still
  // applies on top) -- every other head-relative offset below (muzzle,
  // ears, eyes, brow, nostril, pupil, mouth) is scaled up by the same
  // ~1.21 ratio so the face stays in proportion on the now-bigger skull
  // instead of sinking into it.
  const headY = torso.position.y + torsoHalfH + 0.34 * headScale;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46 * headScale, 8, 7), mat);
  head.position.y = headY;
  g.add(head);

  // Muzzle + ears are what actually read as "chimp" instead of "blob" --
  // the muzzle is skipped below with the rest of the face for a blank-head
  // monster, but ears stay either way (they're part of the head's own
  // silhouette, not a facial feature).
  if (faceDetails) {
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.205 * headScale, 6, 5), mat);
    muzzle.scale.set(1, 0.75, 1.2);
    muzzle.position.set(0, headY - 0.12 * headScale, 0.39 * headScale);
    g.add(muzzle);
  }

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.12 * headScale, 6, 5), mat);
    ear.scale.set(0.55, 1, 0.35);
    ear.position.set(side * 0.41 * headScale, headY + 0.04 * headScale, -0.03);
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
      // Shoulders pushed out to 0.4 (was 0.34) to clear the now-broader
      // torso footprint above.
      const shoulder = new THREE.Vector3(side * 0.4, shoulderY, 0.05);
      const pivot = new THREE.Group();
      pivot.position.copy(shoulder);
      g.add(pivot);

      // Thick, Gorilla-Tag-ish arms -- these are the whole point of that
      // look (the hands are what you actually grab/move with), so they're
      // noticeably chunkier than a realistic ape's: upper arm 0.1->0.15,
      // forearm 0.085->0.13, hand 0.1->0.17.
      const upperDir = new THREE.Vector3(Math.sin(armAngle), -Math.cos(armAngle), 0);
      const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, upperLen, 4, 6), mat);
      upperArm.rotation.z = armAngle;
      upperArm.position.copy(upperDir.clone().multiplyScalar(upperLen / 2 + 0.05));
      pivot.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.copy(upperDir.clone().multiplyScalar(upperLen + 0.08));
      pivot.add(elbow);

      const foreArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, foreLen, 4, 6), mat);
      foreArm.position.y = -foreLen / 2 - 0.05;
      elbow.add(foreArm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), mat);
      hand.position.y = -foreLen - 0.09;
      elbow.add(hand);

      armPivots.push(pivot);
      elbowPivots.push(elbow);
    }
  }
  g.userData.armPivots = armPivots;
  g.userData.elbowPivots = elbowPivots;
  g.userData.head = head; // used for a running head-bob, even on armless monsters

  // Pushed out past the head sphere's own radius (0.46*headScale) so they
  // actually protrude and read as eyes instead of being buried inside it.
  // Skipped along with the rest of the face below for a blank-head
  // monster -- no eyes, no glow, nothing looking back at you at all.
  if (faceDetails) {
    const eyeMat = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: eyeEmissiveIntensity });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.079 * headScale, 7, 6), eyeMat);
      eye.position.set(side * 0.206 * headScale, headY + 0.036 * headScale, 0.448 * headScale);
      g.add(eye);
    }

    // Brow ridges, nostrils, a mouth line, and pupils -- the glowing eyes
    // alone read as a blank, blind mask; these few extra low-poly details
    // are what actually makes it look like a face looking back at you.
    for (const side of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.194 * headScale, 0.054 * headScale, 0.109 * headScale), faceDetailMat);
      brow.position.set(side * 0.206 * headScale, headY + 0.133 * headScale, 0.424 * headScale);
      brow.rotation.z = side * 0.15;
      g.add(brow);

      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.036 * headScale, 5, 4), faceDetailMat);
      nostril.position.set(side * 0.073 * headScale, headY - 0.169 * headScale, 0.532 * headScale);
      g.add(nostril);

      if (pupils) {
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.039 * headScale, 5, 4), faceDetailMat);
        pupil.position.set(side * 0.206 * headScale, headY + 0.036 * headScale, 0.496 * headScale);
        g.add(pupil);
      }
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.206 * headScale, 0.036 * headScale, 0.061 * headScale), faceDetailMat);
    mouth.position.set(0, headY - 0.29 * headScale, 0.496 * headScale);
    g.add(mouth);
  }

  g.userData.hoverHeight = 0.15; // feet (or lack of them) float this far off the ground
  return g;
}

function createSupersonicModel() {
  return createChimpModel({
    bodyColor: 0x0f2e40, bodyEmissive: 0x1ec8ff, bodyEmissiveIntensity: 1.3,
    eyeColor: 0xffffff, eyeEmissiveIntensity: 4.5,
    torsoLen: 2.4, headScale: 0.75, armLen: 0.6, roughness: 0.5,
  });
}

function createHotCheetoModel() {
  // Same base proportions as Supersonic, just scaled up 4x as a whole --
  // keeps it the same "shape", not a different (and re-tuned) silhouette.
  const g = createChimpModel({
    bodyColor: 0x5c1220, eyeColor: 0xff0033, eyeEmissiveIntensity: 5,
    torsoLen: 2.4, headScale: 0.75, armLen: 0.6, roughness: 0.75,
  });
  g.scale.setScalar(4);
  g.userData.hoverHeight = 0.15 * 4;
  return g;
}

function createPeanutModel() {
  return createChimpModel({
    bodyColor: 0xc9a06b, eyeColor: 0x3a2a14, eyeEmissiveIntensity: 1.6,
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
    bodyColor: 0x05070a, eyeColor: 0xe4ffe8, eyeEmissiveIntensity: 4.2,
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

/* ---------------- Winter Wonderland cast (props bolted onto the same
 * chimp factory again) ---------------- */

const icingMat = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.8 });
const candyRedMat = new THREE.MeshStandardMaterial({ color: 0xb4192a, roughness: 0.6 });
const candyWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.6 });
const elfRedMat = new THREE.MeshStandardMaterial({ color: 0xa41c24, roughness: 0.8 });
const elfGreenMat = new THREE.MeshStandardMaterial({ color: 0x1f6b35, roughness: 0.8 });
const krampusPropMat = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.9 });
const krampusHornMat = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.7 });

function createGingyModel() {
  // Gingerbread brown, no face at all.
  return createChimpModel({
    bodyColor: 0x8b5a2b, eyeColor: 0x8b5a2b, eyeEmissiveIntensity: 0,
    torsoLen: 1.0, headScale: 1.0, armLen: 0.5, roughness: 0.85,
    faceDetails: false,
  });
}

// A diagonal red/white stripe pattern for Crangler's own "candy cane
// print" -- same canvas-texture discipline as the grain textures, just a
// drawn pattern instead of noise.
function makeStripeTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8e2d4';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#c21a2a';
  ctx.lineWidth = size / 6;
  for (let i = -size; i < size * 2; i += size / 3) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}
const candyStripeTex = makeStripeTexture();

function createCranglerModel() {
  // Whole body AND arms stretched 5x upward -- torsoLen is the body
  // stretch, armLen the arm stretch, pushed together rather than just
  // one (Stalker's own stretch only ever touched torsoLen).
  return createChimpModel({
    bodyColor: 0xffffff, eyeColor: 0xff1a2a, eyeEmissiveIntensity: 4,
    bodyMap: candyStripeTex,
    torsoLen: 5.0, headScale: 0.7, armLen: 2.2, roughness: 0.6,
  });
}

function addElfHat(g, headY, headScale, mat) {
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22 * headScale, 0.5 * headScale, 8), mat);
  hat.position.set(0, headY + 0.55 * headScale, 0);
  g.add(hat);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.2 * headScale, 0.05 * headScale, 6, 10), icingMat);
  trim.position.set(0, headY + 0.32 * headScale, 0);
  trim.rotation.x = Math.PI / 2;
  g.add(trim);
}
function addElfTunic(g, torsoY, mat) {
  const tunic = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.35, 8), mat);
  tunic.position.set(0, torsoY, 0);
  g.add(tunic);
}
function createElfModel(color) {
  const mat = color === 'red' ? elfRedMat : elfGreenMat;
  const torsoLen = 1.0, headScale = 1.0;
  const g = createChimpModel({
    bodyColor: 0xc9a06b, eyeColor: 0x3a2a14, eyeEmissiveIntensity: 1.4,
    torsoLen, headScale, armLen: 0.5, roughness: 0.85,
  });
  addElfTunic(g, chimpTorsoY(torsoLen), mat);
  addElfHat(g, chimpHeadY(torsoLen, headScale), headScale, mat);
  return g;
}
function createElfModelRed() { return createElfModel('red'); }
function createElfModelGreen() { return createElfModel('green'); }

function addBeard(g, headY, headScale, mat = krampusPropMat) {
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.18 * headScale, 0.4 * headScale, 8), mat);
  beard.position.set(0, headY - 0.3 * headScale, 0.25 * headScale);
  beard.rotation.x = Math.PI;
  g.add(beard);
}
function addSantaHat(g, headY, headScale) {
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.24 * headScale, 0.55 * headScale, 8), elfRedMat);
  hat.position.set(0.05 * headScale, headY + 0.58 * headScale, 0);
  g.add(hat);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.22 * headScale, 0.05 * headScale, 6, 10), icingMat);
  trim.position.set(0, headY + 0.34 * headScale, 0);
  trim.rotation.x = Math.PI / 2;
  g.add(trim);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08 * headScale, 6, 5), icingMat);
  pom.position.set(0.25 * headScale, headY + 0.85 * headScale, 0);
  g.add(pom);
}
function addHorns(g, headY, headScale) {
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06 * headScale, 0.35 * headScale, 6), krampusHornMat);
    horn.position.set(side * 0.2 * headScale, headY + 0.5 * headScale, -0.1 * headScale);
    horn.rotation.z = side * -0.4;
    horn.rotation.x = -0.3;
    g.add(horn);
  }
}
// Pale, blotchy, sickly skin for Krampus -- a dark grain texture over a
// desaturated pale green-grey base reads as rot rather than clean fur,
// same "multiply a noise texture over the base color" technique every
// other material on this site already uses.
const krampusRotTex = makeGrainTexture({ dark: 55, light: 205, repeat: 16, blotch: 4 });

function createKrampusModel() {
  // Whole body, arms, AND head all scaled up together, uniformly, 6x --
  // unlike Stalker's own stretch (torsoLen only), this one keeps normal
  // proportions and scales the entire finished model instead. torsoLen
  // 2.0 (on request) stretches the torso itself 2x taller on top of that
  // uniform 6x, the same "stretch the torso, not just scale everything"
  // technique Stalker uses for its own elongated look.
  const torsoLen = 2.0, headScale = 1.0;
  const g = createChimpModel({
    bodyColor: 0x8a9b82, bodyMap: krampusRotTex, eyeColor: 0x7ad8ff, eyeEmissiveIntensity: 3.5,
    torsoLen, headScale, armLen: 0.6, roughness: 0.95, pupils: false,
  });
  addBeard(g, chimpHeadY(torsoLen, headScale), headScale);
  addSantaHat(g, chimpHeadY(torsoLen, headScale), headScale);
  addHorns(g, chimpHeadY(torsoLen, headScale), headScale);
  // Bent claws -- just darker, slightly bigger hands than the factory's own.
  for (const elbow of g.userData.elbowPivots) {
    const hand = elbow.children[elbow.children.length - 1];
    if (hand) { hand.material = krampusPropMat; hand.scale.setScalar(1.4); }
  }
  g.scale.setScalar(6);
  g.userData.hoverHeight *= 6;
  return g;
}

// The summoned god -- a giant Santa chimp riding a sleigh, not walking.
// Built from the same factory as everything else (consistency with the
// rest of the cast matters more here than realism), scaled up even
// further than Krampus since this is meant to read as the single biggest,
// most dramatic thing in the game. It doesn't use hoverHeight/groundHeight
// at all -- see tickSantaGod() -- it actually flies.
const sleighBodyMat = new THREE.MeshStandardMaterial({ color: 0x6b1a1a, roughness: 0.5, metalness: 0.15 });
const sleighTrimMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.7 });
const SANTA_GOD_SCALE = 10;
function createSantaGodModel() {
  const torsoLen = 1.2, headScale = 1.1;
  const g = createChimpModel({
    bodyColor: 0xa41824, eyeColor: 0xffd24a, eyeEmissiveIntensity: 4.5,
    torsoLen, headScale, armLen: 0.65, roughness: 0.75,
  });
  // A white beard (icingMat, not the dark krampusPropMat default) and the
  // same Santa hat Krampus wears -- this is the "real" Santa the rest of
  // Winter Wonderland's cast is only ever riffing on.
  addBeard(g, chimpHeadY(torsoLen, headScale), headScale, icingMat);
  addSantaHat(g, chimpHeadY(torsoLen, headScale), headScale);

  // A simple curved-runner sleigh, slung beneath and behind the body as
  // if it's standing in it driving.
  const sleigh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2.4), sleighBodyMat);
  body.position.set(0, -0.55, -1.1);
  sleigh.add(body);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.1, 2.46), sleighTrimMat);
  trim.position.set(0, -0.26, -1.1);
  sleigh.add(trim);
  const curl = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 6, 10, Math.PI), sleighTrimMat);
  curl.rotation.x = Math.PI / 2;
  curl.position.set(0, -0.2, -2.25);
  sleigh.add(curl);
  for (const side of [-1, 1]) {
    const runner = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.8), sleighTrimMat);
    runner.position.set(side * 0.65, -0.95, -1.0);
    sleigh.add(runner);
  }
  g.add(sleigh);

  g.userData.hoverHeight = 0; // flies -- see tickSantaGod(), not groundHeight-driven
  g.scale.setScalar(SANTA_GOD_SCALE);
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
  return chimpTorsoY(torsoLen) + torsoHalfH + 0.34 * headScale;
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
    bodyColor: 0x5a6b3a, eyeColor: 0xd4ff3a, eyeEmissiveIntensity: 3.2,
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
    bodyColor: 0x6b4a2f, eyeColor: 0x3a2a14, eyeEmissiveIntensity: 1.6,
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
    bodyColor: 0x4a3a2a, eyeColor: 0x8a1a1a, eyeEmissiveIntensity: 2.0,
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
  { title: 'WINTERLAND', monsters: [
      { name: 'Gingy', make: createGingyModel },
      { name: 'Crangler', make: createCranglerModel },
      { name: 'Elf', make: createElfModelRed },
      { name: 'Krampus', make: createKrampusModel },
    ] },
];
const BESTIARY_SLOT_X = [-5.9, -4.8, -3.7, -2.6];
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
buildWindingTunnel(WALL_R + 1, BADLAND_Z, BADLAND_X - BADLAND_HALF, BADLAND_Z, BADLAND_HOLE_HALF_W, 4.5, tunnelWallMat);

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
buildWindingTunnel(-(WALL_R + 1), JUNGLE_Z, JUNGLE_X + JUNGLE_HALF, JUNGLE_Z, JUNGLE_HOLE_HALF_W, 4.5, tunnelWallMat);

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
  // A flat roof over the corridor and chamber too -- visual only, same as
  // the tiers above, but without it there was nothing overhead back
  // there at all: looking up inside the dungeon showed open sky straight
  // past the edge of the map instead of a ceiling.
  const dungeonRoof = new THREE.Mesh(new THREE.BoxGeometry(chHalfW * 2 + 1, 0.3, (chMaxZ - maxZ) + 1), templeStoneMat);
  dungeonRoof.position.set(cx, wallH + 0.15, (maxZ + chMaxZ) / 2);
  scene.add(dungeonRoof);

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

  // Deliberately no light back here at all -- it's a dungeon, dark except
  // for whatever the player's own flashlight reaches.

  templeBounds.push({ minX: Math.min(minX, chMinX), maxX: Math.max(maxX, chMaxX), minZ, maxZ: chMaxZ });
}

buildTemple(JUNGLE_X - 12, JUNGLE_Z - 10);
buildTemple(JUNGLE_X + 4, JUNGLE_Z + 6);

// Jungle's own ground -- past GROUND_EXTENT just like Badland's sand
// plane is, but hilly instead of flat (the small hills registered above
// still apply out here), so it needs real per-vertex displacement from
// the same baseHillHeight() the main terrain mesh uses, not a single
// flat plane. Built *after* the temples specifically so their bounds are
// already known: any vertex inside one is forced flat, the same way
// registerFlatZone() already keeps the gameplay floor height flat there
// -- without this, the grass terrain mesh itself (a separate, pre-baked
// geometry flatZones never touches) still showed through the dungeon's
// own stone floor as real, walkable grass.
{
  const segs = 48;
  const jGeo = new THREE.PlaneGeometry(JUNGLE_HALF * 2, JUNGLE_HALF * 2, segs, segs);
  jGeo.rotateX(-Math.PI / 2);
  const pos = jGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i) + JUNGLE_X, vz = pos.getZ(i) + JUNGLE_Z;
    let inTemple = false;
    for (const b of templeBounds) {
      if (vx >= b.minX - 1 && vx <= b.maxX + 1 && vz >= b.minZ - 1 && vz <= b.maxZ + 1) { inTemple = true; break; }
    }
    pos.setY(i, inTemple ? 0 : baseHillHeight(vx, vz));
  }
  pos.needsUpdate = true;
  jGeo.computeVertexNormals();
  const jGround = new THREE.Mesh(jGeo, groundMat);
  jGround.position.set(JUNGLE_X, 0, JUNGLE_Z);
  scene.add(jGround);
}

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

/* ---------------- Winter Wonderland (snow, brick paths, gingerbread houses, north) ---------------- */

const snowMat = new THREE.MeshStandardMaterial({ color: 0xeef3f7, roughness: 0.9, map: makeGrainTexture({ size: 150, dark: 210, light: 255, repeat: 35, blotch: 2 }) });
const brickMat = new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.9, map: makeGrainTexture({ dark: 90, light: 200, repeat: 18, blotch: 3 }) });
const gingerMat = new THREE.MeshStandardMaterial({ color: 0x6b3a1a, roughness: 0.9, map: makeGrainTexture({ dark: 80, light: 190, repeat: 12, blotch: 3 }) });
const winterWallMat = new THREE.MeshStandardMaterial({ color: 0xd8e4ea, roughness: 0.85, map: makeGrainTexture({ dark: 160, light: 250, repeat: 20, blotch: 3 }) });

// The corridor down from the forest's own north gate, same technique as
// Badland's/Jungle's.
buildWindingTunnel(WINTER_X, WALL_R + 1, WINTER_X, WINTER_Z - WINTER_HALF, WINTER_HOLE_HALF_W, 4.5, tunnelWallMat);

// The actual rendered forest ground — groundHeight() above only ever
// drove collision/placement math; without a mesh that follows it, the
// forest floor was invisible (void) the instant you stepped off the
// deck. Built here, AFTER all three tunnels (Badland/Jungle/Winter) have
// already run buildWindingTunnel() and registered their own flatZones,
// and flatZone-aware the same way groundHeight() is -- but deliberately
// NOT routed through groundHeight() itself, since that function also
// forces the platform/ramp area up to PLATFORM_H for collision purposes,
// and this mesh visually needs to stay low there (the deck is stilted
// above open space, not sitting on raised ground). A forest hill happens
// to sit right next to the Winter tunnel's mouth (the x:18/z:75 and
// x:-30/z:80 hills both reach out past z=120), and without the flatZone
// check below, the grass terrain poked up through the tunnel opening --
// walkable the whole time, since collidesAt() never looked at this mesh
// at all, but it visually read as "blocked off by grass," just as bad as
// an actual wall there.
function terrainHeight(x, z) {
  for (const fz of flatZones) {
    if (x >= fz.minX && x <= fz.maxX && z >= fz.minZ && z <= fz.maxZ) return 0;
  }
  return baseHillHeight(x, z);
}
{
  const groundGeo = new THREE.PlaneGeometry(GROUND_EXTENT * 2, GROUND_EXTENT * 2, GROUND_SEGMENTS, GROUND_SEGMENTS);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  groundGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(groundGeo, groundMat));
}

const WINTER_WALL_H = 9.0;
const wMinX = WINTER_X - WINTER_HALF, wMaxX = WINTER_X + WINTER_HALF;
const wMinZ = WINTER_Z - WINTER_HALF, wMaxZ = WINTER_Z + WINTER_HALF;
{
  const wallT = 0.6;
  // South wall, split around the door the tunnel arrives through.
  buildRuggedWall(wMinX, WINTER_X - WINTER_HOLE_HALF_W, wMinZ, wMinZ + wallT, WINTER_WALL_H, winterWallMat);
  buildRuggedWall(WINTER_X + WINTER_HOLE_HALF_W, wMaxX, wMinZ, wMinZ + wallT, WINTER_WALL_H, winterWallMat);
  buildRuggedWall(wMinX, wMaxX, wMaxZ - wallT, wMaxZ, WINTER_WALL_H, winterWallMat); // north, dead end
  buildRuggedWall(wMinX, wMinX + wallT, wMinZ, wMaxZ, WINTER_WALL_H, winterWallMat); // west
  buildRuggedWall(wMaxX - wallT, wMaxX, wMinZ, wMaxZ, WINTER_WALL_H, winterWallMat); // east
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(WINTER_HOLE_HALF_W * 2, 1.2, wallT), winterWallMat);
  lintel.position.set(WINTER_X, WINTER_WALL_H - 0.6, wMinZ + wallT / 2);
  scene.add(lintel);
}

// Segmented and per-vertex displaced through terrainHeight() -- same
// technique as the forest's own ground mesh above -- rather than one flat
// plane, so the new snow hills actually show up and the tunnel mouth /
// gingerbread house interiors (already flatZone-registered once those are
// built below) stay walkable-flat regardless.
const SNOW_SEGMENTS = 100;
const snowGeo = new THREE.PlaneGeometry(WINTER_HALF * 2, WINTER_HALF * 2, SNOW_SEGMENTS, SNOW_SEGMENTS);
snowGeo.rotateX(-Math.PI / 2);
const snowGround = new THREE.Mesh(snowGeo, snowMat);
snowGround.position.set(WINTER_X, 0, WINTER_Z);
scene.add(snowGround);

// A brick path straight up from the entrance toward the middle of the map.
{
  const path = new THREE.Mesh(new THREE.PlaneGeometry(4, WINTER_HALF * 1.2), brickMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(WINTER_X, 0.04, WINTER_Z - WINTER_HALF * 0.35);
  scene.add(path);
}

function makeCandyCane(x, z) {
  const h = groundHeight(x, z);
  const poleH = 1.8;
  for (let s = 0; s < 6; s++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, poleH / 6, 6), s % 2 === 0 ? candyRedMat : candyWhiteMat);
    seg.position.set(x, h + (s + 0.5) * (poleH / 6), z);
    scene.add(seg);
  }
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.1, 6, 10, Math.PI), candyRedMat);
  hook.position.set(x, h + poleH, z);
  hook.rotation.z = Math.PI;
  scene.add(hook);
  addCircleCollider(x, z, 0.15);
}
let canesPlaced = 0;
while (canesPlaced < 40) {
  const x = WINTER_X + (rand() - 0.5) * WINTER_HALF * 1.7;
  const z = WINTER_Z + (rand() - 0.5) * WINTER_HALF * 1.7;
  makeCandyCane(x, z);
  canesPlaced++;
}

const winterHouseBounds = []; // { minX, maxX, minZ, maxZ } -- Krampus can never enter any of these

function buildGingerbreadHouse(cx, cz, halfW, halfD) {
  const minX = cx - halfW, maxX = cx + halfW, minZ = cz - halfD, maxZ = cz + halfD;
  const wallT = 0.3, wallH = 4.0, doorHalfW = 1.3;
  function wall(x0, x1, z0, z1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, wallH, z1 - z0), gingerMat);
    mesh.position.set((x0 + x1) / 2, wallH / 2, (z0 + z1) / 2);
    scene.add(mesh);
    boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, wallH, z1)));
  }
  wall(minX, maxX, maxZ - wallT, maxZ); // back
  wall(minX, minX + wallT, minZ, maxZ); // west
  wall(maxX - wallT, maxX, minZ, maxZ); // east
  wall(minX, cx - doorHalfW, minZ, minZ + wallT); // south, west of door
  wall(cx + doorHalfW, maxX, minZ, minZ + wallT); // south, east of door
  const doorLintel = new THREE.Mesh(new THREE.BoxGeometry(doorHalfW * 2, 1.0, wallT), icingMat);
  doorLintel.position.set(cx, wallH - 0.5, minZ + wallT / 2);
  scene.add(doorLintel);

  // A peaked, icing-trimmed roof -- visual only, no collider, same "no
  // ceiling" rule every other building here follows.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(halfW, halfD) * 1.5, 2.4, 4), icingMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(cx, wallH + 1.2, cz);
  scene.add(roof);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.3, 0.2, halfD * 2 + 0.3), icingMat);
  trim.position.set(cx, wallH + 0.1, cz);
  scene.add(trim);
  for (let i = 0; i < 4; i++) {
    const candy = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 7), i % 2 === 0 ? candyRedMat : candyWhiteMat);
    candy.position.set(minX + 0.6 + i * ((maxX - minX - 1.2) / 3), wallH - 1, maxZ - 0.1);
    scene.add(candy);
  }

  const floor = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 - wallT * 2, 0.15, halfD * 2 - wallT * 2), gingerMat);
  floor.position.set(cx, 0.08, cz);
  scene.add(floor);
  registerFlatZone(minX, maxX, minZ, maxZ);

  winterHouseBounds.push({ minX, maxX, minZ, maxZ });
}
// House #1's own params are named so the summon shrine below (which lives
// inside this specific house) can place itself relative to the same
// numbers rather than a second, easily-drifting set of hardcoded ones.
const SHRINE_HOUSE = { cx: WINTER_X - 18, cz: WINTER_Z - 10, halfW: 5, halfD: 4.5 };
buildGingerbreadHouse(SHRINE_HOUSE.cx, SHRINE_HOUSE.cz, SHRINE_HOUSE.halfW, SHRINE_HOUSE.halfD);
buildGingerbreadHouse(WINTER_X + 16, WINTER_Z - 6, 5.5, 5);
buildGingerbreadHouse(WINTER_X, WINTER_Z + 20, 6, 5);

// Displace the snow ground's own vertices now that every flatZone inside
// Winter Wonderland (the tunnel mouth, all three house interiors) is
// registered -- same ordering reason the forest's own ground mesh is
// built after its tunnels.
{
  const pos = snowGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + WINTER_X, wz = pos.getZ(i) + WINTER_Z;
    pos.setY(i, terrainHeight(wx, wz));
  }
  pos.needsUpdate = true;
  snowGeo.computeVertexNormals();
}

// The summon shrine -- a stone altar with a floating glowing orb, tucked
// against the back wall of house #1 (opposite its door, so you have to
// actually walk all the way in to find it). Standing close to it charges
// it up over time; the orb (and the light it casts) shifts from a neon
// white at zero charge to blood red at full charge, so the color alone
// tells you how close the summon is without any HUD. See tickShrine() /
// startGodEvent() / endGodEvent() further down, near the rest of the
// game-state logic, for what happens once it's full.
const shrineStoneMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.85 });
const shrineOrbMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.1,
});
let shrineOrb = null, shrineLight = null;
const shrineCenter = new THREE.Vector3(
  SHRINE_HOUSE.cx,
  terrainHeight(SHRINE_HOUSE.cx, SHRINE_HOUSE.cz + SHRINE_HOUSE.halfD - 1.4),
  SHRINE_HOUSE.cz + SHRINE_HOUSE.halfD - 1.4
);
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 8), shrineStoneMat);
  base.position.set(shrineCenter.x, shrineCenter.y + 0.45, shrineCenter.z);
  scene.add(base);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.15, 8), shrineStoneMat);
  cap.position.set(shrineCenter.x, shrineCenter.y + 0.97, shrineCenter.z);
  scene.add(cap);
  shrineOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), shrineOrbMat);
  shrineOrb.position.set(shrineCenter.x, shrineCenter.y + 1.35, shrineCenter.z);
  scene.add(shrineOrb);
  shrineLight = new THREE.PointLight(0xffffff, 1.2, 9, 2);
  shrineLight.position.copy(shrineOrb.position);
  scene.add(shrineLight);
  addCircleCollider(shrineCenter.x, shrineCenter.z, 0.6);
}

// Ice spikes -- jagged, translucent blue-white cones jutting straight up
// out of the snow, scattered the same way the candy canes are.
const iceSpikeMat = new THREE.MeshStandardMaterial({
  color: 0xbfe8f5, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82,
  emissive: 0x3a6a78, emissiveIntensity: 0.25,
});
function makeIceSpike(x, z) {
  const h = terrainHeight(x, z);
  const height = 1.4 + rand() * 2.2;
  const r = 0.25 + rand() * 0.25;
  const spike = new THREE.Mesh(new THREE.ConeGeometry(r, height, 5), iceSpikeMat);
  spike.position.set(x, h + height / 2, z);
  spike.rotation.y = rand() * Math.PI;
  scene.add(spike);
  // A couple of smaller shards leaning off the base of the big one --
  // reads as a jagged ice formation instead of one lone cone.
  for (let s = 0; s < 2; s++) {
    const shardH = height * (0.35 + rand() * 0.25);
    const shard = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, shardH, 5), iceSpikeMat);
    const a = rand() * Math.PI * 2;
    shard.position.set(x + Math.cos(a) * r * 1.1, h + shardH / 2, z + Math.sin(a) * r * 1.1);
    shard.rotation.z = (rand() - 0.5) * 0.6;
    shard.rotation.x = (rand() - 0.5) * 0.6;
    scene.add(shard);
  }
  addCircleCollider(x, z, r * 1.3);
}
let spikesPlaced = 0;
while (spikesPlaced < 22) {
  const x = WINTER_X + (rand() - 0.5) * WINTER_HALF * 1.7;
  const z = WINTER_Z + (rand() - 0.5) * WINTER_HALF * 1.7;
  let inHouse = false;
  for (const b of winterHouseBounds) {
    if (x >= b.minX - 1 && x <= b.maxX + 1 && z >= b.minZ - 1 && z <= b.maxZ + 1) { inHouse = true; break; }
  }
  if (inHouse) continue;
  makeIceSpike(x, z);
  spikesPlaced++;
}

// A helper every scatter loop below shares: pick a random spot in Winter
// Wonderland that isn't inside a gingerbread house (same check the ice
// spikes use) and isn't already too close to something else this same
// loop already placed, so props don't stack on top of each other.
function winterScatterSpot(placed, minSep) {
  // The brick path runs the same strip `path` (below) covers: centered
  // on WINTER_X, +-2.5 wide, the length of WINTER_HALF*1.2 starting at
  // WINTER_Z-WINTER_HALF*0.35. Nothing scattered should land on it --
  // snowmen/trees/presents block it, and it's supposed to read as the
  // one guided route through the fog.
  const pathMinZ = WINTER_Z - WINTER_HALF * 0.35 - WINTER_HALF * 0.6;
  const pathMaxZ = WINTER_Z - WINTER_HALF * 0.35 + WINTER_HALF * 0.6;
  for (let tries = 0; tries < 20; tries++) {
    const x = WINTER_X + (rand() - 0.5) * WINTER_HALF * 1.7;
    const z = WINTER_Z + (rand() - 0.5) * WINTER_HALF * 1.7;
    let bad = false;
    for (const b of winterHouseBounds) {
      if (x >= b.minX - 1.5 && x <= b.maxX + 1.5 && z >= b.minZ - 1.5 && z <= b.maxZ + 1.5) { bad = true; break; }
    }
    if (!bad && Math.abs(x - WINTER_X) < 2.5 && z >= pathMinZ && z <= pathMaxZ) bad = true;
    if (!bad) for (const p of placed) {
      if ((x - p[0]) ** 2 + (z - p[1]) ** 2 < minSep * minSep) { bad = true; break; }
    }
    if (!bad) return [x, z];
  }
  return null;
}

// Snowmen -- three stacked, shrinking white spheres, coal eyes/buttons,
// a carrot nose, and stick arms. Pure decoration (no collider -- same
// "small scenery doesn't block you" rule the candy canes break on
// purpose for their pole, but a snowman's rounded body doesn't need to).
const coalMat = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 0.8 });
const carrotMat = new THREE.MeshStandardMaterial({ color: 0xd8701f, roughness: 0.7 });
const stickMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
function makeSnowman(x, z) {
  const h = terrainHeight(x, z);
  const sizes = [0.55, 0.4, 0.28];
  let y = h;
  const centers = [];
  for (const r of sizes) {
    y += r;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), snowMat);
    ball.position.set(x, y, z);
    scene.add(ball);
    centers.push(y);
    y += r * 0.85;
  }
  const headY = centers[2];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), coalMat);
    eye.position.set(x + side * 0.1, headY + 0.05, z + sizes[2] * 0.9);
    scene.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 6), carrotMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(x, headY, z + sizes[2] + 0.1);
  scene.add(nose);
  for (let i = 0; i < 3; i++) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), coalMat);
    button.position.set(x, centers[1] + 0.15 - i * 0.18, z + sizes[1] * 0.92);
    scene.add(button);
  }
  for (const side of [-1, 1]) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 5), stickMat);
    stick.position.set(x + side * (sizes[1] + 0.2), centers[1] + 0.1, z);
    stick.rotation.z = side * 0.9;
    scene.add(stick);
  }
  addCircleCollider(x, z, sizes[0] * 0.9);
}
{
  const placed = [];
  for (let i = 0; i < 6; i++) {
    const spot = winterScatterSpot(placed, 8);
    if (!spot) break;
    makeSnowman(spot[0], spot[1]);
    placed.push(spot);
  }
}

// Wrapped presents -- simple ribboned boxes, stacked in small clusters
// near the houses, the way gifts pile up under a tree.
const presentMats = [candyRedMat, elfGreenMat, candyWhiteMat];
function makePresent(x, z, size, colorMat) {
  const h = terrainHeight(x, z);
  const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), colorMat);
  box.position.set(x, h + size / 2, z);
  box.rotation.y = rand() * Math.PI;
  scene.add(box);
  const ribbonMat = colorMat === candyWhiteMat ? candyRedMat : candyWhiteMat;
  const ribbonA = new THREE.Mesh(new THREE.BoxGeometry(size * 1.02, size * 0.16, size * 1.02), ribbonMat);
  ribbonA.position.copy(box.position);
  ribbonA.rotation.y = box.rotation.y;
  scene.add(ribbonA);
  const ribbonB = new THREE.Mesh(new THREE.BoxGeometry(size * 0.16, size * 1.02, size * 0.16), ribbonMat);
  ribbonB.position.set(x, h + size / 2, z);
  scene.add(ribbonB);
  return size;
}
{
  const placed = [];
  for (let i = 0; i < 5; i++) {
    const spot = winterScatterSpot(placed, 5);
    if (!spot) break;
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const size = 0.35 + rand() * 0.35;
      makePresent(spot[0] + (rand() - 0.5) * 0.8, spot[1] + (rand() - 0.5) * 0.8, size, presentMats[Math.floor(rand() * presentMats.length)]);
    }
    addCircleCollider(spot[0], spot[1], 0.6);
    placed.push(spot);
  }
}

// Snow-dusted pine trees -- three stacked cone tiers over a trunk, a
// visually distinct silhouette from both the forest's bare giant trees
// and Jungle's canopy, so Winter Wonderland doesn't read as a reskin.
const pineMat = new THREE.MeshStandardMaterial({ color: 0x1f4a33, roughness: 0.85, map: makeGrainTexture({ dark: 20, light: 235, repeat: 10, blotch: 3 }) });
const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
function makePineTree(x, z) {
  const h = terrainHeight(x, z);
  const trunkH = 1.0;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, trunkH, 6), pineTrunkMat);
  trunk.position.set(x, h + trunkH / 2, z);
  scene.add(trunk);
  const tierCount = 3;
  let y = h + trunkH;
  let r = 1.5;
  for (let t = 0; t < tierCount; t++) {
    const tierH = 1.6 - t * 0.3;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, tierH, 8), pineMat);
    cone.position.set(x, y + tierH / 2, z);
    scene.add(cone);
    y += tierH * 0.65;
    r *= 0.72;
  }
  addCircleCollider(x, z, 0.5);
}
{
  const placed = [];
  for (let i = 0; i < 16; i++) {
    const spot = winterScatterSpot(placed, 6);
    if (!spot) break;
    makePineTree(spot[0], spot[1]);
    placed.push(spot);
  }
}

// Lamp posts along the brick path -- the only *lit* props out here
// besides the junction lights back in the tunnel, so the path itself
// reads as the safe, deliberately-guided route through the fog.
const lampPostMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.6, metalness: 0.3 });
const lampGlassMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffd480, emissiveIntensity: 1.4, roughness: 0.4, transparent: true, opacity: 0.9 });
function makeLampPost(x, z) {
  const h = terrainHeight(x, z);
  const poleH = 2.6;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, poleH, 6), lampPostMat);
  pole.position.set(x, h + poleH / 2, z);
  scene.add(pole);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 7), lampGlassMat);
  lamp.position.set(x, h + poleH + 0.1, z);
  scene.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.25, 6), lampPostMat);
  cap.position.set(x, h + poleH + 0.3, z);
  scene.add(cap);
  const light = new THREE.PointLight(0xffd480, 1.2, 14, 2);
  light.position.set(x, h + poleH + 0.1, z);
  scene.add(light);
  addCircleCollider(x, z, 0.12);
}
{
  // Along the same straight path strip the brick road already follows
  // (see the `path` plane above: centered on WINTER_X, running the
  // length of WINTER_HALF*1.2 from just past the entrance).
  const pathZ0 = WINTER_Z - WINTER_HALF * 0.35 - WINTER_HALF * 0.55;
  const pathZ1 = WINTER_Z - WINTER_HALF * 0.35 + WINTER_HALF * 0.55;
  const postCount = 6;
  for (let i = 0; i <= postCount; i++) {
    const t = i / postCount;
    const z = THREE.MathUtils.lerp(pathZ0, pathZ1, t);
    const side = i % 2 === 0 ? -1 : 1;
    makeLampPost(WINTER_X + side * 2.6, z);
  }
}

// A frozen pond -- a flat, dark, semi-reflective disc with a few pale
// crack lines etched across the top, tucked off to one side away from
// the houses and the main path.
const iceMat = new THREE.MeshStandardMaterial({ color: 0x4a7a8a, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 });
const iceCrackMat = new THREE.MeshStandardMaterial({ color: 0xd8f0f5, roughness: 0.3, transparent: true, opacity: 0.6 });
{
  const px = WINTER_X - 45, pz = WINTER_Z + 35;
  const ph = terrainHeight(px, pz);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 24), iceMat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(px, ph + 0.05, pz);
  scene.add(pond);
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const len = 3 + rand() * 4;
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.06, len), iceCrackMat);
    crack.rotation.x = -Math.PI / 2;
    crack.rotation.z = a;
    crack.position.set(px + Math.cos(a) * len * 0.3, ph + 0.07, pz + Math.sin(a) * len * 0.3);
    scene.add(crack);
  }
}

function winterPoint() {
  const x = WINTER_X + (rand() - 0.5) * WINTER_HALF * 1.6;
  const z = WINTER_Z + (rand() - 0.5) * WINTER_HALF * 1.6;
  return new THREE.Vector3(x, 0, z);
}
function clampToWinter(pos) {
  pos.x = THREE.MathUtils.clamp(pos.x, wMinX, wMaxX);
  pos.z = THREE.MathUtils.clamp(pos.z, wMinZ, wMaxZ);
}
// Krampus can never enter a gingerbread house -- same push-to-nearest-edge
// trick Stalker's own temple exclusion uses.
function clampKrampusFromHouses(pos) {
  for (const b of winterHouseBounds) {
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
function clampKrampusZone(pos) {
  clampToWinter(pos);
  clampKrampusFromHouses(pos);
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

// A well-timed jump clears a monster's back if it's short enough -- same
// mechanic Supersonic's own SUPERSONIC_HOP_CLEARANCE already proved out,
// generalized so it applies to anything short rather than just the one
// monster it was hand-tuned for. Measured once per monster (its own
// height never changes after that) and capped: past HOP_MAX_HEIGHT it's
// just not something a jump should ever clear, so no hopY at all.
const HOP_MAX_HEIGHT = 3.2;
function hopYFor(m) {
  if (m.modelHeight === undefined) {
    const box = new THREE.Box3().setFromObject(m.group);
    m.modelHeight = box.max.y - box.min.y;
  }
  if (m.modelHeight > HOP_MAX_HEIGHT) return undefined;
  return m.group.position.y + m.modelHeight;
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
  // On top of it, a sudden, unnatural head-snap on its own irregular
  // cycle (offset per-instance via the group's own id, so a pack never
  // twitches in lockstep) -- unsettling even when nothing else about the
  // animation is moving, which is the point.
  const head = m.group.userData.head;
  if (head) {
    head.rotation.y = Math.sin(phase * 2) * 0.08;
    const twitchCycle = 2.6;
    const twitchT = ((t * 0.5 + m.group.id * 0.271) % twitchCycle + twitchCycle) % twitchCycle;
    if (twitchT < 0.08) {
      const snap = Math.sin((twitchT / 0.08) * Math.PI);
      head.rotation.y += snap * 0.35;
      head.rotation.x = Math.sin((twitchT / 0.08) * Math.PI * 3) * 0.1;
    } else {
      head.rotation.x = 0;
    }
  }
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
  return { dist, danger: m.alert ? Math.max(0, 1 - dist / 12) : 0, catchR: m.catchR, type: 'hotcheeto', instance: m, hopY: hopYFor(m) };
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
  return { dist, danger: m.alert ? Math.max(0, 1 - dist / 9) : 0, catchR: m.catchR, type: 'peanut', instance: m, hopY: hopYFor(m) };
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
  return { dist, danger: m.alert ? Math.max(0, 1 - dist / danger) : 0, catchR: m.catchR, type, instance: m, hopY: hopYFor(m) };
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
const STALKER_SPEED = RUN_SPEED * 0.75, STALKER_TURN_RATE = 2.2; // 50% slower, on request
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

function tickStalker(dt, p) {
  const r = tickGenericMonster(stalker, dt, p, STALKER_SPEED, STALKER_TURN_RATE, 'stalker', 45, 0.8, 10, 11, clampStalkerZone);
  updateStalkerMusic(r.dist);
  return r;
}
function tickWanderer(m, dt, p) { return tickGenericMonster(m, dt, p, WANDERER_SPEED, WANDERER_TURN_RATE, 'wanderer', 16, 0.85, 6, 8, clampToJungle); }

/* ---------------- Winter Wonderland cast: Gingy, Crangler, 3 Elves, Krampus ---------------- */

function makeWinterMonster(make, catchR) {
  const spot = winterPoint();
  const m = { group: make(), route: [spot], idx: 0, alert: false, alertTimer: 0, catchR, heading: 0 };
  scene.add(m.group);
  m.group.position.copy(spot);
  m.group.position.y = groundHeight(spot.x, spot.z) + (m.group.userData.hoverHeight || 0);
  return m;
}

const GINGY_SPEED = RUN_SPEED * 0.7, GINGY_TURN_RATE = 2.8;
const gingy = makeWinterMonster(createGingyModel, 1.0);

// Whole body + arms stretched 5x, so it can spot you from much farther
// off than most things out there -- same "seenRange matters more than
// speed" idea as Stalker's own design.
const CRANGLER_SPEED = RUN_SPEED * 1.1, CRANGLER_TURN_RATE = 2.0;
const crangler = makeWinterMonster(createCranglerModel, 1.6);

const ELF_SPEED = RUN_SPEED * 0.5, ELF_TURN_RATE = 3.2;
const elves = [
  makeWinterMonster(createElfModelRed, 1.0),
  makeWinterMonster(createElfModelGreen, 1.0),
  makeWinterMonster(createElfModelRed, 1.0),
];

const KRAMPUS_SPEED = RUN_SPEED * 1.5, KRAMPUS_TURN_RATE = 2.0;
const krampus = makeWinterMonster(createKrampusModel, 2.6); // 6x the model, so a bigger forgiving hitbox to match
clampKrampusFromHouses(krampus.group.position);
krampus.group.position.y = groundHeight(krampus.group.position.x, krampus.group.position.z) + (krampus.group.userData.hoverHeight || 0);

function tickGingy(dt, p) { return tickGenericMonster(gingy, dt, p, GINGY_SPEED, GINGY_TURN_RATE, 'gingy', 16, 0.85, 6, 8, clampToWinter); }
function tickCrangler(dt, p) { return tickGenericMonster(crangler, dt, p, CRANGLER_SPEED, CRANGLER_TURN_RATE, 'crangler', 42, 0.82, 9, 10, clampToWinter); }
function tickElf(m, dt, p) { return tickGenericMonster(m, dt, p, ELF_SPEED, ELF_TURN_RATE, 'elf', 15, 0.86, 5, 7, clampToWinter); }
function tickKrampus(dt, p) { return tickGenericMonster(krampus, dt, p, KRAMPUS_SPEED, KRAMPUS_TURN_RATE, 'krampus', 22, 0.86, 7, 11, clampKrampusZone); }

/* ---------------- summon: the shrine + the god it calls down ---------------- */
/* The only god for now (see createSantaGodModel() above). Standing near
 * the shrine (built back in the Winter Wonderland section, inside house
 * #1) charges it from 0 to 1 over GOD_CHARGE_TIME seconds; leaving lets it
 * bleed back down over GOD_CHARGE_DECAY_TIME instead of holding wherever
 * you left it, so this is a "stay and commit" action, not a one-touch
 * switch. At full charge the event starts on its own -- no prompt, no
 * button, the shrine going solid red *is* the warning. */
let godCharge = 0;
let godEventActive = false;
const GOD_CHARGE_RADIUS = 2.3;
const GOD_CHARGE_TIME = 15;
const GOD_CHARGE_DECAY_TIME = 6;
const godChargeColor = new THREE.Color();

function tickShrine(dt, playerPos) {
  if (godEventActive) return;
  const d = playerPos.distanceTo(shrineCenter);
  if (d < GOD_CHARGE_RADIUS) godCharge = Math.min(1, godCharge + dt / GOD_CHARGE_TIME);
  else godCharge = Math.max(0, godCharge - dt / GOD_CHARGE_DECAY_TIME);

  godChargeColor.setHex(0xffffff).lerp(new THREE.Color(0xff1010), godCharge);
  shrineOrbMat.color.copy(godChargeColor);
  shrineOrbMat.emissive.copy(godChargeColor);
  shrineLight.color.copy(godChargeColor);
  shrineLight.intensity = 1.2 + godCharge * 2.2;
  shrineOrb.rotation.y += dt * (0.4 + godCharge * 2.2);
  shrineOrb.position.y = shrineCenter.y + 1.35 + Math.sin(performance.now() * 0.002) * 0.04;

  if (godCharge >= 1) startGodEvent();
}

let santaGod = null;
function ensureSantaGod() {
  if (!santaGod) {
    const group = createSantaGodModel();
    group.visible = false;
    scene.add(group);
    santaGod = { group, catchR: 3.2 };
  }
  return santaGod;
}

const SANTA_SPEED = RUN_SPEED * 1.2; // exact figure requested: 1.2x the player
const SANTA_FLY_HIGH = 6.5, SANTA_FLY_LOW = 2.2, SANTA_SWOOP_RANGE = 16;

function startGodEvent() {
  godEventActive = true;
  const s = ensureSantaGod();
  s.group.visible = true;
  // Flies in from behind wherever the player's actually facing right now,
  // in whatever map that happens to be -- this isn't zone-locked like
  // every other monster, on purpose.
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const spawnPos = camera.position.clone().addScaledVector(forward, -24);
  spawnPos.y = camera.position.y + SANTA_FLY_HIGH;
  s.group.position.copy(spawnPos);
  startGodMusic();
}

function endGodEvent() {
  godEventActive = false;
  godCharge = 0;
  if (santaGod) santaGod.group.visible = false;
  stopGodMusic();
}

function tickSantaGod(dt, playerPos) {
  const s = ensureSantaGod();
  if (!godEventActive) return { dist: Infinity, danger: 0, catchR: 0, type: 'santagod', instance: s };

  const toPlayer = new THREE.Vector3(playerPos.x - s.group.position.x, 0, playerPos.z - s.group.position.z);
  const horizDist = toPlayer.length();
  if (horizDist > 0.01) {
    toPlayer.normalize();
    s.group.position.x += toPlayer.x * SANTA_SPEED * dt;
    s.group.position.z += toPlayer.z * SANTA_SPEED * dt;
    s.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
  }
  // Swoops down out of the sky as it closes in, instead of catching you
  // from high overhead where a "giant flying thing got me" moment would
  // otherwise read as oddly disconnected.
  const flyT = Math.min(horizDist / SANTA_SWOOP_RANGE, 1);
  const flyHeight = THREE.MathUtils.lerp(SANTA_FLY_LOW, SANTA_FLY_HIGH, flyT);
  s.group.position.y = playerPos.y + flyHeight + Math.sin(performance.now() * 0.0015) * 0.35;

  return { dist: horizDist, danger: Math.max(0, 1 - horizDist / 20), catchR: s.catchR, type: 'santagod', instance: s };
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

// Stalker's own warning, same idea as Supersonic's arpeggio but a
// sustained eerie drone instead of a rhythmic one -- two sine waves a
// close interval apart (106Hz against 100Hz) beat against each other
// slowly and unsettlingly on their own, with no need for a melody.
const STALKER_MUSIC_RANGE = 50;
let stalkerMusicGain = null;
function updateStalkerMusic(dist) {
  const ctx = audioCtx;
  if (!ctx) return;
  if (!stalkerMusicGain) {
    stalkerMusicGain = ctx.createGain();
    stalkerMusicGain.gain.value = 0;
    stalkerMusicGain.connect(ctx.destination);
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 100;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 106;
    osc1.connect(stalkerMusicGain);
    osc2.connect(stalkerMusicGain);
    osc1.start();
    osc2.start();
  }
  const target = Math.max(0, 1 - dist / STALKER_MUSIC_RANGE) * 0.2;
  stalkerMusicGain.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
}

// The god event's own soundtrack: the opening Jingle Bells phrase
// (E E E, E E E, E G C D E...), but run through a hard tanh waveshaper
// for distortion and given a random per-note detune + timing jitter so
// it sounds warped and wrong rather than festive -- the audio equivalent
// of the sky turning red. Ticked every frame like Supersonic's own
// arpeggio (updateSupersonicMusic above), not scheduled in advance, so it
// can start/stop cleanly with the event itself.
const jingleBellsNotes = [659.25, 659.25, 659.25, 659.25, 659.25, 659.25, 659.25, 783.99, 523.25, 587.33, 659.25];
let jingleIdx = 0, jingleTimer = 0, godMusicGain = null, godDistortion = null;

function makeDistortionCurve(amount) {
  const n = 256, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * amount); }
  return curve;
}

function startGodMusic() {
  const ctx = ensureAudio();
  if (!ctx) return;
  jingleIdx = 0; jingleTimer = 0;
  if (!godMusicGain) {
    godMusicGain = ctx.createGain();
    godMusicGain.gain.value = 0.32;
    godDistortion = ctx.createWaveShaper();
    godDistortion.curve = makeDistortionCurve(20);
    godDistortion.oversample = '2x';
    godMusicGain.connect(godDistortion).connect(ctx.destination);
  } else {
    godMusicGain.gain.setTargetAtTime(0.32, ctx.currentTime, 0.1);
  }
}

function stopGodMusic() {
  if (godMusicGain && audioCtx) godMusicGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.3);
}

function tickGodMusic(dt) {
  const ctx = audioCtx;
  if (!ctx || !godMusicGain) return;
  jingleTimer -= dt;
  if (jingleTimer > 0) return;
  jingleTimer = 0.26 + (Math.random() - 0.5) * 0.1; // uneven tempo -- wrong, not just off-key
  const baseFreq = jingleBellsNotes[jingleIdx % jingleBellsNotes.length];
  jingleIdx++;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = baseFreq;
  osc.detune.value = (Math.random() - 0.5) * 70;
  const g = ctx.createGain();
  g.gain.value = 0;
  osc.connect(g).connect(godMusicGain);
  const now = ctx.currentTime;
  g.gain.linearRampToValueAtTime(0.8, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  osc.start(now); osc.stop(now + 0.25);
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
  } else if (type === 'gingy') {
    // A dry, crumbling snap -- cookie breaking, not flesh.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.value = 0.6;
    noise.connect(ng).connect(master);
    noise.start(now);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.2);
  } else if (type === 'crangler') {
    // A high, warped carousel-music shriek -- cheerful pitch, wrong register.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(2200, now + 0.25);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.6, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.75);
  } else if (type === 'elf') {
    // A quick, high-pitched jingle-bell-adjacent chime, then a thud.
    for (const freq of [1500, 1900, 1300]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      osc.connect(g).connect(master);
      osc.start(now); osc.stop(now + 0.25);
    }
  } else if (type === 'krampus') {
    // A huge, guttural roar -- low and long, the biggest sound in the game.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.9, now + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 1.0);

    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.9, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.value = 0.4;
    noise.connect(ng).connect(master);
    noise.start(now);
  } else if (type === 'santagod') {
    // A huge descending boom -- the biggest, lowest sound in the game,
    // bigger than even Krampus's roar -- followed by a burst of harsh,
    // clashing, detuned sleigh bells instead of a clean jingle.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.95, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 1.3);

    for (let i = 0; i < 7; i++) {
      const bell = ctx.createOscillator();
      bell.type = 'triangle';
      bell.frequency.value = 1700 + Math.random() * 1000;
      bell.detune.value = (Math.random() - 0.5) * 250;
      const bg = ctx.createGain();
      const t0 = now + i * 0.08;
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(0.45, t0 + 0.01);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      bell.connect(bg).connect(master);
      bell.start(t0); bell.stop(t0 + 0.33);
    }
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

  const footY = pos.y - EYE_H;
  const nx = pos.x + moveDir.x * speed * dt;
  if (!collidesAt(nx, pos.z, footY)) pos.x = nx;
  const nz = pos.z + moveDir.z * speed * dt;
  if (!collidesAt(pos.x, nz, footY)) pos.z = nz;

  if (touchJumpPressed) {
    touchJumpPressed = false;
    if (onGround) { velocity.y = JUMP_V; onGround = false; }
  }

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
const interactHint = document.getElementById('interact-hint');

function resetAfterCatch() {
  // Any catch ends the god event (not just Santa's own) -- everything
  // else resets to baseline here too, so a world still stuck red with no
  // way back would be the odd one out.
  if (godEventActive) endGodEvent();
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
  gingy.group.position.copy(gingy.route[0]);
  gingy.alert = false; gingy.alertTimer = 0; gingy.roamTimer = 0;
  crangler.group.position.copy(crangler.route[0]);
  crangler.alert = false; crangler.alertTimer = 0; crangler.roamTimer = 0;
  for (const m of elves) {
    m.group.position.copy(m.route[0]);
    m.alert = false; m.alertTimer = 0; m.roamTimer = 0;
  }
  krampus.group.position.copy(krampus.route[0]);
  clampKrampusFromHouses(krampus.group.position);
  krampus.alert = false; krampus.alertTimer = 0; krampus.roamTimer = 0;
}

const monstersByType = { supersonic, hotcheeto: hotCheeto, peanut };
const SCARE_DURATION = {
  supersonic: 0.8, hotcheeto: 0.9, peanut: 0.6,
  lizard: 0.7, gunslinger: 0.65, outlaw: 0.6,
  stalker: 0.75, wanderer: 0.55,
  gingy: 0.6, crangler: 0.8, elf: 0.55, krampus: 0.9,
  santagod: 1.1,
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

    // The god event overrides sky/fog in every map at once -- deliberately
    // checked before the normal per-zone lookup, not blended with it, so
    // Winter Wonderland's own pale sky can't fight the red.
    const skyTarget = godEventActive ? SKY_GOD_EVENT : skyTargetFor(camera.position.x, camera.position.z);
    const targetFogDensity = godEventActive ? FOG_DENSITY_GOD_EVENT : fogDensityFor(camera.position.x, camera.position.z);
    const skyT = Math.min(dt * 1.2, 1);
    scene.background.lerp(skyTarget, skyT);
    scene.fog.color.lerp(skyTarget, skyT);
    scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, targetFogDensity, skyT);

    tickShrine(dt, camera.position);
    if (godEventActive) tickGodMusic(dt);

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
      tickGingy(dt, camera.position), tickCrangler(dt, camera.position),
      ...elves.map((m) => tickElf(m, dt, camera.position)),
      tickKrampus(dt, camera.position),
      tickSantaGod(dt, camera.position),
    ];
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
