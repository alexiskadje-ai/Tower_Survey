import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./LoginPage.css";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [matricule, setMatricule] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const successMessage = location.state?.message || null;

  // Force le formulaire à être vierge à chaque entrée sur /login
  // (re-mount, retour depuis une autre page, bouton "back" du navigateur…).
  useEffect(() => {
    setMatricule("");
    setPassword("");
    setError(null);
    setLoading(false);
  }, [location.pathname]);

  // Sécurités supplémentaires : si l'utilisateur est déjà connecté,
  // on le redirige vers /sites pour éviter qu'il voit un formulaire
  // "fantôme" rempli par un state antérieur.
  useEffect(() => {
    if (localStorage.getItem("ti_token")) {
      navigate("/sites", { replace: true });
    }
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(matricule.trim(), password);
      // Nettoie le formulaire avant la redirection pour qu'un éventuel
      // retour sur /login (back navigateur) affiche un formulaire vide.
      setMatricule("");
      setPassword("");
      navigate("/sites", { replace: true });
    } catch (err) {
      // En cas d'échec on efface systématiquement le mot de passe
      // (jamais conservé côté UI). Le matricule est conservé pour
      // permettre à l'utilisateur de ne corriger que le mot de passe.
      setPassword("");
      setError(
        err.status === 401
          ? "Matricule ou mot de passe incorrect."
          : err.status === 403
          ? "E-mail non vérifié. Vérifie ta boîte mail pour valider ton compte."
          : navigator.onLine
          ? "Connexion au serveur impossible. Réessaie."
          : "Pas de réseau — la première connexion nécessite d'être en ligne."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login__brand">
        <img src="/logo-mark.png" alt="TeleInfra Cameroon" className="login__mark" />
        <h1 className="login__title">TeleInfra</h1>
        <p className="login__subtitle">Audit Pylône — Collecte terrain</p>
      </div>

      <form className="login__card card" onSubmit={handleSubmit} autoComplete="off">
        {successMessage && <p className="login__success">{successMessage}</p>}
        {error && <p className="login__error">{error}</p>}

        <div className="qfield">
          <label className="field-label" htmlFor="matricule">Matricule ou E-mail</label>
          <input
            id="matricule"
            name="matricule"
            key={`matricule-${location.key}`}
            className="text-input mono"
            value={matricule}
            onChange={(e) => setMatricule(e.target.value)}
            placeholder="ex. FME0231 ou jean@teleinfra.cm"
            autoCapitalize="characters"
            autoComplete="username"
            required
          />
        </div>

        <div className="qfield">
          <label className="field-label" htmlFor="password">Mot de passe</label>
          <input
            id="password"
            name="password"
            type="password"
            key={`password-${location.key}`}
            className="text-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button type="submit" className="btn btn-primary login__submit" disabled={loading}>
          {loading ? "Connexion…" : "Se connecter"}
        </button>

        <p className="login__footnote">
          <button type="button" className="btn btn-ghost login__link" onClick={() => navigate("/forgot-password")}>
            Mot de passe oublié ?
          </button>
        </p>

        <p className="login__footnote">
          Pas encore de compte ?{" "}
          <button type="button" className="btn btn-ghost login__link" onClick={() => navigate("/register")}>
            S'inscrire
          </button>
        </p>

        <p className="login__footnote">Managed Services MTN Cameroon — Sous-traitance Huawei</p>
      </form>
    </div>
  );
}
