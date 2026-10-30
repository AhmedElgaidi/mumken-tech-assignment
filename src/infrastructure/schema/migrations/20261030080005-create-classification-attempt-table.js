"use strict";

/** ClassificationAttempt — one try by a worker to classify a record, successful or not. */

const { DataTypes } = require("sequelize");
const { baseColumns, addCheckConstraint } = require("../config/migration-columns");

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  async up(queryInterface) {
    // =============================== TABLE SCHEMA ===============================
    await queryInterface.createTable(
      "ClassificationAttempt",
      {
        ...baseColumns(),
        recordId: {
          type: DataTypes.BIGINT,
          allowNull: false,
          references: { model: "Record", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
          comment: "The record that was being classified.",
        },
        retryGeneration: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "The record's retry generation when the attempt ran.",
        },
        attemptNo: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Position of the attempt within its retry generation, starting at 1.",
        },
        outcome: {
          type: DataTypes.STRING(30),
          allowNull: false,
          comment: "How the attempt ended (AttemptOutcomeEnum).",
        },
        error: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: "Error message of a failed attempt, cut to 2000 characters; null on success.",
        },
        durationMs: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "How long the classifier call took, in milliseconds.",
        },
      },
      { comment: "One classification attempt made by a worker on a record." },
    );
    // Values are identical to AttemptOutcomeEnum in src/modules/classification/lifecycle; keep both in step.
    await addCheckConstraint(
      queryInterface,
      "ClassificationAttempt",
      "classification_attempt_outcome_check",
      `"outcome" IN ('SUCCEEDED','TRANSIENT_ERROR','PERMANENT_ERROR','UNKNOWN_ERROR')`,
    );

    // =============================== INDEXES ===============================
    // Serves: fk "recordId"
    // Serves: invariant — one row per record, retry generation and attempt number
    // Serves: src/infrastructure/repositories/classification/record-lease.repository.ts#insertAttempt
    // Serves: src/infrastructure/repositories/record/record.repository.ts#attemptsOf
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "classification_attempt_record_generation_no_uniq" ON "ClassificationAttempt" ("recordId", "retryGeneration", "attemptNo");`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ClassificationAttempt");
  },
};
