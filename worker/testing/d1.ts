/**
 * A D1 database for tests, over Node's built-in SQLite: the same engine D1
 * runs, so the SQL behaves the same. Only the parts of the D1 API the Worker
 * uses are here. Migrations are applied the way `wrangler d1 migrations
 * apply` does, including its d1_migrations table.
 */
// D1's API is generic over row types it never checks (`first<T>()`), and so is
// this copy of it: the casts below are the same promise the real binding makes.
/* oxlint-disable typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-parameters */
import { DatabaseSync, type SQLValue } from "node:sqlite";

const MIGRATIONS = import.meta.glob<string>("../../migrations/*.sql", { query: "?raw", import: "default", eager: true });

type Bindable = string | number | null;

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    readonly params: readonly Bindable[] = [],
  ) {}

  bind(...params: Bindable[]): Statement {
    return new Statement(this.db, this.sql, params);
  }

  first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params);
    if (!row) return Promise.resolve(null);
    return Promise.resolve((column === undefined ? row : row[column]) as T);
  }

  all<T>(): Promise<{ results: T[]; success: true }> {
    return Promise.resolve({ results: this.db.prepare(this.sql).all(...this.params) as T[], success: true });
  }

  run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    return Promise.resolve(this.runSync());
  }

  runSync() {
    const { changes, lastInsertRowid } = this.db.prepare(this.sql).run(...this.params);
    return { success: true as const, meta: { changes: Number(changes), last_row_id: Number(lastInsertRowid) } };
  }
}

export interface TestD1 {
  /** Typed as the real binding, so it drops into `Env`. */
  binding: D1Database;
  /** Direct access for assertions. */
  query(sql: string, ...params: SQLValue[]): Record<string, SQLValue>[];
  close(): void;
}

/** A fresh in-memory database, with every migration applied unless `migrate` is false. */
export function testD1({ migrate = true } = {}): TestD1 {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON"); // D1 always enforces foreign keys
  if (migrate) {
    db.exec(
      "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
    );
    for (const [path, sql] of Object.entries(MIGRATIONS).toSorted(([a], [b]) => a.localeCompare(b))) {
      db.exec(sql);
      db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(path.split("/").at(-1) ?? path);
    }
  }

  const binding = {
    prepare: (sql: string) => new Statement(db, sql),
    // D1 runs a batch as one transaction.
    batch(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        const results = statements.map((s) => s.runSync());
        db.exec("COMMIT");
        return Promise.resolve(results);
      } catch (error) {
        db.exec("ROLLBACK");
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };

  return {
    binding: binding as unknown as D1Database,
    query: (sql, ...params) => db.prepare(sql).all(...params),
    close: () => db.close(),
  };
}
