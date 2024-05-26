-- CreateTable
CREATE TABLE "ReserveToken" (
    "uuid" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "numberOfTokens" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "ReserveToken_uuid_key" ON "ReserveToken"("uuid");

-- AddForeignKey
ALTER TABLE "ReserveToken" ADD CONSTRAINT "ReserveToken_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tbl_beneficiaries_groups"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
