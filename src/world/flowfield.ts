import { CORE, WORLD } from '../config.ts';
import type { Obstacle } from './obstacles.ts';
import { WALL_SEGMENTS, type Rect } from './map.ts';

// Pathfinding is kept behind this interface so a per-agent A* or a second
// field (for future rushers/bosses) can be swapped in without touching
// callers — enemy AI only ever asks "which way do I go from here?".
export interface Pathfinder {
  getDirection(x: number, y: number): { x: number; y: number };
  recompute(obstacles: Obstacle[]): void;
}

class MinHeap {
  private heap: number[] = []; // pairs flattened: [dist, index, dist, index, ...]

  get size(): number {
    return this.heap.length / 2;
  }

  push(dist: number, index: number): void {
    this.heap.push(dist, index);
    let i = this.heap.length / 2 - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent * 2] <= this.heap[i * 2]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { dist: number; index: number } | undefined {
    if (this.heap.length === 0) return undefined;
    const topDist = this.heap[0];
    const topIndex = this.heap[1];
    const lastDist = this.heap.pop()!;
    const lastIndex = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = lastDist;
      this.heap[1] = lastIndex;
      let i = 0;
      const n = this.heap.length / 2;
      for (;;) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let smallest = i;
        if (l < n && this.heap[l * 2] < this.heap[smallest * 2]) smallest = l;
        if (r < n && this.heap[r * 2] < this.heap[smallest * 2]) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return { dist: topDist, index: topIndex };
  }

  private swap(a: number, b: number): void {
    const d = this.heap[a * 2];
    const i = this.heap[a * 2 + 1];
    this.heap[a * 2] = this.heap[b * 2];
    this.heap[a * 2 + 1] = this.heap[b * 2 + 1];
    this.heap[b * 2] = d;
    this.heap[b * 2 + 1] = i;
  }
}

const NEIGHBORS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export class FlowField implements Pathfinder {
  private cellSize: number;
  private cols: number;
  private rows: number;
  private blocked!: Uint8Array;
  private dist!: Float32Array;
  private dirX!: Float32Array;
  private dirY!: Float32Array;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(WORLD.width / cellSize);
    this.rows = Math.ceil(WORLD.height / cellSize);
  }

  private idx(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  private cellCenter(cx: number, cy: number): { x: number; y: number } {
    return { x: (cx + 0.5) * this.cellSize, y: (cy + 0.5) * this.cellSize };
  }

  private cellBlockedByRects(cx: number, cy: number, rects: Rect[], margin: number): boolean {
    const { x, y } = this.cellCenter(cx, cy);
    for (const r of rects) {
      if (x >= r.x - margin && x <= r.x + r.w + margin && y >= r.y - margin && y <= r.y + r.h + margin) {
        return true;
      }
    }
    return false;
  }

  recompute(obstacles: Obstacle[]): void {
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.dist = new Float32Array(n).fill(Infinity);
    this.dirX = new Float32Array(n);
    this.dirY = new Float32Array(n);

    const margin = 16; // roughly a unit radius so paths don't hug obstacle edges
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const { x, y } = this.cellCenter(cx, cy);
        let blocked = this.cellBlockedByRects(cx, cy, WALL_SEGMENTS, margin);
        if (!blocked) {
          for (const o of obstacles) {
            const dx = x - o.x;
            const dy = y - o.y;
            if (dx * dx + dy * dy < (o.radius + margin) * (o.radius + margin)) {
              blocked = true;
              break;
            }
          }
        }
        this.blocked[this.idx(cx, cy)] = blocked ? 1 : 0;
      }
    }

    // Dijkstra from the core's cell outward — every cell learns its distance
    // to the core and (via gradient descent) which neighbor to step to.
    const coreCx = Math.floor(CORE.x / this.cellSize);
    const coreCy = Math.floor(CORE.y / this.cellSize);
    const sourceIdx = this.idx(coreCx, coreCy);
    this.dist[sourceIdx] = 0;
    const heap = new MinHeap();
    heap.push(0, sourceIdx);

    while (heap.size > 0) {
      const top = heap.pop()!;
      if (top.dist > this.dist[top.index]) continue;
      const cx = top.index % this.cols;
      const cy = Math.floor(top.index / this.cols);
      for (const [dxn, dyn, cost] of NEIGHBORS) {
        const nx = cx + dxn;
        const ny = cy + dyn;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const nIdx = this.idx(nx, ny);
        if (this.blocked[nIdx]) continue;
        const nd = top.dist + cost;
        if (nd < this.dist[nIdx]) {
          this.dist[nIdx] = nd;
          heap.push(nd, nIdx);
        }
      }
    }

    // Direction field: each cell's heading is a discrete gradient (central
    // difference) of the distance field rather than a snap to the single
    // best 8-connected neighbor. This alone breaks the "only 8 possible
    // headings per cell" limitation that produced blocky, staircase-y
    // movement — the gradient's angle varies continuously with the local
    // shape of the distance field. getDirection() below further smooths
    // this by bilinearly interpolating between neighboring cells at query
    // time, so units never see a hard heading change at a cell boundary.
    const distAt = (cx: number, cy: number, selfDist: number): number => {
      if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return selfDist;
      const i = this.idx(cx, cy);
      if (this.blocked[i] || !isFinite(this.dist[i])) return selfDist;
      return this.dist[i];
    };

    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const i = this.idx(cx, cy);
        if (this.blocked[i] || !isFinite(this.dist[i])) continue;
        const d = this.dist[i];
        const dLeft = distAt(cx - 1, cy, d);
        const dRight = distAt(cx + 1, cy, d);
        const dUp = distAt(cx, cy - 1, d);
        const dDown = distAt(cx, cy + 1, d);
        let gx = -(dRight - dLeft) / 2;
        let gy = -(dDown - dUp) / 2;
        let len = Math.hypot(gx, gy);
        if (len < 1e-4) {
          // Degenerate/flat gradient (e.g. right at the core, or a locally
          // symmetric pocket) — fall back to the old best-neighbor heading
          // so a reachable cell never ends up with a zero vector.
          let bestDist = d;
          let bestDx = 0;
          let bestDy = 0;
          for (const [dxn, dyn] of NEIGHBORS) {
            const nx = cx + dxn;
            const ny = cy + dyn;
            if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
            const nIdx = this.idx(nx, ny);
            if (this.dist[nIdx] < bestDist) {
              bestDist = this.dist[nIdx];
              bestDx = dxn;
              bestDy = dyn;
            }
          }
          gx = bestDx;
          gy = bestDy;
          len = Math.hypot(gx, gy) || 1;
        }
        this.dirX[i] = gx / len;
        this.dirY[i] = gy / len;
      }
    }
  }

  /** Direction of cell (cx,cy), clamped into bounds; `fallback` covers blocked/unreachable cells. */
  private sampleDir(cx: number, cy: number, fallback: { x: number; y: number }): { x: number; y: number } {
    const ccx = Math.max(0, Math.min(this.cols - 1, cx));
    const ccy = Math.max(0, Math.min(this.rows - 1, cy));
    const i = this.idx(ccx, ccy);
    if (this.blocked[i] || !isFinite(this.dist[i])) return fallback;
    return { x: this.dirX[i], y: this.dirY[i] };
  }

  getDirection(x: number, y: number): { x: number; y: number } {
    // Fallback used for any blocked/unreachable corner sample below, so a
    // bad sample near an obstacle or the field's edge can't corrupt the
    // interpolation — same "head straight for the core" fallback the
    // original single-cell lookup used.
    const fdx = CORE.x - x;
    const fdy = CORE.y - y;
    const flen = Math.hypot(fdx, fdy) || 1;
    const fallback = { x: fdx / flen, y: fdy / flen };

    // Bilinearly interpolate the direction field across the 2x2 neighborhood
    // of cell centers around (x,y), based on fractional cell position, then
    // re-normalize. This is what actually removes the 8-direction "snap":
    // the result can point anywhere, smoothly varying as the query point
    // moves, instead of jumping between whichever single cell contains it.
    const gx = x / this.cellSize - 0.5;
    const gy = y / this.cellSize - 0.5;
    const cx0 = Math.floor(gx);
    const cy0 = Math.floor(gy);
    const fx = gx - cx0;
    const fy = gy - cy0;

    const d00 = this.sampleDir(cx0, cy0, fallback);
    const d10 = this.sampleDir(cx0 + 1, cy0, fallback);
    const d01 = this.sampleDir(cx0, cy0 + 1, fallback);
    const d11 = this.sampleDir(cx0 + 1, cy0 + 1, fallback);

    const topX = d00.x * (1 - fx) + d10.x * fx;
    const topY = d00.y * (1 - fx) + d10.y * fx;
    const botX = d01.x * (1 - fx) + d11.x * fx;
    const botY = d01.y * (1 - fx) + d11.y * fx;

    const dx = topX * (1 - fy) + botX * fy;
    const dy = topY * (1 - fy) + botY * fy;

    const len = Math.hypot(dx, dy);
    if (len < 1e-5) return fallback;
    return { x: dx / len, y: dy / len };
  }
}
