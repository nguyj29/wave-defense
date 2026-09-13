// Uniform-grid spatial partition used for collision and target queries.
// Rebuilt every fixed-tick from current entity positions — cheap at ~300
// entities and much simpler than incremental maintenance.
export class SpatialGrid<T extends { x: number; y: number }> {
  private cellSize: number;
  private cells = new Map<string, T[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number): string {
    return cx + ',' + cy;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const cx = Math.floor(item.x / this.cellSize);
    const cy = Math.floor(item.y / this.cellSize);
    const k = this.key(cx, cy);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push(item);
  }

  build(items: Iterable<T>): void {
    this.clear();
    for (const item of items) this.insert(item);
  }

  /** All items whose cell is within `radius` of (x,y), unfiltered by exact distance. */
  queryRadius(x: number, y: number, radius: number): T[] {
    const result: T[] = [];
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) result.push(...bucket);
      }
    }
    return result;
  }
}
