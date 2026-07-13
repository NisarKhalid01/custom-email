-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingData" (
    "id" TEXT NOT NULL,
    "company" TEXT,
    "street" TEXT,
    "apt" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "loading_dock" TEXT,
    "liftgate" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "cartons" TEXT,
    "comments" TEXT,
    "variant_id" TEXT,
    "emailStatus" TEXT,

    CONSTRAINT "ShippingData_pkey" PRIMARY KEY ("id")
);

