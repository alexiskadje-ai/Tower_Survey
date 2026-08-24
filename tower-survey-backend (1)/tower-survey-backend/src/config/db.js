const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway/production nécessite souvent SSL — décommente si besoin :
  // ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("[DB] Erreur inattendue sur le pool PostgreSQL:", err);
  process.exit(1);
});

module.exports = pool;
