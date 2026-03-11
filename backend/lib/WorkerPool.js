/**
 * WorkerPool — Manages N concurrent workers processing queue items.
 * Replaces the old sequential `isRunning` boolean + while loop.
 * Polls for new items every 10 seconds and fills up to maxWorkers slots.
 */
export class WorkerPool {
  constructor(maxWorkers = 5) {
    this.maxWorkers = maxWorkers;
    this.activeWorkers = new Map(); // workerId -> { queueItem, startTime, keyword, source }
    this.isRunning = false;
    this.nextWorkerId = 0;
    this.processItem = null;    // async (queueItem) => result
    this.getNextItem = null;    // async () => queueItem | null
    this.onWorkerStart = null;  // async (workerId, queueItem) => void
    this.onWorkerDone = null;   // async (workerId, result, queueItem) => void
    this.onWorkerError = null;  // async (workerId, error, queueItem) => void
    this.pollIntervalMs = 10_000; // 10 seconds
    this._pollTimer = null;
    this._polling = false;
  }

  /**
   * Start the worker pool. Begins polling for pending items.
   */
  start({ processItem, getNextItem, onWorkerStart, onWorkerDone, onWorkerError }) {
    this.processItem = processItem;
    this.getNextItem = getNextItem;
    this.onWorkerStart = onWorkerStart || (() => {});
    this.onWorkerDone = onWorkerDone || (() => {});
    this.onWorkerError = onWorkerError || (() => {});
    this.isRunning = true;

    console.log(`⚡ Worker pool started: max ${this.maxWorkers} concurrent workers`);
    this._poll();
  }

  /**
   * Stop the worker pool. Active workers finish but no new ones spawn.
   */
  stop() {
    this.isRunning = false;
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    console.log(`🛑 Worker pool stopped. ${this.activeWorkers.size} workers still finishing.`);
  }

  /**
   * Core polling loop. Fills empty worker slots with pending items.
   */
  async _poll() {
    if (!this.isRunning || this._polling) return;
    this._polling = true;

    try {
      // Fill up to maxWorkers
      while (this.activeWorkers.size < this.maxWorkers && this.isRunning) {
        const item = await this.getNextItem();
        if (!item) break; // No more pending items
        this._spawnWorker(item);
      }
    } catch (err) {
      console.error("Worker pool poll error:", err.message);
    } finally {
      this._polling = false;
    }

    // Schedule next poll
    if (this.isRunning) {
      this._pollTimer = setTimeout(() => this._poll(), this.pollIntervalMs);
    }
  }

  /**
   * Spawn a worker for a queue item. Runs in background (non-blocking).
   */
  _spawnWorker(queueItem) {
    const workerId = this.nextWorkerId++;
    const workerInfo = {
      queueItem,
      startTime: Date.now(),
      keyword: queueItem.keyword,
      source: queueItem.source,
    };
    this.activeWorkers.set(workerId, workerInfo);

    // Fire and forget — runs in background
    (async () => {
      try {
        await this.onWorkerStart(workerId, queueItem);
        const result = await this.processItem(queueItem);
        await this.onWorkerDone(workerId, result, queueItem);
      } catch (err) {
        await this.onWorkerError(workerId, err, queueItem);
      } finally {
        this.activeWorkers.delete(workerId);
        // Immediately try to fill the now-empty slot
        if (this.isRunning) {
          // Small delay to prevent tight loops on errors
          setTimeout(() => this._poll(), 1000);
        }
      }
    })();
  }

  /**
   * Get current pool status for monitoring endpoints.
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeWorkers: this.activeWorkers.size,
      maxWorkers: this.maxWorkers,
      workers: Array.from(this.activeWorkers.entries()).map(([id, w]) => ({
        id,
        keyword: w.keyword,
        source: w.source,
        elapsed: Math.round((Date.now() - w.startTime) / 1000),
      })),
    };
  }
}
