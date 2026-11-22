import { Boxes, ClipboardCheck } from "lucide-react";

export default function PortalNav({
  current,
}: {
  current: "studio" | "tests";
}) {
  return (
    <nav className="portal-nav" aria-label="Sekcje demonstratora">
      <a href="/" aria-current={current === "studio" ? "page" : undefined}>
        <Boxes size={16} /> Studio projektowe
      </a>
      <a href="/testy" aria-current={current === "tests" ? "page" : undefined}>
        <ClipboardCheck size={16} /> Testy Electrotile
      </a>
    </nav>
  );
}
