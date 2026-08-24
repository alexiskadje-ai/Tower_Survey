import { useAuth } from "../context/AuthContext";
import StatusBar from "./StatusBar";
import "./TopBar.css";

export default function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <img src="/logo-mark.png" alt="" className="topbar__mark" />
        <div className="topbar__brandtext">
          <span className="topbar__title">TeleInfra</span>
          <span className="topbar__subtitle">Audit Pylône</span>
        </div>
      </div>

      <div className="topbar__right">
        <StatusBar />
        {user && (
          <button type="button" className="topbar__user" onClick={logout} title="Se déconnecter">
            <span className="topbar__initials">{user.fullName?.slice(0, 2).toUpperCase()}</span>
          </button>
        )}
      </div>
    </header>
  );
}
