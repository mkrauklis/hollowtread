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

There's one map, and it's all connected — no level select, no loading
screens between areas. You spawn on a **treehouse deck**, built up on stilts
around a big tree. That deck is a safe zone: nothing that hunts at night can
cross onto it or come within 20 units of its center. A ramp off the south
side of the deck is the only way down, into one continuous forest bounded by
a perimeter wall, with giant rolling hills, oversized bare trees (real
climbable branches), a loop of connected elevated platforms and bridges
north of the treehouse, glowing jump pads, and autumn clutter — pumpkins,
leaf piles, scarecrows.

A small alcove on the deck (the **bestiary room**) holds miniature, slowly
turning models of the things loose in the forest, labelled by name. It's
purely informational — nothing in there can catch you.

## Controls

`W` `A` `S` `D` to move, mouse to look, **Space** to jump, **Shift** to
sprint. Click the start screen to lock the pointer; `Esc` releases it.
Walking onto one of the teal jump pads launches you hard into the air.

## Objective

There isn't one. This is free roam — explore the forest, find the hills,
the jump pads, the autumn clutter, at your own pace. Getting caught just
resets you (and whatever caught you) back to the treehouse deck; there's
nothing to lose and nothing to win.

## What's out there

**Supersonic** — a chimp with no legs, hovering instead of standing on
anything, neon blue and stretched tall. It stays put wherever it spawned
until you get close or it sees you — it isn't patrolling the whole forest
looking for you. Once alert, it's genuinely faster than you can run (1.2x
your own top speed), so outrunning it in a straight line never works. A
faint arpeggio plays and gets louder the closer it is, even before it's
actively hunting you — your only real warning. Catches you by grabbing you
and screaming in your face.

**Hot Cheeto** — the same no-legs chimp shape as Supersonic, scaled up 4x:
maroon, with glowing neon red eyes, hovering out in the northwest corner of
the forest. Same top speed as Supersonic, same "stays put until alert"
behavior, but its sheer size makes it easier to spot from further away. It
also turns slowly (unlike Supersonic) — a straight sprint still won't
outrun it, but circling around it actually works. Its jumpscare is it
picking you up and putting you in its mouth.

**Peanut** — light brown, no arms, hovering out in the northeast corner.
Slightly *slower* than you (0.98x your top speed) but turns faster than
anything else out there — it can't catch you in a straight line, but don't
expect to lose it by weaving, either. Its jumpscare is a quick, sharp tackle.

All three are capped at a 20-unit radius from the treehouse — once you're
back near home, you're safe, mid-chase or not.

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
