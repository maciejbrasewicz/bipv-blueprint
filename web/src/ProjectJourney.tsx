import {
  ArrowUpRight,
  Check,
  ClipboardCheck,
  LayoutGrid,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import type { SceneSite } from "./types";

type JourneyProps = {
  site?: SceneSite;
  estimated: boolean;
  calculated: boolean;
  moduleCount: number;
  busy: boolean;
  error: boolean;
  onLocation: () => void;
  onLayout: () => void;
  onReview: () => void;
};

/**
 * Actions, not decorative progress indicators: every step opens the
 * corresponding editor. A cadastral footprint is never marked "verified".
 */
export default function ProjectJourney({
  site,
  estimated,
  calculated,
  moduleCount,
  busy,
  error,
  onLocation,
  onLayout,
  onReview,
}: JourneyProps) {
  const layoutReady = calculated && !busy && !error && moduleCount > 0;
  return (
    <nav
      className="project-journey"
      aria-label="Etapy projektu"
      data-testid="design-journey"
    >
      <div className="journey-steps">
        <button
          className={"journey-step " + (site ? "is-complete" : "is-current")}
          onClick={onLocation}
          type="button"
        >
          <span className="journey-number">01</span>
          <span className="journey-text">
            <strong>Budynek</strong>
            <small>
              {site ? "Wczytano obrys EGiB" : "Wybierz lokalizację"}
            </small>
          </span>
          {site ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <MapPin size={15} aria-hidden="true" />
          )}
        </button>
        <span className="journey-connector" aria-hidden="true" />
        <button
          className={
            "journey-step " +
            (layoutReady ? "is-complete" : calculated ? "is-current" : "")
          }
          onClick={onLayout}
          type="button"
        >
          <span className="journey-number">02</span>
          <span className="journey-text">
            <strong>
              <span className="journey-title-wide">Rozmieszczenie</span>
              <span className="journey-title-compact">Układ PV</span>
            </strong>
            <small>
              {busy
                ? "Trwa obliczanie"
                : layoutReady
                  ? `${moduleCount} modułów`
                  : "Zobacz warianty PV"}
            </small>
          </span>
          {layoutReady ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <LayoutGrid size={15} aria-hidden="true" />
          )}
        </button>
        <span className="journey-connector" aria-hidden="true" />
        <button
          className={
            "journey-step " +
            (estimated || !site ? "needs-review" : "is-current")
          }
          onClick={onReview}
          type="button"
        >
          <span className="journey-number">03</span>
          <span className="journey-text">
            <strong>
              <span className="journey-title-wide">Kontrola danych</span>
              <span className="journey-title-compact">Kontrola</span>
            </strong>
            <small>
              {estimated ? "Geometria szacowana" : "Źródła i ograniczenia"}
            </small>
          </span>
          <ClipboardCheck size={15} aria-hidden="true" />
        </button>
      </div>
      <button
        className={"journey-trust " + (estimated ? "is-estimated" : "")}
        type="button"
        onClick={estimated ? onLocation : onReview}
        title="Sprawdź status geometrii i źródła danych"
      >
        {estimated ? (
          <ShieldAlert size={18} aria-hidden="true" />
        ) : (
          <ArrowUpRight size={18} aria-hidden="true" />
        )}
        <span>
          <strong>
            {estimated
              ? "Dach do weryfikacji"
              : site
                ? "Sprawdź założenia"
                : "Tryb demonstracyjny"}
          </strong>
          <small>
            {estimated
              ? "EGiB nie określa połaci"
              : site
                ? "Nie jest to projekt wykonawczy"
                : "Zacznij od wyboru budynku"}
          </small>
        </span>
      </button>
    </nav>
  );
}
