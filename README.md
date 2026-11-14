# The In-Between

A browser-based, first-person exploration game. Real JavaScript and
Three.js over a CDN script tag, no build step. (This repo has held two
earlier, unrelated games — Hollowtread, a forest game, and then The
Sub-liminal, a Backrooms exploration game — both removed entirely on
direct request to start this one clean.)

## Running it

**Play it live: [mkrauklis.github.io/hollowtread](https://mkrauklis.github.io/hollowtread/)**

No install, no build, no server required — every page (`index.html`,
the title screen; `game.html`, the game itself) is plain HTML/CSS/JS
with classic (non-module) `<script>` tags, so double-clicking either
file just works. Serving the folder with a static server works too, if
you'd rather:

```
npx serve .
```

## The title screen

`index.html` — the game's name, and **Start Game** / **Levels** /
**Options** buttons. Levels and Options are still placeholders (nothing
built, a single volume slider). The whole screen — background, title
text, buttons — has a deliberate red/cyan anaglyph (3D-glasses) fringe.
The background itself is a plain gradient standing in for the real art
(a suburban hillside under a blue sky, a white picket fence, a water
tower on the hill) until that image file is actually added to the repo
— see the comment in `css/style.css`'s `.bg` rule.

## Start Game

Opens on an emergency-broadcast title card: *"Eco-Labs have uncovered a
dreamworld that seems to be safe for now. We advise that everybody stays
away from the lab."* Click or press any key to continue into a moonlit
parking lot outside the lab (real tiled asphalt, light poles, traffic
cones) — color-matched to reference photos of a decayed brick industrial
building at night: brick walls, a pitched/gabled roof, a brick chimney
tower, and a row of tall windows glowing warm against the dark exterior.
Inside, it's taller than before, with exposed roof trusses and pipes
running along the walls, and laid out as a real facility — a front room,
a narrower hallway, and a back room, not one open box. It looks like a
wasteland throughout — flipped desks, toppled filing cabinets, floor
debris, flickering lights, cords hanging from the ceiling that spark at
random. Somewhere inside is a reinforced door; opening it (**E**, once
close) cuts to a hazmat-suited figure pulling it open, then fades to
**Level 1**.

**Level 1 — "The Empty Suburb"** is real rolling hills, color-matched
directly to a reference photo: a deep gradient sky (not a flat color), a
winding dirt path, a water tower on a hilltop, white picket fence
following the contours with its own red/cyan chromatic-glitch fringe.
Fenced in the whole way around (there's no way over or out). A few
ordinary houses stand on their own flattened patches of hillside, each
one a real walk-in space with proper white-trimmed windows and a door —
empty inside, which is the point. One house has no ground-floor way out
at all; its door is up on the roof. The field's one ladder is lying in
the grass somewhere else entirely — pick it up (**E**), carry it to that
house, place it against the wall (**E** again), then hold **W** against
it to climb. The roof door is the way out of the level; nothing past it
is built yet, so reaching it just fades back to the title screen for
now.

The whole game also has a dreamcore color treatment layered over it — a
wide, slightly bowed-out lens, oversaturated colors, a soft glow, and a
vignette — rather than a flat, literal render.

## Controls

`W` `A` `S` `D` to move, mouse to look, **Shift** to run, **Space** to
jump, **E** to interact (open doors, pick up/place the ladder, climb).
Click the start screen to lock the pointer; `Esc` releases it (or
click-and-drag to look instead, if your browser won't lock the mouse).

## License

MIT — see [`LICENSE`](LICENSE).
