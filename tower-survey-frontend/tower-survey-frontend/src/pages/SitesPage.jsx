import { useNavigate } from "react-router-dom";
import { Zap, Building2, ChevronRight, FileSpreadsheet, Building, Database } from "lucide-react";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import "./SitesPage.css";

const FORM_TEMPLATES = [
  {
    type: "power",
    label: "Power & Energy Audit",
    short: "Power Audit",
    description: "Generator, battery, solar, rectifier, functional checks",
    sections: "7 sections",
    icon: Zap,
    accent: "#f59e0b",
    accentBg: "#fffbeb",
    accentBorder: "#fde68a",
  },
  {
    type: "infra",
    label: "Site Infrastructure Audit",
    short: "Site Infrastructure",
    description: "Shelter, cooling, ATS, tank, grid/gas feasibility",
    sections: "6 sections",
    icon: Building2,
    accent: "#3b82f6",
    accentBg: "#eff6ff",
    accentBorder: "#bfdbfe",
  },
];

export default function SitesPage() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <TopBar />
      <div className="sites-page">
        <div className="sites-page__header">
          <h1 className="sites-page__title">Audit terrain</h1>
          <p className="sites-page__subtitle">
            Choisissez le type d'audit à effectuer. Vous sélectionnerez le site à la première étape.
          </p>
        </div>

        <div className="template-grid">
          {FORM_TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.type}
                type="button"
                className="template-card"
                style={{
                  "--accent": tpl.accent,
                  "--accent-bg": tpl.accentBg,
                  "--accent-border": tpl.accentBorder,
                }}
                onClick={() => navigate(`/checkin/${tpl.type}`)}
              >
                <div className="template-card__icon">
                  <Icon size={28} />
                </div>
                <div className="template-card__body">
                  <div className="template-card__title">{tpl.label}</div>
                  <div className="template-card__desc">{tpl.description}</div>
                  <div className="template-card__meta">
                    <span className="template-card__chip">
                      <FileSpreadsheet size={12} />
                      {tpl.sections}
                    </span>
                    <span className="template-card__chip">
                      <Database size={12} />
                      Toutes questions obligatoires
                    </span>
                  </div>
                </div>
                <div className="template-card__cta">
                  Démarrer
                  <ChevronRight size={18} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="sites-page__hint">
          <Building size={14} />
          À l'étape suivante, vous pourrez rechercher le site par son IHS ID, son Operator ID ou son nom.
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
