"use strict";

/**
 * Category — the closed list of topics a record can be classified into. Rows are reference
 * data seeded in-process at boot (`seeding/category`), never inserted by a migration.
 */

const { DataTypes } = require("sequelize");
const { baseColumns } = require("../config/migration-columns");

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  async up(queryInterface) {
    // =============================== TABLE SCHEMA ===============================
    await queryInterface.createTable(
      "Category",
      {
        ...baseColumns(),
        code: {
          type: DataTypes.STRING(50),
          allowNull: false,
          comment: "Stable lowercase slug other tables reference (`economy`, `health`, …); never renamed.",
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
          comment: "Human-readable label shown to reviewers.",
        },
      },
      { comment: "One topic a record can be classified into." },
    );

    // =============================== INDEXES ===============================
    // Serves: fk "currentCategoryCode"
    // Serves: fk "categoryCode"
    // Serves: invariant — forbids two categories sharing a code
    // Serves: src/infrastructure/repositories/category/category.repository.ts#findAll
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "category_code_uniq" ON "Category" ("code");`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Category");
  },
};
