import "./TowerRail.css";

/**
 * Élément signature de l'app : la navigation entre sections du survey
 * est représentée comme une ascension de pylône treillis (clin d'œil direct
 * au métier du technicien ET au pictogramme du logo TeleInfra).
 * Chaque "nœud" = une section. Le remplissage teal monte à mesure
 * que l'audit progresse, comme un technicien qui grimpe le pylône.
 */
export default function TowerRail({ sections, currentIndex, completedIndexes, onSelect }) {
  return (
    <nav className="tower-rail" aria-label="Progression de l'audit par section">
      <div className="tower-rail__lattice" aria-hidden="true" />
      <ol className="tower-rail__list">
        {sections.map((section, i) => {
          const isDone = completedIndexes.has(i);
          const isCurrent = i === currentIndex;
          return (
            <li key={section.id} className="tower-rail__item">
              <button
                type="button"
                className={`tower-rail__node ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}
                onClick={() => onSelect(i)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${section.title}${isDone ? " — complétée" : ""}`}
              >
                {isDone ? "✓" : i + 1}
              </button>
              <span className={`tower-rail__label ${isCurrent ? "is-current" : ""}`}>{section.title}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
