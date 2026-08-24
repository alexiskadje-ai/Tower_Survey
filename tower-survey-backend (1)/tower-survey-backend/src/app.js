const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const sitesRoutes = require("./routes/sites.routes");
const templatesRoutes = require("./routes/templates.routes");
const responsesRoutes = require("./routes/responses.routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));

// Photos servies statiquement (V1 — passera sur S3/MinIO en V2)
app.use("/uploads", express.static(path.join(__dirname, "..", process.env.UPLOAD_DIR || "uploads")));

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/responses", responsesRoutes);

app.use((req, res) => res.status(404).json({ error: "Route introuvable" }));
app.use(errorHandler);

module.exports = app;
