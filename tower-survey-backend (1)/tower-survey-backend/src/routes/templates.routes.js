const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { getActiveTemplates } = require("../controllers/templates.controller");

router.use(requireAuth);

router.get("/active", getActiveTemplates);

module.exports = router;
