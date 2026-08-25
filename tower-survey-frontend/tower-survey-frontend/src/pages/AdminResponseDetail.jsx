import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { ArrowLeft, MapPin, User, Clock, Navigation, Monitor, ImageIcon } from "lucide-react";
import "./AdminResponseDetail.css";

export default function AdminResponseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/sites", { replace: true });
      return;
    }
    loadDetail();
  }, [user, navigate, id]);

  async function loadDetail() {
    setLoading(true);
    try {
      const data = await api.adminResponseDetail(id);
      setDetail(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (user?.role !== "admin") {
    return null;
  }

  if (loading) {
    return (
      <div className="app-shell">
        <TopBar />
        <p className="admin-detail__loading">Chargement...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <TopBar />
        <p className="admin-detail__error">Erreur: {error}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="admin-detail">
        <div className="admin-detail__header">
          <h1 className="admin-detail__title">Détail de la réponse</h1>
          <p className="admin-detail__subtitle">
            {detail.site_code} — {detail.site_name}
          </p>
        </div>

        <div className="admin-detail__section">
          <h2 className="admin-detail__section-title">Informations générales</h2>
          <div className="admin-detail__grid">
            <div className="admin-detail__field">
              <span className="admin-detail__label">Site</span>
              <p className="admin-detail__value">
                {detail.site_code} — {detail.site_name}
              </p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Région</span>
              <p className="admin-detail__value">{detail.region || "-"}</p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Technicien</span>
              <p className="admin-detail__value">{detail.technician_name}</p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Statut</span>
              <p className="admin-detail__value">{detail.status}</p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Soumis le</span>
              <p className="admin-detail__value">{new Date(detail.submitted_at).toLocaleString()}</p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Sync</span>
              <p className="admin-detail__value">{detail.synced_at ? new Date(detail.synced_at).toLocaleString() : "-"}</p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">GPS</span>
              <p className="admin-detail__value">
                {detail.gps_latitude && detail.gps_longitude
                  ? `${Number(detail.gps_latitude).toFixed(4)}, ${Number(detail.gps_longitude).toFixed(4)} (±${detail.gps_accuracy_m}m)`
                  : "-"}
              </p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Device</span>
              <p className="admin-detail__value">{detail.device_id || "-"}</p>
            </div>
          </div>
        </div>

        <div className="admin-detail__section">
          <h2 className="admin-detail__section-title">Réponses ({detail.answers?.length || 0})</h2>
          <div className="admin-detail__answers">
            {detail.answers?.map((a) => (
              <div key={a.id} className="admin-detail__answer">
                <span className="admin-detail__question">{a.label}</span>
                <span className="admin-detail__value">
                  {a.value_text || a.value_number || a.value_boolean || JSON.stringify(a.value_json) || "-"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {detail.media?.length > 0 && (
          <div className="admin-detail__section">
            <h2 className="admin-detail__section-title">Médias ({detail.media.length})</h2>
            <div className="admin-detail__media">
              {detail.media.map((m) => (
                <div key={m.id} className="admin-detail__media-item">
                  <a href={m.file_url} target="_blank" rel="noreferrer">
                    {m.file_type?.startsWith("image/") ? (
                      <img src={m.file_url} alt={m.file_type} />
                    ) : (
                      <span className="admin-detail__media-fallback">
                        <ImageIcon size={28} />
                        {m.file_type}
                      </span>
                    )}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="admin-detail__actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin/responses")}>
            <ArrowLeft size={18} />
            Retour à la liste
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
