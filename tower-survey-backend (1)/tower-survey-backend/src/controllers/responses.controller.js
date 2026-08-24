const pool = require("../config/db");

/**
 * POST /api/responses/sync
 * Endpoint CRITIQUE pour le PWA offline-first.
 *
 * body: { responses: [ {
 *   client_uuid,          // UUID généré côté device AVANT la sync
 *   template_id, site_id,
 *   started_at, submitted_at,
 *   gps_latitude, gps_longitude, gps_accuracy_m,
 *   device_id,
 *   answers: [{ question_id, value_text, value_number, value_boolean, value_json }]
 * }, ... ] }
 *
 * Idempotence : chaque item est upsert sur client_uuid (contrainte UNIQUE).
 * Un même audit renvoyé plusieurs fois (retry réseau) ne crée jamais de doublon.
 * Traité en transaction PAR réponse : si une réponse du batch échoue,
 * les autres sont quand même sauvegardées (retour granulaire des erreurs).
 */
async function syncResponses(req, res, next) {
  const { responses } = req.body;

  if (!Array.isArray(responses) || responses.length === 0) {
    return res.status(400).json({ error: "Le champ 'responses' doit être un tableau non vide" });
  }

  const results = [];

  for (const item of responses) {
    const client = await pool.connect();
    try {
      const {
        client_uuid, template_id, site_id,
        started_at, submitted_at,
        gps_latitude, gps_longitude, gps_accuracy_m,
        device_id, answers = [],
      } = item;

      if (!client_uuid || !template_id || !site_id) {
        results.push({ client_uuid: client_uuid || null, status: "error", error: "client_uuid, template_id et site_id sont requis" });
        continue;
      }

      await client.query("BEGIN");

      // Upsert de la réponse — idempotent sur client_uuid
      const { rows } = await client.query(
        `INSERT INTO survey_responses
           (client_uuid, template_id, site_id, technician_id, device_id,
            started_at, submitted_at, status, gps_latitude, gps_longitude, gps_accuracy_m)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted',$8,$9,$10)
         ON CONFLICT (client_uuid)
         DO UPDATE SET
           submitted_at = EXCLUDED.submitted_at,
           gps_latitude = EXCLUDED.gps_latitude,
           gps_longitude = EXCLUDED.gps_longitude,
           gps_accuracy_m = EXCLUDED.gps_accuracy_m,
           synced_at = now()
         RETURNING id`,
        [client_uuid, template_id, site_id, req.user.id, device_id, started_at, submitted_at,
         gps_latitude, gps_longitude, gps_accuracy_m]
      );

      const responseId = rows[0].id;

      // Remplace les réponses existantes (idempotent : delete + insert)
      await client.query(`DELETE FROM response_answers WHERE response_id = $1`, [responseId]);

      for (const a of answers) {
        await client.query(
          `INSERT INTO response_answers (response_id, question_id, value_text, value_number, value_boolean, value_json)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [responseId, a.question_id, a.value_text ?? null, a.value_number ?? null,
           a.value_boolean ?? null, a.value_json ? JSON.stringify(a.value_json) : null]
        );
      }

      await client.query("COMMIT");
      results.push({ client_uuid, status: "synced", response_id: responseId });
    } catch (err) {
      await client.query("ROLLBACK");
      results.push({ client_uuid: item.client_uuid || null, status: "error", error: err.message });
    } finally {
      client.release();
    }
  }

  res.json({ results });
}

/**
 * GET /api/responses?site_id=&technician_id=&date_from=&date_to=
 */
async function listResponses(req, res, next) {
  try {
    const { site_id, technician_id, date_from, date_to } = req.query;
    const conditions = [];
    const params = [];

    if (site_id) { params.push(site_id); conditions.push(`r.site_id = $${params.length}`); }
    if (technician_id) { params.push(technician_id); conditions.push(`r.technician_id = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`r.submitted_at >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`r.submitted_at <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT r.id, r.client_uuid, r.status, r.submitted_at, r.synced_at,
              s.site_code, s.site_name, u.full_name AS technician_name
       FROM survey_responses r
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       ${where}
       ORDER BY r.submitted_at DESC
       LIMIT 200`,
      params
    );

    res.json({ count: rows.length, responses: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/responses/:id — détail complet avec réponses et médias
 */
async function getResponseDetail(req, res, next) {
  try {
    const { id } = req.params;

    const { rows: responseRows } = await pool.query(
      `SELECT r.*, s.site_code, s.site_name, u.full_name AS technician_name
       FROM survey_responses r
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       WHERE r.id = $1`,
      [id]
    );

    if (responseRows.length === 0) {
      return res.status(404).json({ error: "Réponse introuvable" });
    }

    const { rows: answers } = await pool.query(
      `SELECT a.*, q.label, q.question_type, q.unit
       FROM response_answers a
       JOIN survey_questions q ON q.id = a.question_id
       WHERE a.response_id = $1`,
      [id]
    );

    const { rows: media } = await pool.query(
      `SELECT * FROM media_attachments WHERE response_id = $1`,
      [id]
    );

    res.json({ ...responseRows[0], answers, media });
  } catch (err) {
    next(err);
  }
}

module.exports = { syncResponses, listResponses, getResponseDetail };
