"use strict";

/** ImportItem — the per-item verdict of one import (accepted, invalid, duplicate), in request order. */

const { DataTypes } = require("sequelize");
const { baseColumns, addCheckConstraint } = require("../config/migration-columns");

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  async up(queryInterface) {
    // =============================== TABLE SCHEMA ===============================
    await queryInterface.createTable(
      "ImportItem",
      {
        ...baseColumns(),
        importId: {
          type: DataTypes.BIGINT,
          allowNull: false,
          references: { model: "Import", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
          comment: "The import this item belongs to; the item dies with it.",
        },
        itemIndex: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Zero-based position of the item in the request array.",
        },
        externalId: {
          type: DataTypes.STRING(255),
          allowNull: true,
          comment: "External id echoed from the request (cut to fit); null when the item had none.",
        },
        source: {
          type: DataTypes.STRING(100),
          allowNull: true,
          comment: "Source name echoed from the request (cut to fit); null when the item had none.",
        },
        outcome: {
          type: DataTypes.STRING(30),
          allowNull: false,
          comment: "What the import did with the item (ImportItemOutcomeEnum).",
        },
        errors: {
          type: DataTypes.JSONB,
          allowNull: true,
          comment: "List of {field, code, message} validation errors; set only for INVALID items.",
        },
        warnings: {
          type: DataTypes.JSONB,
          allowNull: true,
          comment: "List of non-blocking warnings, e.g. unknown fields ignored; null when none.",
        },
        duplicateOfIndex: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "For DUPLICATE_IN_BATCH: the itemIndex of the earlier item it repeats; otherwise null.",
        },
        hasContentChanged: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "For DUPLICATE_EXISTING: whether the content differs from the stored record; otherwise null.",
        },
        recordId: {
          type: DataTypes.BIGINT,
          allowNull: true,
          references: { model: "Record", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
          comment: "The record this item created or matched; null for INVALID and in-batch duplicates.",
        },
      },
      { comment: "The outcome of one item of an import request." },
    );
    // Values are identical to ImportItemOutcomeEnum in src/modules/import; keep both in step.
    await addCheckConstraint(
      queryInterface,
      "ImportItem",
      "import_item_outcome_check",
      `"outcome" IN ('ACCEPTED','INVALID','DUPLICATE_IN_BATCH','DUPLICATE_EXISTING')`,
    );

    // =============================== INDEXES ===============================
    // Serves: fk "importId"
    // Serves: invariant — forbids two items at the same position of one import
    // Serves: src/infrastructure/repositories/import/import.repository.ts#listItems
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "import_item_import_id_item_index_uniq" ON "ImportItem" ("importId", "itemIndex");`,
    );
    // Serves: src/infrastructure/repositories/import/import.repository.ts#listItems
    // Serves: src/infrastructure/repositories/import/import.repository.ts#counts
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "import_item_import_id_outcome_item_index_idx" ON "ImportItem" ("importId", "outcome", "itemIndex");`,
    );
    // Serves: fk "recordId"
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "import_item_record_id_idx" ON "ImportItem" ("recordId") WHERE "recordId" IS NOT NULL;`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ImportItem");
  },
};
