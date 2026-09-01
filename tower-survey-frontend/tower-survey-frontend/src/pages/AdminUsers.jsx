import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, ShieldOff, AlertTriangle, RefreshCw } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import "./AdminUsers.css";

export default function AdminUsers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null); // userId en cours de mutation
  const [confirm, setConfirm] = useState(null); // { kind, user }

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/sites", { replace: true });
      return;
    }
    load();
  }, [user, navigate]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.adminListUsers();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || "Impossible de charger les utilisateurs.");
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(() => {
    const admins = users.filter((u) => u.role === "admin").length;
    const technicians = users.filter((u) => u.role === "technician").length;
    return { admins, technicians, total: users.length };
  }, [users]);

  async function applyRoleChange(targetUser, newRole) {
    setBusyId(targetUser.id);
    setError(null);
    try {
      await api.adminUpdateUserRole(targetUser.id, newRole);
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err.message || "Échec de la modification du rôle.");
    } finally {
      setBusyId(null);
    }
  }

  if (user?.role !== "admin") return null;

  return (
    <div className="app-shell">
      <TopBar />
      <div className="admin-users">
        <div className="admin-users__header">
          <div>
            <button type="button" className="admin-users__back" onClick={() => navigate("/admin")}>
              <ArrowLeft size={18} /> Retour
            </button>
            <h1 className="admin-users__title">Gestion des utilisateurs</h1>
            <p className="admin-users__subtitle">
              Promouvez un utilisateur au rôle administrateur, ou retirez ce rôle.
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            <span style={{ marginLeft: 6 }}>Actualiser</span>
          </button>
        </div>

        <div className="admin-users__stats">
          <div className="stat-card">
            <span className="stat-card__value">{counts.total}</span>
            <span className="stat-card__label">Utilisateurs</span>
          </div>
          <div className="stat-card stat-card--ok">
            <span className="stat-card__value">{counts.admins}</span>
            <span className="stat-card__label">Admins</span>
          </div>
          <div className="stat-card stat-card--info">
            <span className="stat-card__value">{counts.technicians}</span>
            <span className="stat-card__label">Techniciens</span>
          </div>
        </div>

        {error && (
          <p className="admin-users__error" role="alert">
            <AlertTriangle size={18} /> {error}
          </p>
        )}

        {loading ? (
          <p className="admin-users__empty">Chargement…</p>
        ) : users.length === 0 ? (
          <p className="admin-users__empty">Aucun utilisateur.</p>
        ) : (
          <div className="admin-users__table-wrap">
            <table className="admin-users__table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>E-mail / Matricule</th>
                  <th>Rôle</th>
                  <th>État</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isAdmin = u.role === "admin";
                  const isSelf = u.id === user.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="admin-users__name">{u.full_name}</div>
                        {isSelf && <span className="admin-users__self-tag">toi</span>}
                      </td>
                      <td>
                        <div>{u.email || <span className="muted">—</span>}</div>
                        <div className="admin-users__sub">{u.matricule || ""}</div>
                      </td>
                      <td>
                        <span className={`pill ${isAdmin ? "pill--ok" : "pill--offline"}`}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${u.is_active ? "pill--ok" : "pill--offline"}`}>
                          {u.is_active ? "actif" : "désactivé"}
                        </span>
                        {!u.is_email_verified && (
                          <span className="pill pill--pending" style={{ marginLeft: 6 }}>
                            e-mail non vérifié
                          </span>
                        )}
                      </td>
                      <td>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="btn btn-ghost admin-users__action"
                            onClick={() => setConfirm({ kind: "demote", user: u })}
                            disabled={busyId === u.id || isSelf}
                            title={isSelf ? "Tu ne peux pas te retirer ton propre rôle admin" : "Retirer le rôle admin"}
                          >
                            <ShieldOff size={16} />
                            <span>Retirer admin</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary admin-users__action"
                            onClick={() => setConfirm({ kind: "promote", user: u })}
                            disabled={busyId === u.id}
                            title="Promouvoir au rôle admin"
                          >
                            <Shield size={16} />
                            <span>Promouvoir admin</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          kind={confirm.kind}
          user={confirm.user}
          busy={busyId === confirm.user.id}
          onCancel={() => setConfirm(null)}
          onConfirm={() => applyRoleChange(confirm.user, confirm.kind === "promote" ? "admin" : "technician")}
        />
      )}
    </div>
  );
}

function ConfirmDialog({ kind, user, busy, onCancel, onConfirm }) {
  const isPromote = kind === "promote";
  return (
    <div className="admin-users__overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="admin-users__dialog card">
        <h2 id="confirm-title" className="admin-users__dialog-title">
          {isPromote ? "Promouvoir cet utilisateur ?" : "Retirer le rôle admin ?"}
        </h2>
        <p>
          <strong>{user.full_name}</strong>
          {user.email ? ` (${user.email})` : ""}
        </p>
        {isPromote ? (
          <p>
            Cette personne aura accès au tableau de bord administrateur, à la
            gestion des utilisateurs et au monitoring des check-ins.
          </p>
        ) : (
          <p>
            Cette personne n'aura plus accès aux fonctions administrateur.
            {user.id === user.id /* self never reaches here but keep guard */ ? "" :
              " Si c'est le dernier admin de l'organisation, l'opération sera refusée."}
          </p>
        )}
        <div className="admin-users__dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className={isPromote ? "btn btn-primary" : "btn btn-primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Application…" : isPromote ? "Promouvoir" : "Retirer admin"}
          </button>
        </div>
      </div>
    </div>
  );
}
