import { Boxes, Calculator, ClipboardCheck } from "lucide-react";

export default function PortalNav({
  current,
}: {
  current: "studio" | "tests" | "production";
}) {
  return (
    <nav className="portal-nav" aria-label="Sekcje demonstratora">
      <a
        href="/"
        aria-label="Studio projektowe"
        aria-current={current === "studio" ? "page" : undefined}
      >
        <Boxes size={16} />
        <span className="nav-wide">Studio projektowe</span>
        <span className="nav-compact" aria-hidden="true">
          Studio
        </span>
      </a>
      <a
        href="/testy"
        aria-label="Testy Electrotile"
        aria-current={current === "tests" ? "page" : undefined}
      >
        <ClipboardCheck size={16} />
        <span className="nav-wide">Testy Electrotile</span>
        <span className="nav-compact" aria-hidden="true">
          Testy
        </span>
      </a>
      <a
        href="/produkcja"
        aria-label="Kalkulator produkcji"
        aria-current={current === "production" ? "page" : undefined}
      >
        <Calculator size={16} />
        <span className="nav-wide">Kalkulator produkcji</span>
        <span className="nav-compact" aria-hidden="true">
          Produkcja
        </span>
      </a>
    </nav>
  );
}
