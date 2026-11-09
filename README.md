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

One connected space — no level select, no separate maps, no loading
screens. A real maze (a randomized spanning tree of rooms, not a grid of
open rooms with a few extra walls knocked out — narrow doorways, mostly
dead ends, the rare loop) of mustard-yellow rooms (damp carpet floor,
ceiling lights that flicker but are bright enough to actually see by,
wallpaper in a monochromatic, dingy yellow) connects through doorways
and, in some walls, **real crawlspaces** — gaps low enough that you have
to crouch (**C**) to fit through. Both of the things loose in here are
too big to follow you into one.

One room holds a grid of square floor pits. Walk onto one without
noticing and you fall — all the way out of the level, back to a random
spot far from wherever you fell.

## The camera

You're not here to fight anything. You're here to document it. The
camera isn't always out — press **R** to equip or put it away; equipped,
the screen itself goes full VHS camcorder (scanlines, a blinking REC dot,
a running timestamp, the occasional tracking glitch, everything a shade
desaturated and warm) and a viewfinder appears to frame the shot. Click
to take a photo. Line up one of the three things worth photographing,
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

## The computer

An old desk, an old CRT monitor, tucked into one of the rooms like
someone's abandoned office furniture. Stand at the keyboard and press
**E** for a panel with two tabs: **Appearance** (a hue slider for your
own first-person arms, a name field under the title in the corner — both
saved in your browser) and **Catalog** — a real, live, slowly turning 3D
render of each artifact and each entity, Prev/Next to page through all
five. An entry you haven't photographed (artifacts) or been caught by
(entities) yet shows as a dark silhouette with a glowing "?" and no name;
it unlocks permanently the moment you actually get it.

## Controls

`W` `A` `S` `D` to move, mouse to look, **Space** to jump, **Shift** to
sprint, **C** to toggle crouch (slower, but the only way into a
crawlspace), **R** to equip/unequip the camera, **click** (camera
equipped) to take a photo, **E** to interact — opens the computer panel
when you're standing at the keyboard. Click the start screen to lock the
pointer; `Esc` releases it (or closes the computer panel, if that's open
instead).

## Objective

There isn't one beyond the three photographs. Explore, find the
crawlspace routes, avoid the two things that notice you, document what's
actually here. Getting caught (or falling into a pit) just sends you back
to a spot far from whatever got you; there's nothing to lose and nothing
to win.

## What's out there

Both walk on real jointed limbs (shoulders, elbows, hips, knees) with
their own walk-cycle, and both have a real multi-beat kill animation
instead of a generic camera shake when they actually catch you.

**The Bacteria** — a humanoid shape built entirely out of thin black
wire — a wire ribcage, a wire skull, jointed wire limbs, nothing solid
and deliberately no face or eyes at all. It roams on its own at a
quarter of your own speed — easy to outpace, easy to lose — but the
instant it has line of sight on you, it closes that gap fast, 1.2x your
own speed, and keeps coming for a while even if you break contact. Catch
you and it entangles you in its own limbs, yanks you off your feet, and
lets go. It cannot fit through a crawlspace; finding one is a guaranteed
way to lose it.

**The Mannequin** — pale, featureless, no face at all. It does nothing
until the first time you actually look at it — that's what wakes it up.
From then on, it holds perfectly still for as long as you're looking
directly at it, and creeps toward you, fast, the instant you look away.
Looking back freezes it again, wherever it's gotten to. Catch you and it
grabs you with both arms, lifts you clean off the ground, snaps your
neck, and drops you. Dying to it doesn't reset it the way everything else
does — it stays wherever it was and comes straight for wherever you
respawn, discovered for good. It can't follow you into a crawlspace
either, but by the time you've noticed it's already moving, you may not
have the room to reach one.

## License

MIT — see [`LICENSE`](LICENSE).
