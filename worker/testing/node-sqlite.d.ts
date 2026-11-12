// The slice of Node's built-in SQLite module the tests use. Declared here so
// the Worker's type-check doesn't need all of @types/node.
declare module "node:sqlite" {
  export type SQLValue = null | number | bigint | string | Uint8Array;

  export interface StatementSync {
    all(...params: SQLValue[]): Record<string, SQLValue>[];
    get(...params: SQLValue[]): Record<string, SQLValue> | undefined;
    run(...params: SQLValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
