import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChallengesTable1779159786049 implements MigrationInterface {
  name = 'CreateChallengesTable1779159786049';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."challenge_status" AS ENUM('open', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "challenges" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL, "required_skills" text array NOT NULL DEFAULT '{}', "deadline" TIMESTAMP WITH TIME ZONE NOT NULL, "max_enrollments" integer, "status" "public"."challenge_status" NOT NULL DEFAULT 'open', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_1e664e93171e20fe4d6125466af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_challenges_status_deleted_created" ON "challenges" ("status", "deleted_at", "created_at" DESC) `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_challenges_required_skills_gin" ON "challenges" USING GIN ("required_skills")`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenges" ADD CONSTRAINT "FK_bf4c4bfd3285fb38655adc5c99c" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "challenges" DROP CONSTRAINT "FK_bf4c4bfd3285fb38655adc5c99c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_challenges_required_skills_gin"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_challenges_status_deleted_created"`,
    );
    await queryRunner.query(`DROP TABLE "challenges"`);
    await queryRunner.query(`DROP TYPE "public"."challenge_status"`);
  }
}
