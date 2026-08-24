const pool = require("../config/db");

/**
 * POST /api/responses/:id/media
 * Upload multipart (multer place le fichier dans req.file avant ce controller).
 * body (form fields, en plus du fichier): question_id, gps_latitude, gps_longitude, captured_at
 */
async function uploadMedia(req, res, next) {
  try {
    const { id: responseId } = req.params;
    const { question_id, gps_latitude, gps_longitude, captured_at } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier reçu (champ 'file' attendu)" });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    const { rows } = await pool.query(
      `INSERT INTO media_attachments
         (response_id, question_id, file_url, file_type, gps_latitude, gps_longitude, captured_at, file_size_kb)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [responseId, question_id || null, fileUrl, req.file.mimetype,
       gps_latitude || null, gps_longitude || null, captured_at || null,
       Math.round(req.file.size / 1024)]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadMedia };
