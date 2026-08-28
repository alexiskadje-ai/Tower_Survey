const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { listSites, createSite, getCompletionStatus } = require("../controllers/sites.controller");

router.use(requireAuth);

router.get("/", listSites);
router.get("/completion-status", getCompletionStatus);
router.post("/", requireRole("admin", "supervisor"), createSite);

module.exports = router;
