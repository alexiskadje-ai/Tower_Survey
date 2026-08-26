import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { Download, Mail, ArrowLeft, FileSpreadsheet, FileText } from "lucide-react";
import "./AdminExport.css";

export default function AdminExport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [format, setFormat] = useState("csv");
  const [email, setEmail] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Sync email field when user data becomes available
  useState(() => {
    if (user?.email) setEmail(user.email);
    return null;
  });

  async function handleExport(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const filters = {};
      if (templateCategory) filters.template_category = templateCategory;
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;

      if (format === "email") {
        await api.adminEmailExport({
          to: email,
          format: "excel",
          ...filters,
        });
        setMessage(`Export détaillé envoyé par e-mail à ${email}`);
      } else if (format === "csv") {
        await api.adminExportCsv(filters);
        setMessage("Export CSV téléchargé avec succès — contient toutes les réponses détaillées.");
      } else {
        await api.adminExportExcel(filters);
        setMessage("Export Excel téléchargé avec succès — 2 feuilles (Responses + Detailed Answers).");
      }
    } catch (err) {
      setError(err.message);
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
      <div className="admin-export">
        <div className="admin-export__header">
          <h1 className="admin-export__title">Exporter les données</h1>
          <p className="admin-export__subtitle">
            Téléchargez ou envoyez par e-mail les audits détaillés (toutes les réponses aux questions)
          </p>
        </div>

        <form className="admin-export__form" onSubmit={handleExport}>
          {error && <p className="admin-export__error">{error}</p>}
          {message && <p className="admin-export__success">{message}</p>}

          <div className="admin-export__filters">
            <div className="qfield">
              <label className="field-label" htmlFor="templateCategory">Type de formulaire</label>
              <select
                id="templateCategory"
                className="text-input"
                value={templateCategory}
                onChange={(e) => setTemplateCategory(e.target.value)}
              >
                <option value="">Tous les formulaires</option>
                <option value="Power Audit">Power Audit</option>
                <option value="Site Infrastructure">Site Infrastructure</option>
              </select>
            </div>
            <div className="qfield">
              <label className="field-label" htmlFor="dateFrom">Date de début</label>
              <input
                id="dateFrom"
                type="date"
                className="text-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="qfield">
              <label className="field-label" htmlFor="dateTo">Date de fin</label>
              <input
                id="dateTo"
                type="date"
                className="text-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="qfield">
            <label className="field-label">Format d'export</label>
            <div className="admin-export__options">
              <label className="admin-export__radio">
                <input
                  type="radio"
                  name="format"
                  value="csv"
                  checked={format === "csv"}
                  onChange={(e) => setFormat(e.target.value)}
                />
                <FileText size={18} />
                CSV
              </label>
              <label className="admin-export__radio">
                <input
                  type="radio"
                  name="format"
                  value="excel"
                  checked={format === "excel"}
                  onChange={(e) => setFormat(e.target.value)}
                />
                <FileSpreadsheet size={18} />
                Excel (.xlsx) — 2 feuilles
              </label>
              <label className="admin-export__radio">
                <input
                  type="radio"
                  name="format"
                  value="email"
                  checked={format === "email"}
                  onChange={(e) => setFormat(e.target.value)}
                />
                <Mail size={18} />
                Envoyer par e-mail (Excel)
              </label>
            </div>
          </div>

          {format === "email" && (
            <div className="qfield">
              <label className="field-label" htmlFor="email">Destinataire</label>
              <input
                id="email"
                type="email"
                className="text-input mono"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@teleinfra.cm"
                required
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Génération..." : format === "email" ? "Envoyer l'export" : "Télécharger"}
          </button>
        </form>

        <div className="admin-export__actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin")}>
            <ArrowLeft size={18} />
            Retour dashboard
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin/responses")}>
            Voir les réponses
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
