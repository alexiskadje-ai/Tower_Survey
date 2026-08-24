import { useRef } from "react";
import "./QuestionField.css";

/**
 * Rend le bon widget selon question.question_type.
 * `value` / `onChange` portent la valeur "brute" (texte, nombre, tableau, etc.)
 * `photo` porte { previewUrl } si une photo a déjà été prise pour cette question.
 */
export default function QuestionField({ question, value, onChange, photo, onCapturePhoto }) {
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

    case "photo":
      return (
        <div className="qfield">
          {label}
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
          {photo?.previewUrl ? (
            <button type="button" className="qfield__photo-preview" onClick={() => fileInputRef.current?.click()}>
              <img src={photo.previewUrl} alt="Photo capturée" />
              <span className="qfield__photo-retake">Reprendre</span>
            </button>
          ) : (
            <button
              type="button"
              className="qfield__photo-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              📷 Prendre une photo
            </button>
          )}
        </div>
      );

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
