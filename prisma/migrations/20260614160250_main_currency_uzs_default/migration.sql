-- AlterTable
ALTER TABLE "User" ALTER COLUMN "displayCurrency" SET DEFAULT 'UZS';

-- DataMigration: any legacy 'ORIGINAL' rows become 'UZS'
UPDATE "User" SET "displayCurrency" = 'UZS' WHERE "displayCurrency" = 'ORIGINAL';
