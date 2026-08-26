import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { ArrowLeft, MapPin, User, Clock, Navigation, ImageIcon, FileText, Zap, Building2 } from "lucide-react";
import "./AdminResponseDetail.css";

const TEMPLATE_ICONS = {
  "Power Audit": Zap,
  "Site Infrastructure": Building2,
};

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

  // Regroupe les réponses par section (en respectant l'ordre des sections)
  const answersBySection = useMemo(() => {
    if (!detail?.answers || !detail?.sections) return [];
    const sectionById = new Map(detail.sections.map((s) => [s.id, s]));
    const groups = new Map();
    for (const a of detail.answers) {
      const secKey = a.section_title || "—";
      if (!groups.has(secKey)) groups.set(secKey, []);
      groups.get(secKey).push(a);
    }
    return Array.from(groups.entries()).map(([title, answers]) => ({
      title,
      order_index: sectionById.get(answers[0]?.section_id)?.order_index ?? 0,
      answers,
    })).sort((a, b) => a.order_index - b.order_index);
  }, [detail]);

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

  const FormIcon = TEMPLATE_ICONS[detail.template_category] || FileText;

  return (
    <div className="app-shell">
      <TopBar />
      <div className="admin-detail">
        <div className="admin-detail__header">
          <div className="admin-detail__form-badge" data-category={detail.template_category}>
            <FormIcon size={18} />
            <div>
              <div className="admin-detail__form-badge-name">{detail.template_name}</div>
              <div className="admin-detail__form-badge-meta">
                {detail.template_category} · v{detail.template_version}
              </div>
            </div>
          </div>
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
              <p className="admin-detail__value">{detail.region || "—"}</p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Technicien</span>
              <p className="admin-detail__value">
                {detail.technician_name}
                {detail.technician_email && (
                  <span className="admin-detail__value-sub"> ({detail.technician_email})</span>
                )}
              </p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Statut</span>
              <p className="admin-detail__value">
                <span className={`pill pill--${detail.status === "synced" ? "ok" : detail.status === "queued" ? "pending" : "offline"}`}>
                  {detail.status}
                </span>
              </p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Démarré le</span>
              <p className="admin-detail__value">
                {detail.started_at ? new Date(detail.started_at).toLocaleString() : "—"}
              </p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Soumis le</span>
              <p className="admin-detail__value">
                {detail.submitted_at ? new Date(detail.submitted_at).toLocaleString() : "—"}
              </p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Synchronisé le</span>
              <p className="admin-detail__value">
                {detail.synced_at ? new Date(detail.synced_at).toLocaleString() : "—"}
              </p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">GPS</span>
              <p className="admin-detail__value">
                {detail.gps_latitude && detail.gps_longitude
                  ? `${Number(detail.gps_latitude).toFixed(6)}, ${Number(detail.gps_longitude).toFixed(6)} (±${detail.gps_accuracy_m}m)`
                  : "—"}
              </p>
            </div>
            <div className="admin-detail__field">
              <span className="admin-detail__label">Device</span>
              <p className="admin-detail__value mono">{detail.device_id || "—"}</p>
            </div>
            <div className="admin-detail__field admin-detail__field--full">
              <span className="admin-detail__label">UUID réponse</span>
              <p className="admin-detail__value mono">{detail.client_uuid}</p>
            </div>
          </div>
        </div>

        <div className="admin-detail__section">
          <h2 className="admin-detail__section-title">
            Réponses détaillées ({detail.answers?.length || 0})
          </h2>
          {answersBySection.length === 0 ? (
            <p className="admin-detail__empty">Aucune réponse enregistrée.</p>
          ) : (
            <div className="admin-detail__sections">
              {answersBySection.map((group) => (
                <div key={group.title} className="admin-detail__answer-group">
                  <h3 className="admin-detail__answer-group-title">{group.title}</h3>
                  <div className="admin-detail__answers">
                    {group.answers.map((a) => (
                      <div key={a.id} className="admin-detail__answer">
                        <div className="admin-detail__answer-header">
                          <span className="admin-detail__question">
                            {a.question_label}
                            {a.is_required && <span className="admin-detail__required"> *</span>}
                          </span>
                          {a.unit && <span className="admin-detail__unit">({a.unit})</span>}
                        </div>
                        <div className="admin-detail__value">
                          {a.value === null || a.value === undefined || a.value === ""
                            ? <span className="admin-detail__no-value">Non renseigné</span>
                            : typeof a.value === "boolean"
                            ? (a.value ? "✓ Oui" : "✗ Non")
                            : Array.isArray(a.value)
                            ? a.value.join(", ")
                            : String(a.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
