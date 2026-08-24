import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import "./HomePage.css";

export default function HomePage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/sites", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="app-shell">
      <TopBar />
      <div className="home-page">
        <h1 className="home-page__title">Audit Pylône</h1>
        <p className="home-page__subtitle">TELEINFRA Cameroon</p>
        <div className="home-page__actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate("/login")}>
            Se connecter
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/register")}>
            Créer un compte
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
