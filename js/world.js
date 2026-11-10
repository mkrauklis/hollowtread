// Classic script, not an ES module -- THREE is a global from the plain
// <script src="three.min.js"> tag in world.html. Modules are blocked from
// loading over file:// entirely (no way around it, browser security), so
// this is deliberately NOT `import * as THREE from 'three'` -- that one
// choice is what makes double-clicking world.html actually work.

/* ----------------------------------------------------------------------
 * The Sub-liminal — a full rebuild of what used to be Hollowtread's forest
 * map. Everything zone-specific from that version (forest/Badland/Jungle/
 * Winter Wonderland, their own monsters, the summon shrine) is gone on
 * request ("get rid of all the maps"); this is one connected space, the
 * Backrooms -- a grid of mustard-yellow rooms linked by doorways and, in
 * some walls, low crawlspaces you have to crouch through -- not a hub with
 * separate themed sections. The things that carry over unchanged are the
 * low-level engine pieces that were never content-specific to begin with:
 * the boot wrapper, the seeded RNG, pointer-lock movement, the grain-
 * texture generator, and the jumpscare camera pipeline.
 * ------------------------------------------------------------------- */

function boot() {

const EYE_H = 1.55;
const CROUCH_EYE_H = 0.85;
const PLAYER_R = 0.4;
const GRAVITY = -22;
const JUMP_V = 9.6;
const WALK_SPEED = 8.4;
const RUN_SPEED = 12.8;
const CROUCH_SPEED_MUL = 0.55;
const DEATH_Y = -14; // fall past this (a pit, see the pit room) and you're sent back

/* ---------------- deterministic layout (no Math.random, so the maze/props are stable) ---------------- */

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
const SKY_COLOR = new THREE.Color(0x1c1708); // near-black with a dirty yellow cast, not a clean night-sky black
scene.background = SKY_COLOR;
scene.fog = new THREE.FogExp2(0x2a2410, 0.04); // still tight and dingy, just eased off a little now the lights themselves are brighter -- the two together were making rooms read as darker than intended

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 150);

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

scene.add(new THREE.AmbientLight(0x4a4126, 1.0)); // still warm and a little sickly, just brighter -- "dim" shouldn't mean "can't see", on request
const flashlight = new THREE.SpotLight(0xfff1cf, 9.5, 30, Math.PI / 4.6, 0.55, 1.3);
camera.add(flashlight);
flashlight.target.position.set(0, 0, -1);
camera.add(flashlight.target);
scene.add(camera);

// Hazmat suit sleeves (armMat -- the color the Appearance tab's hue
// slider actually changes) ending in thick rubber gloves (gloveMat, a
// fixed rubber-yellow that doesn't follow the hue slider -- the gloves
// read as PPE, not skin, so recoloring the suit shouldn't recolor them
// too).
const armGroup = new THREE.Group();
const armMat = new THREE.MeshStandardMaterial({ color: 0xcfd0b8, roughness: 0.85 });
const gloveMat = new THREE.MeshStandardMaterial({ color: 0xe0c62a, roughness: 0.55 });
function makeArm(side) {
  const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.4, 4, 8), armMat);
  sleeve.position.set(side * 0.26, -0.42, -0.5);
  sleeve.rotation.z = side * 0.35;

  // Cuff, palm, and three fused finger lobes -- all children of the
  // sleeve, so they inherit its position/rotation.z automatically and
  // sit at the sleeve's own "down" end without needing separate world-
  // space trig to place them.
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 5, 10), gloveMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.19, 0);
  sleeve.add(cuff);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 7), gloveMat);
  palm.scale.set(1, 1.1, 0.75);
  palm.position.set(0, -0.27, 0);
  sleeve.add(palm);
  for (let i = -1; i <= 1; i++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.1, 3, 5), gloveMat);
    finger.position.set(i * 0.055, -0.37, 0.02);
    sleeve.add(finger);
  }
  return sleeve;
}
armGroup.add(makeArm(-1), makeArm(1));
camera.add(armGroup);

/* ---------------- materials ---------------- */
/* Flat low-poly surfaces with a blotchy, hand-painted grain texture on
 * them -- generated on a canvas at load, not a fetched image file. */

function makeGrainTexture({ size = 96, dark = 150, light = 255, repeat = 6, blotch = 3, tint = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cells = Math.max(2, Math.floor(size / blotch));
  const small = document.createElement('canvas');
  small.width = small.height = cells;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(cells, cells);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = dark + Math.random() * (light - dark);
    if (tint) {
      img.data[i] = v * tint[0]; img.data[i + 1] = v * tint[1]; img.data[i + 2] = v * tint[2];
    } else {
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
    }
    img.data[i + 3] = 255;
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

// Wallpaper: a "monochromatic, dingy yellow/mustard" texture, explicitly --
// low contrast (dark/light close together) with a thin repeating stripe
// drawn over the grain so it actually reads as wallpaper, not a flat wall.
function makeWallpaperTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9c7f33';
  ctx.fillRect(0, 0, size, size);
  const noise = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < noise.data.length; i += 4) {
    const v = (Math.random() - 0.5) * 18;
    noise.data[i] = Math.max(0, Math.min(255, noise.data[i] + v));
    noise.data[i + 1] = Math.max(0, Math.min(255, noise.data[i + 1] + v * 0.9));
    noise.data[i + 2] = Math.max(0, Math.min(255, noise.data[i + 2] + v * 0.5));
  }
  ctx.putImageData(noise, 0, 0);
  ctx.strokeStyle = 'rgba(70,55,15,0.35)';
  ctx.lineWidth = 2;
  for (let x = 0; x < size; x += 16) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(3, 1.6);
  return tex;
}

const wallMat = new THREE.MeshStandardMaterial({ color: 0xcdb15c, roughness: 0.95, map: makeWallpaperTexture() });
const carpetMat = new THREE.MeshStandardMaterial({ color: 0x8a742f, roughness: 1, map: makeGrainTexture({ size: 128, dark: 70, light: 170, repeat: 20, blotch: 3, tint: [0.75, 0.62, 0.22] }) }); // "damp" -- darker and blotchier than the wallpaper, not a clean carpet
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x6b5c2a, roughness: 1 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x4a3f1c, roughness: 0.9 });

/* ---------------- the maze: a grid of rooms, doorways, and crawlspaces ---------------- */
/* GRID_N up and CELL down from the first pass (7x16 -> 9x12, about the
 * same total footprint) plus a narrower DOOR_HALF and far fewer extra
 * loop connections (see openEdges below) -- the first version read more
 * like a grid of open rooms than an actual maze: wide doorways and lots
 * of loops made it hard to ever feel lost or boxed into a corridor. More,
 * smaller cells means more turns per unit of distance crossed; narrower
 * doorways and a tree-like (mostly loop-free) layout means a wrong turn
 * actually costs you a real backtrack instead of just cutting through
 * the next room over. */

const GRID_N = 9;
const CELL = 12;
const WALL_T = 0.4;
const WALL_H = 3.4;
const DOOR_HALF = 1.1;
const CRAWL_H = 1.15; // visual header height over a crawlspace -- the actual collision rule is just "crouching or not", this just makes that legible
// Declared this early (rather than down by buildCellShell, where it's
// mainly used) specifically so the crawl-tunnel-cell selection below --
// which needs to exclude it -- can reference it without a temporal-dead-
// zone error; everything else about the pit room still lives further down.
const PIT_CELL = { cx: Math.floor(GRID_N / 2), cz: Math.floor(GRID_N / 2) };
// Where the maze opens out into the Pool Rooms area (built as its own
// section after the pit room below) -- a doorway carved straight through
// the east boundary wall at this row instead of an interior doorway,
// since nothing inside the maze itself needs to change to accommodate it.
const POOL_DOOR_CZ = 4;
const POOL_Y = -4.5; // the Pool Rooms floor sits one real level down, reached by the staircase in that same section

function boundaryX(ex) { return (ex - GRID_N / 2) * CELL; }
function boundaryZ(ez) { return (ez - GRID_N / 2) * CELL; }
function cellCenter(cx, cz) { return { x: (boundaryX(cx) + boundaryX(cx + 1)) / 2, z: (boundaryZ(cz) + boundaryZ(cz + 1)) / 2 }; }
function edgeKeyX(cx, cz) { return 'x,' + cx + ',' + cz; } // edge between (cx,cz) and (cx+1,cz)
function edgeKeyZ(cx, cz) { return 'z,' + cx + ',' + cz; } // edge between (cx,cz) and (cx,cz+1)

// A randomized-DFS spanning tree first (guarantees every room reachable
// from every other, with zero loops -- the actual "maze" part), then a
// SMALL number of extra connections knocked through on top so it isn't
// completely loop-free (real backrooms exploration still doubles back on
// itself sometimes), without opening up so many shortcuts that the tree
// structure stops mattering. Kept deliberately low (was 14%) so getting
// turned around is the normal experience, not the exception.
const openEdges = new Set();
{
  const visited = Array.from({ length: GRID_N }, () => new Array(GRID_N).fill(false));
  const stack = [[0, 0]];
  visited[0][0] = true;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const options = [];
    if (cx + 1 < GRID_N && !visited[cz][cx + 1]) options.push({ nx: cx + 1, nz: cz, key: edgeKeyX(cx, cz) });
    if (cx - 1 >= 0 && !visited[cz][cx - 1]) options.push({ nx: cx - 1, nz: cz, key: edgeKeyX(cx - 1, cz) });
    if (cz + 1 < GRID_N && !visited[cz + 1][cx]) options.push({ nx: cx, nz: cz + 1, key: edgeKeyZ(cx, cz) });
    if (cz - 1 >= 0 && !visited[cz - 1][cx]) options.push({ nx: cx, nz: cz - 1, key: edgeKeyZ(cx, cz - 1) });
    if (!options.length) { stack.pop(); continue; }
    const pick = options[Math.floor(rand() * options.length)];
    openEdges.add(pick.key);
    visited[pick.nz][pick.nx] = true;
    stack.push([pick.nx, pick.nz]);
  }
  for (let cx = 0; cx < GRID_N; cx++) for (let cz = 0; cz < GRID_N; cz++) {
    if (cx + 1 < GRID_N) { const k = edgeKeyX(cx, cz); if (!openEdges.has(k) && rand() < 0.05) openEdges.add(k); }
    if (cz + 1 < GRID_N) { const k = edgeKeyZ(cx, cz); if (!openEdges.has(k) && rand() < 0.05) openEdges.add(k); }
  }
}
// Of the edges the maze itself left closed, some become crawlspaces
// instead of solid wall -- a second, lower route only reachable by
// crouching, which is also exactly what keeps both monsters out of them
// (their own pathing, see monsterNeighbors() below, only ever uses
// openEdges, never crawlEdges).
const crawlEdges = new Set();
for (let cx = 0; cx < GRID_N; cx++) for (let cz = 0; cz < GRID_N; cz++) {
  if (cx + 1 < GRID_N) { const k = edgeKeyX(cx, cz); if (!openEdges.has(k) && rand() < 0.3) crawlEdges.add(k); }
  if (cz + 1 < GRID_N) { const k = edgeKeyZ(cx, cz); if (!openEdges.has(k) && rand() < 0.3) crawlEdges.add(k); }
}

// Crawlspaces are real dead-end tunnel pockets now, on request -- "dark
// small long paths, some with turns" -- not just a low section in an
// otherwise-normal shared wall. A handful of cells that were only ever a
// single-doorway dead end in the spanning tree anyway (degree 1 -- not a
// through-route for anything else, so converting them can't disconnect
// any other room) get their one doorway downgraded to a crawl entrance,
// and the room itself replaced by a narrow, low, unlit winding corridor
// (see buildCrawlTunnelCell, built once the normal wall loops below have
// run) instead of a normal 12-unit room.
function cellOpenDegree(cx, cz) {
  let d = 0;
  if (cx + 1 < GRID_N && openEdges.has(edgeKeyX(cx, cz))) d++;
  if (cx - 1 >= 0 && openEdges.has(edgeKeyX(cx - 1, cz))) d++;
  if (cz + 1 < GRID_N && openEdges.has(edgeKeyZ(cx, cz))) d++;
  if (cz - 1 >= 0 && openEdges.has(edgeKeyZ(cx, cz - 1))) d++;
  return d;
}
const crawlTunnelCells = []; // { cx, cz, entryAxis: 'x'|'z', entrySign: 1|-1 }
{
  const candidates = [];
  for (let cx = 1; cx < GRID_N - 1; cx++) for (let cz = 1; cz < GRID_N - 1; cz++) {
    if (cx === PIT_CELL.cx && cz === PIT_CELL.cz) continue;
    if (cellOpenDegree(cx, cz) === 1) candidates.push({ cx, cz });
  }
  const pickCount = Math.min(6, candidates.length);
  for (let i = 0; i < pickCount; i++) {
    const idx = Math.floor(rand() * candidates.length);
    const { cx, cz } = candidates.splice(idx, 1)[0];
    let entryAxis, entrySign;
    if (cx + 1 < GRID_N && openEdges.has(edgeKeyX(cx, cz))) { entryAxis = 'x'; entrySign = 1; openEdges.delete(edgeKeyX(cx, cz)); crawlEdges.add(edgeKeyX(cx, cz)); }
    else if (cx - 1 >= 0 && openEdges.has(edgeKeyX(cx - 1, cz))) { entryAxis = 'x'; entrySign = -1; openEdges.delete(edgeKeyX(cx - 1, cz)); crawlEdges.add(edgeKeyX(cx - 1, cz)); }
    else if (cz + 1 < GRID_N && openEdges.has(edgeKeyZ(cx, cz))) { entryAxis = 'z'; entrySign = 1; openEdges.delete(edgeKeyZ(cx, cz)); crawlEdges.add(edgeKeyZ(cx, cz)); }
    else { entryAxis = 'z'; entrySign = -1; openEdges.delete(edgeKeyZ(cx, cz - 1)); crawlEdges.add(edgeKeyZ(cx, cz - 1)); }
    crawlTunnelCells.push({ cx, cz, entryAxis, entrySign });
  }
}
function isCrawlTunnelCell(cx, cz) { return crawlTunnelCells.some((t) => t.cx === cx && t.cz === cz); }

const boxColliders = [];   // THREE.Box3 -- normal solid walls
const crawlOnlyBoxes = []; // THREE.Box3 -- passable only while crouching
const circleColliders = []; // { x, z, r } -- props (the glitched chair, etc.)
function addCircleCollider(x, z, r) { circleColliders.push({ x, z, r }); }

function collidesAt(x, z, crouchingNow) {
  for (const c of circleColliders) {
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + PLAYER_R) * (c.r + PLAYER_R)) return true;
  }
  for (const b of boxColliders) {
    if (x + PLAYER_R > b.min.x && x - PLAYER_R < b.max.x &&
        z + PLAYER_R > b.min.z && z - PLAYER_R < b.max.z) return true;
  }
  if (!crouchingNow) {
    for (const b of crawlOnlyBoxes) {
      if (x + PLAYER_R > b.min.x && x - PLAYER_R < b.max.x &&
          z + PLAYER_R > b.min.z && z - PLAYER_R < b.max.z) return true;
    }
  }
  return false;
}

function wallBox(x0, x1, z0, z1) {
  if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, WALL_H, z1 - z0), wallMat);
  mesh.position.set((x0 + x1) / 2, WALL_H / 2, (z0 + z1) / 2);
  scene.add(mesh);
  boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, WALL_H, z1)));
}

// One edge wall, X-oriented (fixed world X, spans a Z range) -- 'open'
// (a normal doorway, no gap dressing), 'crawl' (a low gap, collision-
// gated on crouching, with a visual header so it reads as low), or
// 'solid' (no gap at all).
// A crawlspace takes up the entire shared wall between the two rooms it
// connects now, on request -- not a narrow slot in an otherwise-normal
// doorway, the whole section. No flanking wallBox at all: just a header
// spanning the full span, low enough to force a crouch, in the same
// wallMat as every other wall (so it reads as "the wallpaper continues
// low here", not a distinct, obviously-different crawlspace material) --
// and deliberately no light placed anywhere in it, so it's genuinely dark
// unless a neighboring room's own light happens to still reach that far.
function edgeWallX(wx, wz0, wz1, kind) {
  if (kind === 'solid') { wallBox(wx - WALL_T / 2, wx + WALL_T / 2, wz0, wz1); return; }
  if (kind === 'crawl') {
    crawlOnlyBoxes.push(new THREE.Box3(new THREE.Vector3(wx - WALL_T, 0, wz0), new THREE.Vector3(wx + WALL_T, WALL_H, wz1)));
    const header = new THREE.Mesh(new THREE.BoxGeometry(WALL_T * 2, WALL_H - CRAWL_H, wz1 - wz0), wallMat);
    header.position.set(wx, CRAWL_H + (WALL_H - CRAWL_H) / 2, (wz0 + wz1) / 2);
    scene.add(header);
    return;
  }
  const half = DOOR_HALF;
  const midZ = (wz0 + wz1) / 2;
  wallBox(wx - WALL_T / 2, wx + WALL_T / 2, wz0, midZ - half);
  wallBox(wx - WALL_T / 2, wx + WALL_T / 2, midZ + half, wz1);
}
function edgeWallZ(wz, wx0, wx1, kind) {
  if (kind === 'solid') { wallBox(wx0, wx1, wz - WALL_T / 2, wz + WALL_T / 2); return; }
  if (kind === 'crawl') {
    crawlOnlyBoxes.push(new THREE.Box3(new THREE.Vector3(wx0, 0, wz - WALL_T), new THREE.Vector3(wx1, WALL_H, wz + WALL_T)));
    const header = new THREE.Mesh(new THREE.BoxGeometry(wx1 - wx0, WALL_H - CRAWL_H, WALL_T * 2), wallMat);
    header.position.set((wx0 + wx1) / 2, CRAWL_H + (WALL_H - CRAWL_H) / 2, wz);
    scene.add(header);
    return;
  }
  const half = DOOR_HALF;
  const midX = (wx0 + wx1) / 2;
  wallBox(wx0, midX - half, wz - WALL_T / 2, wz + WALL_T / 2);
  wallBox(midX + half, wx1, wz - WALL_T / 2, wz + WALL_T / 2);
}

function buildCellShell(cx, cz) {
  // Crawl-tunnel cells get neither -- buildCrawlTunnelCell (called after
  // the wall loops below) builds its own narrow floor strip(s) and its
  // own full-cell ceiling instead of a normal 12-unit room.
  if (isCrawlTunnelCell(cx, cz)) return;
  const c = cellCenter(cx, cz);
  if (cx !== PIT_CELL.cx || cz !== PIT_CELL.cz) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.15, CELL), carpetMat);
    floor.position.set(c.x, -0.075, c.z);
    scene.add(floor);
  }
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.15, CELL), ceilingMat);
  ceiling.position.set(c.x, WALL_H + 0.075, c.z);
  scene.add(ceiling);
}

for (let ex = 0; ex <= GRID_N; ex++) {
  for (let ez = 0; ez < GRID_N; ez++) {
    const wz0 = boundaryZ(ez), wz1 = boundaryZ(ez + 1);
    if (ex === 0 || ex === GRID_N) {
      // The one spot the maze's own outer boundary isn't solid -- the
      // mouth of the staircase down into the Pool Rooms (see that section
      // below, built after the pit room).
      const kind = (ex === GRID_N && ez === POOL_DOOR_CZ) ? 'open' : 'solid';
      edgeWallX(boundaryX(ex), wz0, wz1, kind);
      continue;
    }
    const k = edgeKeyX(ex - 1, ez);
    edgeWallX(boundaryX(ex), wz0, wz1, openEdges.has(k) ? 'open' : (crawlEdges.has(k) ? 'crawl' : 'solid'));
  }
}
for (let ez = 0; ez <= GRID_N; ez++) {
  for (let ex = 0; ex < GRID_N; ex++) {
    const wx0 = boundaryX(ex), wx1 = boundaryX(ex + 1);
    if (ez === 0 || ez === GRID_N) { edgeWallZ(boundaryZ(ez), wx0, wx1, 'solid'); continue; }
    const k = edgeKeyZ(ex, ez - 1);
    edgeWallZ(boundaryZ(ez), wx0, wx1, openEdges.has(k) ? 'open' : (crawlEdges.has(k) ? 'crawl' : 'solid'));
  }
}
for (let cx = 0; cx < GRID_N; cx++) for (let cz = 0; cz < GRID_N; cz++) buildCellShell(cx, cz);

// A crawl-tunnel cell's own interior: one straight leg in from the
// entrance, then either a dead-end cap (most of the way across the
// cell -- "long") or a 90-degree turn into a second leg before capping
// ("some of them having turns"). Narrow (pathHalf*2 wide, ~1/6th a
// normal room's width), low the whole way through (not just at the
// entrance), and unlit throughout -- genuinely dark, not just dim.
function buildCrawlTunnelCell(cx, cz, entryAxis, entrySign) {
  const c = cellCenter(cx, cz);
  const half = CELL / 2;
  const pathHalf = 1.0;

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.15, CELL), ceilingMat);
  ceiling.position.set(c.x, WALL_H + 0.075, c.z);
  scene.add(ceiling);

  let entryX, entryZ, dirX, dirZ;
  if (entryAxis === 'x') { entryX = c.x + entrySign * half; entryZ = c.z; dirX = -entrySign; dirZ = 0; }
  else { entryX = c.x; entryZ = c.z + entrySign * half; dirX = 0; dirZ = -entrySign; }

  // One straight, axis-aligned leg -- floor, low unlit header, flanking
  // solid walls on both long sides, and its own footprint registered as
  // crouch-only the whole way (not just at the entrance).
  function leg(x0, z0, x1, z1) {
    const minX = Math.min(x0, x1) - pathHalf, maxX = Math.max(x0, x1) + pathHalf;
    const minZ = Math.min(z0, z1) - pathHalf, maxZ = Math.max(z0, z1) + pathHalf;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.15, maxZ - minZ), carpetMat);
    floor.position.set((minX + maxX) / 2, -0.075, (minZ + maxZ) / 2);
    scene.add(floor);
    const header = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, WALL_H - CRAWL_H, maxZ - minZ), wallMat);
    header.position.set((minX + maxX) / 2, CRAWL_H + (WALL_H - CRAWL_H) / 2, (minZ + maxZ) / 2);
    scene.add(header);
    crawlOnlyBoxes.push(new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, WALL_H, maxZ)));
    if (x0 === x1) { wallBox(minX - WALL_T, minX, minZ, maxZ); wallBox(maxX, maxX + WALL_T, minZ, maxZ); }
    else { wallBox(minX, maxX, minZ - WALL_T, minZ); wallBox(minX, maxX, maxZ, maxZ + WALL_T); }
  }
  function capEnd(x, z, dx, dz) {
    if (dx !== 0) wallBox(x + dx * pathHalf, x + dx * (pathHalf + WALL_T), z - pathHalf, z + pathHalf);
    else wallBox(x - pathHalf, x + pathHalf, z + dz * pathHalf, z + dz * (pathHalf + WALL_T));
  }

  const len1 = half * (0.35 + rand() * 0.25);
  const p1x = entryX + dirX * len1, p1z = entryZ + dirZ * len1;
  leg(entryX, entryZ, p1x, p1z);

  if (rand() < 0.55) {
    // Turn -- a second leg on the perpendicular axis, random left/right.
    const turn = rand() < 0.5 ? 1 : -1;
    const dir2X = dirX !== 0 ? 0 : turn, dir2Z = dirX !== 0 ? turn : 0;
    const len2 = half * (0.3 + rand() * 0.25);
    const p2x = p1x + dir2X * len2, p2z = p1z + dir2Z * len2;
    leg(p1x, p1z, p2x, p2z);
    capEnd(p2x, p2z, dir2X, dir2Z);
  } else {
    // Straight the rest of the way -- one long leg reads better than two
    // flush straight ones, so this just extends leg 1's own endpoint.
    const len2 = half * (0.2 + rand() * 0.2);
    const p2x = p1x + dirX * len2, p2z = p1z + dirZ * len2;
    leg(p1x, p1z, p2x, p2z);
    capEnd(p2x, p2z, dirX, dirZ);
  }
}
for (const t of crawlTunnelCells) buildCrawlTunnelCell(t.cx, t.cz, t.entryAxis, t.entrySign);

// Ceiling light fixtures, one per room, each with its own slow flicker so
// the level never looks perfectly evenly lit -- brighter overall than the
// first pass (base bumped up, range widened so a room's light actually
// reaches into its own doorways) since "dim" had tipped into "can't
// actually see", which wasn't the intent.
const cellLights = [];
for (let cx = 0; cx < GRID_N; cx++) for (let cz = 0; cz < GRID_N; cz++) {
  if (cx === PIT_CELL.cx && cz === PIT_CELL.cz) continue; // the pit room has its own lighting below
  if (isCrawlTunnelCell(cx, cz)) continue; // no light at all -- these are deliberately dark
  const c = cellCenter(cx, cz);
  const fixture = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.1), trimMat);
  fixture.position.set(c.x, WALL_H - 0.1, c.z);
  scene.add(fixture);
  const base = 1.1 + rand() * 0.5;
  const light = new THREE.PointLight(0xe8d090, base, CELL * 1.8, 2);
  light.position.set(c.x, WALL_H - 0.4, c.z);
  scene.add(light);
  cellLights.push({ light, base, seed: rand() * 1000, broken: rand() < 0.18 });
}

/* ---------------- the pit room: a grid of square floor pits ---------------- */
/* pitHoles records each actual gap's footprint for supportHeight() (way
 * down near movePlayer) to check against -- declared here, right where
 * it's populated, rather than down there where it's merely read. */

const pitHoles = []; // { x0, x1, z0, z1 } -- walk over one of these without clearing it and you fall (DEATH_Y)
const ramps = []; // { x0, x1, z0, z1, yStart, yEnd, axis } -- a sloped walkable surface (the Pool Rooms staircase, below), checked by supportHeight() the same way pits and the Pool Rooms floor level are
function addRamp(x0, x1, z0, z1, yStart, yEnd, axis) { ramps.push({ x0, x1, z0, z1, yStart, yEnd, axis }); }
PIT_CELL._minX = 0; PIT_CELL._maxX = 0; PIT_CELL._minZ = 0; PIT_CELL._maxZ = 0;
{
  const c = cellCenter(PIT_CELL.cx, PIT_CELL.cz);
  PIT_CELL._minX = c.x - CELL / 2; PIT_CELL._maxX = c.x + CELL / 2;
  PIT_CELL._minZ = c.z - CELL / 2; PIT_CELL._maxZ = c.z + CELL / 2;
  const sub = 4; // 4x4 tiles
  const tile = CELL / sub;
  const x0 = c.x - CELL / 2, z0 = c.z - CELL / 2;
  for (let ix = 0; ix < sub; ix++) {
    for (let iz = 0; iz < sub; iz++) {
      const onEdge = ix === 0 || ix === sub - 1 || iz === 0 || iz === sub - 1;
      const isPit = !onEdge && rand() < 0.45; // keep the ring touching every doorway solid, so you can always step in
      const tx = x0 + (ix + 0.5) * tile, tz = z0 + (iz + 0.5) * tile;
      if (isPit) {
        pitHoles.push({ x0: tx - tile / 2, x1: tx + tile / 2, z0: tz - tile / 2, z1: tz + tile / 2 });
        continue; // no floor at all here -- a real hole, see DEATH_Y
      }
      const slab = new THREE.Mesh(new THREE.BoxGeometry(tile - 0.1, 0.15, tile - 0.1), carpetMat);
      slab.position.set(tx, -0.075, tz);
      scene.add(slab);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(tile, 0.04, tile), trimMat);
      rim.position.set(tx, 0.02, tz);
      scene.add(rim);
    }
  }
  const pitLight = new THREE.PointLight(0xc9b36a, 0.4, CELL * 1.3, 2);
  pitLight.position.set(c.x, WALL_H - 0.5, c.z);
  scene.add(pitLight);
}

/* ---------------- the Pool Rooms: a new sub-level reached by a staircase ---------------- */
/* A real staircase (a sloped collision ramp under purely decorative step
 * meshes -- see addRamp/supportHeight) descends from the one doorway
 * carved through the maze's own east boundary wall (POOL_DOOR_CZ, above)
 * down to a small, separate area one real level below the maze: white
 * tile everywhere, three differently-sized rooms, and several pools --
 * on request ("a new area called the pool rooms... every surface is made
 * out of white tiles"). It isn't on the maze's own grid at all -- no
 * doorways/crawlspaces/monster-pathing graph apply here, it's just three
 * hand-placed rooms connected directly by doorway gaps in their shared
 * walls, which is simple enough not to need any of that machinery. */

const tileFloorMat = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.4, map: makeGrainTexture({ size: 128, dark: 190, light: 255, repeat: 24, blotch: 2 }) });
const tileWallMat = new THREE.MeshStandardMaterial({ color: 0xe8ebee, roughness: 0.5, map: makeGrainTexture({ size: 128, dark: 200, light: 255, repeat: 14, blotch: 2 }) });
const tileCeilMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.6 });
const poolWaterMat = new THREE.MeshStandardMaterial({ color: 0x2a6fa0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x0d3550, emissiveIntensity: 0.3 });

// Like wallBox(), but for an arbitrary Y range instead of always 0..WALL_H
// -- everything down here sits at POOL_Y, not ground level, and the
// staircase itself spans both.
function spanBox(x0, x1, y0, y1, z0, z1, mat) {
  if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  scene.add(mesh);
  boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
}
// A tiled wall along X (fixed world X, spans a Z range) or Z (fixed world
// Z, spans an X range), each with an optional doorway gap -- the Pool
// Rooms' own equivalent of edgeWallX/edgeWallZ, just not tied to the
// maze's grid or its 0..WALL_H ground floor.
function tileEdgeX(wx, z0, z1, mat, doorCenterZ) {
  if (doorCenterZ === null) { spanBox(wx - WALL_T / 2, wx + WALL_T / 2, POOL_Y, POOL_Y + WALL_H, z0, z1, mat); return; }
  spanBox(wx - WALL_T / 2, wx + WALL_T / 2, POOL_Y, POOL_Y + WALL_H, z0, doorCenterZ - DOOR_HALF, mat);
  spanBox(wx - WALL_T / 2, wx + WALL_T / 2, POOL_Y, POOL_Y + WALL_H, doorCenterZ + DOOR_HALF, z1, mat);
}
function tileEdgeZ(wz, x0, x1, mat, doorCenterX) {
  if (doorCenterX === null) { spanBox(x0, x1, POOL_Y, POOL_Y + WALL_H, wz - WALL_T / 2, wz + WALL_T / 2, mat); return; }
  spanBox(x0, doorCenterX - DOOR_HALF, POOL_Y, POOL_Y + WALL_H, wz - WALL_T / 2, wz + WALL_T / 2, mat);
  spanBox(doorCenterX + DOOR_HALF, x1, POOL_Y, POOL_Y + WALL_H, wz - WALL_T / 2, wz + WALL_T / 2, mat);
}
function buildPoolRoomShell(x0, x1, z0, z1) {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.15, z1 - z0), tileFloorMat);
  floor.position.set((x0 + x1) / 2, POOL_Y - 0.075, (z0 + z1) / 2);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.15, z1 - z0), tileCeilMat);
  ceil.position.set((x0 + x1) / 2, POOL_Y + WALL_H + 0.075, (z0 + z1) / 2);
  scene.add(ceil);
}
// A shallow, stepped-down pool -- visual only (no collider; walkable
// over, same as the pool rooms' own floor), just a sunken-looking basin
// with a couple of steps down one edge so it reads as a real pool rather
// than a painted rectangle.
function buildPool(cx, cz, w, d, depth) {
  const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), tileWallMat);
  rim.position.set(cx, POOL_Y + 0.05, cz);
  scene.add(rim);
  const water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.05, d - 0.6), poolWaterMat);
  water.position.set(cx, POOL_Y - depth, cz);
  scene.add(water);
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.1, 0.5), tileFloorMat);
    step.position.set(cx, POOL_Y - depth * ((i + 1) / 3) + 0.05, cz - d / 2 + 0.6 + i * 0.5);
    scene.add(step);
  }
}

const doorCenterZ = cellCenter(GRID_N - 1, POOL_DOOR_CZ).z;
const eastWallX = boundaryX(GRID_N);
const STAIR_WIDTH = 4, STAIR_LEN = 10;
const stairZ0 = doorCenterZ - STAIR_WIDTH / 2, stairZ1 = doorCenterZ + STAIR_WIDTH / 2;
const stairX0 = eastWallX, stairX1 = eastWallX + STAIR_LEN;
addRamp(stairX0, stairX1, stairZ0, stairZ1, 0, POOL_Y, 'x');
spanBox(stairX0, stairX1, POOL_Y, WALL_H, stairZ0 - WALL_T, stairZ0, tileWallMat);
spanBox(stairX0, stairX1, POOL_Y, WALL_H, stairZ1, stairZ1 + WALL_T, tileWallMat);
{
  const stairCeil = new THREE.Mesh(new THREE.BoxGeometry(STAIR_LEN, 0.15, STAIR_WIDTH), tileCeilMat);
  stairCeil.position.set((stairX0 + stairX1) / 2, WALL_H + 0.075, doorCenterZ);
  scene.add(stairCeil);
  const STEP_COUNT = 10;
  for (let i = 0; i < STEP_COUNT; i++) {
    const t1 = (i + 1) / STEP_COUNT;
    const x0s = stairX0 + (i / STEP_COUNT) * STAIR_LEN, x1s = stairX0 + t1 * STAIR_LEN;
    const y1 = POOL_Y * t1;
    const step = new THREE.Mesh(new THREE.BoxGeometry(x1s - x0s + 0.05, 0.25, STAIR_WIDTH - WALL_T), tileFloorMat);
    step.position.set((x0s + x1s) / 2, y1 + 0.125, doorCenterZ);
    scene.add(step);
  }
  const stairLight = new THREE.PointLight(0xcfe6ff, 1.0, STAIR_LEN * 1.5, 2);
  stairLight.position.set((stairX0 + stairX1) / 2, WALL_H - 0.4, doorCenterZ);
  scene.add(stairLight);
  cellLights.push({ light: stairLight, base: 1.0, seed: rand() * 1000, broken: false });
}

// Three rooms, deliberately different footprints ("different sized
// rooms") -- a smaller entry room, a big room most of a large pool fills,
// and a small side room branching off it.
const roomAx0 = stairX1, roomAx1 = roomAx0 + 16, roomAz0 = doorCenterZ - 8, roomAz1 = doorCenterZ + 8;
const roomBx0 = roomAx1, roomBx1 = roomBx0 + 24, roomBz0 = doorCenterZ - 14, roomBz1 = doorCenterZ + 14;
const roomCx0 = roomBx0 + 6, roomCx1 = roomCx0 + 10, roomCz1 = roomBz0, roomCz0 = roomCz1 - 12;
const roomCDoorX = (roomCx0 + roomCx1) / 2;

const POOL_BOUNDS = {
  x0: Math.min(roomAx0, roomBx0, roomCx0), x1: Math.max(roomAx1, roomBx1, roomCx1),
  z0: Math.min(roomAz0, roomBz0, roomCz0), z1: Math.max(roomAz1, roomBz1, roomCz1),
};

buildPoolRoomShell(roomAx0, roomAx1, roomAz0, roomAz1);
tileEdgeX(roomAx1, roomAz0, roomAz1, tileWallMat, doorCenterZ); // A -> B
tileEdgeZ(roomAz1, roomAx0, roomAx1, tileWallMat, null);
tileEdgeZ(roomAz0, roomAx0, roomAx1, tileWallMat, null);
// (no west wall for room A -- that's the staircase's own mouth, left open)

buildPoolRoomShell(roomBx0, roomBx1, roomBz0, roomBz1);
tileEdgeX(roomBx0, roomBz0, roomBz1, tileWallMat, doorCenterZ); // B -> A (same plane as A's own east wall above; the redundant geometry is harmless)
tileEdgeX(roomBx1, roomBz0, roomBz1, tileWallMat, null);
tileEdgeZ(roomBz1, roomBx0, roomBx1, tileWallMat, null);
tileEdgeZ(roomBz0, roomBx0, roomBx1, tileWallMat, roomCDoorX); // B -> C

buildPoolRoomShell(roomCx0, roomCx1, roomCz0, roomCz1);
tileEdgeZ(roomCz1, roomCx0, roomCx1, tileWallMat, roomCDoorX); // C -> B
tileEdgeX(roomCx0, roomCz0, roomCz1, tileWallMat, null);
tileEdgeX(roomCx1, roomCz0, roomCz1, tileWallMat, null);
tileEdgeZ(roomCz0, roomCx0, roomCx1, tileWallMat, null);

buildPool((roomAx0 + roomAx1) / 2, (roomAz0 + roomAz1) / 2 + 3, 5, 4, 0.5);
buildPool((roomBx0 + roomBx1) / 2 - 4, (roomBz0 + roomBz1) / 2, 12, 16, 0.9); // the big one
buildPool((roomBx0 + roomBx1) / 2 + 7, roomBz1 - 5, 5, 5, 0.6);
buildPool((roomCx0 + roomCx1) / 2, (roomCz0 + roomCz1) / 2, 5, 4, 0.5);

for (const [lx, lz] of [
  [(roomAx0 + roomAx1) / 2, roomAz0 + 3],
  [(roomBx0 + roomBx1) / 2, roomBz0 + 4],
  [(roomBx0 + roomBx1) / 2, roomBz1 - 4],
  [(roomCx0 + roomCx1) / 2, (roomCz0 + roomCz1) / 2],
]) {
  const fixture = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.1), tileCeilMat);
  fixture.position.set(lx, POOL_Y + WALL_H - 0.1, lz);
  scene.add(fixture);
  const light = new THREE.PointLight(0xdfe9f5, 1.3, CELL * 1.8, 2);
  light.position.set(lx, POOL_Y + WALL_H - 0.4, lz);
  scene.add(light);
  cellLights.push({ light, base: 1.3, seed: rand() * 1000, broken: false });
}

// The kiddie pool -- a small inflatable ring sitting by itself in room A,
// distinct from the room's own built-in (tiled) pool -- one of the two
// new photographable artifacts.
let kiddiePoolPos = null;
{
  const px = (roomAx0 + roomAx1) / 2, pz = (roomAz0 + roomAz1) / 2 - 3;
  kiddiePoolPos = { x: px, z: pz };
  const kiddieMat = new THREE.MeshStandardMaterial({ color: 0xe0455a, roughness: 0.6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 8, 16), kiddieMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(px, POOL_Y + 0.2, pz);
  scene.add(ring);
  const kwater = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 16), poolWaterMat);
  kwater.position.set(px, POOL_Y + 0.17, pz);
  scene.add(kwater);
  addCircleCollider(px, pz, 1.0);
}
const ARTIFACT_POOL = { pos: kiddiePoolPos, id: 'pool', name: 'The Kiddie Pool' };

// Where the Mimitor (see its own section, below the Mannequin) starts --
// it lives down here, not on the maze grid, so this is just a plain
// coordinate rather than a cell reference.
const mimitorSpawnPos = { x: (roomBx0 + roomBx1) / 2 + 4, z: roomBz1 - 3 };

/* ---------------- dim red room: one of the five photographable things ---------------- */
/* Picked as a cell with only one open edge (a dead end) so it reads as a
 * small sealed side-room, not a room you pass through -- and deliberately
 * excluded from the normal cellLights loop above, so your own flashlight
 * and the one red bulb are genuinely the only light in it. */

function findDeadEndCell(exclude) {
  for (let cx = 1; cx < GRID_N - 1; cx++) for (let cz = 1; cz < GRID_N - 1; cz++) {
    if (exclude.some((e) => e.cx === cx && e.cz === cz)) continue;
    let openCount = 0;
    if (openEdges.has(edgeKeyX(cx, cz))) openCount++;
    if (cx > 0 && openEdges.has(edgeKeyX(cx - 1, cz))) openCount++;
    if (openEdges.has(edgeKeyZ(cx, cz))) openCount++;
    if (cz > 0 && openEdges.has(edgeKeyZ(cx, cz - 1))) openCount++;
    if (openCount === 1) return { cx, cz };
  }
  return { cx: 1, cz: 1 }; // fallback -- shouldn't be needed in practice
}

const usedCells = [{ cx: 0, cz: 0 }, PIT_CELL];
const redRoomCell = findDeadEndCell(usedCells);
usedCells.push(redRoomCell);
let redBulbMesh = null;
{
  const c = cellCenter(redRoomCell.cx, redRoomCell.cz);
  // Remove this room from the normal light rig -- find and drop its entry.
  const idx = cellLights.findIndex((l) => Math.abs(l.light.position.x - c.x) < 0.1 && Math.abs(l.light.position.z - c.z) < 0.1);
  if (idx >= 0) { scene.remove(cellLights[idx].light); cellLights.splice(idx, 1); }
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x3a0505, emissive: 0xbb1111, emissiveIntensity: 1.6, roughness: 0.6 });
  redBulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 7), bulbMat);
  redBulbMesh.position.set(c.x - CELL * 0.3, WALL_H - 0.6, c.z - CELL * 0.3);
  scene.add(redBulbMesh);
  const redLight = new THREE.PointLight(0xff2222, 0.9, CELL * 0.9, 2);
  redLight.position.copy(redBulbMesh.position);
  scene.add(redLight);
}
const ARTIFACT_RED_ROOM = { pos: cellCenter(redRoomCell.cx, redRoomCell.cz), id: 'redroom', name: 'The Red Room' };

/* ---------------- the glitched chair ---------------- */

function pickPropCell(exclude) {
  let cx, cz;
  do { cx = 1 + Math.floor(rand() * (GRID_N - 2)); cz = 1 + Math.floor(rand() * (GRID_N - 2)); }
  while (exclude.some((e) => e.cx === cx && e.cz === cz) || isCrawlTunnelCell(cx, cz));
  return { cx, cz };
}
const chairCell = pickPropCell(usedCells);
usedCells.push(chairCell);
let chairPos = null;
{
  const c = cellCenter(chairCell.cx, chairCell.cz);
  // Half-embedded in the room's own north wall -- "glitched into the wall".
  const wallZ = boundaryZ(chairCell.cz + 1);
  const px = c.x, pz = wallZ - 0.3;
  chairPos = { x: px, z: pz };
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.8 });
  const chair = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), seatMat);
  seat.position.set(0, 0.45, 0);
  chair.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.08), seatMat);
  back.position.set(0, 0.75, -0.21);
  chair.add(back);
  for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), seatMat);
    leg.position.set(lx, 0.22, lz);
    chair.add(leg);
  }
  chair.position.set(px, 0, pz);
  chair.rotation.y = rand() * Math.PI * 2; // the "glitch" -- askew, not neatly facing a direction
  scene.add(chair);
  addCircleCollider(px, pz, 0.35);
}
const ARTIFACT_CHAIR = { pos: chairPos, id: 'chair', name: 'Glitched Chair' };

/* ---------------- the house in the wall ---------------- */

const houseCell = pickPropCell(usedCells);
usedCells.push(houseCell);
let housePos = null;
{
  const c = cellCenter(houseCell.cx, houseCell.cz);
  const wallX = boundaryX(houseCell.cx + 1);
  housePos = { x: wallX - 0.4, z: c.z };
  // A real cutaway opening in the wall (two flanking segments, same
  // technique as a doorway) revealing a tiny lit diorama of a house
  // interior sitting inside the wall's own thickness.
  const half = 1.1;
  const wz0 = boundaryZ(houseCell.cz), wz1 = boundaryZ(houseCell.cz + 1);
  // (The normal solid wall for this edge was already built above; this
  // punches an additional opening into it by adding a dark recessed box
  // rather than re-deriving the edge's wall kind -- simplest way to carve
  // a one-off anomaly into an otherwise-solid wall.)
  const nicheMat = new THREE.MeshStandardMaterial({ color: 0x1a140a, roughness: 1 });
  const niche = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, half * 2), nicheMat);
  niche.position.set(wallX - 0.6, 1.1, c.z);
  scene.add(niche);
  const houseMat = new THREE.MeshStandardMaterial({ color: 0xcf8f4a, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b2f2a, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), houseMat);
  body.position.set(wallX - 0.65, 0.9, c.z);
  scene.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.5, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(wallX - 0.65, 1.45, c.z);
  scene.add(roof);
  const glow = new THREE.PointLight(0xffdca0, 0.8, 3, 2);
  glow.position.set(wallX - 0.65, 1.0, c.z);
  scene.add(glow);
  const windowMat = new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffdca0, emissiveIntensity: 1.2 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), windowMat);
  win.position.set(wallX - 0.25, 0.9, c.z);
  win.rotation.y = Math.PI / 2;
  scene.add(win);
}
const ARTIFACT_HOUSE = { pos: housePos, id: 'house', name: 'House in the Wall' };

/* ---------------- the tilted staircase ---------------- */

const staircaseCell = pickPropCell(usedCells);
usedCells.push(staircaseCell);
let staircasePos = null;
{
  const c = cellCenter(staircaseCell.cx, staircaseCell.cz);
  const px = c.x + (rand() - 0.5) * 3, pz = c.z + (rand() - 0.5) * 3;
  staircasePos = { x: px, z: pz };
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.85 });
  const stair = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), stepMat);
    step.position.set(0, 0.15 + i * 0.32, -i * 0.42);
    stair.add(step);
  }
  stair.position.set(px, 0, pz);
  // "Tilted" -- askew on two axes at once, like it's standing in a room
  // that doesn't agree with it about which way is down, not just rotated
  // flat around Y the way the chair is.
  stair.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.4);
  scene.add(stair);
  addCircleCollider(px, pz, 0.8);
}
const ARTIFACT_STAIRCASE = { pos: staircasePos, id: 'staircase', name: 'Tilted Staircase' };

const ARTIFACTS = [ARTIFACT_CHAIR, ARTIFACT_RED_ROOM, ARTIFACT_HOUSE, ARTIFACT_STAIRCASE, ARTIFACT_POOL];
const PHOTO_RANGE = 7;
const PHOTO_COS = 0.72;

/* ---------------- the computer (appearance + catalog, same desk as before) ---------------- */

const officeCell = pickPropCell(usedCells);
usedCells.push(officeCell);
const deskMat = new THREE.MeshStandardMaterial({ color: 0x2c2518, roughness: 0.9 });
const monitorMat = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.7 });
const screenMat = new THREE.MeshStandardMaterial({ color: 0x0a1a12, emissive: 0x1fae7a, emissiveIntensity: 0.9, roughness: 0.4 });
const keyboardMat = new THREE.MeshStandardMaterial({ color: 0x9a927c, roughness: 0.8 });
let keyboardCenter = null;
{
  const c = cellCenter(officeCell.cx, officeCell.cz);
  const dx = c.x - 3, dz = c.z - 3;
  const topY = 0.75;
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.0), deskMat);
  desk.position.set(dx, topY, dz);
  scene.add(desk);
  for (const [lx, lz] of [[-0.75, -0.45], [0.75, -0.45], [-0.75, 0.45], [0.75, 0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.06), deskMat);
    leg.position.set(dx + lx, topY / 2, dz + lz);
    scene.add(leg);
  }
  const monBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.5), monitorMat);
  monBody.position.set(dx, topY + 0.265, dz - 0.15);
  scene.add(monBody);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), screenMat);
  screen.position.set(dx, topY + 0.265, dz - 0.15 + 0.26);
  scene.add(screen);
  const glow = new THREE.PointLight(0x2fd69a, 1.0, 5, 2);
  glow.position.set(dx, topY + 0.4, dz);
  scene.add(glow);
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.16), keyboardMat);
  keyboard.position.set(dx, topY + 0.06, dz + 0.3);
  scene.add(keyboard);
  boxColliders.push(new THREE.Box3(new THREE.Vector3(dx - 0.85, 0, dz - 0.5), new THREE.Vector3(dx + 0.85, 1.1, dz + 0.5)));
  keyboardCenter = new THREE.Vector3(dx, EYE_H, dz + 0.3);
}

/* ---------------- respawn points ---------------- */
/* "if you die you spawn in an area away from the monster" -- a handful of
 * candidates spread around the grid; on a catch, whichever one is
 * farthest from the thing that caught you wins. */

const RESPAWN_CELLS = [
  { cx: 0, cz: 0 }, { cx: GRID_N - 1, cz: 0 }, { cx: 0, cz: GRID_N - 1 }, { cx: GRID_N - 1, cz: GRID_N - 1 },
  { cx: Math.floor(GRID_N / 2), cz: 0 }, { cx: 0, cz: Math.floor(GRID_N / 2) },
];
function pickRespawn(awayFrom) {
  let best = RESPAWN_CELLS[0], bestD = -1;
  for (const rc of RESPAWN_CELLS) {
    const p = cellCenter(rc.cx, rc.cz);
    const d = awayFrom ? Math.hypot(p.x - awayFrom.x, p.z - awayFrom.z) : rand() * 1000;
    if (d > bestD) { bestD = d; best = rc; }
  }
  return cellCenter(best.cx, best.cz);
}

const SPAWN = (() => { const c = cellCenter(0, 0); return new THREE.Vector3(c.x, EYE_H, c.z); })();
camera.position.copy(SPAWN);

/* ---------------- monster pathing (shared graph walk) ---------------- */

function monsterNeighbors(cx, cz) {
  const res = [];
  if (cx + 1 < GRID_N && openEdges.has(edgeKeyX(cx, cz))) res.push({ nx: cx + 1, nz: cz });
  if (cx - 1 >= 0 && openEdges.has(edgeKeyX(cx - 1, cz))) res.push({ nx: cx - 1, nz: cz });
  if (cz + 1 < GRID_N && openEdges.has(edgeKeyZ(cx, cz))) res.push({ nx: cx, nz: cz + 1 });
  if (cz - 1 >= 0 && openEdges.has(edgeKeyZ(cx, cz - 1))) res.push({ nx: cx, nz: cz - 1 });
  return res;
}
// Neither monster can ever use a crawlEdges connection -- this graph
// simply never contains them, so there's nothing extra to check at
// movement time; a monster literally has no route through one.
function bfsPath(fromCx, fromCz, toCx, toCz) {
  if (fromCx === toCx && fromCz === toCz) return [];
  const key = (x, z) => x + ',' + z;
  const visited = new Set([key(fromCx, fromCz)]);
  const prev = new Map();
  const queue = [[fromCx, fromCz]];
  let head = 0, found = false;
  while (head < queue.length) {
    const [cx, cz] = queue[head++];
    if (cx === toCx && cz === toCz) { found = true; break; }
    for (const n of monsterNeighbors(cx, cz)) {
      const k = key(n.nx, n.nz);
      if (visited.has(k)) continue;
      visited.add(k);
      prev.set(k, [cx, cz]);
      queue.push([n.nx, n.nz]);
    }
  }
  if (!found) return [];
  const path = [];
  let cur = [toCx, toCz];
  while (!(cur[0] === fromCx && cur[1] === fromCz)) {
    path.unshift(cur);
    const p = prev.get(key(cur[0], cur[1]));
    if (!p) break;
    cur = p;
  }
  return path;
}
function cellOf(x, z) {
  let cx = Math.floor(x / CELL + GRID_N / 2), cz = Math.floor(z / CELL + GRID_N / 2);
  cx = Math.max(0, Math.min(GRID_N - 1, cx));
  cz = Math.max(0, Math.min(GRID_N - 1, cz));
  return { cx, cz };
}
// Two waypoints per room instead of one, on request ("monsters shouldn't
// run on a grid, they walk around normally"): an exact, unjittered
// doorway-crossing point (so every doorway/crawlspace is still always
// threaded dead-on -- monsters have no wall collision of their own, so
// missing one would mean visibly clipping through a wall) followed by
// the room's own center with a random sideways jitter on it (skipped on
// the very last stop, so the final destination -- the player, or a roam
// target -- still lands precisely). The straight line between "jittered
// center of room A" and "exact doorway" and "jittered center of room B"
// is what actually reads as cutting across a room at an angle instead of
// beelining dead-center through every single one of them.
function setMonsterPath(m, toCx, toCz) {
  const path = bfsPath(m.cx, m.cz, toCx, toCz);
  const waypoints = [];
  let prevCx = m.cx, prevCz = m.cz;
  for (let i = 0; i < path.length; i++) {
    const [cx, cz] = path[i];
    const prevCenter = cellCenter(prevCx, prevCz);
    let doorX, doorZ;
    if (cx === prevCx + 1) { doorX = boundaryX(cx); doorZ = prevCenter.z; }
    else if (cx === prevCx - 1) { doorX = boundaryX(prevCx); doorZ = prevCenter.z; }
    else if (cz === prevCz + 1) { doorX = prevCenter.x; doorZ = boundaryZ(cz); }
    else { doorX = prevCenter.x; doorZ = boundaryZ(prevCz); }
    waypoints.push({ x: doorX, z: doorZ, cx: prevCx, cz: prevCz });

    const c = cellCenter(cx, cz);
    if (i < path.length - 1) {
      c.x += (rand() - 0.5) * CELL * 0.4;
      c.z += (rand() - 0.5) * CELL * 0.4;
    }
    waypoints.push({ ...c, cx, cz });
    prevCx = cx; prevCz = cz;
  }
  m.waypoints = waypoints;
  m.wpIndex = 0;
}
function lerpAngle(a, b, t) {
  const diff = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + diff * t;
}
// Advances a monster along its current waypoint list; returns true once
// it has arrived (empty/finished path). Facing turns smoothly toward the
// current direction of travel (lerpAngle) instead of snapping to it
// instantly -- part of the same "doesn't move like it's on rails" goal
// as the waypoint jitter above.
function tickMonsterMove(m, dt, speed) {
  if (!m.waypoints || m.wpIndex >= m.waypoints.length) return true;
  const wp = m.waypoints[m.wpIndex];
  const dx = wp.x - m.pos.x, dz = wp.z - m.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) {
    m.cx = wp.cx; m.cz = wp.cz;
    m.wpIndex++;
    return m.wpIndex >= m.waypoints.length;
  }
  const nx = dx / d, nz = dz / d;
  m.pos.x += nx * speed * dt;
  m.pos.z += nz * speed * dt;
  if (m.facing === undefined) m.facing = Math.atan2(nx, nz);
  m.facing = lerpAngle(m.facing, Math.atan2(nx, nz), Math.min(1, dt * 7));
  return false;
}

// Shared by both entities (they're built on the same shoulder/elbow,
// hip/knee pivot-group rig -- see createBacteriaModel/createMannequinModel)
// -- a simple opposite-phase limb swing, eased in/out by m.walkAmp rather
// than snapping to a pose the instant movement starts/stops, so freezing
// (the Mannequin, mid-stride, the moment it's looked at) reads as an
// actual freeze instead of a reset to a neutral idle pose.
function animateWalkCycle(m, dt, moving, sprinting) {
  if (m.walkPhase === undefined) { m.walkPhase = 0; m.walkAmp = 0; m.sprintAmp = 0; }
  m.walkAmp += ((moving ? 1 : 0) - m.walkAmp) * Math.min(1, dt * 6);
  m.sprintAmp += ((moving && sprinting ? 1 : 0) - m.sprintAmp) * Math.min(1, dt * 5);
  // A real sprint, not just a faster walk -- quicker cadence, a bigger
  // swing, and a forward lean through the torso (if the rig exposes one;
  // both of this game's do).
  const cadence = 8 + m.sprintAmp * 7;
  const amp = 0.7 + m.sprintAmp * 0.45;
  if (moving) m.walkPhase += dt * cadence;
  const swing = Math.sin(m.walkPhase) * amp * m.walkAmp;
  const ud = m.group.userData;
  if (ud.armPivots) {
    ud.armPivots[0].rotation.x = swing;
    ud.armPivots[1].rotation.x = -swing;
    ud.elbowPivots[0].rotation.x = Math.max(0, -swing) * 0.8;
    ud.elbowPivots[1].rotation.x = Math.max(0, swing) * 0.8;
  }
  if (ud.legPivots) {
    ud.legPivots[0].rotation.x = -swing;
    ud.legPivots[1].rotation.x = swing;
    ud.kneePivots[0].rotation.x = Math.max(0, swing) * 0.9;
    ud.kneePivots[1].rotation.x = Math.max(0, -swing) * 0.9;
  }
  if (ud.torso) ud.torso.rotation.x = m.sprintAmp * 0.3 * m.walkAmp;
}

/* ---------------- The Bacteria: a wire creature ---------------- */
/* A real humanoid rig -- head, torso, two jointed arms, two jointed legs,
 * same shoulder/elbow and hip/knee pivot-group technique as the hollowed-
 * out chimp factory the previous version of this game used, so it can
 * actually walk-cycle (see animateWalkCycle()) and so the kill animation
 * has real limbs to pose -- but every single piece is a thin black wire
 * (a dull, near-zero-reflectance cylinder, no skin/shell mesh at all) and
 * deliberately faceless: no eyes, nothing looking back. */

const wireMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.85, metalness: 0.1 });
function wireBone(r0, r1, len) { return new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 5), wireMat); }

function createBacteriaModel() {
  const g = new THREE.Group();

  const torso = wireBone(0.1, 0.14, 0.72);
  torso.position.y = 1.0;
  g.add(torso);
  // A handful of thin cross-wires over the torso read as a ribcage
  // silhouette without needing a real mesh there at all.
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.01, 4, 8), wireMat);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = 0.7 + i * 0.18;
    g.add(rib);
  }
  const neck = wireBone(0.035, 0.045, 0.1);
  neck.position.y = 1.41;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), wireMat); // angular, cage-like, no face
  head.position.y = 1.55;
  g.add(head);

  const armPivots = [], elbowPivots = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.16, 1.28, 0);
    g.add(shoulder);
    const upper = wireBone(0.035, 0.045, 0.38);
    upper.position.y = -0.19;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.38;
    shoulder.add(elbow);
    const fore = wireBone(0.028, 0.035, 0.34);
    fore.position.y = -0.17;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), wireMat);
    hand.position.y = -0.36;
    elbow.add(hand);
    armPivots.push(shoulder);
    elbowPivots.push(elbow);
  }

  const legPivots = [], kneePivots = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09, 0.64, 0);
    g.add(hip);
    const thigh = wireBone(0.045, 0.05, 0.4);
    thigh.position.y = -0.2;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    hip.add(knee);
    const shin = wireBone(0.032, 0.045, 0.38);
    shin.position.y = -0.19;
    knee.add(shin);
    legPivots.push(hip);
    kneePivots.push(knee);
  }

  g.userData.armPivots = armPivots;
  g.userData.elbowPivots = elbowPivots;
  g.userData.legPivots = legPivots;
  g.userData.kneePivots = kneePivots;
  g.userData.head = head;
  g.userData.torso = torso;
  g.userData.grabPoint = { y: 1.0 }; // torso height -- where the kill animation "grabs"
  return g;
}
const BACTERIA_ROAM_SPEED = RUN_SPEED * 0.25;
const BACTERIA_CHASE_SPEED = RUN_SPEED * 1.2;
const BACTERIA_SEE_RANGE = 13;
const BACTERIA_CATCH_R = 1.1;

function spawnMonster(model, cx, cz) {
  const c = cellCenter(cx, cz);
  const group = model();
  scene.add(group);
  return { group, cx, cz, pos: new THREE.Vector3(c.x, 0, c.z), facing: 0, waypoints: null, wpIndex: 0, alert: false, alertTimer: 0 };
}

const bacteriaCell = pickPropCell(usedCells);
usedCells.push(bacteriaCell);
const bacteria = spawnMonster(createBacteriaModel, bacteriaCell.cx, bacteriaCell.cz);
let bacteriaRoamTimer = 0;

function tickBacteria(dt, playerPos) {
  const dist = Math.hypot(playerPos.x - bacteria.pos.x, playerPos.z - bacteria.pos.z);
  const seen = dist < BACTERIA_SEE_RANGE;
  if (seen) { bacteria.alert = true; bacteria.alertTimer = 3.5; }
  else if (bacteria.alertTimer > 0) bacteria.alertTimer -= dt;
  else bacteria.alert = false;

  let arrived;
  if (bacteria.alert) {
    const pc = cellOf(playerPos.x, playerPos.z);
    bacteriaRoamTimer -= dt;
    if (bacteriaRoamTimer <= 0 || !bacteria.waypoints || bacteria.wpIndex >= bacteria.waypoints.length) {
      setMonsterPath(bacteria, pc.cx, pc.cz);
      bacteriaRoamTimer = 0.5;
    }
    arrived = tickMonsterMove(bacteria, dt, BACTERIA_CHASE_SPEED);
  } else {
    bacteriaRoamTimer -= dt;
    if (bacteriaRoamTimer <= 0 || !bacteria.waypoints || bacteria.wpIndex >= bacteria.waypoints.length) {
      const tx = Math.floor(rand() * GRID_N), tz = Math.floor(rand() * GRID_N);
      setMonsterPath(bacteria, tx, tz);
      bacteriaRoamTimer = 4 + rand() * 3;
    }
    arrived = tickMonsterMove(bacteria, dt, BACTERIA_ROAM_SPEED);
  }
  bacteria.group.position.set(bacteria.pos.x, 0, bacteria.pos.z);
  bacteria.group.rotation.y = bacteria.facing;
  animateWalkCycle(bacteria, dt, !arrived, bacteria.alert);
  return { dist, danger: bacteria.alert ? Math.max(0, 1 - dist / 14) : 0, catchR: BACTERIA_CATCH_R, type: 'bacteria', instance: bacteria };
}

/* ---------------- The Mannequin ---------------- */
/* Moves only while the player isn't looking at it, and only once the
 * player has looked at it at least once -- dormant and harmless until
 * that first sighting "activates" it. */

const mannequinMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.55 });
// Same jointed-pivot rig shape as the Bacteria (shoulder/elbow,
// hip/knee groups), so both share one walk-cycle animator and one kill-
// animation technique -- a smooth-skinned mannequin body on it instead of
// wire bones, with a visible joint ring at each pivot (a real mannequin's
// own articulation points, and a free place to hide the seam between two
// capsule segments).
const mannequinJointMat = new THREE.MeshStandardMaterial({ color: 0x8a8370, roughness: 0.5 });
function mannequinJoint(r) { return new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.22, 6, 10), mannequinJointMat); }

function createMannequinModel() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.85, 8), mannequinMat);
  torso.position.y = 1.03;
  g.add(torso);
  const neckJoint = mannequinJoint(0.09);
  neckJoint.rotation.x = Math.PI / 2;
  neckJoint.position.y = 1.47;
  g.add(neckJoint);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mannequinMat);
  head.position.y = 1.62;
  g.add(head); // deliberately featureless -- no eyes, no muzzle, a blank mannequin head

  const armPivots = [], elbowPivots = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.26, 1.35, 0);
    g.add(shoulder);
    const shoulderJoint = mannequinJoint(0.075);
    shoulder.add(shoulderJoint);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.36, 4, 6), mannequinMat);
    upper.position.y = -0.2;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.38;
    shoulder.add(elbow);
    const elbowJoint = mannequinJoint(0.06);
    elbow.add(elbowJoint);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.34, 4, 6), mannequinMat);
    fore.position.y = -0.18;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 6), mannequinMat);
    hand.position.y = -0.37;
    elbow.add(hand);
    armPivots.push(shoulder);
    elbowPivots.push(elbow);
  }

  const legPivots = [], kneePivots = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0.6, 0);
    g.add(hip);
    const hipJoint = mannequinJoint(0.08);
    hip.add(hipJoint);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.4, 4, 6), mannequinMat);
    thigh.position.y = -0.22;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);
    const kneeJoint = mannequinJoint(0.065);
    knee.add(kneeJoint);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.38, 4, 6), mannequinMat);
    shin.position.y = -0.2;
    knee.add(shin);
    legPivots.push(hip);
    kneePivots.push(knee);
  }

  g.userData.armPivots = armPivots;
  g.userData.elbowPivots = elbowPivots;
  g.userData.legPivots = legPivots;
  g.userData.kneePivots = kneePivots;
  g.userData.head = head;
  g.userData.torso = torso;
  g.userData.grabPoint = { y: 1.6 }; // head/neck height -- where the kill animation "grabs"
  return g;
}
const MANNEQUIN_SEE_RANGE = 16;
const MANNEQUIN_SEE_COS = 0.86;
const MANNEQUIN_CREEP_SPEED = RUN_SPEED * 1.15;
const MANNEQUIN_CATCH_R = 1.0;

const mannequinCell = pickPropCell(usedCells);
usedCells.push(mannequinCell);
const mannequin = spawnMonster(createMannequinModel, mannequinCell.cx, mannequinCell.cz);
mannequin.discovered = false;
let mannequinRetarget = 0;

function tickMannequin(dt, playerPos, camForward) {
  const dirToM = new THREE.Vector3(mannequin.pos.x - playerPos.x, 0, mannequin.pos.z - playerPos.z);
  const dist = dirToM.length();
  const lookedAt = dist < MANNEQUIN_SEE_RANGE && dist > 0.01 &&
    camForward.dot(dirToM.clone().normalize()) > MANNEQUIN_SEE_COS;

  let creeping = false;
  if (lookedAt) {
    mannequin.discovered = true;
  } else if (mannequin.discovered) {
    const pc = cellOf(playerPos.x, playerPos.z);
    mannequinRetarget -= dt;
    if (mannequinRetarget <= 0 || !mannequin.waypoints || mannequin.wpIndex >= mannequin.waypoints.length) {
      setMonsterPath(mannequin, pc.cx, pc.cz);
      mannequinRetarget = 0.6;
    }
    const arrived = tickMonsterMove(mannequin, dt, MANNEQUIN_CREEP_SPEED);
    creeping = !arrived;
  }
  mannequin.group.position.set(mannequin.pos.x, 0, mannequin.pos.z);
  mannequin.group.rotation.y = mannequin.facing;
  animateWalkCycle(mannequin, dt, creeping, creeping);
  const dist2 = Math.hypot(playerPos.x - mannequin.pos.x, playerPos.z - mannequin.pos.z);
  return { dist: dist2, danger: mannequin.discovered ? Math.max(0, 1 - dist2 / 12) : 0, catchR: MANNEQUIN_CATCH_R, type: 'mannequin', instance: mannequin };
}

/* ---------------- The Mimitor: a rubber duck, until it isn't ---------------- */
/* Lives in the Pool Rooms, not the maze -- it always knows roughly where
 * the player is and creeps toward them from anywhere down there, slow and
 * harmless-looking, until they're close enough for it to "grow": long
 * black limbs and a long distorted-faced neck scale up out of its own
 * duck body (see applyMimitorGrow -- one wrapper group, grownGroup,
 * anchored at the duck's own center, scaled as a whole rather than each
 * limb animated into place separately), and from then on it closes the
 * rest of the distance fast. */

const duckMat = new THREE.MeshStandardMaterial({ color: 0xe8c91a, roughness: 0.5 });
const duckBeakMat = new THREE.MeshStandardMaterial({ color: 0xcf7a1a, roughness: 0.6 });
const mimitorLimbMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.7 });
const distortedMat = new THREE.MeshStandardMaterial({ color: 0x140d10, roughness: 0.8 });
const mimitorEyeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 });

function createMimitorModel(startGrown) {
  const g = new THREE.Group();

  const duckGroup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), duckMat);
  body.scale.set(1, 0.85, 1.25);
  body.position.y = 0.22;
  duckGroup.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), duckMat);
  head.position.set(0, 0.42, 0.16);
  duckGroup.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 6), duckBeakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.4, 0.3);
  duckGroup.add(beak);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), duckMat);
    wing.scale.set(0.6, 1, 1.2);
    wing.position.set(side * 0.2, 0.25, -0.02);
    duckGroup.add(wing);
  }
  g.add(duckGroup);

  // Everything that "grows" lives in one wrapper group anchored at the
  // duck's own body height -- scaling this single group is what sells
  // "grows... arms and legs and a long neck" as one continuous thing
  // rather than several separately-animated parts.
  const grown = new THREE.Group();
  grown.position.y = 0.22;
  g.add(grown);

  const armPivots = [], elbowPivots = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.2, 0.1, 0);
    grown.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.42, 4, 6), mimitorLimbMat);
    upper.position.y = -0.22;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.44;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.38, 4, 6), mimitorLimbMat);
    fore.position.y = -0.2;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), mimitorLimbMat);
    hand.position.y = -0.4;
    elbow.add(hand);
    armPivots.push(shoulder);
    elbowPivots.push(elbow);
  }

  const legPivots = [], kneePivots = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, -0.05, 0);
    grown.add(hip);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 4, 6), mimitorLimbMat);
    thigh.position.y = -0.21;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.4, 4, 6), mimitorLimbMat);
    shin.position.y = -0.21;
    knee.add(shin);
    legPivots.push(hip);
    kneePivots.push(knee);
  }

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.75, 4, 6), mimitorLimbMat);
  neck.position.set(0, 0.68, 0.05);
  grown.add(neck);
  const faceGroup = new THREE.Group();
  faceGroup.position.set(0, 1.08, 0.05);
  grown.add(faceGroup);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), distortedMat);
  skull.scale.set(1, 1.2, 0.85);
  faceGroup.add(skull);
  // Distorted -- deliberately asymmetric eyes and a crooked mouth rather
  // than a clean, centered face.
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mimitorEyeMat);
  eyeL.position.set(-0.08, 0.02, 0.13);
  faceGroup.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mimitorEyeMat);
  eyeR.position.set(0.07, -0.03, 0.14);
  faceGroup.add(eyeR);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), distortedMat);
  mouth.position.set(0.01, -0.1, 0.15);
  mouth.rotation.z = 0.3;
  faceGroup.add(mouth);

  grown.scale.setScalar(startGrown ? 1 : 0.001);

  g.userData.armPivots = armPivots;
  g.userData.elbowPivots = elbowPivots;
  g.userData.legPivots = legPivots;
  g.userData.kneePivots = kneePivots;
  g.userData.torso = null;
  g.userData.grownGroup = grown;
  g.userData.duckBody = body;
  g.userData.grabPoint = { y: 0.9 };
  return g;
}
const MIMITOR_FOLLOW_SPEED = RUN_SPEED * 0.28;
const MIMITOR_CHASE_SPEED = RUN_SPEED * 1.1;
const MIMITOR_TRANSFORM_R = 7;
const MIMITOR_CATCH_R = 1.0;

const mimitor = {
  group: createMimitorModel(false), pos: new THREE.Vector3(mimitorSpawnPos.x, 0, mimitorSpawnPos.z),
  facing: 0, growAmp: 0, transformed: false,
};
scene.add(mimitor.group);

function applyMimitorGrow(m, dt) {
  const target = m.transformed ? 1 : 0;
  m.growAmp += (target - m.growAmp) * Math.min(1, dt * 2.2);
  m.group.userData.grownGroup.scale.setScalar(Math.max(0.001, m.growAmp));
  // The duck body itself lifts as the legs grow in underneath it.
  m.group.userData.duckBody.position.y = 0.22 + m.growAmp * 0.55;
}

function tickMimitor(dt, playerPos) {
  const dx = playerPos.x - mimitor.pos.x, dz = playerPos.z - mimitor.pos.z;
  const dist = Math.hypot(dx, dz);
  mimitor.transformed = dist < MIMITOR_TRANSFORM_R;
  const speed = mimitor.transformed ? MIMITOR_CHASE_SPEED : MIMITOR_FOLLOW_SPEED;
  let moving = false;
  if (dist > 0.3) {
    const nx = dx / dist, nz = dz / dist;
    const stepX = mimitor.pos.x + nx * speed * dt;
    if (!collidesAt(stepX, mimitor.pos.z, false)) mimitor.pos.x = stepX;
    const stepZ = mimitor.pos.z + nz * speed * dt;
    if (!collidesAt(mimitor.pos.x, stepZ, false)) mimitor.pos.z = stepZ;
    if (mimitor.facing === undefined) mimitor.facing = Math.atan2(nx, nz);
    mimitor.facing = lerpAngle(mimitor.facing, Math.atan2(nx, nz), Math.min(1, dt * 5));
    moving = true;
  }
  applyMimitorGrow(mimitor, dt);
  mimitor.group.position.set(mimitor.pos.x, 0, mimitor.pos.z);
  mimitor.group.rotation.y = mimitor.facing || 0;
  animateWalkCycle(mimitor, dt, moving && mimitor.transformed, mimitor.transformed);
  return { dist, danger: mimitor.transformed ? Math.max(0, 1 - dist / 10) : 0, catchR: MIMITOR_CATCH_R, type: 'mimitor', instance: mimitor };
}

/* ---------------- game state ---------------- */

const vignette = document.getElementById('dread-vignette');
const jumpscareEl = document.getElementById('jumpscare-flash');
const interactHint = document.getElementById('interact-hint');

let velocity = new THREE.Vector3(0, 0, 0);
let onGround = true;
let crouching = false;

function resetAfterCatch(awayFromPos) {
  const spot = pickRespawn(awayFromPos);
  camera.position.set(spot.x, (crouching ? CROUCH_EYE_H : EYE_H), spot.z);
  velocity.set(0, 0, 0);
  onGround = true;
  const bc = cellCenter(bacteriaCell.cx, bacteriaCell.cz);
  bacteria.pos.set(bc.x, 0, bc.z); bacteria.cx = bacteriaCell.cx; bacteria.cz = bacteriaCell.cz;
  bacteria.alert = false; bacteria.alertTimer = 0; bacteria.waypoints = null;
  // The Mannequin is deliberately NOT sent back to its spawn point here,
  // and its own .discovered flag was already never reset either -- once
  // it's active, dying doesn't give you a clean break from it. It just
  // keeps existing wherever it already was, and immediately re-paths
  // toward your new position (mannequinRetarget forced to 0, instead of
  // waiting up to its own 0.6s refresh) so it's visibly still coming.
  mannequin.waypoints = null;
  mannequinRetarget = 0;
  // The Mimitor isn't tied to the catcher's own position the way the
  // other two are reset relative to it -- it just goes back to its own
  // spot in the Pool Rooms, ungrown, same as the Bacteria's clean reset.
  mimitor.pos.set(mimitorSpawnPos.x, 0, mimitorSpawnPos.z);
  mimitor.transformed = false;
  mimitor.growAmp = 0;
}

const monstersByType = { bacteria, mannequin, mimitor };
// Longer than a generic shake needs, since each one is now a real few-
// beat sequence (see updateScareCamera) -- Mannequin's "grab, lift, snap,
// drop" and Bacteria's "entangle, yank, release" both need the room to
// actually read as those beats rather than one blurred jolt.
const SCARE_DURATION = { bacteria: 1.0, mannequin: 1.3, mimitor: 1.1 };
let scareActive = false;
let scareType = null;
let scareInstance = null;
let scareStart = 0;
let scareCamBase = new THREE.Vector3();
let scareCamDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function triggerJumpscare(type, instance) {
  if (scareActive) return;
  scareActive = true;
  scareType = type;
  scareStart = performance.now();
  markDied(type);
  const m = instance || monstersByType[type];
  scareInstance = m;

  scareCamBase.copy(camera.position);
  scareCamDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const facePos = scareCamBase.clone().addScaledVector(scareCamDir, 0.85);
  m.group.position.copy(facePos);
  m.group.lookAt(scareCamBase);
  // Neutral pose going in -- the per-type animation below poses limbs
  // itself from here, so a leftover walk-cycle angle doesn't bleed in.
  const ud = m.group.userData;
  for (const list of [ud.armPivots, ud.elbowPivots, ud.legPivots, ud.kneePivots]) {
    if (!list) continue;
    for (const piv of list) { piv.rotation.set(0, 0, 0); }
  }

  playScare(type);
  jumpscareEl.className = '';
  void jumpscareEl.offsetWidth;
  jumpscareEl.classList.add('show', 'scare-' + type);

  const duration = SCARE_DURATION[type] || 0.6;
  const catcherPos = { x: facePos.x, z: facePos.z };
  setTimeout(() => {
    jumpscareEl.classList.remove('show', 'scare-' + type);
    scareActive = false;
    resetAfterCatch(catcherPos);
  }, duration * 1000);
}

// Smoothstep -- eases a phase's own local progress in AND out, so
// consecutive phases meet at matching velocity (effectively 0) as well
// as matching position, instead of just matching position and leaving a
// sudden change of speed at the seam. That mismatch was the main thing
// making the previous (linear-per-phase) version read as jerky rather
// than smooth.
function ease(t) { return t * t * (3 - 2 * t); }

function updateScareCamera(p) {
  const shake = (amt) => (Math.random() - 0.5) * amt;
  const ud = scareInstance ? scareInstance.group.userData : null;

  if (scareType === 'mannequin') {
    // Grab (arms raise toward you) -> lift straight up -> a violent
    // multi-axis snap-shake (the neck snap), building in rather than
    // starting at full intensity -> a drop back down that eases out
    // instead of stopping dead. Camera position only, never rotation --
    // see the note on that further down, by applyLookDelta.
    if (p < 0.2) {
      const t = ease(p / 0.2);
      if (ud && ud.armPivots) { ud.armPivots[0].rotation.x = -t * 2.1; ud.armPivots[1].rotation.x = -t * 2.1; }
      camera.position.copy(scareCamBase).addScaledVector(scareCamDir, t * 0.15);
    } else if (p < 0.45) {
      const t = ease((p - 0.2) / 0.25);
      camera.position.copy(scareCamBase).addScaledVector(UP, t * 1.3).addScaledVector(scareCamDir, 0.15);
    } else if (p < 0.72) {
      const t = (p - 0.45) / 0.27;
      const amt = 0.32 * Math.sin(Math.min(t, 1) * Math.PI); // ramps in and back out across the hold, not a flat jitter the whole time
      camera.position.copy(scareCamBase).addScaledVector(UP, 1.3).addScaledVector(scareCamDir, 0.15);
      camera.position.x += shake(amt); camera.position.y += shake(amt); camera.position.z += shake(amt);
    } else {
      const t = ease((p - 0.72) / 0.28);
      camera.position.copy(scareCamBase).addScaledVector(UP, 1.3 * (1 - t)).addScaledVector(scareCamDir, 0.15 * (1 - t));
      camera.position.x += shake(0.06 * (1 - t));
    }
  } else if (scareType === 'bacteria') {
    // It leaps onto you (limbs splaying wide, a hard forward-and-down
    // lurch as the weight lands) -> one sharp head-slam impact (a single
    // ramped shake burst, not a held jitter) -> everything goes black and
    // holds (the CSS flash itself handles the hold; the camera just
    // settles into the post-impact position rather than resetting).
    const settlePos = scareCamBase.clone().addScaledVector(scareCamDir, 0.2).addScaledVector(UP, -0.25);
    if (p < 0.35) {
      const t = ease(p / 0.35);
      if (ud && ud.armPivots) {
        ud.armPivots[0].rotation.z = t * 2.0; ud.armPivots[1].rotation.z = -t * 2.0;
        ud.legPivots[0].rotation.z = t * 1.1; ud.legPivots[1].rotation.z = -t * 1.1;
      }
      camera.position.copy(scareCamBase).lerp(settlePos, t);
      camera.position.x += shake(0.05 * t); camera.position.y += shake(0.05 * t);
    } else if (p < 0.55) {
      const t = (p - 0.35) / 0.2;
      const impact = Math.sin(Math.min(t, 1) * Math.PI); // one hit: ramps up then back down within this phase alone
      camera.position.copy(settlePos);
      camera.position.x += shake(0.4 * impact); camera.position.y += shake(0.4 * impact); camera.position.z += shake(0.2 * impact);
    } else {
      camera.position.copy(settlePos);
    }
  } else if (scareType === 'mimitor') {
    // The long distorted neck lunges straight into frame (not a grab --
    // it has no reach yet at this distance, just the one long thing it
    // grew) -> a short, violent juddering hold as the face fills the
    // screen -> everything goes black and stays there, same "it goes
    // black" ending shape as the Bacteria's.
    const closePos = scareCamBase.clone().addScaledVector(scareCamDir, 0.4);
    if (p < 0.3) {
      const t = ease(p / 0.3);
      camera.position.copy(scareCamBase).lerp(closePos, t);
    } else if (p < 0.6) {
      const t = (p - 0.3) / 0.3;
      const amt = 0.3 * Math.sin(Math.min(t, 1) * Math.PI);
      camera.position.copy(closePos);
      camera.position.x += shake(amt); camera.position.y += shake(amt); camera.position.z += shake(amt * 0.5);
    } else {
      camera.position.copy(closePos);
    }
  } else {
    camera.position.copy(scareCamBase);
    camera.position.x += shake(0.05);
    camera.position.y += shake(0.05);
  }
}

/* ---------------- "you fell" (pit room) ---------------- */

let falling = false;
function handleFall() {
  if (falling) return;
  falling = true;
  jumpscareEl.className = '';
  void jumpscareEl.offsetWidth;
  jumpscareEl.classList.add('show', 'scare-fell');
  playFellSting();
  setTimeout(() => {
    jumpscareEl.classList.remove('show', 'scare-fell');
    const spot = pickRespawn(null);
    camera.position.set(spot.x, EYE_H, spot.z);
    velocity.set(0, 0, 0);
    onGround = true;
    falling = false;
  }, 500);
}

/* ---------------- audio ---------------- */

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

function playShutter() {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  noise.connect(g).connect(ctx.destination);
  noise.start(now);
}

function playFellSting() {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  osc.connect(g).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.45);
}

// A low, droning electrical hum -- The Bacteria's own warning, same
// "audible before it's alert" idea the old game used, swapped for a
// wire-creature-appropriate sound (a buzzing, unstable drone instead of
// a melody).
let bacteriaHumGain = null;
function updateBacteriaHum(dist) {
  const ctx = audioCtx;
  if (!ctx) return;
  if (!bacteriaHumGain) {
    bacteriaHumGain = ctx.createGain();
    bacteriaHumGain.gain.value = 0;
    bacteriaHumGain.connect(ctx.destination);
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth'; osc1.frequency.value = 60;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square'; osc2.frequency.value = 63;
    osc1.connect(bacteriaHumGain); osc2.connect(bacteriaHumGain);
    osc1.start(); osc2.start();
  }
  const target = Math.max(0, 1 - dist / 22) * 0.18;
  bacteriaHumGain.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
}

function playScare(type) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  if (type === 'bacteria') {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.85, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.55);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const ng = ctx.createGain(); ng.gain.value = 0.4;
    noise.connect(ng).connect(master);
    noise.start(now);
  } else if (type === 'mannequin') {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(50, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.8, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.6);
  } else if (type === 'mimitor') {
    // A toy-squeak pitch-bent down into something wrong, under the same
    // short noise burst the others use for the actual impact.
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.7, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.5);
  }
}

/* ---------------- player controller ---------------- */

const blocker = document.getElementById('blocker');
let customizeOpen = false;

function isLocked() { return document.pointerLockElement === renderer.domElement; }

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
  if (now - lastLockAttempt < 400) return;
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
  if (isLocked()) { blocker.style.display = 'none'; relockHint.classList.remove('show'); }
  else if (!fallbackLook && !customizeOpen) { blocker.style.display = 'flex'; }
});
document.addEventListener('pointerlockerror', () => { enterFallbackLook(); });

/* ---------------- computer panel: Appearance + Catalog ---------------- */

const customizePanel = document.getElementById('customize-panel');
const hueSlider = document.getElementById('customize-hue');
const nameInput = document.getElementById('customize-name');
const customizeDoneBtn = document.getElementById('customize-done');
const nameTag = document.getElementById('player-name-tag');

let playerHue = null;
let playerName = '';
try {
  const savedHue = localStorage.getItem('subliminal_hue');
  const savedName = localStorage.getItem('subliminal_name');
  if (savedHue !== null) playerHue = parseFloat(savedHue);
  if (savedName) playerName = savedName;
} catch (err) { /* localStorage unavailable -- just use defaults */ }
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
nameInput.addEventListener('input', () => { playerName = nameInput.value.slice(0, 16); });
customizeDoneBtn.addEventListener('click', () => {
  try {
    localStorage.setItem('subliminal_hue', String(playerHue !== null ? playerHue : 0));
    localStorage.setItem('subliminal_name', playerName);
  } catch (err) { /* ignore */ }
  nameTag.textContent = playerName || '';
  closeCustomizePanel();
});

const tabButtons = document.querySelectorAll('.customize-tab');
const customizePages = document.querySelectorAll('.customize-page');
function showCustomizeTab(name) {
  tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === name));
  customizePages.forEach((page) => { page.hidden = page.dataset.page !== name; });
}
tabButtons.forEach((btn) => btn.addEventListener('click', () => {
  showCustomizeTab(btn.dataset.tab);
  if (btn.dataset.tab === 'bestiary') showCatalogEntry(catalogIndex);
}));

// Photographed artifacts + died-to monsters, both gate the same catalog --
// an artifact unlocks the instant it's photographed, a monster unlocks
// the instant it catches you once.
const PHOTOGRAPHED_KEY = 'subliminal_photographed';
const DIED_KEY = 'subliminal_died';
let photographed = new Set();
let died = new Set();
try {
  const p = localStorage.getItem(PHOTOGRAPHED_KEY); if (p) photographed = new Set(JSON.parse(p));
  const d = localStorage.getItem(DIED_KEY); if (d) died = new Set(JSON.parse(d));
} catch (err) { /* ignore */ }
function markPhotographed(id) {
  if (photographed.has(id)) return;
  photographed.add(id);
  try { localStorage.setItem(PHOTOGRAPHED_KEY, JSON.stringify([...photographed])); } catch (err) { /* ignore */ }
}
function markDied(type) {
  if (died.has(type)) return;
  died.add(type);
  try { localStorage.setItem(DIED_KEY, JSON.stringify([...died])); } catch (err) { /* ignore */ }
}

// Artifact previews are built by makeArtifactPreview(id) (below) rather
// than a per-entry `make`, since two of them (the chair, the house) need
// to match the real in-world object and the third (the red room) isn't a
// portable object at all -- only the two monster entries carry a real
// `make`, reusing the exact factories their in-world instances use.
const catalogFlat = [
  { kind: 'artifact', id: 'chair', name: 'Glitched Chair' },
  { kind: 'artifact', id: 'redroom', name: 'The Red Room' },
  { kind: 'artifact', id: 'house', name: 'House in the Wall' },
  { kind: 'artifact', id: 'staircase', name: 'Tilted Staircase' },
  { kind: 'artifact', id: 'pool', name: 'The Kiddie Pool' },
  { kind: 'monster', id: 'bacteria', name: 'The Bacteria', make: createBacteriaModel },
  { kind: 'monster', id: 'mannequin', name: 'The Mannequin', make: createMannequinModel },
  { kind: 'monster', id: 'mimitor', name: 'The Mimitor', make: () => createMimitorModel(true) },
];
const catalogModelCache = new Array(catalogFlat.length).fill(null);
let catalogIndex = 0;
let catalogScene = null, catalogCamera = null, catalogRenderer = null, catalogCurrent = null;
let catalogLockedPlaceholder = null;

function makeCatalogLockedPlaceholder() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 7), mat);
  body.scale.set(1, 1.3, 0.9);
  body.position.y = 0.4;
  g.add(body);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c0392b';
  ctx.font = '900 96px "Segoe UI", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(0.8, 0.8, 1);
  sprite.position.set(0, 0.6, 0.3);
  g.add(sprite);
  return g;
}
function ensureCatalogRenderer() {
  if (catalogRenderer) return;
  const canvas = document.getElementById('bestiary-canvas');
  catalogScene = new THREE.Scene();
  catalogScene.background = new THREE.Color(0x14110a);
  catalogCamera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 100);
  catalogRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  catalogRenderer.setSize(canvas.width, canvas.height, false);
  catalogScene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(2, 3, 4);
  catalogScene.add(key);
}
// The two "physical" artifacts (chair, house) get their own real model
// built fresh for the catalog preview; the sealed red room isn't a
// portable object, so it gets a stand-in (a glowing red sphere) instead.
function makeArtifactPreview(id) {
  if (id === 'chair') {
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.8 });
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), seatMat);
    seat.position.set(0, 0.45, 0);
    chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.08), seatMat);
    back.position.set(0, 0.75, -0.21);
    chair.add(back);
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), seatMat);
      leg.position.set(lx, 0.22, lz);
      chair.add(leg);
    }
    return chair;
  }
  if (id === 'house') {
    const g = new THREE.Group();
    const houseMat = new THREE.MeshStandardMaterial({ color: 0xcf8f4a, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b2f2a, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), houseMat);
    body.position.y = 0.3;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.5, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 0.85;
    g.add(roof);
    return g;
  }
  if (id === 'staircase') {
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.85 });
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), stepMat);
      step.position.set(0, 0.15 + i * 0.32, -i * 0.42);
      g.add(step);
    }
    g.rotation.set(0.25, 0, 0.15);
    return g;
  }
  if (id === 'pool') {
    const g = new THREE.Group();
    const kiddieMat = new THREE.MeshStandardMaterial({ color: 0xe0455a, roughness: 0.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 8, 16), kiddieMat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x2a6fa0, roughness: 0.15, transparent: true, opacity: 0.85 }));
    water.position.y = -0.03;
    g.add(water);
    return g;
  }
  const g = new THREE.Group();
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x3a0505, emissive: 0xbb1111, emissiveIntensity: 1.8 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), bulbMat);
  g.add(bulb);
  return g;
}
function showCatalogEntry(i) {
  ensureCatalogRenderer();
  catalogIndex = ((i % catalogFlat.length) + catalogFlat.length) % catalogFlat.length;
  const entry = catalogFlat[catalogIndex];
  const unlocked = entry.kind === 'artifact' ? photographed.has(entry.id) : died.has(entry.id);

  if (catalogCurrent) catalogScene.remove(catalogCurrent);
  if (unlocked) {
    if (!catalogModelCache[catalogIndex]) {
      catalogModelCache[catalogIndex] = entry.kind === 'artifact' ? makeArtifactPreview(entry.id) : entry.make();
    }
    catalogCurrent = catalogModelCache[catalogIndex];
  } else {
    if (!catalogLockedPlaceholder) catalogLockedPlaceholder = makeCatalogLockedPlaceholder();
    catalogCurrent = catalogLockedPlaceholder;
  }
  catalogScene.add(catalogCurrent);

  const box = new THREE.Box3().setFromObject(catalogCurrent);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.3);
  catalogCamera.position.set(center.x, center.y + radius * 0.15, center.z + radius * 1.7);
  catalogCamera.lookAt(center);

  document.getElementById('bestiary-zone').textContent = entry.kind === 'artifact' ? 'ARTIFACT' : 'ENTITY';
  document.getElementById('bestiary-name').textContent = unlocked ? entry.name : '???';
  document.getElementById('bestiary-count').textContent = (catalogIndex + 1) + ' / ' + catalogFlat.length;
}
function tickCatalogViewer(dt) {
  if (!catalogRenderer || document.querySelector('.customize-page[data-page="bestiary"]').hidden) return;
  if (catalogCurrent) catalogCurrent.rotation.y += dt * 0.6;
  catalogRenderer.render(catalogScene, catalogCamera);
}
document.getElementById('bestiary-prev').addEventListener('click', () => showCatalogEntry(catalogIndex - 1));
document.getElementById('bestiary-next').addEventListener('click', () => showCatalogEntry(catalogIndex + 1));

// The camera is equipped/unequipped (R), not always out -- the
// viewfinder and the VHS look (see css/style.css .vhs-on / #vhs-overlay)
// both ride on this one flag, and a shutter click only does anything
// while it's true.
let cameraEquipped = false;
const viewfinderEl = document.getElementById('viewfinder');
const vhsOverlayEl = document.getElementById('vhs-overlay');
const vhsTimestampEl = document.getElementById('vhs-timestamp');
function setCameraEquipped(on) {
  cameraEquipped = on;
  viewfinderEl.classList.toggle('show', on);
  vhsOverlayEl.classList.toggle('show', on);
  renderer.domElement.classList.toggle('vhs-on', on);
}
// A "recording length" counter, not the wall clock -- only runs while
// the camera's actually equipped, ticking once a second rather than every
// render frame since a DOM text write doesn't need to keep up with 60fps.
let vhsSeconds = 0;
setInterval(() => {
  if (!cameraEquipped) return;
  vhsSeconds++;
  const h = String(Math.floor(vhsSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((vhsSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(vhsSeconds % 60).padStart(2, '0');
  vhsTimestampEl.textContent = h + ':' + m + ':' + s;
}, 1000);

renderer.domElement.addEventListener('mousedown', (e) => {
  if (fallbackLook) dragging = true;
  if (isLocked() && !customizeOpen && cameraEquipped) takePhoto();
});
window.addEventListener('mouseup', () => { dragging = false; });
document.addEventListener('mousemove', (e) => {
  // No look control during the kill animation -- on request -- same
  // reason scareActive already gates movePlayer in animate() below.
  if (scareActive) return;
  if (isLocked() || (fallbackLook && dragging)) applyLookDelta(e.movementX, e.movementY);
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && customizeOpen) { closeCustomizePanel(); return; }
  if (e.code === 'Escape' && fallbackLook) { fallbackLook = false; blocker.style.display = 'flex'; }
  if (customizeOpen) return;
  if (e.code === 'KeyE' && camera.position.distanceTo(keyboardCenter) < 3.2) openCustomizePanel();
  if (e.code === 'KeyC') crouching = !crouching;
  if (e.code === 'KeyR') setCameraEquipped(!cameraEquipped);
});

const keys = { w: false, a: false, s: false, d: false, shift: false };
document.addEventListener('keydown', (e) => {
  if (customizeOpen) return;
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.w = true; break;
    case 'KeyS': case 'ArrowDown': keys.s = true; break;
    case 'KeyA': case 'ArrowLeft': keys.a = true; break;
    case 'KeyD': case 'ArrowRight': keys.d = true; break;
    case 'ShiftLeft': case 'ShiftRight': keys.shift = true; break;
    case 'Space':
      if (onGround && !crouching) { velocity.y = JUMP_V; onGround = false; }
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

/* ---------------- the camera: taking photos of artifacts ---------------- */

function takePhoto() {
  playShutter();
  const flash = document.getElementById('camera-flash');
  flash.classList.remove('show'); void flash.offsetWidth; flash.classList.add('show');
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  for (const art of ARTIFACTS) {
    const dir = new THREE.Vector3(art.pos.x - camera.position.x, 0, art.pos.z - camera.position.z);
    const dist = dir.length();
    if (dist > PHOTO_RANGE) continue;
    dir.normalize();
    if (forward.dot(dir) > PHOTO_COS) markPhotographed(art.id);
  }
}

/* ---------------- movement ---------------- */

function supportHeight(x, z) {
  if (x > PIT_CELL._minX && x < PIT_CELL._maxX && z > PIT_CELL._minZ && z < PIT_CELL._maxZ) {
    // Inside the pit room's own footprint -- check whether this exact spot
    // still has a floor slab under it via the registered pit tiles
    // (pitHoles, populated back where the pit room is actually built).
    for (const p of pitHoles) {
      if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return -1000;
    }
  }
  for (const r of ramps) {
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) {
      const t = Math.max(0, Math.min(1, r.axis === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0)));
      return r.yStart + (r.yEnd - r.yStart) * t;
    }
  }
  if (x > POOL_BOUNDS.x0 && x < POOL_BOUNDS.x1 && z > POOL_BOUNDS.z0 && z < POOL_BOUNDS.z1) return POOL_Y;
  return 0;
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
  if (moveDir.lengthSq() > 0.0001) moveDir.normalize();

  let speed = keys.shift && !crouching ? RUN_SPEED : WALK_SPEED;
  if (crouching) speed *= CROUCH_SPEED_MUL;
  const pos = camera.position;

  const nx = pos.x + moveDir.x * speed * dt;
  if (!collidesAt(nx, pos.z, crouching)) pos.x = nx;
  const nz = pos.z + moveDir.z * speed * dt;
  if (!collidesAt(pos.x, nz, crouching)) pos.z = nz;

  if (touchJumpPressed) {
    touchJumpPressed = false;
    if (onGround && !crouching) { velocity.y = JUMP_V; onGround = false; }
  }

  const eyeH = crouching ? CROUCH_EYE_H : EYE_H;
  const supportY = supportHeight(pos.x, pos.z) + eyeH;

  if (!onGround) {
    velocity.y += GRAVITY * dt;
    pos.y += velocity.y * dt;
    if (pos.y <= supportY && supportY > -500) { pos.y = supportY; velocity.y = 0; onGround = true; }
  } else if (supportY < pos.y - 0.2 || supportY < -500) {
    onGround = false;
  } else {
    pos.y = supportY;
  }

  if (pos.y < DEATH_Y) handleFall();
}

/* ---------------- touch controls (mobile) ---------------- */

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const touchMove = { x: 0, y: 0 };
let touchJumpPressed = false;
if (isTouch) {
  document.getElementById('game-root').classList.add('touch-ui');
  const look = document.getElementById('touch-look-zone');
  const stick = document.getElementById('touch-joystick');
  const knob = document.getElementById('touch-joystick-knob');
  const jumpBtn = document.getElementById('touch-jump');
  let lookTouchId = null, lastLookX = 0, lastLookY = 0;
  let stickTouchId = null, stickCenter = { x: 0, y: 0 };
  look.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    lookTouchId = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY;
    fallbackLook = true; blocker.style.display = 'none'; relockHint.classList.remove('show');
  });
  look.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookTouchId) continue;
      applyLookDelta((t.clientX - lastLookX) * 2.2, (t.clientY - lastLookY) * 2.2);
      lastLookX = t.clientX; lastLookY = t.clientY;
    }
  });
  look.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookTouchId) lookTouchId = null;
  });
  stick.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    stickTouchId = t.identifier;
    const r = stick.getBoundingClientRect();
    stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  stick.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickTouchId) continue;
      let dx = t.clientX - stickCenter.x, dy = t.clientY - stickCenter.y;
      const len = Math.hypot(dx, dy), max = 42;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      touchMove.x = dx / max; touchMove.y = dy / max;
    }
  });
  stick.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickTouchId) continue;
      stickTouchId = null; touchMove.x = 0; touchMove.y = 0;
      knob.style.transform = 'translate(0,0)';
    }
  });
  jumpBtn.addEventListener('touchstart', () => { touchJumpPressed = true; });
}

/* ---------------- main loop ---------------- */

let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (customizeOpen) tickCatalogViewer(dt);

  // Culling, not just dimming: with ~80 rooms each holding their own
  // PointLight, leaving every one of them permanently in the scene meant
  // every fragment the GPU ever shaded was paying for ~80 lights' worth
  // of per-pixel lighting math regardless of how many were actually
  // nearby -- the single biggest cost in the whole scene by far, and the
  // actual cause of the lag. A light more than ~1.6 rooms away is set
  // invisible outright (excluded from the renderer's active-light list
  // for the frame, not just zeroed), so only the handful of rooms around
  // the player are ever actually lit at once.
  const CULL_R2 = (CELL * 1.6) * (CELL * 1.6);
  for (const cl of cellLights) {
    const dx = cl.light.position.x - camera.position.x, dz = cl.light.position.z - camera.position.z;
    const near = dx * dx + dz * dz < CULL_R2;
    cl.light.visible = near;
    if (!near) continue;
    let t = cl.base * (0.85 + 0.15 * Math.sin(now * 0.004 + cl.seed));
    if (cl.broken && Math.sin(now * 0.0017 + cl.seed * 3) > 0.985) t *= 0.15;
    cl.light.intensity = t;
  }
  if (redBulbMesh) redBulbMesh.material.emissiveIntensity = 1.2 + Math.sin(now * 0.006) * 0.4;

  if (scareActive) {
    const t = (now - scareStart) / 1000;
    const duration = SCARE_DURATION[scareType] || 0.6;
    updateScareCamera(Math.min(t / duration, 1));
  } else if ((isLocked() || fallbackLook) && !customizeOpen) {
    movePlayer(dt);

    const nearKeyboard = camera.position.distanceTo(keyboardCenter) < 3.2;
    if (nearKeyboard) { interactHint.textContent = 'Press E to use the computer'; interactHint.classList.add('show'); }
    else interactHint.classList.remove('show');

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const results = [
      tickBacteria(dt, camera.position),
      tickMannequin(dt, camera.position, forward),
      tickMimitor(dt, camera.position),
    ];
    updateBacteriaHum(results[0].dist);
    const danger = Math.max(...results.map((r) => r.danger));
    vignette.style.opacity = String(danger);
    const caught = results.find((r) => r.dist < r.catchR);
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
