import { NavLink } from "react-router-dom";
import { useSync } from "../context/SyncContext";
import { useAuth } from "../context/AuthContext";
import { MapPin, RefreshCw, BarChart3 } from "lucide-react";
import "./BottomNav.css";

export default function BottomNav() {
  const { pendingCount } = useSync();
  const { user } = useAuth();

  return (
    <nav className="bottom-nav">
      <NavLink to="/sites" className={({ isActive }) => `bottom-nav__item ${isActive ? "is-active" : ""}`}>
        <span className="bottom-nav__icon">
          <MapPin size={22} strokeWidth={2.2} />
        </span>
        <span>Sites</span>
      </NavLink>
      <NavLink to="/sync" className={({ isActive }) => `bottom-nav__item ${isActive ? "is-active" : ""}`}>
        <span className="bottom-nav__icon">
          <RefreshCw size={22} strokeWidth={2.2} />
          {pendingCount > 0 && <span className="bottom-nav__badge">{pendingCount}</span>}
        </span>
        <span>Sync</span>
      </NavLink>
      {user?.role === "admin" && (
        <NavLink to="/admin" className={({ isActive }) => `bottom-nav__item ${isActive ? "is-active" : ""}`}>
          <span className="bottom-nav__icon">
            <BarChart3 size={22} strokeWidth={2.2} />
          </span>
          <span>Admin</span>
        </NavLink>
      )}
    </nav>
  );
}
