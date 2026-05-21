import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordSource1700000016000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE records ADD COLUMN record_source text`);

    // Backfill from raw payload. NULLIF strips Altegio's "" → NULL.
    await qr.query(`
      UPDATE records r
      SET record_source = NULLIF(raw.payload->>'record_from', '')
      FROM altegio_raw_records raw
      WHERE raw.tenant_id = r.tenant_id
        AND raw.altegio_record_id = r.altegio_record_id
        AND r.record_source IS NULL
    `);

    await qr.query(`
      CREATE INDEX idx_records_tenant_source_datetime
      ON records (tenant_id, record_source, datetime)
      WHERE record_source IS NOT NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP INDEX IF EXISTS idx_records_tenant_source_datetime');
    await qr.query('ALTER TABLE records DROP COLUMN IF EXISTS record_source');
  }
}
