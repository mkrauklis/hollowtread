/* The In-Between -- the actual playable scene. Classic (non-module)
 * script, same reason as before: ES modules are blocked entirely over
 * file://, which would break double-clicking game.html. */

function boot() {

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb6d8);

const EYE_H = 1.65;
// A much wider FOV than a normal game, on request ("dreamcore by Tlön
// Industries") -- that brand's own photos are all shot on an extreme
// wide-angle/fisheye lens, bowing straight lines out toward the edges of
// frame. A true fisheye warp needs a shader we don't have a build step
// for; a very wide rectilinear FOV gets a lot of the same exaggerated,
// slightly-wrong-feeling perspective cheaply.
const camera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.05, 200);
let yaw = Math.PI, pitch = 0; // facing +z -- toward the lab -- from the parking-lot spawn
camera.position.set(0, EYE_H, 0);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.getElementById('game-root').appendChild(renderer.domElement);
renderer.domElement.classList.add('game-canvas');
function resizeRenderer() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
resizeRenderer();
window.addEventListener('resize', resizeRenderer);

// Dimmer ambient, and the sun now actually casts real shadows -- on
// request ("the facility should be darker"), the roof genuinely blocks
// daylight now instead of every interior surface being lit as brightly
// as the parking lot outside it.
scene.add(new THREE.AmbientLight(0x9a988c, 0.3));
const sun = new THREE.DirectionalLight(0xfff3dd, 1.15);
sun.position.set(20, 42, -8);
sun.target.position.set(0, 0, 22);
scene.add(sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -25;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 110;
sun.shadow.bias = -0.0015;
scene.add(sun);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* ---------------- collision (AABB-vs-circle, height-aware) ---------------- */
/* Height-aware (checks the collider's own y-range against the player's
 * own feet-to-head band, not just x/z) specifically so a house's own
 * walls stop blocking once you're standing on its roof rather than
 * walking around inside it -- a plain 2D check would still think you're
 * "inside the walls" even once you've climbed above them. */
const boxColliders = [];
const PLAYER_R = 0.35, PLAYER_H = 1.7;
function collidesAt(x, z, feetY) {
  const headY = (feetY === undefined ? 0 : feetY) + PLAYER_H;
  const fy = feetY === undefined ? 0 : feetY;
  for (const b of boxColliders) {
    if (x > b.min.x - PLAYER_R && x < b.max.x + PLAYER_R && z > b.min.z - PLAYER_R && z < b.max.z + PLAYER_R) {
      if (headY > b.min.y + 0.05 && fy < b.max.y - 0.05) return true;
    }
  }
  return false;
}
// A cheap procedural grain texture, on request ("make the game have
// better textures") -- a mottled noise tile rather than a single flat
// color, reused across the lab's concrete/floor and the houses' siding.
function makeNoiseTexture(hex, dark, light, repeat) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(hex);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = dark + Math.random() * (light - dark);
    img.data[i] = Math.min(255, base.r * 255 * v);
    img.data[i + 1] = Math.min(255, base.g * 255 * v);
    img.data[i + 2] = Math.min(255, base.b * 255 * v);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}
// A real vertical-gradient sky (deep saturated blue up top fading to a
// paler blue at the horizon), on request (a reference photo) -- a flat
// single color read as too uniform/synthetic next to it.
function makeSkyGradientTexture(topHex, bottomHex) {
  const w = 8, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, topHex);
  grad.addColorStop(1, bottomHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return new THREE.CanvasTexture(canvas);
}

function wallBox(x0, x1, y0, y1, z0, z1, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  boxColliders.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
  return mesh;
}

/* ---------------- the parking lot ---------------- */
const asphaltTex = new THREE.TextureLoader().load('textures/asphalt.png');
asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
asphaltTex.repeat.set(14, 10);
const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 });
const lineMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.8 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), asphaltMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
for (let i = -4; i <= 4; i++) {
  if (i === 0) continue;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 6), lineMat);
  stripe.position.set(i * 2.6, 0.006, -9);
  scene.add(stripe);
}

const carMats = [0xb33a3a, 0x3a5fb3, 0x9a9a9a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.3 }));
function buildCar(x, z, rotY, mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 4), mat);
  body.position.y = 0.5;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.1), mat);
  cabin.position.set(0, 0.95, -0.3);
  g.add(cabin);
  for (const [wx, wz] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.7 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.32, wz);
    g.add(wheel);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  const half = new THREE.Vector2(1.1, 2.2);
  boxColliders.push(new THREE.Box3(new THREE.Vector3(x - half.x, 0, z - half.y), new THREE.Vector3(x + half.x, 1.3, z + half.y)));
}
buildCar(-9, -4, 0.15, carMats[0]);
buildCar(8, -6, -0.25, carMats[1]);
buildCar(-10, 5, 0.3, carMats[2]);
buildCar(10, 3, -0.1, carMats[0]);

// A plain white picket fence along the lot's far sides -- a small nod to
// the title screen's own background art -- also doubles as the lot's
// play boundary so you can't wander off into the void.
const fenceMat = new THREE.MeshStandardMaterial({ color: 0xece8dc, roughness: 0.6 });
const fenceGlitchMats = [
  new THREE.MeshStandardMaterial({ color: 0xff2040, emissive: 0xff2040, emissiveIntensity: 0.9, transparent: true, opacity: 0.6 }),
  new THREE.MeshStandardMaterial({ color: 0x20e0ff, emissive: 0x20e0ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.6 }),
];
function buildFenceRun(x0, z0, x1, z1, glitch) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const count = Math.round(len / 0.9);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.06), fenceMat);
  rail.position.set((x0 + x1) / 2, 0.75, (z0 + z1) / 2);
  rail.rotation.y = -Math.atan2(dz, dx);
  scene.add(rail);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const px = x0 + dx * t, pz = z0 + dz * t;
    const picket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), fenceMat);
    picket.position.set(px, 0.5, pz);
    scene.add(picket);
    // A chromatic-fringe glitch accent right on the fence, on request (a
    // reference photo) -- thin red/cyan ghost copies offset a few
    // centimeters either side, same trick as the title screen's own
    // anaglyph look, just localized to the fence instead of the whole
    // screen.
    if (glitch) {
      for (let g = 0; g < 2; g++) {
        const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), fenceGlitchMats[g]);
        ghost.position.set(px + (g === 0 ? -0.05 : 0.05), 0.5, pz);
        scene.add(ghost);
      }
    }
  }
  boxColliders.push(new THREE.Box3(
    new THREE.Vector3(Math.min(x0, x1) - 0.1, 0, Math.min(z0, z1) - 0.1),
    new THREE.Vector3(Math.max(x0, x1) + 0.1, 1.1, Math.max(z0, z1) + 0.1)
  ));
}
buildFenceRun(-26, -18, 26, -18);
buildFenceRun(-26, -18, -26, 18);
buildFenceRun(26, -18, 26, 18);

/* ---------------- the lab building ---------------- */
const BLDG_X0 = -15, BLDG_X1 = 15, BLDG_Z0 = 20, BLDG_Z1 = 55;
const WALL_H = 5, WALL_T = 0.3;
const concreteMat = new THREE.MeshStandardMaterial({ map: makeNoiseTexture(0x8a8578, 0.75, 1.1, 5), roughness: 0.92 });
const DOOR_HALF = 1.5;

wallBox(BLDG_X0, -DOOR_HALF, 0, WALL_H, BLDG_Z0 - WALL_T / 2, BLDG_Z0 + WALL_T / 2, concreteMat);
wallBox(DOOR_HALF, BLDG_X1, 0, WALL_H, BLDG_Z0 - WALL_T / 2, BLDG_Z0 + WALL_T / 2, concreteMat);
wallBox(BLDG_X0 - WALL_T / 2, BLDG_X0 + WALL_T / 2, 0, WALL_H, BLDG_Z0, BLDG_Z1, concreteMat);
wallBox(BLDG_X1 - WALL_T / 2, BLDG_X1 + WALL_T / 2, 0, WALL_H, BLDG_Z0, BLDG_Z1, concreteMat);
const roof = new THREE.Mesh(new THREE.BoxGeometry(BLDG_X1 - BLDG_X0, 0.25, BLDG_Z1 - BLDG_Z0), concreteMat);
roof.position.set((BLDG_X0 + BLDG_X1) / 2, WALL_H + 0.125, (BLDG_Z0 + BLDG_Z1) / 2);
roof.castShadow = true;
roof.receiveShadow = true;
scene.add(roof);

const floorMat = new THREE.MeshStandardMaterial({ map: makeNoiseTexture(0x4e4c42, 0.7, 1.2, 10), roughness: 1 });
const interiorFloor = new THREE.Mesh(new THREE.PlaneGeometry(BLDG_X1 - BLDG_X0 - 0.4, BLDG_Z1 - BLDG_Z0 - 0.4), floorMat);
interiorFloor.rotation.x = -Math.PI / 2;
interiorFloor.position.set((BLDG_X0 + BLDG_X1) / 2, 0.002, (BLDG_Z0 + BLDG_Z1) / 2);
interiorFloor.receiveShadow = true;
scene.add(interiorFloor);

const signMat = new THREE.MeshStandardMaterial({ color: 0x2a6f4a, emissive: 0x1e4f34, emissiveIntensity: 0.8, roughness: 0.6 });
const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 0.15), signMat);
sign.position.set(0, WALL_H + 0.9, BLDG_Z0 - 0.3);
scene.add(sign);

// A real hallway, on request ("the facility should... have halls") --
// splits the building into a front room, a narrower corridor, and the
// back room the special door lives in, instead of one open box.
const HALL_HALF = 1.8, HALL_Z0 = 35, HALL_Z1 = 42;
wallBox(BLDG_X0, -HALL_HALF, 0, WALL_H, HALL_Z0 - 0.15, HALL_Z0 + 0.15, concreteMat);
wallBox(HALL_HALF, BLDG_X1, 0, WALL_H, HALL_Z0 - 0.15, HALL_Z0 + 0.15, concreteMat);
wallBox(BLDG_X0, -HALL_HALF, 0, WALL_H, HALL_Z0, HALL_Z1, concreteMat);
wallBox(HALL_HALF, BLDG_X1, 0, WALL_H, HALL_Z0, HALL_Z1, concreteMat);
wallBox(BLDG_X0, -HALL_HALF, 0, WALL_H, HALL_Z1 - 0.15, HALL_Z1 + 0.15, concreteMat);
wallBox(HALL_HALF, BLDG_X1, 0, WALL_H, HALL_Z1 - 0.15, HALL_Z1 + 0.15, concreteMat);
const hallLight = new THREE.PointLight(0xcfd8e0, 0.7, 9, 2);
hallLight.position.set(0, WALL_H - 0.3, (HALL_Z0 + HALL_Z1) / 2);
scene.add(hallLight);

// Flipped desks, scattered -- "the lab looks like a wasteland".
const deskMat = new THREE.MeshStandardMaterial({ color: 0x4a4536, roughness: 0.85 });
function buildFlippedDesk(x, z, rotY) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.7), deskMat);
  top.position.set(0, 0.45, 0.32);
  top.rotation.x = Math.PI * 0.42;
  g.add(top);
  for (const lx of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.75, 0.07), deskMat);
    leg.position.set(lx, 0.38, 0);
    leg.rotation.z = (lx > 0 ? -1 : 1) * 0.12;
    g.add(leg);
  }
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), deskMat);
  drawer.position.set(0.5, 0.18, -0.4);
  drawer.rotation.y = 0.3;
  g.add(drawer);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  boxColliders.push(new THREE.Box3(new THREE.Vector3(x - 0.9, 0, z - 0.9), new THREE.Vector3(x + 0.9, 0.9, z + 0.9)));
}
const deskSpots = [
  [-9, 27, 0.4], [-4, 25, -0.6], [6, 29, 1.1], [11, 33, -0.2], [-11, 31, 0.8],
  [0.8, 39, -1.3], [9, 44, 0.3], [-6, 47, -0.5], [4, 49, 1.4], [-2, 32, 0.2],
];
for (const [x, z, r] of deskSpots) buildFlippedDesk(x, z, r);

// A few toppled filing cabinets too, same wasteland clutter.
const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x5a5d52, roughness: 0.6, metalness: 0.3 });
function buildFallenCabinet(x, z, rotY) {
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), cabinetMat);
  cab.position.set(x, 0.25, z);
  cab.rotation.x = Math.PI / 2;
  cab.rotation.y = rotY;
  scene.add(cab);
  boxColliders.push(new THREE.Box3(new THREE.Vector3(x - 0.65, 0, z - 0.3), new THREE.Vector3(x + 0.65, 0.5, z + 0.3)));
}
buildFallenCabinet(-7, 33, 0.6);
buildFallenCabinet(7, 24, -0.3);
buildFallenCabinet(0, 45, 1.0);

// Cords hanging from the ceiling with the occasional random spark.
const cordMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
const sparkMat = new THREE.MeshStandardMaterial({ color: 0xfff7cc, emissive: 0xfff7cc, emissiveIntensity: 2.2 });
const cords = [];
function buildCord(x, z, len) {
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 5), cordMat);
  cord.position.set(x, WALL_H - len / 2, z);
  cord.rotation.z = (Math.random() - 0.5) * 0.15;
  scene.add(cord);
  const tipY = WALL_H - len;
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), sparkMat);
  spark.position.set(x, tipY, z);
  spark.visible = false;
  scene.add(spark);
  const light = new THREE.PointLight(0xfff7cc, 0, 4.5, 2);
  light.position.set(x, tipY, z);
  scene.add(light);
  cords.push({ spark, light, timer: 1.5 + Math.random() * 6, flashTime: 0 });
}
for (let i = 0; i < 9; i++) {
  buildCord(BLDG_X0 + 2 + Math.random() * (BLDG_X1 - BLDG_X0 - 4), BLDG_Z0 + 3 + Math.random() * (BLDG_Z1 - BLDG_Z0 - 6), 1.2 + Math.random() * 2.2);
}

// Flickering ceiling lights -- genuinely dim, a few actually broken.
const ceilingLights = [];
function buildCeilingLight(x, z) {
  const base = 0.6 + Math.random() * 0.3; // dimmer than the first pass, on request ("the facility should be darker")
  const light = new THREE.PointLight(0xcfd8e0, base, 12, 2);
  light.position.set(x, WALL_H - 0.3, z);
  scene.add(light);
  ceilingLights.push({ light, base, seed: Math.random() * 1000, broken: Math.random() < 0.45 });
}
for (let z = BLDG_Z0 + 6; z < BLDG_Z1 - 3; z += 8) {
  if (z > HALL_Z0 - 2 && z < HALL_Z1 + 2) {
    buildCeilingLight(0, z); // inside the narrow hallway -- one centered light, not two at +-5
  } else {
    buildCeilingLight(-5, z);
    buildCeilingLight(5, z);
  }
}

/* ---------------- the special door ---------------- */
const SPECIAL_DOOR_HALF = 1.3;
wallBox(BLDG_X0, -SPECIAL_DOOR_HALF, 0, WALL_H, BLDG_Z1 - WALL_T / 2, BLDG_Z1 + WALL_T / 2, concreteMat);
wallBox(SPECIAL_DOOR_HALF, BLDG_X1, 0, WALL_H, BLDG_Z1 - WALL_T / 2, BLDG_Z1 + WALL_T / 2, concreteMat);
const DOOR_H = WALL_H - 0.6;
const doorMat = new THREE.MeshStandardMaterial({ color: 0x6a6d70, roughness: 0.4, metalness: 0.5 });
const doorStripeMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.5 });
const specialDoor = new THREE.Mesh(new THREE.BoxGeometry(SPECIAL_DOOR_HALF * 2 - 0.1, DOOR_H, WALL_T), doorMat);
specialDoor.position.set(0, DOOR_H / 2, BLDG_Z1);
scene.add(specialDoor);
for (let i = 0; i < 3; i++) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(SPECIAL_DOOR_HALF * 2 - 0.3, 0.08, 0.05), doorStripeMat);
  bar.position.set(0, -DOOR_H / 2 + 0.6 + i * 1.1, WALL_T / 2 + 0.03);
  specialDoor.add(bar);
}
let doorColliderIdx = boxColliders.length;
boxColliders.push(new THREE.Box3().setFromObject(specialDoor));
const doorCenter = new THREE.Vector3(0, EYE_H, BLDG_Z1);

const doorLight = new THREE.PointLight(0xfff0c0, 1.2, 8, 2);
doorLight.position.set(0, WALL_H - 0.4, BLDG_Z1 - 1.5);
scene.add(doorLight);

/* ---------------- the hazmat figure ---------------- */
const hazmatMat = new THREE.MeshStandardMaterial({ color: 0xd8d4b0, roughness: 0.7 });
const visorMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.3 });
function createHazmatNPC() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), hazmatMat);
  torso.position.y = 1.1;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), hazmatMat);
  head.position.y = 1.75;
  g.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), visorMat);
  visor.position.set(0, 1.75, 0.16);
  g.add(visor);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.36, 1.45, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 6), hazmatMat);
    upper.position.y = -0.18;
    arm.add(upper);
    g.add(arm);
    arms.push(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.7, 4, 6), hazmatMat);
    leg.position.set(side * 0.15, 0.4, 0);
    g.add(leg);
  }
  g.userData.arms = arms;
  return g;
}
const hazmatNPC = createHazmatNPC();
hazmatNPC.position.set(1.1, 0, BLDG_Z1 - 1.1);
hazmatNPC.rotation.y = Math.PI;
hazmatNPC.visible = false;
scene.add(hazmatNPC);

/* ---------------- Level 1: "The Empty Suburb", far off in the same scene ---------------- */
/* A plain field under a flat, too-perfect sky, fenced in white picket
 * (same look as the parking lot's own fence) so there's no wandering off
 * the edge of the map. A few ordinary houses you can walk into (empty
 * inside -- that's the point). One house doesn't have a ground-level way
 * out at all: its own door is up on the roof, reached by carrying the
 * field's one ladder over and climbing it. */
const LEVEL1_CENTER = new THREE.Vector3(260, 0, 0);
const SUBURB_HALF = 35;

// Real rolling hills, on request (reference photos) -- a smooth, cheap
// sum-of-sines height field, flattened back to 0 near the houses, the
// path, the ladder spots, and the boundary fence (see hillStrength) so
// those don't end up pitched at an angle. groundHeightAt() below uses
// this same function for gravity/collision, so the player always stands
// exactly where the ground mesh actually is.
const HILL_AMP = 2.4;
function rawHillHeight(x, z) {
  const lx = x - LEVEL1_CENTER.x, lz = z - LEVEL1_CENTER.z;
  return HILL_AMP * (
    Math.sin(lx * 0.09 + 0.6) * Math.cos(lz * 0.07) * 0.6 +
    Math.sin(lx * 0.05 - lz * 0.04 + 1.4) * 0.4 +
    Math.cos(lz * 0.11 + lx * 0.02) * 0.3
  );
}
const flattenCircles = []; // { x, z, r0, r1 } -- filled in as houses/ladder spots are placed below
function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function hillStrength(x, z) {
  let s = 1;
  for (const c of flattenCircles) {
    const d = Math.hypot(x - c.x, z - c.z);
    s = Math.min(s, smoothstep((d - c.r0) / (c.r1 - c.r0)));
  }
  const half = SUBURB_HALF;
  const edgeDist = Math.min(half - Math.abs(x - LEVEL1_CENTER.x), half - Math.abs(z - LEVEL1_CENTER.z));
  s = Math.min(s, smoothstep((edgeDist - 1) / 5));
  s = Math.min(s, smoothstep((distanceToPath(x, z) - 1.4) / 2.6));
  return s;
}
function terrainHeight(x, z) { return rawHillHeight(x, z) * hillStrength(x, z); }

// A winding dirt path threading between the houses, on request
// (reference photos) -- distanceToPath() is also what keeps the ground
// flat directly under it (see hillStrength above).
const pathPts = [
  { x: 0, z: 29 }, { x: -6, z: 20 }, { x: -14, z: 10 }, { x: -10, z: 0 }, { x: -2, z: -8 }, { x: 6, z: -14 },
].map((p) => new THREE.Vector2(LEVEL1_CENTER.x + p.x, LEVEL1_CENTER.z + p.z));
function distanceToPath(x, z) {
  const p = new THREE.Vector2(x, z);
  let best = Infinity;
  for (let i = 0; i < pathPts.length - 1; i++) {
    const a = pathPts[i], b = pathPts[i + 1];
    const ab = new THREE.Vector2().subVectors(b, a);
    const t = Math.max(0, Math.min(1, new THREE.Vector2().subVectors(p, a).dot(ab) / ab.lengthSq()));
    const closest = new THREE.Vector2().copy(a).addScaledVector(ab, t);
    best = Math.min(best, p.distanceTo(closest));
  }
  return best;
}

const grassMat = new THREE.MeshStandardMaterial({ map: makeNoiseTexture(0x6b8f3f, 0.9, 1.08, 26), roughness: 1 }); // matched directly to the reference photo's richer olive-green -- a narrower noise range than the lab's own textures, so it reads as fine turf grain rather than blotches
const HILL_SEGS = 90;
const level1Geo = new THREE.PlaneGeometry(SUBURB_HALF * 2, SUBURB_HALF * 2, HILL_SEGS, HILL_SEGS);
level1Geo.rotateX(-Math.PI / 2);
const level1Ground = new THREE.Mesh(level1Geo, grassMat);
level1Ground.position.copy(LEVEL1_CENTER);
level1Ground.receiveShadow = true;
scene.add(level1Ground);
function sculptSuburbTerrain() {
  const pos = level1Geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + LEVEL1_CENTER.x, wz = pos.getZ(i) + LEVEL1_CENTER.z;
    pos.setY(i, terrainHeight(wx, wz));
  }
  pos.needsUpdate = true;
  level1Geo.computeVertexNormals();
}

const level1Light = new THREE.HemisphereLight(0xf0f4ff, 0x9fcf7e, 0.9);
scene.add(level1Light);
const suburbSun = new THREE.DirectionalLight(0xfff8ea, 0.7);
suburbSun.position.set(LEVEL1_CENTER.x + 20, 45, LEVEL1_CENTER.z + 10);
scene.add(suburbSun);

// A path strip, a touch above the (already-flattened) ground beneath it
// so it doesn't z-fight.
const pathMat = new THREE.MeshStandardMaterial({ map: makeNoiseTexture(0xb3a06a, 0.75, 1.1, 2), roughness: 1 });
for (let i = 0; i < pathPts.length - 1; i++) {
  const a = pathPts[i], b = pathPts[i + 1];
  const len = a.distanceTo(b);
  const mid = new THREE.Vector2().addVectors(a, b).multiplyScalar(0.5);
  const seg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, len + 0.6), pathMat);
  seg.rotation.x = -Math.PI / 2;
  seg.rotation.z = -Math.atan2(b.x - a.x, b.y - a.y);
  seg.position.set(mid.x, 0.03, mid.y);
  seg.receiveShadow = true;
  scene.add(seg);
}

const LEVEL1_SPAWN = new THREE.Vector3(pathPts[0].x, EYE_H, pathPts[0].y);
flattenCircles.push({ x: pathPts[0].x, z: pathPts[0].y, r0: 4, r1: 9 });

// The same white-picket-fence boundary as the parking lot, just enclosing
// the whole field this time -- "a white fence around the map that you
// cant exit". The ground right under it is flattened (see hillStrength),
// so the fence itself can stay a plain straight run.
buildFenceRun(LEVEL1_CENTER.x - SUBURB_HALF, LEVEL1_CENTER.z - SUBURB_HALF, LEVEL1_CENTER.x + SUBURB_HALF, LEVEL1_CENTER.z - SUBURB_HALF, true);
buildFenceRun(LEVEL1_CENTER.x - SUBURB_HALF, LEVEL1_CENTER.z + SUBURB_HALF, LEVEL1_CENTER.x + SUBURB_HALF, LEVEL1_CENTER.z + SUBURB_HALF, true);
buildFenceRun(LEVEL1_CENTER.x - SUBURB_HALF, LEVEL1_CENTER.z - SUBURB_HALF, LEVEL1_CENTER.x - SUBURB_HALF, LEVEL1_CENTER.z + SUBURB_HALF, true);
buildFenceRun(LEVEL1_CENTER.x + SUBURB_HALF, LEVEL1_CENTER.z - SUBURB_HALF, LEVEL1_CENTER.x + SUBURB_HALF, LEVEL1_CENTER.z + SUBURB_HALF, true);

// The water tower -- a landmark standing on one of the hills, same
// reference photos, purely decorative.
(function buildWaterTower() {
  const tx = LEVEL1_CENTER.x - 14, tz = LEVEL1_CENTER.z + 10;
  const baseY = rawHillHeight(tx, tz); // this one's NOT flattened -- it stands right on the hill itself
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.6, metalness: 0.2 });
  const g = new THREE.Group();
  for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5.5, 6), towerMat);
    leg.position.set(lx * 0.8, 2.75, lz * 0.8);
    leg.rotation.x = (lz > 0 ? -1 : 1) * 0.08;
    leg.rotation.z = (lx > 0 ? -1 : 1) * 0.08;
    g.add(leg);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 16), towerMat);
  tank.position.y = 6.6;
  g.add(tank);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.9, 16), towerMat);
  cap.position.y = 7.8;
  g.add(cap);
  g.position.set(tx, baseY, tz);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
})();

const houseWallMat = new THREE.MeshStandardMaterial({ map: makeNoiseTexture(0xe8d8a0, 0.85, 1.05, 4), roughness: 0.75 });
const houseTrimMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.5 }); // white window/corner trim, matched to the reference
const houseRoofMat = new THREE.MeshStandardMaterial({ color: 0xe0c4bf, roughness: 0.6 }); // the reference's own pale dusty-pink roof, not grey
const houseFloorMat = new THREE.MeshStandardMaterial({ color: 0xcfc9b0, roughness: 0.9 });
const windowGlassMat = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.25, metalness: 0.4 });
const HOUSE_WALL_T = 0.25;

// A real white-trimmed window, dark glass behind a cross-mullion frame --
// matched to the reference photo's own houses -- flush against a wall
// that runs along X at a fixed Z, facing +Z or -Z (faceSign).
function buildWindowOnZWall(wx, wallZ, y, faceSign) {
  const w = 0.8, h = 0.9;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.07), houseTrimMat);
  frame.position.set(wx, y, wallZ + faceSign * 0.13);
  scene.add(frame);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), windowGlassMat);
  glass.position.set(wx, y, wallZ + faceSign * 0.16);
  scene.add(glass);
  const mv = new THREE.Mesh(new THREE.BoxGeometry(0.045, h, 0.05), houseTrimMat);
  mv.position.set(wx, y, wallZ + faceSign * 0.155);
  scene.add(mv);
  const mh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.045, 0.05), houseTrimMat);
  mh.position.set(wx, y, wallZ + faceSign * 0.155);
  scene.add(mh);
}
// A white-trimmed door frame, matched the same way.
function buildDoorTrim(cx, wallZ, doorHalf, wallH, faceSign) {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 + 0.18, 2.15, 0.08), houseTrimMat);
  frame.position.set(cx, 1.075, wallZ + faceSign * 0.1);
  scene.add(frame);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 - 0.1, 2.0, 0.06), new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 0.6 }));
  slab.position.set(cx, 1.0, wallZ + faceSign * 0.13);
  scene.add(slab);
}

// An ordinary, walk-in, empty house -- door on the south face, four
// white-trimmed windows flanking it, a pitched roof (purely decorative,
// not walkable). Returns nothing; it's just set dressing with real walls
// you can't walk through.
function buildPlainHouse(cx, cz, w, d, wallH) {
  flattenCircles.push({ x: cx, z: cz, r0: Math.hypot(w, d) / 2 + 1, r1: Math.hypot(w, d) / 2 + 7 });
  const hw = w / 2, hd = d / 2, doorHalf = 0.85;
  wallBox(cx - hw, cx - doorHalf, 0, wallH, cz - hd - HOUSE_WALL_T / 2, cz - hd + HOUSE_WALL_T / 2, houseWallMat);
  wallBox(cx + doorHalf, cx + hw, 0, wallH, cz - hd - HOUSE_WALL_T / 2, cz - hd + HOUSE_WALL_T / 2, houseWallMat);
  wallBox(cx - hw, cx + hw, 0, wallH, cz + hd - HOUSE_WALL_T / 2, cz + hd + HOUSE_WALL_T / 2, houseWallMat);
  wallBox(cx - hw - HOUSE_WALL_T / 2, cx - hw + HOUSE_WALL_T / 2, 0, wallH, cz - hd, cz + hd, houseWallMat);
  wallBox(cx + hw - HOUSE_WALL_T / 2, cx + hw + HOUSE_WALL_T / 2, 0, wallH, cz - hd, cz + hd, houseWallMat);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - HOUSE_WALL_T, 0.1, d - HOUSE_WALL_T), houseFloorMat);
  floor.position.set(cx, -0.05, cz);
  scene.add(floor);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(hw, hd) * 1.15, 1.8, 4), houseRoofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(cx, wallH + 0.9, cz);
  scene.add(roof);
  buildDoorTrim(cx, cz - hd, doorHalf, wallH, -1);
  const winXL = cx - (hw + doorHalf) / 2, winXR = cx + (hw + doorHalf) / 2;
  buildWindowOnZWall(winXL, cz - hd, 0.95, -1);
  buildWindowOnZWall(winXR, cz - hd, 0.95, -1);
  buildWindowOnZWall(winXL, cz - hd, 2.3, -1);
  buildWindowOnZWall(winXR, cz - hd, 2.3, -1);
  const light = new THREE.PointLight(0xfff4d6, 0.6, 7, 2);
  light.position.set(cx, wallH - 0.4, cz);
  scene.add(light);
}
buildPlainHouse(LEVEL1_CENTER.x - 18, LEVEL1_CENTER.z - 12, 7, 7, 3.2);
buildPlainHouse(LEVEL1_CENTER.x + 16, LEVEL1_CENTER.z + 6, 7, 7, 3.2);
buildPlainHouse(LEVEL1_CENTER.x - 10, LEVEL1_CENTER.z + 16, 7, 7, 3.2);

// The target house -- a flat, walkable roof instead of a pitched one,
// and its own white door standing up there rather than at ground level.
// The roof itself has no collider (it would block the ground-floor
// doorway below it); it's purely a height the player can stand on once
// marked onRoof -- see groundHeightAt().
const TARGET_HOUSE = { cx: LEVEL1_CENTER.x + 6, cz: LEVEL1_CENTER.z - 16, w: 8, d: 8, wallH: 3.4 };
flattenCircles.push({ x: TARGET_HOUSE.cx, z: TARGET_HOUSE.cz, r0: 7, r1: 13 }); // generous -- also covers the ladder's placement spot right against its wall
(function buildTargetHouse() {
  const { cx, cz, w, d, wallH } = TARGET_HOUSE;
  const hw = w / 2, hd = d / 2, doorHalf = 0.85;
  wallBox(cx - hw, cx - doorHalf, 0, wallH, cz - hd - HOUSE_WALL_T / 2, cz - hd + HOUSE_WALL_T / 2, houseWallMat);
  wallBox(cx + doorHalf, cx + hw, 0, wallH, cz - hd - HOUSE_WALL_T / 2, cz - hd + HOUSE_WALL_T / 2, houseWallMat);
  wallBox(cx - hw, cx + hw, 0, wallH, cz + hd - HOUSE_WALL_T / 2, cz + hd + HOUSE_WALL_T / 2, houseWallMat);
  wallBox(cx - hw - HOUSE_WALL_T / 2, cx - hw + HOUSE_WALL_T / 2, 0, wallH, cz - hd, cz + hd, houseWallMat);
  wallBox(cx + hw - HOUSE_WALL_T / 2, cx + hw + HOUSE_WALL_T / 2, 0, wallH, cz - hd, cz + hd, houseWallMat);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - HOUSE_WALL_T, 0.1, d - HOUSE_WALL_T), houseFloorMat);
  floor.position.set(cx, -0.05, cz);
  scene.add(floor);
  buildDoorTrim(cx, cz - hd, doorHalf, wallH, -1);
  const winXL2 = cx - (hw + doorHalf) / 2, winXR2 = cx + (hw + doorHalf) / 2;
  buildWindowOnZWall(winXL2, cz - hd, 0.95, -1);
  buildWindowOnZWall(winXR2, cz - hd, 0.95, -1);
  buildWindowOnZWall(winXL2, cz - hd, 2.3, -1);
  buildWindowOnZWall(winXR2, cz - hd, 2.3, -1);
  // flat roof -- visual only, no collider (see note above)
  const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.2, d + 0.3), houseRoofMat);
  roofSlab.position.set(cx, wallH + 0.1, cz);
  scene.add(roofSlab);
  // a low parapet lip around the roof edge, so it actually reads as a
  // rooftop rather than a floating slab -- also purely visual.
  const lipMat = houseRoofMat;
  for (const [lx, lz, lw, ld] of [
    [cx, cz - hd, w + 0.3, 0.15], [cx, cz + hd, w + 0.3, 0.15],
    [cx - hw, cz, 0.15, d + 0.3], [cx + hw, cz, 0.15, d + 0.3],
  ]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(lw, 0.3, ld), lipMat);
    lip.position.set(lx, wallH + 0.35, lz);
    scene.add(lip);
  }
  const light = new THREE.PointLight(0xfff4d6, 0.6, 7, 2);
  light.position.set(cx, wallH - 0.4, cz);
  scene.add(light);
})();
const ROOF_Y = TARGET_HOUSE.wallH + 0.2;

// The roof door -- the actual way out of this level.
const roofDoorMat = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.5 });
const roofDoorFrameMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.6 });
const roofDoorPos = new THREE.Vector3(TARGET_HOUSE.cx, ROOF_Y, TARGET_HOUSE.cz - TARGET_HOUSE.d / 2 + 0.8);
{
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.1, 0.12), roofDoorFrameMat);
  frame.position.set(roofDoorPos.x, ROOF_Y + 1.05, roofDoorPos.z);
  scene.add(frame);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 0.08), roofDoorMat);
  slab.position.set(roofDoorPos.x, ROOF_Y + 1.0, roofDoorPos.z + 0.02);
  scene.add(slab);
}
const roofDoorCenter = new THREE.Vector3(roofDoorPos.x, ROOF_Y + EYE_H, roofDoorPos.z);
let levelEscaped = false;

// The ladder -- found lying in the grass somewhere away from the target
// house, carried (E to pick up, E again at the house wall to place it),
// then climbed (walk into it and hold W).
const ladderMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.7 });
const ladderFoundPos = new THREE.Vector3(LEVEL1_CENTER.x - 20, 0, LEVEL1_CENTER.z + 18);
flattenCircles.push({ x: ladderFoundPos.x, z: ladderFoundPos.z, r0: 2.5, r1: 6 });
const ladderPlaceSpot = new THREE.Vector3(TARGET_HOUSE.cx + TARGET_HOUSE.w / 2 + 0.3, 0, TARGET_HOUSE.cz - TARGET_HOUSE.d / 2 + 1.2);
function buildLadderMesh() {
  const g = new THREE.Group();
  for (const side of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6), ladderMat);
    rail.position.set(side, 1.3, 0);
    g.add(rail);
  }
  for (let i = 0; i < 7; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), ladderMat);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, 0.25 + i * 0.37, 0);
    g.add(rung);
  }
  return g;
}
const ladderMesh = buildLadderMesh();
ladderMesh.position.copy(ladderFoundPos);
ladderMesh.rotation.x = Math.PI / 2; // lying flat in the grass until picked up
scene.add(ladderMesh);
let ladderState = 'field'; // 'field' | 'carried' | 'placed'
let playerOnRoof = false;

function placeLadder() {
  ladderState = 'placed';
  ladderMesh.visible = true;
  ladderMesh.position.set(ladderPlaceSpot.x, 0, ladderPlaceSpot.z);
  ladderMesh.rotation.x = 0;
  ladderMesh.rotation.y = 0;
}

// The one place in the whole level the floor isn't at y=0 -- the target
// house's own roof, and only once the player has actually climbed up
// there (not just "standing underneath it"), so the house's own ground
// floor and doorway stay perfectly normal to walk through.
function groundHeightAt(x, z) {
  if (playerOnRoof) {
    const hw = TARGET_HOUSE.w / 2 + 0.6, hd = TARGET_HOUSE.d / 2 + 0.6;
    if (x > TARGET_HOUSE.cx - hw && x < TARGET_HOUSE.cx + hw && z > TARGET_HOUSE.cz - hd && z < TARGET_HOUSE.cz + hd) return ROOF_Y;
  }
  // The lab/parking lot is flat ground at y=0; only the suburb (far off
  // in x) actually rolls.
  if (Math.abs(x - LEVEL1_CENTER.x) < SUBURB_HALF + 2 && Math.abs(z - LEVEL1_CENTER.z) < SUBURB_HALF + 2) {
    return terrainHeight(x, z);
  }
  return 0;
}
const CLIMB_SPEED = 2.6;
function updateClimbing(dt) {
  if (ladderState !== 'placed') return false;
  const dist = Math.hypot(camera.position.x - ladderPlaceSpot.x, camera.position.z - ladderPlaceSpot.z);
  if (dist > 1.1) return false;
  if (keys.w && !playerOnRoof) {
    camera.position.y = Math.min(camera.position.y + CLIMB_SPEED * dt, ROOF_Y + EYE_H);
    if (camera.position.y >= ROOF_Y + EYE_H - 0.02) playerOnRoof = true;
    velocityY = 0;
    return true;
  }
  if (keys.s && playerOnRoof && camera.position.y > EYE_H + 0.05) {
    camera.position.y = Math.max(camera.position.y - CLIMB_SPEED * dt, EYE_H);
    if (camera.position.y <= EYE_H + 0.02) playerOnRoof = false;
    velocityY = 0;
    return true;
  }
  return false;
}

sculptSuburbTerrain(); // now that every flatten zone (houses, ladder spots, path, fence) is registered

/* ---------------- movement ---------------- */
const keys = { w: false, a: false, s: false, d: false, shift: false };
let velocityY = 0, onGround = true;
const WALK_SPEED = 6.0, RUN_SPEED = 9.5, JUMP_V = 5.5, GRAVITY = -17;
let controlsLocked = false; // true during the intro broadcast and the door cutscene

function isLocked() { return document.pointerLockElement === renderer.domElement; }
function applyLookDelta(mx, my) {
  yaw -= mx * 0.0022;
  pitch -= my * 0.0022;
  pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
}
document.addEventListener('mousemove', (e) => {
  if (isLocked() && !controlsLocked) applyLookDelta(e.movementX, e.movementY);
});

function movePlayer(dt) {
  const floorY = groundHeightAt(camera.position.x, camera.position.z);
  const feetY = camera.position.y - EYE_H;
  const speed = keys.shift ? RUN_SPEED : WALK_SPEED;
  let mx = 0, mz = 0;
  if (keys.w) mz -= 1;
  if (keys.s) mz += 1;
  if (keys.a) mx -= 1;
  if (keys.d) mx += 1;
  if (mx || mz) {
    const len = Math.hypot(mx, mz); mx /= len; mz /= len;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    // (was mx*c - mz*s / mx*s + mz*c -- the cross terms had the wrong
    // sign, so moving forward drifted sideways relative to where the
    // camera was actually facing once you'd turned at all. "something's
    // wrong with the movement" -- verified against the camera's own
    // actual forward/right vectors, not just reasoned about.)
    const wx = mx * c + mz * s, wz = -mx * s + mz * c;
    const stepX = camera.position.x + wx * speed * dt;
    if (!collidesAt(stepX, camera.position.z, feetY)) camera.position.x = stepX;
    const stepZ = camera.position.z + wz * speed * dt;
    if (!collidesAt(camera.position.x, stepZ, feetY)) camera.position.z = stepZ;
  }
  if (updateClimbing(dt)) return;
  velocityY += GRAVITY * dt;
  let newY = camera.position.y + velocityY * dt;
  const floorEye = groundHeightAt(camera.position.x, camera.position.z) + EYE_H;
  if (newY <= floorEye) { newY = floorEye; velocityY = 0; onGround = true; } else { onGround = false; }
  camera.position.y = newY;
}

const blocker = document.getElementById('blocker');
const broadcastOverlay = document.getElementById('broadcast-overlay');
let broadcastDismissed = false;
function dismissBroadcast() {
  if (broadcastDismissed) return;
  broadcastDismissed = true;
  broadcastOverlay.style.display = 'none';
}
broadcastOverlay.addEventListener('click', dismissBroadcast);
document.addEventListener('keydown', (e) => { if (!broadcastDismissed && e.code !== 'F11') dismissBroadcast(); }, { once: false });

blocker.addEventListener('click', () => {
  if (!broadcastDismissed) return;
  renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  blocker.style.display = (isLocked() || controlsLocked) ? 'none' : 'flex';
});

document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': keys.w = true; break;
    case 'KeyS': keys.s = true; break;
    case 'KeyA': keys.a = true; break;
    case 'KeyD': keys.d = true; break;
    case 'ShiftLeft': case 'ShiftRight': keys.shift = true; break;
    case 'Space': if (onGround && !controlsLocked) { velocityY = JUMP_V; onGround = false; } break;
    case 'KeyE': tryInteract(); break;
  }
});
document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': keys.w = false; break;
    case 'KeyS': keys.s = false; break;
    case 'KeyA': keys.a = false; break;
    case 'KeyD': keys.d = false; break;
    case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
  }
});

/* ---------------- the door cutscene ---------------- */
const interactHint = document.getElementById('interact-hint');
const fadeOverlay = document.getElementById('fade-overlay');
const titleCard = document.getElementById('title-card');
let doorOpened = false, cutsceneActive = false;

function tryInteract() {
  if (cutsceneActive || controlsLocked) return;
  if (!doorOpened && camera.position.distanceTo(doorCenter) < 2.6) { triggerDoorCutscene(); return; }
  if (ladderState === 'field' && camera.position.distanceTo(ladderFoundPos) < 2.2) {
    ladderState = 'carried';
    ladderMesh.visible = false;
    return;
  }
  if (ladderState === 'carried' && camera.position.distanceTo(ladderPlaceSpot) < 2.4) {
    placeLadder();
    return;
  }
  if (playerOnRoof && !levelEscaped && camera.position.distanceTo(roofDoorCenter) < 2.2) {
    triggerEscapeEnding();
    return;
  }
}

function showTitleCard(text) {
  titleCard.textContent = text;
  titleCard.hidden = false;
  requestAnimationFrame(() => titleCard.classList.add('show'));
}
function hideTitleCard() {
  titleCard.classList.remove('show');
  setTimeout(() => { titleCard.hidden = true; }, 1000);
}

function triggerDoorCutscene() {
  doorOpened = true;
  cutsceneActive = true;
  controlsLocked = true;
  document.exitPointerLock();
  interactHint.classList.remove('show');
  hazmatNPC.visible = true;
  boxColliders.splice(doorColliderIdx, 1); // the door no longer blocks anything

  const doorBaseY = DOOR_H / 2;
  // Aim at the hazmat figure itself, not the door's own center -- the two
  // aren't at the same x (he stands off to one side of the doorway), so
  // looking at the door left you looking past him rather than at him.
  // Computed once, then interpolated purely from elapsed wall-clock time
  // (not "a little further every frame") so it reaches the target
  // reliably regardless of frame rate -- the old per-frame version could
  // visibly undershoot if frames were dropped or throttled.
  const startYaw = yaw;
  const targetYaw = Math.atan2(hazmatNPC.position.x - camera.position.x, hazmatNPC.position.z - camera.position.z);
  const turnDelta = ((targetYaw - startYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const t0 = performance.now();
  function tick() {
    const t = (performance.now() - t0) / 1000;
    if (t < 1.2) {
      const turnT = Math.min(1, t / 1.1);
      const eased = turnT * turnT * (3 - 2 * turnT); // smoothstep
      yaw = startYaw + turnDelta * eased;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    } else if (t < 2.8) {
      const openT = Math.min(1, (t - 1.2) / 1.2);
      specialDoor.position.y = doorBaseY + openT * (WALL_H + 0.5);
      hazmatNPC.userData.arms.forEach((a) => { a.rotation.x = -openT * 1.3; });
    } else if (t < 3.8) {
      // hold on the open doorway
    } else if (t < 4.8) {
      fadeOverlay.classList.add('show');
    } else if (t < 4.9) {
      camera.position.copy(LEVEL1_SPAWN);
      yaw = 0; pitch = 0;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      scene.background = makeSkyGradientTexture('#1455b0', '#5fa8e0'); // the suburb's own "perfect sky" -- a real gradient, deep blue overhead fading paler at the horizon, matching the reference photo directly
      showTitleCard('LEVEL 1');
    } else if (t < 5.9) {
      fadeOverlay.classList.remove('show');
    } else if (t < 7.5) {
      // hold the title card
    } else if (t < 8.5) {
      hideTitleCard();
    } else {
      cutsceneActive = false;
      controlsLocked = false;
      renderer.domElement.requestPointerLock();
      return;
    }
    requestAnimationFrame(tick);
  }
  tick();
}

// The roof door -- the actual ending, such as it is for now: fade out,
// a short card, fade back in on the title screen. Nothing past this is
// built yet.
function triggerEscapeEnding() {
  levelEscaped = true;
  cutsceneActive = true;
  controlsLocked = true;
  document.exitPointerLock();
  interactHint.classList.remove('show');
  const t0 = performance.now();
  function tick() {
    const t = (performance.now() - t0) / 1000;
    if (t < 1.0) {
      fadeOverlay.classList.add('show');
    } else if (t < 1.1) {
      showTitleCard('???');
    } else if (t < 3.5) {
      // hold
    } else {
      window.location.href = 'index.html';
      return;
    }
    requestAnimationFrame(tick);
  }
  tick();
}

/* ---------------- main loop ---------------- */
let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  for (const cl of ceilingLights) {
    let t = cl.base * (0.85 + 0.15 * Math.sin(now * 0.004 + cl.seed));
    if (cl.broken && Math.sin(now * 0.0017 + cl.seed * 3) > 0.985) t *= 0.12;
    cl.light.intensity = t;
  }
  for (const cord of cords) {
    if (cord.flashTime > 0) {
      cord.flashTime -= dt;
      if (cord.flashTime <= 0) { cord.spark.visible = false; cord.light.intensity = 0; }
    } else {
      cord.timer -= dt;
      if (cord.timer <= 0) {
        cord.spark.visible = true;
        cord.light.intensity = 2.5;
        cord.flashTime = 0.06 + Math.random() * 0.08;
        cord.timer = 2 + Math.random() * 7;
      }
    }
  }

  if (!controlsLocked && (isLocked())) {
    movePlayer(dt);
    let hintText = null;
    if (!doorOpened && camera.position.distanceTo(doorCenter) < 2.6) hintText = 'Press E to open';
    else if (ladderState === 'field' && camera.position.distanceTo(ladderFoundPos) < 2.2) hintText = 'Press E to pick up the ladder';
    else if (ladderState === 'carried' && camera.position.distanceTo(ladderPlaceSpot) < 2.4) hintText = 'Press E to place the ladder';
    else if (ladderState === 'placed' && !playerOnRoof && Math.hypot(camera.position.x - ladderPlaceSpot.x, camera.position.z - ladderPlaceSpot.z) < 1.1) hintText = 'Hold W to climb';
    else if (playerOnRoof && !levelEscaped && camera.position.distanceTo(roofDoorCenter) < 2.2) hintText = 'Press E to open the door';
    if (hintText) { interactHint.textContent = hintText; interactHint.classList.add('show'); }
    else interactHint.classList.remove('show');
  }

  renderer.render(scene, camera);
}
animate();

} // end boot()

function waitForThreeThenBoot() {
  if (typeof THREE !== 'undefined') boot();
  else setTimeout(waitForThreeThenBoot, 10);
}
waitForThreeThenBoot();
