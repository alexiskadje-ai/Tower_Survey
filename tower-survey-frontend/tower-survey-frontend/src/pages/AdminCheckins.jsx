import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertTriangle, X, MapPin, Clock } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import "./AdminCheckins.css";

const POLL_INTERVAL_MS = 25_000;

export default function AdminCheckins() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null); // Date
  const [secondsSince, setSecondsSince] = useState(0);
  const [selected, setSelected] = useState(null); // selfie plein écran
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false);
  const lastSinceRef = useRef(null);

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/sites", { replace: true });
      return;
    }
    load(true);
    const interval = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick "Xs ago" indicator every second
  useEffect(() => {
    const t = setInterval(() => {
      if (!lastUpdated) { setSecondsSince(0); return; }
      setSecondsSince(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  async function load(initial) {
    if (initial) setLoading(true);
    setError(null);
    try {
      // Polling incrémental : depuis la dernière synced_at connue.
      // Premier load (initial) → pas de since, on récupère les 50 plus récents.
      const params = {};
      if (!initial && lastSinceRef.current) {
        params.since = lastSinceRef.current;
      }
      params.limit = 100;
      const data = await api.adminListRecentCheckins(params);
      const rows = data.checkins || [];

      if (initial) {
        setCheckins(rows);
      } else {
        // Merge: on dédoublonne sur id et on garde l'ordre DESC.
        const map = new Map(checkins.map((c) => [c.id, c]));
        for (const r of rows) map.set(r.id, r);
        const merged = Array.from(map.values())
          .sort((a, b) => new Date(b.synced_at) - new Date(a.synced_at))
          .slice(0, 200);
        setCheckins(merged);
      }
      if (data.serverTime) {
        setLastUpdated(new Date());
        // Conserve le max synced_at pour le prochain polling incrémental
        const max = rows.reduce((acc, r) => {
          const t = new Date(r.synced_at).getTime();
          return t > acc ? t : acc;
        }, lastSinceRef.current ? new Date(lastSinceRef.current).getTime() : 0);
        if (max > 0) lastSinceRef.current = new Date(max).toISOString();
      }
    } catch (err) {
      setError(err.message || "Impossible de charger les check-ins.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(
    () => (showOnlyFlagged ? checkins.filter((c) => c.flagged) : checkins),
    [checkins, showOnlyFlagged]
  );

  const stats = useMemo(() => {
    const total = checkins.length;
    const flagged = checkins.filter((c) => c.flagged).length;
    const last24h = checkins.filter((c) => {
      const t = new Date(c.synced_at).getTime();
      return Date.now() - t < 24 * 3600 * 1000;
    }).length;
    return { total, flagged, last24h };
  }, [checkins]);

  if (user?.role !== "admin") return null;

  return (
    <div className="app-shell">
      <TopBar />
      <div className="admin-checkins">
        <div className="admin-checkins__header">
          <div>
            <button type="button" className="admin-checkins__back" onClick={() => navigate("/admin")}>
              <ArrowLeft size={18} /> Retour
            </button>
            <h1 className="admin-checkins__title">Monitoring des check-ins</h1>
            <p className="admin-checkins__subtitle">
              Suivi en temps quasi-réel des présences techniciens (refresh auto toutes les {POLL_INTERVAL_MS / 1000}s).
            </p>
          </div>
          <div className="admin-checkins__header-actions">
            <label className="admin-checkins__filter-toggle">
              <input
                type="checkbox"
                checked={showOnlyFlagged}
                onChange={(e) => setShowOnlyFlagged(e.target.checked)}
              />
              <span>Voir uniquement les signalés</span>
            </label>
            <button type="button" className="btn btn-secondary" onClick={() => load(true)} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              <span style={{ marginLeft: 6 }}>Actualiser</span>
            </button>
          </div>
        </div>

        <div className="admin-checkins__meta">
          <span className="admin-checkins__last-update">
            <Clock size={14} />
            {lastUpdated
              ? `Dernière mise à jour il y a ${secondsSince}s`
              : (loading ? "Chargement…" : "En attente de données")}
          </span>
        </div>

        <div className="admin-checkins__stats">
          <div className="stat-card">
            <span className="stat-card__value">{stats.total}</span>
            <span className="stat-card__label">Total (cette fenêtre)</span>
          </div>
          <div className="stat-card stat-card--info">
            <span className="stat-card__value">{stats.last24h}</span>
            <span className="stat-card__label">Dernières 24h</span>
          </div>
          <div className="stat-card stat-card--pending">
            <span className="stat-card__value">{stats.flagged}</span>
            <span className="stat-card__label">Signalés</span>
          </div>
        </div>

        {error && (
          <p className="admin-checkins__error" role="alert">
            <AlertTriangle size={18} /> {error}
          </p>
        )}

        {loading && checkins.length === 0 ? (
          <p className="admin-checkins__empty">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="admin-checkins__empty">
            {showOnlyFlagged ? "Aucun check-in signalé pour l'instant." : "Aucun check-in récent."}
          </p>
        ) : (
          <div className="admin-checkins__table-wrap">
            <table className="admin-checkins__table">
              <thead>
                <tr>
                  <th>Selfie</th>
                  <th>Technicien</th>
                  <th>Rôle</th>
                  <th>Site</th>
                  <th>Distance</th>
                  <th>Capturé</th>
                  <th>Synchronisé</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className={c.flagged ? "is-flagged" : ""}>
                    <td>
                      {c.selfie_url ? (
                        <button
                          type="button"
                          className="admin-checkins__thumb"
                          onClick={() => setSelected(c)}
                          aria-label="Voir le selfie en grand"
                        >
                          <img src={c.selfie_url} alt={`Selfie ${c.technician_name}`} loading="lazy" />
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-checkins__tech">
                        <strong>{c.technician_name}</strong>
                        {c.technician_matricule && (
                          <span className="admin-checkins__sub mono">{c.technician_matricule}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${c.role === "lead" ? "pill--ok" : "pill--info"}`}>
                        {c.role}
                      </span>
                    </td>
                    <td>
                      {c.site_code ? (
                        <div>
                          <div className="mono"><strong>{c.site_code}</strong></div>
                          <div className="admin-checkins__sub">{c.site_name || ""}</div>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {c.distance_to_tower_meters != null ? (
                        <span>
                          {Math.round(c.distance_to_tower_meters)} m
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{c.captured_at ? formatDateTime(c.captured_at) : "—"}</td>
                    <td>
                      <div>{formatDateTime(c.synced_at)}</div>
                      {c.flagged && (
                        <span className="admin-checkins__flag-pill" role="status">
                          <AlertTriangle size={12} /> {c.flag_reason || "À examiner"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="admin-checkins__lightbox" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
          <button
            type="button"
            className="admin-checkins__lightbox-close"
            onClick={() => setSelected(null)}
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
          <div className="admin-checkins__lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={selected.selfie_url} alt={`Selfie ${selected.technician_name}`} />
            <div className="admin-checkins__lightbox-info">
              <h3>{selected.technician_name}</h3>
              <p><MapPin size={14} /> {selected.latitude?.toFixed(5)}, {selected.longitude?.toFixed(5)}</p>
              <p>Rôle : <strong>{selected.role}</strong></p>
              {selected.site_code && <p>Site : <strong>{selected.site_code}</strong> — {selected.site_name}</p>}
              {selected.distance_to_tower_meters != null && (
                <p>Distance au site : {Math.round(selected.distance_to_tower_meters)} m</p>
              )}
              {selected.flagged && (
                <p className="admin-checkins__lightbox-flag">
                  <AlertTriangle size={14} /> {selected.flag_reason || "À examiner"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    timeZone: "Africa/Douala",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}
