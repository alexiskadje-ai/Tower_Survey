/**
 * Applique la migration 005_checkin.sql contre la base DATABASE_URL.
 * Usage : node src/db/migrations/apply-005.js
 *
 * Idempotent : toutes les CREATE TABLE / INDEX / ALTER utilisent
 * IF NOT EXISTS, donc le script peut être relancé sans dommage.
 */
const fs = require("fs");
const path = require("path");
const pool = require("../../config/db");

async function main() {
  const sqlPath = path.join(__dirname, "005_checkin.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");
  console.log("[MIGRATE 005] Application de 005_checkin.sql ...");
  try {
    await pool.query(sql);
    console.log("[MIGRATE 005] ✅ Migration appliquée avec succès.");
  } catch (err) {
    console.error("[MIGRATE 005] ❌ Erreur:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
