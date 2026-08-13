import PgBoss from 'pg-boss';
async function withBoss<T>(operation: (boss: PgBoss) => Promise<T>) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw Object.assign(new Error('Durable job database is not configured'), {
      status: 503,
    });
  const boss = new PgBoss({ connectionString });
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
  return withBoss(async (boss) => {
    const id = await boss.send(name, data, {
      singletonKey: options.singletonKey,
      startAfter: options.startAfter,
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
