import { useState, useEffect, useRef } from "react";
import { Search, MapPin, X, Check } from "lucide-react";
import "./SiteSearch.css";

/**
 * SiteSearch — search bar for auto-filling site identification fields.
 *
 * Props:
 *  - onSelect(site): called with the chosen site object when the user picks one
 *  - initialValue: optional pre-filled site to show as "selected" on mount
 *  - placeholder: input placeholder text
 */
export default function SiteSearch({ onSelect, initialValue = null, placeholder = "Rechercher un site (IHS ID, nom, ville...)" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (selected) return; // don't search if a site is already selected
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { api } = await import("../api/client");
        const data = await api.getSites({ search: query.trim(), limit: 8 });
        setResults(data.sites || []);
        setOpen(true);
      } catch (err) {
        setError(err.message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  function pickSite(site) {
    setSelected(site);
    setQuery("");
    setResults([]);
    setOpen(false);
    if (onSelect) onSelect(site);
  }

  function clearSelection() {
    setSelected(null);
    setResults([]);
    setQuery("");
    setOpen(false);
    if (onSelect) onSelect(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className="site-search" ref={containerRef}>
      <div className="site-search__field">
        <Search size={18} className="site-search__icon" />
        <input
          ref={inputRef}
          className="site-search__input"
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          disabled={!!selected}
        />
        {loading && <span className="site-search__spinner" aria-label="Recherche…">…</span>}
      </div>

      {selected && (
        <div className="site-search__selected">
          <Check size={16} className="site-search__selected-icon" />
          <div className="site-search__selected-body">
            <div className="site-search__selected-line">
              <span className="site-search__label">IHS ID:</span>
              <span className="mono site-search__value">{selected.site_code}</span>
              {selected.operator_site_id && selected.operator_site_id !== selected.site_code && (
                <>
                  <span className="site-search__sep">·</span>
                  <span className="site-search__label">Op ID:</span>
                  <span className="mono site-search__value">{selected.operator_site_id}</span>
                </>
              )}
            </div>
            <div className="site-search__selected-name">{selected.site_name}</div>
            {selected.cluster && (
              <div className="site-search__selected-meta">
                <MapPin size={12} />
                {[selected.cluster, selected.region, selected.address_village]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>
          <button
            type="button"
            className="site-search__clear"
            onClick={clearSelection}
            title="Changer de site"
            aria-label="Effacer la sélection"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {open && !selected && query.trim().length >= 2 && (
        <ul className="site-search__results" role="listbox">
          {loading && <li className="site-search__empty">Recherche…</li>}
          {!loading && error && <li className="site-search__error">{error}</li>}
          {!loading && !error && results.length === 0 && (
            <li className="site-search__empty">Aucun site trouvé pour « {query} ».</li>
          )}
          {!loading && !error && results.map((s) => (
            <li
              key={s.id}
              role="option"
              aria-selected="false"
              className="site-search__item"
              onClick={() => pickSite(s)}
            >
              <div className="site-search__item-line">
                <span className="mono site-search__item-code">{s.site_code}</span>
                {s.operator_site_id && s.operator_site_id !== s.site_code && (
                  <span className="mono site-search__item-opid">({s.operator_site_id})</span>
                )}
                {s.cluster && <span className="pill site-search__item-cluster">{s.cluster}</span>}
                {s.site_type && <span className="site-search__item-type">{s.site_type}</span>}
              </div>
              <div className="site-search__item-name">{s.site_name}</div>
              {s.address_village && (
                <div className="site-search__item-meta">
                  <MapPin size={11} />
                  {[s.address_village, s.department, s.region]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
