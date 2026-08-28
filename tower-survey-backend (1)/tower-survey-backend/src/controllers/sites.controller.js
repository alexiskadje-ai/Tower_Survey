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

/**
 * GET /api/sites/completion-status?cluster=xxx
 * Auth requis. Retourne pour chaque site de l'org :
 *   { site_id, site_code, site_name, cluster, has_site_infrastructure, has_power_audit, is_complete }
 *
 * has_* = true si au moins une réponse 'submitted' existe pour ce site via
 * un template de la catégorie correspondante.
 */
async function getCompletionStatus(req, res, next) {
  try {
    const { cluster } = req.query;
    const params = [req.user.orgId];
    let clusterFilter = "";
    if (cluster) {
      params.push(cluster);
      clusterFilter = `AND s.cluster = $${params.length}`;
    }

    // LEFT JOIN agrégé : on ramène pour chaque site la liste des catégories
    // distinctes pour lesquelles une réponse 'submitted' existe.
    const { rows } = await pool.query(
      `SELECT
         s.id            AS site_id,
         s.site_code     AS site_code,
         s.site_name     AS site_name,
         s.cluster       AS cluster,
         COALESCE(
           array_agg(DISTINCT t.category) FILTER (WHERE r.id IS NOT NULL AND r.status = 'submitted'),
           ARRAY[]::varchar[]
         ) AS submitted_categories
       FROM sites s
       LEFT JOIN survey_responses r
         ON r.site_id = s.id AND r.status = 'submitted'
       LEFT JOIN survey_templates t
         ON t.id = r.template_id
       WHERE s.org_id = $1 AND s.is_active = true ${clusterFilter}
       GROUP BY s.id, s.site_code, s.site_name, s.cluster
       ORDER BY s.site_code ASC`,
      params
    );

    const result = rows.map((row) => {
      const cats = row.submitted_categories || [];
      const has_power_audit = cats.includes("Power Audit");
      const has_site_infrastructure = cats.includes("Site Infrastructure");
      return {
        site_id: row.site_id,
        site_code: row.site_code,
        site_name: row.site_name,
        cluster: row.cluster,
        has_site_infrastructure,
        has_power_audit,
        is_complete: has_power_audit && has_site_infrastructure,
      };
    });

    res.json({ count: result.length, sites: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { listSites, createSite, getCompletionStatus };
