const pool = require("../config/db");

/**
 * GET /api/sites?cluster=Nord&search=xxx&limit=20
 * Utilisé par le PWA pour mettre en cache la liste des sites (offline),
 * et par la barre de recherche du formulaire d'audit pour auto-remplir
 * les champs d'identification du site (IHS ID, Site Code, Region, Cluster, etc.).
 */
async function listSites(req, res, next) {
  try {
    const { cluster, search, limit } = req.query;
    const conditions = ["org_id = $1", "is_active = true"];
    const params = [req.user.orgId];
    const maxLimit = Math.min(parseInt(limit, 10) || 50, 200);

    if (cluster) {
      params.push(cluster);
      conditions.push(`cluster = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      // Cherche dans : IHS ID (site_code), Operator ID (operator_site_id), nom, ville/département
      conditions.push(`(
        site_code ILIKE $${params.length}
        OR operator_site_id ILIKE $${params.length}
        OR site_name ILIKE $${params.length}
        OR address_village ILIKE $${params.length}
        OR department ILIKE $${params.length}
        OR arrondissement ILIKE $${params.length}
      )`);
    }

    const { rows } = await pool.query(
      `SELECT id, site_code, operator_site_id, site_name, latitude, longitude,
              region, cluster, site_type, tower_owner, access_status,
              department, arrondissement, address_village
       FROM sites
       WHERE ${conditions.join(" AND ")}
       ORDER BY site_code ASC
       LIMIT ${maxLimit}`,
      params
    );

    res.json({ count: rows.length, sites: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/sites  (admin/supervisor)
 */
async function createSite(req, res, next) {
  try {
    const { site_code, site_name, latitude, longitude, region, cluster, site_type, tower_owner, commissioning_date } = req.body;

    if (!site_code || !site_name) {
      return res.status(400).json({ error: "site_code et site_name sont requis" });
    }

    const { rows } = await pool.query(
      `INSERT INTO sites (org_id, site_code, site_name, latitude, longitude, region, cluster, site_type, tower_owner, commissioning_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [req.user.orgId, site_code, site_name, latitude, longitude, region, cluster, site_type, tower_owner, commissioning_date || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { listSites, createSite };
