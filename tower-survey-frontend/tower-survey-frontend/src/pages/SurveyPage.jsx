import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Zap, Building2, AlertTriangle } from "lucide-react";
import { db } from "../db/db";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSync } from "../context/SyncContext";
import TopBar from "../components/TopBar";
import TowerRail from "../components/TowerRail";
import QuestionField from "../components/QuestionField";
import SiteSearch from "../components/SiteSearch";
import { getPhotoRequirements } from "../utils/photoRequirements";
import "./SurveyPage.css";

const FORM_META = {
  power: {
    label: "Power & Energy Audit",
    short: "Power Audit",
    icon: Zap,
    accent: "#f59e0b",
  },
  infra: {
    label: "Site Infrastructure Audit",
    short: "Site Infrastructure",
    icon: Building2,
    accent: "#3b82f6",
  },
};

function newDeviceId() {
  let id = localStorage.getItem("ti_device_id");
  if (!id) {
    id = `web-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem("ti_device_id", id);
  }
  return id;
}

export default function SurveyPage() {
  const { type } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { runSync } = useSync();

  const [site, setSite] = useState(null);
  const [template, setTemplate] = useState(null);
  const [draft, setDraft] = useState(null); // ligne Dexie draftResponses en cours
  const [answers, setAnswers] = useState({}); // { question_id: value }
  const [photos, setPhotos] = useState({}); // { question_id: Array<{ slot, previewUrl, blob, filename }> }
  const [sectionIndex, setSectionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitState, setSubmitState] = useState("idle"); // idle | saving | done
  const [navError, setNavError] = useState(null); // { message, photoId? }
  const [highlightedPhotoId, setHighlightedPhotoId] = useState(null);
  const gpsRef = useRef(null);

  // Map URL param -> template category
  const targetCategory = type === "power"
    ? "Power Audit"
    : type === "infra"
    ? "Site Infrastructure"
    : null;

  // ---- Chargement initial : template + sites (pour la recherche), reprise éventuelle d'un brouillon ----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      let templates = [];
      let useCache = true;

      if (navigator.onLine) {
        try {
          const [{ sites: freshSites }, { templates: freshTemplates }] = await Promise.all([
            api.getSites(),
            api.getActiveTemplates(),
          ]);

          await db.cachedSites.clear();
          await db.cachedSites.bulkPut(freshSites);
          await db.cachedTemplates.clear();
          for (const tpl of freshTemplates) {
            await db.cachedTemplates.put(tpl);
          }

          templates = freshTemplates;
          useCache = false;
        } catch {
          useCache = true;
        }
      }

      if (useCache) {
        templates = await db.cachedTemplates.toArray();
      }

      // Choisit le bon template selon la catégorie ciblée (ou fallback)
      const tpl = targetCategory
        ? templates.find((t) => t.category === targetCategory) || templates[0]
        : templates[0];

      // Pour les brouillons existants, on cherche le plus récent
      // pour ce template, peu importe le site (l'utilisateur a peut-être changé)
      const existingDraft = tpl
        ? await db.draftResponses
            .where({ template_id: tpl.id })
            .and((r) => r.status === "draft")
            .reverse()
            .sortBy("started_at")
            .then((rows) => rows[0] || null)
        : null;

      // Si on a un brouillon existant, on charge le site correspondant
      let resumedSite = null;
      if (existingDraft?.site_id) {
        try {
          const allSites = await db.cachedSites.toArray();
          resumedSite = allSites.find((s) => s.id === existingDraft.site_id) || null;
        } catch {
          resumedSite = null;
        }
      }

      let activeDraft = existingDraft;
      if (!activeDraft && tpl) {
        // Pas de brouillon — on en crée un, mais sans site_id (sera défini via SiteSearch)
        activeDraft = {
          client_uuid: crypto.randomUUID(),
          template_id: tpl.id,
          site_id: null,
          technician_id: user?.id,
          device_id: newDeviceId(),
          started_at: new Date().toISOString(),
          submitted_at: null,
          status: "draft",
          answers: [],
          gps_latitude: null,
          gps_longitude: null,
          gps_accuracy_m: null,
        };
        await db.draftResponses.put(activeDraft);
      }

      if (cancelled) return;
      setTemplate(tpl || null);
      setDraft(activeDraft || null);
      setSite(resumedSite);

      const answerMap = {};
      (activeDraft?.answers || []).forEach((a) => {
        answerMap[a.question_id] = a.value_json ?? a.value_text ?? a.value_number ?? a.value_boolean;
      });
      setAnswers(answerMap);
      setLoading(false);
    }

    load();

    // Capture GPS en tâche de fond dès l'ouverture du formulaire
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { gpsRef.current = pos.coords; },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const sections = template?.sections || [];
  const currentSection = sections[sectionIndex];

  const completedIndexes = useMemo(() => {
    const done = new Set();
    sections.forEach((section, i) => {
      const required = section.questions.filter((q) => q.is_required);
      const allAnswered = required.every((q) => {
        const v = answers[q.id];
        return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
      });
      if (required.length > 0 && allAnswered) done.add(i);
    });
    return done;
  }, [sections, answers]);

  const persistDraft = useCallback(
    async (nextAnswers) => {
      if (!draft) return;
      const answersArray = Object.entries(nextAnswers).map(([question_id, value]) => {
        const row = { question_id, value_text: null, value_number: null, value_boolean: null, value_json: null };
        if (typeof value === "number") row.value_number = value;
        else if (typeof value === "boolean") row.value_boolean = value;
        else if (Array.isArray(value)) row.value_json = value;
        else row.value_text = value;
        return row;
      });
      await db.draftResponses.update(draft.client_uuid, { answers: answersArray });
    },
    [draft]
  );

  function handleAnswerChange(questionId, value) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      persistDraft(next);
      return next;
    });
  }

  /**
   * Mappe les labels de questions (selon le template) à leurs clés fonctionnelles.
   * Permet de retrouver une question par son libellé (insensible à la casse / accents).
   */
  const QUESTION_KEYS = useMemo(() => {
    const map = {};
    sections.forEach((sec) => {
      sec.questions.forEach((q) => {
        const norm = (q.label || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (norm.includes("ihs site id") || norm === "ihs id") map.ihsId = q.id;
        else if (norm.includes("operator site id") || (norm.includes("site id") && norm.includes("reference"))) map.operatorSiteId = q.id;
        else if (norm === "site name" || norm.startsWith("site name")) map.siteName = q.id;
        else if (norm === "site id / reference" || norm === "site id/reference") map.siteIdRef = q.id;
        else if (norm.startsWith("region") || norm === "state") map.region = q.id;
      });
    });
    return map;
  }, [sections]);

  /**
   * Auto-remplit les champs d'identification du site à partir d'un site sélectionné
   * dans la barre de recherche, et met à jour le draft avec le site_id.
   * Laisse toujours l'utilisateur remplir :
   *   - Audit Date
   *   - Auditor Name(s)
   *   - SBC / Vendor
   *   - Number of Tenants
   */
  async function handleSiteSelected(pickedSite) {
    if (!pickedSite) {
      // L'utilisateur a effacé la sélection — on efface les champs auto-remplis
      setAnswers((prev) => {
        const next = { ...prev };
        if (QUESTION_KEYS.ihsId) delete next[QUESTION_KEYS.ihsId];
        if (QUESTION_KEYS.operatorSiteId) delete next[QUESTION_KEYS.operatorSiteId];
        if (QUESTION_KEYS.siteName) delete next[QUESTION_KEYS.siteName];
        if (QUESTION_KEYS.siteIdRef) delete next[QUESTION_KEYS.siteIdRef];
        if (QUESTION_KEYS.region) delete next[QUESTION_KEYS.region];
        persistDraft(next);
        return next;
      });
      setSite(null);
      if (draft) {
        await db.draftResponses.update(draft.client_uuid, { site_id: null });
      }
      return;
    }

    setAnswers((prev) => {
      const next = { ...prev };
      if (QUESTION_KEYS.ihsId) next[QUESTION_KEYS.ihsId] = pickedSite.site_code || "";
      if (QUESTION_KEYS.operatorSiteId) next[QUESTION_KEYS.operatorSiteId] = pickedSite.operator_site_id || "";
      if (QUESTION_KEYS.siteName) next[QUESTION_KEYS.siteName] = pickedSite.site_name || "";
      if (QUESTION_KEYS.siteIdRef) next[QUESTION_KEYS.siteIdRef] = pickedSite.site_code || "";
      if (QUESTION_KEYS.region) next[QUESTION_KEYS.region] = pickedSite.region || "";
      persistDraft(next);
      return next;
    });

    setSite(pickedSite);
    if (draft) {
      await db.draftResponses.update(draft.client_uuid, { site_id: pickedSite.id });
    }
  }

  async function handleCapturePhoto(questionId, file, slot = null) {
    const previewUrl = URL.createObjectURL(file);
    const entry = { slot, previewUrl, blob: file, filename: file.name };

    setPhotos((prev) => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      let next;
      if (slot != null) {
        // Mode slots nommés : on remplace la photo du même slot
        const filtered = current.filter((p) => p.slot !== slot);
        next = [...filtered, entry];
      } else {
        // Mode photo simple OU liste libre : on vérifie la limite photo_max
        const rules = currentQuestionRules(questionId);
        if (rules.isMulti) {
          const max = rules.multiMax || 4;
          if (current.length >= max) return prev; // limite atteinte, on ignore
          next = [...current, entry];
        } else {
          next = [entry];
        }
      }
      return { ...prev, [questionId]: next };
    });

    await db.queuedMedia.add({
      response_client_uuid: draft.client_uuid,
      question_id: questionId,
      slot: slot ?? null,
      blob: file,
      filename: file.name,
      status: "pending",
      gps_latitude: gpsRef.current?.latitude ?? null,
      gps_longitude: gpsRef.current?.longitude ?? null,
      captured_at: new Date().toISOString(),
    });
  }

  /**
   * Lit validation_rules pour la question courante, retourne
   *   { isMulti, multiMax, namedSlots }.
   * Utilisé par handleCapturePhoto pour appliquer la limite photo_max.
   */
  function currentQuestionRules(questionId) {
    const q = sections
      .flatMap((s) => s.questions)
      .find((x) => x.id === questionId);
    if (!q) return { isMulti: false, multiMax: null, namedSlots: null };
    const rules = q.validation_rules || {};
    const namedSlots = Array.isArray(rules.photo_slots) ? rules.photo_slots.filter((s) => typeof s === "string" && s.trim() !== "") : null;
    const isMulti = !!rules.photo_multi && !namedSlots;
    const multiMax = Number.isFinite(rules.photo_max) && rules.photo_max > 0 ? Math.floor(rules.photo_max) : null;
    return { isMulti, multiMax, namedSlots };
  }

  /**
   * Vérifie que la section courante n'a aucune photo requise manquante.
   * Retourne un objet { ok, blocking: [{ question, reason }] }.
   */
  const validateCurrentSectionPhotos = useCallback(() => {
    const sec = sections[sectionIndex];
    if (!sec) return { ok: true, blocking: [] };
    const reqs = getPhotoRequirements(sec.questions, answers, photos);
    const blocking = reqs.filter((r) => r.missing);
    return { ok: blocking.length === 0, blocking };
  }, [sections, sectionIndex, answers, photos]);

  /**
   * Tente de naviguer vers la section `targetIndex`.
   * Si on AVANCE (vers la droite) et qu'il y a des photos manquantes dans la
   * section courante, on bloque et on met en évidence le premier champ photo.
   */
  function goToSection(targetIndex) {
    const clamped = Math.max(0, Math.min(sections.length - 1, targetIndex));
    const goingForward = clamped > sectionIndex;

    if (goingForward) {
      const { ok, blocking } = validateCurrentSectionPhotos();
      if (!ok) {
        const first = blocking[0];
        setNavError({
          message: `Photo obligatoire : ${first.reason === "tier1"
            ? "au moins une preuve contractuelle IHS est manquante dans cette section."
            : "au moins une anomalie a été signalée dans cette section."}`,
          photoId: first.question.id,
        });
        setHighlightedPhotoId(first.question.id);
        // Flash puis reset après 5s pour éviter que ça reste bloqué visuellement
        setTimeout(() => setHighlightedPhotoId(null), 5000);
        // Scroll vers la photo bloquante
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-qid="${first.question.id}"]`);
          if (el && typeof el.scrollIntoView === "function") {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        });
        return;
      }
    }

    setNavError(null);
    setSectionIndex(clamped);
  }

  async function handleSubmit() {
    if (!site) {
      // L'utilisateur doit d'abord sélectionner un site
      setSectionIndex(0);
      setNavError({
        message: "Veuillez d'abord sélectionner un site dans la barre de recherche de la première section.",
      });
      return;
    }

    // Vérifie TOUTES les sections (pas seulement la dernière) pour les photos Tier 1/2 manquantes
    const allBlocking = [];
    sections.forEach((sec, idx) => {
      const reqs = getPhotoRequirements(sec.questions, answers, photos);
      reqs.filter((r) => r.missing).forEach((r) => {
        allBlocking.push({ ...r, sectionIndex: idx, sectionTitle: sec.title });
      });
    });
    if (allBlocking.length > 0) {
      const first = allBlocking[0];
      setSectionIndex(first.sectionIndex);
      setHighlightedPhotoId(first.question.id);
      setNavError({
        message: `${allBlocking.length} photo(s) obligatoire(s) manquante(s) — section « ${first.sectionTitle} ».`,
        photoId: first.question.id,
      });
      setTimeout(() => setHighlightedPhotoId(null), 5000);
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-qid="${first.question.id}"]`);
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      return;
    }

    setNavError(null);
    setSubmitState("saving");

    const coords = gpsRef.current;
    await db.draftResponses.update(draft.client_uuid, {
      status: "queued",
      submitted_at: new Date().toISOString(),
      gps_latitude: coords?.latitude ?? null,
      gps_longitude: coords?.longitude ?? null,
      gps_accuracy_m: coords?.accuracy ?? null,
    });

    setSubmitState("done");
    runSync(); // tente une sync immédiate si en ligne ; sinon la queue le fera au retour réseau
    setTimeout(() => navigate("/sites", { replace: true }), 900);
  }

  const missingRequiredCount = sections.length - completedIndexes.size;
  const isLastSection = sectionIndex === sections.length - 1;

  if (loading) {
    return (
      <div className="app-shell">
        <TopBar />
        <p className="survey-page__loading">Chargement du formulaire…</p>
      </div>
    );
  }

  if (!template || sections.length === 0) {
    return (
      <div className="app-shell">
        <TopBar />
        <p className="survey-page__loading">
          Aucun template d'audit en cache. Connecte-toi au réseau une première fois pour le télécharger.
        </p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar />

      {type && FORM_META[type] && (
        <div
          className="survey-page__form-banner"
          style={{ "--accent": FORM_META[type].accent }}
        >
          {(() => {
            const Icon = FORM_META[type].icon;
            return (
              <>
                <div className="survey-page__form-banner-icon">
                  <Icon size={18} />
                </div>
                <div className="survey-page__form-banner-text">
                  <span className="survey-page__form-banner-label">Formulaire actif</span>
                  <span className="survey-page__form-banner-title">{FORM_META[type].label}</span>
                </div>
                <button
                  type="button"
                  className="survey-page__form-banner-switch"
                  onClick={() => navigate("/sites")}
                >
                  Changer
                </button>
              </>
            );
          })()}
        </div>
      )}

      <div className="survey-page__site">
        {site ? (
          <>
            <span className="mono survey-page__site-code">{site.site_code}</span>
            <span className="survey-page__site-name">{site.site_name}</span>
          </>
        ) : (
          <span className="survey-page__site-name survey-page__site-name--muted">
            Aucun site sélectionné — cherchez ci-dessous ↓
          </span>
        )}
      </div>

      <div className="survey-page__body">
        <TowerRail
          sections={sections}
          currentIndex={sectionIndex}
          completedIndexes={completedIndexes}
          onSelect={goToSection}
        />

        <div className="survey-page__form card">
          <h2 className="survey-page__section-title">{currentSection.title}</h2>

          {currentSection.title === "Site Identification" && (
            <SiteSearch onSelect={handleSiteSelected} initialValue={site} />
          )}

          {navError && (
            <div className="survey-page__nav-error" role="alert">
              <AlertTriangle size={18} />
              <div>
                <strong>Action requise :</strong> {navError.message}
              </div>
              <button
                type="button"
                className="survey-page__nav-error-close"
                onClick={() => setNavError(null)}
                aria-label="Fermer l'alerte"
              >
                ×
              </button>
            </div>
          )}

          {currentSection.questions.map((q) => {
            const photoReq = q.question_type === "photo"
              ? getPhotoRequirements([q], answers, photos)[0]
              : null;
            const required = photoReq?.required || false;
            const reason = photoReq?.reason || "tier3";
            return (
              <div key={q.id} data-qid={q.id}>
                <QuestionField
                  question={q}
                  value={answers[q.id]}
                  onChange={(v) => handleAnswerChange(q.id, v)}
                  photos={photos[q.id] || []}
                  onCapturePhoto={(file, slot) => handleCapturePhoto(q.id, file, slot)}
                  required={required}
                  requiredReason={reason}
                  highlight={highlightedPhotoId === q.id}
                />
              </div>
            );
          })}

          <div className="survey-page__nav">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={sectionIndex === 0}
              onClick={() => goToSection(sectionIndex - 1)}
            >
              ← Précédent
            </button>

            {isLastSection ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={submitState !== "idle"}
              >
                {submitState === "saving" ? "Enregistrement…" : submitState === "done" ? "✓ Enregistré" : "Terminer l'audit"}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => goToSection(sectionIndex + 1)}>
                Suivant →
              </button>
            )}
          </div>

          {isLastSection && missingRequiredCount > 0 && (
            <p className="survey-page__warning">
              {missingRequiredCount} section(s) ont des champs obligatoires manquants. Tu peux quand même
              soumettre — vérifie via le rail de navigation ci-contre.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
