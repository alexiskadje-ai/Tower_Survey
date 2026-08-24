const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { signToken } = require("../utils/jwt");
const { sendOtpEmail } = require("../utils/email");

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function register(req, res, next) {
  try {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: "full_name, email et mot de passe sont requis" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
    }

    const { rows: existing } = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Cet e-mail est déjà utilisé" });
    }

    let { rows: orgRows } = await pool.query("SELECT id FROM organizations LIMIT 1");
    let orgId;
    if (orgRows.length === 0) {
      const { rows } = await pool.query(
        "INSERT INTO organizations (name) VALUES ('TELEINFRA Cameroon') RETURNING id"
      );
      orgId = rows[0].id;
    } else {
      orgId = orgRows[0].id;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows: userRows } = await pool.query(
      `INSERT INTO users (org_id, full_name, email, password_hash, role, is_email_verified)
       VALUES ($1, $2, $3, $4, 'technician', false)
       RETURNING id, full_name, email, role, is_email_verified`,
      [orgId, full_name, email, passwordHash]
    );

    const user = userRows[0];
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO email_verifications (user_id, otp_code, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, otp, expiresAt]
    );

    const emailSent = await sendOtpEmail({ to: email, fullName: full_name, otp });

    res.status(201).json({
      message: "Compte créé. Vérifie ta boîte mail pour le code OTP.",
      user: { id: user.id, full_name: user.full_name, email: user.email },
      email_sent: emailSent,
    });
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "email et otp sont requis" });
    }

    const { rows: userRows } = await pool.query(
      "SELECT id, is_email_verified FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const user = userRows[0];

    if (user.is_email_verified) {
      return res.status(400).json({ error: "E-mail déjà vérifié" });
    }

    const { rows: verificationRows } = await pool.query(
      `SELECT id, expires_at, used FROM email_verifications
       WHERE user_id = $1 AND otp_code = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id, otp]
    );

    if (verificationRows.length === 0) {
      return res.status(400).json({ error: "Code OTP invalide" });
    }

    const verification = verificationRows[0];

    if (verification.used) {
      return res.status(400).json({ error: "Code OTP déjà utilisé" });
    }

    if (new Date() > new Date(verification.expires_at)) {
      return res.status(400).json({ error: "Code OTP expiré" });
    }

    await pool.query("BEGIN");
    try {
      await pool.query("UPDATE email_verifications SET used = true WHERE id = $1", [verification.id]);
      await pool.query("UPDATE users SET is_email_verified = true WHERE id = $1", [user.id]);
      await pool.query("COMMIT");
    } catch (txErr) {
      await pool.query("ROLLBACK");
      throw txErr;
    }

    res.json({ message: "E-mail vérifié avec succès. Tu peux maintenant te connecter." });
  } catch (err) {
    next(err);
  }
}

async function resendOtp(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email est requis" });
    }

    const { rows: userRows } = await pool.query(
      "SELECT id, full_name, is_email_verified FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const user = userRows[0];

    if (user.is_email_verified) {
      return res.status(400).json({ error: "E-mail déjà vérifié" });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO email_verifications (user_id, otp_code, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, otp, expiresAt]
    );

    const emailSent = await sendOtpEmail({ to: email, fullName: user.full_name, otp });

    res.json({ message: "Un nouveau code a été envoyé.", email_sent: emailSent });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email est requis" });
    }

    const { rows: userRows } = await pool.query(
      "SELECT id, full_name, is_email_verified FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "Aucun compte associé à cet e-mail." });
    }

    const user = userRows[0];

    if (!user.is_email_verified) {
      return res.status(400).json({ error: "E-mail non vérifié. Vérifie ta boîte mail pour valider ton compte." });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO password_resets (user_id, otp_code, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, otp, expiresAt]
    );

    const emailSent = await sendOtpEmail({
      to: email,
      fullName: user.full_name,
      otp,
    });

    res.json({ message: "Si un compte existe, un code de réinitialisation a été envoyé.", email_sent: emailSent });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { email, otp, new_password, confirm_password } = req.body;

    if (!email || !otp || !new_password || !confirm_password) {
      return res.status(400).json({ error: "email, otp, nouveau mot de passe et confirmation sont requis" });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ error: "Les mots de passe ne correspondent pas" });
    }

    const { rows: userRows } = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const user = userRows[0];

    const { rows: resetRows } = await pool.query(
      `SELECT id, expires_at, used FROM password_resets
       WHERE user_id = $1 AND otp_code = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id, otp]
    );

    if (resetRows.length === 0) {
      return res.status(400).json({ error: "Code de réinitialisation invalide" });
    }

    const reset = resetRows[0];

    if (reset.used) {
      return res.status(400).json({ error: "Code déjà utilisé" });
    }

    if (new Date() > new Date(reset.expires_at)) {
      return res.status(400).json({ error: "Code expiré" });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);

    await pool.query("BEGIN");
    try {
      await pool.query("UPDATE password_resets SET used = true WHERE id = $1", [reset.id]);
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, user.id]);
      await pool.query("COMMIT");
    } catch (txErr) {
      await pool.query("ROLLBACK");
      throw txErr;
    }

    res.json({ message: "Mot de passe réinitialisé avec succès. Tu peux te connecter." });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { matricule, email, password } = req.body;
    const identifier = matricule || email;

    if (!identifier || !password) {
      return res.status(400).json({ error: "Identifiant (matricule/email) et mot de passe requis" });
    }

    const { rows } = await pool.query(
      `SELECT id, org_id, full_name, matricule, role, password_hash, is_active, is_email_verified
       FROM users
       WHERE matricule = $1 OR email = $1
       LIMIT 1`,
      [identifier]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    if (!user.is_email_verified) {
      return res.status(403).json({ error: "E-mail non vérifié. Vérifie ta boîte mail pour valider ton compte." });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const token = signToken({
      id: user.id,
      orgId: user.org_id,
      role: user.role,
      fullName: user.full_name,
    });

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        matricule: user.matricule,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, verifyOtp, resendOtp, forgotPassword, resetPassword, login };
