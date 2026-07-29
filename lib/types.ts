// Shared domain types for the game. No DOM, no React.

export type DifficultyName = 'beginner' | 'intermediate' | 'expert' | 'custom';

// 0 = blank, 1 = flag, 2 = question.
export type FlagState = 0 | 1 | 2;

export interface CellState {
  mine: boolean;
  revealed: boolean;
  flagged: FlagState;
  adjacent: number;
  // Transient flags that drive one-shot CSS animations. Cleared on the next
  // update to that cell; kept out of persistence.
  exploded?: boolean; // the mine the player clicked
  wrongFlag?: boolean; // a flag on a non-mine, shown after a loss
  popped?: boolean; // the single directly-clicked reveal (not flood-filled)
}

export interface BoardConfig {
  rows: number;
  cols: number;
  mines: number;
  label: string;
}

export interface GameState {
  difficulty: DifficultyName;
  rows: number;
  cols: number;
  totalMines: number;
  grid: CellState[][];
  minesPlaced: boolean;
  flagsPlaced: number;
  revealedCount: number;
  timer: number;
  gameOver: boolean;
  won: boolean;
  // Whether this board's mines are generated to be no-guess solvable (the
  // "Generate solvable games only" option, captured when the board is created).
  solvableOnly: boolean;
  // Whether the first click keeps its whole 3x3 mine-free, forcing the opening
  // tile to be a 0 that floods a region open. When false (the default) only the
  // clicked tile is protected, so an opening click can land on a number and
  // reveal just itself. Captured when the board is created.
  guaranteeOpening: boolean;
  // Bumped on every new board so view-layer effects (deal-in, timers) can key
  // off a fresh game without deep-comparing the grid.
  gameId: number;
}

// A best time plus who set it. `name` is null for an anonymous record — either
// the player skipped the prompt, or the record predates name tracking.
export interface BestRecord {
  time: number;
  name: string | null;
}

// Longest record-holder name kept; anything longer is truncated on save so the
// options dialog rows stay readable.
export const MAX_NAME_LENGTH = 14;

// A record that has just been set and is waiting for the player to name it. The
// board config is captured here because the live custom config can change
// before the prompt is answered.
export interface PendingRecord {
  difficulty: DifficultyName;
  config: BoardConfig;
  time: number;
}

export interface Settings {
  defaultDifficulty: DifficultyName;
  solvableOnly: boolean;
  // See GameState.guaranteeOpening.
  guaranteeOpening: boolean;
  // Whether the "Undo" control is available (takes back the last move).
  undoEnabled: boolean;
}
