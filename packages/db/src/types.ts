import type { createDatabase } from './client';
export type ReturnTypeDatabase = ReturnType<typeof createDatabase>['db'];
