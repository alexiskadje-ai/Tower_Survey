const { verifyToken } = require("../utils/jwt");
const pool = require("../config/db");

/**
 * Vérifie le token Bearer et attache req.user = { id, role, orgId, fullName }
 * (claims déjà signés dans le JWT au login).
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token manquant" });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

/**
 * Restreint l'accès à certains rôles, lus depuis req.user.role
 * (claim JWT — ne reflète pas forcément un changement de rôle récent).
 * Usage : requireRole("admin", "supervisor")
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès refusé pour ce rôle" });
    }
    next();
  };
}

/**
 * Re-lit l'utilisateur courant depuis la base pour rafraîchir
 * `role` et `is_active` (et écraser les claims JWT obsolètes).
 *
 * Pourquoi : si un admin promeut quelqu'un via PATCH /admin/users/.../role,
 * on veut que la nouvelle权限 prenne effet SANS forcer un logout/login.
 * Coût : 1 SELECT petit par requête — acceptable pour /api/admin/*.
 *
 * Comportement :
 *   - 401 si le user JWT n'existe plus en base
 *   - 403 si is_active=false (compte désactivé)
 *   - sinon : req.user.role = (db.role) et req.user.is_active = (db.is_active)
 */
async function attachFreshUser(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "Session invalide" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, org_id, role, is_active FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    const u = rows[0];
    if (!u) return res.status(401).json({ error: "Compte introuvable" });
    if (!u.is_active) return res.status(403).json({ error: "Compte désactivé" });

    // Le rôle de la DB est la source de vérité.
    req.user.role = u.role;
    req.user.orgId = u.org_id;
    req.user.is_active = u.is_active;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware composite admin : requireAuth + attachFreshUser + role==='admin'.
 * Refus 401/403 explicites avec messages en français.
 */
async function requireAdmin(req, res, next) {
  // requireAuth est censé avoir été appelé en amont dans la chaîne
  if (!req.user) {
    return res.status(401).json({ error: "Authentification requise" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, org_id, role, is_active FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    const u = rows[0];
    if (!u) return res.status(401).json({ error: "Compte introuvable" });
    if (!u.is_active) return res.status(403).json({ error: "Compte désactivé" });

    if (u.role !== "admin") {
      return res.status(403).json({ error: "Réservé aux administrateurs" });
    }

    req.user.role = u.role;
    req.user.orgId = u.org_id;
    req.user.is_active = u.is_active;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, requireRole, requireAdmin, attachFreshUser };
