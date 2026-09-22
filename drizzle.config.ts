import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // The audit schema is created and maintained by hand in drizzle/0001_audit.sql;
  // keep drizzle-kit's diffing away from it.
  schemaFilter: ["app"],
  verbose: true,
  strict: true,
});
