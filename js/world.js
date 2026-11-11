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
const CROUCH_SPEED_MUL = 0.7; // "30% slower" while crouching, on request
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
// preserveDrawingBuffer: true -- needed so takePhoto() (below) can read the
// just-rendered frame back out with toDataURL() for the computer's own
// Photos tab; without it the backing buffer can already be cleared by the
// time a click handler gets to read it.
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
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
const flashlight = new THREE.SpotLight(0xfff1cf, 6.5, 28, Math.PI / 4.6, 0.55, 1.3); // dimmer than the first pass, on request
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

  // Cuff, a flattened glove-back palm, four separate two-segment fingers
  // (each with a slight downward curl), and an angled-out thumb -- all
  // children of the sleeve, so they inherit its position/rotation.z
  // automatically. Replaces the previous fused-lobe approximation (a
  // sphere palm plus three plain capsules) on request ("make the hands
  // actually look like hands with gloves") -- a flat box reads as a
  // glove back rather than a ball, and a distinct, side-angled thumb is
  // the one detail that actually sells "hand" over "four sticks on a box."
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 5, 10), gloveMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.19, 0);
  sleeve.add(cuff);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.09), gloveMat);
  palm.position.set(0, -0.28, 0);
  sleeve.add(palm);

  function addFinger(lx, lz, lenScale, curl) {
    const base = new THREE.Group();
    base.position.set(lx, -0.37, lz);
    base.rotation.x = curl;
    const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.09 * lenScale, 3, 5), gloveMat);
    seg1.position.y = -0.045 * lenScale;
    base.add(seg1);
    const tip = new THREE.Group();
    tip.position.y = -0.09 * lenScale;
    tip.rotation.x = 0.35;
    base.add(tip);
    const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.06 * lenScale, 3, 5), gloveMat);
    seg2.position.y = -0.03 * lenScale;
    tip.add(seg2);
    sleeve.add(base);
  }
  addFinger(-0.075, 0.03, 0.95, 0.08);
  addFinger(-0.025, 0.045, 1.05, 0.04);
  addFinger(0.025, 0.045, 1.0, -0.02);
  addFinger(0.075, 0.03, 0.85, -0.08);

  const thumb = new THREE.Group();
  thumb.position.set(side * 0.1, -0.3, 0.03);
  thumb.rotation.z = side * -0.9;
  thumb.rotation.x = 0.3;
  const thumbSeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.09, 3, 5), gloveMat);
  thumbSeg.position.y = -0.045;
  thumb.add(thumbSeg);
  sleeve.add(thumb);

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
  ctx.fillStyle = '#a7a23c'; // more yellow-green, less brown-gold -- closer to real Level 0 reference photos
  ctx.fillRect(0, 0, size, size);
  const noise = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < noise.data.length; i += 4) {
    const v = (Math.random() - 0.5) * 16;
    noise.data[i] = Math.max(0, Math.min(255, noise.data[i] + v));
    noise.data[i + 1] = Math.max(0, Math.min(255, noise.data[i + 1] + v));
    noise.data[i + 2] = Math.max(0, Math.min(255, noise.data[i + 2] + v * 0.5));
  }
  ctx.putImageData(noise, 0, 0);
  // The actual Level 0 motif -- rows of nested arches/scallops, not plain
  // vertical stripes -- on request ("heres some images of what the main
  // area should look like aka the backrooms"). Staggered brick-style
  // between rows, like the real reference wallpaper pattern.
  ctx.strokeStyle = 'rgba(70,68,20,0.5)';
  ctx.lineWidth = 1.4;
  const archCell = 24;
  let row = 0;
  for (let baseY = archCell; baseY < size + archCell; baseY += archCell) {
    const offsetX = (row % 2) * (archCell / 2);
    for (let cx = -archCell + offsetX; cx < size + archCell; cx += archCell) {
      for (let r = 4; r <= 11; r += 2.5) {
        ctx.beginPath();
        ctx.arc(cx, baseY, r, Math.PI, 2 * Math.PI);
        ctx.stroke();
      }
    }
    row++;
  }
  // a couple of vertical damp streaks -- the stained, dripped-from-the-
  // ceiling-line look real Level 0 wallpaper photos almost always show,
  // not just a clean repeating pattern.
  for (let i = 0; i < 2; i++) {
    const x = Math.random() * size;
    const w = 4 + Math.random() * 8;
    const grad = ctx.createLinearGradient(x, 0, x, size);
    grad.addColorStop(0, 'rgba(90,70,25,0.35)');
    grad.addColorStop(1, 'rgba(90,70,25,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - w / 2, 0, w, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(3, 1.6);
  return tex;
}

// Ceiling: the other half of the Level 0 look -- a pale, slightly yellowed
// acoustic drop-ceiling tile, speckled and pock-marked like real fiberboard,
// with a water-stain blotch on most tiles and a dark seam around the tile
// edge so it actually reads as a tiled drop ceiling instead of a flat
// painted surface. Drawn at a fixed tile size rather than scaled off CELL,
// which isn't declared yet this early in the file -- repeat is just set
// to a count that divides a room cleanly below.
function makeCeilingTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d6c99a';
  ctx.fillRect(0, 0, size, size);
  const noise = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < noise.data.length; i += 4) {
    const v = (Math.random() - 0.5) * 16;
    noise.data[i] = Math.max(0, Math.min(255, noise.data[i] + v));
    noise.data[i + 1] = Math.max(0, Math.min(255, noise.data[i + 1] + v * 0.95));
    noise.data[i + 2] = Math.max(0, Math.min(255, noise.data[i + 2] + v * 0.65));
  }
  ctx.putImageData(noise, 0, 0);
  ctx.fillStyle = 'rgba(80,68,35,0.25)';
  for (let i = 0; i < 90; i++) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  if (Math.random() < 0.7) {
    const sx = size * (0.25 + Math.random() * 0.5), sy = size * (0.25 + Math.random() * 0.5);
    const r = size * (0.18 + Math.random() * 0.22);
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    grad.addColorStop(0, 'rgba(110,85,35,0.4)');
    grad.addColorStop(0.6, 'rgba(110,85,35,0.18)');
    grad.addColorStop(1, 'rgba(110,85,35,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(55,46,22,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(6, 6); // ~2-unit tiles across a 12-unit room
  return tex;
}

const wallMat = new THREE.MeshStandardMaterial({ color: 0xcdb15c, roughness: 0.95, map: makeWallpaperTexture() });
const carpetMat = new THREE.MeshStandardMaterial({ color: 0x8a742f, roughness: 1, map: makeGrainTexture({ size: 128, dark: 70, light: 170, repeat: 20, blotch: 3, tint: [0.75, 0.62, 0.22] }) }); // "damp" -- darker and blotchier than the wallpaper, not a clean carpet
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xd6c99a, roughness: 0.9, map: makeCeilingTexture() });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x4a3f1c, roughness: 0.9 });
// Crawlspace-only floor/header material -- near-black and fully matte, on
// request ("make crawlspaces darker"). A crawl tunnel is deliberately lit
// by nothing of its own (see edgeWallX/edgeWallZ's 'crawl' case and
// buildCrawlTunnelCell below), but reusing wallMat/carpetMat still read as
// bright as a normal room wherever a neighboring room's own light reached
// that far in. This absorbs that light instead of reflecting it back.
const crawlDarkMat = new THREE.MeshStandardMaterial({ color: 0x0c0a05, roughness: 1 });
const fluorescentMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xfff3d6, emissiveIntensity: 1.2, roughness: 0.6 });

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
// Where the maze opens out into the Mall, via a long crawlspace (not a
// normal doorway) punched through the south boundary wall at this column
// -- see the Mall section after the Pool Rooms below.
const MALL_DOOR_CX = 2;
// Where the maze opens out into the Safezone, via the giant lever-door
// (not a normal doorway either) punched through the west boundary wall
// at this row -- see the Safezone section, built after the Mall below.
const SAFE_DOOR_CZ = 6;

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
// { box: THREE.Box3, t } -- a door (the Safezone's giant lever-door, see
// that section below) blocks like a wall while mostly closed (t near 0)
// and stops blocking once it's mostly slid open (t near 1), rather than
// being a fixed wall or a normal doorway.
const doorColliders = [];

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
  for (const d of doorColliders) {
    if (d.t > 0.92) continue; // mostly open -- stop blocking before the slide fully finishes, so it doesn't feel like walking into glass
    const b = d.box;
    if (x + PLAYER_R > b.min.x && x - PLAYER_R < b.max.x &&
        z + PLAYER_R > b.min.z && z - PLAYER_R < b.max.z) return true;
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
    const header = new THREE.Mesh(new THREE.BoxGeometry(WALL_T * 2, WALL_H - CRAWL_H, wz1 - wz0), crawlDarkMat);
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
    const header = new THREE.Mesh(new THREE.BoxGeometry(wx1 - wx0, WALL_H - CRAWL_H, WALL_T * 2), crawlDarkMat);
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
      if (ex === 0 && ez === SAFE_DOOR_CZ) continue; // the Safezone's own giant door, built by that section instead
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
    if (ez === 0 || ez === GRID_N) {
      // The south boundary's own one gap -- not a normal doorway/crawl
      // cut (those always take the whole shared wall), but a narrow mouth
      // sized to the long crawlway below, left for that section to build
      // itself rather than handled generically here.
      if (ez === 0 && ex === MALL_DOOR_CX) continue;
      edgeWallZ(boundaryZ(ez), wx0, wx1, 'solid');
      continue;
    }
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
    const floor = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.15, maxZ - minZ), crawlDarkMat);
    floor.position.set((minX + maxX) / 2, -0.075, (minZ + maxZ) / 2);
    scene.add(floor);
    const header = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, WALL_H - CRAWL_H, maxZ - minZ), crawlDarkMat);
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
  const broken = rand() < 0.18;
  // The lit diffuser lens itself -- a pale emissive panel recessed in the
  // dark trim housing above, flush with its bottom face, so the fixture
  // actually looks like a real fluorescent tray instead of a dark box.
  // Its own material is a clone (not the shared fluorescentMat) so each
  // fixture's glow can flicker independently in the animate() loop below.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.03, 0.8), fluorescentMat.clone());
  panel.material.emissiveIntensity = broken ? 0.3 : 1.2;
  panel.position.set(c.x, WALL_H - 0.16, c.z);
  scene.add(panel);
  const light = new THREE.PointLight(0xe8d090, base, CELL * 1.8, 2);
  light.position.set(c.x, WALL_H - 0.4, c.z);
  scene.add(light);
  cellLights.push({ light, panel, base, seed: rand() * 1000, broken });
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

/* ---------------- the Mall: a sub-level reached by a very long crawlspace ---------------- */
/* On request -- "a new area that can only be accessed by a crawlspace
 * that is really long" -- a single straight, unbroken crawl tunnel, far
 * longer than any normal crawl-tunnel-cell leg (those live inside one
 * 12-unit maze cell; this one runs the length of several), punched
 * through the maze's own south boundary wall at MALL_DOOR_CX rather than
 * an interior doorway -- same "carve a one-off gap in an otherwise-solid
 * boundary wall" technique the Pool Rooms' own staircase uses on the east
 * boundary, just crouch-gated the whole way instead of open. It leads to
 * a mall: one big tiled atrium, storefronts, a fountain, skylights -- not
 * on the maze's grid at all, ground-level (not sunk like the Pool Rooms),
 * but with its own taller ceiling (MALL_WALL_H, not the maze's WALL_H) so
 * a genuinely giant monster has headroom to stand in it without clipping
 * the ceiling. */

const mallFloorMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a0, roughness: 0.35, map: makeGrainTexture({ size: 128, dark: 150, light: 235, repeat: 18, blotch: 4, tint: [0.85, 0.82, 0.74] }) }); // speckled terrazzo
const mallWallMat = new THREE.MeshStandardMaterial({ color: 0xe6ddc8, roughness: 0.75, map: makeGrainTexture({ size: 128, dark: 205, light: 255, repeat: 10, blotch: 3, tint: [0.92, 0.88, 0.78] }) }); // cream plaster
// A faint fixed emissive floor, not just a dark color -- the Mall's rooms
// are far wider than one maze cell, and a real point light's intensity
// falls off with the square of distance, so the ceiling (the surface
// farthest from every sconce/skylight) was going fully, literally black
// rather than just reading as a dim service ceiling. ("fix it why are
// there black walls")
const mallCeilMat = new THREE.MeshStandardMaterial({ color: 0x343438, roughness: 0.85, emissive: 0x1b1b1f, emissiveIntensity: 1 }); // dark open-plan service ceiling, not a drop-tile grid like the maze
// Sickly green-white, not a clean daylight blue -- on request ("mall
// should look something like this", a dead-mall reference photo: a dim
// space lit mostly by a green-cast ceiling, warm light only at the
// storefronts themselves).
const mallSkylightMat = new THREE.MeshStandardMaterial({ color: 0xc9e0b4, emissive: 0xb8dc9c, emissiveIntensity: 1.1, roughness: 0.3 });
const mallRunnerMat = new THREE.MeshStandardMaterial({ color: 0x2c3a28, roughness: 0.9, map: makeGrainTexture({ size: 128, dark: 20, light: 70, repeat: 14, blotch: 3, tint: [0.55, 0.62, 0.5] }) }); // a darker patterned-carpet runner down the main aisle, same reference
const mallGlassMat = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.55 });
const mallSignMats = [0xd43b3b, 0x2f8f4e, 0x2f6fdb, 0xd98a1f].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, roughness: 0.5 }));

const MALL_WALL_H = 6.5;

function mallWallSeg(x0, x1, z0, z1) {
  if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, MALL_WALL_H, z1 - z0), mallWallMat);
  mesh.position.set((x0 + x1) / 2, MALL_WALL_H / 2, (z0 + z1) / 2);
  scene.add(mesh);
  boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, MALL_WALL_H, z1)));
}
// Like edgeWallX/edgeWallZ, but ground-level (the Mall sits at y=0, same
// as the maze, just with its own taller wall height) and with a plain
// configurable doorway half-width instead of the maze's fixed DOOR_HALF.
function mallEdgeX(wx, z0, z1, doorCenterZ, doorHalf) {
  if (doorCenterZ === null) { mallWallSeg(wx - WALL_T / 2, wx + WALL_T / 2, z0, z1); return; }
  mallWallSeg(wx - WALL_T / 2, wx + WALL_T / 2, z0, doorCenterZ - doorHalf);
  mallWallSeg(wx - WALL_T / 2, wx + WALL_T / 2, doorCenterZ + doorHalf, z1);
}
function mallEdgeZ(wz, x0, x1, doorCenterX, doorHalf) {
  if (doorCenterX === null) { mallWallSeg(x0, x1, wz - WALL_T / 2, wz + WALL_T / 2); return; }
  mallWallSeg(x0, doorCenterX - doorHalf, wz - WALL_T / 2, wz + WALL_T / 2);
  mallWallSeg(doorCenterX + doorHalf, x1, wz - WALL_T / 2, wz + WALL_T / 2);
}
function buildMallRoomShell(x0, x1, z0, z1) {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.15, z1 - z0), mallFloorMat);
  floor.position.set((x0 + x1) / 2, -0.075, (z0 + z1) / 2);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.15, z1 - z0), mallCeilMat);
  ceil.position.set((x0 + x1) / 2, MALL_WALL_H + 0.075, (z0 + z1) / 2);
  scene.add(ceil);
}
// A storefront set into one of the atrium's long walls -- now a real
// enterable room behind the facade, not just a decorative face, on
// request ("make it so you can enter the stores with them having
// clothes, food etc"). `side` is +1 for a wall at the room's low-X edge
// (facade faces +x, into the atrium) or -1 for the high-X edge (faces
// -x); `kind` ('clothes' | 'food') picks which props furnish it.
const STORE_HALF_Z = 2.5, STORE_DOOR_HALF = 1.0, STORE_DEPTH = 6, STORE_H = 2.7;
function buildStorefront(wallX, cz, side, signMat, kind) {
  const z0 = cz - STORE_HALF_Z, z1 = cz + STORE_HALF_Z;
  const doorZ0 = cz - STORE_DOOR_HALF, doorZ1 = cz + STORE_DOOR_HALF;
  const roomX = wallX + side * STORE_DEPTH;

  // Facade: two segments flanking a real doorway gap (used to be one
  // solid block covering the whole footprint).
  for (const [fz0, fz1] of [[z0, doorZ0], [doorZ1, z1]]) {
    const facade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, fz1 - fz0), mallWallMat);
    facade.position.set(wallX + side * 0.2, 1.3, (fz0 + fz1) / 2);
    scene.add(facade);
    boxColliders.push(new THREE.Box3(
      new THREE.Vector3(Math.min(wallX, wallX + side * 0.4), 0, fz0),
      new THREE.Vector3(Math.max(wallX, wallX + side * 0.4), 2.6, fz1)
    ));
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, fz1 - fz0 - 0.2), mallGlassMat);
    glass.position.set(wallX + side * 0.44, 1.1, (fz0 + fz1) / 2);
    scene.add(glass);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, doorZ1 - doorZ0), mallWallMat);
  lintel.position.set(wallX + side * 0.2, 2.4, cz);
  scene.add(lintel);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, z1 - z0 + 0.1), signMat);
  sign.position.set(wallX + side * 0.5, 2.55, cz);
  scene.add(sign);

  // The interior behind the doorway: floor/ceiling strip, a far wall,
  // and two side walls, all real colliders -- the doorway gap is the
  // only way in or out.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(roomX - wallX), 0.1, z1 - z0), mallFloorMat);
  floor.position.set((wallX + roomX) / 2, -0.05, cz);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(roomX - wallX), 0.1, z1 - z0), mallCeilMat);
  ceil.position.set((wallX + roomX) / 2, STORE_H, cz);
  scene.add(ceil);
  const farWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, STORE_H, z1 - z0), mallWallMat);
  farWall.position.set(roomX, STORE_H / 2, cz);
  scene.add(farWall);
  boxColliders.push(new THREE.Box3(
    new THREE.Vector3(Math.min(roomX - 0.15, roomX + 0.15), 0, z0),
    new THREE.Vector3(Math.max(roomX - 0.15, roomX + 0.15), STORE_H, z1)
  ));
  for (const sz of [z0, z1]) {
    const wseg = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(roomX - wallX), STORE_H, 0.2), mallWallMat);
    wseg.position.set((wallX + roomX) / 2, STORE_H / 2, sz);
    scene.add(wseg);
    boxColliders.push(new THREE.Box3(
      new THREE.Vector3(Math.min(wallX, roomX), 0, sz - 0.1),
      new THREE.Vector3(Math.max(wallX, roomX), STORE_H, sz + 0.1)
    ));
  }
  const lamp = new THREE.PointLight(0xfff4d6, 0.7, 9, 2);
  lamp.position.set((wallX + roomX) / 2, STORE_H - 0.3, cz);
  scene.add(lamp);
  cellLights.push({ light: lamp, base: 1.0, seed: rand() * 1000, broken: false });

  furnishStore(wallX, side, cz, z0, z1, kind);
}

/* Store interiors: clothes racks/shelves for 'clothes' stores, shelving
 * and a checkout counter for 'food' stores. Also reused, below, for the
 * food court's own stalls. */
const clothesRackMat = new THREE.MeshStandardMaterial({ color: 0x7d776a, roughness: 0.5, metalness: 0.4 });
const clothesItemMats = [0xb33a3a, 0x3a6fb3, 0x3ab38a, 0xb3963a, 0x6a3ab3, 0xb3519e].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
const foodItemMats = [0xc23b2e, 0xd9a332, 0x4f8f3e, 0x8a5a2e, 0xcdd0d4].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));

function buildClothesRack(cx, cz) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), clothesRackMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.3;
  g.add(bar);
  for (const lx of [-0.75, 0.75]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), clothesRackMat);
    leg.position.set(lx, 0.65, 0);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.3), clothesRackMat);
    foot.position.set(lx, 0.02, 0);
    g.add(foot);
  }
  for (let i = 0; i < 6; i++) {
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.1), clothesItemMats[(i * 2) % clothesItemMats.length]);
    shirt.position.set(-0.65 + i * 0.26, 0.98, 0);
    g.add(shirt);
  }
  g.position.set(cx, 0, cz);
  scene.add(g);
  addCircleCollider(cx, cz, 0.55);
}
function buildFoldedShelf(cx, cz, side) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.4), trimMat);
  frame.position.y = 0.9;
  g.add(frame);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const fold = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), clothesItemMats[(row * 3 + col) % clothesItemMats.length]);
      fold.position.set(-0.38 + col * 0.38, 0.45 + row * 0.5, 0.15);
      g.add(fold);
    }
  }
  g.position.set(cx, 0, cz);
  g.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  scene.add(g);
  addCircleCollider(cx, cz, 0.7);
}
function buildFoodShelf(cx, cz, side) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.45), trimMat);
  frame.position.y = 0.9;
  g.add(frame);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const item = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), foodItemMats[(row * 2 + col) % foodItemMats.length]);
      item.position.set(-0.22 + col * 0.44, 0.4 + row * 0.5, 0.2);
      g.add(item);
    }
  }
  g.position.set(cx, 0, cz);
  g.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  scene.add(g);
  addCircleCollider(cx, cz, 0.7);
}
function buildCounter(cx, cz, side) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.7), trimMat);
  base.position.y = 0.5;
  g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.8), clothesRackMat);
  top.position.y = 1.02;
  g.add(top);
  const register = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), foodItemMats[4]);
  register.position.set(0.4, 1.17, 0);
  g.add(register);
  g.position.set(cx, 0, cz);
  g.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  scene.add(g);
  addCircleCollider(cx, cz, 0.95);
}
function furnishStore(wallX, side, cz, z0, z1, kind) {
  const atDepth = (d) => wallX + side * (0.6 + d);
  if (kind === 'clothes') {
    buildClothesRack(atDepth(1.4), z0 + 1.1);
    buildClothesRack(atDepth(1.4), z1 - 1.1);
    buildFoldedShelf(atDepth(4.6), cz, side);
  } else {
    buildFoodShelf(atDepth(1.4), z0 + 1.0, side);
    buildFoodShelf(atDepth(1.4), z1 - 1.0, side);
    buildCounter(atDepth(4.6), cz, side);
  }
}
function buildFoodCourtTable(cx, cz) {
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 16), trimMat);
  top.position.set(cx, 0.75, cz);
  scene.add(top);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), trimMat);
  pole.position.set(cx, 0.35, cz);
  scene.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 12), trimMat);
  base.position.set(cx, 0.03, cz);
  scene.add(base);
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.45, 10), trimMat);
    stool.position.set(cx + Math.sin(ang) * 1.1, 0.225, cz + Math.cos(ang) * 1.1);
    scene.add(stool);
  }
  addCircleCollider(cx, cz, 0.85);
}
function buildFoodStall(wallX, cz, side, signMat) {
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 3.2), signMat);
  sign.position.set(wallX + side * 0.2, 2.3, cz);
  scene.add(sign);
  buildFoodShelf(wallX + side * 0.5, cz - 0.9, side);
  buildFoodShelf(wallX + side * 0.5, cz + 0.9, side);
  buildCounter(wallX + side * 1.3, cz, side);
}
function buildFountain(cx, cz) {
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.5, 20), mallWallMat);
  basin.position.set(cx, 0.25, cz);
  scene.add(basin);
  addCircleCollider(cx, cz, 3.1);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.1, 20), poolWaterMat);
  water.position.set(cx, 0.52, cz);
  scene.add(water);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 10), mallWallMat);
  spout.position.set(cx, 1.2, cz);
  scene.add(spout);
  const fountainLight = new THREE.PointLight(0x9fd0e8, 0.8, 10, 2);
  fountainLight.position.set(cx, 1.6, cz);
  scene.add(fountainLight);
  cellLights.push({ light: fountainLight, base: 0.8, seed: rand() * 1000, broken: false });
}
function buildBench(cx, cz, rotY) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.5), trimMat);
  seat.position.y = 0.45;
  g.add(seat);
  for (const lx of [-0.65, 0.65]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.45), trimMat);
    leg.position.set(lx, 0.225, 0);
    g.add(leg);
  }
  g.position.set(cx, 0, cz);
  g.rotation.y = rotY;
  scene.add(g);
  addCircleCollider(cx, cz, 0.9);
}
// A recessed hexagonal ceiling coffer with a glowing panel sunk into it
// and its own point light -- the dead-mall reference photo's ceiling is
// a grid of these, not a couple of plain flat skylights, and there were
// too few of the old skylights anyway to light a room this size evenly.
const cofferRingMat = new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.9 });
function buildCeilingCoffer(cx, cz) {
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.3, 6), cofferRingMat);
  ring.position.set(cx, MALL_WALL_H - 0.15, cz);
  scene.add(ring);
  const panel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.08, 6), mallSkylightMat);
  panel.position.set(cx, MALL_WALL_H - 0.32, cz);
  scene.add(panel);
  const light = new THREE.PointLight(0xc9e8b0, 1.1, 18, 2);
  light.position.set(cx, MALL_WALL_H - 0.9, cz);
  scene.add(light);
  cellLights.push({ light, base: 1.1, seed: rand() * 1000, broken: false });
}

const mallEntryX = cellCenter(MALL_DOOR_CX, 0).x;
const mallSouthZ = boundaryZ(0);
const MALL_PATH_HALF = 1.0;
const MALL_TUNNEL_LEN = 60; // "really long" -- 5x a single 12-unit maze cell
const mallTunnelEndZ = mallSouthZ - MALL_TUNNEL_LEN;

// The narrow mouth through the boundary -- flanking solid wall either
// side, a crouch-gated gap in the middle sized to the crawlway itself
// rather than a whole shared wall (the normal maze crawlspace convention
// doesn't apply here, since this isn't a shared wall between two rooms).
{
  const wx0 = boundaryX(MALL_DOOR_CX), wx1 = boundaryX(MALL_DOOR_CX + 1);
  wallBox(wx0, mallEntryX - MALL_PATH_HALF, mallSouthZ - WALL_T / 2, mallSouthZ + WALL_T / 2);
  wallBox(mallEntryX + MALL_PATH_HALF, wx1, mallSouthZ - WALL_T / 2, mallSouthZ + WALL_T / 2);
  crawlOnlyBoxes.push(new THREE.Box3(
    new THREE.Vector3(mallEntryX - MALL_PATH_HALF, 0, mallSouthZ - WALL_T),
    new THREE.Vector3(mallEntryX + MALL_PATH_HALF, WALL_H, mallSouthZ + WALL_T)
  ));
  const mouthHeader = new THREE.Mesh(new THREE.BoxGeometry(MALL_PATH_HALF * 2, WALL_H - CRAWL_H, WALL_T * 2), crawlDarkMat);
  mouthHeader.position.set(mallEntryX, CRAWL_H + (WALL_H - CRAWL_H) / 2, mallSouthZ);
  scene.add(mouthHeader);
}
// The long crawlway itself -- one straight, unbroken run (unlike the
// normal crawl-tunnel-cells, which cap after one short jointed leg or
// two), narrow and unlit the entire way.
{
  const minX = mallEntryX - MALL_PATH_HALF, maxX = mallEntryX + MALL_PATH_HALF;
  const minZ = mallTunnelEndZ, maxZ = mallSouthZ;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.15, maxZ - minZ), crawlDarkMat);
  floor.position.set(mallEntryX, -0.075, (minZ + maxZ) / 2);
  scene.add(floor);
  const header = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, WALL_H - CRAWL_H, maxZ - minZ), crawlDarkMat);
  header.position.set(mallEntryX, CRAWL_H + (WALL_H - CRAWL_H) / 2, (minZ + maxZ) / 2);
  scene.add(header);
  crawlOnlyBoxes.push(new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, WALL_H, maxZ)));
  wallBox(minX - WALL_T, minX, minZ, maxZ);
  wallBox(maxX, maxX + WALL_T, minZ, maxZ);
}

// One big atrium, deliberately off-center on the crawlway (which enters
// nearer its west wall than dead-center, like a real mall's back-hallway
// entrance) -- storefronts along both long walls, a fountain and a
// couple of benches in the middle, three skylights overhead.
const mallAx0 = mallEntryX - 22, mallAx1 = mallEntryX + 22;
const mallAz1 = mallTunnelEndZ, mallAz0 = mallAz1 - 34;
const MALL_BOUNDS = { x0: mallAx0, x1: mallAx1, z0: mallAz0, z1: mallAz1 };
// The mall's own hall out to the food court -- declared up here (not down
// by the food court itself) because the atrium's south wall needs to
// know about this gap too.
const hallHalf = 2.0;
const hallCenterX = (mallAx0 + mallAx1) / 2;

buildMallRoomShell(mallAx0, mallAx1, mallAz0, mallAz1);
mallEdgeZ(mallAz1, mallAx0, mallAx1, mallEntryX, MALL_PATH_HALF + 0.3); // north wall -- the crawlway's own mouth
mallEdgeZ(mallAz0, mallAx0, mallAx1, hallCenterX, hallHalf); // south wall -- the hall's own mouth, on to the food court
mallEdgeX(mallAx0, mallAz0, mallAz1, null); // west wall, solid
mallEdgeX(mallAx1, mallAz0, mallAz1, null); // east wall, solid

const mallStorefrontZs = [mallAz0 + 5, mallAz0 + 13, mallAz0 + 21, mallAz0 + 29]; // 4 per side now (was 3), on request ("add more shops to mall")
const mallStoreKinds = ['clothes', 'food', 'clothes', 'food']; // on request ("enter the stores with them having clothes, food etc")
mallStorefrontZs.forEach((z, i) => buildStorefront(mallAx0, z, 1, mallSignMats[i % mallSignMats.length], mallStoreKinds[i]));
mallStorefrontZs.forEach((z, i) => buildStorefront(mallAx1, z, -1, mallSignMats[(i + 1) % mallSignMats.length], mallStoreKinds[(i + 1) % mallStoreKinds.length]));

buildFountain((mallAx0 + mallAx1) / 2, (mallAz0 + mallAz1) / 2);
buildBench((mallAx0 + mallAx1) / 2 - 5, (mallAz0 + mallAz1) / 2 + 6, 0);
buildBench((mallAx0 + mallAx1) / 2 + 5, (mallAz0 + mallAz1) / 2 + 6, Math.PI);

const mallMidX = (mallAx0 + mallAx1) / 2, mallMidZ = (mallAz0 + mallAz1) / 2;
for (const [lx, lz] of [
  [mallMidX - 13, mallMidZ - 11], [mallMidX, mallMidZ - 11], [mallMidX + 13, mallMidZ - 11],
  [mallMidX - 13, mallMidZ + 11], [mallMidX + 13, mallMidZ + 11],
]) buildCeilingCoffer(lx, lz);

// A darker patterned-carpet runner down the main aisle, same reference
// photo -- the terrazzo floor alone read as one flat, even tone.
{
  const runner = new THREE.Mesh(new THREE.BoxGeometry(5, 0.02, mallAz1 - mallAz0 - 2), mallRunnerMat);
  runner.position.set(mallMidX, 0.011, mallMidZ);
  scene.add(runner);
}

// A wall sconce by every storefront -- the fountain and the three
// skylights above are too few and far apart for a room this size (44x34,
// much bigger than one 12-unit maze cell), so most of both long walls
// were only getting the dim ambient fill, which read as flat black.
// ("fix it why are there black walls" -- the room was real, just unlit.)
mallStorefrontZs.forEach((z) => {
  for (const wallX of [mallAx0, mallAx1]) {
    const sconce = new THREE.PointLight(0xfff0d0, 0.75, 16, 2);
    sconce.position.set(wallX + (wallX === mallAx0 ? 3 : -3), 3.4, z);
    scene.add(sconce);
    cellLights.push({ light: sconce, base: 0.75, seed: rand() * 1000, broken: false });
  }
});

// Where Bloom and the Mannequin start -- opposite corners of the atrium,
// not on the maze grid, so (like the Mimitor's own spawn point) these are
// just plain coordinates.
const bloomSpawnPos = { x: mallAx0 + 8, z: mallAz1 - 6 };
const mallMannequinSpawnPos = { x: mallAx1 - 8, z: mallAz0 + 8 };

/* ---------------- the mall's hall and food court ---------------- */
/* On request -- "add halls and foodcourts to the mall" -- a short hall
 * through the atrium's own south wall (previously solid, see hallHalf/
 * hallCenterX above) leading to a food court: tables down the middle,
 * two food-stall counters along its own far wall, its own skylights. */

const hallLen = 10;
const hallZ1 = mallAz0, hallZ0 = mallAz0 - hallLen;
mallEdgeX(hallCenterX - hallHalf, hallZ0, hallZ1, null);
mallEdgeX(hallCenterX + hallHalf, hallZ0, hallZ1, null);
{
  const floor = new THREE.Mesh(new THREE.BoxGeometry(hallHalf * 2, 0.15, hallLen), mallFloorMat);
  floor.position.set(hallCenterX, -0.075, (hallZ0 + hallZ1) / 2);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(hallHalf * 2, 0.15, hallLen), mallCeilMat);
  ceil.position.set(hallCenterX, MALL_WALL_H + 0.075, (hallZ0 + hallZ1) / 2);
  scene.add(ceil);
  for (const z of [hallZ1 - 2.5, hallZ1 - 7.5]) {
    const light = new THREE.PointLight(0xfff0d0, 1.0, 10, 2);
    light.position.set(hallCenterX, MALL_WALL_H - 0.8, z);
    scene.add(light);
    cellLights.push({ light, base: 1.0, seed: rand() * 1000, broken: false });
  }
}

const fcHalfW = 15, fcDepth = 20;
const fcX0 = hallCenterX - fcHalfW, fcX1 = hallCenterX + fcHalfW;
const fcZ1 = hallZ0, fcZ0 = fcZ1 - fcDepth;
const FOOD_COURT_BOUNDS = { x0: fcX0, x1: fcX1, z0: fcZ0, z1: fcZ1 };

buildMallRoomShell(fcX0, fcX1, fcZ0, fcZ1);
mallEdgeZ(fcZ1, fcX0, fcX1, hallCenterX, hallHalf); // north wall -- the hall's own mouth
mallEdgeZ(fcZ0, fcX0, fcX1, null); // south wall, solid
mallEdgeX(fcX0, fcZ0, fcZ1, null); // west wall, solid
mallEdgeX(fcX1, fcZ0, fcZ1, null); // east wall, solid

for (const [tx, tz] of [
  [hallCenterX - 6, (fcZ0 + fcZ1) / 2 + 3],
  [hallCenterX + 6, (fcZ0 + fcZ1) / 2 + 3],
  [hallCenterX - 6, (fcZ0 + fcZ1) / 2 - 5],
  [hallCenterX + 6, (fcZ0 + fcZ1) / 2 - 5],
]) buildFoodCourtTable(tx, tz);

buildFoodStall(fcX0 + 0.2, (fcZ0 + fcZ1) / 2 - 4, 1, mallSignMats[2]);
buildFoodStall(fcX0 + 0.2, (fcZ0 + fcZ1) / 2 + 4, 1, mallSignMats[3]);

for (const [lx, lz] of [
  [hallCenterX - 7, fcZ0 + 5], [hallCenterX + 7, fcZ0 + 5],
  [hallCenterX - 7, fcZ0 + 14], [hallCenterX + 7, fcZ0 + 14],
]) buildCeilingCoffer(lx, lz);
{
  const runner = new THREE.Mesh(new THREE.BoxGeometry(4, 0.02, fcDepth - 2), mallRunnerMat);
  runner.position.set(hallCenterX, 0.011, (fcZ0 + fcZ1) / 2);
  scene.add(runner);
}
// Same reason as the atrium's own wall sconces above -- the food court's
// skylights sit toward its north end, near the hall, leaving the south
// wall and the stalls dark without their own fill light.
for (const [lx, lz] of [[fcX0 + 3, (fcZ0 + fcZ1) / 2 - 4], [fcX0 + 3, (fcZ0 + fcZ1) / 2 + 4], [fcX1 - 4, (fcZ0 + fcZ1) / 2], [hallCenterX, fcZ0 + 2]]) {
  const sconce = new THREE.PointLight(0xfff0d0, 0.75, 16, 2);
  sconce.position.set(lx, 3.4, lz);
  scene.add(sconce);
  cellLights.push({ light: sconce, base: 0.75, seed: rand() * 1000, broken: false });
}

/* ---------------- the Safezone: a facility room behind a giant lever-door ---------------- */
/* On request -- "a safezone thats like a facility with pipes and a giant
 * door that can only be opened with a lever in the middle" -- a plain
 * industrial room (metal floor/walls, exposed pipes) behind its own
 * boundary opening (SAFE_DOOR_CZ, on the maze's west side, well away from
 * the Pool Rooms' east doorway and the Mall's south crawlway). The door
 * itself is a real moving collider, not just a visual: it blocks like a
 * solid wall while down, and only stops blocking once it's slid most of
 * the way up (see doorColliders in collidesAt, above) -- a slow 3-second
 * slide each way (SAFE_DOOR_DURATION), triggered only by the lever
 * standing in the middle of the room, never automatically. */

const safeFloorMat = new THREE.MeshStandardMaterial({ color: 0x3c3f42, roughness: 0.6, metalness: 0.3, map: makeGrainTexture({ size: 128, dark: 40, light: 120, repeat: 16, blotch: 3 }) });
const safeWallMat = new THREE.MeshStandardMaterial({ color: 0x53585c, roughness: 0.55, metalness: 0.25, map: makeGrainTexture({ size: 128, dark: 70, light: 150, repeat: 12, blotch: 3 }) });
const safeCeilMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.8, emissive: 0x121316, emissiveIntensity: 1 }); // same faint emissive floor as the Mall's own ceiling, same reason
const pipeMatA = new THREE.MeshStandardMaterial({ color: 0x8a6b2a, roughness: 0.4, metalness: 0.6 });
const pipeMatB = new THREE.MeshStandardMaterial({ color: 0x3a6b5a, roughness: 0.45, metalness: 0.5 });
// Gunmetal grey, not red/yellow hazard colors -- on request ("make the
// safezone kinda look like this", a reference photo of a riveted steel
// vault door with dark overhead tanks and cage racking).
const safeDoorMat = new THREE.MeshStandardMaterial({ color: 0x9a9da0, roughness: 0.4, metalness: 0.6 });
const safeDoorStripeMat = new THREE.MeshStandardMaterial({ color: 0x45484b, roughness: 0.5, metalness: 0.5 });
const leverBaseMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.6 });
const leverHandleMat = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.4, metalness: 0.3 });
const tankMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.35, metalness: 0.7 });

function safeWallSeg(x0, x1, z0, z1) {
  if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, WALL_H, z1 - z0), safeWallMat);
  mesh.position.set((x0 + x1) / 2, WALL_H / 2, (z0 + z1) / 2);
  scene.add(mesh);
  boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, WALL_H, z1)));
}
function safeEdgeX(wx, z0, z1, doorCenterZ, doorHalf) {
  if (doorCenterZ === null) { safeWallSeg(wx - WALL_T / 2, wx + WALL_T / 2, z0, z1); return; }
  safeWallSeg(wx - WALL_T / 2, wx + WALL_T / 2, z0, doorCenterZ - doorHalf);
  safeWallSeg(wx - WALL_T / 2, wx + WALL_T / 2, doorCenterZ + doorHalf, z1);
}
function safeEdgeZ(wz, x0, x1, doorCenterX, doorHalf) {
  if (doorCenterX === null) { safeWallSeg(x0, x1, wz - WALL_T / 2, wz + WALL_T / 2); return; }
  safeWallSeg(x0, doorCenterX - doorHalf, wz - WALL_T / 2, wz + WALL_T / 2);
  safeWallSeg(doorCenterX + doorHalf, x1, wz - WALL_T / 2, wz + WALL_T / 2);
}
function buildSafeRoomShell(x0, x1, z0, z1) {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.15, z1 - z0), safeFloorMat);
  floor.position.set((x0 + x1) / 2, -0.075, (z0 + z1) / 2);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.15, z1 - z0), safeCeilMat);
  ceil.position.set((x0 + x1) / 2, WALL_H + 0.075, (z0 + z1) / 2);
  scene.add(ceil);
}
// A run of pipe along one wall -- a long cylinder plus a couple of ring
// "joints" so it doesn't read as one perfectly smooth tube, mounted a
// little proud of the wall it runs along.
function buildPipeRun(x0, z0, x1, z1, y, mat) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len, 8), mat);
  pipe.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  pipe.rotation.z = Math.PI / 2;
  pipe.rotation.y = -Math.atan2(dz, dx);
  scene.add(pipe);
  for (let i = 0; i <= 2; i++) {
    const t = i / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 10), leverBaseMat);
    ring.position.set(x0 + dx * t, y, z0 + dz * t);
    ring.rotation.y = -Math.atan2(dz, dx);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
  }
}

const safeDoorZ = cellCenter(0, SAFE_DOOR_CZ).z;
const safeWestWallX = boundaryX(0);
const SAFE_GAP_HALF = 2.2; // a giant door -- much wider than a normal DOOR_HALF (1.1) doorway
const SAFE_DOOR_H = WALL_H - 0.2;
const SAFE_W = 20, SAFE_D = 16;
const safeRoomX1 = safeWestWallX, safeRoomX0 = safeRoomX1 - SAFE_W;
const safeRoomZ0 = safeDoorZ - SAFE_D / 2, safeRoomZ1 = safeDoorZ + SAFE_D / 2;

buildSafeRoomShell(safeRoomX0, safeRoomX1, safeRoomZ0, safeRoomZ1);
safeEdgeX(safeRoomX1, safeRoomZ0, safeRoomZ1, safeDoorZ, SAFE_GAP_HALF); // east wall -- the giant door's own gap
safeEdgeX(safeRoomX0, safeRoomZ0, safeRoomZ1, null); // west wall, solid
safeEdgeZ(safeRoomZ0, safeRoomX0, safeRoomX1, null); // south wall, solid
safeEdgeZ(safeRoomZ1, safeRoomX0, safeRoomX1, null); // north wall, solid

// Pipes along three of the four walls and across the ceiling -- the
// "facility with pipes" look -- in two alternating colors for variety.
buildPipeRun(safeRoomX0 + 0.3, safeRoomZ0 + 1.5, safeRoomX0 + 0.3, safeRoomZ1 - 1.5, WALL_H - 0.5, pipeMatA);
buildPipeRun(safeRoomX0 + 0.3, safeRoomZ0 + 1.5, safeRoomX0 + 0.3, safeRoomZ1 - 1.5, WALL_H - 1.0, pipeMatB);
buildPipeRun(safeRoomX0 + 1.5, safeRoomZ0 + 0.3, safeRoomX1 - 1.5, safeRoomZ0 + 0.3, WALL_H - 0.6, pipeMatA);
buildPipeRun(safeRoomX0 + 1.5, safeRoomZ1 - 0.3, safeRoomX1 - 1.5, safeRoomZ1 - 0.3, WALL_H - 0.6, pipeMatB);
buildPipeRun(safeRoomX0 + 2, safeRoomZ0 + 2, safeRoomX1 - 2, safeRoomZ1 - 2, WALL_H - 0.15, pipeMatA);

// The giant door -- a thick slab filling the east wall's own gap,
// normally down (blocking it), sliding straight up into a recess over
// the doorway when the lever's thrown. A riveted-steel vault-door look
// now (vertical ribs plus a center seam reading as a two-leaf door),
// not the old red slab with yellow hazard stripes.
const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(WALL_T + 0.1, SAFE_DOOR_H, SAFE_GAP_HALF * 2 - 0.1), safeDoorMat);
doorMesh.position.set(safeWestWallX, SAFE_DOOR_H / 2, safeDoorZ);
scene.add(doorMesh);
for (let i = 0; i < 5; i++) {
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.03, SAFE_DOOR_H - 0.3, 0.1), safeDoorStripeMat);
  rib.position.set(WALL_T / 2 + 0.02, 0, -SAFE_GAP_HALF + 0.5 + i * (SAFE_GAP_HALF * 2 - 1) / 4);
  doorMesh.add(rib); // child of the slab -- rides along with it as it slides
}
const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(0.045, SAFE_DOOR_H, 0.06), safeDoorStripeMat);
doorSeam.position.set(WALL_T / 2 + 0.03, 0, 0);
doorMesh.add(doorSeam);
const safeDoor = { t: 0, state: 'closed', box: new THREE.Box3() };
doorColliders.push(safeDoor);
function updateSafeDoorBox() {
  const halfW = WALL_T / 2 + 0.1, halfD = SAFE_GAP_HALF;
  const y = doorMesh.position.y;
  safeDoor.box.min.set(safeWestWallX - halfW, Math.max(0, y - SAFE_DOOR_H / 2), safeDoorZ - halfD);
  safeDoor.box.max.set(safeWestWallX + halfW, y + SAFE_DOOR_H / 2, safeDoorZ + halfD);
}
updateSafeDoorBox();
const doorOpenLift = WALL_H + 0.3; // how far up the slab travels -- enough to clear the doorway height entirely

// The lever -- a pedestal and a pivoting handle in the middle of the
// room, the only thing that can start the door moving (never automatic).
const leverX = (safeRoomX0 + safeRoomX1) / 2, leverZ = (safeRoomZ0 + safeRoomZ1) / 2;
const leverBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.9, 10), leverBaseMat);
leverBase.position.set(leverX, 0.45, leverZ);
scene.add(leverBase);
addCircleCollider(leverX, leverZ, 0.55);
const leverPivot = new THREE.Group();
leverPivot.position.set(leverX, 0.9, leverZ);
scene.add(leverPivot);
const leverHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.9, 8), leverHandleMat);
leverHandle.position.y = 0.45;
leverPivot.add(leverHandle);
const leverKnob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), leverHandleMat);
leverKnob.position.y = 0.9;
leverPivot.add(leverKnob);
const leverLight = new THREE.PointLight(0xffe0a0, 0.6, 6, 2);
leverLight.position.set(leverX, 1.6, leverZ);
scene.add(leverLight);
cellLights.push({ light: leverLight, base: 0.6, seed: rand() * 1000, broken: false });
const leverCenter = new THREE.Vector3(leverX, EYE_H, leverZ);

const SAFE_DOOR_DURATION = 3; // seconds each way, on request ("the door takes 3 secs to open/close")
function toggleSafeDoor() {
  if (safeDoor.state === 'closed') safeDoor.state = 'opening';
  else if (safeDoor.state === 'open') safeDoor.state = 'closing';
  // Mid-slide presses are ignored -- it has to finish one way before it
  // can be sent back the other.
}
function tickSafeDoor(dt) {
  if (safeDoor.state === 'opening') {
    safeDoor.t = Math.min(1, safeDoor.t + dt / SAFE_DOOR_DURATION);
    if (safeDoor.t >= 1) safeDoor.state = 'open';
  } else if (safeDoor.state === 'closing') {
    safeDoor.t = Math.max(0, safeDoor.t - dt / SAFE_DOOR_DURATION);
    if (safeDoor.t <= 0) safeDoor.state = 'closed';
  }
  doorMesh.position.y = SAFE_DOOR_H / 2 + safeDoor.t * doorOpenLift;
  updateSafeDoorBox();
  // The lever's own handle tracks the door's progress, not just its own
  // two end positions -- it reads as "this is what's driving the door"
  // rather than a prop that happens to sit near one.
  leverPivot.rotation.x = -0.95 + safeDoor.t * 1.35;
}

// Dark tanks slung overhead at odd angles around the door, cage-style
// shelf racks flanking it, and a leaning ladder -- the rest of the same
// reference photo. The room has no other general lighting beyond the
// lever's own glow, by design (see leverLight above); a single spotlight
// pooling on the floor in front of the door is deliberately the only
// other thing fighting the dark, same as the photo.
function buildOverheadTank(cx, cy, cz, rotX, rotZ, len) {
  const g = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, len, 12), tankMat);
  tank.rotation.z = Math.PI / 2;
  g.add(tank);
  for (const t of [-0.32, 0, 0.32]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.04, 6, 14), leverBaseMat);
    band.position.x = t * len;
    band.rotation.y = Math.PI / 2;
    g.add(band);
  }
  g.position.set(cx, cy, cz);
  g.rotation.x = rotX;
  g.rotation.z = rotZ;
  scene.add(g);
}
buildOverheadTank(safeWestWallX - 1.3, WALL_H - 0.35, safeDoorZ - 1.9, 0.25, 0.3, 2.2);
buildOverheadTank(safeWestWallX - 1.1, WALL_H - 0.15, safeDoorZ + 0.5, -0.2, -0.15, 2.6);
buildOverheadTank(safeWestWallX - 2.3, WALL_H - 0.45, safeDoorZ + 2.2, 0.35, 0.5, 2.0);
buildOverheadTank(safeWestWallX - 1.9, WALL_H - 0.25, safeDoorZ - 0.5, -0.1, 0.6, 2.4);

function buildCageRack(cx, cz, rotY) {
  const g = new THREE.Group();
  const w = 1.1, h = 2.1, d = 0.55;
  for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 6), leverBaseMat);
    post.position.set(sx, h / 2, sz);
    g.add(post);
  }
  for (let i = 0; i < 4; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), safeWallMat);
    shelf.position.y = 0.25 + i * 0.5;
    g.add(shelf);
  }
  g.position.set(cx, 0, cz);
  g.rotation.y = rotY;
  scene.add(g);
  addCircleCollider(cx, cz, 0.75);
}
buildCageRack(safeWestWallX - 1.1, safeDoorZ - SAFE_GAP_HALF - 1.3, Math.PI / 2);
buildCageRack(safeWestWallX - 1.1, safeDoorZ + SAFE_GAP_HALF + 1.3, Math.PI / 2);

function buildLadder(cx, cz, rotY, lean) {
  const g = new THREE.Group();
  for (const sx of [-0.18, 0.18]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), leverBaseMat);
    rail.position.set(sx, 1.1, 0);
    g.add(rail);
  }
  for (let i = 0; i < 7; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), leverBaseMat);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, 0.2 + i * 0.3, 0);
    g.add(rung);
  }
  g.position.set(cx, 0, cz);
  g.rotation.y = rotY;
  g.rotation.x = lean;
  scene.add(g);
}
buildLadder(safeRoomX0 + 0.35, safeRoomZ0 + 3, 0, -0.16);

const doorSpotTarget = new THREE.Object3D();
doorSpotTarget.position.set(safeWestWallX - 3, 0, safeDoorZ);
scene.add(doorSpotTarget);
const doorSpot = new THREE.SpotLight(0xf5f5f5, 2.1, 11, Math.PI / 6.5, 0.45, 1.4);
doorSpot.position.set(safeWestWallX - 3, WALL_H - 0.2, safeDoorZ);
doorSpot.target = doorSpotTarget;
scene.add(doorSpot);

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
  // "Up to scale" (on request) -- the house used to be a squat 0.8-unit
  // blob with a single pinprick window, too small to actually read as a
  // house rather than a smudge. Bigger niche, a body/roof with real house
  // proportions (taller than it is wide, an overhanging eave), and a
  // real door plus two windows on the face the player actually sees.
  const half = 1.3;
  const wz0 = boundaryZ(houseCell.cz), wz1 = boundaryZ(houseCell.cz + 1);
  // (The normal solid wall for this edge was already built above; this
  // punches an additional opening into it by adding a dark recessed box
  // rather than re-deriving the edge's wall kind -- simplest way to carve
  // a one-off anomaly into an otherwise-solid wall.)
  const nicheMat = new THREE.MeshStandardMaterial({ color: 0x1a140a, roughness: 1 });
  const niche = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, half * 2), nicheMat);
  niche.position.set(wallX - 0.7, 1.1, c.z);
  scene.add(niche);
  const houseMat = new THREE.MeshStandardMaterial({ color: 0xcf8f4a, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b2f2a, roughness: 0.8 });
  const bodyX = wallX - 0.8;
  const bodyY = 0.85;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.1), houseMat);
  body.position.set(bodyX, bodyY, c.z);
  scene.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.65, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(bodyX, bodyY + 0.5 + 0.325, c.z);
  scene.add(roof);
  const glow = new THREE.PointLight(0xffdca0, 0.9, 3.5, 2);
  glow.position.set(bodyX, bodyY, c.z);
  scene.add(glow);
  // Door and windows all on the room-facing side -- the side the player
  // is actually standing in front of -- rather than the original single
  // window, which faced into the back of the niche instead.
  const roomFaceX = bodyX - 0.5 - 0.02;
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.9 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.22), doorMat);
  door.position.set(roomFaceX, bodyY - 0.5 + 0.225, c.z);
  scene.add(door);
  const windowMat = new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffdca0, emissiveIntensity: 1.2 });
  for (const wz of [c.z - 0.32, c.z + 0.32]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.24), windowMat);
    win.position.set(roomFaceX, bodyY + 0.15, wz);
    win.rotation.y = Math.PI / 2;
    scene.add(win);
  }
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

/* ---------------- support pillars ---------------- */
/* Real Level 0 reference photos almost always show a square support
 * column standing in the middle of the open mustard-wallpapered rooms --
 * on request ("heres some images of what the main area should look like
 * aka the backrooms"). A handful of maze cells get one each, floor to
 * ceiling, wallpapered the same as the walls around it with a plain trim
 * band top and bottom like the reference photos. */
const PILLAR_W = 0.9;
const pillarCenters = [];
for (let i = 0; i < 6; i++) {
  const cell = pickPropCell(usedCells);
  usedCells.push(cell);
  const c = cellCenter(cell.cx, cell.cz);
  pillarCenters.push(c);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_W, WALL_H, PILLAR_W), wallMat);
  shaft.position.set(c.x, WALL_H / 2, c.z);
  scene.add(shaft);
  for (const y of [0.08, WALL_H - 0.08]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_W + 0.12, 0.14, PILLAR_W + 0.12), trimMat);
    band.position.set(c.x, y, c.z);
    scene.add(band);
  }
  boxColliders.push(new THREE.Box3(
    new THREE.Vector3(c.x - PILLAR_W / 2 - 0.06, 0, c.z - PILLAR_W / 2 - 0.06),
    new THREE.Vector3(c.x + PILLAR_W / 2 + 0.06, WALL_H, c.z + PILLAR_W / 2 + 0.06)
  ));
}

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

// You start inside the Safezone itself now, on request ("the safezone
// should be where you spawn") -- behind its own closed giant door, which
// starts shut (see safeDoor below), so the very first thing a new player
// does is find the lever and pull it before they can reach the maze at
// all. Computed from boundaryX/cellCenter/SAFE_DOOR_CZ directly rather
// than reusing safeRoomX0/SAFE_W (both declared later, in the Safezone
// section itself, which would be a temporal-dead-zone reference this
// early) -- 17 is "3 units in from the back (west) wall," which sits at
// boundaryX(0) - SAFE_W (20); keep this in sync if SAFE_W ever changes.
const SPAWN = (() => {
  const doorZ = cellCenter(0, SAFE_DOOR_CZ).z;
  const spawnX = boundaryX(0) - 17;
  return new THREE.Vector3(spawnX, EYE_H, doorZ);
})();
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

// Redrawn taller and thinner than the first pass, on request ("make the
// bacteria look like the one from the backrooms") -- fan descriptions of
// the actual Level 0 entity call it specifically "a long, black humanoid
// entity made from the wires of the ceiling," with claws rather than
// plain hands (the part that injects the bacteria). Every bone below is
// stretched further than a real human's own proportions would be, and
// the hands are now small claw-fans instead of wire spheres.
function createBacteriaModel() {
  const g = new THREE.Group();

  const torso = wireBone(0.06, 0.24, 0.95); // tapered harder than before -- narrow at the neck, draping wide at the hip, closer to the real reference art than a uniform pole
  torso.position.y = 1.2;
  g.add(torso);
  // A handful of thin cross-wires over the torso read as a ribcage
  // silhouette without needing a real mesh there at all.
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.01, 4, 8), wireMat);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = 0.8 + i * 0.18;
    g.add(rib);
  }
  // A draping cloak skirt over the hips -- on request ("look at pictures
  // of the bacteria, heres a example"), the reference art reads as a
  // wide, flowing dark drape over the body, not bare wire limbs the
  // whole way down.
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.75, 10, 1, true), wireMat);
  cloak.position.y = 1.25;
  g.add(cloak);
  const neck = wireBone(0.03, 0.04, 0.22); // noticeably longer than a human neck -- part of the "long" silhouette
  neck.position.y = 1.78;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), wireMat); // angular, cage-like, no face
  head.position.y = 1.97;
  g.add(head);
  // A wide flat-brimmed hat -- straight from the reference image, and it
  // reads immediately as the right silhouette even at a glance/distance.
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.015, 10), wireMat);
  hatBrim.position.y = 2.05;
  g.add(hatBrim);
  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.15, 8), wireMat);
  hatCrown.position.y = 2.135;
  g.add(hatCrown);

  const armPivots = [], elbowPivots = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.15, 1.62, 0);
    g.add(shoulder);
    const upper = wireBone(0.032, 0.042, 0.48);
    upper.position.y = -0.24;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.48;
    shoulder.add(elbow);
    const fore = wireBone(0.026, 0.032, 0.46);
    fore.position.y = -0.23;
    elbow.add(fore);
    // A claw -- three thin curved wire spikes fanned from the wrist,
    // standing in for "claws [that] inject a bacteria" rather than a
    // plain wire hand.
    const wrist = new THREE.Group();
    wrist.position.y = -0.47;
    elbow.add(wrist);
    for (let i = -1; i <= 1; i++) {
      const claw = wireBone(0.012, 0.002, 0.16);
      claw.position.set(i * 0.035, -0.08, 0.02);
      claw.rotation.x = 0.5 + Math.abs(i) * 0.25;
      wrist.add(claw);
    }
    armPivots.push(shoulder);
    elbowPivots.push(elbow);
  }

  const legPivots = [], kneePivots = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.085, 0.82, 0);
    g.add(hip);
    const thigh = wireBone(0.042, 0.048, 0.52);
    thigh.position.y = -0.26;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.52;
    hip.add(knee);
    const shin = wireBone(0.03, 0.042, 0.5);
    shin.position.y = -0.25;
    knee.add(shin);
    // A frizzy fan of thread-thin roots instead of a plain foot -- same
    // reference image, where each leg frays apart into loose strands at
    // the bottom rather than ending in a foot shape at all. Children of
    // the knee, so they swing with the rest of the walk cycle.
    const roots = new THREE.Group();
    roots.position.y = -0.5;
    knee.add(roots);
    for (let i = 0; i < 6; i++) {
      const root = wireBone(0.012, 0.002, 0.2 + rand() * 0.1);
      root.position.y = -0.1;
      root.rotation.x = (rand() - 0.5) * 1.3;
      root.rotation.z = (rand() - 0.5) * 1.3;
      roots.add(root);
    }
    legPivots.push(hip);
    kneePivots.push(knee);
  }

  g.userData.armPivots = armPivots;
  g.userData.elbowPivots = elbowPivots;
  g.userData.legPivots = legPivots;
  g.userData.kneePivots = kneePivots;
  g.userData.head = head;
  g.userData.torso = torso;
  g.userData.grabPoint = { y: 1.2 }; // torso height -- where the kill animation "grabs"
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

// Moved to the Mall (on request), not the maze -- it isn't on the maze's
// own grid at all now, so it moves the same way the Mimitor and Bloom do
// (a plain direct-seek against collidesAt) rather than BFS-pathing the
// maze's doorway graph. Its own distinctive rule is untouched by that
// change: it still only moves while the player isn't looking at it, and
// only once it's been looked at at least once.
const mannequin = {
  group: createMannequinModel(), pos: new THREE.Vector3(mallMannequinSpawnPos.x, 0, mallMannequinSpawnPos.z),
  facing: 0, discovered: false,
};
scene.add(mannequin.group);

function tickMannequin(dt, playerPos, camForward) {
  const dirToM = new THREE.Vector3(mannequin.pos.x - playerPos.x, 0, mannequin.pos.z - playerPos.z);
  const dist = dirToM.length();
  const lookedAt = dist < MANNEQUIN_SEE_RANGE && dist > 0.01 &&
    camForward.dot(dirToM.clone().normalize()) > MANNEQUIN_SEE_COS;

  let creeping = false;
  if (lookedAt) {
    mannequin.discovered = true;
  } else if (mannequin.discovered && dist > 0.3) {
    const nx = -dirToM.x / dist, nz = -dirToM.z / dist; // toward the player
    const stepX = mannequin.pos.x + nx * MANNEQUIN_CREEP_SPEED * dt;
    if (!collidesAt(stepX, mannequin.pos.z, false)) mannequin.pos.x = stepX;
    const stepZ = mannequin.pos.z + nz * MANNEQUIN_CREEP_SPEED * dt;
    if (!collidesAt(mannequin.pos.x, stepZ, false)) mannequin.pos.z = stepZ;
    if (mannequin.facing === undefined) mannequin.facing = Math.atan2(nx, nz);
    mannequin.facing = lerpAngle(mannequin.facing, Math.atan2(nx, nz), Math.min(1, dt * 7));
    creeping = true;
  }
  mannequin.group.position.set(mannequin.pos.x, 0, mannequin.pos.z);
  mannequin.group.rotation.y = mannequin.facing || 0;
  animateWalkCycle(mannequin, dt, creeping, creeping);
  const dist2 = Math.hypot(playerPos.x - mannequin.pos.x, playerPos.z - mannequin.pos.z);
  return { dist: dist2, danger: mannequin.discovered ? Math.max(0, 1 - dist2 / 12) : 0, catchR: MANNEQUIN_CATCH_R, type: 'mannequin', instance: mannequin };
}

/* ---------------- The Mimitor: a lanky, headless thing in the Pool Rooms ---------------- */
/* Replaces the old rubber-duck/grow gimmick entirely, on request ("get
 * rid of the monster in poolrooms and make it a lanky flesh body with no
 * head that walks around and only relys on touch and sound"). It's a
 * permanent, always-visible lanky flesh body down in the Pool Rooms, no
 * head at all -- just a rounded stump of flesh where one should be -- and
 * it has no eyes and no omniscient line on the player either. It doesn't
 * know where the player is by default; it just wanders the Pool Rooms
 * blind. The only things that give it away are sound (your own
 * footsteps, carrying further the louder you're moving -- sprint and it
 * can hear you from well across the room; crouch and it barely hears you
 * at all) and touch (bumping into it, or it into you, which is the same
 * contact-range catch every other entity in this game already uses). */

const fleshMat = new THREE.MeshStandardMaterial({ color: 0xab8e82, roughness: 0.8, map: makeGrainTexture({ size: 128, dark: 90, light: 180, repeat: 10, blotch: 5, tint: [0.78, 0.6, 0.55] }) }); // pale, mottled, not a clean skin tone
const woundMat = new THREE.MeshStandardMaterial({ color: 0x5a1f1a, roughness: 0.9 });

function createMimitorModel() {
  const g = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.62, 5, 8), fleshMat);
  torso.position.y = 1.05;
  g.add(torso);
  // Where a head should be -- just a rounded stump sealed over, no face,
  // no eyes, nothing looking back at all.
  const stump = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 7), fleshMat);
  stump.scale.set(1, 0.65, 1);
  stump.position.y = 1.44;
  g.add(stump);
  const scar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 5, 10), woundMat);
  scar.rotation.x = Math.PI / 2;
  scar.position.y = 1.4;
  g.add(scar);

  // Lanky -- noticeably longer arms and legs than a real human, the same
  // silhouette trick the Bacteria uses.
  const armPivots = [], elbowPivots = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.19, 1.32, 0);
    g.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.5, 4, 7), fleshMat);
    upper.position.y = -0.25;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.5;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.52, 4, 7), fleshMat);
    fore.position.y = -0.26;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), fleshMat);
    hand.position.y = -0.53;
    elbow.add(hand);
    armPivots.push(shoulder);
    elbowPivots.push(elbow);
  }

  const legPivots = [], kneePivots = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, 0.74, 0);
    g.add(hip);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.46, 4, 7), fleshMat);
    thigh.position.y = -0.23;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.44, 4, 7), fleshMat);
    shin.position.y = -0.22;
    knee.add(shin);
    legPivots.push(hip);
    kneePivots.push(knee);
  }

  g.userData.armPivots = armPivots;
  g.userData.elbowPivots = elbowPivots;
  g.userData.legPivots = legPivots;
  g.userData.kneePivots = kneePivots;
  g.userData.torso = torso;
  g.userData.grabPoint = { y: 1.05 };
  return g;
}
const MIMITOR_WANDER_SPEED = RUN_SPEED * 0.3;
const MIMITOR_CHASE_SPEED = RUN_SPEED * 1.1;
const MIMITOR_CATCH_R = 1.0;
const MIMITOR_BASE_NOISE_R = 3.2; // always audible this close -- footsteps, breathing
const MIMITOR_SPRINT_NOISE_R = 15; // sprinting carries much further across the Pool Rooms
const MIMITOR_CROUCH_NOISE_MUL = 0.4;

const mimitor = {
  group: createMimitorModel(), pos: new THREE.Vector3(mimitorSpawnPos.x, 0, mimitorSpawnPos.z),
  facing: 0, alert: false, alertTimer: 0, wanderTarget: null, wanderTimer: 0,
};
scene.add(mimitor.group);

function tickMimitor(dt, playerPos) {
  const dx = playerPos.x - mimitor.pos.x, dz = playerPos.z - mimitor.pos.z;
  const dist = Math.hypot(dx, dz);

  let noiseR = MIMITOR_BASE_NOISE_R;
  if (crouching) noiseR *= MIMITOR_CROUCH_NOISE_MUL;
  else if (keys.shift) noiseR = MIMITOR_SPRINT_NOISE_R;
  if (dist < noiseR) { mimitor.alert = true; mimitor.alertTimer = 3; }
  else if (mimitor.alertTimer > 0) mimitor.alertTimer -= dt;
  else mimitor.alert = false;

  let moving = false;
  if (mimitor.alert) {
    // Heard something -- close in on exactly where the sound came from.
    if (dist > 0.3) {
      const nx = dx / dist, nz = dz / dist;
      const stepX = mimitor.pos.x + nx * MIMITOR_CHASE_SPEED * dt;
      if (!collidesAt(stepX, mimitor.pos.z, false)) mimitor.pos.x = stepX;
      const stepZ = mimitor.pos.z + nz * MIMITOR_CHASE_SPEED * dt;
      if (!collidesAt(mimitor.pos.x, stepZ, false)) mimitor.pos.z = stepZ;
      mimitor.facing = lerpAngle(mimitor.facing || 0, Math.atan2(nx, nz), Math.min(1, dt * 6));
      moving = true;
    }
  } else {
    // No idea where the player actually is -- just blind wandering
    // around the Pool Rooms until something gives them away.
    mimitor.wanderTimer -= dt;
    if (!mimitor.wanderTarget || mimitor.wanderTimer <= 0) {
      mimitor.wanderTarget = {
        x: POOL_BOUNDS.x0 + 1.5 + rand() * (POOL_BOUNDS.x1 - POOL_BOUNDS.x0 - 3),
        z: POOL_BOUNDS.z0 + 1.5 + rand() * (POOL_BOUNDS.z1 - POOL_BOUNDS.z0 - 3),
      };
      mimitor.wanderTimer = 4 + rand() * 4;
    }
    const wx = mimitor.wanderTarget.x - mimitor.pos.x, wz = mimitor.wanderTarget.z - mimitor.pos.z;
    const wdist = Math.hypot(wx, wz);
    if (wdist > 0.5) {
      const nx = wx / wdist, nz = wz / wdist;
      const stepX = mimitor.pos.x + nx * MIMITOR_WANDER_SPEED * dt;
      if (!collidesAt(stepX, mimitor.pos.z, false)) mimitor.pos.x = stepX;
      const stepZ = mimitor.pos.z + nz * MIMITOR_WANDER_SPEED * dt;
      if (!collidesAt(mimitor.pos.x, stepZ, false)) mimitor.pos.z = stepZ;
      mimitor.facing = lerpAngle(mimitor.facing || 0, Math.atan2(nx, nz), Math.min(1, dt * 3));
      moving = true;
    } else {
      mimitor.wanderTimer = 0;
    }
  }

  mimitor.group.position.set(mimitor.pos.x, 0, mimitor.pos.z);
  mimitor.group.rotation.y = mimitor.facing || 0;
  animateWalkCycle(mimitor, dt, moving, mimitor.alert);
  return { dist, danger: mimitor.alert ? Math.max(0, 1 - dist / 10) : 0, catchR: MIMITOR_CATCH_R, type: 'mimitor', instance: mimitor };
}

/* ---------------- Bloom: a rolling giant with a sun for a face ---------------- */
/* Lives in the Mall, like the Mannequin now does -- on request ("bloom...
 * it looks like the rolling giant but its face is a sun"). The Rolling
 * Giant it's modeled on (a Kane Pixels Backrooms creature) is "a gigantic
 * living puppet with wheels instead of feet"; Bloom keeps that puppet
 * body and the wheels in place of legs, but swaps its head for a flat,
 * radiant sun disc with rays fanned around the rim. Moves the same
 * direct-seek way the Mimitor and (now) the Mannequin do -- it isn't on
 * the maze's own grid either. */

const bloomWoodMat = new THREE.MeshStandardMaterial({ color: 0x47453f, roughness: 0.92, map: makeGrainTexture({ size: 128, dark: 35, light: 95, repeat: 8, blotch: 4, tint: [0.92, 0.9, 0.84] }) }); // desaturated grey, not warm wood -- a decayed, washed-out puppet rather than a toy, on request ("analog horror")
const bloomJointMat = new THREE.MeshStandardMaterial({ color: 0x3a2815, roughness: 0.7 });
const bloomWheelMat = new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.6 });
const sunMat = new THREE.MeshStandardMaterial({ color: 0xffdd55, emissive: 0xffbb22, emissiveIntensity: 1.6, roughness: 0.4 });
const sunRayMat = new THREE.MeshStandardMaterial({ color: 0xffe79a, emissive: 0xffaa22, emissiveIntensity: 1.3, roughness: 0.4 });
const sunEyeMat = new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff2200, emissiveIntensity: 1.9, roughness: 0.4 }); // angry glowing-red, not the flat dark dot the first pass used
const blanketMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95, side: THREE.DoubleSide });

function createBloomModel() {
  const g = new THREE.Group();

  // Taller and noticeably skinnier than the first pass, on request --
  // thinner radii throughout, and height stretched from the wheel tops
  // (1.5) up to a much higher shoulder line.
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 2.6, 10), bloomWoodMat);
  torso.position.y = 2.8;
  g.add(torso);
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.045, 6, 14), bloomJointMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.8 + i * 0.7;
    g.add(band);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.45, 8), bloomJointMat);
  neck.position.y = 4.3;
  g.add(neck);

  // The face itself -- a flat radiant sun disc with triangular rays
  // fanned around its rim, standing in for a head entirely, plus a
  // simple dark-printed eyes/mouth so it still reads as looking at you.
  const faceGroup = new THREE.Group();
  faceGroup.position.y = 4.75;
  g.add(faceGroup);
  const sunDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 16), sunMat);
  sunDisc.rotation.x = Math.PI / 2;
  faceGroup.add(sunDisc);
  const RAYS = 10;
  for (let i = 0; i < RAYS; i++) {
    const ang = (i / RAYS) * Math.PI * 2;
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.36, 4), sunRayMat);
    ray.position.set(Math.cos(ang) * 0.62, Math.sin(ang) * 0.62, 0.02);
    ray.rotation.z = ang - Math.PI / 2;
    faceGroup.add(ray);
  }
  // Angry glowing-red slit eyes (angled inward/down) and a jagged row of
  // small teeth under a dark mouth backdrop -- replacing the first pass's
  // flat dark dots/bar, on request ("make the bloom's face scarier").
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.02), sunEyeMat);
    eye.position.set(side * 0.17, 0.08, 0.066);
    eye.rotation.z = side * -0.35;
    faceGroup.add(eye);
  }
  const mouthBack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.11, 0.015), bloomJointMat);
  mouthBack.position.set(0, -0.13, 0.062);
  faceGroup.add(mouthBack);
  const TEETH = 6;
  for (let i = 0; i < TEETH; i++) {
    const tx = -0.125 + (i / (TEETH - 1)) * 0.25;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 4), sunEyeMat);
    tooth.position.set(tx, -0.095, 0.072);
    tooth.rotation.x = Math.PI;
    faceGroup.add(tooth);
  }

  // A ragged black cloth draped over the body (shoulders down to the
  // wheels), not the head/face -- on request. An open-ended tapered
  // cylinder rather than a flat panel so it wraps all the way around the
  // torso, not just the front; per-vertex jitter plus an uneven bottom
  // hem (baked in once below) keep its rest shape from reading as a
  // perfect cone. The real per-frame sway/flutter (its own "physics",
  // cheap sine displacement rather than a real cloth sim) lives in
  // tickBloom, driven off blanketBase (the undisturbed rest positions
  // stored here so the sway can be recomputed fresh every frame instead
  // of compounding drift onto itself).
  const blanketGeo = new THREE.CylinderGeometry(0.5, 1.1, 3.4, 14, 6, true);
  const bPos = blanketGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    const x = bPos.getX(i), y = bPos.getY(i), z = bPos.getZ(i);
    const r = Math.hypot(x, z), ang = Math.atan2(z, x);
    const jitter = 1 + (Math.sin(ang * 5) * 0.06 + Math.sin(ang * 11 + 1) * 0.04);
    let ny = y;
    if (y < -1.5) ny -= Math.abs(Math.sin(ang * 7)) * 0.18; // ragged hem, bottom ring only
    bPos.setXYZ(i, Math.cos(ang) * r * jitter, ny, Math.sin(ang) * r * jitter);
  }
  bPos.needsUpdate = true;
  blanketGeo.computeVertexNormals();
  const blanketBase = new Float32Array(bPos.array.length);
  blanketBase.set(bPos.array);
  const blanket = new THREE.Mesh(blanketGeo, blanketMat);
  blanket.position.y = 2.6; // shoulders down past the torso, well clear of the neck (4.3) and face (4.75)
  g.add(blanket);

  // Dangling jointed puppet arms -- no articulated walk (it doesn't walk
  // at all), just a slow idle sway driven straight off a sine wave in
  // tickBloom, selling "loosely hung from strings" rather than limbs
  // doing any real work.
  const armGroupL = new THREE.Group(); armGroupL.position.set(-0.5, 4.0, 0); g.add(armGroupL);
  const armGroupR = new THREE.Group(); armGroupR.position.set(0.5, 4.0, 0); g.add(armGroupR);
  for (const arm of [armGroupL, armGroupR]) {
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 1.3, 4, 6), bloomWoodMat); // thinner, longer -- skinnier limbs on a taller frame
    upper.position.y = -0.7;
    arm.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), bloomJointMat);
    hand.position.y = -1.4;
    arm.add(hand);
  }

  // Wheels instead of feet/legs -- the Rolling Giant's own signature.
  // Each wheel's geometry is pre-rotated (axle along local X) so the
  // per-frame spin in tickBloom is a plain rotation.x, not a composed
  // Euler mess on top of a static reorientation.
  const wheelPivots = [];
  for (const side of [-1, 1]) {
    const wheelGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.35, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheel = new THREE.Mesh(wheelGeo, bloomWheelMat);
    wheel.position.set(side * 0.45, 0.75, 0);
    g.add(wheel);
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.06), bloomJointMat);
      spoke.rotation.x = (i / 6) * Math.PI;
      wheel.add(spoke);
    }
    wheelPivots.push(wheel);
  }

  g.userData.armGroupL = armGroupL;
  g.userData.armGroupR = armGroupR;
  g.userData.wheelPivots = wheelPivots;
  g.userData.faceGroup = faceGroup;
  g.userData.blanket = blanket;
  g.userData.blanketBase = blanketBase;
  g.userData.grabPoint = { y: 2.8 };
  return g;
}

// Redesigned on request: a true lurker now, not a roamer -- it doesn't
// move at all (not even wheel-spin) until you're within BLOOM_WAKE_RANGE,
// then closes at 2x your own run speed ("it should be 2x your speed"),
// but turns to face you slowly (BLOOM_TURN_RATE) rather than snapping --
// and critically, it actually DRIVES in whatever direction it's currently
// facing, not a direct bee-line at you, so a bad turn costs it real
// distance instead of just looking wrong ("horrible at turning").
const BLOOM_WAKE_RANGE = 14;
const BLOOM_CHASE_SPEED = RUN_SPEED * 2;
const BLOOM_TURN_RATE = 0.8;
const BLOOM_CATCH_R = 1.6; // bigger than the other three -- it's a giant

const bloom = {
  group: createBloomModel(), pos: new THREE.Vector3(bloomSpawnPos.x, 0, bloomSpawnPos.z),
  facing: 0, alert: false, alertTimer: 0, wheelSpin: 0, swingSeed: rand() * 100,
};
scene.add(bloom.group);

function tickBloom(dt, playerPos) {
  const dx = playerPos.x - bloom.pos.x, dz = playerPos.z - bloom.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < BLOOM_WAKE_RANGE) { bloom.alert = true; bloom.alertTimer = 6; }
  else if (bloom.alertTimer > 0) bloom.alertTimer -= dt;
  else bloom.alert = false;

  let moving = false;
  if (bloom.alert && dist > 0.3) {
    const targetFacing = Math.atan2(dx, dz);
    if (bloom.facing === undefined) bloom.facing = targetFacing;
    bloom.facing = lerpAngle(bloom.facing, targetFacing, Math.min(1, dt * BLOOM_TURN_RATE));
    const nx = Math.sin(bloom.facing), nz = Math.cos(bloom.facing);
    const stepX = bloom.pos.x + nx * BLOOM_CHASE_SPEED * dt;
    if (!collidesAt(stepX, bloom.pos.z, false)) bloom.pos.x = stepX;
    const stepZ = bloom.pos.z + nz * BLOOM_CHASE_SPEED * dt;
    if (!collidesAt(bloom.pos.x, stepZ, false)) bloom.pos.z = stepZ;
    bloom.wheelSpin += BLOOM_CHASE_SPEED * dt * 1.4;
    moving = true;
  }
  bloom.group.position.set(bloom.pos.x, 0, bloom.pos.z);
  bloom.group.rotation.y = bloom.facing || 0;
  const ud = bloom.group.userData;
  for (const wheel of ud.wheelPivots) wheel.rotation.x = bloom.wheelSpin;
  const now = performance.now();
  const sway = Math.sin(now * 0.0015 + bloom.swingSeed) * 0.12;
  ud.armGroupL.rotation.z = sway;
  ud.armGroupR.rotation.z = -sway;
  // The blanket's own cheap "physics" -- a per-vertex sine sway recomputed
  // fresh every frame from its stored rest positions (blanketBase), so it
  // never compounds drift onto itself. Bigger and faster while it's
  // actually rolling after you than while it's just idling.
  {
    const t = now * 0.0012;
    const base = ud.blanketBase;
    const posAttr = ud.blanket.geometry.attributes.position;
    const amp = (moving ? 1 : 0.35) * (bloom.alert ? 1.3 : 1);
    for (let i = 0; i < posAttr.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
      const hFactor = 1 - (by + 1.7) / 3.4; // ~0 near the top hem, ~1 near the bottom -- more sway lower down, like real hanging cloth
      const swayX = Math.sin(t * 2 + by * 1.5 + bx * 0.8) * 0.06 * hFactor * amp;
      const swayZ = Math.cos(t * 1.7 + by * 1.2 + bz * 0.6) * 0.05 * hFactor * amp;
      posAttr.setX(i, bx + swayX);
      posAttr.setZ(i, bz + swayZ);
    }
    posAttr.needsUpdate = true;
  }
  const dist2 = Math.hypot(playerPos.x - bloom.pos.x, playerPos.z - bloom.pos.z);
  return { dist: dist2, danger: bloom.alert ? Math.max(0, 1 - dist2 / 20) : 0, catchR: BLOOM_CATCH_R, type: 'bloom', instance: bloom };
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
  // keeps existing wherever it already was, and its direct-seek movement
  // (see tickMannequin) re-aims at your new position on the very next
  // frame with no path-refresh delay to wait out, so it's visibly still
  // coming.
  // The Mimitor isn't tied to the catcher's own position the way the
  // other two are reset relative to it -- it just goes back to its own
  // spot in the Pool Rooms, blind and wandering again, same as the
  // Bacteria's clean reset.
  mimitor.pos.set(mimitorSpawnPos.x, 0, mimitorSpawnPos.z);
  mimitor.alert = false;
  mimitor.alertTimer = 0;
  mimitor.wanderTarget = null;
  mimitor.wanderTimer = 0;
  // Bloom resets clean too -- back to its own spot in the Mall, dormant
  // again, same as the Bacteria and the Mimitor.
  bloom.pos.set(bloomSpawnPos.x, 0, bloomSpawnPos.z);
  bloom.alert = false; bloom.alertTimer = 0;
}

const monstersByType = { bacteria, mannequin, mimitor, bloom };
// Longer than a generic shake needs, since each one is now a real few-
// beat sequence (see updateScareCamera) -- Mannequin's "grab, lift, snap,
// drop" and Bacteria's "entangle, yank, release" both need the room to
// actually read as those beats rather than one blurred jolt.
const SCARE_DURATION = { bacteria: 1.0, mannequin: 1.3, mimitor: 1.1, bloom: 1.2 };
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
  const ud = m.group.userData;
  // Every rig's own origin is its feet (y=0), not its face -- placing
  // the group's raw position at facePos (which sits at the camera's own
  // eye height) put each monster's FEET at your eyes and its head looming
  // somewhere above your own view, which is what actually read as "it's
  // on top of you" rather than "it's in your face." Each model already
  // carries its own grabPoint (the height its kill animation targets --
  // torso, neck, chest, whatever makes sense for that rig); dropping the
  // placement down by that same height instead lines the right part of
  // the model up with your eye line.
  const grabY = (ud.grabPoint && typeof ud.grabPoint.y === 'number') ? ud.grabPoint.y : 1.5;
  m.group.position.copy(facePos).add(new THREE.Vector3(0, -grabY, 0));
  m.group.lookAt(scareCamBase);
  // Neutral pose going in -- the per-type animation below poses limbs
  // itself from here, so a leftover walk-cycle angle doesn't bleed in.
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
    // It lunges the last of the distance the instant it makes contact --
    // no grab, no reach, just the blind headless thing closing in on you
    // by touch -> a short, violent juddering hold -> everything goes
    // black and stays there, same "it goes black" ending shape as the
    // Bacteria's.
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
  } else if (scareType === 'bloom') {
    // No grab (it's a rolling giant, not something with reach) -- it
    // just rolls straight over you. A hard downward lurch as it crushes
    // past, one violent shake under the weight, then holds, crushed low.
    const crushPos = scareCamBase.clone().addScaledVector(UP, -0.4);
    if (p < 0.3) {
      const t = ease(p / 0.3);
      camera.position.copy(scareCamBase).lerp(crushPos, t);
    } else if (p < 0.65) {
      const t = (p - 0.3) / 0.35;
      const amt = 0.45 * Math.sin(Math.min(t, 1) * Math.PI);
      camera.position.copy(crushPos);
      camera.position.x += shake(amt); camera.position.y += shake(amt * 0.6); camera.position.z += shake(amt);
    } else {
      camera.position.copy(crushPos);
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
    // A wet, guttural groan pitch-bent further down, under the same
    // short noise burst the others use for the actual impact.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.7, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.5);
  } else if (type === 'bloom') {
    // A low, grinding wheel-roll swell under a heavy wooden-creak thud --
    // a giant rolling over you, not a shriek.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(70, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.9, now + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.7);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const ng = ctx.createGain(); ng.gain.value = 0.5;
    noise.connect(ng).connect(master);
    noise.start(now);
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
let photosTabActive = false;
tabButtons.forEach((btn) => btn.addEventListener('click', () => {
  showCustomizeTab(btn.dataset.tab);
  photosTabActive = btn.dataset.tab === 'photos';
  if (btn.dataset.tab === 'bestiary') showCatalogEntry(catalogIndex);
  if (photosTabActive) renderPhotosGrid();
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

// The actual captured images themselves (a real toDataURL() snapshot of
// the frame you took it in, one per artifact, the latest capture winning
// if you photograph the same spot twice) -- separate from `photographed`
// above, which is just the permanent unlock flag the Catalog tab reads.
// On request ("a computer where you can see all your photos and it shows
// if you found the spot").
const PHOTOS_KEY = 'subliminal_photos';
let photoImages = {};
try {
  const ph = localStorage.getItem(PHOTOS_KEY); if (ph) photoImages = JSON.parse(ph);
} catch (err) { /* ignore */ }
function savePhotoImage(id, dataUrl) {
  photoImages[id] = dataUrl;
  try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(photoImages)); } catch (err) { /* storage quota or unavailable -- the permanent unlock flag above already persisted regardless, this just means the thumbnail itself won't stick around */ }
}
function markDied(type) {
  if (died.has(type)) return;
  died.add(type);
  try { localStorage.setItem(DIED_KEY, JSON.stringify([...died])); } catch (err) { /* ignore */ }
}

// The Photos tab -- the actual captured snapshot (photoImages[id], saved
// by takePhoto() above) for each spot you've found, or a locked "not
// found yet" tile for one you haven't, on request ("a computer where you
// can see all your photos and it shows if you found the spot").
function renderPhotosGrid() {
  const grid = document.getElementById('photos-grid');
  grid.innerHTML = '';
  for (const art of ARTIFACTS) {
    const tile = document.createElement('div');
    tile.className = 'photo-tile';
    if (photographed.has(art.id) && photoImages[art.id]) {
      const img = document.createElement('img');
      img.src = photoImages[art.id];
      img.alt = art.name;
      tile.appendChild(img);
      const label = document.createElement('div');
      label.className = 'photo-label';
      label.textContent = art.name;
      tile.appendChild(label);
    } else {
      tile.classList.add('locked');
      const q = document.createElement('div');
      q.className = 'photo-q';
      q.textContent = '?';
      tile.appendChild(q);
      const label = document.createElement('div');
      label.className = 'photo-label';
      label.textContent = 'Not found yet';
      tile.appendChild(label);
    }
    grid.appendChild(tile);
  }
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
  { kind: 'monster', id: 'mimitor', name: 'The Wretch', make: () => createMimitorModel() },
  { kind: 'monster', id: 'bloom', name: 'Bloom', make: createBloomModel },
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
  if (e.code === 'KeyE' && camera.position.distanceTo(leverCenter) < 2.5) toggleSafeDoor();
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
  const hits = [];
  for (const art of ARTIFACTS) {
    const dir = new THREE.Vector3(art.pos.x - camera.position.x, 0, art.pos.z - camera.position.z);
    const dist = dir.length();
    if (dist > PHOTO_RANGE) continue;
    dir.normalize();
    if (forward.dot(dir) > PHOTO_COS) { markPhotographed(art.id); hits.push(art.id); }
  }
  if (hits.length) {
    try {
      renderer.render(scene, camera); // the frame on screen right now, read back fresh rather than trusting whatever's still in the backing buffer
      const dataUrl = renderer.domElement.toDataURL('image/jpeg', 0.55);
      for (const id of hits) savePhotoImage(id, dataUrl);
      if (photosTabActive) renderPhotosGrid();
    } catch (err) { /* canvas readback can fail (e.g. a tainted context) -- the permanent unlock above already happened regardless */ }
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
    if (cl.panel) cl.panel.visible = near;
    if (!near) continue;
    let t = cl.base * (0.85 + 0.15 * Math.sin(now * 0.004 + cl.seed));
    if (cl.broken && Math.sin(now * 0.0017 + cl.seed * 3) > 0.985) t *= 0.15;
    cl.light.intensity = t;
    if (cl.panel) cl.panel.material.emissiveIntensity = (t / cl.base) * (cl.broken ? 0.9 : 1.3);
  }
  if (redBulbMesh) redBulbMesh.material.emissiveIntensity = 1.2 + Math.sin(now * 0.006) * 0.4;

  if (scareActive) {
    const t = (now - scareStart) / 1000;
    const duration = SCARE_DURATION[scareType] || 0.6;
    updateScareCamera(Math.min(t / duration, 1));
  } else if ((isLocked() || fallbackLook) && !customizeOpen) {
    movePlayer(dt);

    const nearKeyboard = camera.position.distanceTo(keyboardCenter) < 3.2;
    const nearLever = camera.position.distanceTo(leverCenter) < 2.5;
    if (nearKeyboard) { interactHint.textContent = 'Press E to use the computer'; interactHint.classList.add('show'); }
    else if (nearLever) {
      interactHint.textContent = safeDoor.state === 'closed' ? 'Press E to pull the lever'
        : safeDoor.state === 'open' ? 'Press E to pull the lever'
        : 'The door is moving...';
      interactHint.classList.add('show');
    }
    else interactHint.classList.remove('show');
    tickSafeDoor(dt);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const results = [
      tickBacteria(dt, camera.position),
      tickMannequin(dt, camera.position, forward),
      tickMimitor(dt, camera.position),
      tickBloom(dt, camera.position),
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
