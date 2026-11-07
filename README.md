# Hollowtread

A browser-based, free-roam first-person horror game with no objective. Real
JavaScript, no build step.

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

## The world

There's one connected ground — no level select, no loading screens — but
four distinct map areas on it. You spawn on a **treehouse deck**, built up
on stilts around a big tree. That deck, and a walled yard around its base,
is a safe zone: nothing that hunts at night can cross onto it or come
within 20 units of its center. A **wooden stockade wall**, sharpened logs
carved to a point along the top, rings the yard, with four open gates (one
at each compass point — the south one's right where the ramp down from the
deck lands) so leaving never means walking the fence looking for a way out.

Past the wall: **the forest** — giant rolling hills, oversized bare trees
(real climbable branches), several loops of connected elevated platforms and
bridges, glowing jump pads, and autumn clutter (pumpkins, leaf piles,
scarecrows) scattered out toward a perimeter wall that rings the whole
forest. A small sign is mounted above each gap, but nothing points you
toward any of them in the first place. That wall isn't fully sealed —
three single holes, one on each remaining side, each lead into a winding
tunnel (real turns, lit and widened into an actual turning bay at each
one so the bend itself is visible, not a blind corner — the exact path is
different every time the page loads) that comes out into a section that
doesn't share the forest's own ground at all. On the east side, behind a
sign reading **BADLAND**: a desert town behind its own perimeter wall
with a matching hole at the far end of the tunnel, hollow walk-in western
buildings, cactus scrub, and air that fades to a dark sunrise orange the
moment you're actually inside. On the west side, behind a sign reading
**JUNGLE**: small hills, dense broad-leafed canopy strung with hanging
vines, and two stone temples, each with a windowless back chamber (a real
dungeon, not just a bigger room, and genuinely dark — nothing lights it
but your own flashlight) down a corridor past the main entrance — the sky
here fades to a dark blue instead. On the north side, behind a sign
reading **WINTER WONDERLAND**: the biggest of the three by a clear
margin — snow, thickening fog, a brick path, candy canes everywhere, and
three gingerbread houses you can walk into — under a pale, overcast-white
sky instead of the forest's black one.

A small alcove on the deck (the **bestiary room**) holds miniature, slowly
turning models of the things loose out there, labelled by name, on
pedestals that don't move. Which models are *on* them does: standing close
and pressing **E** cycles to the next area's roster, forest first. It's
purely informational either way — nothing in that room can catch you.

An old desk sits in another corner of the deck, an equally old CRT monitor
glowing on top of it. Stand at the keyboard and press **E** to open a
panel: a hue slider for the color of your own first-person arms, and a
name field that shows up under the HOLLOWTREAD logo in the corner. Both
persist in your browser (`localStorage`) across visits.

## Controls

`W` `A` `S` `D` to move, mouse to look, **Space** to jump, **Shift** to
sprint, **E** to interact — switches the bestiary's page or opens the
customize panel, whichever you're standing closer to. Click the start
screen to lock the pointer; `Esc` releases it (or closes the customize
panel, if that's open instead). Walking onto one of the teal jump pads
launches you hard into the air.

## Objective

There isn't one. This is free roam — explore the forest, the hidden maps,
the jump pads, the autumn clutter, at your own pace. Getting caught just
resets you (and whatever caught you) back to the treehouse deck; there's
nothing to lose and nothing to win.

## What's out there

Nothing patrols anymore — everything below roams a loose area around its
own spot until it notices you, then gives chase; lose it and it wanders
back to roaming near home, not back to standing frozen in one spot.

### This forest

**Supersonic** — a chimp with no legs, hovering instead of standing on
anything, neon blue and stretched tall. Once alert, it's just barely
faster than you can run (1.05x your own top speed) and it's kinda bad at
turning, so outrunning it in a straight line never works but circling
around it does. It's also short enough that a well-timed jump clears its
back entirely. A faint arpeggio plays and gets louder the closer it is,
even before it's actively hunting you — your only real warning. Catches
you by grabbing you and screaming in your face.

**Hot Cheeto** — the same no-legs chimp shape as Supersonic, scaled up 4x:
maroon, with glowing neon red eyes. Same top speed as Supersonic, turns
slowly — a straight sprint still won't outrun it, but circling around it
works. Its jumpscare is it picking you up and putting you in its mouth.

**Peanut** — light brown, no arms. Noticeably slower than you (0.7x your
speed) but turns faster than anything else out there — it can't catch you
in a straight line, but don't expect to lose it by weaving either. Its
jumpscare is a quick, sharp tackle.

### Badland (hidden, past the forest's own east wall)

A desert town that isn't part of the forest's ground at all — reached by
finding the one hole in the forest's own outer perimeter wall, through the
winding tunnel behind it, to the matching hole in Badland's own rugged
wooden perimeter wall at the far end. Sand, cactus scrub, hollow
false-front buildings you can actually walk into, and a sky that fades to
a dark sunrise orange once you're inside.

**Lizard** — 2x your size, a skull where its head should be, a tail. 1.02x
your speed.

**Gunslinger** — 1.2x your size, cowboy hat. 0.9x your speed.

**Outlaws** — three of them, your own size, bandanas and cowboy hats. 0.7x
your speed.

### The Jungle (hidden, past the forest's own west wall)

Like Badland, a section that doesn't share the forest's ground — reached
by finding the one hole in the forest's own outer perimeter wall on its
west side, through its own winding tunnel, to the matching hole in the
Jungle's own rugged mossy stone wall at the far end. Small hills, dense
broad-leafed canopy with vines hanging down out of it, real climbable
branches on the trees same as the forest's own, and two stone temples. The
sky fades to a dark blue once you're inside.

**Stalker** — a chimp whose whole body has been stretched far upward and
then scaled up again on top of that, genuinely huge, near-black with pale
glowing eyes. It can spot you from much farther off than anything else out
there, and once it has, it's properly fast (1.5x your speed) — but it can't
follow you into either temple or the dungeon behind one; reaching a
doorway is an instant, total out.

**Wanderer** — three of them, dark grey chimps with no face at all (no
eyes, no mouth, nothing looking back). Slower than you (0.75x your speed),
and unlike Stalker, nothing stops one from following you through a temple
doorway and all the way back into the dungeon chamber behind it.

### Winter Wonderland (hidden, past the forest's own north wall)

The biggest of the three sections, reached the same way as the other
two — through the one hole in the forest's own outer wall on its north
side, down its own winding tunnel, to a matching hole in Winter
Wonderland's own perimeter wall. Snow, thick fog, a brick path, candy
canes scattered everywhere, and three gingerbread houses with icing trim
you can actually walk into.

**Gingy** — gingerbread brown, no face at all. Slower than you (0.7x your
speed).

**Crangler** — a chimp whose whole body *and* arms have been stretched 5x
upward, a red-and-white candy-cane print down its body, glowing red eyes.
Spots you from much farther off than almost anything else out there.

**Elf** — three of them, red or green costume, pointed hat. The slowest
thing in the game (0.5x your speed).

**Krampus** — a chimp scaled up 6x, whole body and head together, not
just stretched: beard, Santa hat, horns, pale blue glowing eyes, dark
bent claws. The fastest thing in the game (1.5x your speed) — but it can
never follow you into a gingerbread house; reaching the doorway is an
instant, total out.

Every monster is capped at a 20-unit radius from the treehouse, and the
ones in Badland, the Jungle, or Winter Wonderland can't wander, or be
chased, out of their own area at all — once you're back near home,
you're safe, mid-chase or not.

## Lessons carried over from Desolate Apes (goofy-horror)

This project reuses the working parts of an earlier browser horror game
rather than re-deriving them:

- **No build step, ever — and that means no ES modules either.** The first
  version of this loaded Three.js as an ES module via a CDN import map,
  which quietly meant the game could never actually be opened from disk —
  only ES modules are blocked over `file://`, not classic scripts, so this
  now loads Three.js's classic global build instead. "Open the file and it
  runs" has to mean *any* file, including just double-clicking it.
- **A bestiary belongs *in* the game, not as a separate page.** An earlier
  attempt at a standalone "monsterpedia" page got cut — it was redundant
  and easy to let go stale. Putting miniatures in a safe room inside the
  world itself keeps it discoverable and in-context instead.
- **Danger communicated visually, not just by distance.** A red vignette
  that intensifies as a threat closes in gives a constant, readable warning
  regardless of whether you've spotted the thing causing it yet.
- **A safe home base** players can always retreat to, with a hard radius
  nothing hostile can cross, makes losing (getting caught) low-stakes
  enough that exploration stays the point.

## License

MIT — see [`LICENSE`](LICENSE).
