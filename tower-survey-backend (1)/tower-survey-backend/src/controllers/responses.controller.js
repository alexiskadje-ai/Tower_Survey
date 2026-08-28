const pool = require("../config/db");
const { sendEmail, getAdminRecipients } = require("../services/email.service");

// Mapping des catégories de template réellement stockées en base
// (le seed insère "Power Audit" et "Site Infrastructure" — voir
// src/db/seed/audit-pylone-template.js). Ces deux constantes sont la source
// de vérité pour tout le code de notification / complétion.
const CATEGORY_POWER = "Power Audit";
const CATEGORY_INFRA = "Site Infrastructure";
const CATEGORIES = [CATEGORY_POWER, CATEGORY_INFRA];

const CATEGORY_LABELS = {
  [CATEGORY_POWER]: "Power & Energy Audit",
  [CATEGORY_INFRA]: "Site Infrastructure Audit",
};

function otherCategory(cat) {
  return cat === CATEGORY_POWER ? CATEGORY_INFRA : CATEGORY_POWER;
}

function formatDateTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return String(d || "");
  return date.toLocaleString("fr-FR", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Déclenche (fire-and-forget) les emails post-soumission :
 *  - confirmation technicien
 *  - notification admin
 *  - rappel catégorie manquante côté technicien
 *  - email "audit complet" côté admin si la 2e catégorie vient d'être remplie
 *
 * Ne throw JAMAIS. Tout est async détaché, try/catch englobant.
 */
function firePostSubmitNotifications({ site_id, site_code, technician, submitted_category, submitted_at }) {
  (async () => {
    try {
      // 1. Récupérer l'email technicien, le code site, et la catégorie du template soumis
      const { rows: techRows } = await pool.query(
        `SELECT email, full_name FROM users WHERE id = $1`,
        [technician.id]
      );
      const techEmail = techRows[0]?.email;
      const techName = techRows[0]?.full_name || technician.full_name || "Technicien";

      // 2. Vérifier si l'AUTRE catégorie a déjà une réponse soumise pour ce site
      const other = otherCategory(submitted_category);
      const { rows: otherRows } = await pool.query(
        `SELECT 1
         FROM survey_responses r
         JOIN survey_templates t ON t.id = r.template_id
         WHERE r.site_id = $1 AND t.category = $2 AND r.status = 'submitted'
         LIMIT 1`,
        [site_id, other]
      );
      const otherDone = otherRows.length > 0;
      const bothDone = otherDone; // par définition, on vient de soumettre la courante

      const submittedLabel = CATEGORY_LABELS[submitted_category] || submitted_category;
      const missingLabel = CATEGORY_LABELS[other] || other;
      const submittedAtStr = formatDateTime(submitted_at);

      // 3. Email technicien (confirmation + rappel éventuel)
      if (techEmail) {
        const reminderHtml = otherDone
          ? ""
          : `<div style="margin-top:16px;padding:12px 14px;background:#fff7e6;border:1px solid #ffe0a3;border-radius:8px;">
               <strong>Rappel :</strong> la catégorie
               <em>${escapeHtml(missingLabel)}</em> n'a pas encore été soumise pour le site
               <strong>${escapeHtml(site_code)}</strong>. Merci de la compléter pour finaliser l'audit.
             </div>`;
        const reminderText = otherDone
          ? ""
          : `\nRappel : la catégorie "${missingLabel}" n'a pas encore été soumise pour le site ${site_code}. Merci de la compléter pour finaliser l'audit.\n`;

        const html = `
          <p>Bonjour <strong>${escapeHtml(techName)}</strong>,</p>
          <p>Votre soumission d'audit a bien été enregistrée :</p>
          <ul>
            <li><strong>Site :</strong> ${escapeHtml(site_code)}</li>
            <li><strong>Catégorie :</strong> ${escapeHtml(submittedLabel)}</li>
            <li><strong>Date / heure :</strong> ${escapeHtml(submittedAtStr)}</li>
          </ul>
          ${reminderHtml}
          <p style="color:#666;font-size:12px;margin-top:24px;">— Tour Audit Survey Builder (TELEINFRA)</p>
        `;
        const text = `Bonjour ${techName},\n\nVotre soumission d'audit a bien été enregistrée :\n- Site : ${site_code}\n- Catégorie : ${submittedLabel}\n- Date/heure : ${submittedAtStr}\n${reminderText}\n— Tour Audit Survey Builder (TELEINFRA)`;
        await sendEmail(techEmail, `Confirmation — Audit ${submittedLabel} (${site_code})`, html, text);
      }

      // 4. Email admin (notification soumission)
      const adminRecipients = getAdminRecipients();
      if (adminRecipients.length > 0) {
        const adminHtml = `
          <p>Une nouvelle soumission d'audit vient d'être enregistrée :</p>
          <ul>
            <li><strong>Technicien :</strong> ${escapeHtml(techName)}${techEmail ? ` &lt;${escapeHtml(techEmail)}&gt;` : ""}</li>
            <li><strong>Site :</strong> ${escapeHtml(site_code)}</li>
            <li><strong>Catégorie :</strong> ${escapeHtml(submittedLabel)}</li>
            <li><strong>Date / heure :</strong> ${escapeHtml(submittedAtStr)}</li>
          </ul>
          <p style="color:#666;font-size:12px;margin-top:24px;">— Tour Audit Survey Builder (TELEINFRA)</p>
        `;
        const adminText = `Une nouvelle soumission d'audit vient d'être enregistrée :\n- Technicien : ${techName}${techEmail ? ` <${techEmail}>` : ""}\n- Site : ${site_code}\n- Catégorie : ${submittedLabel}\n- Date/heure : ${submittedAtStr}\n`;
        await sendEmail(adminRecipients, `Audit soumis — ${site_code} (${submittedLabel})`, adminHtml, adminText);

        // 5. Email admin supplémentaire si les DEUX catégories sont maintenant complètes
        if (bothDone) {
          const fullHtml = `
            <p>Le site <strong>${escapeHtml(site_code)}</strong> est désormais <strong>audit complet</strong> (Power + Infrastructure).</p>
            <ul>
              <li><strong>Technicien :</strong> ${escapeHtml(techName)}</li>
              <li><strong>Catégories complétées :</strong> Power &amp; Energy Audit, Site Infrastructure Audit</li>
              <li><strong>Date / heure :</strong> ${escapeHtml(submittedAtStr)}</li>
            </ul>
            <p style="color:#666;font-size:12px;margin-top:24px;">— Tour Audit Survey Builder (TELEINFRA)</p>
          `;
          const fullText = `Site ${site_code} — audit complet (Power + Infrastructure)\nTechnicien : ${techName}\nDate/heure : ${submittedAtStr}\n`;
          await sendEmail(adminRecipients, `Site ${site_code} — audit complet (Power + Infrastructure)`, fullHtml, fullText);
        }
      }
    } catch (err) {
      console.error("[EMAIL] post-submit notifications failed:", err.message);
    }
  })();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

      // Récupère catégorie du template + code site pour les notifications.
      // On utilise un pool.query() séparé (et non le `client` de la transaction
      // déjà COMMITée) pour éviter qu'une éventuelle erreur de méta-données
      // ne déclenche un ROLLBACK sur une transaction déjà close.
      const { rows: metaRows } = await pool.query(
        `SELECT t.category AS category, s.site_code
         FROM survey_templates t, sites s
         WHERE t.id = $1 AND s.id = $2`,
        [template_id, site_id]
      );
      const submittedCategory = metaRows[0]?.category;
      const siteCode = metaRows[0]?.site_code || "(inconnu)";
      const submittedAtForMail = submitted_at ? new Date(submitted_at) : new Date();

      // Fire-and-forget : ne bloque jamais la sync
      if (submittedCategory && CATEGORIES.includes(submittedCategory)) {
        firePostSubmitNotifications({
          site_id,
          site_code: siteCode,
          technician: { id: req.user.id, full_name: req.user.full_name },
          submitted_category: submittedCategory,
          submitted_at: submittedAtForMail,
        });
      }
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch (_) { /* déjà commitée / pool fermé */ }
      results.push({ client_uuid: item.client_uuid || null, status: "error", error: err.message });
    } finally {
      client.release();
    }
  }

  res.json({ results });
}

/**
 * GET /api/responses?site_id=&technician_id=&date_from=&date_to=
 * Technicians see only their own responses; admins see all.
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

    if (req.user.role !== "admin") {
      params.push(req.user.id);
      conditions.push(`r.technician_id = $${params.length}`);
    }

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
