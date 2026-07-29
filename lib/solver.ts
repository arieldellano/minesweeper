// No-guess solvability check.
//
// Given a mine layout and the first-click cell, simulate a player who only ever
// acts on certainty. The board is "solvable" iff every safe cell can be revealed
// this way, never a guess. game.ts keeps regenerating layouts until one passes.
//
// Three deduction layers, cheapest first (we only escalate when stuck):
//   1. trivial per-number rules            — O(n) per pass, resolves the bulk
//   2. tank solver over frontier components — enumerate mine configs to find
//      cells that are a mine (or safe) in EVERY valid configuration
//   3. global mine-count endgame rules
//
// Every deduction is a certainty, so the check is SOUND: if it returns true the
// board genuinely never requires a guess. It is not perfectly complete (the tank
// is capped for speed), which only means some solvable boards are rejected and
// regenerated — never that an unsolvable board slips through.

const COMPONENT_CAP = 24; // max frontier cells enumerated together
const SOLUTION_CAP = 200000; // bail out of a pathological component

const nbrCache = new Map<string, Int32Array[]>();

function neighborTable(rows: number, cols: number): Int32Array[] {
  const key = rows + 'x' + cols;
  const cached = nbrCache.get(key);
  if (cached) return cached;
  const n = rows * cols;
  const table = new Array<Int32Array>(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const list: number[] = [];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr,
            nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) list.push(nr * cols + nc);
        }
      table[r * cols + c] = Int32Array.from(list);
    }
  }
  nbrCache.set(key, table);
  return table;
}

interface Constraint {
  cells: number[];
  need: number;
}

// `mines` is a length rows*cols array (1 = mine).
export function isSolvable(
  mines: Uint8Array,
  rows: number,
  cols: number,
  totalMines: number,
  startR: number,
  startC: number
): boolean {
  const n = rows * cols;
  const nbr = neighborTable(rows, cols);

  // Adjacent-mine counts (-1 marks a mine; only used for revealed safe cells).
  const adj = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    if (mines[i]) {
      adj[i] = -1;
      continue;
    }
    let count = 0;
    const ns = nbr[i];
    for (let k = 0; k < ns.length; k++) if (mines[ns[k]]) count++;
    adj[i] = count;
  }

  const revealed = new Uint8Array(n);
  const flagged = new Uint8Array(n); // solver-proven mines
  let revealedCount = 0;
  let flaggedCount = 0;

  // Flood-reveal a proven-safe cell (opens its region if it is a 0).
  const stack: number[] = [];
  function reveal(i: number): void {
    if (revealed[i] || flagged[i]) return;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      if (revealed[j] || flagged[j]) continue;
      revealed[j] = 1;
      revealedCount++;
      if (adj[j] === 0) {
        const ns = nbr[j];
        for (let k = 0; k < ns.length; k++)
          if (!revealed[ns[k]] && !flagged[ns[k]]) stack.push(ns[k]);
      }
    }
  }
  function flag(i: number): void {
    if (!flagged[i] && !revealed[i]) {
      flagged[i] = 1;
      flaggedCount++;
    }
  }

  reveal(startR * cols + startC);

  let progress = true;
  while (progress) {
    progress = false;

    // (1) trivial deductions
    for (let i = 0; i < n; i++) {
      if (!revealed[i] || adj[i] <= 0) continue;
      const ns = nbr[i];
      let f = 0;
      const unknown: number[] = [];
      for (let k = 0; k < ns.length; k++) {
        const j = ns[k];
        if (flagged[j]) f++;
        else if (!revealed[j]) unknown.push(j);
      }
      if (unknown.length === 0) continue;
      const need = adj[i] - f;
      if (need === 0) {
        for (const j of unknown) reveal(j);
        progress = true;
      } else if (need === unknown.length) {
        for (const j of unknown) flag(j);
        progress = true;
      }
    }
    if (progress) continue;

    // (2) tank solver over connected frontier components
    if (tankDeduce()) {
      progress = true;
      continue;
    }

    // (3) global mine-count endgame
    const remaining = totalMines - flaggedCount;
    const unknownCells: number[] = [];
    for (let i = 0; i < n; i++) if (!revealed[i] && !flagged[i]) unknownCells.push(i);
    if (unknownCells.length) {
      if (remaining === 0) {
        for (const j of unknownCells) reveal(j);
        progress = true;
      } else if (remaining === unknownCells.length) {
        for (const j of unknownCells) flag(j);
        progress = true;
      }
    }
  }

  return revealedCount === n - totalMines;

  // --- tank solver: find cells forced mine/safe across all valid configs ---
  function tankDeduce(): boolean {
    const constraints: Constraint[] = [];
    const frontierSet = new Set<number>();
    for (let i = 0; i < n; i++) {
      if (!revealed[i] || adj[i] <= 0) continue;
      const ns = nbr[i];
      let f = 0;
      const cells: number[] = [];
      for (let k = 0; k < ns.length; k++) {
        const j = ns[k];
        if (flagged[j]) f++;
        else if (!revealed[j]) cells.push(j);
      }
      if (cells.length === 0) continue;
      constraints.push({ cells, need: adj[i] - f });
      for (const j of cells) frontierSet.add(j);
    }
    if (frontierSet.size === 0) return false;

    // Group frontier cells into components connected through shared constraints.
    const frontier = [...frontierSet];
    const pos = new Map<number, number>();
    frontier.forEach((j, k) => pos.set(j, k));
    const parent = frontier.map((_, k) => k);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    for (const con of constraints) {
      const a = pos.get(con.cells[0])!;
      for (let k = 1; k < con.cells.length; k++) {
        const b = pos.get(con.cells[k])!;
        parent[find(a)] = find(b);
      }
    }
    const compCells = new Map<number, number[]>();
    const compCons = new Map<number, Constraint[]>();
    for (let k = 0; k < frontier.length; k++) {
      const root = find(k);
      let list = compCells.get(root);
      if (!list) compCells.set(root, (list = []));
      list.push(frontier[k]);
    }
    for (const con of constraints) {
      const root = find(pos.get(con.cells[0])!);
      let list = compCons.get(root);
      if (!list) compCons.set(root, (list = []));
      list.push(con);
    }

    let any = false;
    for (const [root, cells] of compCells) {
      if (cells.length > COMPONENT_CAP) continue; // too big — leave for another round
      const res = enumerate(cells, compCons.get(root) || []);
      if (!res) continue; // enumeration bailed — stay sound, skip
      const { canMine, canSafe } = res;
      for (let k = 0; k < cells.length; k++) {
        if (!canMine[k]) {
          reveal(cells[k]);
          any = true;
        } // safe in every config
        else if (!canSafe[k]) {
          flag(cells[k]);
          any = true;
        } // mine in every config
      }
    }
    return any;
  }

  // Enumerate every valid mine assignment of one component; return per-cell
  // canMine/canSafe flags, or null if it bailed (too many solutions).
  function enumerate(
    cells: number[],
    cons: Constraint[]
  ): { canMine: Uint8Array; canSafe: Uint8Array } | null {
    const m = cells.length;
    const cellPos = new Map<number, number>();
    cells.forEach((j, k) => cellPos.set(j, k));
    const localCons = cons.map((con) => ({
      cells: con.cells.map((j) => cellPos.get(j)!),
      need: con.need,
      sum: 0,
      rem: 0,
    }));
    const cellCons: number[][] = Array.from({ length: m }, () => []);
    localCons.forEach((con, ci) => {
      con.rem = con.cells.length;
      con.cells.forEach((lc) => cellCons[lc].push(ci));
    });

    const assign = new Uint8Array(m);
    const canMine = new Uint8Array(m);
    const canSafe = new Uint8Array(m);
    let undetermined = m; // cells not yet seen as BOTH mine and safe
    let solutions = 0;
    let bailed = false;

    function recordLeaf(): void {
      solutions++;
      for (let k = 0; k < m; k++) {
        if (assign[k]) {
          if (!canMine[k]) {
            canMine[k] = 1;
            if (canSafe[k]) undetermined--;
          }
        } else if (!canSafe[k]) {
          canSafe[k] = 1;
          if (canMine[k]) undetermined--;
        }
      }
    }

    function rec(i: number): void {
      if (bailed || undetermined === 0) return; // nothing more can be forced
      if (i === m) {
        recordLeaf();
        if (solutions > SOLUTION_CAP) bailed = true;
        return;
      }
      for (let v = 0; v <= 1; v++) {
        const cs = cellCons[i];
        for (let t = 0; t < cs.length; t++) {
          const con = localCons[cs[t]];
          con.sum += v;
          con.rem--;
        }
        let ok = true;
        for (let t = 0; t < cs.length; t++) {
          const con = localCons[cs[t]];
          if (con.sum > con.need || con.sum + con.rem < con.need) {
            ok = false;
            break;
          }
        }
        if (ok) {
          assign[i] = v;
          rec(i + 1);
        }
        for (let t = 0; t < cs.length; t++) {
          const con = localCons[cs[t]];
          con.sum -= v;
          con.rem++;
        }
        if (bailed) return;
      }
    }

    rec(0);
    return bailed ? null : { canMine, canSafe };
  }
}
