"use strict";

/**
 * Classification — one result for a record. Append-only: a correction or an approval is a new
 * row that points at the row it supersedes. A row-level trigger blocks UPDATE and DELETE, so
 * the rule holds even for code that forgets it. TRUNCATE (used by tests) is not a row event
 * and still works.
 */

const { DataTypes } = require("sequelize");
const { baseColumns, addCheckConstraint } = require("../config/migration-columns");

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  async up(queryInterface) {
    // =============================== TABLE SCHEMA ===============================
    await queryInterface.createTable(
      "Classification",
      {
        ...baseColumns(),
        recordId: {
          type: DataTypes.BIGINT,
          allowNull: false,
          references: { model: "Record", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
          comment: "The record this result is about.",
        },
        kind: {
          type: DataTypes.STRING(30),
          allowNull: false,
          comment: "How the result was produced (ClassificationKindEnum).",
        },
        categoryCode: {
          type: DataTypes.STRING(50),
          allowNull: false,
          references: { model: "Category", key: "code" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
          comment: "The category the result assigns.",
        },
        confidence: {
          type: DataTypes.DECIMAL(4, 3),
          allowNull: true,
          comment: "Classifier confidence from 0 to 1; set for AUTOMATIC results, null for manual ones.",
        },
        isReviewNeeded: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          comment: "Whether a human must look at the result before it is trusted.",
        },
        classifier: {
          type: DataTypes.STRING(100),
          allowNull: true,
          comment: "Name and version of the classifier that produced an AUTOMATIC result.",
        },
        rawOutput: {
          type: DataTypes.JSONB,
          allowNull: true,
          comment: "The classifier response as received, kept for audit.",
        },
        reason: {
          type: DataTypes.STRING(500),
          allowNull: true,
          comment: "Why a reviewer changed the category; required for MANUAL_CORRECTION.",
        },
        reviewedBy: {
          type: DataTypes.STRING(100),
          allowNull: true,
          comment: "Name of the reviewer for manual results; null for AUTOMATIC ones.",
        },
        supersedesId: {
          type: DataTypes.BIGINT,
          allowNull: true,
          references: { model: "Classification", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
          comment: "The earlier classification this one replaces; null for the first result.",
        },
      },
      { comment: "One append-only classification result for a record." },
    );

    // CHECK values are identical to ClassificationKindEnum in src/modules/classification/lifecycle.
    await addCheckConstraint(
      queryInterface,
      "Classification",
      "classification_kind_check",
      `"kind" IN ('AUTOMATIC','MANUAL_CORRECTION','MANUAL_APPROVAL')`,
    );
    await addCheckConstraint(
      queryInterface,
      "Classification",
      "classification_confidence_check",
      `"confidence" BETWEEN 0 AND 1`,
    );
    await addCheckConstraint(
      queryInterface,
      "Classification",
      "classification_automatic_confidence_check",
      `"kind" <> 'AUTOMATIC' OR "confidence" IS NOT NULL`,
    );
    await addCheckConstraint(
      queryInterface,
      "Classification",
      "classification_manual_correction_reason_check",
      `"kind" <> 'MANUAL_CORRECTION' OR "reason" IS NOT NULL`,
    );

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION classification_block_changes() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'classifications are append-only (% blocked)', TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS classification_append_only_trg ON "Classification";`);
    await queryInterface.sequelize.query(`
      CREATE TRIGGER classification_append_only_trg BEFORE UPDATE OR DELETE ON "Classification"
        FOR EACH ROW EXECUTE FUNCTION classification_block_changes();
    `);

    // =============================== INDEXES ===============================
    // Target of the composite foreign key that keeps a record pointing at its own classification.
    // Serves: fk "currentClassificationId"
    // Serves: invariant — a classification id is only ever paired with its own record
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "classification_id_record_id_uniq" ON "Classification" ("id", "recordId");`,
    );
    // Serves: fk "recordId"
    // Serves: src/infrastructure/repositories/record/record.repository.ts#history
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "classification_record_id_created_at_idx" ON "Classification" ("recordId", "createdAt");`,
    );
    // Serves: invariant — at most one automatic result per record, even if two workers race
    // Serves: src/infrastructure/repositories/classification/record-lease.repository.ts#saveSuccess
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "classification_record_id_automatic_uniq" ON "Classification" ("recordId") WHERE "kind" = 'AUTOMATIC';`,
    );
    // Serves: fk "categoryCode"
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "classification_category_code_idx" ON "Classification" ("categoryCode");`,
    );
    // Serves: fk "supersedesId"
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "classification_supersedes_id_idx" ON "Classification" ("supersedesId") WHERE "supersedesId" IS NOT NULL;`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Classification");
    await queryInterface.sequelize.query("DROP FUNCTION IF EXISTS classification_block_changes();");
  },
};
