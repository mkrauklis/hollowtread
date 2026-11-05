# Hollowtread

A browser-based, open first-person horror game. Real JavaScript, no build step.

## Running it

**Play it live: [mkrauklis.github.io/hollowtread](https://mkrauklis.github.io/hollowtread/)**

No install, no build — but [`world.html`](world.html) (the game itself)
loads [Three.js](https://threejs.org) as an ES module via a CDN import map,
and browsers refuse to load ES modules over `file://`. So double-clicking
`world.html` from disk will fail to load the game entirely, with no visible
error beyond a stuck start screen. To run it locally, serve the folder with
any static server instead:

```
npx serve .
```

[`index.html`](index.html) (the menu) is plain HTML/CSS and opens fine
directly from disk either way.

## The world

There's one map, and it's all connected — no level select, no loading
screens between areas. You spawn on a **treehouse deck**, built up on stilts
around a big tree. That deck is a safe zone: nothing that hunts at night can
cross onto it or come within 20 units of its center. A ramp off the south
side of the deck is the only way down, into one continuous forest of rolling
hills, scattered trees, and glowing jump pads.

A small alcove on the deck (the **bestiary room**) holds miniature, slowly
turning models of each thing loose in the forest, labelled by name. It's
purely informational — nothing in there can catch you — and it's meant to
grow as more creatures are added, the same way the forest itself is meant to
grow past "rolling hills and trees."

## Controls

`W` `A` `S` `D` to move, mouse to look, **Space** to jump, **Shift** to
sprint. Click the start screen to lock the pointer; `Esc` releases it.
Walking onto one of the teal jump pads launches you hard into the air.

## Objective

Three embers are hidden out in the forest. Find all three and carry them
back onto the treehouse deck to win. Getting caught by anything out there
sends you back to the deck and resets its patrol — you don't lose embers
you've already found.

## What's out there

- **Stalker** — patrols the facility-era ground in the open, locks onto you
  the instant your flashlight lands on it (or you get close), and gives
  chase at well over your running speed for a few seconds before giving up.
- **Looper** — low, fast, four-legged, keyed almost entirely to proximity
  rather than line of sight. Doesn't need to see you coming.
- **Treewatcher** — tall, thin, and still. It only closes the distance while
  you *aren't* looking at it; keep it in view (or keep your distance) and it
  can't reach you.

All three are capped at a 20-unit radius from the treehouse — once you're
back near home, you're safe, mid-chase or not.

## Lessons carried over from Desolate Apes (goofy-horror)

This project reuses the working parts of an earlier browser horror game
rather than re-deriving them:

- **No build step, ever.** Plain HTML/CSS/JS (here, ES modules importing
  Three.js from a CDN import map) — open the file and it runs.
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
