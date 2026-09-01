/**
 * Rate limiter in-memory ultra léger, par IP, pour les endpoints
 * sensibles (typiquement l'authentification d'un second technicien).
 *
 * Pas de dépendance externe. Suffisant pour un serveur mono-instance.
 * Pour un déploiement multi-instance, remplacer par Redis.
 *
 * @param {object} opts
 * @param {number} opts.windowMs    Fenêtre glissante en ms
 * @param {number} opts.max         Nombre max d'appels par IP dans la fenêtre
 * @param {(req)=>string} [opts.key]  Clé de groupement (par défaut l'IP)
 */
function createRateLimiter({ windowMs, max, key }) {
  const buckets = new Map(); // key -> { count, resetAt }

  function getKey(req) {
    if (key) return key(req);
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) {
      return xff.split(",")[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || "unknown";
  }

  return function rateLimit(req, res, next) {
    const k = getKey(req);
    const now = Date.now();
    const b = buckets.get(k);

    if (!b || b.resetAt <= now) {
      buckets.set(k, { count: 1, resetAt: now + windowMs });
      return next();
    }
    b.count += 1;
    if (b.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: "Trop de tentatives. Réessaie dans quelques secondes." });
    }
    next();
  };
}

module.exports = { createRateLimiter };
