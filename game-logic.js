/* Tetris core logic — pure functions, no DOM. Used by index.html and headless-tested in Node. */
(function (root) {
  'use strict';

  var COLS = 10, ROWS = 20;

  // Base cell layouts inside their bounding boxes (I: 4x4, O: 2x2, rest: 3x3)
  var SHAPES = {
    I: { size: 4, cells: [[0,1],[1,1],[2,1],[3,1]], color: 0 },
    O: { size: 2, cells: [[0,0],[1,0],[0,1],[1,1]], color: 1 },
    T: { size: 3, cells: [[1,0],[0,1],[1,1],[2,1]], color: 2 },
    S: { size: 3, cells: [[1,0],[2,0],[0,1],[1,1]], color: 3 },
    Z: { size: 3, cells: [[0,0],[1,0],[1,1],[2,1]], color: 4 },
    J: { size: 3, cells: [[0,0],[0,1],[1,1],[2,1]], color: 5 },
    L: { size: 3, cells: [[2,0],[0,1],[1,1],[2,1]], color: 6 }
  };
  var TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  var LINE_SCORES = [0, 100, 300, 500, 800];
  var KICKS = [0, -1, 1, -2, 2];

  function rotateCells(cells, size) {
    // 90 deg clockwise inside size x size box
    return cells.map(function (c) { return [size - 1 - c[1], c[0]]; });
  }

  function cellsFor(type, rot) {
    var shape = SHAPES[type];
    var cells = shape.cells;
    for (var i = 0; i < rot; i++) cells = rotateCells(cells, shape.size);
    return cells;
  }

  function emptyGrid() {
    var g = [];
    for (var r = 0; r < ROWS; r++) { g.push([]); for (var c = 0; c < COLS; c++) g[r].push(-1); }
    return g;
  }

  function createGame(rng) {
    var state = {
      grid: emptyGrid(), bag: [], piece: null, next: null,
      score: 0, lines: 0, level: 1, over: false,
      rng: rng || Math.random
    };
    refillBag(state);
    state.next = drawFromBag(state);
    spawn(state);
    return state;
  }

  function refillBag(state) {
    var bag = TYPES.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(state.rng() * (i + 1));
      var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    state.bag = bag;
  }

  function drawFromBag(state) {
    if (!state.bag.length) refillBag(state);
    return state.bag.pop();
  }

  function spawn(state) {
    var type = state.next;
    state.next = drawFromBag(state);
    var shape = SHAPES[type];
    var piece = { type: type, rot: 0, x: Math.floor((COLS - shape.size) / 2), y: 0 };
    state.piece = piece;
    if (collides(state, piece)) { state.over = true; state.piece = null; return false; }
    return true;
  }

  function pieceCells(piece) {
    return cellsFor(piece.type, piece.rot);
  }

  function collides(state, piece, dx, dy) {
    dx = dx || 0; dy = dy || 0;
    var cells = pieceCells(piece);
    for (var i = 0; i < cells.length; i++) {
      var x = piece.x + cells[i][0] + dx, y = piece.y + cells[i][1] + dy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && state.grid[y][x] !== -1) return true;
    }
    return false;
  }

  function move(state, dx, dy) {
    if (!state.piece || state.over) return false;
    if (collides(state, state.piece, dx, dy)) return false;
    state.piece.x += dx; state.piece.y += dy;
    return true;
  }

  function rotate(state, dir) {
    // dir: 1 = clockwise, -1 = counter-clockwise
    if (!state.piece || state.over) return false;
    var p = state.piece;
    if (p.type === 'O') return true;
    var oldRot = p.rot;
    p.rot = (p.rot + (dir > 0 ? 1 : 3)) % 4;
    for (var k = 0; k < KICKS.length; k++) {
      if (!collides(state, p, KICKS[k], 0)) { p.x += KICKS[k]; return true; }
    }
    p.rot = oldRot;
    return false;
  }

  function ghostY(state) {
    var p = state.piece;
    if (!p) return 0;
    var y = p.y;
    while (!collides(state, p, 0, y - p.y + 1)) y++;
    return y;
  }

  function hardDrop(state) {
    if (!state.piece || state.over) return 0;
    var dist = ghostY(state) - state.piece.y;
    state.piece.y = ghostY(state);
    state.score += dist * 2;
    return dist;
  }

  function lockPiece(state) {
    var p = state.piece;
    var cells = pieceCells(p);
    cells.forEach(function (c) {
      var x = p.x + c[0], y = p.y + c[1];
      if (y >= 0) state.grid[y][x] = SHAPES[p.type].color;
    });
    state.piece = null;
    var cleared = clearLines(state);
    if (cleared > 0) {
      state.lines += cleared;
      state.score += LINE_SCORES[cleared] * state.level;
      state.level = Math.floor(state.lines / 10) + 1;
    }
    return cleared;
  }

  function clearLines(state) {
    var kept = state.grid.filter(function (row) {
      return row.some(function (v) { return v === -1; });
    });
    var cleared = ROWS - kept.length;
    while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(-1));
    state.grid = kept;
    return cleared;
  }

  // One gravity step. Returns 'moved', 'locked' or 'over'.
  function tick(state) {
    if (state.over || !state.piece) return 'over';
    if (move(state, 0, 1)) return 'moved';
    lockPiece(state);
    if (!spawn(state)) return 'over';
    return 'locked';
  }

  function dropIntervalMs(level) {
    return Math.max(60, Math.round(800 * Math.pow(0.85, level - 1)));
  }

  var api = {
    COLS: COLS, ROWS: ROWS, TYPES: TYPES, SHAPES: SHAPES,
    createGame: createGame, spawn: spawn, move: move, rotate: rotate,
    hardDrop: hardDrop, ghostY: ghostY, tick: tick, lockPiece: lockPiece,
    clearLines: clearLines, collides: collides, pieceCells: pieceCells,
    dropIntervalMs: dropIntervalMs
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TetrisLogic = api;
})(typeof window !== 'undefined' ? window : global);
