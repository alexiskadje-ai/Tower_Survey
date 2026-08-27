import { useRef } from "react";
import { Camera, RefreshCw, Check, AlertTriangle, ImageOff } from "lucide-react";
import "./QuestionField.css";

/**
 * Rend le bon widget selon question.question_type.
 * `value` / `onChange` portent la valeur "brute" (texte, nombre, tableau, etc.)
 * `photo` porte { previewUrl } si une photo a déjà été prise pour cette question.
 *
 * Props photo additionnelles :
 *   - required: booléen — la photo est obligatoire (Tier 1 ou Tier 2 déclenché)
 *   - requiredReason: 'tier1' | 'tier2' | 'tier3' — affiché en badge
 *   - highlight: booléen — pour faire pulser le champ quand la navigation le pointe
 */
export default function QuestionField({
  question,
  value,
  onChange,
  photo,
  onCapturePhoto,
  required = false,
  requiredReason = "tier3",
  highlight = false,
}) {
  const fileInputRef = useRef(null);
  const options = Array.isArray(question.options) ? question.options : [];

  const label = (
    <label className="field-label qfield__label">
      {question.label}
      {question.is_required && <span className="qfield__required"> *</span>}
      {question.unit && <span className="qfield__unit"> ({question.unit})</span>}
    </label>
  );

  switch (question.question_type) {
    case "text":
      return (
        <div className="qfield">
          {label}
          <textarea
            className="text-input qfield__textarea"
            rows={2}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Saisir une observation…"
          />
        </div>
      );

    case "number":
      return (
        <div className="qfield">
          {label}
          <input
            type="number"
            inputMode="decimal"
            className="text-input"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
      );

    case "date":
      return (
        <div className="qfield">
          {label}
          <input
            type="date"
            className="text-input"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );

    case "boolean":
      return (
        <div className="qfield">
          {label}
          <div className="qfield__choices">
            {["Oui", "Non"].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`qfield__choice ${value === opt ? "is-selected" : ""}`}
                onClick={() => onChange(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );

    case "select":
      return (
        <div className="qfield">
          {label}
          <div className="qfield__choices">
            {options.map((opt) => {
              const tone = opt === "OK" ? "ok" : opt === "NOK" ? "nok" : "";
              return (
                <button
                  key={opt}
                  type="button"
                  className={`qfield__choice qfield__choice--${tone} ${value === opt ? "is-selected" : ""}`}
                  onClick={() => onChange(opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      );

    case "multiselect": {
      const selected = Array.isArray(value) ? value : [];
      const toggle = (opt) =>
        onChange(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]);
      return (
        <div className="qfield">
          {label}
          <div className="qfield__choices">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`qfield__choice ${selected.includes(opt) ? "is-selected" : ""}`}
                onClick={() => toggle(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );
    }

    case "photo": {
      const hasPhoto = !!photo?.previewUrl;
      const missing = required && !hasPhoto;
      const tierLabel = requiredReason === "tier1" ? "Preuve contractuelle IHS"
        : requiredReason === "tier2" ? "Photo conditionnelle (anomalie détectée)"
        : "Photo libre";
      return (
        <div className={`qfield ${missing ? "qfield--missing" : ""} ${highlight ? "qfield--highlight" : ""}`}>
          <div className="qfield__label-row">
            {label}
            {required && (
              <span className={`qfield__photo-tier qfield__photo-tier--${requiredReason}`}>
                {requiredReason === "tier1" ? <AlertTriangle size={11} /> : <Camera size={11} />}
                {tierLabel}
              </span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="qfield__hidden-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCapturePhoto(file);
            }}
          />
          {hasPhoto ? (
            <div className="qfield__photo-card">
              <div className="qfield__photo-frame">
                <img src={photo.previewUrl} alt="Photo capturée" />
                <div className="qfield__photo-check">
                  <Check size={14} />
                </div>
              </div>
              <div className="qfield__photo-actions">
                <button
                  type="button"
                  className="qfield__photo-action qfield__photo-action--secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <RefreshCw size={14} />
                  Reprendre
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`qfield__photo-cta ${required ? "qfield__photo-cta--required" : ""}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="qfield__photo-cta-icon">
                {required ? <Camera size={22} /> : <ImageOff size={20} />}
              </div>
              <div className="qfield__photo-cta-text">
                <div className="qfield__photo-cta-title">
                  {required ? "Prendre une photo" : "Ajouter une photo (optionnel)"}
                </div>
                <div className="qfield__photo-cta-sub">
                  {required
                    ? "Caméra arrière recommandée · JPG/PNG"
                    : "Tap pour ouvrir l'appareil photo"}
                </div>
              </div>
            </button>
          )}
        </div>
      );
    }

    default:
      return (
        <div className="qfield">
          {label}
          <input
            className="text-input"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}
