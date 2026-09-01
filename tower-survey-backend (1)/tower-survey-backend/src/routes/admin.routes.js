const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const {
  listAllResponses,
  getResponseDetailAdmin,
  exportCsv,
  exportExcel,
  emailExport,
  listUsers,
  updateUserRole,
  listRecentCheckins,
} = require("../controllers/admin.controller");

// Tout ce qui suit exige un admin ACTIF (re-vérifié en DB à chaque
// requête — un user promu récemment n'a pas besoin de se reconnecter).
router.use(requireAuth);
router.use(requireAdmin);

router.get("/responses", listAllResponses);
router.get("/responses/:id", getResponseDetailAdmin);
router.get("/responses/export/csv", exportCsv);
router.get("/responses/export/excel", exportExcel);
router.post("/responses/email", emailExport);

// Gestion des utilisateurs
router.get("/users", listUsers);
router.patch("/users/:userId/role", updateUserRole);

// Monitoring check-ins (polling)
router.get("/checkins/recent", listRecentCheckins);

module.exports = router;
