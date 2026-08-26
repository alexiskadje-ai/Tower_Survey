import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { Search, Filter, Eye, ArrowLeft, Zap, Building2, FileText } from "lucide-react";
import "./AdminResponses.css";

const TEMPLATE_ICONS = {
  "Power Audit": Zap,
  "Site Infrastructure": Building2,
};

export default function AdminResponses() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    site_id: "",
    technician_id: "",
    date_from: "",
    date_to: "",
    status: "",
    template_id: "",
    template_category: "",
  });

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/sites", { replace: true });
      return;
    }
    loadResponses();
  }, [user, navigate]);

  async function loadResponses() {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const data = await api.adminListResponses(params);
      setResponses(data.responses || []);
    } catch (err) {
      console.error("Failed to load responses:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(e) {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  }

  function handleFilterSubmit(e) {
    e.preventDefault();
    loadResponses();
  }

  function handleResetFilters() {
    setFilters({
      search: "",
      site_id: "",
      technician_id: "",
      date_from: "",
      date_to: "",
      status: "",
      template_id: "",
      template_category: "",
    });
    setTimeout(loadResponses, 0);
  }

  if (user?.role !== "admin") {
    return null;
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="admin-responses">
        <div className="admin-responses__header">
          <h1 className="admin-responses__title">Toutes les réponses</h1>
          <p className="admin-responses__subtitle">Suivi des audits terrains et synchronisations</p>
        </div>

        <form className="admin-responses__filters" onSubmit={handleFilterSubmit}>
          <div className="admin-responses__search">
            <Search size={18} className="admin-responses__search-icon" />
            <input
              className="text-input admin-responses__search-input"
              name="search"
              placeholder="Rechercher (site, technicien)..."
              value={filters.search}
              onChange={handleFilterChange}
            />
          </div>
          <select className="text-input" name="template_category" value={filters.template_category} onChange={handleFilterChange}>
            <option value="">Tous les formulaires</option>
            <option value="Power Audit">Power Audit</option>
            <option value="Site Infrastructure">Site Infrastructure</option>
          </select>
          <select className="text-input" name="status" value={filters.status} onChange={handleFilterChange}>
            <option value="">Tous les statuts</option>
            <option value="draft">Brouillon</option>
            <option value="queued">En attente</option>
            <option value="submitted">Soumis</option>
            <option value="synced">Synchronisé</option>
          </select>
          <input
            className="text-input"
            type="date"
            name="date_from"
            value={filters.date_from}
            onChange={handleFilterChange}
          />
          <input
            className="text-input"
            type="date"
            name="date_to"
            value={filters.date_to}
            onChange={handleFilterChange}
          />
          <button type="submit" className="btn btn-secondary">
            <Filter size={18} />
            Filtrer
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleResetFilters}>
            Réinitialiser
          </button>
        </form>

        {loading ? (
          <p className="admin-responses__loading">Chargement...</p>
        ) : responses.length === 0 ? (
          <p className="admin-responses__empty">Aucune réponse trouvée.</p>
        ) : (
          <div className="admin-responses__table-wrap">
            <table className="admin-responses__table">
              <thead>
                <tr>
                  <th>Formulaire</th>
                  <th>Site</th>
                  <th>Technicien</th>
                  <th>Statut</th>
                  <th>Soumis le</th>
                  <th>Sync</th>
                  <th>GPS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {responses.map((r) => {
                  const Icon = TEMPLATE_ICONS[r.template_category] || FileText;
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="admin-responses__form-cell">
                          <Icon size={16} className="admin-responses__form-icon" />
                          <div>
                            <div className="admin-responses__form-name">{r.template_name || "—"}</div>
                            <div className="admin-responses__form-category">{r.template_category || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="mono">{r.site_code}</span>
                        <br />
                        <span className="admin-responses__site-name">{r.site_name}</span>
                      </td>
                      <td>{r.technician_name}</td>
                      <td>
                        <span className={`pill pill--${r.status === "synced" ? "ok" : r.status === "queued" ? "pending" : "offline"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}</td>
                      <td>{r.synced_at ? new Date(r.synced_at).toLocaleString() : "—"}</td>
                      <td>
                        {r.gps_latitude && r.gps_longitude
                          ? `${Number(r.gps_latitude).toFixed(4)}, ${Number(r.gps_longitude).toFixed(4)}`
                          : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost admin-responses__detail-btn"
                          onClick={() => navigate(`/admin/responses/${r.id}`)}
                        >
                          <Eye size={18} />
                          Détails
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-responses__actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin")}>
            <ArrowLeft size={18} />
            Retour dashboard
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate("/admin/export")}>
            Exporter les données
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
