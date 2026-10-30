"use strict";

/**
 * The dual-ID + timestamp columns every `create-<table>-table.js` migration carries:
 * `id` / `publicId` / `createdAt` / `updatedAt` / `deletedAt`, identical to the TypeScript
 * `SqlBaseModel`. One definition is easier to keep identical than one copy per migration.
 *
 * Unlike an app-generated-id setup, this service inserts rows with raw SQL, so the database
 * fills `publicId` (`gen_random_uuid()`, a v4 UUID) and both timestamps (`now()`) by default.
 */

const { DataTypes, Sequelize } = require("sequelize");

/**
 * @returns {Record<string, object>} The five base columns, ready to spread into a
 *   `createTable` definition ahead of the table's own columns.
 */
function baseColumns() {
  return {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
      comment: "Internal primary key; never leaves the server.",
    },
    publicId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      comment: "External identifier (UUID) — the only id that appears in API responses and URLs.",
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("now()"),
      comment: "When the row was inserted.",
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("now()"),
      comment: "When the row was last written.",
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the row was soft-deleted; null while live.",
    },
  };
}

/**
 * Adds a CHECK constraint only when no constraint of that name exists yet, so a re-run is a
 * no-op (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`).
 *
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {string} table Unquoted table name.
 * @param {string} name Constraint name, `<table_snake>_<rule>_check`.
 * @param {string} expression The boolean SQL expression the row must satisfy.
 */
async function addCheckConstraint(queryInterface, table, name, expression) {
  await queryInterface.sequelize.query(
    `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = '${name}' AND conrelid = '"${table}"'::regclass
      ) THEN
        ALTER TABLE "${table}" ADD CONSTRAINT ${name} CHECK (${expression});
      END IF;
    END $$;`,
  );
}

module.exports = { baseColumns, addCheckConstraint };
