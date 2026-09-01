const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const { requireAuth } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");
const {
  createSession,
  attachSiteToSession,
  postCheckin,
  verifySecondTechnician,
  getSessionStatus,
} = require("../controllers/checkin.controller");

router.use(requireAuth);

// Limiteur spécifique pour la vérification du second technicien :
// c'est un second point d'entrée d'authentification, on veut
// bloquer le brute-force sans pénaliser le reste de l'app.
const verifyRateLimit = createRateLimiter({ windowMs: 60_000, max: 5 });

// Multer partagé avec responses.routes : disque dans UPLOAD_DIR,
// nom unique horodaté, limite = MAX_UPLOAD_MB.
const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || "./uploads",
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `checkin-${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024 },
});

// Création / récupération d'une session (idempotent sur client_uuid)
router.post("/session", createSession);
router.patch("/session/:sessionId", attachSiteToSession);
router.get("/session/:sessionId", getSessionStatus);

// Check-in photo + GPS (multipart)
router.post("/", upload.single("file"), postCheckin);

// Vérification du second technicien — pas de JWT émis, juste un preuve d'identité
router.post("/verify-second-technician", verifyRateLimit, verifySecondTechnician);

module.exports = router;
