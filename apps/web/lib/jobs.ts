import PgBoss from 'pg-boss';
import {
  databaseUrlWithExternalSslOptions,
  getDatabaseSslOptions,
} from '@bro/db';
async function withBoss<T>(operation: (boss: PgBoss) => Promise<T>) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw Object.assign(new Error('Durable job database is not configured'), {
      status: 503,
    });
  const ssl = getDatabaseSslOptions();
  const boss = new PgBoss({
    connectionString: databaseUrlWithExternalSslOptions(
      connectionString,
      Boolean(ssl)
    ),
    ...(ssl ? { ssl } : {}),
  });
  await boss.start();
  try {
    return await operation(boss);
  } finally {
    await boss.stop({ graceful: true });
  }
}
export async function enqueueJob(
  name: string,
  data: object,
  options: { singletonKey: string; startAfter?: Date }
) {
  // Give the caller's database transaction time to record the application
  // background-job row before pg-boss can deliver the message to the worker.
  // This keeps fast local workers from completing a job before it is visible
  // in the UI and audit tables.
  const startAfter = options.startAfter || new Date(Date.now() + 2_000);
  return withBoss(async (boss) => {
    const id = await boss.send(name, data, {
      singletonKey: options.singletonKey,
      startAfter,
      retryLimit: Number(process.env.WORKER_RETRY_LIMIT || 5),
      retryBackoff: true,
    });
    if (!id) throw new Error('Durable job was not created');
    return id;
  });
}
export async function cancelJob(name: string, id: string) {
  return withBoss((boss) => boss.cancel(name, id));
}
