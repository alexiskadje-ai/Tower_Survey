const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const { requireAuth } = require("../middleware/auth");
const { syncResponses, listResponses, getResponseDetail } = require("../controllers/responses.controller");
const { uploadMedia } = require("../controllers/media.controller");

router.use(requireAuth);

const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || "./uploads",
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024 },
});

router.post("/sync", syncResponses);
router.get("/", listResponses);
router.get("/:id", getResponseDetail);
router.post("/:id/media", upload.single("file"), uploadMedia);

module.exports = router;
