import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import "./RegisterPage.css";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !password) {
      return setError("Tous les champs sont requis.");
    }
    if (password.length < 6) {
      return setError("Le mot de passe doit contenir au moins 6 caractères.");
    }
    if (password !== confirmPassword) {
      return setError("Les mots de passe ne correspondent pas.");
    }

    setLoading(true);
    try {
      const data = await api.register(fullName.trim(), email.trim(), password);
      navigate("/verify-otp", { state: { email: data.user.email, fullName: data.user.full_name }, replace: true });
    } catch (err) {
      setError(err.status === 409 ? "Cet e-mail est déjà utilisé." : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login__brand">
        <img src="/logo-mark.png" alt="TeleInfra Cameroon" className="login__mark" />
        <h1 className="login__title">TeleInfra</h1>
        <p className="login__subtitle">Créer un compte</p>
      </div>

      <form className="login__card card" onSubmit={handleSubmit}>
        {error && <p className="login__error">{error}</p>}

        <div className="qfield">
          <label className="field-label" htmlFor="fullName">Nom complet</label>
          <input
            id="fullName"
            className="text-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="ex. Jean Dupont"
            autoComplete="name"
            required
          />
        </div>

        <div className="qfield">
          <label className="field-label" htmlFor="email">E-mail professionnel</label>
          <input
            id="email"
            type="email"
            className="text-input mono"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ex. jean.dupont@teleinfra.cm"
            autoComplete="email"
            required
          />
        </div>

        <div className="qfield">
          <label className="field-label" htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            className="text-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <p className="register__password-hint">Min. 6 caractères</p>
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

        <button type="submit" className="btn btn-primary login__submit" disabled={loading}>
          {loading ? "Création…" : "Créer mon compte"}
        </button>

        <p className="login__footnote">
          Déjà inscrit ? <button type="button" className="btn btn-ghost login__link" onClick={() => navigate("/login")}>Se connecter</button>
        </p>
      </form>
    </div>
  );
}
