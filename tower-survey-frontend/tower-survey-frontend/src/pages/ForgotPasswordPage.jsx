import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import "./ForgotPasswordPage.css";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      navigate("/reset-password", { state: { email: email.trim() }, replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login__brand">
        <img src="/logo-mark.png" alt="TeleInfra Cameroon" className="login__mark" />
        <h1 className="login__title">TeleInfra</h1>
        <p className="login__subtitle">Mot de passe oublié</p>
      </div>

      <form className="login__card card" onSubmit={handleSubmit}>
        {error && <p className="login__error">{error}</p>}

        <p className="forgot-password__hint">
          Entre l'e-mail de ton compte. Nous t'enverrons un code de réinitialisation.
        </p>

        <div className="qfield">
          <label className="field-label" htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            className="text-input mono"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ex. jean@teleinfra.cm"
            autoComplete="email"
            required
          />
        </div>

        <button type="submit" className="btn btn-primary login__submit" disabled={loading}>
          {loading ? "Envoi…" : "Envoyer le code"}
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
