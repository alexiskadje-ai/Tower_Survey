const pool = require("../config/db");
const { sendOtpEmail } = require("../utils/email");
const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");
const ExcelJS = require("exceljs");

async function listAllResponses(req, res, next) {
  try {
    const { site_id, technician_id, date_from, date_to, status, search } = req.query;
    const conditions = [];
    const params = [];

    if (site_id) { params.push(site_id); conditions.push(`r.site_id = $${params.length}`); }
    if (technician_id) { params.push(technician_id); conditions.push(`r.technician_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
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
              s.site_code, s.site_name, s.region, s.cluster,
              u.full_name AS technician_name, u.email AS technician_email
       FROM survey_responses r
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       ${where}
       ORDER BY r.submitted_at DESC
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
              u.full_name AS technician_name, u.email AS technician_email
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
      `SELECT a.*, q.label, q.question_type, q.unit, q.is_required
       FROM response_answers a
       JOIN survey_questions q ON q.id = a.question_id
       WHERE a.response_id = $1
       ORDER BY q.order_index ASC`,
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

async function exportCsv(req, res, next) {
  try {
    const { site_id, technician_id, date_from, date_to, status } = req.query;
    const conditions = [];
    const params = [];

    if (site_id) { params.push(site_id); conditions.push(`r.site_id = $${params.length}`); }
    if (technician_id) { params.push(technician_id); conditions.push(`r.technician_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`r.submitted_at >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`r.submitted_at <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT r.id, r.client_uuid, r.status, r.submitted_at, r.synced_at,
              r.gps_latitude, r.gps_longitude, r.gps_accuracy_m,
              s.site_code, s.site_name, s.region, s.cluster,
              u.full_name AS technician_name
       FROM survey_responses r
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       ${where}
       ORDER BY r.submitted_at DESC`,
      params
    );

    const csvWriter = createObjectCsvWriter({
      path: path.join(process.env.UPLOAD_DIR || "./uploads", `responses-export-${Date.now()}.csv`),
      header: [
        { id: "site_code", title: "Site Code" },
        { id: "site_name", title: "Site Name" },
        { id: "region", title: "Region" },
        { id: "cluster", title: "Cluster" },
        { id: "technician_name", title: "Technician" },
        { id: "status", title: "Status" },
        { id: "submitted_at", title: "Submitted At" },
        { id: "synced_at", title: "Synced At" },
        { id: "gps_latitude", title: "GPS Latitude" },
        { id: "gps_longitude", title: "GPS Longitude" },
        { id: "gps_accuracy_m", title: "GPS Accuracy (m)" },
      ],
    });

    await csvWriter.writeRecords(rows.map((r) => ({
      site_code: r.site_code,
      site_name: r.site_name,
      region: r.region,
      cluster: r.cluster,
      technician_name: r.technician_name,
      status: r.status,
      submitted_at: r.submitted_at,
      synced_at: r.synced_at,
      gps_latitude: r.gps_latitude,
      gps_longitude: r.gps_longitude,
      gps_accuracy_m: r.gps_accuracy_m,
    })));

    res.json({ message: "CSV export generated successfully.", format: "csv" });
  } catch (err) {
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const { site_id, technician_id, date_from, date_to, status } = req.query;
    const conditions = [];
    const params = [];

    if (site_id) { params.push(site_id); conditions.push(`r.site_id = $${params.length}`); }
    if (technician_id) { params.push(technician_id); conditions.push(`r.technician_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`r.submitted_at >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`r.submitted_at <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT r.id, r.client_uuid, r.status, r.submitted_at, r.synced_at,
              r.gps_latitude, r.gps_longitude, r.gps_accuracy_m,
              s.site_code, s.site_name, s.region, s.cluster,
              u.full_name AS technician_name
       FROM survey_responses r
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       ${where}
       ORDER BY r.submitted_at DESC`,
      params
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Responses");

    sheet.columns = [
      { header: "Site Code", key: "site_code", width: 15 },
      { header: "Site Name", key: "site_name", width: 30 },
      { header: "Region", key: "region", width: 20 },
      { header: "Cluster", key: "cluster", width: 15 },
      { header: "Technician", key: "technician_name", width: 25 },
      { header: "Status", key: "status", width: 12 },
      { header: "Submitted At", key: "submitted_at", width: 22 },
      { header: "Synced At", key: "synced_at", width: 22 },
      { header: "GPS Latitude", key: "gps_latitude", width: 15 },
      { header: "GPS Longitude", key: "gps_longitude", width: 15 },
      { header: "GPS Accuracy (m)", key: "gps_accuracy_m", width: 18 },
    ];

    rows.forEach((r) => sheet.addRow({
      site_code: r.site_code,
      site_name: r.site_name,
      region: r.region,
      cluster: r.cluster,
      technician_name: r.technician_name,
      status: r.status,
      submitted_at: r.submitted_at,
      synced_at: r.synced_at,
      gps_latitude: r.gps_latitude,
      gps_longitude: r.gps_longitude,
      gps_accuracy_m: r.gps_accuracy_m,
    }));

    const filePath = path.join(process.env.UPLOAD_DIR || "./uploads", `responses-export-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(filePath);

    res.json({ message: "Excel export generated successfully.", format: "excel" });
  } catch (err) {
    next(err);
  }
}

async function emailExport(req, res, next) {
  try {
    const { to, format, site_id, technician_id, date_from, date_to, status } = req.body;
    const recipient = to || process.env.SUPPORT_EMAIL || req.user.email;

    if (!recipient) {
      return res.status(400).json({ error: "Aucun destinataire spécifié." });
    }

    const conditions = [];
    const params = [];

    if (site_id) { params.push(site_id); conditions.push(`r.site_id = $${params.length}`); }
    if (technician_id) { params.push(technician_id); conditions.push(`r.technician_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`r.submitted_at >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`r.submitted_at <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT r.id, r.client_uuid, r.status, r.submitted_at, r.synced_at,
              r.gps_latitude, r.gps_longitude, r.gps_accuracy_m,
              s.site_code, s.site_name, s.region, s.cluster,
              u.full_name AS technician_name
       FROM survey_responses r
       JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = r.technician_id
       ${where}
       ORDER BY r.submitted_at DESC
       LIMIT 1000`,
      params
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "Aucune donnée à exporter pour les filtres sélectionnés." });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `responses-export-${timestamp}`;

    let attachmentPath = null;
    let contentType = "text/csv";

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Responses");
      sheet.columns = [
        { header: "Site Code", key: "site_code", width: 15 },
        { header: "Site Name", key: "site_name", width: 30 },
        { header: "Region", key: "region", width: 20 },
        { header: "Cluster", key: "cluster", width: 15 },
        { header: "Technician", key: "technician_name", width: 25 },
        { header: "Status", key: "status", width: 12 },
        { header: "Submitted At", key: "submitted_at", width: 22 },
        { header: "Synced At", key: "synced_at", width: 22 },
        { header: "GPS Latitude", key: "gps_latitude", width: 15 },
        { header: "GPS Longitude", key: "gps_longitude", width: 15 },
        { header: "GPS Accuracy (m)", key: "gps_accuracy_m", width: 18 },
      ];
      rows.forEach((r) => sheet.addRow({
        site_code: r.site_code,
        site_name: r.site_name,
        region: r.region,
        cluster: r.cluster,
        technician_name: r.technician_name,
        status: r.status,
        submitted_at: r.submitted_at,
        synced_at: r.synced_at,
        gps_latitude: r.gps_latitude,
        gps_longitude: r.gps_longitude,
        gps_accuracy_m: r.gps_accuracy_m,
      }));
      attachmentPath = path.join(process.env.UPLOAD_DIR || "./uploads", `${fileName}.xlsx`);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      await workbook.xlsx.writeFile(attachmentPath);
    } else {
      const csvWriter = createObjectCsvWriter({
        path: path.join(process.env.UPLOAD_DIR || "./uploads", `${fileName}.csv`),
        header: [
          { id: "site_code", title: "Site Code" },
          { id: "site_name", title: "Site Name" },
          { id: "region", title: "Region" },
          { id: "cluster", title: "Cluster" },
          { id: "technician_name", title: "Technician" },
          { id: "status", title: "Status" },
          { id: "submitted_at", title: "Submitted At" },
          { id: "synced_at", title: "Synced At" },
          { id: "gps_latitude", title: "GPS Latitude" },
          { id: "gps_longitude", title: "GPS Longitude" },
          { id: "gps_accuracy_m", title: "GPS Accuracy (m)" },
        ],
      });
      await csvWriter.writeRecords(rows.map((r) => ({
        site_code: r.site_code,
        site_name: r.site_name,
        region: r.region,
        cluster: r.cluster,
        technician_name: r.technician_name,
        status: r.status,
        submitted_at: r.submitted_at,
        synced_at: r.synced_at,
        gps_latitude: r.gps_latitude,
        gps_longitude: r.gps_longitude,
        gps_accuracy_m: r.gps_accuracy_m,
      })));
      attachmentPath = path.join(process.env.UPLOAD_DIR || "./uploads", `${fileName}.csv`);
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: recipient,
      subject: `Export des réponses d'audit - ${rows.length} enregistrements`,
      text: `Bonjour,\n\nVeuillez trouver en pièce jointe l'export des réponses d'audit.\n\nNombre d'enregistrements: ${rows.length}\nDate d'export: ${new Date().toLocaleString()}\n\nCordialement,\nSystème Audit Pylône TELEINFRA`,
      html: `
        <p>Bonjour,</p>
        <p>Veuillez trouver en pièce jointe l'export des réponses d'audit.</p>
        <p><strong>Nombre d'enregistrements:</strong> ${rows.length}</p>
        <p><strong>Date d'export:</strong> ${new Date().toLocaleString()}</p>
        <p>Cordialement,<br>Système Audit Pylône TELEINFRA</p>
      `,
      attachments: [
        {
          filename: `${fileName}.${format === "excel" ? "xlsx" : "csv"}`,
          path: attachmentPath,
          contentType: contentType,
        },
      ],
    };

    await sendOtpEmail({ to: recipient, fullName: "Admin", otp: "" });
    // Reuse the transporter directly for email export
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

    await transporter.sendMail(mailOptions);

    res.json({ message: `Export envoyé par e-mail à ${recipient}.`, count: rows.length });
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
