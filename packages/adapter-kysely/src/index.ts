import {
  type Kysely,
  SqliteAdapter,
  PostgresAdapter,
  MysqlAdapter,
} from 'kysely';
import type { StorageAdapter, Job, JobStatus } from 'simple-job-runner';

// Kysely table definition
export interface JobsTable {
  id: string;
  name: string;
  status: string;
  payload: string; // JSON string
  attempts: number;
  max_attempts: number;
  result: string | null; // JSON string or null
  error: string | null;
  created_at: number; // timestamp
  updated_at: number; // timestamp
}

export interface KyselyTables {
  jobs: JobsTable;
}

/**
 * Create a migration function to initialize the jobs table
 */
export function createMigration(db: Kysely<any>) {
  return async function migrate() {
    const hasTable = await db.introspection
      .getTables()
      .then((tables) => tables.some((table) => table.name === 'jobs'));

    if (!hasTable) {
      await db.schema
        .createTable('jobs')
        .addColumn('id', 'varchar', (col) => col.primaryKey().notNull())
        .addColumn('name', 'varchar', (col) => col.notNull())
        .addColumn('status', 'varchar', (col) => col.notNull())
        .addColumn('payload', 'text', (col) => col.notNull())
        .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('max_attempts', 'integer', (col) =>
          col.notNull().defaultTo(3)
        )
        .addColumn('result', 'text')
        .addColumn('error', 'text')
        .addColumn('created_at', 'bigint', (col) => col.notNull())
        .addColumn('updated_at', 'bigint', (col) => col.notNull())
        .execute();

      console.log('Created jobs table');
    }
  };
}

/**
 * Create a Kysely storage adapter
 */
export function createKyselyAdapter(db: Kysely<any>): StorageAdapter {
  // Generate a unique ID
  function generateId(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  // Convert DB row to Job type
  function rowToJob(row: any): Job {
    return {
      id: row.id,
      name: row.name,
      status: row.status as any,
      payload: JSON.parse(row.payload),
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  return {
    /**
     * Find all pending jobs
     */
    async findPending(): Promise<Job[]> {
      const rows = await db
        .selectFrom('jobs')
        .where('status', '=', 'pending')
        .selectAll()
        .execute();

      return rows.map(rowToJob);
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

      // Create the job
      const [row] = await db
        .insertInto('jobs')
        .values({
          id,
          name,
          status: 'pending',
          payload: JSON.stringify(payload),
          attempts: 0,
          max_attempts: maxAttempts,
          result: null,
          error: null,
          created_at: now,
          updated_at: now,
        })
        .returning([
          'id',
          'name',
          'status',
          'payload',
          'attempts',
          'max_attempts',
          'result',
          'error',
          'created_at',
          'updated_at',
        ])
        .execute();

      return rowToJob(row);
    },

    /**
     * Mark job as running
     */
    async markRunning(id: string): Promise<void> {
      await db
        .updateTable('jobs')
        .set({
          status: 'running',
          updated_at: Date.now(),
        })
        .where('id', '=', id)
        .execute();
    },

    /**
     * Mark job as done with optional result
     */
    async markDone(id: string, result?: any): Promise<void> {
      await db
        .updateTable('jobs')
        .set({
          status: 'done',
          result: result ? JSON.stringify(result) : null,
          updated_at: Date.now(),
        })
        .where('id', '=', id)
        .execute();
    },

    /**
     * Mark job as failed with error message
     */
    async markFailed(id: string, error: string): Promise<void> {
      await db
        .updateTable('jobs')
        .set({
          status: 'failed',
          error,
          updated_at: Date.now(),
        })
        .where('id', '=', id)
        .execute();
    },

    /**
     * Increment job attempt count
     */
    async incAttempts(id: string): Promise<void> {
      await db
        .updateTable('jobs')
        .set(({ eb }) => ({
          attempts: eb('attempts', '+', 1),
          updated_at: Date.now(),
        }))
        .where('id', '=', id)
        .execute();
    },

    async listJobs(options?: {
      status?: JobStatus;
      limit?: number;
      offset?: number;
    }): Promise<Job[]> {
      let query = db.selectFrom('jobs').selectAll();

      // Apply filters
      if (options?.status) {
        query = query.where('status', '=', options.status);
      }

      // Apply pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.offset(options.offset);
      }

      // Order by creation date descending (newest first)
      query = query.orderBy('created_at', 'desc');

      const rows = await query.execute();
      return rows.map(rowToJob);
    },

    async getJob(id: string): Promise<Job | null> {
      const row = await db
        .selectFrom('jobs')
        .where('id', '=', id)
        .selectAll()
        .executeTakeFirst();

      return row ? rowToJob(row) : null;
    },
  };
}
