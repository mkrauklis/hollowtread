# The In-Between

A new game, starting fresh from its title screen. (This repo has held two
earlier, unrelated games — Hollowtread, a forest game, and then The
Sub-liminal, a Backrooms exploration game — both removed entirely on
direct request to start this one clean.)

## Running it

No install, no build, no server required — `index.html` (the title
screen) is plain HTML/CSS/JS, so double-clicking it just works. Serving
the folder with a static server works too, if you'd rather:

```
npx serve .
```

## Where things stand

Right now there's only the title screen: the game's name, and three
buttons — **Start Game**, **Levels**, **Options** — each opening its own
panel. Start Game and Levels both say there's nothing to play yet; no
level has been built. Options has a single placeholder volume slider.

The background is a plain gradient placeholder standing in for the real
art (a suburban hillside under a blue sky, a white picket fence, a water
tower on the hill) until that image file is actually added to the repo
— see the comment in `index.html`'s `.bg` rule.

## License

MIT — see [`LICENSE`](LICENSE).
