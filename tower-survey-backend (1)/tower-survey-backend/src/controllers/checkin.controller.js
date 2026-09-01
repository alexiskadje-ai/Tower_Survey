const fs = require("fs/promises");
const path = require("path");
const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { haversineDistance } = require("../utils/geo");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const UPLOAD_DIR_ABS = path.isAbsolute(UPLOAD_DIR)
  ? UPLOAD_DIR
  : path.join(__dirname, "..", "..", UPLOAD_DIR);

// Seuil unique, nommé, pour rendre le tuning trivial.
const CHECKIN_FLAG_DISTANCE_M = Number(process.env.CHECKIN_FLAG_DISTANCE_M) || 500;

const VALID_ROLES = new Set(["lead", "assistant"]);

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

/**
 * POST /api/checkin/session
 * Crée une session de check-in. Idempotent sur `client_uuid` :
 *   - si la session existe déjà pour cet org, on la retourne
 *     telle quelle (même si 'submitted', on ne ré-écrit pas).
 *
 * body JSON : { client_uuid, site_id? }
 *   - client_uuid : UUID généré côté client (offline-first).
 *   - site_id     : optionnel. Si fourni, déclenche un calcul de
 *                   distance pour les check-ins déjà présents.
 */
async function createSession(req, res, next) {
  try {
    const { client_uuid, site_id } = req.body || {};
    if (!client_uuid) return badRequest(res, "client_uuid requis");

    // Idempotence : on tente l'INSERT, en cas de conflit on renvoie la ligne existante
    const { rows } = await pool.query(
      `INSERT INTO checkin_sessions (id, client_uuid, org_id, site_id)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (client_uuid) DO UPDATE
         SET client_uuid = EXCLUDED.client_uuid   -- no-op pour forcer RETURNING
       RETURNING *`,
      [client_uuid, req.user.orgId, site_id || null]
    );
    const session = rows[0];

    // Si un site vient d'être attaché, on (re)calcule le flag sur les check-ins
    if (session.site_id) {
      await recomputeSessionFlags(session.id, session.site_id);
    }

    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/checkin/session/:sessionId
 * Attache un site à la session (appelé par le frontend quand
 * l'utilisateur choisit le site dans le formulaire).
 * Recalcule les flags de distance pour les check-ins déjà reçus.
 */
async function attachSiteToSession(req, res, next) {
  try {
    const { sessionId } = req.params;
    const { site_id } = req.body || {};
    if (!site_id) return badRequest(res, "site_id requis");

    const { rows: siteRows } = await pool.query(
      `SELECT id, latitude, longitude, org_id FROM sites WHERE id = $1`,
      [site_id]
    );
    const site = siteRows[0];
    if (!site) return res.status(404).json({ error: "Site introuvable" });
    if (site.org_id !== req.user.orgId) {
      return res.status(403).json({ error: "Site hors de votre organisation" });
    }

    const { rows } = await pool.query(
      `UPDATE checkin_sessions
       SET site_id = $1, updated_at = now()
       WHERE id = $2 AND org_id = $3
       RETURNING *`,
      [site_id, sessionId, req.user.orgId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Session introuvable" });

    await recomputeSessionFlags(sessionId, site_id);
    const { rows: updated } = await pool.query(
      `SELECT * FROM checkin_sessions WHERE id = $1`,
      [sessionId]
    );
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/checkin
 * Multipart : file (selfie), session_id, role, latitude, longitude,
 * gps_accuracy_meters, device_fingerprint, captured_at
 *
 * - Authentifié (le lead est l'utilisateur du JWT, l'assistant est
 *   l'utilisateur vérifié par /verify-second-technician — voir note
 *   dans la doc des routes).
 * - Upsert : si l'utilisateur a déjà un check-in actif pour ce
 *   (session, role), on marque l'ancien en superseded et on insère
 *   le nouveau.
 * - Si la session a déjà un site, calcule la distance haversine et
 *   flag si > seuil.
 */
async function postCheckin(req, res, next) {
  try {
    const {
      session_id,
      role,
      latitude,
      longitude,
      gps_accuracy_meters,
      device_fingerprint,
      captured_at,
      user_id_override, // utilisé uniquement par le chemin assistant, après verify
    } = req.body || {};

    if (!session_id) return badRequest(res, "session_id requis");
    if (!VALID_ROLES.has(role)) return badRequest(res, "role invalide (lead|assistant)");
    if (!req.file) return res.status(400).json({ error: "Aucun fichier selfie reçu (champ 'file')" });

    // Qui est-ce qui check-in ?
    // - role=lead : c'est forcément l'utilisateur du JWT
    // - role=assistant : c'est l'utilisateur du JWT du second device, qui doit
    //   avoir fait /verify-second-technician AVANT et passé un user_id
    //   (voir client flow). On accepte les deux et on privilégie
    //   user_id_override (passé après verify) si fourni.
    const userId = user_id_override || req.user.id;

    // Récupère la session + org
    const { rows: sessionRows } = await pool.query(
      `SELECT id, org_id, site_id, status FROM checkin_sessions WHERE id = $1`,
      [session_id]
    );
    const session = sessionRows[0];
    if (!session) return res.status(404).json({ error: "Session de check-in introuvable" });
    if (session.org_id !== req.user.orgId) {
      return res.status(403).json({ error: "Session hors de votre organisation" });
    }
    if (session.status === "submitted") {
      return res.status(409).json({ error: "Session déjà soumise, check-in impossible" });
    }
    // Le user doit appartenir au même org
    const { rows: userRows } = await pool.query(
      `SELECT id, is_active FROM users WHERE id = $1`,
      [userId]
    );
    if (!userRows[0] || !userRows[0].is_active) {
      return res.status(403).json({ error: "Technicien invalide ou inactif" });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const lat = latitude === "" || latitude == null ? null : Number(latitude);
    const lon = longitude === "" || longitude == null ? null : Number(longitude);
    const acc = gps_accuracy_meters === "" || gps_accuracy_meters == null ? null : Number(gps_accuracy_meters);

    let distanceM = null;
    let flagged = false;
    let flagReason = null;

    // Si site connu, calcule la distance
    if (session.site_id && lat != null && lon != null) {
      const { rows: siteRows } = await pool.query(
        `SELECT latitude, longitude FROM sites WHERE id = $1`,
        [session.site_id]
      );
      const tower = siteRows[0];
      if (tower?.latitude != null && tower?.longitude != null) {
        distanceM = haversineDistance(lat, lon, Number(tower.latitude), Number(tower.longitude));
        if (distanceM != null && distanceM > CHECKIN_FLAG_DISTANCE_M) {
          flagged = true;
          flagReason = `Distance au site ${Math.round(distanceM)} m > seuil ${CHECKIN_FLAG_DISTANCE_M} m`;
        }
      } else {
        flagReason = "Coordonnées du site inconnues — distance non vérifiée";
      }
    } else if (lat == null || lon == null) {
      flagReason = "GPS absent ou invalide à la capture";
      flagged = true; // pas de GPS = on signale pour review
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Supersede l'ancien check-in actif pour (session, user, role)
      await client.query(
        `UPDATE checkin_verifications
         SET superseded_at = now()
         WHERE session_id = $1 AND user_id = $2 AND role = $3 AND superseded_at IS NULL`,
        [session_id, userId, role]
      );

      // Insère le nouveau
      const { rows: verRows } = await client.query(
        `INSERT INTO checkin_verifications
           (session_id, user_id, role, selfie_url, latitude, longitude,
            gps_accuracy_meters, device_fingerprint, captured_at,
            distance_to_tower_meters, flagged, flag_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          session_id, userId, role, fileUrl, lat, lon, acc,
          device_fingerprint || null, captured_at || null,
          distanceM, flagged, flagReason,
        ]
      );
      const verification = verRows[0];

      // Met à jour la session : lead_user_id / assistant_user_id, status
      const setField = role === "lead" ? "lead_user_id" : "assistant_user_id";
      const { rows: sessRows } = await client.query(
        `SELECT
            bool_or(role = 'lead'      AND superseded_at IS NULL) AS has_lead,
            bool_or(role = 'assistant' AND superseded_at IS NULL) AS has_assistant,
            bool_or(flagged) AS any_flagged
         FROM checkin_verifications WHERE session_id = $1`,
        [session_id]
      );
      const counts = sessRows[0];
      const newStatus = counts.has_lead && counts.has_assistant ? "ready" : "awaiting_checkins";

      await client.query(
        `UPDATE checkin_sessions
         SET ${setField} = $1,
             status = $2,
             flagged = $3,
             flag_reason = $4,
             updated_at = now()
         WHERE id = $5`,
        [userId, newStatus, !!counts.any_flagged,
         counts.any_flagged ? "Au moins un check-in a été signalé hors zone" : null,
         session_id]
      );

      await client.query("COMMIT");
      res.status(201).json({
        checkinId: verification.id,
        flagged: verification.flagged,
        flagReason: verification.flag_reason,
        distanceMeters: verification.distance_to_tower_meters,
        sessionStatus: newStatus,
      });
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      try { await fs.unlink(req.file.path); } catch {}
      next(err);
    } finally {
      client.release();
    }
  } catch (err) {
    if (req.file) {
      try { await fs.unlink(req.file.path); } catch {}
    }
    next(err);
  }
}

/**
 * POST /api/checkin/verify-second-technician
 * Vérifie les credentials du second technicien SANS émettre de JWT.
 * Retourne { userId, name } en cas de succès. 401 sinon.
 *
 * Volontairement distinct de /api/auth/login : on veut juste prouver
 * que l'assistant est bien un utilisateur enregistré, sans remplacer
 * la session active du lead.
 */
async function verifySecondTechnician(req, res, next) {
  try {
    const { email, matricule, password } = req.body || {};
    const identifier = email || matricule;
    if (!identifier || !password) {
      return res.status(400).json({ error: "Identifiant (matricule/email) et mot de passe requis" });
    }

    const { rows } = await pool.query(
      `SELECT id, full_name, password_hash, is_active, is_email_verified
       FROM users
       WHERE matricule = $1 OR email = $1
       LIMIT 1`,
      [identifier]
    );
    const user = rows[0];
    if (!user || !user.is_active || !user.is_email_verified) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Identifiants invalides" });

    // Refuse que le second technicien soit le même que le lead
    if (user.id === req.user.id) {
      return res.status(400).json({ error: "Le second technicien doit être différent du lead" });
    }

    res.json({ userId: user.id, name: user.full_name });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/checkin/session/:sessionId
 * Renvoie l'état d'une session : quels rôles ont un check-in actif,
 * si l'un d'eux est flaggé, et le statut global.
 */
async function getSessionStatus(req, res, next) {
  try {
    const { sessionId } = req.params;

    const { rows: sessionRows } = await pool.query(
      `SELECT s.*,
              lead.full_name    AS lead_name,
              asst.full_name    AS assistant_name
       FROM checkin_sessions s
       LEFT JOIN users lead ON lead.id = s.lead_user_id
       LEFT JOIN users asst ON asst.id = s.assistant_user_id
       WHERE s.id = $1 AND s.org_id = $2`,
      [sessionId, req.user.orgId]
    );
    const session = sessionRows[0];
    if (!session) return res.status(404).json({ error: "Session introuvable" });

    const { rows: verifRows } = await pool.query(
      `SELECT id, role, user_id, flagged, flag_reason, selfie_url, captured_at
       FROM checkin_verifications
       WHERE session_id = $1 AND superseded_at IS NULL
       ORDER BY synced_at ASC`,
      [sessionId]
    );

    const has_lead = verifRows.some((v) => v.role === "lead");
    const has_assistant = verifRows.some((v) => v.role === "assistant");
    const both_complete = has_lead && has_assistant;
    const any_flagged = verifRows.some((v) => v.flagged);

    res.json({
      session,
      has_lead,
      has_assistant,
      both_complete,
      any_flagged,
      checkins: verifRows,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Helper interne : recalcule le flag de distance pour tous les
// check-ins d'une session à partir d'un site donné.
// ---------------------------------------------------------------------
async function recomputeSessionFlags(sessionId, siteId) {
  const { rows: siteRows } = await pool.query(
    `SELECT latitude, longitude FROM sites WHERE id = $1`,
    [siteId]
  );
  const tower = siteRows[0];
  if (!tower || tower.latitude == null || tower.longitude == null) return;

  const { rows: verifRows } = await pool.query(
    `SELECT id, latitude, longitude FROM checkin_verifications
     WHERE session_id = $1 AND superseded_at IS NULL
       AND latitude IS NOT NULL AND longitude IS NOT NULL`,
    [sessionId]
  );

  for (const v of verifRows) {
    const dist = haversineDistance(Number(v.latitude), Number(v.longitude),
                                   Number(tower.latitude), Number(tower.longitude));
    const flagged = dist != null && dist > CHECKIN_FLAG_DISTANCE_M;
    await pool.query(
      `UPDATE checkin_verifications
       SET distance_to_tower_meters = $1,
           flagged = $2,
           flag_reason = CASE WHEN $2 THEN
             'Distance au site ' || round($1)::text || ' m > seuil ' || $3::text || ' m'
           ELSE NULL END
       WHERE id = $4`,
      [dist, flagged, CHECKIN_FLAG_DISTANCE_M, v.id]
    );
  }

  // MAJ agrégat sur la session
  await pool.query(
    `UPDATE checkin_sessions s
     SET flagged = COALESCE((
           SELECT bool_or(flagged) FROM checkin_verifications
           WHERE session_id = s.id AND superseded_at IS NULL
         ), false),
         flag_reason = (
           SELECT string_agg(DISTINCT flag_reason, '; ')
           FROM checkin_verifications
           WHERE session_id = s.id AND superseded_at IS NULL AND flagged
         ),
         updated_at = now()
     WHERE s.id = $1`,
    [sessionId]
  );
}

module.exports = {
  createSession,
  attachSiteToSession,
  postCheckin,
  verifySecondTechnician,
  getSessionStatus,
  // exporté pour d'éventuels tests / sync
  CHECKIN_FLAG_DISTANCE_M,
};
