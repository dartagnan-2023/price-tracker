import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/batches", label: "Batches" },
  { to: "/compare", label: "Comparacao" }
];

export function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar__brand">Price Tracker</div>
      <div className="navbar__links">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              isActive ? "navbar__link navbar__link--active" : "navbar__link"
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
