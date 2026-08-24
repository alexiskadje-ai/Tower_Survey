const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { listSites, createSite } = require("../controllers/sites.controller");

router.use(requireAuth);

router.get("/", listSites);
router.post("/", requireRole("admin", "supervisor"), createSite);

module.exports = router;
