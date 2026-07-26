# Minesweeper

A self-contained Minesweeper — no dependencies, no build step.

## Run it

The game uses ES modules, which browsers only load over `http(s)://` (not
`file://`). Use the included no-cache dev server so a reload always runs the
latest code (plain `http.server` caches modules and can leave you on a stale
mix after edits):

```bash
python3 serve.py
# then open http://localhost:8000/   (python3 serve.py 5500 for another port)
```

## Layout

| File            | Responsibility                                                        |
| --------------- | --------------------------------------------------------------------- |
| `index.html`    | Markup only.                                                          |
| `styles.css`    | All styling and animations.                                           |
| `src/state.js`  | Game state, constants, neighbor math, formatting, best-time storage.  |
| `src/board.js`  | Rules & flow: new game, mine placement, reveal, chord, flag, win/lose.|
| `src/solver.js` | No-guess solvability check (trivial + tank + count deductions).       |
| `src/render.js` | The only module that touches the DOM (board build, cell updates, UI). |
| `src/deal.js`   | Canvas-based per-tile entrance animation.                            |
| `src/sevenseg.js`| CSS seven-segment display for the LED counters.                     |
| `src/sound.js`  | Web Audio sound effects (synthesized, no assets).                     |
| `src/fx.js`     | Confetti overlay.                                                     |
| `src/input.js`  | Mouse / touch / keyboard / button wiring.                            |
| `src/main.js`   | Entry point.                                                          |

Dependency direction is one-way: `main → input → board → render → state`, with
`sound` and `fx` as leaves. Only `render.js` reads or writes the DOM.

## Saved games (survive reloads)

The full game state is written to `localStorage` (`minesweeper.save`) after every
move and each timer tick, and restored on load (`restoreGame` in `src/board.js`)
— board, flags, mine counter, elapsed time and win/lose status all come back, and
an in-progress timer resumes. The grid is stored compactly as digit strings and
the adjacency counts are recomputed on load rather than stored. Starting a new
game or switching difficulty overwrites the save.

## Solvable boards (no guessing)

Mines are placed on the first click, keeping that cell and its neighbors safe.
The layout is then regenerated until `src/solver.js` confirms it can be solved by
pure logic — so the player never needs to guess. The solver escalates only as
needed: trivial per-number rules, then a "tank" constraint enumeration over
connected frontier components, then global mine-count endgame rules. Every
deduction is a certainty, so the check is sound (a passing board truly needs no
guess). Measured: ~0.02–0.11 ms per check; generation averages ~1–14 attempts
depending on difficulty, a couple of ms at most.

## Entrance animation

Each tile falls independently into place, but the whole "deal-in" runs on a
single `<canvas>` overlay (`src/deal.js`), not a keyframe animation per cell.
One tile is pre-rendered to a sprite and blitted per tile per frame, so cost is
flat whether the board has 81 tiles or 480 — no hundreds-of-layers jank. The
real DOM cells stay hidden under `.board.dealing` until the canvas finishes.
