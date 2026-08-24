const nodemailer = require("nodemailer");
require("dotenv").config();

const useSsl = String(process.env.EMAIL_USE_SSL).toLowerCase() === "true";
const useTls = String(process.env.EMAIL_USE_TLS).toLowerCase() === "true";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: useSsl,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: useTls
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
});

async function sendOtpEmail({ to, fullName, otp }) {
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: "Code de vérification — Audit Pylône TELEINFRA",
    text: `Bonjour ${fullName},\n\nVotre code de vérification est : ${otp}\n\nIl expire dans 10 minutes.\n\nSi vous n'avez pas demandé ce code, ignorez cet e-mail.`,
    html: `
      <p>Bonjour <strong>${fullName}</strong>,</p>
      <p>Votre code de vérification est : <strong style="font-size:1.5em;letter-spacing:0.1em;">${otp}</strong></p>
      <p>Il expire dans <strong>10 minutes</strong>.</p>
      <p>Si vous n'avez pas demandé ce code, ignorez cet e-mail.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error("[EMAIL] Erreur envoi OTP:", err);
    return false;
  }
}

module.exports = { sendOtpEmail };
