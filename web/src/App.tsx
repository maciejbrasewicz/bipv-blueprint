import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cloud,
  FileJson,
  FolderOpen,
  Grid2X2,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Maximize,
  MousePointer2,
  Move3D,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Square,
  Sun,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, download, workspaceKey } from "./api";
import {
  INITIAL,
  type CloudRef,
  type Layout,
  type Obstacle,
  type Project,
  type ProjectSummary,
  type Scene,
} from "./types";
const SceneView = lazy(() => import("./SceneView"));
const num = (v: number, d = 1) =>
  v.toLocaleString("pl-PL", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
const surfaceTitle = (id: string) =>
  id === "south" ? "Połać frontowa" : "Połać tylna";
const modes: [string, string, LucideIcon][] = [
  ["project", "Projekt", MousePointer2],
  ["sun", "Słońce", Sun],
  ["variants", "Warianty", Layers3],
  ["materials", "Materiały", LayoutGrid],
  ["quality", "Kontrola", ShieldCheck],
];
function Field(p: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="field">
      <span>{p.label}</span>
      <div className="number-field">
        <input
          aria-label={p.label}
          type="number"
          min={p.min}
          max={p.max}
          step={p.step ?? 0.1}
          value={p.value}
          onChange={(e) => {
            if (
              e.currentTarget.value !== "" &&
              Number.isFinite(e.currentTarget.valueAsNumber)
            )
              p.onChange(
                Math.max(p.min, Math.min(p.max, e.currentTarget.valueAsNumber)),
              );
          }}
        />
        <small>{p.unit ?? "m"}</small>
      </div>
    </label>
  );
}
function IconButton(p: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={"icon-button " + (p.active ? "active" : "")}
      title={p.label}
      aria-label={p.label}
      onClick={p.onClick}
      disabled={p.disabled}
    >
      {p.children}
    </button>
  );
}
function readLocal(): Scene {
  try {
    const v = JSON.parse(localStorage.getItem("bipv.scene.v1") || "null");
    return v?.schema_version === "1.0.0" &&
      v.roof &&
      Array.isArray(v.obstacles) &&
      v.surfaces?.length
      ? v
      : INITIAL;
  } catch {
    return INITIAL;
  }
}
function readCloudRef(): CloudRef | null {
  try {
    const v = JSON.parse(
      localStorage.getItem("bipv.cloudproject.v1") || "null",
    );
    return v &&
      typeof v.id === "string" &&
      Number.isInteger(v.revision) &&
      typeof v.input === "string"
      ? v
      : null;
  } catch {
    return null;
  }
}
export default function App() {
  const [scene, setScene] = useState<Scene>(readLocal),
    [history, setHistory] = useState<Scene[]>([]),
    [future, setFuture] = useState<Scene[]>([]);
  const [result, setResult] = useState<Layout | null>(null),
    [resultInput, setResultInput] = useState(""),
    [computing, setComputing] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [mode, setMode] = useState("project"),
    [variantId, setVariantId] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [view, setView] = useState("orbit"),
    [grid, setGrid] = useState(true);
  const [sunHour, setSunHour] = useState(12),
    [sunDate, setSunDate] = useState("2026-11-20"),
    [toast, setToast] = useState(""),
    [saving, setSaving] = useState(false),
    [project, setProject] = useState<CloudRef | null>(readCloudRef);
  const [projectModal, setProjectModal] = useState(false),
    [projects, setProjects] = useState<ProjectSummary[]>([]),
    [projectLoading, setProjectLoading] = useState(false),
    [cloudConfigured, setCloudConfigured] = useState(false),
    [exportMenu, setExportMenu] = useState(false),
    [help, setHelp] = useState(false),
    [confirmReset, setConfirmReset] = useState(false),
    [mobilePanel, setMobilePanel] = useState("");
  const file = useRef<HTMLInputElement>(null),
    sceneRef = useRef(scene);
  sceneRef.current = scene;
  const serialized = JSON.stringify(scene),
    stale = resultInput !== serialized;
  const variant =
      result?.variants.find((v) => v.id === variantId) ?? result?.variants[0],
    obstacle = scene.obstacles.find((o) => o.id === selected);
  const changed = useCallback((next: Scene) => {
    setHistory((h) => [...h.slice(-39), sceneRef.current]);
    setFuture([]);
    setScene(next);
  }, []);
  const patch = (partial: Partial<Scene>) => changed({ ...scene, ...partial });
  useEffect(() => {
    api<{ cloud_configured: boolean }>("health")
      .then((h) => setCloudConfigured(h.cloud_configured))
      .catch(() => {});
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("bipv.scene.v1", serialized);
    } catch {
      setToast("Pamięć urządzenia jest niedostępna. Wyeksportuj projekt JSON.");
    }
  }, [serialized]);
  useEffect(() => {
    try {
      if (project)
        localStorage.setItem("bipv.cloudproject.v1", JSON.stringify(project));
      else localStorage.removeItem("bipv.cloudproject.v1");
    } catch {}
  }, [project]);
  useEffect(() => {
    const controller = new AbortController();
    setComputing(true);
    setError("");
    const timeout = setTimeout(() => {
      api<Layout>(
        "layout",
        "POST",
        sceneRef.current,
        undefined,
        controller.signal,
      )
        .then((r) => {
          setResult(r);
          setResultInput(serialized);
          setComputing(false);
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setError(e.message);
            setComputing(false);
          }
        });
    }, 350);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [serialized, retry]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(id);
  }, [toast]);
  const undo = () => {
    if (!history.length) return;
    setFuture((f) => [scene, ...f]);
    setScene(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, scene]);
    setScene(future[0]);
    setFuture((f) => f.slice(1));
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches("input,textarea")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Escape") {
        setSelected(null);
        setProjectModal(false);
        setExportMenu(false);
        setHelp(false);
        setMobilePanel("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  async function save() {
    setSaving(true);
    try {
      const p = await api<Project>(
        project ? "projects/" + project.id : "projects",
        project ? "PATCH" : "POST",
        { scene, ...(project ? { expected_revision: project.revision } : {}) },
        workspaceKey(),
      );
      setProject({
        id: p.id,
        revision: p.revision,
        input: JSON.stringify(scene),
      });
      setToast("Zapisano w Supabase · rewizja " + p.revision);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function openProjects() {
    setProjectModal(true);
    setProjectLoading(true);
    try {
      const r = await api<{ projects: ProjectSummary[] }>(
        "projects",
        "GET",
        undefined,
        workspaceKey(),
      );
      setProjects(r.projects);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setProjectLoading(false);
    }
  }
  async function openProject(id: string) {
    setProjectLoading(true);
    try {
      const p = await api<Project>(
        "projects/" + id,
        "GET",
        undefined,
        workspaceKey(),
      );
      changed(p.scene);
      setProject({
        id: p.id,
        revision: p.revision,
        input: JSON.stringify(p.scene),
      });
      setSelected(null);
      setProjectModal(false);
      setToast("Otworzono projekt z Supabase.");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setProjectLoading(false);
    }
  }
  async function removeProject(id: string) {
    try {
      await api("projects/" + id, "DELETE", undefined, workspaceKey());
      setProjects((ps) => ps.filter((p) => p.id !== id));
      if (project?.id === id) setProject(null);
      setToast("Usunięto zapis w chmurze. Kopia lokalna pozostaje.");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  const updateObstacle = (p: Partial<Obstacle>) =>
    patch({
      obstacles: scene.obstacles.map((o) =>
        o.id === selected ? { ...o, ...p } : o,
      ),
    });
  const addObstacle = (kind: "chimney" | "skylight") => {
    if (scene.obstacles.length >= 12) {
      setToast("Limit demonstratora: 12 przeszkód.");
      return;
    }
    const id = kind + "-" + crypto.randomUUID().slice(0, 8);
    const o: Obstacle = {
      id,
      kind,
      surface_id: scene.surfaces[0],
      u: Math.max(0, scene.roof.width_m / 2 - 0.5),
      v: 1,
      width_m: 0.8,
      depth_m: 1,
      height_m: kind === "chimney" ? 1.1 : 0.12,
    };
    patch({ obstacles: [...scene.obstacles, o] });
    setSelected(id);
  };
  const exportJson = () => {
    download(
      "bipv-project.json",
      JSON.stringify(
        {
          format: "registry9-bipv-project/1",
          scene,
          provenance:
            stale || !result
              ? null
              : {
                  source_hash: result.source_hash,
                  engine_version: result.engine_version,
                },
          selected_variant: variant?.id,
        },
        null,
        2,
      ),
    );
    setExportMenu(false);
  };
  const exportMaterials = () => {
    if (!variant || !result || stale) return;
    const rows = [
      ["pozycja", "produkt", "ilosc", "jednostka", "status"],
      [
        "Moduly aktywne",
        result.product.name,
        String(variant.module_count),
        "szt.",
        "katalog demonstracyjny",
      ],
      [
        "Powierzchnia modulow",
        "",
        String(variant.active_area_m2),
        "m2",
        "geometria",
      ],
      [
        "Powierzchnia dachu",
        "",
        String(variant.roof_area_m2),
        "m2",
        "scena parametryczna",
      ],
      [
        "Moc STC",
        "",
        String(variant.power_kwp),
        "kWp",
        "suma mocy katalogowych",
      ],
    ];
    download(
      "bipv-materials.csv",
      "\uFEFF" +
        rows
          .map((r) =>
            r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(";"),
          )
          .join("\r\n"),
      "text/csv;charset=utf-8",
    );
    setExportMenu(false);
  };
  async function importJson(f: File) {
    try {
      if (f.size > 65000) throw new Error("Plik sceny przekracza 65 KB.");
      const j = JSON.parse(await f.text()),
        next = j.scene ?? j;
      await api<Layout>("layout", "POST", next);
      changed(next);
      setProject(null);
      setSelected(null);
      setToast("Zaimportowano i zweryfikowano scenę.");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  const headline =
    mode === "sun"
      ? "Światło definiuje projekt."
      : mode === "variants"
        ? "Dwie orientacje. Jeden model."
        : mode === "materials"
          ? "Geometria staje się materiałem."
          : mode === "quality"
            ? "Każdy wynik ma swoje źródło."
            : "Energia wpisana w architekturę.";
  return (
    <div className="studio">
      <header className="header">
        <a className="brand" href="/" aria-label="Registry9 BIPV Studio">
          <span className="brand-icon">
            <Box size={22} />
          </span>
          <span>
            REGISTRY<span className="brand-nine">9</span>
            <small>BIPV STUDIO</small>
          </span>
        </a>
        <span className="header-divider" />
        <div className="project-heading">
          <span className="eyebrow">PRZESTRZEŃ PROJEKTOWA</span>
          <input
            aria-label="Nazwa projektu"
            value={scene.name}
            maxLength={100}
            onChange={(e) => patch({ name: e.target.value || "Projekt BIPV" })}
          />
        </div>
        <span className="version-pill">
          R1 <span>·</span> DEMO
        </span>
        <div className="header-actions">
          <button className="button subtle" onClick={openProjects}>
            <FolderOpen size={15} />
            <span>Projekty</span>
          </button>
          <button
            className="button export-button"
            onClick={() => setExportMenu(!exportMenu)}
            aria-expanded={exportMenu}
          >
            <ArrowDownToLine size={15} />
            <span>Eksport</span>
            <ChevronDown size={12} />
          </button>
          {exportMenu && (
            <div className="export-menu">
              <button onClick={exportJson}>
                <FileJson size={16} />
                Projekt JSON
              </button>
              <button onClick={exportMaterials} disabled={stale || !variant}>
                <LayoutGrid size={16} />
                Zestawienie CSV
              </button>
              <button
                onClick={() => {
                  file.current?.click();
                  setExportMenu(false);
                }}
              >
                <Upload size={16} />
                Importuj scenę JSON
              </button>
            </div>
          )}
          <button
            className="button primary"
            onClick={save}
            disabled={saving || !cloudConfigured}
          >
            {saving ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Cloud size={15} />
            )}
            <span>{saving ? "Zapisywanie…" : "Zapisz projekt"}</span>
          </button>
          <IconButton
            label="Informacje o demonstratorze"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={18} />
          </IconButton>
        </div>
      </header>
      <div className="workspace">
        <aside
          className={
            "left-panel " + (mobilePanel === "left" ? "mobile-open" : "")
          }
        >
          <div className="panel-top">
            <span>OBIEKTY PROJEKTU</span>
            <span className="mini-badge">{scene.obstacles.length + 3}</span>
          </div>
          <button
            className={
              "object-row building " + (selected === null ? "selected" : "")
            }
            onClick={() => setSelected(null)}
          >
            <Box size={17} />
            <span>
              Budynek mieszkalny<small>Model parametryczny</small>
            </span>
            <ChevronDown size={13} />
          </button>
          <div className="object-children">
            {(["south", "north"] as const).map((id) => (
              <label
                key={id}
                className={
                  "surface-row " +
                  (scene.surfaces.includes(id) ? "checked" : "")
                }
              >
                <input
                  type="checkbox"
                  checked={scene.surfaces.includes(id)}
                  onChange={(e) => {
                    if (!e.target.checked && scene.surfaces.length === 1) {
                      setToast("Wybierz co najmniej jedną połać.");
                      return;
                    }
                    patch({
                      surfaces: e.target.checked
                        ? [...scene.surfaces, id]
                        : scene.surfaces.filter((s) => s !== id),
                    });
                  }}
                />
                {surfaceTitle(id)}
                <small>
                  {id === "south"
                    ? scene.roof.azimuth_deg
                    : (scene.roof.azimuth_deg + 180) % 360}
                  °
                </small>
              </label>
            ))}
          </div>
          <div className="section-label">
            PRZESZKODY{" "}
            <button
              aria-label="Dodaj komin"
              onClick={() => addObstacle("chimney")}
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="obstacle-list">
            {scene.obstacles.map((o, i) => (
              <button
                key={o.id}
                className={
                  "object-row obstacle-row " +
                  (selected === o.id ? "selected" : "")
                }
                onClick={() => {
                  setSelected(o.id);
                  setMode("project");
                }}
              >
                {o.kind === "chimney" ? (
                  <Box size={15} />
                ) : (
                  <Square size={15} />
                )}
                <span>
                  {o.kind === "chimney" ? "Komin" : "Okno dachowe"} {i + 1}
                  <small>{surfaceTitle(o.surface_id)}</small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
          <div className="add-buttons">
            <button onClick={() => addObstacle("chimney")}>
              <Plus size={13} />
              Komin
            </button>
            <button onClick={() => addObstacle("skylight")}>
              <Plus size={13} />
              Okno
            </button>
          </div>
          <div className="panel-rule" />
          <div className="section-label">
            <span>
              {obstacle ? "PARAMETRY PRZESZKODY" : "GEOMETRIA BUDYNKU"}
            </span>
            <Settings2 size={14} />
          </div>
          {obstacle ? (
            <>
              <div className="field-grid">
                <Field
                  label="Pozycja U"
                  value={obstacle.u}
                  min={0}
                  max={30}
                  onChange={(u) => updateObstacle({ u })}
                />
                <Field
                  label="Pozycja V"
                  value={obstacle.v}
                  min={0}
                  max={24}
                  onChange={(v) => updateObstacle({ v })}
                />
                <Field
                  label="Szerokość"
                  value={obstacle.width_m}
                  min={0.2}
                  max={4}
                  onChange={(width_m) => updateObstacle({ width_m })}
                />
                <Field
                  label="Głębokość"
                  value={obstacle.depth_m}
                  min={0.2}
                  max={4}
                  onChange={(depth_m) => updateObstacle({ depth_m })}
                />
                <Field
                  label="Wysokość"
                  value={obstacle.height_m}
                  min={0.05}
                  max={4}
                  step={0.05}
                  onChange={(height_m) => updateObstacle({ height_m })}
                />
              </div>
              <label className="select-field">
                Przypisanie do połaci
                <select
                  value={obstacle.surface_id}
                  onChange={(e) =>
                    updateObstacle({
                      surface_id: e.target.value as "south" | "north",
                    })
                  }
                >
                  <option value="south">Połać frontowa</option>
                  <option value="north">Połać tylna</option>
                </select>
              </label>
              <button
                className="delete-button"
                onClick={() => {
                  patch({
                    obstacles: scene.obstacles.filter((o) => o.id !== selected),
                  });
                  setSelected(null);
                }}
              >
                <Trash2 size={13} />
                Usuń przeszkodę
              </button>
              <button className="text-button" onClick={() => setSelected(null)}>
                <ArrowLeft size={13} />
                Geometria budynku
              </button>
            </>
          ) : (
            <>
              <div className="field-grid">
                <Field
                  label="Szerokość dachu"
                  value={scene.roof.width_m}
                  min={4}
                  max={30}
                  onChange={(width_m) =>
                    patch({ roof: { ...scene.roof, width_m } })
                  }
                />
                <Field
                  label="Głębokość domu"
                  value={scene.roof.depth_m}
                  min={4}
                  max={24}
                  onChange={(depth_m) =>
                    patch({ roof: { ...scene.roof, depth_m } })
                  }
                />
                <Field
                  label="Wysokość okapu"
                  value={scene.roof.eaves_m}
                  min={2}
                  max={12}
                  onChange={(eaves_m) =>
                    patch({ roof: { ...scene.roof, eaves_m } })
                  }
                />
                <Field
                  label="Nachylenie"
                  value={scene.roof.pitch_deg}
                  min={5}
                  max={60}
                  step={1}
                  unit="°"
                  onChange={(pitch_deg) =>
                    patch({ roof: { ...scene.roof, pitch_deg } })
                  }
                />
              </div>
              <label className="range-field">
                <span>
                  Azymut frontu <b>{scene.roof.azimuth_deg}°</b>
                </span>
                <input
                  aria-label="Azymut frontu"
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={scene.roof.azimuth_deg}
                  onChange={(e) =>
                    patch({
                      roof: { ...scene.roof, azimuth_deg: +e.target.value },
                    })
                  }
                />
                <small>
                  Północ <span>Południe</span>
                </small>
              </label>
            </>
          )}
          <div className="panel-rule" />
          <div className="section-label">REGUŁY ROZMIESZCZENIA</div>
          <div className="field-grid">
            <Field
              label="Odsunięcie krawędzi"
              value={scene.setback_m}
              min={0.05}
              max={1}
              step={0.05}
              onChange={(setback_m) => patch({ setback_m })}
            />
            <Field
              label="Strefa przeszkód"
              value={scene.clearance_m}
              min={0}
              max={1}
              step={0.05}
              onChange={(clearance_m) => patch({ clearance_m })}
            />
          </div>
          <div className="left-footer">
            <span className="status-dot" />
            Scena parametryczna<span className="mono">m / ENU</span>
          </div>
        </aside>
        <main className="main-view">
          <div className="mode-bar">
            <div className="mobile-toggles">
              <IconButton
                label="Parametry projektu"
                onClick={() =>
                  setMobilePanel(mobilePanel === "left" ? "" : "left")
                }
              >
                <Settings2 size={17} />
              </IconButton>
            </div>
            <nav aria-label="Tryb pracy">
              {modes.map(([id, title, Icon]) => (
                <button
                  key={id}
                  className={mode === id ? "active" : ""}
                  onClick={() => {
                    setMode(id);
                    setSelected(null);
                  }}
                >
                  <Icon size={15} />
                  <span>{title}</span>
                </button>
              ))}
            </nav>
            <div className="mobile-toggles">
              <IconButton
                label="Wyniki projektu"
                onClick={() =>
                  setMobilePanel(mobilePanel === "right" ? "" : "right")
                }
              >
                <Layers3 size={17} />
              </IconButton>
            </div>
          </div>
          <div className="canvas-container">
            <div className="canvas-label">
              <span className="live-label">
                <span />
                PODGLĄD 3D
              </span>
              <h1>{headline}</h1>
              <p>
                {mode === "sun"
                  ? "Kierunek słońca i cień · Szczecin · CET"
                  : mode === "variants"
                    ? "Deterministyczne przeszukiwanie siatki modułów"
                    : mode === "quality"
                      ? "Metry, wersja silnika i dane wejściowe"
                      : "Dach dwuspadowy · model edytowalny"}
              </p>
            </div>
            <div className="view-controls">
              <IconButton
                label="Widok perspektywiczny"
                active={view === "orbit"}
                onClick={() => setView("orbit")}
              >
                <Box size={17} />
              </IconButton>
              <IconButton
                label="Widok z góry"
                active={view === "top"}
                onClick={() => setView("top")}
              >
                <Square size={17} />
              </IconButton>
              <IconButton
                label="Widok od frontu"
                active={view === "front"}
                onClick={() => setView("front")}
              >
                <Maximize size={17} />
              </IconButton>
              <span />
              <IconButton
                label="Siatka i wymiary"
                active={grid}
                onClick={() => setGrid(!grid)}
              >
                <Grid2X2 size={17} />
              </IconButton>
              <IconButton
                label="Cofnij"
                onClick={undo}
                disabled={!history.length}
              >
                <Undo2 size={17} />
              </IconButton>
              <IconButton
                label="Ponów"
                onClick={redo}
                disabled={!future.length}
              >
                <Redo2 size={17} />
              </IconButton>
            </div>
            {result ? (
              <Suspense
                fallback={
                  <div className="canvas-loading">
                    <LoaderCircle className="spin" />
                    Ładowanie silnika 3D
                  </div>
                }
              >
                <SceneView
                  scene={JSON.parse(resultInput || serialized)}
                  result={result}
                  variant={variant}
                  selected={selected}
                  onSelect={setSelected}
                  onPanel={(p) =>
                    setToast(
                      p.id +
                        " · " +
                        result.product.power_wp +
                        " Wp · " +
                        surfaceTitle(p.surface_id),
                    )
                  }
                  view={view}
                  showGrid={grid}
                  sunHour={sunHour}
                  sunDate={sunDate}
                  sunMode={mode === "sun"}
                />
              </Suspense>
            ) : (
              <div className="canvas-loading">
                <LoaderCircle className="spin" />
                <p>Przygotowywanie modelu i układu…</p>
              </div>
            )}
            {error && (
              <div className="canvas-error">
                <strong>Nie obliczono nowego układu</strong>
                <p>{error}</p>
                <button onClick={() => setRetry((r) => r + 1)}>
                  Ponów obliczenie
                </button>
              </div>
            )}
            {computing && result && (
              <div className="recompute">
                <LoaderCircle size={14} className="spin" />
                Przeliczanie geometrii…
              </div>
            )}
            <div className="compass">
              <span>N</span>
              <div
                style={{
                  transform:
                    "rotate(" + (-scene.roof.azimuth_deg + 180) + "deg)",
                }}
              >
                <ArrowRight size={25} />
              </div>
              <small>ENU</small>
            </div>
            <div className="canvas-hint">
              <Move3D size={14} />
              Obrót: przeciągnij<span>·</span>Zoom: kółko<span>·</span>Kliknij
              obiekt
            </div>
            <div className="scale">
              <span />
              <small>Scena w metrach</small>
            </div>
            {mode === "sun" ? (
              <div className="sun-timeline">
                <div>
                  <Sun size={19} />
                  <span>
                    POZYCJA SŁOŃCA
                    <small>Podgląd geometryczny, bez obliczeń uzysku</small>
                  </span>
                  <input
                    type="date"
                    aria-label="Data podglądu słońca"
                    value={sunDate}
                    onChange={(e) => setSunDate(e.target.value || "2026-11-20")}
                  />
                  <strong>
                    {String(Math.floor(sunHour)).padStart(2, "0")}:
                    {sunHour % 1 ? "30" : "00"}
                  </strong>
                </div>
                <input
                  type="range"
                  aria-label="Godzina podglądu słońca"
                  min={7}
                  max={17}
                  step={0.5}
                  value={sunHour}
                  onChange={(e) => setSunHour(+e.target.value)}
                />
                <div className="timeline-labels">
                  <span>07:00</span>
                  <span>CET · UTC+1</span>
                  <span>17:00</span>
                </div>
              </div>
            ) : (
              <div className="variant-dock">
                {result?.variants.map((v, i) => (
                  <button
                    key={v.id}
                    className={variant?.id === v.id ? "active" : ""}
                    onClick={() => setVariantId(v.id)}
                  >
                    <span className="variant-thumb">
                      <i className={v.id} />
                    </span>
                    <span>
                      <b>
                        {v.id === "landscape"
                          ? "Układ poziomy"
                          : "Układ pionowy"}
                        {i === 0 && <small>WIĘCEJ MODUŁÓW</small>}
                      </b>
                      <em>
                        {num(v.power_kwp, 2)} kWp<span>·</span>
                        {v.module_count} modułów
                      </em>
                    </span>
                    <span className="variant-check">
                      {variant?.id === v.id ? (
                        <Check size={14} />
                      ) : (
                        <ArrowRight size={14} />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
        <aside
          className={
            "right-panel " + (mobilePanel === "right" ? "mobile-open" : "")
          }
        >
          <div className="panel-top">
            <span>
              {mode === "materials"
                ? "ZESTAWIENIE MATERIAŁÓW"
                : mode === "quality"
                  ? "WERYFIKACJA PROJEKTU"
                  : "BILANS PROJEKTU"}
            </span>
            <span className={"status-dot " + (stale ? "amber" : "")} />
          </div>
          <div className={"power-card " + (stale ? "stale" : "")}>
            <div className="eyebrow">
              <Zap size={13} />
              MOC INSTALACJI · STC
            </div>
            <div className="power-number">
              {variant ? num(variant.power_kwp, 2) : "—"}
              <span>kWp</span>
            </div>
            <div className="power-bottom">
              <span>
                {scene.surfaces.length === 1
                  ? "Jedna połać aktywna"
                  : "Dwie połacie aktywne"}
              </span>
              <b>{stale ? "Aktualizacja…" : "Obliczono"}</b>
            </div>
          </div>
          <div className={"metric-grid " + (stale ? "stale" : "")}>
            <div>
              <span>Moduły aktywne</span>
              <strong>
                {variant?.module_count ?? "—"}
                <small>szt.</small>
              </strong>
            </div>
            <div>
              <span>Pokrycie połaci</span>
              <strong>
                {variant ? num(variant.coverage_pct) : "—"}
                <small>%</small>
              </strong>
            </div>
            <div>
              <span>Aktywna powierzchnia</span>
              <strong>
                {variant ? num(variant.active_area_m2) : "—"}
                <small>m²</small>
              </strong>
            </div>
            <div>
              <span>Powierzchnia połaci</span>
              <strong>
                {variant ? num(variant.roof_area_m2) : "—"}
                <small>m²</small>
              </strong>
            </div>
          </div>
          {mode === "materials" ? (
            <>
              <div className="section-label">MATERIAŁY Z GEOMETRII</div>
              <div className="material-row">
                <span>
                  Moduł {result?.product.name}
                  <small>Katalog demonstracyjny</small>
                </span>
                <b>{variant?.module_count ?? "—"} szt.</b>
              </div>
              <div className="material-row">
                <span>Powierzchnia modułów</span>
                <b>{variant ? num(variant.active_area_m2) : "—"} m²</b>
              </div>
              <div className="material-row">
                <span>
                  Poza modułami<small>Różnica powierzchni, bez rozkroju</small>
                </span>
                <b>
                  {variant
                    ? num(variant.roof_area_m2 - variant.active_area_m2)
                    : "—"}{" "}
                  m²
                </b>
              </div>
              <div className="info-note">
                Elementy bierne, obróbki, wiązki i falownik wymagają reguł
                producenta. Nie są częścią tego zestawienia.
              </div>
              <button
                className="button full"
                onClick={exportMaterials}
                disabled={stale || !variant}
              >
                <ArrowDownToLine size={14} />
                Pobierz zestawienie CSV
              </button>
            </>
          ) : mode === "quality" ? (
            <>
              <div className="section-label">ŚLAD OBLICZENIA</div>
              <dl className="trace">
                <dt>Algorytm</dt>
                <dd>{result?.engine_version ?? "—"}</dd>
                <dt>Układ współrzędnych</dt>
                <dd>ENU → (E, U, −N)</dd>
                <dt>Źródło geometrii</dt>
                <dd>Scena parametryczna</dd>
                <dt>Czas pierwszego obliczenia</dt>
                <dd>{result?.duration_ms ?? "—"} ms</dd>
                <dt>Hash wejścia</dt>
                <dd className="hash">{result?.source_hash ?? "—"}</dd>
                <dt>Rewizja zapisu</dt>
                <dd>
                  {project
                    ? String(project.revision) +
                      (project.input !== serialized ? " · zmiany lokalne" : "")
                    : "Projekt lokalny"}
                </dd>
              </dl>
              <div className="section-label">ZAKRES WYNIKU</div>
              {result?.warnings.map((w, i) => (
                <p className="quality-note" key={i}>
                  <ShieldCheck size={14} />
                  {w}
                </p>
              ))}
            </>
          ) : (
            <>
              <div className="section-label">
                PRODUKT BIPV<span className="label-tag">DEMO</span>
              </div>
              <div className="product-preview">
                <div className={"product-swatch " + scene.product_id} />
                <span>
                  {result?.product.family ?? "Panel dachowy"}
                  <b>{result?.product.name ?? "Slate 75"}</b>
                  <small>{result?.product.finish ?? "Grafit satynowy"}</small>
                </span>
              </div>
              <label className="select-field">
                Model modułu
                <select
                  aria-label="Model modułu"
                  value={scene.product_id}
                  onChange={(e) =>
                    patch({ product_id: e.target.value as Scene["product_id"] })
                  }
                >
                  <option value="slate-75">Slate 75 · 75 Wp</option>
                  <option value="tile-32">Tile 32 · 32 Wp</option>
                  <option value="panel-120">Linear 120 · 120 Wp</option>
                </select>
              </label>
              <div className="product-spec">
                <span>Wymiary modułu</span>
                <b>
                  {result
                    ? num(result.product.width_m, 2) +
                      " × " +
                      num(result.product.height_m, 2) +
                      " m"
                    : "—"}
                </b>
              </div>
              <div className="product-spec">
                <span>Szczelina montażowa</span>
                <b>{num(scene.gap_m * 1000, 0)} mm</b>
              </div>
              <div className="info-note">
                <ShieldCheck size={15} />
                <span>
                  Wymiary i moc są demonstracyjne. Katalog producenta podłączymy
                  jako osobną, wersjonowaną warstwę.
                </span>
              </div>
              {mode === "sun" && (
                <div className="solar-note">
                  <Sun size={20} />
                  <strong>Podgląd cienia</strong>
                  <p>
                    Pozycja astronomiczna dla Szczecina, stały czas CET. Słońce
                    pod horyzontem nie oświetla sceny. Cień 3D nie jest modelem
                    rocznej produkcji.
                  </p>
                </div>
              )}
              {mode === "variants" && (
                <div className="solar-note">
                  <Layers3 size={20} />
                  <strong>16 przesunięć siatki</strong>
                  <p>
                    Całe obrysy modułów sprawdzamy względem krawędzi i stref
                    przeszkód. Wynik jest heurystyką, bez gwarancji optimum.
                  </p>
                </div>
              )}
            </>
          )}
          <div className="right-footer">
            <div className="prototype-badge">
              <span />
              DEMONSTRATOR INŻYNIERSKI
            </div>
            <p>
              Geometria i rozmieszczenie są obliczane. Uzysk roczny, stringi i
              wycena pozostają do wdrożenia.
            </p>
            <button className="text-button" onClick={() => setMode("quality")}>
              Sprawdź źródła i ograniczenia
              <ArrowRight size={13} />
            </button>
          </div>
        </aside>
      </div>
      <footer className="status-bar">
        <div>
          <span
            className={
              "status-dot " + (error ? "red" : computing ? "amber" : "")
            }
          />
          {error
            ? "Błąd obliczenia"
            : computing
              ? "Przeliczanie układu"
              : "Geometria obliczona"}
          <span className="status-separator" />
          <Save size={12} />
          Kopia lokalna
        </div>
        <div className="status-middle">
          {result?.engine_version ?? "grid-search/0.1.0"}
          <span>·</span>
          {result?.source_hash.slice(0, 10) ?? "oczekiwanie"}
        </div>
        <div>
          <span className={"status-dot " + (cloudConfigured ? "" : "amber")} />
          {cloudConfigured ? "Supabase podłączony" : "Tryb lokalny"}
          <span className="status-separator" />
          <button onClick={() => setConfirmReset(true)}>
            <RotateCcw size={12} />
            Nowy projekt
          </button>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="Zamknij komunikat" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {projectModal && (
        <div className="modal-backdrop" onClick={() => setProjectModal(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Projekty w Supabase"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">PRZESTRZEŃ GOŚCINNA</span>
                <h2>Twoje projekty.</h2>
              </div>
              <IconButton
                label="Zamknij projekty"
                onClick={() => setProjectModal(false)}
              >
                <X size={19} />
              </IconButton>
            </div>
            <p>
              Zapisy są przypisane do losowego klucza tej przeglądarki.
              Wyczyszczenie jej pamięci usuwa dostęp do przestrzeni. Zachowaj
              eksport JSON.
            </p>
            {projectLoading ? (
              <div className="empty">
                <LoaderCircle className="spin" />
                Ładowanie projektów…
              </div>
            ) : projects.length ? (
              projects.map((p) => (
                <div className="project-list-row" key={p.id}>
                  <button onClick={() => openProject(p.id)}>
                    <Box size={20} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        Rewizja {p.revision} ·{" "}
                        {new Date(p.updated_at).toLocaleString("pl-PL")}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                  <IconButton
                    label={"Usuń projekt " + p.name}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Usunąć zapis „" + p.name + "” z Supabase?",
                        )
                      )
                        void removeProject(p.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              ))
            ) : (
              <div className="empty">
                <FolderOpen size={30} />
                <h3>Przestrzeń czeka na pierwszy projekt.</h3>
                <p>Użyj przycisku „Zapisz projekt” w studiu.</p>
              </div>
            )}
            <div className="modal-actions">
              <button
                className="button"
                onClick={() => {
                  file.current?.click();
                  setProjectModal(false);
                }}
              >
                <Upload size={14} />
                Importuj scenę
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setProjectModal(false);
                  setConfirmReset(true);
                }}
              >
                <Plus size={14} />
                Nowy projekt
              </button>
            </div>
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="O demonstratorze"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">REGISTRY9 ENGINEERING</span>
                <h2>BIPV Studio / R1</h2>
              </div>
              <IconButton
                label="Zamknij informacje"
                onClick={() => setHelp(false)}
              >
                <X size={19} />
              </IconButton>
            </div>
            <p>
              Parametryczny demonstrator projektowania pokryć BIPV. Edytuj dach
              i przeszkody, porównaj układy oraz zachowaj projekt w Supabase.
            </p>
            <div className="help-grid">
              <div>
                <MousePointer2 />
                <strong>Geometria</strong>
                <p>
                  Kliknij komin lub okno, aby zmienić parametry. Ctrl / ⌘ + Z
                  cofa edycję.
                </p>
              </div>
              <div>
                <Cloud />
                <strong>Zapis</strong>
                <p>
                  Kopia lokalna zapisuje się przy zmianach. Zapis w Supabase
                  wykonujesz przyciskiem.
                </p>
              </div>
              <div>
                <Sun />
                <strong>Światło</strong>
                <p>
                  Przesuwaj godzinę w trybie Słońce. To podgląd cienia, bez
                  prognozy produkcji.
                </p>
              </div>
              <div>
                <ShieldCheck />
                <strong>Dowody</strong>
                <p>
                  Kontrola pokazuje hash wejścia, wersję algorytmu i
                  ograniczenia wyniku.
                </p>
              </div>
            </div>
            <div className="info-note">
              R1 nie zawiera rekonstrukcji adresów, modeli ML ani wykonania
              agentów AI. Powstają w kolejnych etapach.
            </div>
            <a
              className="repo-link"
              href="https://github.com/maciejbrasewicz/bipv-blueprint"
              target="_blank"
              rel="noreferrer"
            >
              Repozytorium projektu
              <ArrowRight size={14} />
            </a>
          </section>
        </div>
      )}
      {confirmReset && (
        <div className="modal-backdrop" onClick={() => setConfirmReset(false)}>
          <section
            className="modal compact-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Nowy projekt"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="eyebrow">NOWY PROJEKT</span>
            <h2>Zacznij od nowej sceny.</h2>
            <p>
              Bieżącą scenę zastąpi model startowy. Zapis w chmurze pozostanie w
              projektach.
            </p>
            <div className="modal-actions">
              <button className="button" onClick={() => setConfirmReset(false)}>
                Wróć
              </button>
              <button
                className="button primary"
                onClick={() => {
                  changed(structuredClone(INITIAL));
                  setProject(null);
                  setSelected(null);
                  setConfirmReset(false);
                }}
              >
                Utwórz scenę
              </button>
            </div>
          </section>
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void importJson(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
