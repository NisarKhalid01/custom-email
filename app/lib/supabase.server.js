import postgres from "postgres";

// Server-only Postgres connection to Supabase for storefront form submissions.
//
// We connect via the raw connection string (Supabase didn't expose a REST
// URL/service_role key here), so this uses postgres.js — NOT @supabase/supabase-js.
// Import only from *.server.js modules / route loaders & actions.
//
// This hits the SAME Supabase database Prisma uses (DATABASE_URL) — Prisma owns
// the Session table, this client owns form_submissions. Set SUPABASE_DB_URL only
// if you ever want the form data on a different connection/DB than DATABASE_URL.
//
// Required env var (set in Vercel + local .env):
//   DATABASE_URL – Supabase "transaction pooler" connection string
//                  (…pooler.supabase.com:6543/postgres?pgbouncer=true),
//                  recommended for serverless.
export const FORM_SUBMISSIONS_TABLE = "form_submissions";

let _sql = null;

export function getSql() {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Database not configured: set DATABASE_URL (or SUPABASE_DB_URL) env var",
    );
  }
  if (!_sql) {
    _sql = postgres(url, {
      // pgbouncer transaction pooling can't use prepared statements.
      prepare: false,
      ssl: "require",
      // Keep the serverless connection footprint small.
      max: 1,
      idle_timeout: 20,
    });
  }
  return _sql;
}

// Columns that are real table columns; everything else in a submission lives in
// the `payload` jsonb blob.
const COLUMNS = [
  "form_type",
  "shop",
  "email",
  "phone",
  "company",
  "name",
  "product_url",
  "product_handle",
  "product_title",
  "media_url",
  "media_name",
  "email_status",
  "payload",
];

/**
 * Insert one form submission. `row` may contain any COLUMNS keys; `payload`
 * should be a plain object (stored as jsonb).
 */
export async function insertFormSubmission(row) {
  const sql = getSql();
  const record = {};
  for (const col of COLUMNS) {
    if (row[col] !== undefined) {
      record[col] = col === "payload" ? sql.json(row[col] ?? {}) : row[col];
    }
  }
  const [inserted] = await sql`
    insert into ${sql(FORM_SUBMISSIONS_TABLE)} ${sql(record)}
    returning id
  `;
  return inserted;
}

/**
 * List a store's submissions, newest first. Always scoped to a shop so one
 * store's admin never sees another store's data.
 */
export async function listFormSubmissions(shop) {
  if (!shop) return [];
  const sql = getSql();
  return sql`
    select * from ${sql(FORM_SUBMISSIONS_TABLE)}
    where shop = ${shop}
    order by created_at desc
  `;
}

/**
 * Fetch a single submission by id, scoped to the shop (so a store can't open
 * another store's submission by guessing an id). Returns null if not found.
 */
export async function getFormSubmission(id, shop) {
  if (!shop) return null;
  const sql = getSql();
  const [row] = await sql`
    select * from ${sql(FORM_SUBMISSIONS_TABLE)}
    where id = ${id} and shop = ${shop}
    limit 1
  `;
  return row ?? null;
}
