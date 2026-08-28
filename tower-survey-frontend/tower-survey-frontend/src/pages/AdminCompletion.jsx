import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { CheckCircle2, XCircle, Filter, ArrowDownAZ, ArrowUpAZ, ArrowLeft, RefreshCw } from "lucide-react";
import "./AdminCompletion.css";

const FILTERS = [
  { key: "all", label: "Tous" },
  { key: "complete", label: "Complets (2/2)" },
  { key: "incomplete", label: "Incomplets" },
  { key: "missing_power", label: "Manque Power" },
  { key: "missing_infra", label: "Manque Infra" },
];

export default function AdminCompletion() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [cluster, setCluster] = useState("");
  const [sortDir, setSortDir] = useState("asc");

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/sites", { replace: true });
      return;
    }
    load();
  }, [user, navigate, cluster]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = cluster ? { cluster } : {};
      const data = await api.getCompletionStatus(params);
      setSites(data.sites || []);
    } catch (err) {
      console.error("Failed to load completion status:", err);
      setError(err.message || "Impossible de charger l'état de complétion.");
    } finally {
      setLoading(false);
    }
  }

  const clusters = useMemo(() => {
    const set = new Set();
    sites.forEach((s) => s.cluster && set.add(s.cluster));
    return Array.from(set).sort();
  }, [sites]);

  const filtered = useMemo(() => {
    return sites.filter((s) => {
      if (filter === "complete") return s.is_complete;
      if (filter === "incomplete") return !s.is_complete;
      if (filter === "missing_power") return !s.has_power_audit;
      if (filter === "missing_infra") return !s.has_site_infrastructure;
      return true;
    });
  }, [sites, filter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    // Incomplets en premier pour repérer les trous rapidement,
    // puis tri secondaire par code site selon sortDir.
    list.sort((a, b) => {
      if (a.is_complete === b.is_complete) {
        const av = (a.site_code || "").toLowerCase();
        const bv = (b.site_code || "").toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return a.is_complete ? 1 : -1;
    });
    return list;
  }, [filtered, sortDir]);

  const stats = useMemo(() => {
    const total = sites.length;
    const complete = sites.filter((s) => s.is_complete).length;
    const incomplete = total - complete;
    const missingPower = sites.filter((s) => !s.has_power_audit).length;
    const missingInfra = sites.filter((s) => !s.has_site_infrastructure).length;
    return { total, complete, incomplete, missingPower, missingInfra };
  }, [sites]);

  if (user?.role !== "admin") return null;

  return (
    <div className="app-shell">
      <TopBar />
      <div className="admin-completion">
        <div className="admin-completion__header">
          <div>
            <h1 className="admin-completion__title">Complétion par site</h1>
            <p className="admin-completion__subtitle">
              Suivi des audits Power &amp; Infrastructure par site
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            title="Inverser le tri par code site"
            aria-label="Inverser le tri par code site"
          >
            {sortDir === "asc" ? <ArrowDownAZ size={16} /> : <ArrowUpAZ size={16} />}
            <span style={{ marginLeft: 6 }}>Tri {sortDir === "asc" ? "A→Z" : "Z→A"}</span>
          </button>
        </div>

        <div className="admin-completion__stats">
          <div className="stat-card">
            <span className="stat-card__value">{stats.total}</span>
            <span className="stat-card__label">Sites</span>
          </div>
          <div className="stat-card stat-card--ok">
            <span className="stat-card__value">{stats.complete}</span>
            <span className="stat-card__label">Complets 2/2</span>
          </div>
          <div className="stat-card stat-card--pending">
            <span className="stat-card__value">{stats.incomplete}</span>
            <span className="stat-card__label">Incomplets</span>
          </div>
          <div className="stat-card stat-card--info">
            <span className="stat-card__value">{stats.missingPower}</span>
            <span className="stat-card__label">Manque Power</span>
          </div>
          <div className="stat-card stat-card--info">
            <span className="stat-card__value">{stats.missingInfra}</span>
            <span className="stat-card__label">Manque Infra</span>
          </div>
        </div>

        <div className="admin-completion__filters">
          <div className="filter-chips">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`filter-chip ${filter === f.key ? "is-active" : ""}`}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="cluster-filter">
            <Filter size={16} aria-hidden="true" />
            <select
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              aria-label="Filtrer par cluster"
            >
              <option value="">Tous les clusters</option>
              {clusters.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={load}
              disabled={loading}
              title="Rafraîchir"
              aria-label="Rafraîchir"
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
          </div>
        </div>

        {error ? (
          <p className="admin-completion__error" role="alert">{error}</p>
        ) : loading ? (
          <p className="admin-completion__empty">Chargement…</p>
        ) : sorted.length === 0 ? (
          <p className="admin-completion__empty">Aucun site pour ce filtre.</p>
        ) : (
          <div className="completion-table-wrapper">
            <table className="completion-table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Nom</th>
                  <th scope="col">Cluster</th>
                  <th scope="col">Infrastructure</th>
                  <th scope="col">Power</th>
                  <th scope="col">Statut</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.site_id} className={s.is_complete ? "is-complete" : "is-incomplete"}>
                    <td className="cell-code">{s.site_code}</td>
                    <td>{s.site_name || "—"}</td>
                    <td>{s.cluster || "—"}</td>
                    <td>
                      {s.has_site_infrastructure ? (
                        <span className="pill pill--ok">
                          <CheckCircle2 size={14} aria-hidden="true" /> OK
                        </span>
                      ) : (
                        <span className="pill pill--ko">
                          <XCircle size={14} aria-hidden="true" /> Manquant
                        </span>
                      )}
                    </td>
                    <td>
                      {s.has_power_audit ? (
                        <span className="pill pill--ok">
                          <CheckCircle2 size={14} aria-hidden="true" /> OK
                        </span>
                      ) : (
                        <span className="pill pill--ko">
                          <XCircle size={14} aria-hidden="true" /> Manquant
                        </span>
                      )}
                    </td>
                    <td>
                      {s.is_complete ? (
                        <span className="pill pill--complete">Complet</span>
                      ) : (
                        <span className="pill pill--incomplete">Incomplet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-completion__actions" style={{ display: "flex" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/admin")}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            Retour dashboard
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
