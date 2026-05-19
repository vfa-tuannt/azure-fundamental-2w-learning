import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubmissionsTable1779182670009 implements MigrationInterface {
  name = 'CreateSubmissionsTable1779182670009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "enrollment_id" uuid NOT NULL, "blob_url" text, "external_url" text, "notes" text NOT NULL DEFAULT '', "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_10b3be95b8b2fb1e482e07d706b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "CHK_submissions_url_xor" CHECK ((blob_url IS NULL) <> (external_url IS NULL))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_submissions_enrollment_submitted" ON "submissions" ("enrollment_id", "submitted_at" DESC)`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "FK_5945f4f3d5e6a7fedd6680cc931" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "FK_5945f4f3d5e6a7fedd6680cc931"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_submissions_enrollment_submitted"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "CHK_submissions_url_xor"`,
    );
    await queryRunner.query(`DROP TABLE "submissions"`);
  }
}
