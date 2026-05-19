import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEnrollmentsTable1779176031970 implements MigrationInterface {
  name = 'CreateEnrollmentsTable1779176031970';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."enrollment_status" AS ENUM('in_progress', 'submitted', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "enrollments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "challenge_id" uuid NOT NULL, "user_id" uuid NOT NULL, "status" "public"."enrollment_status" NOT NULL DEFAULT 'in_progress', "enrolled_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_enrollments_challenge_user" UNIQUE ("challenge_id", "user_id"), CONSTRAINT "PK_7c0f752f9fb68bf6ed7367ab00f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_enrollments_challenge" ON "enrollments" ("challenge_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_enrollments_user_enrolled" ON "enrollments" ("user_id", "enrolled_at" DESC)`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollments" ADD CONSTRAINT "FK_4bc8309c1c4e206f24f288b25db" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollments" ADD CONSTRAINT "FK_ff997f5a39cd24a491b9aca45c9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "enrollments" DROP CONSTRAINT "FK_ff997f5a39cd24a491b9aca45c9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollments" DROP CONSTRAINT "FK_4bc8309c1c4e206f24f288b25db"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_enrollments_user_enrolled"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_enrollments_challenge"`);
    await queryRunner.query(`DROP TABLE "enrollments"`);
    await queryRunner.query(`DROP TYPE "public"."enrollment_status"`);
  }
}
