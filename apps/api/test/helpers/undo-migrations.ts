import { DataSource } from 'typeorm';

/**
 * Roll back migrations one at a time until the named migration is no longer
 * applied. Replaces fixed-count `undoLastMigration()` chains in specs, which
 * silently stop reaching their target every time a new migration is added.
 */
export async function undoMigrationsThrough(ds: DataSource, name: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const rows = await ds.query(`SELECT 1 FROM migrations WHERE name = $1`, [name]);
    if (rows.length === 0) return;
    await ds.undoLastMigration();
  }
  throw new Error(`undoMigrationsThrough: ${name} still applied after 100 rollbacks`);
}
