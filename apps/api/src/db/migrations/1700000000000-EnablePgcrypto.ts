import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePgcrypto1700000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP EXTENSION IF EXISTS pgcrypto');
  }
}
