import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { FileText, CheckCircle2, Clock, MapPin } from "lucide-react";
import "./AdminDashboard.css";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, synced: 0, pending: 0, sites: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/sites", { replace: true });
      return;
    }
    loadStats();
  }, [user, navigate]);

  async function loadStats() {
    setLoading(true);
    try {
      const data = await api.adminListResponses({ limit: 1000 });
      const responses = data.responses || [];
      const uniqueSites = new Set(responses.map((r) => r.site_id)).size;
      setStats({
        total: responses.length,
        synced: responses.filter((r) => r.status === "synced").length,
        pending: responses.filter((r) => r.status === "queued" || r.status === "draft").length,
        sites: uniqueSites,
      });
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      setLoading(false);
    }
  }

  if (user?.role !== "admin") {
    return null;
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="admin-dashboard">
        <div className="admin-dashboard__header">
          <h1 className="admin-dashboard__title">Tableau de bord</h1>
          <p className="admin-dashboard__subtitle">Vue d'ensemble des audits et performances</p>
        </div>

        <div className="admin-dashboard__stats">
          <div className="stat-card stat-card--total">
            <div className="stat-card__icon">
              <FileText size={22} strokeWidth={2.2} />
            </div>
            <span className="stat-card__value">{loading ? "—" : stats.total}</span>
            <span className="stat-card__label">Total réponses</span>
          </div>
          <div className="stat-card stat-card--ok">
            <div className="stat-card__icon">
              <CheckCircle2 size={22} strokeWidth={2.2} />
            </div>
            <span className="stat-card__value">{loading ? "—" : stats.synced}</span>
            <span className="stat-card__label">Synchronisées</span>
          </div>
          <div className="stat-card stat-card--pending">
            <div className="stat-card__icon">
              <Clock size={22} strokeWidth={2.2} />
            </div>
            <span className="stat-card__value">{loading ? "—" : stats.pending}</span>
            <span className="stat-card__label">En attente</span>
          </div>
          <div className="stat-card stat-card--info">
            <div className="stat-card__icon">
              <MapPin size={22} strokeWidth={2.2} />
            </div>
            <span className="stat-card__value">{loading ? "—" : stats.sites}</span>
            <span className="stat-card__label">Sites couverts</span>
          </div>
        </div>

        <div className="admin-dashboard__actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate("/admin/responses")}>
            Voir toutes les réponses
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin/completion")}>
            Complétion par site
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin/checkins")}>
            Monitoring check-ins
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin/users")}>
            Gestion des utilisateurs
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin/export")}>
            Exporter les données
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
