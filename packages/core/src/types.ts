export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  payload: any;
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: any;
  createdAt: number;
  updatedAt: number;
}

export interface StorageAdapter {
  /**
   * Find all pending jobs
   */
  findPending: () => Promise<Job[]>;

  /**
   * Create a new job
   */
  create: (name: string, payload: any, maxAttempts: number) => Promise<Job>;

  /**
   * Mark job as running
   */
  markRunning: (id: string) => Promise<void>;

  /**
   * Mark job as done with optional result
   */
  markDone: (id: string, result?: any) => Promise<void>;

  /**
   * Mark job as failed with error message
   */
  markFailed: (id: string, error: string) => Promise<void>;

  /**
   * Increment job attempt count
   */
  incAttempts: (id: string) => Promise<void>;

  /**
   * List all jobs with optional status filter
   */
  listJobs: (options?: {
    status?: JobStatus;
    limit?: number;
    offset?: number;
  }) => Promise<Job[]>;

  /**
   * Get a job by id
   */
  getJob: (id: string) => Promise<Job | null>;
}

export type JobHandler = (payload: any) => Promise<any>;

export interface JobRunnerEvents {
  on(event: 'start', listener: (job: Job) => void): JobRunner;
  on(event: 'done', listener: (job: Job) => void): JobRunner;
  on(event: 'failed', listener: (job: Job) => void): JobRunner;
}

export interface JobRunner extends JobRunnerEvents {
  /**
   * Add a new job
   */
  add(
    name: string,
    payload: any,
    options?: { maxAttempts?: number }
  ): Promise<Job>;

  /**
   * Register a job handler
   */
  register(name: string, handler: JobHandler): JobRunner;

  /**
   * Recover pending jobs (typically used on startup)
   */
  recover(): Promise<number>;

  listJobs(options?: {
    status?: JobStatus;
    limit?: number;
    offset?: number;
  }): Promise<Job[]>;

  getJob(id: string): Promise<Job | null>;
}
