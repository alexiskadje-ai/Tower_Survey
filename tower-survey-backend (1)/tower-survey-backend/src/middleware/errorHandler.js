function errorHandler(err, req, res, next) {
  console.error("[ERROR]", err);

  // Violation de contrainte UNIQUE PostgreSQL (ex: doublon client_uuid)
  if (err.code === "23505") {
    return res.status(409).json({ error: "Ressource déjà existante (conflit d'unicité)" });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Erreur interne du serveur",
  });
}

module.exports = errorHandler;
