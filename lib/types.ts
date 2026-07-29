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
  // Bumped on every new board so view-layer effects (deal-in, timers) can key
  // off a fresh game without deep-comparing the grid.
  gameId: number;
}

export interface Settings {
  defaultDifficulty: DifficultyName;
  solvableOnly: boolean;
}
