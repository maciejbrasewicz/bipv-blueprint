import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, Search, X } from "lucide-react";
import { api } from "./api";
import type { PointUV, SceneSite } from "./types";

type AddressPoint = {
  label: string;
  region: string;
  easting_m: number;
  northing_m: number;
};
type Building = {
  site: SceneSite;
  distance_m: number;
  rings_m: PointUV[][][];
  area_m2: number;
};
type Nearby = { radius_m: number; partial: boolean; candidates: Building[] };

function BuildingMap({
  buildings,
  radius,
  selected,
  onSelect,
}: {
  buildings: Building[];
  radius: number;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const side = radius * 2;
  return (
    <svg
      className="building-map"
      role="img"
      aria-label="Obrysy EGiB wokół punktu adresowego, północ u góry"
      viewBox={`${-radius} ${-radius} ${side} ${side}`}
    >
      <defs>
        <pattern
          id="location-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 H 0 V 20"
            fill="none"
            stroke="#adbbb6"
            strokeWidth=".35"
          />
        </pattern>
      </defs>
      <rect
        x={-radius}
        y={-radius}
        width={side}
        height={side}
        fill="url(#location-grid)"
      />
      {buildings.map((building, index) => {
        const id = building.site.building_id;
        const rings = building.rings_m.flat();
        const path = rings
          .map(
            (ring) =>
              ring
                .map(([east, north], i) => `${i ? "L" : "M"}${east},${-north}`)
                .join(" ") + " Z",
          )
          .join(" ");
        const [east, north] = rings[0][0];
        return (
          <g
            key={id}
            className={selected === id ? "chosen-building" : ""}
            onClick={() => onSelect(id)}
          >
            <path d={path} fillRule="evenodd" />
            <text x={east + 1} y={-north - 1}>
              {index + 1}
            </text>
          </g>
        );
      })}
      <circle r="2" fill="#a34e25" stroke="white" strokeWidth=".6" />
      <text className="map-address" x="4" y="-1">
        Adres
      </text>
      <text x={radius - 8} y={-radius + 8}>
        N ↑
      </text>
      <path
        d={`M ${-radius + 5} ${radius - 6} h 20`}
        stroke="#455d56"
        strokeWidth=".7"
      />
      <text x={-radius + 5} y={radius - 8}>
        20 m
      </text>
    </svg>
  );
}

export default function LocationDialog({
  current,
  onConfirm,
  onClose,
}: {
  current?: SceneSite;
  onConfirm: (site: SceneSite) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [query, setQuery] = useState(current?.address ?? "");
  const [addresses, setAddresses] = useState<AddressPoint[] | null>(null);
  const [point, setPoint] = useState<AddressPoint | null>(null);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    api<{ enabled: boolean }>(
      "geo/sources",
      "GET",
      undefined,
      undefined,
      controller.signal,
    )
      .then(({ enabled }) => setEnabled(enabled))
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, []);

  async function fetchCandidates<T>(
    kind: "addresses" | "buildings",
    input: unknown,
  ) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(kind);
    setError("");
    try {
      const result = await api<T>(
        `geo/${kind}`,
        "POST",
        input,
        undefined,
        controller.signal,
      );
      return controller.signal.aborted ? undefined : result;
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy("");
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    setAddresses(null);
    setPoint(null);
    setNearby(null);
    setSelected("");
    const result = await fetchCandidates<{ candidates: AddressPoint[] }>(
      "addresses",
      { address: query.trim() },
    );
    if (result) setAddresses(result.candidates);
  }

  async function chooseAddress(next: AddressPoint) {
    setPoint(next);
    setNearby(null);
    setSelected("");
    const result = await fetchCandidates<Nearby>("buildings", next);
    if (result) setNearby(result);
  }

  const building = nearby?.candidates.find(
    ({ site }) => site.building_id === selected,
  );

  return (
    <dialog
      className="modal location-dialog"
      ref={dialog}
      aria-labelledby="location-heading"
      onClose={onClose}
    >
      <div className="modal-heading">
        <h2 id="location-heading">Lokalizacja budynku</h2>
        <button
          className="icon-button"
          aria-label="Zamknij lokalizację"
          onClick={() => dialog.current?.close()}
        >
          <X size={18} />
        </button>
      </div>
      <form className="location-search" onSubmit={search}>
        <label>
          Adres w Polsce
          <input
            type="search"
            placeholder="Miejscowość, ulica i numer"
            required
            minLength={3}
            maxLength={160}
            value={query}
            disabled={!!busy}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setAddresses(null);
              setPoint(null);
              setNearby(null);
              setSelected("");
              setError("");
            }}
          />
        </label>
        <button
          type="submit"
          className="button primary"
          disabled={!enabled || !!busy || query.trim().length < 3}
        >
          <Search size={15} /> Szukaj adresu
        </button>
      </form>
      <p>Adres wyszuka publiczna usługa GUGiK.</p>
      {enabled === false && (
        <p className="info-note">
          Wyszukiwanie w publicznych rejestrach jest wyłączone.
        </p>
      )}
      {busy && (
        <p aria-live="polite">
          {busy === "addresses" ? "Szukam adresów…" : "Pobieram obrysy EGiB…"}
        </p>
      )}
      {error && (
        <p className="hole-error" role="alert">
          {error}
        </p>
      )}
      {addresses?.length === 0 && (
        <p>Brak punktów adresowych. Doprecyzuj miejscowość, ulicę i numer.</p>
      )}
      {!!addresses?.length && (
        <section aria-label="Wyniki adresów" className="address-results">
          <h3>Wybierz adres</h3>
          {addresses.map((address, index) => (
            <button
              className="location-option"
              key={index}
              type="button"
              aria-pressed={address === point}
              disabled={!!busy}
              onClick={() => void chooseAddress(address)}
            >
              <MapPin size={16} />
              <span>
                {address.label}
                <small>{address.region}</small>
              </span>
            </button>
          ))}
        </section>
      )}
      {nearby?.candidates.length === 0 && (
        <p>
          Brak obrysów EGiB w promieniu {nearby.radius_m} m od wybranego punktu.
        </p>
      )}
      {!!nearby?.candidates.length && (
        <>
          <div className="location-preview">
            <BuildingMap
              buildings={nearby.candidates}
              radius={nearby.radius_m}
              selected={selected}
              onSelect={setSelected}
            />
            <fieldset className="building-options">
              <legend>Wybierz budynek</legend>
              {nearby.candidates.map(({ site, distance_m, area_m2 }, index) => (
                <label className="location-option" key={site.building_id}>
                  <input
                    type="radio"
                    name="building"
                    checked={selected === site.building_id}
                    onChange={() => setSelected(site.building_id)}
                  />
                  <span>
                    Budynek {index + 1} · {Math.round(area_m2)} m²
                    <small>
                      {distance_m} m od punktu · {site.building_id}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
          {nearby.partial && (
            <p className="info-note">
              Rejestr zwrócił ograniczony zestaw obrysów.
            </p>
          )}
          <div className="location-confirm">
            <p>
              GUGiK · UUG i EGiB. Wybór zapisuje lokalizację projektu. Geometrię
              połaci ustalasz osobno.
            </p>
            <button
              type="button"
              className="button primary"
              disabled={!building}
              onClick={() => building && onConfirm(building.site)}
            >
              Potwierdź budynek
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
