import type { Surreal } from 'surrealdb';
import { logDbError } from './errors';

const SCHEMA_VERSION = 1;

const SCHEMA_V1 = `
DEFINE TABLE document SCHEMAFULL;
DEFINE FIELD id         ON document TYPE string;
DEFINE FIELD title      ON document TYPE string;
DEFINE FIELD author     ON document TYPE string;
DEFINE FIELD synopsis   ON document TYPE string;
DEFINE FIELD settings   ON document TYPE object;
DEFINE FIELD created_at ON document TYPE datetime;
DEFINE FIELD updated_at ON document TYPE datetime;

DEFINE TABLE chapter SCHEMAFULL;
DEFINE FIELD id          ON chapter TYPE string;
DEFINE FIELD document_id ON chapter TYPE string;
DEFINE FIELD title       ON chapter TYPE string;
DEFINE FIELD order_idx   ON chapter TYPE int;
DEFINE FIELD created_at  ON chapter TYPE datetime;
DEFINE FIELD updated_at  ON chapter TYPE datetime;
DEFINE INDEX chapter_doc ON chapter FIELDS document_id;

DEFINE TABLE block SCHEMAFULL;
DEFINE FIELD id           ON block TYPE string;
DEFINE FIELD document_id  ON block TYPE string;
DEFINE FIELD chapter_id   ON block TYPE string;
DEFINE FIELD type         ON block TYPE string;
DEFINE FIELD content      ON block TYPE string;
DEFINE FIELD order_idx    ON block TYPE int;
DEFINE FIELD metadata     ON block TYPE object;
DEFINE FIELD deleted_at   ON block TYPE option<datetime>;
DEFINE FIELD deleted_from ON block TYPE option<object>;
DEFINE FIELD created_at   ON block TYPE datetime;
DEFINE FIELD updated_at   ON block TYPE datetime;
DEFINE INDEX block_doc     ON block FIELDS document_id;
DEFINE INDEX block_chapter ON block FIELDS chapter_id;
DEFINE INDEX block_grave   ON block FIELDS deleted_at;

DEFINE TABLE meta SCHEMAFULL;
DEFINE FIELD key   ON meta TYPE string;
DEFINE FIELD value ON meta TYPE any;
`;

export async function runMigrations(db: Surreal): Promise<void> {
  try {
    const current = await currentVersion(db);
    if (current === SCHEMA_VERSION) return;
    if (current === 0) {
      await db.query(SCHEMA_V1);
      await db.query(
        'UPDATE meta:schema_version SET key = "schema_version", value = $v',
        { v: SCHEMA_VERSION },
      );
      return;
    }
    throw new Error(`Unknown schema version ${current}; expected ${SCHEMA_VERSION}`);
  } catch (err) {
    logDbError('migrations.run', err);
    throw err;
  }
}

async function currentVersion(db: Surreal): Promise<number> {
  try {
    const result = await db.query<[Array<{ value: number }>]>(
      'SELECT value FROM meta:schema_version',
    );
    const rows = (result as unknown as Array<Array<{ value: number }>>)[0] ?? [];
    const first = rows[0];
    return first ? Number(first.value) : 0;
  } catch {
    return 0;
  }
}
