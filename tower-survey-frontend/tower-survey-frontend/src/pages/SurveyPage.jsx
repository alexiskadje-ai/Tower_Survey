import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Zap, Building2 } from "lucide-react";
import { db } from "../db/db";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSync } from "../context/SyncContext";
import TopBar from "../components/TopBar";
import TowerRail from "../components/TowerRail";
import QuestionField from "../components/QuestionField";
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
  const { siteId, type } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { runSync } = useSync();

  const [site, setSite] = useState(null);
  const [template, setTemplate] = useState(null);
  const [draft, setDraft] = useState(null); // ligne Dexie draftResponses en cours
  const [answers, setAnswers] = useState({}); // { question_id: value }
  const [photos, setPhotos] = useState({}); // { question_id: { previewUrl, blob, filename } }
  const [sectionIndex, setSectionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitState, setSubmitState] = useState("idle"); // idle | saving | done
  const gpsRef = useRef(null);

  // Map URL param -> template category
  const targetCategory = type === "power"
    ? "Power Audit"
    : type === "infra"
    ? "Site Infrastructure"
    : null;

  // ---- Chargement initial : site, template actif, reprise éventuelle d'un brouillon ----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      let siteRow = null;
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

          siteRow = freshSites.find((s) => s.id === siteId) || null;
          templates = freshTemplates;
          useCache = false;
        } catch {
          useCache = true;
        }
      }

      if (useCache) {
        [siteRow, templates] = await Promise.all([
          db.cachedSites.get(siteId),
          db.cachedTemplates.toArray(),
        ]);
      }

      // Choisit le bon template selon la catégorie ciblée (ou fallback)
      const tpl = targetCategory
        ? templates.find((t) => t.category === targetCategory) || templates[0]
        : templates[0];

      // Reprend un brouillon existant non encore soumis pour ce site + ce template
      const existingDraft = tpl
        ? await db.draftResponses
            .where({ site_id: siteId, template_id: tpl.id })
            .and((r) => r.status === "draft")
            .first()
        : null;

      let activeDraft = existingDraft;
      if (!activeDraft && tpl) {
        activeDraft = {
          client_uuid: crypto.randomUUID(),
          template_id: tpl.id,
          site_id: siteId,
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
      setSite(siteRow || null);
      setTemplate(tpl || null);
      setDraft(activeDraft || null);

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
  }, [siteId, type]);

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

  async function handleCapturePhoto(questionId, file) {
    const previewUrl = URL.createObjectURL(file);
    setPhotos((prev) => ({ ...prev, [questionId]: { previewUrl, blob: file, filename: file.name } }));

    await db.queuedMedia.add({
      response_client_uuid: draft.client_uuid,
      question_id: questionId,
      blob: file,
      filename: file.name,
      status: "pending",
      gps_latitude: gpsRef.current?.latitude ?? null,
      gps_longitude: gpsRef.current?.longitude ?? null,
      captured_at: new Date().toISOString(),
    });
  }

  function goToSection(i) {
    setSectionIndex(Math.max(0, Math.min(sections.length - 1, i)));
  }

  async function handleSubmit() {
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
        <span className="mono survey-page__site-code">{site?.site_code || "—"}</span>
        <span className="survey-page__site-name">{site?.site_name || "Site inconnu (hors cache)"}</span>
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

          {currentSection.questions.map((q) => (
            <QuestionField
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={(v) => handleAnswerChange(q.id, v)}
              photo={photos[q.id]}
              onCapturePhoto={(file) => handleCapturePhoto(q.id, file)}
            />
          ))}

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
