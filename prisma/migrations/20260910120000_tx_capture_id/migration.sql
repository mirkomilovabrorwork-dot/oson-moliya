-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "captureId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_captureId_key" ON "Transaction"("captureId");
