-- CreateTable
CREATE TABLE "LoginToken" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verifierHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "userId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginToken_code_key" ON "LoginToken"("code");

-- CreateIndex
CREATE INDEX "LoginToken_expiresAt_idx" ON "LoginToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "LoginToken" ADD CONSTRAINT "LoginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
