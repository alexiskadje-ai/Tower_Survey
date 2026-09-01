/**
 * Applique la migration 006_role_users.sql.
 * Usage : node src/db/migrations/apply-006.js
 */
const fs = require("fs");
const path = require("path");
const pool = require("../../config/db");

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "006_role_users.sql"), "utf-8");
  console.log("[MIGRATE 006] Application ...");
  try {
    await pool.query(sql);
    console.log("[MIGRATE 006] ✅ OK");
  } catch (err) {
    console.error("[MIGRATE 006] ❌", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
main();
