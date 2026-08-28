/**
 * Service email générique (nodemailer) — notifications post-soumission.
 *
 * Règles d'or :
 *  - Si SMTP_HOST est vide / non configuré → no-op (log) ; ne JAMAIS planter.
 *  - sendEmail() ne throw JAMAIS. Toute erreur SMTP est loggée et la promesse
 *    résout à { sent: false, reason }. Même philosophie que le push ServiceNow
 *    fire-and-forget : on n'impacte jamais la réponse HTTP de la sync.
 */
const nodemailer = require("nodemailer");
require("dotenv").config();

let transporter = null;
let smtpConfigured = false;

function init() {
  if (transporter) return;
  const host = (process.env.SMTP_HOST || "").trim();
  if (!host) {
    smtpConfigured = false;
    return;
  }
  smtpConfigured = true;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const secure = port === 465;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    tls: { rejectUnauthorized: false },
  });
}

init();

function isConfigured() {
  return smtpConfigured;
}

/**
 * Envoie un email HTML.
 * @param {string|string[]} to
 * @param {string} subject
 * @param {string} html
 * @param {string} [text] version plain-text fallback
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
async function sendEmail(to, subject, html, text) {
  try {
    if (!isConfigured()) {
      console.log("[EMAIL] email non configuré (SMTP_HOST vide) — ignoré:", subject);
      return { sent: false, reason: "not_configured" };
    }
    if (!to || (Array.isArray(to) && to.length === 0)) {
      return { sent: false, reason: "no_recipient" };
    }
    const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || "no-reply@teleinfra-cm.com";
    const info = await transporter.sendMail({
      from,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html,
      text: text || (html ? html.replace(/<[^>]+>/g, "") : ""),
    });
    console.log(`[EMAIL] envoyé à ${Array.isArray(to) ? to.join(", ") : to} — ${subject} (id=${info.messageId})`);
    return { sent: true };
  } catch (err) {
    console.error("[EMAIL] erreur envoi:", err.message);
    return { sent: false, reason: err.message };
  }
}

/**
 * Liste d'admins à notifier (issue de ADMIN_NOTIFICATION_EMAILS).
 * Retourne [] si non configuré.
 */
function getAdminRecipients() {
  const raw = (process.env.ADMIN_NOTIFICATION_EMAILS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = { sendEmail, isConfigured, getAdminRecipients };
