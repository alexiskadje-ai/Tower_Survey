import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../api/client";
import "./ResetPasswordPage.css";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || "";
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const startCountdown = useCallback(() => {
    setResendCountdown(60);
  }, []);

  useEffect(() => {
    if (!email) {
      navigate("/forgot-password", { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (otp.length !== 6) {
      return setError("Le code OTP fait 6 chiffres.");
    }
    if (newPassword.length < 6) {
      return setError("Le mot de passe doit contenir au moins 6 caractères.");
    }
    if (newPassword !== confirmPassword) {
      return setError("Les mots de passe ne correspondent pas.");
    }

    setLoading(true);
    try {
      await api.resetPassword(email, otp, newPassword);
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true, state: { message: "Mot de passe réinitialisé. Tu peux te connecter." } }), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email);
      startCountdown();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="login">
        <div className="login__brand">
          <img src="/logo-mark.png" alt="TeleInfra Cameroon" className="login__mark" />
          <h1 className="login__title">TeleInfra</h1>
          <p className="login__subtitle">Mot de passe réinitialisé</p>
        </div>
        <div className="login__card card">
          <p className="reset-password__success">Ton mot de passe a été mis à jour. Redirection vers la connexion…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="login__brand">
        <img src="/logo-mark.png" alt="TeleInfra Cameroon" className="login__mark" />
        <h1 className="login__title">TeleInfra</h1>
        <p className="login__subtitle">Réinitialiser le mot de passe</p>
      </div>

      <form className="login__card card" onSubmit={handleSubmit}>
        <p className="reset-password__hint">
          Entre le code envoyé à <strong>{email || "ton e-mail"}</strong>
        </p>

        {error && <p className="login__error">{error}</p>}

        <div className="qfield">
          <label className="field-label" htmlFor="otp">Code de réinitialisation (6 chiffres)</label>
          <input
            id="otp"
            className="text-input mono reset-password__input"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            required
          />
        </div>

        <div className="qfield">
          <label className="field-label" htmlFor="newPassword">Nouveau mot de passe</label>
          <input
            id="newPassword"
            type="password"
            className="text-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <p className="reset-password__hint-text">Min. 6 caractères</p>
        </div>

        <div className="qfield">
          <label className="field-label" htmlFor="confirmPassword">Confirmer le mot de passe</label>
          <input
            id="confirmPassword"
            type="password"
            className="text-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <button type="submit" className="btn btn-primary login__submit" disabled={loading || otp.length !== 6 || !newPassword || !confirmPassword}>
          {loading ? "Réinitialisation…" : "Réinitialiser"}
        </button>

        <button
          type="button"
          className="btn btn-ghost login__link"
          onClick={handleResend}
          disabled={loading || resendCountdown > 0}
        >
          {resendCountdown > 0 ? `Renvoyer dans ${resendCountdown}s` : "Renvoyer le code"}
        </button>

        <p className="login__footnote">
          <button type="button" className="btn btn-ghost login__link" onClick={() => navigate("/login")}>
            Retour à la connexion
          </button>
        </p>
      </form>
    </div>
  );
}
