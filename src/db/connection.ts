import { Surreal } from 'surrealdb';
import { createWasmEngines } from '@surrealdb/wasm';
import { logDbError } from './errors';
import { runMigrations } from './migrations';

const NAMESPACE = 'storyforge';
const DATABASE = 'main';

let dbPromise: Promise<Surreal> | null = null;

export function getDb(): Promise<Surreal> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      const db = new Surreal({ engines: createWasmEngines() });
      await db.connect('indxdb://storyforge', {
        namespace: NAMESPACE,
        database: DATABASE,
      });
      await runMigrations(db);
      return db;
    } catch (err) {
      logDbError('connection.boot', err);
      throw err;
    }
  })();
  return dbPromise;
}

export function __resetDbForTests(): void {
  dbPromise = null;
}
