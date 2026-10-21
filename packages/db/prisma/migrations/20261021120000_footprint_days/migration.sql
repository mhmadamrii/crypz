-- CreateTable
CREATE TABLE "footprint_day" (
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "step" DOUBLE PRECISION,
    "trades" INTEGER,
    "bars" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "footprint_day_pkey" PRIMARY KEY ("exchange","symbol","day")
);

