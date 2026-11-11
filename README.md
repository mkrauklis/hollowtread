# The In-Between

A browser-based, first-person exploration game. Real JavaScript and
Three.js over a CDN script tag, no build step. (This repo has held two
earlier, unrelated games — Hollowtread, a forest game, and then The
Sub-liminal, a Backrooms exploration game — both removed entirely on
direct request to start this one clean.)

## Running it

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
away from the lab."* Click or press any key to continue into a parking
lot outside the lab. The lab itself looks like a wasteland — flipped
desks, toppled filing cabinets, flickering lights, cords hanging from
the ceiling that spark at random. Somewhere inside is a reinforced door;
opening it (**E**, once close) cuts to a hazmat-suited figure pulling it
open, then fades to **Level 1**.

**Level 1 — "The Empty Suburb"** is a plain field under a flat, too-
perfect sky, fenced in white picket all the way around (there's no way
over or out). A few ordinary houses stand around the field, each one a
real walk-in space — empty inside, which is the point. One house has no
ground-floor way out at all; its door is up on the roof. The field's one
ladder is lying in the grass somewhere else entirely — pick it up (**E**),
carry it to that house, place it against the wall (**E** again), then
hold **W** against it to climb. The roof door is the way out of the
level; nothing past it is built yet, so reaching it just fades back to
the title screen for now.

## Controls

`W` `A` `S` `D` to move, mouse to look, **Shift** to run, **Space** to
jump, **E** to interact (open doors, pick up/place the ladder, climb).
Click the start screen to lock the pointer; `Esc` releases it (or
click-and-drag to look instead, if your browser won't lock the mouse).

## License

MIT — see [`LICENSE`](LICENSE).
