import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { db } from "../db/db";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import "./SitesPage.css";

export default function SitesPage() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const [sites, setSites] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState(null);

  // Au montage : charger le cache local immédiatement, puis rafraîchir depuis
  // le serveur si en ligne (sites + template actif, pour usage 100% offline ensuite).
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
              <li key={site.id}>
                <button
                  type="button"
                  className="site-card"
                  onClick={() => navigate(`/survey/${site.id}`)}
                >
                  <div className="site-card__main">
                    <span className="site-card__code mono">{site.site_code}</span>
                    <span className="site-card__name">{site.site_name}</span>
                  </div>
                  <div className="site-card__meta">
                    {site.cluster && <span className="pill site-card__pill">{site.cluster}</span>}
                    {site.site_type && <span className="site-card__type">{site.site_type}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
