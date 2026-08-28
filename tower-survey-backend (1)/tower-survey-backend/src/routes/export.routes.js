const router = require("express").Router();
const path = require("path");
const fs = require("fs/promises");
const ExcelJS = require("exceljs");
const sharp = require("sharp");
const pool = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, "");
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const UPLOAD_DIR_ABS = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(__dirname, "..", "..", UPLOAD_DIR);

function toIsoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function formatAnswerCell(answer) {
  if (!answer) return null;
  if (answer.value_text != null) return answer.value_text;
  if (answer.value_number != null) return Number(answer.value_number);
  if (answer.value_boolean != null) return answer.value_boolean ? "Oui" : "Non";
  if (answer.value_json != null) {
    try {
      const j = typeof answer.value_json === "string" ? JSON.parse(answer.value_json) : answer.value_json;
      return Array.isArray(j) ? j.join(", ") : JSON.stringify(j);
    } catch {
      return JSON.stringify(answer.value_json);
    }
  }
  return null;
}

function fileUrlToAbsPath(fileUrl) {
  if (!fileUrl) return null;
  const filename = path.basename(fileUrl);
  return path.join(UPLOAD_DIR_ABS, filename);
}

function buildHyperlink(fileUrl) {
  return `${PUBLIC_BASE_URL}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`;
}

/**
 * Décompose `validation_rules` (JSONB) pour les questions photo.
 * Retourne { namedSlots: string[]|null, isMulti: bool, multiMax: number|null }.
 * `validation_rules` peut être un objet (pg le parse en JSONB) ou une string JSON.
 */
function parsePhotoRules(validationRules) {
  let rules = validationRules;
  if (typeof rules === "string") {
    try { rules = JSON.parse(rules); } catch { rules = null; }
  }
  rules = rules && typeof rules === "object" ? rules : {};
  const namedSlots = Array.isArray(rules.photo_slots)
    ? rules.photo_slots.filter((s) => typeof s === "string" && s.trim() !== "")
    : null;
  const isMulti = !!rules.photo_multi && !namedSlots;
  const multiMax = Number.isFinite(rules.photo_max) && rules.photo_max > 0
    ? Math.floor(rules.photo_max)
    : null;
  return {
    namedSlots: namedSlots && namedSlots.length > 0 ? namedSlots : null,
    isMulti,
    multiMax,
  };
}

/**
 * Génère la liste des colonnes "métier" (hors colonnes fixes) pour une section.
 * Pour les questions photo à slots nommés, on émet une colonne par slot
 * (clé composite `q_<qid>__slot_<nom>`). Pour multi-liste, une seule colonne
 * avec la clé `q_<qid>` (texte "N photo(s) — voir onglet Photos").
 * Pour les autres types, une seule colonne `q_<qid>` comme avant.
 */
function questionColumnsForSection(section) {
  const cols = [];
  for (const q of section.questions) {
    if (q.question_type === "photo") {
      const { namedSlots, isMulti } = parsePhotoRules(q.validation_rules);
      if (namedSlots) {
        for (const slotName of namedSlots) {
          const safeSlot = slotName.replace(/[^a-zA-Z0-9_]/g, "_");
          cols.push({
            header: `[${section.title}] ${q.label} (${slotName})`,
            key: `q_${q.id}__slot_${safeSlot}`,
            slot: slotName,
            questionId: q.id,
            questionLabel: q.label,
            mode: "named",
            width: 22,
          });
        }
        // On n'émet pas de colonne "principale" pour les questions à slots — chaque
        // slot a sa propre colonne. Si une photo "libre" (slot NULL) a été prise
        // en surplus, elle apparaîtra quand même dans l'onglet Photos.
      } else if (isMulti) {
        cols.push({
          header: `[${section.title}] ${q.label}`,
          key: `q_${q.id}`,
          questionId: q.id,
          questionLabel: q.label,
          mode: "multi",
          width: 28,
        });
      } else {
        cols.push({
          header: `[${section.title}] ${q.label}`,
          key: `q_${q.id}`,
          questionId: q.id,
          questionLabel: q.label,
          mode: "simple",
          width: 24,
        });
      }
    } else {
      cols.push({
        header: `[${section.title}] ${q.label}`,
        key: `q_${q.id}`,
        questionId: q.id,
        questionLabel: q.label,
        mode: "value",
        width: 24,
      });
    }
  }
  return cols;
}

/**
 * GET /api/export/responses.xlsx?site_id=&technician_id=&date_from=&date_to=
 * Export portefeuille — 2 feuilles, hyperliens cliquables (pas d'images collées).
 */
router.get("/responses.xlsx", requireAuth, requireRole("admin", "supervisor"), async (req, res, next) => {
  try {
    const { site_id, technician_id, date_from, date_to } = req.query;
    const conditions = [];
    const params = [];

    if (site_id) { params.push(site_id); conditions.push(`r.site_id = $${params.length}`); }
    if (technician_id) { params.push(technician_id); conditions.push(`r.technician_id = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`r.submitted_at >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`r.submitted_at <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: responses } = await pool.query(
      `SELECT r.id, r.submitted_at,
              s.site_code, s.site_name, s.cluster,
              u.full_name AS technician_name
       FROM survey_responses r
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       ${where}
       ORDER BY r.submitted_at DESC
       LIMIT 2000`,
      params
    );

    if (responses.length === 0) {
      return res.status(404).json({ error: "Aucune réponse trouvée pour ces filtres" });
    }

    const responseIds = responses.map((r) => r.id);

    const { rows: questions } = await pool.query(
      `SELECT q.id, q.label, q.question_type, q.order_index, q.validation_rules,
              sec.id AS section_id, sec.title AS section_title, sec.order_index AS section_order
       FROM survey_questions q
       JOIN survey_sections sec ON sec.id = q.section_id
       WHERE sec.template_id IN (SELECT DISTINCT template_id FROM survey_responses WHERE id = ANY($1::uuid[]))
       ORDER BY sec.order_index, sec.title, q.order_index, q.label`,
      [responseIds]
    );

    const { rows: answers } = await pool.query(
      `SELECT response_id, question_id, value_text, value_number, value_boolean, value_json
       FROM response_answers
       WHERE response_id = ANY($1::uuid[])`,
      [responseIds]
    );

    const { rows: media } = await pool.query(
      `SELECT id, response_id, question_id, slot, file_url, captured_at, gps_latitude, gps_longitude
       FROM media_attachments
       WHERE response_id = ANY($1::uuid[])`,
      [responseIds]
    );

    const answersByKey = new Map();
    for (const a of answers) {
      answersByKey.set(`${a.response_id}::${a.question_id}`, a);
    }

    const sectionsMap = new Map();
    for (const q of questions) {
      if (!sectionsMap.has(q.section_id)) {
        sectionsMap.set(q.section_id, { id: q.section_id, title: q.section_title, order: q.section_order, questions: [] });
      }
      sectionsMap.get(q.section_id).questions.push(q);
    }
    const sections = [...sectionsMap.values()].sort((a, b) => a.order - b.order);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Tower Audit";
    workbook.created = new Date();

    const allQuestionCols = sections.flatMap((s) => questionColumnsForSection(s));

    const sheetReponses = workbook.addWorksheet("Réponses");
    sheetReponses.columns = [
      { header: "Site Code", key: "site_code", width: 18 },
      { header: "Site Name", key: "site_name", width: 28 },
      { header: "Cluster", key: "cluster", width: 14 },
      { header: "Technicien", key: "technician_name", width: 22 },
      { header: "Date soumission", key: "submitted_at", width: 20 },
      ...allQuestionCols.map((c) => ({ header: c.header, key: c.key, width: c.width })),
    ];
    sheetReponses.getRow(1).font = { bold: true };
    sheetReponses.views = [{ state: "frozen", ySplit: 1 }];

    // Indexation des médias :
    //   - mediaByTripleKey : (response, question, slot) -> première photo (mode "named")
    //   - mediaCountByPairKey : (response, question) -> nombre de photos (mode "multi")
    //   - mediaFirstByPairKey : (response, question) -> première photo (mode "simple")
    const mediaByTripleKey = new Map();
    const mediaFirstByPairKey = new Map();
    const mediaCountByPairKey = new Map();
    for (const m of media) {
      if (!m.question_id) continue;
      const pairKey = `${m.response_id}::${m.question_id}`;
      if (!mediaFirstByPairKey.has(pairKey)) mediaFirstByPairKey.set(pairKey, m);
      mediaCountByPairKey.set(pairKey, (mediaCountByPairKey.get(pairKey) || 0) + 1);
      const tKey = `${pairKey}::${m.slot || ""}`;
      if (!mediaByTripleKey.has(tKey)) mediaByTripleKey.set(tKey, []);
      mediaByTripleKey.get(tKey).push(m);
    }

    for (const r of responses) {
      const row = {
        site_code: r.site_code,
        site_name: r.site_name,
        cluster: r.cluster,
        technician_name: r.technician_name,
        submitted_at: r.submitted_at ? new Date(r.submitted_at).toISOString() : "",
      };
      for (const col of allQuestionCols) {
        const pairKey = `${r.id}::${col.questionId}`;
        if (col.mode === "named") {
          const tKey = `${pairKey}::${col.slot}`;
          const m = (mediaByTripleKey.get(tKey) || [])[0];
          row[col.key] = m
            ? { text: "Voir photo", hyperlink: buildHyperlink(m.file_url) }
            : "";
        } else if (col.mode === "multi") {
          const count = mediaCountByPairKey.get(pairKey) || 0;
          row[col.key] = count > 0 ? `${count} photo(s) — voir onglet Photos` : "";
        } else if (col.mode === "simple") {
          const m = mediaFirstByPairKey.get(pairKey);
          row[col.key] = m
            ? { text: "Voir photo", hyperlink: buildHyperlink(m.file_url) }
            : "";
        } else {
          const a = answersByKey.get(pairKey);
          row[col.key] = formatAnswerCell(a);
        }
      }
      const addedRow = sheetReponses.addRow(row);
      for (const col of allQuestionCols) {
        if (col.mode === "named" || col.mode === "simple") {
          const cell = addedRow.getCell(col.key);
          if (cell.value && typeof cell.value === "object" && cell.value.hyperlink) {
            cell.font = { color: { argb: "FF0563C1" }, underline: true };
          }
        }
      }
    }

    const sheetPhotos = workbook.addWorksheet("Photos");
    sheetPhotos.columns = [
      { header: "Site Code", key: "site_code", width: 18 },
      { header: "Section", key: "section_title", width: 20 },
      { header: "Question", key: "question_label", width: 32 },
      { header: "Slot", key: "slot", width: 16 },
      { header: "Lien photo", key: "photo_link", width: 30 },
      { header: "Date/heure capture", key: "captured_at", width: 20 },
      { header: "Latitude", key: "gps_latitude", width: 14 },
      { header: "Longitude", key: "gps_longitude", width: 14 },
    ];
    sheetPhotos.getRow(1).font = { bold: true };
    sheetPhotos.views = [{ state: "frozen", ySplit: 1 }];

    const siteByResponse = new Map(responses.map((r) => [r.id, r]));
    const questionById = new Map(questions.map((q) => [q.id, q]));

    for (const m of media) {
      const site = siteByResponse.get(m.response_id);
      const q = questionById.get(m.question_id);
      if (!site || !q) continue;
      const added = sheetPhotos.addRow({
        site_code: site.site_code,
        section_title: q.section_title,
        question_label: q.label,
        slot: m.slot || "—",
        photo_link: {
          text: "Voir photo",
          hyperlink: buildHyperlink(m.file_url),
        },
        captured_at: m.captured_at ? new Date(m.captured_at).toISOString() : "",
        gps_latitude: m.gps_latitude != null ? m.gps_latitude : "",
        gps_longitude: m.gps_longitude != null ? m.gps_longitude : "",
      });
      const linkCell = added.getCell("photo_link");
      if (linkCell.value && typeof linkCell.value === "object") {
        linkCell.font = { color: { argb: "FF0563C1" }, underline: true };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `audit-export-${toIsoDate(new Date())}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/export/responses/:id/report.xlsx
 * Rapport mono-site avec miniatures réellement collées dans la feuille.
 */
router.get("/responses/:id/report.xlsx", requireAuth, requireRole("admin", "supervisor"), async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: responseRows } = await pool.query(
      `SELECT r.*, s.site_code, s.site_name, s.cluster,
              u.full_name AS technician_name
       FROM survey_responses r
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       WHERE r.id = $1`,
      [id]
    );

    if (responseRows.length === 0) {
      return res.status(404).json({ error: "Réponse introuvable" });
    }
    const response = responseRows[0];

    const { rows: answers } = await pool.query(
      `SELECT a.*, q.label, q.question_type, q.unit, q.order_index, q.validation_rules,
              sec.id AS section_id, sec.title AS section_title, sec.order_index AS section_order
       FROM response_answers a
       JOIN survey_questions q ON q.id = a.question_id
       JOIN survey_sections sec ON sec.id = q.section_id
       WHERE a.response_id = $1
       ORDER BY sec.order_index, sec.title, q.order_index, q.label`,
      [id]
    );

    const { rows: media } = await pool.query(
      `SELECT id, question_id, slot, file_url, captured_at, gps_latitude, gps_longitude
       FROM media_attachments WHERE response_id = $1
       ORDER BY slot NULLS LAST, captured_at NULLS LAST, uploaded_at`,
      [id]
    );

    if (answers.length === 0) {
      return res.status(404).json({ error: "Aucune réponse associée à cet audit" });
    }

    // Indexation par (question, slot) pour les slots nommés, et par question pour le reste
    const mediaByQuestionAndSlot = new Map();
    const mediaByQuestion = new Map();
    for (const m of media) {
      if (!m.question_id) continue;
      const qKey = m.question_id;
      if (!mediaByQuestion.has(qKey)) mediaByQuestion.set(qKey, []);
      mediaByQuestion.get(qKey).push(m);
      const sKey = `${qKey}::${m.slot || ""}`;
      if (!mediaByQuestionAndSlot.has(sKey)) mediaByQuestionAndSlot.set(sKey, []);
      mediaByQuestionAndSlot.get(sKey).push(m);
    }

    const sectionsMap = new Map();
    for (const a of answers) {
      if (!sectionsMap.has(a.section_id)) {
        sectionsMap.set(a.section_id, { id: a.section_id, title: a.section_title, order: a.section_order, items: [] });
      }
      sectionsMap.get(a.section_id).items.push(a);
    }
    const sections = [...sectionsMap.values()].sort((a, b) => a.order - b.order);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Tower Audit";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Rapport");
    sheet.columns = [
      { width: 6 },
      { width: 28 },
      { width: 24 },
      { width: 24 },
      { width: 24 },
      { width: 24 },
    ];
    sheet.getColumn(1).alignment = { vertical: "top" };
    sheet.getColumn(2).alignment = { vertical: "top", wrapText: true };
    for (let c = 3; c <= 6; c++) sheet.getColumn(c).alignment = { vertical: "top", wrapText: true };

    const titleRow = sheet.addRow(["", "Rapport d'audit", "", "", "", ""]);
    titleRow.font = { bold: true, size: 16 };
    titleRow.height = 26;
    sheet.mergeCells("B2:F2");
    sheet.addRow([]);

    const imageBufferCache = new Map();
    let imageCounter = 0;

    /**
     * Charge/redimensionne une photo (avec cache) et l'insère à la cellule (col, row).
     * La photo fait 200px de large max (pour tenir 4 côte à côte sur ~100 cols).
     * @returns {Promise<boolean>} true si l'insertion a réussi.
     */
    async function insertPhotoIntoCell(media, col, rowNumber) {
      try {
        const absPath = fileUrlToAbsPath(media.file_url);
        if (!absPath) return false;
        let buf = imageBufferCache.get(absPath);
        if (!buf) {
          const resized = await sharp(absPath)
            .resize({ width: 200, withoutEnlargement: true })
            .toBuffer();
          buf = { buffer: resized, ext: "png" };
          imageBufferCache.set(absPath, buf);
        }
        const imageId = workbook.addImage({
          buffer: buf.buffer,
          extension: buf.ext,
        });
        imageCounter += 1;
        sheet.addImage(imageId, {
          tl: { col, row: rowNumber - 1 },
          ext: { width: 200, height: 150 },
          editAs: "oneCell",
        });
        return true;
      } catch (imgErr) {
        sheet.getRow(rowNumber).getCell(col + 1).value = `(erreur lecture photo: ${imgErr.message})`;
        return false;
      }
    }

    function addMetaRow(label, value) {
      const r = sheet.addRow(["", label, value ?? "", "", "", ""]);
      r.getCell(2).font = { bold: true };
    }
    addMetaRow("Site Code", response.site_code);
    addMetaRow("Site Name", response.site_name);
    addMetaRow("Cluster", response.cluster);
    addMetaRow("Technicien", response.technician_name);
    addMetaRow("Date soumission", response.submitted_at ? new Date(response.submitted_at).toISOString() : "");
    sheet.addRow([]);

    for (const sec of sections) {
      const secHeader = sheet.addRow(["", sec.title, "", "", "", ""]);
      secHeader.getCell(2).font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
      secHeader.getCell(2).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E78" },
      };
      secHeader.height = 22;
      sheet.mergeCells(`B${secHeader.number}:F${secHeader.number}`);

      for (const a of sec.items) {
        const qLabelRow = sheet.addRow(["", a.label, formatAnswerCell(a), "", "", ""]);
        qLabelRow.getCell(2).font = { bold: true };
        qLabelRow.height = 18;

        if (a.question_type !== "photo") continue;

        const { namedSlots, isMulti, multiMax } = parsePhotoRules(a.validation_rules);
        const allList = mediaByQuestion.get(a.question_id) || [];

        // ---------- MODE SLOTS NOMMÉS : images côte à côte ----------
        if (namedSlots) {
          const hasAny = namedSlots.some((s) => (mediaByQuestionAndSlot.get(`${a.question_id}::${s}`) || []).length > 0);
          if (!hasAny) {
            sheet.addRow(["", "", "(aucune photo)", "", "", ""]);
            continue;
          }
          // Ligne de labels de slot
          const labelRow = sheet.addRow(["", "Slots :", ...namedSlots.map((s) => s), "", ""]);
          labelRow.getCell(2).font = { italic: true, color: { argb: "FF555555" } };
          for (let i = 0; i < namedSlots.length; i++) {
            const cell = labelRow.getCell(3 + i);
            cell.font = { bold: true, size: 10, color: { argb: "FF1F4E78" } };
            cell.alignment = { horizontal: "center" };
          }
          labelRow.height = 18;
          // Ligne d'images (une rangée, jusqu'à 4 images côte à côte)
          const imageRow = sheet.addRow(["", "", "", "", "", ""]);
          imageRow.height = 130;
          for (let i = 0; i < namedSlots.length && i < 4; i++) {
            const slotName = namedSlots[i];
            const list = mediaByQuestionAndSlot.get(`${a.question_id}::${slotName}`) || [];
            const m = list[0];
            if (!m) {
              imageRow.getCell(3 + i).value = "(vide)";
              imageRow.getCell(3 + i).alignment = { horizontal: "center" };
              imageRow.getCell(3 + i).font = { italic: true, color: { argb: "FF999999" } };
              continue;
            }
            await insertPhotoIntoCell(m, 2 + i, imageRow.number);
          }
          continue;
        }

        // ---------- MODE MULTI : jusqu'à multiMax (ou 4) photos, empilées ----------
        if (isMulti) {
          const cap = multiMax && multiMax > 0 ? Math.min(multiMax, 4) : 4;
          if (allList.length === 0) {
            sheet.addRow(["", "", "(aucune photo)", "", "", ""]);
            continue;
          }
          const shown = allList.slice(0, cap);
          for (let i = 0; i < shown.length; i++) {
            const photoRow = sheet.addRow(["", i === 0 ? "Photos :" : "", "", "", "", ""]);
            if (i === 0) photoRow.getCell(2).font = { italic: true, color: { argb: "FF555555" } };
            photoRow.height = 130;
            await insertPhotoIntoCell(shown[i], 2, photoRow.number);
          }
          if (allList.length > cap) {
            const moreRow = sheet.addRow(["", "", `(+${allList.length - cap} photo(s) non affichée(s) — limite rapport : ${cap})`, "", "", ""]);
            moreRow.getCell(3).font = { italic: true, color: { argb: "FF999999" } };
          }
          continue;
        }

        // ---------- MODE SIMPLE : 1 photo collée (comportement historique) ----------
        if (allList.length === 0) {
          sheet.addRow(["", "", "(aucune photo)", "", "", ""]);
          continue;
        }
        const m = allList[0];
        const placeRow = sheet.addRow(["", "", "", "", "", ""]);
        placeRow.height = 200;
        await insertPhotoIntoCell(m, 2, placeRow.number);
      }
      sheet.addRow([]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const submittedDate = response.submitted_at ? toIsoDate(response.submitted_at) : toIsoDate(new Date());
    const safeSiteCode = (response.site_code || "site").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `rapport-${safeSiteCode}-${submittedDate}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
