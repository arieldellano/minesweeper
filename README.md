# Minesweeper

Minesweeper built with **Next.js (App Router) + TypeScript** and idiomatic React.
No-guess boards, a custom difficulty editor, a canvas deal-in entrance,
synthesized sound, and saved games that survive reloads.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build
npm run start    # serve the production build
npm run typecheck
npm run lint
```

## Difficulties

Beginner (9×9 / 10), Intermediate (16×16 / 40), Expert (16×30 / 99), and
**Custom** — click **Custom** to open a dialog and choose columns (5–40), rows
(5–30) and mines. The mine maximum is capped at the hardest count the no-guess
generator can still reliably make logically solvable — and that never auto-wins
on the first click. That ceiling falls with board size (~32% density on tiny
boards down to ~20% on the largest), so the cap is computed per board (see
`maxMinesFor` in `lib/difficulty.ts`). A density readout updates as you type, and
your last custom board is remembered. Best times are tracked per difficulty
(custom bests are keyed by their exact dimensions).

## Options

The ⚙️ button (status bar) opens an options dialog:

- **Default difficulty** — which board a fresh session starts on (an untouched
  board switches to it immediately; a game in progress is left alone).
- **Sound** — on/off, synced with the 🔊 quick toggle.
- **Generate solvable games only** — on by default; when off, mine layouts are
  purely random (first click still safe) and may require guessing.
- **Guarantee an opening region** — **off** by default. When off, only the tile
  you click is kept mine-free, so an opening click can land on a number and
  reveals just that tile. When on, its whole 3×3 is kept clear, forcing a blank
  opening that floods a region open. See below.
- **Undo** — on by default; adds an ↩️ button to the status bar (and Ctrl/⌘+Z)
  that takes back the last move — a reveal, a flag, a chord, or the fatal click
  that ended the game. See below.
- **Best times** — the record for each preset difficulty and who set it, with a
  clear action. See below.

Settings persist in `localStorage`. A saved game is only restored when it has
actually been started (a cell revealed or flagged), so the default difficulty
always applies to a fresh, untouched board.

## Layout

Rendering is idiomatic React (components + hooks); the pure game rules are
framework-free TypeScript in `lib/`.

| Path                        | Responsibility                                                             |
| --------------------------- | -------------------------------------------------------------------------- |
| `app/page.tsx` / `layout.tsx` | Next.js entry + document shell; loads `app/globals.css`.                 |
| `app/globals.css`           | All styling and animations (dark theme, LED counters, modal).             |
| `lib/types.ts`              | Domain types (cells, game state, difficulty).                             |
| `lib/difficulty.ts`         | Presets, custom limits, clamping, config resolution.                      |
| `lib/game.ts`               | Pure rules as state transitions: reveal, chord, flag, win/lose (copy-on-write). |
| `lib/solver.ts`             | No-guess solvability check (trivial + tank + count deductions).           |
| `lib/persistence.ts`        | `localStorage` save/restore, named best times, custom config, mute.       |
| `lib/sound.ts`              | Web Audio sound effects (synthesized, no assets).                         |
| `lib/format.ts`             | LED 3-digit formatting.                                                    |
| `hooks/useGame.ts`          | Owns game state, timer, persistence, sound, best times, deal/confetti triggers. |
| `hooks/useBoardMetrics.ts`  | Fits the board to the viewport (cell size + font size).                   |
| `components/Minesweeper.tsx`| Top-level orchestrator; derives face + status, wires the modal.           |
| `components/Board.tsx`      | Grid + delegated pointer input (mouse/touch); mounts the deal overlay.    |
| `components/Cell.tsx`       | Memoized single cell (only changed cells re-render).                      |
| `components/Header.tsx`, `SevenSeg.tsx`, `DifficultyBar.tsx`, `StatusBar.tsx` | Header LEDs + reset, seven-segment display, difficulty control, status bar. |
| `components/CustomModal.tsx`| The custom-board dialog.                                                   |
| `components/RecordModal.tsx`| The new-record dialog that asks who set it.                                |
| `components/DealCanvas.tsx`, `Confetti.tsx` | Canvas entrance animation and win confetti.               |

## Idiomatic React, but fast

Cells are memoized and the transitions use **copy-on-write** — a transition
clones only the rows and cells it changes, so a flood-fill reveal re-renders just
the cells that actually changed, not the whole grid. Pointer input is delegated
to the board element (one listener set, not one per cell), matching the
original's performance while keeping React idioms.

## Saved games (survive reloads)

The full game state is written to `localStorage` (`minesweeper.save`) after every
move and each timer tick, and restored on load — board, flags, mine counter,
elapsed time and win/lose status all come back, and an in-progress timer resumes.
The grid is stored compactly as digit strings and adjacency counts are recomputed
on load. Starting a new game or switching difficulty overwrites the save.

## The opening click

A tile only opens its region when it has no mines around it; a numbered tile
uncovers just itself. Which of those the *first* click does is governed by
**Guarantee an opening region** (off by default):

| Option | Safe on first click | Opening tile |
| --- | --- | --- |
| Off (default) | the clicked tile only | often a number → reveals just that tile |
| On | the clicked tile and all 8 neighbors | always a 0 → floods a region open |

**These two options fight each other, and solvable-only wins.** A no-guess board
needs a blank opening: `isSolvable` reveals the start cell and deduces outward,
and a lone number gives one constraint over 8 unknowns, from which nothing is
forced. So layouts with a numbered opening are rejected and regenerated.
Measured over 120 boards per difficulty with solvable-only **on** and the opening
guarantee **off**, numbered first clicks came out at 0% / 0% / 2%
(beginner / intermediate / expert) — the generator filters right back to blank
openings. Turn **off** "Generate solvable games only" and they appear 62% / 74% /
86% of the time.

That 2% on expert is the generator exhausting its 400-attempt cap and falling
back to an unfiltered layout, which may then require a guess. First-click cost
stays small either way (expert median 1.9 ms, worst seen 11.3 ms).

## Records and who set them

Beating the standing best time (or setting the first one) pops a **New Record!**
dialog asking for a name, which is then shown beside the time in the options
dialog and next to the 🏆 readout. The last name used is remembered and
prefilled, so a regular player just hits Save.

The time is banked *before* the prompt appears, so skipping it — Escape, the
Skip button, or clicking away — loses the name, never the record; those show as
"Anonymous". Names are trimmed and capped at 14 characters. Records written
before name tracking existed were bare numbers in `localStorage`; they still
load, as anonymous, and are rewritten in the new `{"t":time,"n":name}` shape the
next time they're beaten. Attaching a name is guarded on the time, so a stale
prompt can't relabel a record that has since been beaten.

## Undo

`hooks/useGame.ts` keeps a stack of pre-move snapshots (up to 100), pushed only
once a move is known to have changed something — so undo never burns on a no-op
click. One chord is one snapshot, so a single undo takes back the whole opening.
Snapshots are cheap: the copy-on-write transitions mean each one shares its
untouched rows with the live grid.

Restoring strips the one-shot animation markers (`exploded` / `wrongFlag` /
`popped`) so nothing replays, and deliberately keeps the *current* timer —
undoing a mistake shouldn't hand back the time it cost. The stack is in memory
only: a reload restores the board but not its history, and starting a new game
or turning the option off clears it.

## Solvable boards (no guessing)

Mines are placed on the first click, always keeping the clicked tile itself safe.
The layout is then regenerated until `lib/solver.ts` confirms it can be solved by
pure logic — so the player never needs to guess. The solver escalates only as
needed: trivial per-number rules, then a "tank" constraint enumeration over
connected frontier components, then global mine-count endgame rules. Every
deduction is a certainty, so the check is sound (a passing board truly needs no
guess). Generation is bounded by an attempt + time cap so the first click never
hangs.

## Entrance animation

Each tile falls independently into place, but the whole "deal-in" runs on a
single `<canvas>` overlay (`components/DealCanvas.tsx`), not a keyframe animation
per cell. One tile is pre-rendered to a sprite and blitted per tile per frame, so
cost is flat whether the board has 81 tiles or 1200. The real DOM cells stay
hidden under `.board.dealing` until the canvas finishes.

## License

[MIT](LICENSE).
