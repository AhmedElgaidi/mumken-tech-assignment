"use strict";

/**
 * Record — one external item to classify, plus its work state (status, lease, attempts).
 * The `currentClassificationId` composite foreign key is added by the later
 * `add-record-current-classification-constraint` migration, because Classification does not exist yet.
 */

const { DataTypes } = require("sequelize");
const { baseColumns, addCheckConstraint } = require("../config/migration-columns");

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  async up(queryInterface) {
    // =============================== TABLE SCHEMA ===============================
    await queryInterface.createTable(
      "Record",
      {
        ...baseColumns(),
        source: {
          type: DataTypes.STRING(100),
          allowNull: false,
          comment: "Name of the system the record came from, as supplied (trimmed); kept for display.",
        },
        sourceKey: {
          type: DataTypes.STRING(100),
          allowNull: false,
          comment: "lower(trim(source)); with externalId it is the record identity.",
        },
        externalId: {
          type: DataTypes.STRING(255),
          allowNull: false,
          comment: "The source system's own id for the record (trimmed, case preserved).",
        },
        title: {
          type: DataTypes.STRING(500),
          allowNull: false,
          comment: "Headline of the record, as supplied.",
        },
        description: {
          type: DataTypes.STRING(5000),
          allowNull: false,
          comment: "Body text of the record, as supplied.",
        },
        recordDate: {
          type: DataTypes.DATE,
          allowNull: false,
          comment: "Publication or effective date of the record (ISO 8601 UTC).",
        },
        contentHash: {
          type: DataTypes.STRING(64),
          allowNull: false,
          comment: "SHA-256 hex of {title, description, date}; a re-import with another hash is reported as changed.",
        },
        classificationStatus: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: "PENDING",
          comment: "Where the record is in the classification state machine (RecordStatusEnum).",
        },
        failureKind: {
          type: DataTypes.STRING(30),
          allowNull: true,
          comment: "Why the record is FAILED (FailureKindEnum); null for every other status.",
        },
        currentClassificationId: {
          type: DataTypes.BIGINT,
          allowNull: true,
          comment: "The Classification row that is the record's current result; null until one exists.",
        },
        currentCategoryCode: {
          type: DataTypes.STRING(50),
          allowNull: true,
          references: { model: "Category", key: "code" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
          comment:
            "Copy of the current classification's category, kept here so lists filter without a join; null until classified.",
        },
        retryGeneration: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: "Starts at 0 and grows by 1 on every retry request.",
        },
        attemptCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: "Classification attempts made in the current retry generation.",
        },
        leaseToken: {
          type: DataTypes.UUID,
          allowNull: true,
          comment: "Random token of the worker that holds the record; set exactly while PROCESSING.",
        },
        leaseExpiresAt: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: "When the current lease lapses and another worker may take the record over.",
        },
        lastError: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: "Message of the most recent failed attempt; cleared on success.",
        },
        finishedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: "When the record reached CLASSIFIED, NEEDS_REVIEW or FAILED; null while work is pending.",
        },
        createdByImportId: {
          type: DataTypes.BIGINT,
          allowNull: false,
          references: { model: "Import", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
          comment: "The import that first created this record.",
        },
      },
      { comment: "One external item to classify, with its classification work state." },
    );

    // CHECK values are identical to the TypeScript enums in src/modules/classification/lifecycle
    // (RecordStatusEnum, FailureKindEnum); keep both in step.
    await addCheckConstraint(
      queryInterface,
      "Record",
      "record_classification_status_check",
      `"classificationStatus" IN ('PENDING','PROCESSING','CLASSIFIED','NEEDS_REVIEW','FAILED')`,
    );
    await addCheckConstraint(
      queryInterface,
      "Record",
      "record_failure_kind_check",
      `"failureKind" IN ('TRANSIENT_EXHAUSTED','PERMANENT')`,
    );
    await addCheckConstraint(
      queryInterface,
      "Record",
      "record_failed_has_failure_kind_check",
      `("classificationStatus" = 'FAILED') = ("failureKind" IS NOT NULL)`,
    );
    await addCheckConstraint(
      queryInterface,
      "Record",
      "record_done_has_result_check",
      `"classificationStatus" NOT IN ('CLASSIFIED','NEEDS_REVIEW') OR "currentClassificationId" IS NOT NULL`,
    );
    await addCheckConstraint(
      queryInterface,
      "Record",
      "record_lease_token_check",
      `("classificationStatus" = 'PROCESSING') = ("leaseToken" IS NOT NULL)`,
    );

    // The sweeper finds stuck records by "updatedAt", so the database owns that column: no
    // writer can forget to bump it, and raw SQL updates need no extra assignment.
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION record_touch_updated_at() RETURNS trigger AS $$
      BEGIN
        NEW."updatedAt" := now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS record_touch_updated_at_trg ON "Record";`);
    await queryInterface.sequelize.query(`
      CREATE TRIGGER record_touch_updated_at_trg BEFORE UPDATE ON "Record"
        FOR EACH ROW EXECUTE FUNCTION record_touch_updated_at();
    `);

    // =============================== INDEXES ===============================
    // Serves: invariant — forbids two records with the same source and external id
    // Serves: src/infrastructure/repositories/import/import.repository.ts#insertRecords
    // Serves: src/infrastructure/repositories/import/import.repository.ts#findByKeys
    // Serves: src/infrastructure/repositories/record/record.repository.ts#list
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "record_source_key_external_id_uniq" ON "Record" ("sourceKey", "externalId");`,
    );
    // Serves: src/infrastructure/repositories/classification/record-lease.repository.ts#findStuck
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "record_classification_status_updated_at_id_idx" ON "Record" ("classificationStatus", "updatedAt", "id");`,
    );
    // Keyset cursor (recordDate, publicId): the public id is the tiebreaker clients see.
    // Serves: src/infrastructure/repositories/record/record.repository.ts#list
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "record_record_date_public_id_idx" ON "Record" ("recordDate" DESC, "publicId" DESC);`,
    );
    // Serves: fk "createdByImportId"
    // Serves: src/infrastructure/repositories/import/import.repository.ts#counts
    // Serves: src/infrastructure/repositories/record/recovery.repository.ts#requeue
    // Serves: src/infrastructure/repositories/record/recovery.repository.ts#remaining
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "record_created_by_import_id_classification_status_idx" ON "Record" ("createdByImportId", "classificationStatus");`,
    );
    // Serves: fk "currentCategoryCode"
    // Serves: src/infrastructure/repositories/record/record.repository.ts#list
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "record_current_category_code_idx" ON "Record" ("currentCategoryCode") WHERE "currentCategoryCode" IS NOT NULL;`,
    );
    // Serves: fk "currentClassificationId"
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "record_current_classification_id_idx" ON "Record" ("currentClassificationId") WHERE "currentClassificationId" IS NOT NULL;`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Record");
    await queryInterface.sequelize.query("DROP FUNCTION IF EXISTS record_touch_updated_at();");
  },
};
