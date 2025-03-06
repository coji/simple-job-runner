import type { StorageAdapter, Job, JobStatus } from 'simple-job-runner';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface FSAdapterOptions {
  /**
   * Base directory for job storage
   */
  directory: string;

  /**
   * Custom filesystem implementation (optional, defaults to Node.js fs)
   * Useful for testing or environments with different fs APIs
   */
  fs?: {
    promises: {
      mkdir: typeof fs.promises.mkdir;
      readdir: typeof fs.promises.readdir;
      readFile: typeof fs.promises.readFile;
      writeFile: typeof fs.promises.writeFile;
      stat: typeof fs.promises.stat;
    };
  };
}

/**
 * Create a filesystem storage adapter
 */
export function createFSAdapter(options: FSAdapterOptions): StorageAdapter {
  const { directory } = options;
  const fsImpl = options.fs || fs;
  const jobsDir = path.join(directory, 'jobs');

  // Generate a unique ID
  function generateId(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  // Ensure the jobs directory exists
  async function ensureJobsDir(): Promise<void> {
    try {
      await fsImpl.promises.mkdir(jobsDir, { recursive: true });
    } catch (err) {
      // Ignore if directory already exists
      if (err instanceof Error && 'code' in err && err.code !== 'EEXIST') {
        throw err;
      }
    }
  }

  // Get full path for a job file
  function getJobPath(id: string): string {
    return path.join(jobsDir, `${id}.json`);
  }

  // Save a job to filesystem
  async function saveJob(job: Job): Promise<void> {
    await ensureJobsDir();
    await fsImpl.promises.writeFile(
      getJobPath(job.id),
      JSON.stringify(job, null, 2),
      'utf8'
    );
  }

  // Load a job from filesystem
  async function loadJob(id: string): Promise<Job | null> {
    try {
      const data = await fsImpl.promises.readFile(getJobPath(id), 'utf8');
      return JSON.parse(data);
    } catch (err) {
      // Return null if file doesn't exist
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  return {
    /**
     * Find jobs by status
     */
    async findJobsByStatus(status?: JobStatus): Promise<Job[]> {
      await ensureJobsDir();

      try {
        const files = await fsImpl.promises.readdir(jobsDir);
        const jobFiles = files.filter((file) => file.endsWith('.json'));

        // Load all jobs
        const jobs = await Promise.all(
          jobFiles.map(async (file) => {
            const id = path.basename(file, '.json');
            return await loadJob(id);
          })
        );

        // Apply status filter if provided
        if (status) {
          return jobs.filter(
            (job): job is Job => job !== null && job.status === status
          );
        }

        // Return all non-null jobs
        return jobs.filter((job): job is Job => job !== null);
      } catch (err) {
        // If directory doesn't exist yet, return empty array
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
          return [];
        }
        throw err;
      }
    },

    /**
     * Create a new job
     */
    async create(
      name: string,
      payload: any,
      maxAttempts: number
    ): Promise<Job> {
      const now = Date.now();
      const id = generateId();

      const job: Job = {
        id,
        name,
        status: 'pending',
        payload,
        attempts: 0,
        maxAttempts,
        createdAt: now,
        updatedAt: now,
      };

      await saveJob(job);
      return job;
    },

    /**
     * Mark job as running
     */
    async markRunning(id: string): Promise<void> {
      const job = await loadJob(id);
      if (!job) {
        throw new Error(`Job not found: ${id}`);
      }

      job.status = 'running';
      job.updatedAt = Date.now();

      await saveJob(job);
    },

    /**
     * Mark job as done with optional result
     */
    async markDone(id: string, result?: any): Promise<void> {
      const job = await loadJob(id);
      if (!job) {
        throw new Error(`Job not found: ${id}`);
      }

      job.status = 'done';
      job.result = result;
      job.updatedAt = Date.now();

      await saveJob(job);
    },

    /**
     * Mark job as failed with error message
     */
    async markFailed(id: string, error: string): Promise<void> {
      const job = await loadJob(id);
      if (!job) {
        throw new Error(`Job not found: ${id}`);
      }

      job.status = 'failed';
      job.error = error;
      job.updatedAt = Date.now();

      await saveJob(job);
    },

    /**
     * Increment job attempt count
     */
    async incAttempts(id: string): Promise<void> {
      const job = await loadJob(id);
      if (!job) {
        throw new Error(`Job not found: ${id}`);
      }

      job.attempts += 1;
      job.updatedAt = Date.now();

      await saveJob(job);
    },

    /**
     * Reset job status (typically from 'running' to 'pending')
     */
    async resetJobStatus(id: string, status: JobStatus): Promise<void> {
      const job = await loadJob(id);
      if (!job) {
        throw new Error(`Job not found: ${id}`);
      }

      job.status = status;
      job.updatedAt = Date.now();

      await saveJob(job);
    },

    async listJobs(options?: {
      status?: JobStatus[];
      limit?: number;
      offset?: number;
    }): Promise<Job[]> {
      await ensureJobsDir();

      try {
        const files = await fsImpl.promises.readdir(jobsDir);
        const jobFiles = files.filter((file) => file.endsWith('.json'));

        // Load all jobs
        let jobs = await Promise.all(
          jobFiles
            .map(async (file) => {
              const id = path.basename(file, '.json');
              return await loadJob(id);
            })
            .filter((job): job is Promise<Job> => job !== null)
        );

        // Apply status filter
        if (options?.status) {
          const statusFilter = new Set(options.status);
          jobs = jobs.filter((job) => statusFilter.has(job.status));
        }

        // Sort by creation date (descending)
        jobs.sort((a, b) => b.createdAt - a.createdAt);

        // Apply pagination
        if (options?.offset || options?.limit) {
          const start = options.offset || 0;
          const end = options.limit ? start + options.limit : undefined;
          jobs = jobs.slice(start, end);
        }

        return jobs.filter((job): job is Job => job !== null);
      } catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
          return [];
        }
        throw err;
      }
    },

    async getJob(id: string): Promise<Job | null> {
      return await loadJob(id);
    },
  };
}
