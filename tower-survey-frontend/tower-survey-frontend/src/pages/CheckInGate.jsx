import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Camera, MapPin, Check, AlertTriangle, ArrowLeft, UserPlus, RefreshCw } from "lucide-react";
import { db } from "../db/db";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSync } from "../context/SyncContext";
import { useDeviceFingerprint } from "../hooks/useDeviceFingerprint";
import TopBar from "../components/TopBar";
import "./CheckInGate.css";

/**
 * CheckInGate — étape de vérification de présence à deux techniciens
 * (lead + assistant) avant déblocage du formulaire d'audit.
 *
 * Étapes :
 *  1. À l'arrivée : crée une checkin_session (locale + serveur si online).
 *  2. Étape 1 (lead) : selfie + GPS, soumission immédiate, queue offline
 *     si pas de réseau.
 *  3. Étape 2 (assistant) : email/mot de passe du 2e technicien, puis
 *     même capture selfie + GPS.
 *  4. Quand les deux sont capturés (online ou offline), on route vers
 *     /survey/:type?session=… en passant l'id de session.
 *
 * Offline-first : tout est persisté dans IndexedDB ; on n'attend JAMAIS
 * le réseau pour permettre de continuer.
 */
export default function CheckInGate() {
  const { type } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { runSync, refreshPendingCount } = useSync();
  const fingerprint = useDeviceFingerprint();

  const [session, setSession] = useState(null); // { id, client_uuid, status, ... }
  const [step, setStep] = useState("lead"); // 'lead' | 'assistant-creds' | 'assistant-capture' | 'done'
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  // Pour la 2e étape : credentials de l'assistant
  const [assistantId, setAssistantId] = useState("");
  const [assistantPwd, setAssistantPwd] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [assistantVerified, setAssistantVerified] = useState(null); // { userId, name } | null

  // Pour la capture (lead et assistant partagent ce sous-composant)
  const [capturing, setCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState(null); // string
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // ----- 1. Création/récupération de la session à l'arrivée -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const clientUuid = crypto.randomUUID();
      // Enregistre une session locale immédiatement (offline-first)
      const local = {
        id: clientUuid, // id local = client_uuid (le serveur fera le sien)
        client_uuid: clientUuid,
        template_id: type,
        status: "awaiting_checkins",
        created_at: new Date().toISOString(),
      };
      await db.checkinSessions.put(local);
      if (cancelled) return;
      setSession(local);

      // Tente de créer côté serveur (no-op si offline)
      if (navigator.onLine) {
        try {
          const server = await api.createCheckinSession({ client_uuid: clientUuid });
          if (!cancelled) {
            await db.checkinSessions.update(local.id, { server_id: server.id });
            setSession((s) => ({ ...s, server_id: server.id }));
          }
        } catch {
          // pas grave : on retentera plus tard
        }
      }
    })();
    return () => { cancelled = true; };
  }, [type]);

  // ----- 2. Capture GPS + selfie, partagés lead / assistant -----
  const captureGps = useCallback(() => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Géolocalisation indisponible"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        gps_accuracy_meters: pos.coords.accuracy,
      }),
      (err) => reject(new Error(`GPS: ${err.message}`)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }), []);

  const startCamera = useCallback(async () => {
    setError(null);
    setCaptureStatus("Activation de la caméra…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCapturing(true);
      setCaptureStatus("Cadre ton visage et appuie sur le bouton.");
    } catch (err) {
      setError(`Caméra: ${err.message}`);
      setCaptureStatus(null);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCapturing(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const captureSelfie = useCallback(async () => {
    if (!videoRef.current) return null;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 720;
    canvas.height = v.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob;
  }, []);

  /**
   * Capture + soumission d'un check-in pour un rôle donné.
   * @param {"lead"|"assistant"} role
   * @param {string|null} userIdOverride requis pour assistant après verify
   */
  const handleCheckin = useCallback(async (role, userIdOverride = null) => {
    if (!session) return;
    setError(null);
    setInfo(null);

    let coords;
    try {
      coords = await captureGps();
    } catch (err) {
      setError(err.message);
      return;
    }

    if (!capturing) {
      await startCamera();
      return; // l'utilisateur rappuiera sur le bouton principal après
    }

    setCaptureStatus("Capture du selfie…");
    const blob = await captureSelfie();
    stopCamera();
    if (!blob) { setError("Échec capture selfie."); return; }

    const capturedAt = new Date().toISOString();
    const filename = `selfie-${role}-${Date.now()}.jpg`;

    // Persiste en local AVANT toute tentative réseau (offline-first)
    const localRow = {
      session_id: session.id,
      session_client_uuid: session.client_uuid,
      role,
      user_id: userIdOverride || (role === "lead" ? user?.id : null),
      blob,
      filename,
      latitude: coords.latitude,
      longitude: coords.longitude,
      gps_accuracy_meters: coords.gps_accuracy_meters,
      device_fingerprint: fingerprint,
      captured_at: capturedAt,
      status: "pending",
    };
    const localId = await db.queuedCheckins.add(localRow);

    // Tente l'envoi immédiat si online
    if (navigator.onLine) {
      try {
        let serverSessionId = session.server_id;
        if (!serverSessionId) {
          const s = await api.createCheckinSession({ client_uuid: session.client_uuid });
          serverSessionId = s.id;
          await db.checkinSessions.update(session.id, { server_id: serverSessionId });
        }
        const formData = new FormData();
        formData.append("file", blob, filename);
        formData.append("session_id", serverSessionId);
        formData.append("role", role);
        if (userIdOverride) formData.append("user_id_override", userIdOverride);
        formData.append("latitude", String(coords.latitude));
        formData.append("longitude", String(coords.longitude));
        formData.append("gps_accuracy_meters", String(coords.gps_accuracy_meters));
        if (fingerprint) formData.append("device_fingerprint", fingerprint);
        formData.append("captured_at", capturedAt);
        const result = await api.uploadCheckinSelfie(formData);
        await db.queuedCheckins.update(localId, { status: "uploaded", server_response: result });
        if (result.flagged) {
          setInfo(`⚠️ Check-in signalé pour vérification (${result.flagReason || "à examiner"}).`);
        }
      } catch (err) {
        await db.queuedCheckins.update(localId, { status: "pending", error: err.message });
        setInfo("Check-in sauvegardé localement — il sera envoyé automatiquement dès le retour réseau.");
      }
    } else {
      setInfo("Hors ligne — check-in sauvegardé, il sera envoyé au retour réseau.");
    }

    refreshPendingCount();

    if (role === "lead") {
      setStep("assistant-creds");
    } else {
      setStep("done");
      // Petite pause puis navigation vers le formulaire
      setTimeout(() => navigate(`/survey/${type}?session=${session.id}`), 1200);
    }
  }, [session, capturing, user, fingerprint, type, navigate, captureGps, startCamera, stopCamera, captureSelfie, refreshPendingCount]);

  // ----- 3. Vérification credentials assistant -----
  const handleVerifyAssistant = useCallback(async (e) => {
    e.preventDefault();
    setVerifying(true);
    setError(null);
    try {
      const result = await api.verifySecondTechnician({
        email: assistantId.trim(),
        password: assistantPwd,
      });
      setAssistantVerified(result);
      setStep("assistant-capture");
    } catch (err) {
      setError(err.status === 401 ? "Identifiants invalides." : (err.message || "Échec vérification."));
    } finally {
      setVerifying(false);
    }
  }, [assistantId, assistantPwd]);

  if (!session) {
    return (
      <div className="app-shell">
        <TopBar />
        <p className="checkin-gate__loading">Préparation du contrôle de présence…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="checkin-gate">
        <div className="checkin-gate__header">
          <button type="button" className="checkin-gate__back" onClick={() => navigate("/sites")}>
            <ArrowLeft size={18} /> Retour
          </button>
          <h1 className="checkin-gate__title">Contrôle de présence</h1>
          <p className="checkin-gate__subtitle">
            Deux techniciens doivent vérifier leur présence sur site avant l'audit.
          </p>
        </div>

        <ol className="checkin-gate__steps" aria-label="Progression">
          <li className={step === "lead" ? "is-current" : "is-done"}>
            <span className="checkin-gate__step-index">1</span>
            <span>Lead</span>
            {step !== "lead" && <Check size={16} aria-hidden="true" />}
          </li>
          <li className={
            step === "assistant-creds" || step === "assistant-capture" ? "is-current"
            : step === "done" ? "is-done" : ""
          }>
            <span className="checkin-gate__step-index">2</span>
            <span>Assistant</span>
            {step === "done" && <Check size={16} aria-hidden="true" />}
          </li>
        </ol>

        {error && (
          <p className="checkin-gate__error" role="alert">
            <AlertTriangle size={18} /> {error}
          </p>
        )}
        {info && (
          <p className="checkin-gate__info">{info}</p>
        )}

        {step === "lead" && (
          <CheckinCaptureStep
            roleLabel="Lead (conducteur)"
            userHint={user ? `${user.fullName}${user.matricule ? ` — ${user.matricule}` : ""}` : null}
            videoRef={videoRef}
            capturing={capturing}
            captureStatus={captureStatus}
            onPrimary={() => handleCheckin("lead")}
          />
        )}

        {step === "assistant-creds" && (
          <form className="checkin-gate__form card" onSubmit={handleVerifyAssistant}>
            <h2 className="checkin-gate__form-title">
              <UserPlus size={20} /> Assistant — identification
            </h2>
            <p className="checkin-gate__form-hint">
              Le second technicien renseigne ses identifiants de compte.
              Aucune session n'est ouverte sur son appareil.
            </p>
            <label className="field-label" htmlFor="assistant-id">Matricule ou e-mail</label>
            <input
              id="assistant-id"
              className="text-input"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
              autoComplete="username"
              required
            />
            <label className="field-label" htmlFor="assistant-pwd" style={{ marginTop: 12 }}>Mot de passe</label>
            <input
              id="assistant-pwd"
              className="text-input"
              type="password"
              value={assistantPwd}
              onChange={(e) => setAssistantPwd(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button type="submit" className="btn btn-primary" disabled={verifying} style={{ marginTop: 16 }}>
              {verifying ? "Vérification…" : "Continuer"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep("lead")}
              style={{ marginTop: 8 }}
            >
              ← Reprendre l'étape 1
            </button>
          </form>
        )}

        {step === "assistant-capture" && assistantVerified && (
          <CheckinCaptureStep
            roleLabel={`Assistant (${assistantVerified.name})`}
            videoRef={videoRef}
            capturing={capturing}
            captureStatus={captureStatus}
            onPrimary={() => handleCheckin("assistant", assistantVerified.userId)}
            onBack={() => setStep("assistant-creds")}
          />
        )}

        {step === "done" && (
          <div className="checkin-gate__done card">
            <Check size={32} />
            <h2>Présence enregistrée</h2>
            <p>Les deux check-ins sont sauvegardés. Vous allez être redirigé vers le formulaire…</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/survey/${type}?session=${session.id}`)}
            >
              Ouvrir le formulaire maintenant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckinCaptureStep({ roleLabel, userHint, videoRef, capturing, captureStatus, onPrimary, onBack }) {
  return (
    <div className="checkin-gate__capture card">
      <h2 className="checkin-gate__form-title">
        <Camera size={20} /> {roleLabel}
      </h2>
      {userHint && <p className="checkin-gate__form-hint">{userHint}</p>}

      <div className="checkin-gate__video-wrap">
        <video ref={videoRef} playsInline muted className="checkin-gate__video" />
        {!capturing && (
          <div className="checkin-gate__video-placeholder">
            <Camera size={48} />
            <p>Caméra en attente</p>
            <p className="checkin-gate__video-hint">
              <MapPin size={14} /> Le GPS sera capturé automatiquement au moment de la photo.
            </p>
          </div>
        )}
      </div>

      {captureStatus && <p className="checkin-gate__status">{captureStatus}</p>}

      <div className="checkin-gate__actions">
        {onBack && (
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            ← Retour
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onPrimary}>
          {!capturing ? (<><MapPin size={18} /> Démarrer capture</>)
            : (<><Camera size={18} /> Valider la photo</>)}
        </button>
      </div>
    </div>
  );
}
