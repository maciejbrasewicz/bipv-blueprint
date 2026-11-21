import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
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
type Orthophoto = {
  bounds_m: { west: number; south: number; east: number; north: number };
  width_px: number;
  height_px: number;
  grid_m_per_pixel: number;
  image_base64: string;
};

async function decodedOrthophoto(raster: Orthophoto) {
  const image = new Image();
  image.src = `data:image/png;base64,${raster.image_base64}`;
  try {
    await image.decode();
  } catch {
    throw new Error("Nie udało się odczytać obrazu ortofotomapy.");
  }
  if (
    image.naturalWidth !== raster.width_px ||
    image.naturalHeight !== raster.height_px
  ) {
    throw new Error("Rozmiar obrazu nie zgadza się z metadanymi ortofotomapy.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  context?.drawImage(image, 0, 0);
  const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data;
  if (pixels && !pixels.some((alpha, i) => i % 4 === 3 && alpha > 0)) {
    throw new Error("Brak pokrycia ortofotomapą w tym miejscu.");
  }
  return image.src;
}

function BuildingMap({
  buildings,
  radius,
  point,
  selected,
  onSelect,
}: {
  buildings: Building[];
  radius: number;
  point: AddressPoint;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const side = radius * 2;
  const pending = useRef<AbortController | null>(null);
  const [photo, setPhoto] = useState<{
    raster: Orthophoto;
    url: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [measuring, setMeasuring] = useState(false);
  const [measurement, setMeasurement] = useState<PointUV[]>([]);

  useEffect(() => () => pending.current?.abort(), []);

  async function toggleOrthophoto() {
    if (photo) {
      setPhoto(null);
      setMeasuring(false);
      setMeasurement([]);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setPhotoError("");
    setLoading(true);
    try {
      const raster = await api<Orthophoto>(
        "geo/orthophoto",
        "POST",
        { easting_m: point.easting_m, northing_m: point.northing_m },
        undefined,
        controller.signal,
      );
      const url = await decodedOrthophoto(raster);
      if (!controller.signal.aborted) setPhoto({ raster, url });
    } catch (error) {
      if (!controller.signal.aborted) setPhotoError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function pickMeasurement(event: MouseEvent<SVGSVGElement>) {
    if (!measuring) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    if (Math.abs(x) > radius || Math.abs(y) > radius) return;
    setMeasurement((points) =>
      points.length === 1 ? [...points, [x, y]] : [[x, y]],
    );
  }

  const bounds = photo?.raster.bounds_m;
  return (
    <div className="location-map-panel">
      <div className="location-map-controls">
        <button
          type="button"
          className="button"
          onClick={() => void toggleOrthophoto()}
          disabled={loading}
          aria-pressed={!!photo}
        >
          {photo ? "Ukryj ortofotomapę" : "Pokaż ortofotomapę"}
        </button>
        {photo && (
          <button
            type="button"
            className="button"
            aria-pressed={measuring}
            onClick={() => {
              if (!measuring) setMeasurement([]);
              setMeasuring(!measuring);
            }}
          >
            Zmierz odległość
          </button>
        )}
      </div>
      {loading && <p role="status">Pobieram ortofotomapę GUGiK…</p>}
      {photoError && (
        <p className="hole-error" role="alert">
          {photoError}
        </p>
      )}
      <svg
        className={`building-map${photo ? " with-ortho" : ""}${measuring ? " measuring" : ""}`}
        role="img"
        aria-label="Obrysy EGiB wokół punktu adresowego, północ u góry"
        viewBox={`${-radius} ${-radius} ${side} ${side}`}
        onClick={pickMeasurement}
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
        {photo && bounds && (
          <image
            href={photo.url}
            x={bounds.west - point.easting_m}
            y={point.northing_m - bounds.north}
            width={bounds.east - bounds.west}
            height={bounds.north - bounds.south}
            preserveAspectRatio="none"
          />
        )}
        {buildings.map((building, index) => {
          const id = building.site.building_id;
          const rings = building.rings_m.flat();
          const path = rings
            .map(
              (ring) =>
                ring
                  .map(
                    ([east, north], i) => `${i ? "L" : "M"}${east},${-north}`,
                  )
                  .join(" ") + " Z",
            )
            .join(" ");
          const [east, north] = rings[0][0];
          return (
            <g
              key={id}
              className={selected === id ? "chosen-building" : ""}
              onClick={() => {
                if (!measuring) onSelect(id);
              }}
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
        {measurement.length === 2 && (
          <line
            x1={measurement[0][0]}
            y1={measurement[0][1]}
            x2={measurement[1][0]}
            y2={measurement[1][1]}
            stroke="#ffc766"
            strokeWidth="0.9"
            pointerEvents="none"
          />
        )}
        {measurement.map(([x, y], index) => (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="1.4"
            fill="#ffc766"
            stroke="#262522"
            strokeWidth="0.35"
            pointerEvents="none"
          />
        ))}
      </svg>
      {photo && (
        <p className="ortho-caption">
          GUGiK · Ortofotomapa ·{" "}
          {photo.raster.grid_m_per_pixel.toLocaleString("pl-PL")} m/piksel
          siatki. Pomiar w płaszczyźnie mapy.
        </p>
      )}
      {(measuring || measurement.length === 2) && (
        <p className="ortho-caption" role="status">
          {measurement.length === 2
            ? `Odległość: ${Math.hypot(
                measurement[1][0] - measurement[0][0],
                measurement[1][1] - measurement[0][1],
              ).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} m`
            : measurement.length
              ? "Wskaż drugi punkt na mapie."
              : "Wskaż pierwszy punkt na mapie."}
        </p>
      )}
    </div>
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
      {point && !!nearby?.candidates.length && (
        <>
          <div className="location-preview">
            <BuildingMap
              buildings={nearby.candidates}
              radius={nearby.radius_m}
              point={point}
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
