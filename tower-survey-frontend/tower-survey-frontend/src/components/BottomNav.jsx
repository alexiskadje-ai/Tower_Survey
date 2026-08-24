import { NavLink } from "react-router-dom";
import { useSync } from "../context/SyncContext";
import "./BottomNav.css";

export default function BottomNav() {
  const { pendingCount } = useSync();

  return (
    <nav className="bottom-nav">
      <NavLink to="/sites" className={({ isActive }) => `bottom-nav__item ${isActive ? "is-active" : ""}`}>
        <span className="bottom-nav__icon">📍</span>
        <span>Sites</span>
      </NavLink>
      <NavLink to="/sync" className={({ isActive }) => `bottom-nav__item ${isActive ? "is-active" : ""}`}>
        <span className="bottom-nav__icon">
          🔄
          {pendingCount > 0 && <span className="bottom-nav__badge">{pendingCount}</span>}
        </span>
        <span>Sync</span>
      </NavLink>
    </nav>
  );
}
