const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  listAllResponses,
  getResponseDetailAdmin,
  exportCsv,
  exportExcel,
  emailExport,
} = require("../controllers/admin.controller");

router.use(requireAuth);
router.use(requireRole("admin"));

router.get("/responses", listAllResponses);

router.get("/responses/:id", getResponseDetailAdmin);

router.get("/responses/export/csv", exportCsv);

router.get("/responses/export/excel", exportExcel);

router.post("/responses/email", emailExport);

module.exports = router;
