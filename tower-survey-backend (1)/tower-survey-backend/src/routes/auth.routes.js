const router = require("express").Router();
const { login, register, verifyOtp, resendOtp, forgotPassword, resetPassword } = require("../controllers/auth.controller");

router.post("/login", login);

router.post("/register", register);

router.post("/verify-otp", verifyOtp);

router.post("/resend-otp", resendOtp);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

module.exports = router;
