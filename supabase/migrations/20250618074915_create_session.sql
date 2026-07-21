-- Shopify app session storage (used by @shopify/shopify-app-session-storage-prisma).
--
-- Converted from the original Prisma migration
-- (prisma/migrations/20250618074915_add_session_table/migration.sql) so that
-- ALL tables live in Supabase. Column names/types are kept EXACTLY as Prisma
-- expects them (quoted PascalCase identifiers, TIMESTAMP(3), BIGINT) — the
-- PrismaClient maps model `Session` to this table, so any drift breaks auth.
--
-- The old `ShippingData` table from that Prisma migration is intentionally NOT
-- recreated: it has been superseded by `form_submissions`.
--
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

CREATE TABLE IF NOT EXISTS "Session" (
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

-- Prisma connects as the Supabase `postgres` role, which bypasses RLS, so
-- enabling RLS with no public policies keeps the anon key locked out without
-- affecting the app.
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
