import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../api/client";
import "./VerifyOtpPage.css";

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || "";
  const fullName = location.state?.fullName || "";

  const [otp, setOtp] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const startCountdown = useCallback(() => {
    setResendCountdown(60);
  }, []);

  useEffect(() => {
    if (!email) {
      navigate("/register", { replace: true });
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
    if (otp.length !== 6) return setError("Le code OTP fait 6 chiffres.");

    setLoading(true);
    try {
      await api.verifyOtp(email, otp);
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true, state: { message: "E-mail vérifié. Tu peux te connecter." } }), 2000);
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
      await api.resendOtp(email);
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
          <p className="login__subtitle">E-mail vérifié</p>
        </div>
        <div className="login__card card">
          <p className="verify-otp__success">Ton compte est confirmé. Redirection vers la connexion…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="login__brand">
        <img src="/logo-mark.png" alt="TeleInfra Cameroon" className="login__mark" />
        <h1 className="login__title">TeleInfra</h1>
        <p className="login__subtitle">Vérification par e-mail</p>
      </div>

      <form className="login__card card" onSubmit={handleSubmit}>
        <p className="verify-otp__hint">
          Entrez le code envoyé à <strong>{email || fullName}</strong>
        </p>

        {error && <p className="login__error">{error}</p>}

        <div className="qfield">
          <label className="field-label" htmlFor="otp">Code de vérification (6 chiffres)</label>
          <input
            id="otp"
            className="text-input mono verify-otp__input"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            required
          />
        </div>

        <button type="submit" className="btn btn-primary login__submit" disabled={loading || otp.length !== 6}>
          {loading ? "Vérification…" : "Vérifier"}
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
          <button type="button" className="btn btn-ghost login__link" onClick={() => navigate("/register")}>
            Retour à l'inscription
          </button>
        </p>
      </form>
    </div>
  );
}
