"use strict";

/** Import — one `POST /imports` call: the batch envelope that owns its items and records. */

const { DataTypes } = require("sequelize");
const { baseColumns, addCheckConstraint } = require("../config/migration-columns");

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  async up(queryInterface) {
    // =============================== TABLE SCHEMA ===============================
    await queryInterface.createTable(
      "Import",
      {
        ...baseColumns(),
        idempotencyKey: {
          type: DataTypes.STRING(255),
          allowNull: true,
          comment:
            "Client-supplied `Idempotency-Key`, kept for the life of the import (no expiry); null when none was sent.",
        },
        requestHash: {
          type: DataTypes.STRING(64),
          allowNull: true,
          comment: "SHA-256 hex of the raw records array as canonical JSON; a replay with a different body is refused.",
        },
        totalItems: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "How many items the request carried, valid or not.",
        },
      },
      { comment: "One import request: a batch of raw records submitted together." },
    );
    await addCheckConstraint(queryInterface, "Import", "import_total_items_check", '"totalItems" >= 1');

    // =============================== INDEXES ===============================
    // Serves: invariant — forbids two imports sharing an idempotency key (nulls are exempt)
    // Serves: src/infrastructure/repositories/import/import.repository.ts#findByIdempotencyKey
    // Serves: src/infrastructure/repositories/import/import.repository.ts#createImport
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "import_idempotency_key_uniq" ON "Import" ("idempotencyKey");`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Import");
  },
};
