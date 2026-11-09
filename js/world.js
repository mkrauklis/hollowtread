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
scene.fog = new THREE.FogExp2(0x2a2410, 0.052); // tight and dingy -- the backrooms never reads as open space

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

scene.add(new THREE.AmbientLight(0x3a331c, 0.55)); // dim, warm, sickly -- "dim lights" was explicit, this is not a fluorescent-bright level
const flashlight = new THREE.SpotLight(0xfff1cf, 6.5, 26, Math.PI / 4.6, 0.55, 1.3);
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

const GRID_N = 7;
const CELL = 16;
const WALL_T = 0.4;
const WALL_H = 3.4;
const DOOR_HALF = 1.5;
const CRAWL_HALF = 0.85;
const CRAWL_H = 1.15; // visual header height over a crawlspace gap -- the actual collision rule is just "crouching or not", this just makes that legible

function boundaryX(ex) { return (ex - GRID_N / 2) * CELL; }
function boundaryZ(ez) { return (ez - GRID_N / 2) * CELL; }
function cellCenter(cx, cz) { return { x: (boundaryX(cx) + boundaryX(cx + 1)) / 2, z: (boundaryZ(cz) + boundaryZ(cz + 1)) / 2 }; }
function edgeKeyX(cx, cz) { return 'x,' + cx + ',' + cz; } // edge between (cx,cz) and (cx+1,cz)
function edgeKeyZ(cx, cz) { return 'z,' + cx + ',' + cz; } // edge between (cx,cz) and (cx,cz+1)

// A randomized-DFS spanning tree first (guarantees every room reachable
// from every other), then a handful of extra connections knocked through
// on top of it so the result isn't one single corridor with no loops --
// real backrooms exploration doubles back on itself constantly.
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
    if (cx + 1 < GRID_N) { const k = edgeKeyX(cx, cz); if (!openEdges.has(k) && rand() < 0.14) openEdges.add(k); }
    if (cz + 1 < GRID_N) { const k = edgeKeyZ(cx, cz); if (!openEdges.has(k) && rand() < 0.14) openEdges.add(k); }
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
function edgeWallX(wx, wz0, wz1, kind) {
  if (kind === 'solid') { wallBox(wx - WALL_T / 2, wx + WALL_T / 2, wz0, wz1); return; }
  const half = kind === 'crawl' ? CRAWL_HALF : DOOR_HALF;
  const midZ = (wz0 + wz1) / 2;
  wallBox(wx - WALL_T / 2, wx + WALL_T / 2, wz0, midZ - half);
  wallBox(wx - WALL_T / 2, wx + WALL_T / 2, midZ + half, wz1);
  if (kind === 'crawl') {
    crawlOnlyBoxes.push(new THREE.Box3(new THREE.Vector3(wx - WALL_T, 0, midZ - half), new THREE.Vector3(wx + WALL_T, WALL_H, midZ + half)));
    const header = new THREE.Mesh(new THREE.BoxGeometry(WALL_T * 2, WALL_H - CRAWL_H, half * 2), trimMat);
    header.position.set(wx, CRAWL_H + (WALL_H - CRAWL_H) / 2, midZ);
    scene.add(header);
  }
}
function edgeWallZ(wz, wx0, wx1, kind) {
  if (kind === 'solid') { wallBox(wx0, wx1, wz - WALL_T / 2, wz + WALL_T / 2); return; }
  const half = kind === 'crawl' ? CRAWL_HALF : DOOR_HALF;
  const midX = (wx0 + wx1) / 2;
  wallBox(wx0, midX - half, wz - WALL_T / 2, wz + WALL_T / 2);
  wallBox(midX + half, wx1, wz - WALL_T / 2, wz + WALL_T / 2);
  if (kind === 'crawl') {
    crawlOnlyBoxes.push(new THREE.Box3(new THREE.Vector3(midX - half, 0, wz - WALL_T), new THREE.Vector3(midX + half, WALL_H, wz + WALL_T)));
    const header = new THREE.Mesh(new THREE.BoxGeometry(half * 2, WALL_H - CRAWL_H, WALL_T * 2), trimMat);
    header.position.set(midX, CRAWL_H + (WALL_H - CRAWL_H) / 2, wz);
    scene.add(header);
  }
}

// The pit room (see buildPitRoom() below) gets no default floor/ceiling --
// everything else does.
const PIT_CELL = { cx: Math.floor(GRID_N / 2), cz: Math.floor(GRID_N / 2) };

function buildCellShell(cx, cz) {
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
    if (ex === 0 || ex === GRID_N) { edgeWallX(boundaryX(ex), wz0, wz1, 'solid'); continue; }
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

// Dim ceiling light fixtures, one per room, each with its own slow
// flicker so the level never looks evenly, comfortably lit.
const cellLights = [];
for (let cx = 0; cx < GRID_N; cx++) for (let cz = 0; cz < GRID_N; cz++) {
  if (cx === PIT_CELL.cx && cz === PIT_CELL.cz) continue; // the pit room has its own lighting below
  const c = cellCenter(cx, cz);
  const fixture = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.1), trimMat);
  fixture.position.set(c.x, WALL_H - 0.1, c.z);
  scene.add(fixture);
  const base = 0.55 + rand() * 0.35;
  const light = new THREE.PointLight(0xd8c27a, base, CELL * 1.05, 2);
  light.position.set(c.x, WALL_H - 0.4, c.z);
  scene.add(light);
  cellLights.push({ light, base, seed: rand() * 1000, broken: rand() < 0.18 });
}

/* ---------------- the pit room: a grid of square floor pits ---------------- */
/* pitHoles records each actual gap's footprint for supportHeight() (way
 * down near movePlayer) to check against -- declared here, right where
 * it's populated, rather than down there where it's merely read. */

const pitHoles = []; // { x0, x1, z0, z1 } -- walk over one of these without clearing it and you fall (DEATH_Y)
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

/* ---------------- dim red room: one of the three photographable things ---------------- */
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
  while (exclude.some((e) => e.cx === cx && e.cz === cz));
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

const ARTIFACTS = [ARTIFACT_CHAIR, ARTIFACT_RED_ROOM, ARTIFACT_HOUSE];
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
function setMonsterPath(m, toCx, toCz) {
  const path = bfsPath(m.cx, m.cz, toCx, toCz);
  m.waypoints = path.map(([cx, cz]) => ({ ...cellCenter(cx, cz), cx, cz }));
  m.wpIndex = 0;
}
// Advances a monster along its current waypoint list; returns true once
// it has arrived (empty/finished path).
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
  m.facing = Math.atan2(nx, nz);
  return false;
}

/* ---------------- The Bacteria: a wire creature ---------------- */
/* Built from thin, chaotically-angled cylinders radiating out of a dense
 * tangled core instead of any solid-surface body -- "made entirely out of
 * wires" was explicit, so there's deliberately no skin/mesh shell at all,
 * just the wires themselves. */

const wireMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.4, metalness: 0.7, emissive: 0x111111 });
const bacteriaEyeMat = new THREE.MeshStandardMaterial({ color: 0x2affd8, emissive: 0x2affd8, emissiveIntensity: 3 });
function createBacteriaModel() {
  const g = new THREE.Group();
  const coreWires = 40;
  for (let i = 0; i < coreWires; i++) {
    const len = 0.3 + rand() * 0.9;
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, len, 4), wireMat);
    wire.position.set((rand() - 0.5) * 0.5, 0.5 + (rand() - 0.5) * 0.9, (rand() - 0.5) * 0.5);
    wire.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    g.add(wire);
  }
  // A tighter inner knot so there's still a visual "center of mass".
  for (let i = 0; i < 16; i++) {
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25 + rand() * 0.2, 4), wireMat);
    wire.position.set((rand() - 0.5) * 0.15, 0.55 + (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.15);
    wire.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    g.add(wire);
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), bacteriaEyeMat);
    eye.position.set(side * 0.12, 0.65, 0.2);
    g.add(eye);
  }
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

  if (bacteria.alert) {
    const pc = cellOf(playerPos.x, playerPos.z);
    bacteriaRoamTimer -= dt;
    if (bacteriaRoamTimer <= 0 || !bacteria.waypoints || bacteria.wpIndex >= bacteria.waypoints.length) {
      setMonsterPath(bacteria, pc.cx, pc.cz);
      bacteriaRoamTimer = 0.5;
    }
    tickMonsterMove(bacteria, dt, BACTERIA_CHASE_SPEED);
  } else {
    bacteriaRoamTimer -= dt;
    if (bacteriaRoamTimer <= 0 || !bacteria.waypoints || bacteria.wpIndex >= bacteria.waypoints.length) {
      const tx = Math.floor(rand() * GRID_N), tz = Math.floor(rand() * GRID_N);
      setMonsterPath(bacteria, tx, tz);
      bacteriaRoamTimer = 4 + rand() * 3;
    }
    tickMonsterMove(bacteria, dt, BACTERIA_ROAM_SPEED);
  }
  bacteria.group.position.set(bacteria.pos.x, 0, bacteria.pos.z);
  bacteria.group.rotation.y = bacteria.facing;
  bacteria.group.rotation.x += dt * 1.5; // the wire tangle itself keeps slowly tumbling, independent of facing
  return { dist, danger: bacteria.alert ? Math.max(0, 1 - dist / 14) : 0, catchR: BACTERIA_CATCH_R, type: 'bacteria', instance: bacteria };
}

/* ---------------- The Mannequin ---------------- */
/* Moves only while the player isn't looking at it, and only once the
 * player has looked at it at least once -- dormant and harmless until
 * that first sighting "activates" it. */

const mannequinMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.55 });
function createMannequinModel() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 8), mannequinMat);
  torso.position.y = 1.0;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 7), mannequinMat);
  head.position.y = 1.62;
  g.add(head); // deliberately featureless -- no eyes, no muzzle, a blank mannequin head
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.75, 4, 6), mannequinMat);
    arm.position.set(side * 0.32, 0.95, 0);
    arm.rotation.z = side * 0.12;
    g.add(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.85, 4, 6), mannequinMat);
    leg.position.set(side * 0.13, 0.05, 0);
    g.add(leg);
  }
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

  if (lookedAt) {
    mannequin.discovered = true;
  } else if (mannequin.discovered) {
    const pc = cellOf(playerPos.x, playerPos.z);
    mannequinRetarget -= dt;
    if (mannequinRetarget <= 0 || !mannequin.waypoints || mannequin.wpIndex >= mannequin.waypoints.length) {
      setMonsterPath(mannequin, pc.cx, pc.cz);
      mannequinRetarget = 0.6;
    }
    tickMonsterMove(mannequin, dt, MANNEQUIN_CREEP_SPEED);
  }
  mannequin.group.position.set(mannequin.pos.x, 0, mannequin.pos.z);
  mannequin.group.rotation.y = mannequin.facing;
  const dist2 = Math.hypot(playerPos.x - mannequin.pos.x, playerPos.z - mannequin.pos.z);
  return { dist: dist2, danger: mannequin.discovered ? Math.max(0, 1 - dist2 / 12) : 0, catchR: MANNEQUIN_CATCH_R, type: 'mannequin', instance: mannequin };
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
  const mc = cellCenter(mannequinCell.cx, mannequinCell.cz);
  mannequin.pos.set(mc.x, 0, mc.z); mannequin.cx = mannequinCell.cx; mannequin.cz = mannequinCell.cz;
  mannequin.waypoints = null;
  // Deliberately NOT resetting mannequin.discovered -- once it's seen you, it stays active.
}

const monstersByType = { bacteria, mannequin };
const SCARE_DURATION = { bacteria: 0.8, mannequin: 0.9 };
let scareActive = false;
let scareType = null;
let scareStart = 0;
let scareCamBase = new THREE.Vector3();
let scareCamDir = new THREE.Vector3();

function triggerJumpscare(type, instance) {
  if (scareActive) return;
  scareActive = true;
  scareType = type;
  scareStart = performance.now();
  markDied(type);
  const m = instance || monstersByType[type];

  scareCamBase.copy(camera.position);
  scareCamDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const facePos = scareCamBase.clone().addScaledVector(scareCamDir, 0.85);
  m.group.position.copy(facePos);
  m.group.lookAt(scareCamBase);

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

function updateScareCamera(p) {
  const shake = (amt) => (Math.random() - 0.5) * amt;
  camera.position.copy(scareCamBase);
  camera.position.x += shake(0.05);
  camera.position.y += shake(0.05);
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
  { kind: 'monster', id: 'bacteria', name: 'The Bacteria', make: createBacteriaModel },
  { kind: 'monster', id: 'mannequin', name: 'The Mannequin', make: createMannequinModel },
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

renderer.domElement.addEventListener('mousedown', (e) => {
  if (fallbackLook) dragging = true;
  if (isLocked() && !customizeOpen) takePhoto();
});
window.addEventListener('mouseup', () => { dragging = false; });
document.addEventListener('mousemove', (e) => {
  if (isLocked() || (fallbackLook && dragging)) applyLookDelta(e.movementX, e.movementY);
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && customizeOpen) { closeCustomizePanel(); return; }
  if (e.code === 'Escape' && fallbackLook) { fallbackLook = false; blocker.style.display = 'flex'; }
  if (customizeOpen) return;
  if (e.code === 'KeyE' && camera.position.distanceTo(keyboardCenter) < 3.2) openCustomizePanel();
  if (e.code === 'KeyC') crouching = !crouching;
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

  for (const cl of cellLights) {
    let t = cl.base * (0.85 + 0.15 * Math.sin(now * 0.004 + cl.seed));
    if (cl.broken && Math.sin(now * 0.0017 + cl.seed * 3) > 0.985) t *= 0.15;
    cl.light.intensity = t;
  }
  if (redBulbMesh) redBulbMesh.material.emissiveIntensity = 1.2 + Math.sin(now * 0.006) * 0.4;

  if (scareActive) {
    const t = (now - scareStart) / 1000;
    updateScareCamera(t);
  } else if ((isLocked() || fallbackLook) && !customizeOpen) {
    movePlayer(dt);

    const nearKeyboard = camera.position.distanceTo(keyboardCenter) < 3.2;
    if (nearKeyboard) { interactHint.textContent = 'Press E to use the computer'; interactHint.classList.add('show'); }
    else interactHint.classList.remove('show');

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const results = [
      tickBacteria(dt, camera.position),
      tickMannequin(dt, camera.position, forward),
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
