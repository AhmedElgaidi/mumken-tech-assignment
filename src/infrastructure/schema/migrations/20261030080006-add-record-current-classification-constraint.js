"use strict";

/**
 * Closes the Record <-> Classification cycle: a record's current classification must belong to
 * that same record. Added after both tables exist because each references the other.
 */

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'record_current_classification_fk' AND conrelid = '"Record"'::regclass
        ) THEN
          ALTER TABLE "Record"
            ADD CONSTRAINT record_current_classification_fk
            FOREIGN KEY ("currentClassificationId", "id")
            REFERENCES "Classification" ("id", "recordId");
        END IF;
      END $$;`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE "Record" DROP CONSTRAINT IF EXISTS "record_current_classification_fk";',
    );
  },
};
