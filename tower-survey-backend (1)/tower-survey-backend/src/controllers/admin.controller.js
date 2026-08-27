const pool = require("../config/db");
const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");
const ExcelJS = require("exceljs");

/**
 * Charge toutes les questions de tous les templates actifs (pour construire les colonnes d'export).
 * Retourne un Map<templateId, Array<{id, label, sectionTitle, sectionOrder, questionOrder, type, unit}>>.
 */
async function loadAllQuestions() {
  const { rows: templates } = await pool.query(
    `SELECT id, name, category, version FROM survey_templates WHERE is_active = true`
  );

  if (templates.length === 0) return { questionsByTemplate: new Map(), templatesById: new Map() };

  const templateIds = templates.map((t) => t.id);
  const { rows: sections } = await pool.query(
    `SELECT id, template_id, title, order_index
     FROM survey_sections
     WHERE template_id = ANY($1::uuid[])
     ORDER BY order_index ASC`,
    [templateIds]
  );

  const sectionIds = sections.map((s) => s.id);
  let questions = [];
  if (sectionIds.length > 0) {
    const { rows } = await pool.query(
      `SELECT id, section_id, label, question_type, unit, order_index
       FROM survey_questions
       WHERE section_id = ANY($1::uuid[])
       ORDER BY order_index ASC`,
      [sectionIds]
    );
    questions = rows;
  }

  const sectionsByTemplate = new Map();
  for (const s of sections) {
    if (!sectionsByTemplate.has(s.template_id)) sectionsByTemplate.set(s.template_id, []);
    sectionsByTemplate.get(s.template_id).push(s);
  }

  const questionsByTemplate = new Map();
  for (const t of templates) {
    const tplSections = sectionsByTemplate.get(t.id) || [];
    const sectionById = new Map(tplSections.map((s) => [s.id, s]));
    const tplQuestions = questions
      .filter((q) => sectionById.has(q.section_id))
      .map((q) => ({
        id: q.id,
        label: q.label,
        type: q.question_type,
        unit: q.unit,
        sectionId: q.section_id,
        sectionTitle: sectionById.get(q.section_id)?.title || "—",
        sectionOrder: sectionById.get(q.section_id)?.order_index ?? 0,
        questionOrder: q.order_index,
      }))
      .sort((a, b) => a.sectionOrder - b.sectionOrder || a.questionOrder - b.questionOrder);
    questionsByTemplate.set(t.id, tplQuestions);
  }

  const templatesById = new Map(templates.map((t) => [t.id, t]));

  return { questionsByTemplate, templatesById };
}

/**
 * Charge les réponses + leurs answers sous forme de Map<responseId, Map<questionId, valueText>>.
 */
async function loadResponsesWithAnswers(conditions, params) {
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: responses } = await pool.query(
    `SELECT r.id, r.client_uuid, r.status, r.submitted_at, r.synced_at,
            r.started_at, r.gps_latitude, r.gps_longitude, r.gps_accuracy_m,
            r.template_id,
            s.site_code, s.site_name, s.region, s.cluster,
            u.full_name AS technician_name, u.email AS technician_email, u.matricule
     FROM survey_responses r
     JOIN sites s ON s.id = r.site_id
     JOIN users u ON u.id = r.technician_id
     LEFT JOIN survey_templates tpl ON tpl.id = r.template_id
     ${where}
     ORDER BY r.submitted_at DESC NULLS LAST, r.id DESC
     LIMIT 5000`,
    params
  );

  if (responses.length === 0) return { responses, answersByResponse: new Map() };

  const responseIds = responses.map((r) => r.id);
  const { rows: answerRows } = await pool.query(
    `SELECT response_id, question_id,
            value_text, value_number, value_boolean, value_json
     FROM response_answers
     WHERE response_id = ANY($1::uuid[])`,
    [responseIds]
  );

  const answersByResponse = new Map();
  for (const a of answerRows) {
    let val = a.value_text;
    if (val === null && a.value_number !== null) val = a.value_number;
    if (val === null && a.value_boolean !== null) val = a.value_boolean;
    if (val === null && a.value_json !== null) val = a.value_json;
    if (Array.isArray(val)) val = val.join(", ");
    if (val === null || val === undefined) val = "";
    if (!answersByResponse.has(a.response_id)) answersByResponse.set(a.response_id, new Map());
    answersByResponse.get(a.response_id).set(a.question_id, String(val));
  }

  return { responses, answersByResponse };
}

function buildBaseColumns() {
  return [
    { id: "template_name", title: "Form Template", width: 30 },
    { id: "template_category", title: "Form Category", width: 22 },
    { id: "form_version", title: "Form Version", width: 12 },
    { id: "site_code", title: "Site Code", width: 15 },
    { id: "site_name", title: "Site Name", width: 30 },
    { id: "region", title: "Region", width: 20 },
    { id: "cluster", title: "Cluster", width: 15 },
    { id: "technician_name", title: "Technician", width: 25 },
    { id: "technician_matricule", title: "Technician Matricule", width: 18 },
    { id: "technician_email", title: "Technician Email", width: 30 },
    { id: "status", title: "Status", width: 12 },
    { id: "started_at", title: "Started At", width: 22 },
    { id: "submitted_at", title: "Submitted At", width: 22 },
    { id: "synced_at", title: "Synced At", width: 22 },
    { id: "gps_latitude", title: "GPS Latitude", width: 15 },
    { id: "gps_longitude", title: "GPS Longitude", width: 15 },
    { id: "gps_accuracy_m", title: "GPS Accuracy (m)", width: 18 },
    { id: "client_uuid", title: "Response UUID", width: 38 },
  ];
}

function buildBaseRecord(r, tpl) {
  return {
    template_name: tpl?.name || "—",
    template_category: tpl?.category || "—",
    form_version: tpl?.version ?? "—",
    site_code: r.site_code,
    site_name: r.site_name,
    region: r.region || "",
    cluster: r.cluster || "",
    technician_name: r.technician_name,
    technician_matricule: r.matricule || "",
    technician_email: r.technician_email || "",
    status: r.status,
    started_at: r.started_at ? new Date(r.started_at).toISOString() : "",
    submitted_at: r.submitted_at ? new Date(r.submitted_at).toISOString() : "",
    synced_at: r.synced_at ? new Date(r.synced_at).toISOString() : "",
    gps_latitude: r.gps_latitude ?? "",
    gps_longitude: r.gps_longitude ?? "",
    gps_accuracy_m: r.gps_accuracy_m ?? "",
    client_uuid: r.client_uuid,
  };
}

function buildQuestionColumns(questionsByTemplate) {
  const seen = new Set();
  const cols = [];
  for (const [, questions] of questionsByTemplate.entries()) {
    for (const q of questions) {
      const key = `${q.sectionTitle}__${q.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const header = `[${q.sectionTitle}] ${q.label}${q.unit ? ` (${q.unit})` : ""}`;
      cols.push({ id: `q_${q.id}`, title: header, key: q.id, sectionTitle: q.sectionTitle, label: q.label, unit: q.unit });
    }
  }
  return cols;
}

function fillAnswerColumns(record, tplQuestions, answersMap) {
  for (const q of tplQuestions) {
    const value = answersMap.get(q.id) ?? "";
    record[`q_${q.id}`] = value;
  }
}

async function listAllResponses(req, res, next) {
  try {
    const { site_id, technician_id, date_from, date_to, status, search, template_id, template_category } = req.query;
    const conditions = [];
    const params = [];

    if (site_id) { params.push(site_id); conditions.push(`r.site_id = $${params.length}`); }
    if (technician_id) { params.push(technician_id); conditions.push(`r.technician_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
    if (template_id) { params.push(template_id); conditions.push(`r.template_id = $${params.length}`); }
    if (template_category) { params.push(template_category); conditions.push(`tpl.category = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`r.submitted_at >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`r.submitted_at <= $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(s.site_code ILIKE $${params.length} OR s.site_name ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT r.id, r.client_uuid, r.status, r.submitted_at, r.synced_at,
              r.gps_latitude, r.gps_longitude, r.gps_accuracy_m,
              r.template_id,
              tpl.name AS template_name, tpl.category AS template_category, tpl.version AS template_version,
              s.site_code, s.site_name, s.region, s.cluster,
              u.full_name AS technician_name, u.email AS technician_email
       FROM survey_responses r
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       JOIN survey_templates tpl ON tpl.id = r.template_id
       ${where}
       ORDER BY r.submitted_at DESC NULLS LAST
       LIMIT 1000`,
      params
    );

    res.json({ count: rows.length, responses: rows });
  } catch (err) {
    next(err);
  }
}

async function getResponseDetailAdmin(req, res, next) {
  try {
    const { id } = req.params;

    const { rows: responseRows } = await pool.query(
      `SELECT r.*, s.site_code, s.site_name, s.region, s.cluster,
              tpl.name AS template_name, tpl.category AS template_category, tpl.version AS template_version,
              u.full_name AS technician_name, u.email AS technician_email
       FROM survey_responses r
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       JOIN survey_templates tpl ON tpl.id = r.template_id
       WHERE r.id = $1`,
      [id]
    );

    if (responseRows.length === 0) {
      return res.status(404).json({ error: "Réponse introuvable" });
    }

    const { rows: sections } = await pool.query(
      `SELECT id, title, order_index
       FROM survey_sections
       WHERE template_id = $1
       ORDER BY order_index ASC`,
      [responseRows[0].template_id]
    );

    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT id, section_id, label, question_type, unit, is_required, order_index
         FROM survey_questions
         WHERE section_id = ANY($1::uuid[])
         ORDER BY order_index ASC`,
        [sectionIds]
      );
      questions = rows;
    }

    const { rows: answerRows } = await pool.query(
      `SELECT a.*, q.label, q.question_type, q.unit, q.is_required, q.order_index AS q_order, s.title AS section_title, s.order_index AS s_order
       FROM response_answers a
       JOIN survey_questions q ON q.id = a.question_id
       JOIN survey_sections s ON s.id = q.section_id
       WHERE a.response_id = $1
       ORDER BY s.order_index ASC, q.order_index ASC`,
      [id]
    );

    const answers = answerRows.map((a) => {
      let value = a.value_text;
      if (value === null && a.value_number !== null) value = a.value_number;
      if (value === null && a.value_boolean !== null) value = a.value_boolean;
      if (value === null && a.value_json !== null) value = a.value_json;
      return {
        question_id: a.question_id,
        question_label: a.label,
        question_type: a.question_type,
        unit: a.unit,
        is_required: a.is_required,
        section_title: a.section_title,
        value,
      };
    });

    const { rows: media } = await pool.query(
      `SELECT * FROM media_attachments WHERE response_id = $1`,
      [id]
    );

    res.json({ ...responseRows[0], sections, questions, answers, media });
  } catch (err) {
    next(err);
  }
}

async function buildExportData(queryParams) {
  const { questionsByTemplate, templatesById } = await loadAllQuestions();
  const { responses, answersByResponse } = await loadResponsesWithAnswers([], []);
  return { questionsByTemplate, templatesById, responses, answersByResponse };
}

function buildFilterConditions(queryParams) {
  const conditions = [];
  const params = [];
  const { site_id, technician_id, date_from, date_to, status, template_id, template_category } = queryParams || {};
  if (site_id) { params.push(site_id); conditions.push(`r.site_id = $${params.length}`); }
  if (technician_id) { params.push(technician_id); conditions.push(`r.technician_id = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
  if (template_id) { params.push(template_id); conditions.push(`r.template_id = $${params.length}`); }
  if (template_category) { params.push(template_category); conditions.push(`tpl.category = $${params.length}`); }
  if (date_from) { params.push(date_from); conditions.push(`r.submitted_at >= $${params.length}`); }
  if (date_to) { params.push(date_to); conditions.push(`r.submitted_at <= $${params.length}`); }
  return { conditions, params };
}

async function exportCsv(req, res, next) {
  try {
    const { questionsByTemplate, templatesById } = await loadAllQuestions();
    const { conditions, params } = buildFilterConditions(req.query);
    const { responses, answersByResponse } = await loadResponsesWithAnswers(conditions, params);

    const baseCols = buildBaseColumns();
    const questionCols = buildQuestionColumns(questionsByTemplate);
    const allColumns = [...baseCols, ...questionCols];

    const records = responses.map((r) => {
      const record = buildBaseRecord(r, templatesById.get(r.template_id));
      const tplQuestions = questionsByTemplate.get(r.template_id) || [];
      fillAnswerColumns(record, tplQuestions, answersByResponse.get(r.id) || new Map());
      return record;
    });

    const filePath = path.join(process.env.UPLOAD_DIR || "./uploads", `audit-responses-${Date.now()}.csv`);
    const csvWriter = createObjectCsvWriter({ path: filePath, header: allColumns });
    await csvWriter.writeRecords(records);

    res.download(filePath, `audit-responses-${Date.now()}.csv`, (err) => {
      if (err) console.error("[EXPORT] Erreur téléchargement CSV:", err);
      fs.unlink(filePath, () => {});
    });
  } catch (err) {
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const { questionsByTemplate, templatesById } = await loadAllQuestions();
    const { conditions, params } = buildFilterConditions(req.query);
    const { responses, answersByResponse } = await loadResponsesWithAnswers(conditions, params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "TELEINFRA Audit System";
    workbook.created = new Date();

    // === Feuille 1 : Summary (une ligne par réponse) ===
    const summarySheet = workbook.addWorksheet("Responses");
    const baseCols = buildBaseColumns();
    const questionCols = buildQuestionColumns(questionsByTemplate);
    const allColumns = [...baseCols, ...questionCols];

    summarySheet.columns = allColumns.map((c) => ({
      header: c.title,
      key: c.id,
      width: c.width || 20,
    }));

    // Style en-tête
    summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    summarySheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F766E" },
    };
    summarySheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    summarySheet.views = [{ state: "frozen", ySplit: 1 }];

    responses.forEach((r) => {
      const record = buildBaseRecord(r, templatesById.get(r.template_id));
      const tplQuestions = questionsByTemplate.get(r.template_id) || [];
      fillAnswerColumns(record, tplQuestions, answersByResponse.get(r.id) || new Map());
      summarySheet.addRow(record);
    });

    // === Feuille 2 : Toutes les réponses détaillées (long format) ===
    const detailSheet = workbook.addWorksheet("Detailed Answers");
    detailSheet.columns = [
      { header: "Form Template", key: "template_name", width: 30 },
      { header: "Form Category", key: "template_category", width: 22 },
      { header: "Site Code", key: "site_code", width: 15 },
      { header: "Site Name", key: "site_name", width: 30 },
      { header: "Technician", key: "technician_name", width: 25 },
      { header: "Section", key: "section_title", width: 25 },
      { header: "Question", key: "question_label", width: 40 },
      { header: "Question Type", key: "question_type", width: 15 },
      { header: "Unit", key: "unit", width: 10 },
      { header: "Answer", key: "answer_value", width: 50 },
      { header: "Submitted At", key: "submitted_at", width: 22 },
    ];
    detailSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    detailSheet.getRow(1).fill = {
      type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" },
    };
    detailSheet.views = [{ state: "frozen", ySplit: 1 }];

    const { rows: detailRows } = await pool.query(
      `SELECT r.id AS response_id, r.submitted_at, r.template_id,
              tpl.name AS template_name, tpl.category AS template_category,
              s.site_code, s.site_name, u.full_name AS technician_name,
              sec.title AS section_title, sec.order_index AS s_order,
              q.id AS question_id, q.label AS question_label, q.question_type, q.unit, q.order_index AS q_order,
              a.value_text, a.value_number, a.value_boolean, a.value_json
       FROM response_answers a
       JOIN survey_responses r ON r.id = a.response_id
       JOIN survey_templates tpl ON tpl.id = r.template_id
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       JOIN survey_questions q ON q.id = a.question_id
       JOIN survey_sections sec ON sec.id = q.section_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY r.submitted_at DESC NULLS LAST, sec.order_index ASC, q.order_index ASC
       LIMIT 20000`,
      params
    );

    detailRows.forEach((row) => {
      let val = row.value_text;
      if (val === null && row.value_number !== null) val = row.value_number;
      if (val === null && row.value_boolean !== null) val = row.value_boolean;
      if (val === null && row.value_json !== null) val = row.value_json;
      if (Array.isArray(val)) val = val.join(", ");
      if (val === null || val === undefined) val = "";
      detailSheet.addRow({
        template_name: row.template_name,
        template_category: row.template_category,
        site_code: row.site_code,
        site_name: row.site_name,
        technician_name: row.technician_name,
        section_title: row.section_title,
        question_label: row.question_label,
        question_type: row.question_type,
        unit: row.unit || "",
        answer_value: String(val),
        submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : "",
      });
    });

    const filePath = path.join(process.env.UPLOAD_DIR || "./uploads", `audit-responses-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, `audit-responses-${Date.now()}.xlsx`, (err) => {
      if (err) console.error("[EXPORT] Erreur téléchargement Excel:", err);
      fs.unlink(filePath, () => {});
    });
  } catch (err) {
    next(err);
  }
}

async function emailExport(req, res, next) {
  try {
    const { to, format, site_id, technician_id, date_from, date_to, status, template_id, template_category } = req.body;
    const recipient = to || process.env.SUPPORT_EMAIL || req.user.email;

    if (!recipient) {
      return res.status(400).json({ error: "Aucun destinataire spécifié." });
    }

    const { questionsByTemplate, templatesById } = await loadAllQuestions();
    const { conditions, params } = buildFilterConditions({ site_id, technician_id, date_from, date_to, status, template_id, template_category });
    const { responses, answersByResponse } = await loadResponsesWithAnswers(conditions, params);

    if (responses.length === 0) {
      return res.status(400).json({ error: "Aucune donnée à exporter pour les filtres sélectionnés." });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `audit-responses-${timestamp}`;

    let attachmentPath = null;
    let contentType = "text/csv";

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "TELEINFRA Audit System";
      workbook.created = new Date();

      const baseCols = buildBaseColumns();
      const questionCols = buildQuestionColumns(questionsByTemplate);
      const allColumns = [...baseCols, ...questionCols];

      // Feuille Responses (wide format)
      const sheet = workbook.addWorksheet("Responses");
      sheet.columns = allColumns.map((c) => ({ header: c.title, key: c.id, width: c.width || 20 }));
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      responses.forEach((r) => {
        const record = buildBaseRecord(r, templatesById.get(r.template_id));
        const tplQuestions = questionsByTemplate.get(r.template_id) || [];
        fillAnswerColumns(record, tplQuestions, answersByResponse.get(r.id) || new Map());
        sheet.addRow(record);
      });

      // Feuille Detailed Answers (long format)
      const detailSheet = workbook.addWorksheet("Detailed Answers");
      detailSheet.columns = [
        { header: "Form Template", key: "template_name", width: 30 },
        { header: "Form Category", key: "template_category", width: 22 },
        { header: "Site Code", key: "site_code", width: 15 },
        { header: "Site Name", key: "site_name", width: 30 },
        { header: "Technician", key: "technician_name", width: 25 },
        { header: "Section", key: "section_title", width: 25 },
        { header: "Question", key: "question_label", width: 40 },
        { header: "Answer", key: "answer_value", width: 50 },
        { header: "Submitted At", key: "submitted_at", width: 22 },
      ];
      detailSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      detailSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      detailSheet.views = [{ state: "frozen", ySplit: 1 }];

      const { rows: detailRows } = await pool.query(
        `SELECT r.submitted_at, tpl.name AS template_name, tpl.category AS template_category,
                s.site_code, s.site_name, u.full_name AS technician_name,
                sec.title AS section_title, sec.order_index AS s_order,
                q.label AS question_label, q.order_index AS q_order,
                a.value_text, a.value_number, a.value_boolean, a.value_json
         FROM response_answers a
         JOIN survey_responses r ON r.id = a.response_id
         JOIN survey_templates tpl ON tpl.id = r.template_id
         JOIN sites s ON s.id = r.site_id
         JOIN users u ON u.id = r.technician_id
         JOIN survey_questions q ON q.id = a.question_id
         JOIN survey_sections sec ON sec.id = q.section_id
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
         ORDER BY r.submitted_at DESC NULLS LAST, sec.order_index ASC, q.order_index ASC
         LIMIT 20000`,
        params
      );

      detailRows.forEach((row) => {
        let val = row.value_text;
        if (val === null && row.value_number !== null) val = row.value_number;
        if (val === null && row.value_boolean !== null) val = row.value_boolean;
        if (val === null && row.value_json !== null) val = row.value_json;
        if (Array.isArray(val)) val = val.join(", ");
        if (val === null || val === undefined) val = "";
        detailSheet.addRow({
          template_name: row.template_name,
          template_category: row.template_category,
          site_code: row.site_code,
          site_name: row.site_name,
          technician_name: row.technician_name,
          section_title: row.section_title,
          question_label: row.question_label,
          answer_value: String(val),
          submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : "",
        });
      });

      attachmentPath = path.join(process.env.UPLOAD_DIR || "./uploads", `${fileName}.xlsx`);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      await workbook.xlsx.writeFile(attachmentPath);
    } else {
      const baseCols = buildBaseColumns();
      const questionCols = buildQuestionColumns(questionsByTemplate);
      const allColumns = [...baseCols, ...questionCols];

      const records = responses.map((r) => {
        const record = buildBaseRecord(r, templatesById.get(r.template_id));
        const tplQuestions = questionsByTemplate.get(r.template_id) || [];
        fillAnswerColumns(record, tplQuestions, answersByResponse.get(r.id) || new Map());
        return record;
      });

      attachmentPath = path.join(process.env.UPLOAD_DIR || "./uploads", `${fileName}.csv`);
      const csvWriter = createObjectCsvWriter({ path: attachmentPath, header: allColumns });
      await csvWriter.writeRecords(records);
    }

    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: String(process.env.EMAIL_USE_SSL).toLowerCase() === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: recipient,
      subject: `Export audits TELEINFRA — ${responses.length} réponse(s)`,
      text: `Bonjour,\n\nVeuillez trouver en pièce jointe l'export détaillé des audits.\n\nNombre de réponses : ${responses.length}\nDate d'export : ${new Date().toLocaleString()}\n\nCordialement,\nSystème Audit Pylône TELEINFRA`,
      html: `
        <p>Bonjour,</p>
        <p>Veuillez trouver en pièce jointe l'export détaillé des audits.</p>
        <p><strong>Nombre de réponses :</strong> ${responses.length}</p>
        <p><strong>Date d'export :</strong> ${new Date().toLocaleString()}</p>
        <p>L'export contient toutes les réponses aux questions pour chaque audit, avec les métadonnées du site, du technicien et du formulaire utilisé.</p>
        <p>Cordialement,<br>Système Audit Pylône TELEINFRA</p>
      `,
      attachments: [
        {
          filename: `${fileName}.${format === "excel" ? "xlsx" : "csv"}`,
          path: attachmentPath,
          contentType,
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    fs.unlink(attachmentPath, () => {});

    res.json({ message: `Export détaillé envoyé par e-mail à ${recipient}.`, count: responses.length });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAllResponses,
  getResponseDetailAdmin,
  exportCsv,
  exportExcel,
  emailExport,
};
