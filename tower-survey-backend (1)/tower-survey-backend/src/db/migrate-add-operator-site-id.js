// Migration : ajoute operator_site_id à la table sites
// Usage : node src/db/migrate-add-operator-site-id.js
// Idempotent : ne fait rien si la colonne existe déjà

require("dotenv").config();
const pool = require("../config/db");

(async () => {
  try {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'sites' AND column_name = 'operator_site_id'`
    );

    if (rows.length > 0) {
      console.log("ℹ️  Colonne operator_site_id déjà présente — migration ignorée.");
      await pool.end();
      return;
    }

    await pool.query(
      `ALTER TABLE sites ADD COLUMN operator_site_id VARCHAR(50)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_sites_operator ON sites(operator_site_id)`
    );
    console.log("✅ Colonne operator_site_id ajoutée à la table sites.");
    await pool.end();
  } catch (err) {
    console.error("❌ Erreur migration:", err);
    process.exit(1);
  }
})();
