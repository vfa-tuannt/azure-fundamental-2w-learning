import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateActivityEventsTable1779239306744 implements MigrationInterface {
  name = 'CreateActivityEventsTable1779239306744';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."activity_event_type" AS ENUM('challenge_created', 'enrolled', 'submitted', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "activity_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "event_type" "public"."activity_event_type" NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_activity_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_activity_events_created_at" ON "activity_events" ("created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_activity_events_user_id_created_at" ON "activity_events" ("user_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_events" ADD CONSTRAINT "FK_activity_events_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_events" DROP CONSTRAINT "FK_activity_events_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_activity_events_user_id_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_activity_events_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "activity_events"`);
    await queryRunner.query(`DROP TYPE "public"."activity_event_type"`);
  }
}
