import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';

// Isolated temp DB for the queue's auto-init (persistence is disabled per-instance
// below so these tests don't depend on DB writes).
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(os.tmpdir(), `gitlogs-queue-${process.pid}.db`);

const queueMod = await import('../src/queueService');
const QueueService = queueMod.QueueService || queueMod.default.QueueService;

describe('QueueService — rate-limited retry queue', () => {
  let qs;

  beforeEach(() => {
    qs = new QueueService({
      processingIntervalMs: 10,
      maxRetries: 2,
      baseRetryDelayMs: 5,
      maxRetryDelayMs: 40,
      maxRequestsPerMinute: 1000,
    });
    qs.persistenceEnabled = false; // pure in-memory mechanics under test
    qs.start();
  });

  afterEach(() => {
    qs.stop();
  });

  it('processes a task and resolves with its result', async () => {
    const task = vi.fn().mockResolvedValue('done');
    const result = await qs.enqueue({ task, taskType: 'unit-success' });

    expect(result).toBe('done');
    expect(task).toHaveBeenCalledTimes(1);
    expect(qs.stats.totalProcessed).toBe(1);
  });

  it('retries with backoff and eventually succeeds', async () => {
    let attempts = 0;
    const task = vi.fn().mockImplementation(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('transient failure');
      return 'recovered';
    });

    const result = await qs.enqueue({ task, taskType: 'unit-retry' });

    expect(result).toBe('recovered');
    expect(attempts).toBe(3); // 1 initial + 2 retries
    expect(qs.stats.totalRetries).toBe(2);
    expect(qs.stats.totalProcessed).toBe(1);
  });

  it('gives up after maxRetries and rejects', async () => {
    const task = vi.fn().mockRejectedValue(new Error('permanent failure'));

    await expect(qs.enqueue({ task, taskType: 'unit-fail' })).rejects.toThrow('permanent failure');
    expect(task).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(qs.stats.totalFailed).toBe(1);
  });
});
