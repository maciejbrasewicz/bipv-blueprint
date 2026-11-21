import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { MapPin, Search, X } from "lucide-react";
import { api } from "./api";
import { ROOF_CONTOUR_METHOD, roofContour } from "./roofContour";
import type { OrthophotoTrace, PointUV, SceneSite } from "./types";

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
  sha256: string;
  retrieved_at: string;
};
type ApplyTrace = (
  site: SceneSite,
  trace: OrthophotoTrace,
  signal: AbortSignal,
) => Promise<void>;

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
  const pixels = context?.getImageData(0, 0, canvas.width, canvas.height);
  if (pixels && !pixels.data.some((alpha, i) => i % 4 === 3 && alpha > 0)) {
    throw new Error("Brak pokrycia ortofotomapą w tym miejscu.");
  }
  return { url: image.src, pixels };
}

function suggestOutline(
  pixels: ImageData,
  raster: Orthophoto,
  address: AddressPoint,
  building: Building,
  click: PointUV,
): PointUV[] {
  const { west, east, north, south } = raster.bounds_m;
  const sx = (east - west) / pixels.width;
  const sy = (north - south) / pixels.height;
  const leftEdge = west - address.easting_m;
  const topEdge = north - address.northing_m;
  const toPixel = ([e, n]: PointUV): PointUV => [
    (e - leftEdge) / sx,
    (topEdge - n) / sy,
  ];
  const vertices = building.rings_m.flat(2).map(toPixel);
  const xs = vertices.map(([x]) => x);
  const ys = vertices.map(([, y]) => y);
  const padding = 8;
  const proposal = roofContour(
    pixels,
    toPixel(click),
    {
      left: Math.min(...xs) - padding / sx,
      right: Math.max(...xs) + padding / sx,
      top: Math.min(...ys) - padding / sy,
      bottom: Math.max(...ys) + padding / sy,
    },
    { areaPx: building.area_m2 / (sx * sy), maximumPx: 250 / (sx * sy) },
  );
  if ("reason" in proposal) {
    if (proposal.reason === "no-data" || proposal.reason === "outside") {
      throw new Error(
        "Wskaż punkt na dachu wybranego budynku, w granicach obrazu.",
      );
    }
    if (proposal.reason === "area-mismatch") {
      throw new Error(
        "Znaleziona powierzchnia znacznie odbiega od obrysu budynku. Sprawdź punkt lub obrysuj dach ręcznie.",
      );
    }
    throw new Error(
      "Nie znaleziono wyraźnego obrysu. Wskaż inny punkt dachu lub narysuj obrys ręcznie.",
    );
  }
  return proposal.outline.map(([x, y]) => [
    Math.round((leftEdge + x * sx) * 100) / 100,
    Math.round((topEdge - y * sy) * 100) / 100,
  ]);
}

function BuildingMap({
  buildings,
  radius,
  point,
  selected,
  onSelect,
  onTrace,
  previousTrace,
}: {
  buildings: Building[];
  radius: number;
  point: AddressPoint;
  selected: string;
  onSelect: (id: string) => void;
  onTrace: ApplyTrace;
  previousTrace?: OrthophotoTrace | null;
}) {
  const side = radius * 2;
  const map = useRef<SVGSVGElement>(null);
  const pending = useRef<AbortController | null>(null);
  const traceRequest = useRef<AbortController | null>(null);
  const [photo, setPhoto] = useState<{
    raster: Orthophoto;
    url: string;
    pixels?: ImageData;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [measuring, setMeasuring] = useState(false);
  const [measurement, setMeasurement] = useState<PointUV[]>([]);
  const [editing, setEditing] = useState(false);
  const [traceBuilding, setTraceBuilding] = useState("");
  const tracing = editing && traceBuilding === selected;
  const [outline, setOutline] = useState<PointUV[]>([]);
  const [correction, setCorrection] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [height, setHeight] = useState("");
  const [roofKind, setRoofKind] = useState<"flat" | "gable">("flat");
  const [pitch, setPitch] = useState("");
  const [ridge, setRidge] = useState<PointUV[]>([]);
  const [placingRidge, setPlacingRidge] = useState(false);
  const [traceError, setTraceError] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => traceRequest.current?.abort(), [selected]);

  async function toggleOrthophoto() {
    if (photo) {
      setPhoto(null);
      setMeasuring(false);
      setEditing(false);
      setOutline([]);
      setSeeding(false);
      setSuggested(false);
      setCorrection(null);
      setMeasurement([]);
      setRidge([]);
      setPlacingRidge(false);
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
      const decoded = await decodedOrthophoto(raster);
      if (!controller.signal.aborted) setPhoto({ raster, ...decoded });
    } catch (error) {
      if (!controller.signal.aborted) setPhotoError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function mapClick(event: MouseEvent<SVGSVGElement>) {
    if ((!measuring && !tracing) || applying) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    if (Math.abs(x) > radius || Math.abs(y) > radius) return;
    if (tracing) {
      const vertex: PointUV = [
        Math.round(x * 10) / 10,
        Math.round(-y * 10) / 10,
      ];
      if (placingRidge) {
        setRidge([...ridge, vertex]);
        if (ridge.length === 1) setPlacingRidge(false);
        setTraceError("");
        return;
      }
      if (seeding && photo?.pixels && selectedBuilding) {
        setSeeding(false);
        try {
          setOutline(
            suggestOutline(
              photo.pixels,
              photo.raster,
              point,
              selectedBuilding,
              [x, -y],
            ),
          );
          setSuggested(true);
          setTraceError("");
        } catch (error) {
          setTraceError((error as Error).message);
        }
        return;
      }
      setOutline((points) =>
        correction === null
          ? points.length < 48
            ? [...points, vertex]
            : points
          : points.map((previous, index) =>
              index === correction ? vertex : previous,
            ),
      );
      setCorrection(null);
      setTraceError("");
      return;
    }
    setMeasurement((points) =>
      points.length === 1 ? [...points, [x, y]] : [[x, y]],
    );
  }

  const selectedBuilding = buildings.find(
    ({ site }) => site.building_id === selected,
  );
  const selectedSite = selectedBuilding?.site;
  function startTrace() {
    setMeasuring(false);
    setMeasurement([]);
    if (traceBuilding !== selected || !outline.length) {
      const matchingTrace =
        previousTrace &&
        photo &&
        previousTrace.image_sha256 === photo.raster.sha256 &&
        previousTrace.building_id === selected &&
        previousTrace.center.easting_m === point.easting_m &&
        previousTrace.center.northing_m === point.northing_m;
      setOutline(matchingTrace ? previousTrace.outline_en_m : []);
      setHeight(matchingTrace ? String(previousTrace.roof_height_m) : "");
      setSuggested(Boolean(matchingTrace && previousTrace.suggestion_method));
      const savedGable = matchingTrace ? previousTrace.gable : undefined;
      setRoofKind(savedGable ? "gable" : "flat");
      setRidge(savedGable?.ridge_en_m ?? []);
      setPitch(savedGable ? String(savedGable.pitch_deg) : "");
    }
    setPlacingRidge(false);
    setSeeding(false);
    setCorrection(null);
    setTraceError("");
    setApplying(false);
    setTraceBuilding(selected);
    setEditing(true);
  }

  async function submitTrace(event: FormEvent) {
    event.preventDefault();
    if (!photo || !selectedSite || outline.length < 3 || applying) return;
    if (roofKind === "gable" && (ridge.length !== 2 || !pitch)) return;
    const controller = new AbortController();
    traceRequest.current = controller;
    setTraceError("");
    setApplying(true);
    try {
      await onTrace(
        selectedSite,
        {
          source: "gugik-orto-wms",
          image_sha256: photo.raster.sha256,
          retrieved_at: photo.raster.retrieved_at,
          center: { easting_m: point.easting_m, northing_m: point.northing_m },
          outline_en_m: outline,
          roof_height_m: Number(height),
          building_id: selectedSite.building_id,
          suggestion_method: suggested ? ROOF_CONTOUR_METHOD : undefined,
          gable:
            roofKind === "gable"
              ? { ridge_en_m: [ridge[0], ridge[1]], pitch_deg: Number(pitch) }
              : undefined,
        },
        controller.signal,
      );
    } catch (error) {
      if (!controller.signal.aborted) setTraceError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setApplying(false);
    }
  }

  const bounds = photo?.raster.bounds_m;
  return (
    <div className="location-map-panel">
      <div className="location-map-controls">
        <button
          type="button"
          className="button"
          onClick={() => void toggleOrthophoto()}
          disabled={loading || (tracing && applying)}
          aria-pressed={!!photo}
        >
          {photo ? "Ukryj ortofotomapę" : "Pokaż ortofotomapę"}
        </button>
        {photo && !tracing && (
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
        {photo && !tracing && (
          <button
            type="button"
            className="button"
            disabled={!selectedSite}
            onClick={startTrace}
          >
            Obrysuj dach
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
        ref={map}
        className={`building-map${photo ? " with-ortho" : ""}${measuring || tracing ? " measuring" : ""}`}
        role="img"
        aria-label="Obrysy EGiB wokół punktu adresowego, północ u góry"
        viewBox={`${-radius} ${-radius} ${side} ${side}`}
        onClick={mapClick}
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
                if (!measuring && !tracing) onSelect(id);
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
        {tracing && outline.length > 0 && (
          <>
            <path
              className="trace-outline"
              d={
                outline
                  .map(([e, n], index) => `${index ? "L" : "M"}${e},${-n}`)
                  .join(" ") + (outline.length >= 3 ? " Z" : "")
              }
            />
            {outline.map(([e, n], index) => (
              <circle
                key={index}
                className="trace-vertex"
                cx={e}
                cy={-n}
                r={correction === index ? "1.8" : "1.1"}
              />
            ))}
          </>
        )}
        {tracing && roofKind === "gable" && ridge.length > 0 && (
          <g className="trace-ridge">
            {ridge.length === 2 && (
              <line
                x1={ridge[0][0]}
                y1={-ridge[0][1]}
                x2={ridge[1][0]}
                y2={-ridge[1][1]}
              />
            )}
            {ridge.map(([e, n], index) => (
              <circle key={index} cx={e} cy={-n} r="1.2" />
            ))}
          </g>
        )}
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
      {tracing && (
        <form
          className="roof-trace"
          aria-label="Obrys dachu"
          onSubmit={(event) => void submitTrace(event)}
        >
          <p className="ortho-caption" role="status">
            {placingRidge
              ? ridge.length
                ? "Wskaż drugi punkt kalenicy."
                : "Wskaż pierwszy punkt kalenicy."
              : seeding
                ? "Wskaż punkt wewnątrz dachu na obrazie."
                : correction === null
                  ? `Wskaż narożniki kolejno po obwodzie. Punkty: ${outline.length}/48.`
                  : `Wskaż nowe położenie punktu ${correction + 1}.`}
          </p>
          {!outline.length && photo?.pixels && (
            <button
              type="button"
              className="button"
              aria-pressed={seeding}
              onClick={() => {
                setSeeding(!seeding);
                setTraceError("");
              }}
            >
              {seeding ? "Anuluj wskazywanie" : "Zaproponuj obrys"}
            </button>
          )}
          {suggested && outline.length > 0 && (
            <p className="ortho-caption">
              Sprawdź i popraw zaproponowany obrys przed utworzeniem modelu.
            </p>
          )}
          <div className="location-map-controls">
            {outline.map(([e, n], index) => (
              <button
                type="button"
                className="button"
                aria-label={`Przesuń punkt ${index + 1}`}
                title={`E ${e} m · N ${n} m`}
                aria-pressed={correction === index}
                disabled={applying}
                key={index}
                onClick={() => {
                  setPlacingRidge(false);
                  setCorrection(correction === index ? null : index);
                }}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="location-map-controls">
            <button
              type="button"
              className="button"
              disabled={!outline.length || applying}
              onClick={() => {
                if (outline.length === 1) setSuggested(false);
                setOutline((points) =>
                  points.filter(
                    (_, index) => index !== (correction ?? points.length - 1),
                  ),
                );
                setCorrection(null);
                setTraceError("");
              }}
            >
              Usuń punkt
            </button>
            <button
              type="button"
              className="button"
              disabled={applying}
              onClick={() => {
                setEditing(false);
                setSeeding(false);
                setPlacingRidge(false);
                setCorrection(null);
                setTraceError("");
              }}
            >
              Zakończ obrysowanie
            </button>
          </div>
          <label>
            Kształt dachu
            <select
              value={roofKind}
              disabled={applying}
              onChange={(event) => {
                setRoofKind(
                  event.currentTarget.value === "gable" ? "gable" : "flat",
                );
                setPlacingRidge(false);
                setHeight("");
                setTraceError("");
              }}
            >
              <option value="flat">Płaski</option>
              <option value="gable">Dwuspadowy</option>
            </select>
          </label>
          {roofKind === "gable" && (
            <>
              <label>
                Nachylenie obu połaci (°)
                <input
                  type="number"
                  min="5"
                  max="60"
                  step="0.1"
                  required
                  value={pitch}
                  disabled={applying}
                  onChange={(event) => setPitch(event.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                className="button"
                aria-pressed={placingRidge}
                disabled={applying || outline.length < 3}
                onClick={() => {
                  if (!placingRidge) setRidge([]);
                  setSeeding(false);
                  setCorrection(null);
                  setTraceError("");
                  setPlacingRidge(!placingRidge);
                  if (!placingRidge)
                    map.current?.scrollIntoView({ block: "nearest" });
                }}
              >
                {placingRidge
                  ? "Anuluj wskazywanie kalenicy"
                  : ridge.length === 2
                    ? "Wskaż kalenicę ponownie"
                    : "Wskaż dwa punkty kalenicy"}
              </button>
              <p className="ortho-caption">
                Linia kalenicy zostanie przedłużona do krawędzi obrysu.
              </p>
            </>
          )}
          <label>
            {roofKind === "gable" ? "Wysokość kalenicy" : "Wysokość dachu"} nad
            przyjętym poziomem gruntu (m)
            <input
              type="number"
              min="0.1"
              max="40"
              step="0.1"
              required
              value={height}
              disabled={applying}
              onChange={(event) => setHeight(event.currentTarget.value)}
            />
          </label>
          <p className="ortho-caption">
            Powstanie szacowany dach{" "}
            {roofKind === "gable" ? "dwuspadowy" : "płaski"}. Operacja zastępuje
            połacie i przeszkody w bieżącej scenie. Możesz ją cofnąć.
          </p>
          {traceError && (
            <p className="hole-error" role="alert">
              {traceError}
            </p>
          )}
          <button
            type="submit"
            className="button primary"
            disabled={
              outline.length < 3 ||
              !height ||
              !selectedSite ||
              applying ||
              (roofKind === "gable" && (ridge.length !== 2 || !pitch))
            }
          >
            {applying ? "Sprawdzam obrys…" : "Zastąp geometrię obrysem"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function LocationDialog({
  current,
  previousTrace,
  onTrace,
  onConfirm,
  onClose,
}: {
  current?: SceneSite;
  previousTrace?: OrthophotoTrace | null;
  onTrace: ApplyTrace;
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
              onTrace={onTrace}
              previousTrace={previousTrace}
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
