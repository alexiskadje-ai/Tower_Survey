import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { Download, Mail, ArrowLeft, FileSpreadsheet } from "lucide-react";
import "./AdminExport.css";

export default function AdminExport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [format, setFormat] = useState("csv");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/sites", { replace: true });
      return;
    }
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user, navigate]);

  async function handleExport(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (format === "email") {
        await api.adminEmailExport({ to: email, format: "csv" });
        setMessage(`Export envoyé à ${email}`);
      } else if (format === "csv") {
        const res = await api.adminExportCsv();
        setMessage("Export CSV généré. Téléchargement en cours...");
        triggerDownload(res, "csv");
      } else {
        const res = await api.adminExportExcel();
        setMessage("Export Excel généré. Téléchargement en cours...");
        triggerDownload(res, "xlsx");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function triggerDownload(data, ext) {
    console.log("Export data:", data);
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
          <p className="admin-export__subtitle">Téléchargez ou envoyez par e-mail les réponses d'audit</p>
        </div>

        <form className="admin-export__form" onSubmit={handleExport}>
          {error && <p className="admin-export__error">{error}</p>}
          {message && <p className="admin-export__success">{message}</p>}

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
                <Download size={18} />
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
                Excel (.xlsx)
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
                Envoyer par e-mail
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
