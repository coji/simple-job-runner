# Simple Job Runner

A minimal, dependency-free job runner with retry capabilities.

## Features

- Lightweight and minimal API
- Fire-and-forget job execution
- Automatic retry with exponential backoff
- Multiple storage backends
- Recover interrupted jobs on startup
- TypeScript support

## Packages

- `simple-job-runner`: Core functionality
- `simple-job-runner-kysely`: Kysely database adapter
- `simple-job-runner-prisma`: Prisma ORM adapter
- `simple-job-runner-fs`: Filesystem adapter
- `simple-job-runner-kv`: Cloudflare Workers KV adapter

## Installation

```bash
# Install core package
npm install simple-job-runner

# Install adapter(s) you need
npm install simple-job-runner-kysely
# or
npm install simple-job-runner-prisma
# or
npm install simple-job-runner-fs
# or
npm install simple-job-runner-kv
```

## Basic Usage

```typescript
import { createRunner } from 'simple-job-runner';
import { createKyselyAdapter } from 'simple-job-runner-kysely';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

// Setup database connection
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL })
  })
});

// Create storage adapter
const storage = createKyselyAdapter(db);

// Create job runner
const runner = createRunner(storage)
  // Register job handlers
  .register('sendEmail', async ({ to, subject, body }) => {
    console.log(`Sending email to ${to}`);
    // Email sending logic here
    return { sent: true, timestamp: new Date() };
  })
  // Listen for events
  .on('done', (job) => {
    console.log(`Job ${job.id} completed successfully`);
  })
  .on('failed', (job) => {
    console.error(`Job ${job.id} failed after ${job.attempts} attempts`);
  });

// Recover any pending jobs from previous runs
runner.recover().then(count => {
  console.log(`Recovered ${count} pending jobs`);
});

// Add a new job
const job = await runner.add('sendEmail', {
  to: 'user@example.com',
  subject: 'Hello',
  body: 'This is a test email'
});

console.log(`Job queued with ID: ${job.id}`);
```

## License

MIT
