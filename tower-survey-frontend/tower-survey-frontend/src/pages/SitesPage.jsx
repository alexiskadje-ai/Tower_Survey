import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { db } from "../db/db";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { Zap, Building2, ChevronRight } from "lucide-react";
import "./SitesPage.css";

const FORM_TYPES = [
  {
    type: "power",
    label: "Power Audit",
    fullLabel: "IHS Power & Energy Audit",
    description: "Generator, battery, solar, rectifier, functional checks",
    icon: Zap,
    accent: "#f59e0b",
  },
  {
    type: "infra",
    label: "Site Infrastructure",
    fullLabel: "IHS Site Infrastructure Audit",
    description: "Shelter, cooling, ATS, tank, grid/gas feasibility",
    icon: Building2,
    accent: "#3b82f6",
  },
];

export default function SitesPage() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const [sites, setSites] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFromCache() {
      const cached = await db.cachedSites.toArray();
      if (!cancelled) setSites(cached);
      setLoading(false);
    }

    async function refreshFromServer() {
      if (!navigator.onLine) return;
      try {
        const [{ sites: freshSites }, { templates }] = await Promise.all([
          api.getSites(),
          api.getActiveTemplates(),
        ]);

        await db.cachedSites.clear();
        await db.cachedSites.bulkPut(freshSites);

        await db.cachedTemplates.clear();
        for (const tpl of templates) {
          await db.cachedTemplates.put(tpl);
        }

        if (!cancelled) setSites(freshSites);
      } catch (err) {
        if (!cancelled) setRefreshError("Synchronisation des sites impossible pour le moment.");
      }
    }

    loadFromCache().then(refreshFromServer);
    return () => { cancelled = true; };
  }, [isOnline]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter(
      (s) => s.site_name.toLowerCase().includes(q) || s.site_code.toLowerCase().includes(q)
    );
  }, [sites, search]);

  return (
    <div className="app-shell">
      <TopBar />
      <div className="sites-page">
        <h1 className="sites-page__title">Sélectionner un site</h1>
        <p className="sites-page__subtitle">Choisissez un site puis le type d'audit à effectuer</p>

        <input
          className="text-input sites-page__search"
          placeholder="Rechercher par code ou nom…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {refreshError && <p className="sites-page__notice">{refreshError}</p>}

        {loading ? (
          <p className="sites-page__empty">Chargement des sites…</p>
        ) : filtered.length === 0 ? (
          <p className="sites-page__empty">
            {sites.length === 0
              ? "Aucun site en cache. Connecte-toi au réseau une première fois pour les télécharger."
              : "Aucun site ne correspond à ta recherche."}
          </p>
        ) : (
          <ul className="sites-page__list">
            {filtered.map((site) => (
              <li key={site.id} className="site-row">
                <div className="site-row__header">
                  <div className="site-row__main">
                    <span className="mono site-row__code">{site.site_code}</span>
                    <span className="site-row__name">{site.site_name}</span>
                  </div>
                  <div className="site-row__meta">
                    {site.cluster && <span className="pill site-row__pill">{site.cluster}</span>}
                    {site.site_type && <span className="site-row__type">{site.site_type}</span>}
                  </div>
                </div>
                <div className="site-row__forms">
                  {FORM_TYPES.map((f) => {
                    const Icon = f.icon;
                    return (
                      <button
                        key={f.type}
                        type="button"
                        className="form-card"
                        style={{ "--accent": f.accent }}
                        onClick={() => navigate(`/survey/${site.id}/${f.type}`)}
                      >
                        <div className="form-card__icon">
                          <Icon size={20} />
                        </div>
                        <div className="form-card__body">
                          <div className="form-card__title">{f.label}</div>
                          <div className="form-card__desc">{f.description}</div>
                        </div>
                        <ChevronRight size={18} className="form-card__arrow" />
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
