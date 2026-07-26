// Entry point: wire up input, then start the first game.

import { newGame, restoreGame } from './board.js';
import { initInput } from './input.js';

initInput();
// Resume the saved game if there is one; otherwise start fresh.
// silent: don't try to start audio before the first user gesture.
if (!restoreGame()) newGame('beginner', true);
