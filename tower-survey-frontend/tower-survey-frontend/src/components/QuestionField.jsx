import { useRef } from "react";
import { Camera, RefreshCw, Check, AlertTriangle, ImageOff, Plus } from "lucide-react";
import "./QuestionField.css";

/**
 * Rend le bon widget selon question.question_type.
 *
 * Props photo :
 *   - photos : Array<{ slot: string|null, previewUrl: string, blob?: File }>
 *       La nouvelle API. Pour une question "photo simple" (pas de validation_rules)
 *       le tableau contient au plus 1 entrée. Pour les slots nommés, une entrée
 *       par slot. Pour la liste libre, jusqu'à photo_max entrées.
 *   - photo  : { previewUrl } (legacy, conservée pour rétro-compatibilité) —
 *       si `photos` n'est pas fourni et que `photo` l'est, on l'utilise pour le
 *       mode "photo simple".
 *   - onCapturePhoto(file, slot) : appelé quand le technicien prend une photo.
 *       `slot` est null pour la liste libre, ou le nom du slot pour les slots
 *       nommés. L'appelant (SurveyPage) est responsable de mettre à jour la
 *       queue Dexie.
 *   - required / requiredReason / highlight : badges + animations Tier 1/2/3.
 */
export default function QuestionField({
  question,
  value,
  onChange,
  photo,
  photos: photosProp,
  onCapturePhoto,
  required = false,
  requiredReason = "tier3",
  highlight = false,
}) {
  const fileInputRef = useRef(null);
  const pendingSlotRef = useRef(null);
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
      const rules = question.validation_rules || {};
      const namedSlots = Array.isArray(rules.photo_slots) ? rules.photo_slots.filter((s) => typeof s === "string" && s.trim() !== "") : null;
      const isMulti = !!rules.photo_multi;
      const multiMax = Number.isFinite(rules.photo_max) && rules.photo_max > 0 ? Math.floor(rules.photo_max) : null;

      // Normalisation de la liste de photos, peu importe la prop utilisée
      let photos = [];
      if (Array.isArray(photosProp)) {
        photos = photosProp;
      } else if (photo && photo.previewUrl) {
        photos = [{ slot: null, previewUrl: photo.previewUrl }];
      }

      const tierLabel = requiredReason === "tier1" ? "Preuve contractuelle IHS"
        : requiredReason === "tier2" ? "Photo conditionnelle (anomalie détectée)"
        : "Photo libre";

      // --------- MODE 1 : SLOTS NOMMÉS (ex: Avant / Après) ---------
      if (namedSlots && namedSlots.length > 0) {
        const missing = required && namedSlots.some((s) => !photos.find((p) => p.slot === s));
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
                if (file && onCapturePhoto) onCapturePhoto(file, pendingSlotRef.current);
                pendingSlotRef.current = null;
                e.target.value = "";
              }}
            />
            <div className="qfield__photo-slots">
              {namedSlots.map((slotName) => {
                const p = photos.find((x) => x.slot === slotName);
                const slotRequired = required && !p;
                return (
                  <div key={slotName} className={`qfield__photo-slot ${slotRequired ? "qfield__photo-slot--required" : ""}`}>
                    <div className="qfield__photo-slot-label">{slotName}</div>
                    {p ? (
                      <div className="qfield__photo-card">
                        <div className="qfield__photo-frame">
                          <img src={p.previewUrl} alt={`Photo ${slotName}`} />
                          <div className="qfield__photo-check">
                            <Check size={14} />
                          </div>
                        </div>
                        <div className="qfield__photo-actions">
                          <button
                            type="button"
                            className="qfield__photo-action qfield__photo-action--secondary"
                            onClick={() => {
                              pendingSlotRef.current = slotName;
                              fileInputRef.current?.click();
                            }}
                          >
                            <RefreshCw size={14} />
                            Reprendre
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`qfield__photo-cta ${slotRequired ? "qfield__photo-cta--required" : ""}`}
                        onClick={() => {
                          pendingSlotRef.current = slotName;
                          fileInputRef.current?.click();
                        }}
                      >
                        <div className="qfield__photo-cta-icon">
                          {slotRequired ? <Camera size={22} /> : <ImageOff size={20} />}
                        </div>
                        <div className="qfield__photo-cta-text">
                          <div className="qfield__photo-cta-title">
                            {slotRequired ? `Photo « ${slotName} »` : `Ajouter « ${slotName} »`}
                          </div>
                          <div className="qfield__photo-cta-sub">
                            Caméra arrière · JPG/PNG
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      // --------- MODE 2 : LISTE LIBRE (photo_multi) ---------
      if (isMulti) {
        const max = multiMax || 4;
        const count = photos.length;
        const canAdd = count < max;
        const missing = required && count === 0;
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
                if (file && onCapturePhoto) onCapturePhoto(file, null);
                e.target.value = "";
              }}
            />
            {count > 0 && (
              <div className="qfield__photo-multi-grid">
                {photos.map((p, idx) => (
                  <div key={idx} className="qfield__photo-card">
                    <div className="qfield__photo-frame">
                      <img src={p.previewUrl} alt={`Photo ${idx + 1}`} />
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
                ))}
              </div>
            )}
            {canAdd ? (
              <button
                type="button"
                className={`qfield__photo-cta qfield__photo-cta--add ${required && count === 0 ? "qfield__photo-cta--required" : ""}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="qfield__photo-cta-icon">
                  <Plus size={20} />
                </div>
                <div className="qfield__photo-cta-text">
                  <div className="qfield__photo-cta-title">
                    {count === 0 ? "Ajouter une photo" : "Ajouter une autre photo"}
                  </div>
                  <div className="qfield__photo-cta-sub">
                    {count}/{max} — caméra arrière recommandée
                  </div>
                </div>
              </button>
            ) : (
              <p className="qfield__photo-limit">Limite atteinte : {max} photo(s) maximum.</p>
            )}
          </div>
        );
      }

      // --------- MODE 3 : PHOTO SIMPLE (comportement historique) ---------
      const hasPhoto = photos.length > 0;
      const missingSimple = required && !hasPhoto;
      return (
        <div className={`qfield ${missingSimple ? "qfield--missing" : ""} ${highlight ? "qfield--highlight" : ""}`}>
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
              if (file && onCapturePhoto) onCapturePhoto(file, null);
              e.target.value = "";
            }}
          />
          {hasPhoto ? (
            <div className="qfield__photo-card">
              <div className="qfield__photo-frame">
                <img src={photos[0].previewUrl} alt="Photo capturée" />
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
