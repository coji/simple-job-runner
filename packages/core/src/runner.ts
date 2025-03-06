import { EventEmitter } from 'node:events';
import type {
  StorageAdapter,
  JobHandler,
  Job,
  JobRunner,
  JobStatus,
} from './types';

export function createRunner(storage: StorageAdapter): JobRunner {
  const events = new EventEmitter();
  const handlers: Record<string, JobHandler> = {};

  /**
   * Process a job (execute handler and handle status transitions)
   */
  async function process(job: Job): Promise<void> {
    try {
      // Mark as running
      await storage.markRunning(job.id);
      events.emit('start', job);

      // Check if handler exists
      const handler = handlers[job.name];
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.name}`);
      }

      // Execute job handler
      const result = await handler(job.payload);

      // Mark as done
      await storage.markDone(job.id, result);
      events.emit('done', { ...job, result });
    } catch (err) {
      // Increment attempt count
      await storage.incAttempts(job.id);

      // Check if we should retry
      if (job.attempts < job.maxAttempts) {
        // Calculate exponential backoff delay (with 30s max)
        const delay = Math.min(1000 * 2 ** job.attempts, 30000);
        setTimeout(() => process(job), delay);
      } else {
        // Max attempts reached, mark as failed
        const errorMsg = err instanceof Error ? err.message : String(err);
        await storage.markFailed(job.id, errorMsg);
        events.emit('failed', job);
      }
    }
  }

  /**
   * Add a new job
   */
  async function add(
    name: string,
    payload: any,
    options: { maxAttempts?: number } = {}
  ): Promise<Job> {
    const maxAttempts = options.maxAttempts ?? 3;

    // Create job in storage
    const job = await storage.create(name, payload, maxAttempts);

    // Start processing (fire and forget)
    setImmediate(() => process(job));

    return job;
  }

  /**
   * Recover pending jobs
   */
  async function recover(): Promise<number> {
    const pendingJobs = await storage.findJobsByStatus('pending');
    const runningJobs = await storage.findJobsByStatus('running');

    // running 状態のジョブを pending にリセット
    for (const job of runningJobs) {
      await storage.resetJobStatus(job.id, 'pending');
      events.emit('recover', job);
    }

    const jobsToRecover = [...pendingJobs, ...runningJobs];
    for (const job of jobsToRecover) {
      setImmediate(() => process(job));
    }

    return jobsToRecover.length;
  }

  /**
   * Register a job handler
   */
  function register(name: string, handler: JobHandler): JobRunner {
    handlers[name] = handler;
    return api;
  }

  /**
   * Event subscription
   */
  function on(event: string, listener: (job: Job) => void): JobRunner {
    events.on(event, listener);
    return api;
  }

  function listJobs(options?: {
    status?: JobStatus[];
    limit?: number;
    offset?: number;
  }): Promise<Job[]> {
    return storage.listJobs(options);
  }

  function getJob(id: string): Promise<Job | null> {
    return storage.getJob(id);
  }

  // Public API
  const api: JobRunner = {
    add,
    register,
    recover,
    on,
    listJobs,
    getJob,
  };

  return api;
}
