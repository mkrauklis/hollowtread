# The Sub-liminal

A browser-based, first-person Backrooms exploration game. Real
JavaScript, no build step. (This repo used to be a different game,
Hollowtread, set in a forest — that's gone now, replaced entirely.)

## Running it

**Play it live: [mkrauklis.github.io/hollowtread](https://mkrauklis.github.io/hollowtread/)**

No install, no build, no server required — every page, including
[`world.html`](world.html) (the game itself), is plain HTML/CSS/JS with
classic (non-module) `<script>` tags, so double-clicking any `.html` file
in this repo just works. [Three.js](https://threejs.org) loads from a CDN
as its classic global build (`three.min.js`, sets `window.THREE`) rather
than an ES module — modules are blocked entirely over `file://` with no
way around it, which is exactly why this project avoids them.

Serving the folder with a static server works too, if you'd rather:

```
npx serve .
```

## The place

You don't start in the Backrooms at all — you start in **the Safezone**,
a small industrial facility (metal floor, exposed pipes, cage shelf
racks and a leaning ladder against the back wall, dark tanks slung
overhead at odd angles around the door) sealed off by its own riveted
steel vault door, opened only by the lever standing in the middle of
the room. A single floor spotlight by the door is the only real light in
the place otherwise. Pull the lever and the door takes a real 3 seconds
to slide up out of the way (and the same 3 seconds to slide back down if
you throw it again) before the Backrooms proper are actually reachable.

One connected space beyond that door — no level select, no separate
maps, no loading screens. A real maze (a randomized spanning tree of
rooms, not a grid of open rooms with a few extra walls knocked out —
narrow doorways, mostly dead ends, the rare loop) of mustard-yellow rooms
(damp carpet floor, ceiling lights that flicker but are bright enough to
actually see by, wallpaper in a repeating, nested-arch, dingy yellow-green
pattern, the odd square support pillar standing alone mid-room) connects
through doorways and, in some walls, **real crawlspaces** — not a narrow
slot cut into a normal doorway, but a whole dark, low section of wall
(blends right into the same wallpaper until you're close) you have to
crouch (**C**) to fit through. A handful of rooms are furnished with
leftover office clutter — an old table, a dented filing cabinet, a worn
couch — and a few of the maze's own solid walls have a window mounted
flush against them, lit from behind by nothing identifiable, looking out
on nothing at all. None of the things loose in here are too
small to follow — they just can't fit, full stop.

One room holds a grid of square floor pits. Walk onto one without
noticing and you fall — all the way out of the level, back to a random
spot far from wherever you fell.

Somewhere in the maze a staircase leads down and out of the Backrooms
proper into **the Pool Rooms** — a small, separate sub-level one real
floor below, where every surface (floor, wall, ceiling) is a real white
tile mosaic instead of mustard wallpaper. Three rooms of different sizes,
several sunken pools (one of them a lot more than a puddle) lit by tall
glowing white lights standing upright in the water with no visible source,
and one more thing that lives down there waiting by the water.

Somewhere else entirely, one of the maze's crawlspaces is a genuinely
long one — much longer than any other crawl route in the place — and it
doesn't lead back into the maze at all. It comes out in **the Mall**: one
big tiled atrium, storefronts lining both long walls — several of them
real, walk-in shops, stocked out with clothes or food depending on which
door you take — a working fountain in the middle, a hall leading back to
its own food court, and two more things down there that notice you.

## The camera

You're not here to fight anything. You're here to document it. The
camera isn't always out — press **R** to equip or put it away; equipped,
the screen itself goes full VHS camcorder (scanlines, a blinking REC dot,
a running timestamp, the occasional tracking glitch, everything a shade
desaturated and warm) and a viewfinder appears to frame the shot. Click
to take a photo. Line up one of the five things worth photographing,
close enough and roughly centered, and it's captured — permanently, the
first time, saved in your browser. There's no film to run out and no
wrong way to frame a shot, just whether the thing you were aiming at was
actually in range.

**The Glitched Chair** — an ordinary chair, half-sunk into a wall at a
crooked angle, like the room forgot it wasn't supposed to be there.

**The Red Room** — a sealed side-room with no light of its own except one
small, dim red bulb in a corner. Everything else in it is exactly as dark
as that leaves it.

**The House in the Wall** — a cutaway in a wall's own thickness,
lit from inside, with a tiny house — roof, windows, all of it — sitting
where the wall should just be wall.

**The Tilted Staircase** — a short flight of stairs standing in the open,
tilted on two axes at once rather than just rotated flat, like gravity
never settled on a direction for it.

**The Kiddie Pool** — a small inflatable ring, down in the Pool Rooms,
sitting by itself a short walk from the real pool in the same room — far
too small to belong next to it.

## The computer

An old desk, an old CRT monitor, tucked into one of the rooms like
someone's abandoned office furniture. Stand at the keyboard and press
**E** for a panel with three tabs: **Appearance** (a hue slider for your
own first-person arms, a name field under the title in the corner — both
saved in your browser), **Catalog** — a real, live, slowly turning 3D
render of each artifact and each entity, Prev/Next to page through all
nine, and **Photos** — the actual snapshot from the moment you took each
one, in a grid, not a re-render. An entry you haven't photographed
(artifacts) or been caught by (entities) yet shows as a dark silhouette
with a glowing "?" and no name in the Catalog, or a locked "not found
yet" tile in Photos; it unlocks permanently the moment you actually get
it.

## Controls

`W` `A` `S` `D` to move, mouse to look, **Space** to jump, **Shift** to
sprint, **C** to toggle crouch (slower, but the only way into a
crawlspace), **R** to equip/unequip the camera, **click** (camera
equipped) to take a photo, **E** to interact — opens the computer panel
when you're standing at the keyboard, **T** to teleport straight back to
the Safezone from anywhere (a plain convenience — the Mall in particular
is a long way back otherwise). Click the start screen to lock the
pointer; `Esc` releases it (or closes the computer panel, if that's open
instead).

## Objective

There isn't one beyond the five photographs. Pull the lever, explore,
find the crawlspace routes and the staircase down, avoid the four things
that notice you, document what's actually here. Getting caught (or
falling into a pit) just sends you back to a spot far from whatever got
you; there's nothing to lose and nothing to win.

## What's out there

The Bacteria and the Mannequin both walk on real jointed limbs
(shoulders, elbows, hips, knees) with their own walk-cycle — a real
sprint when they're actually after you, not just a faster version of the
same walk — and wander room to room off the exact dead-center line, not
visibly gridded. All four have a real, smooth multi-beat kill animation
instead of a generic camera shake when they actually catch you, and you
can't look around at all while it plays.

**The Bacteria** — a humanoid shape built entirely out of thin black
wire, redrawn to match real reference photos directly: barely any torso
at all, just a short jagged zigzag spine, a small head with a tiny hat
and two faint glowing eye-flecks, wire arms that splay diagonally up and
outward almost to the ceiling instead of hanging down, and legs bent into
a wide, zigzag crouch. It roams on its own at a
quarter of your own speed — easy to outpace, easy to lose — but the
instant it has line of sight on you, it closes that gap fast, 1.2x your
own speed, and keeps coming for a while even if you break contact. Catch
you and it leaps onto you, slams its head into yours once, and the screen
goes black. It cannot fit through a crawlspace; finding one is a
guaranteed way to lose it.

**The Mannequin** — down in the Mall now, pale, featureless, no face at
all. It does nothing until the first time you actually look at it —
that's what wakes it up. From then on, it holds perfectly still for as
long as you're looking directly at it, and creeps toward you, fast, the
instant you look away. Looking back freezes it again, wherever it's
gotten to. Catch you and it grabs you with both arms, lifts you clean off
the ground, snaps your neck, and drops you. Dying to it doesn't reset it
the way everything else does — it stays wherever it was and comes
straight for wherever you respawn, discovered for good. It can't follow
you into a crawlspace either, but by the time you've noticed it's already
moving, you may not have the room to reach one.

**The Wretch** — down in the Pool Rooms. A tall, lanky, pale flesh body
with no head at all, just a rounded stump sealed over where one should
be — no eyes, nothing looking back. It doesn't know where you are by
default; it just wanders the Pool Rooms blind. The only things that give
you away are sound (quiet footsteps carry a little, sprinting carries a
lot further, crouching muffles you almost completely) and touch — bump
into it, or it into you, in the dark. Hear something and it beelines
straight for it at 1.1x your own speed; lose it and it goes back to
wandering. Catch you and it lunges the rest of the way in by feel before
everything judders and goes black.

**Bloom** — the other thing in the Mall. A gaunt, grey, puppet-like
giant on wheels instead of feet or legs, a ragged black cloth hanging
loose over its body (never its head), and a radiant sun standing in for
a face entirely — glowing red eyes, a jagged row of teeth, nothing about
it reads as friendly up close. It doesn't move at all until you're
actually close, which is exactly when it's too late to just walk away:
once awake it closes distance at 2x your own running speed, but it
corrects course slowly, so a sharp turn around a corner costs it real
ground. Catch you and it rolls straight over you.

## License

MIT — see [`LICENSE`](LICENSE).
