-- CreateTable
CREATE TABLE "tbl_otp" (
    "id" SERIAL NOT NULL,
    "phoneNumber" TEXT,
    "email" TEXT,
    "walletAddress" TEXT,
    "otp" TEXT,
    "otpHash" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_otp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_otp_phoneNumber_key" ON "tbl_otp"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_otp_email_key" ON "tbl_otp"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_otp_walletAddress_key" ON "tbl_otp"("walletAddress");

