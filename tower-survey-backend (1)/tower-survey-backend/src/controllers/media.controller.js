const fs = require("fs/promises");
const path = require("path");
const pool = require("../config/db");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const UPLOAD_DIR_ABS = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(__dirname, "..", "..", UPLOAD_DIR);

/**
 * POST /api/responses/:id/media
 * Upload multipart (multer place le fichier dans req.file avant ce controller).
 *
 * body (form fields, en plus du fichier):
 *   - question_id (optionnel — peut être null pour média libre)
 *   - slot (optionnel, VARCHAR(30)) : nom de slot nommé
 *       (ex: "Avant", "Après") ou null pour liste libre.
 *   - gps_latitude, gps_longitude, captured_at
 *
 * Idempotence : un même (response_id, question_id, slot) renvoyé deux fois
 * (retry réseau) remplace la photo précédente plutôt que d'en créer une
 * deuxième. Les photos existantes avec un slot DIFFÉRENT sont préservées.
 */
async function uploadMedia(req, res, next) {
  try {
    const { id: responseId } = req.params;
    const { question_id, slot, gps_latitude, gps_longitude, captured_at } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier reçu (champ 'file' attendu)" });
    }

    const normalizedSlot = typeof slot === "string" && slot.trim() !== "" ? slot.trim().slice(0, 30) : null;
    const fileUrl = `/uploads/${req.file.filename}`;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // On récupère l'ancien fichier (s'il existe) pour le supprimer ensuite.
      // La vraie garantie d'idempotence vient de l'index unique
      // uq_media_response_question_slot + ON CONFLICT ci-dessous : on remplace
      // toujours la photo existante pour (response_id, question_id, slot) —
      // jamais on n'en crée une deuxième.
      const lookupParams = [responseId, question_id || null];
      let lookupSql = `SELECT file_url FROM media_attachments
                       WHERE response_id = $1 AND question_id IS NOT DISTINCT FROM $2`;
      if (normalizedSlot === null) {
        lookupSql += ` AND slot IS NULL`;
      } else {
        lookupParams.push(normalizedSlot);
        lookupSql += ` AND slot = $${lookupParams.length}`;
      }
      const { rows: oldRows } = await client.query(lookupSql, lookupParams);

      // Upsert atomique : si une ligne existe, on la met à jour (nouveau fichier,
      // nouveau GPS, nouveau captured_at). Sinon on l'insère. Cela gère les races
      // entre requêtes concurrentes sans devoir compter sur le DELETE-then-INSERT.
      const { rows } = await client.query(
        `INSERT INTO media_attachments
           (response_id, question_id, slot, file_url, file_type, gps_latitude, gps_longitude, captured_at, file_size_kb)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (response_id, question_id, slot) DO UPDATE
           SET file_url = EXCLUDED.file_url,
               file_type = EXCLUDED.file_type,
               gps_latitude = EXCLUDED.gps_latitude,
               gps_longitude = EXCLUDED.gps_longitude,
               captured_at = EXCLUDED.captured_at,
               file_size_kb = EXCLUDED.file_size_kb,
               uploaded_at = now()
         RETURNING *`,
        [responseId, question_id || null, normalizedSlot, fileUrl, req.file.mimetype,
         gps_latitude || null, gps_longitude || null, captured_at || null,
         Math.round(req.file.size / 1024)]
      );

      // Suppression de l'ancien fichier (s'il existait et qu'il est différent du nouveau)
      for (const old of oldRows) {
        if (!old.file_url || old.file_url === fileUrl) continue;
        const filename = path.basename(old.file_url);
        try {
          await fs.unlink(path.join(UPLOAD_DIR_ABS, filename));
        } catch {
          // fichier déjà absent — on ignore
        }
      }

      await client.query("COMMIT");
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      // En cas d'erreur serveur, on supprime le fichier qu'on vient d'écrire
      // pour ne pas laisser d'orphelin sur disque.
      try {
        await fs.unlink(req.file.path);
      } catch {}
      next(err);
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadMedia };
