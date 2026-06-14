-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "originalAmount" BIGINT,
ADD COLUMN     "originalCurrency" TEXT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "displayCurrency" SET DEFAULT 'ORIGINAL';
