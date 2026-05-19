import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewColumnsToSubmissions1779205280380 implements MigrationInterface {
  name = 'AddReviewColumnsToSubmissions1779205280380';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD "rejection_reason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD "reviewed_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN "reviewed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN "rejection_reason"`,
    );
  }
}
