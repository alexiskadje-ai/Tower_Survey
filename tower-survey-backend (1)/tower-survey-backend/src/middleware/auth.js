const { verifyToken } = require("../utils/jwt");

/**
 * Vérifie le token Bearer et attache req.user = { id, role, orgId }
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
 * Restreint l'accès à certains rôles.
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

module.exports = { requireAuth, requireRole };
