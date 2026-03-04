-- CreateEnum
CREATE TYPE "InkindStockMovementType" AS ENUM ('ADD', 'REMOVE', 'LOCK', 'UNLOCK', 'REDEEM');

-- CreateTable
CREATE TABLE "tbl_inkinds" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "availableStock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_inkinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_inkind_stock_movements" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "inkindId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "type" "InkindStockMovementType" NOT NULL,
    "groupInkindId" TEXT,
    "redemptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_inkind_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_group_inkinds" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "inkindId" TEXT NOT NULL,
    "quantityAllocated" INTEGER NOT NULL,
    "quantityRedeemed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_group_inkinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_beneficiary_inkind_redemptions" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "beneficiaryWallet" TEXT NOT NULL,
    "groupInkindId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_beneficiary_inkind_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_inkinds_uuid_key" ON "tbl_inkinds"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_inkind_stock_movements_uuid_key" ON "tbl_inkind_stock_movements"("uuid");

-- CreateIndex
CREATE INDEX "tbl_inkind_stock_movements_inkindId_idx" ON "tbl_inkind_stock_movements"("inkindId");

-- CreateIndex
CREATE INDEX "tbl_inkind_stock_movements_inkindId_createdAt_idx" ON "tbl_inkind_stock_movements"("inkindId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "tbl_inkind_stock_movements_groupInkindId_idx" ON "tbl_inkind_stock_movements"("groupInkindId");

-- CreateIndex
CREATE INDEX "tbl_inkind_stock_movements_redemptionId_idx" ON "tbl_inkind_stock_movements"("redemptionId");

-- CreateIndex
CREATE INDEX "tbl_inkind_stock_movements_type_idx" ON "tbl_inkind_stock_movements"("type");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_inkind_stock_movements_redemptionId_key" ON "tbl_inkind_stock_movements"("redemptionId");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_group_inkinds_uuid_key" ON "tbl_group_inkinds"("uuid");

-- CreateIndex
CREATE INDEX "tbl_group_inkinds_groupId_idx" ON "tbl_group_inkinds"("groupId");

-- CreateIndex
CREATE INDEX "tbl_group_inkinds_inkindId_idx" ON "tbl_group_inkinds"("inkindId");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_group_inkinds_groupId_inkindId_key" ON "tbl_group_inkinds"("groupId", "inkindId");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_beneficiary_inkind_redemptions_uuid_key" ON "tbl_beneficiary_inkind_redemptions"("uuid");

-- CreateIndex
CREATE INDEX "tbl_beneficiary_inkind_redemptions_groupInkindId_idx" ON "tbl_beneficiary_inkind_redemptions"("groupInkindId");

-- CreateIndex
CREATE INDEX "tbl_beneficiary_inkind_redemptions_beneficiaryWallet_idx" ON "tbl_beneficiary_inkind_redemptions"("beneficiaryWallet");

-- CreateIndex
CREATE INDEX "tbl_beneficiary_inkind_redemptions_redeemedAt_idx" ON "tbl_beneficiary_inkind_redemptions"("redeemedAt" DESC);

-- AddForeignKey
ALTER TABLE "tbl_inkind_stock_movements" ADD CONSTRAINT "tbl_inkind_stock_movements_inkindId_fkey" FOREIGN KEY ("inkindId") REFERENCES "tbl_inkinds"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_inkind_stock_movements" ADD CONSTRAINT "tbl_inkind_stock_movements_groupInkindId_fkey" FOREIGN KEY ("groupInkindId") REFERENCES "tbl_group_inkinds"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_inkind_stock_movements" ADD CONSTRAINT "tbl_inkind_stock_movements_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "tbl_beneficiary_inkind_redemptions"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_group_inkinds" ADD CONSTRAINT "tbl_group_inkinds_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tbl_beneficiaries_groups"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_group_inkinds" ADD CONSTRAINT "tbl_group_inkinds_inkindId_fkey" FOREIGN KEY ("inkindId") REFERENCES "tbl_inkinds"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_inkind_redemptions" ADD CONSTRAINT "tbl_beneficiary_inkind_redemptions_beneficiaryWallet_fkey" FOREIGN KEY ("beneficiaryWallet") REFERENCES "tbl_beneficiaries"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_beneficiary_inkind_redemptions" ADD CONSTRAINT "tbl_beneficiary_inkind_redemptions_groupInkindId_fkey" FOREIGN KEY ("groupInkindId") REFERENCES "tbl_group_inkinds"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================
-- DROP EXISTING TRIGGERS
-- =============================

DROP TRIGGER IF EXISTS trg_check_stock_movement_quantity
ON tbl_inkind_stock_movements;

DROP TRIGGER IF EXISTS trg_prevent_negative_stock
ON tbl_inkind_stock_movements;

DROP TRIGGER IF EXISTS trg_update_available_stock
ON tbl_inkind_stock_movements;

DROP TRIGGER IF EXISTS trg_prevent_over_redeem
ON tbl_beneficiary_inkind_redemptions;

DROP TRIGGER IF EXISTS trg_update_group_redeemed
ON tbl_beneficiary_inkind_redemptions;


-- =============================
-- DROP EXISTING FUNCTIONS
-- =============================

DROP FUNCTION IF EXISTS fn_check_stock_movement_quantity();
DROP FUNCTION IF EXISTS fn_prevent_negative_stock();
DROP FUNCTION IF EXISTS fn_update_available_stock();
DROP FUNCTION IF EXISTS fn_prevent_over_redeem();
DROP FUNCTION IF EXISTS fn_update_group_redeemed();

-- =============================
-- FUNCTIONS
-- =============================

CREATE OR REPLACE FUNCTION fn_check_stock_movement_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Stock movement quantity must be greater than zero';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_check_stock_movement_quantity
BEFORE INSERT ON tbl_inkind_stock_movements
FOR EACH ROW
EXECUTE FUNCTION fn_check_stock_movement_quantity();


CREATE OR REPLACE FUNCTION fn_prevent_negative_stock()
RETURNS TRIGGER AS $$
DECLARE
  current_available INT;
BEGIN
  SELECT "availableStock"
  INTO current_available
  FROM tbl_inkinds
  WHERE uuid = NEW."inkindId"
  FOR UPDATE;

  IF current_available IS NULL THEN
    RAISE EXCEPTION 'Inkind not found';
  END IF;

  IF NEW.type IN ('LOCK', 'REMOVE') THEN
    IF current_available < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient available stock. Available: %, Required: %',
        current_available, NEW.quantity;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_prevent_negative_stock
BEFORE INSERT ON tbl_inkind_stock_movements
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_negative_stock();


CREATE OR REPLACE FUNCTION fn_update_available_stock()
RETURNS TRIGGER AS $$
BEGIN

  IF NEW.type = 'ADD' THEN
    UPDATE tbl_inkinds
    SET "availableStock" = "availableStock" + NEW.quantity
    WHERE uuid = NEW."inkindId";

  ELSIF NEW.type = 'REMOVE' THEN
    UPDATE tbl_inkinds
    SET "availableStock" = "availableStock" - NEW.quantity
    WHERE uuid = NEW."inkindId";

  ELSIF NEW.type = 'LOCK' THEN
    UPDATE tbl_inkinds
    SET "availableStock" = "availableStock" - NEW.quantity
    WHERE uuid = NEW."inkindId";

  ELSIF NEW.type = 'UNLOCK' THEN
    UPDATE tbl_inkinds
    SET "availableStock" = "availableStock" + NEW.quantity
    WHERE uuid = NEW."inkindId";

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_update_available_stock
AFTER INSERT ON tbl_inkind_stock_movements
FOR EACH ROW
EXECUTE FUNCTION fn_update_available_stock();


CREATE OR REPLACE FUNCTION fn_prevent_over_redeem()
RETURNS TRIGGER AS $$
DECLARE
  allocated INT;
  redeemed INT;
BEGIN
  SELECT "quantityAllocated", "quantityRedeemed"
  INTO allocated, redeemed
  FROM tbl_group_inkinds
  WHERE uuid = NEW."groupInkindId"
  FOR UPDATE;

  IF allocated IS NULL THEN
    RAISE EXCEPTION 'GroupInkind not found';
  END IF;

  IF redeemed + NEW.quantity > allocated THEN
    RAISE EXCEPTION
      'Cannot redeem more than allocated. Allocated: %, Already Redeemed: %, Requested: %',
      allocated, redeemed, NEW.quantity;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_prevent_over_redeem
BEFORE INSERT ON tbl_beneficiary_inkind_redemptions
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_over_redeem();


CREATE OR REPLACE FUNCTION fn_update_group_redeemed()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tbl_group_inkinds
  SET "quantityRedeemed" = "quantityRedeemed" + NEW.quantity
  WHERE uuid = NEW."groupInkindId";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_update_group_redeemed
AFTER INSERT ON tbl_beneficiary_inkind_redemptions
FOR EACH ROW
EXECUTE FUNCTION fn_update_group_redeemed();
