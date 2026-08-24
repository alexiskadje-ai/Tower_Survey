/**
 * Exécute schema.sql contre la base définie dans DATABASE_URL.
 * Usage : npm run db:init
 */
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

async function init() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");

  console.log("[DB INIT] Exécution de schema.sql ...");
  try {
    await pool.query(sql);
    console.log("[DB INIT] ✅ Schéma créé avec succès.");
  } catch (err) {
    console.error("[DB INIT] ❌ Erreur lors de la création du schéma:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

init();
