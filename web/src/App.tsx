import {
  Component,
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
  History,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Maximize,
  MapPin,
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
  UserRound,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, download, workspaceKey } from "./api";
import AccountDialog from "./AccountDialog";
import SurfacePlan from "./SurfacePlan";
import HoleEditor from "./HoleEditor";
import LocationDialog from "./LocationDialog";
import PortalNav from "./PortalNav";
import examplePlanes from "./example-planes.json";
import {
  INITIAL,
  type CloudRef,
  type HoleSelection,
  type Layout,
  type Obstacle,
  type Organization,
  type OrthophotoTrace,
  type Project,
  type ProjectRevisionSummary,
  type ProjectSummary,
  type PointUV,
  type Scene,
  type SceneDocument,
  type SceneSite,
  type SceneV2,
} from "./types";
const SceneView = lazy(() => import("./SceneView"));
const num = (v: number, d = 1) =>
  v.toLocaleString("pl-PL", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
const modes: [string, string, LucideIcon][] = [
  ["project", "Projekt", MousePointer2],
  ["sun", "Słońce", Sun],
  ["variants", "Warianty", Layers3],
  ["materials", "Materiały", LayoutGrid],
  ["quality", "Kontrola", ShieldCheck],
];
class ViewportBoundary extends Component<
  { children: ReactNode; onUnavailable: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onUnavailable();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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
      aria-pressed={p.active}
      onClick={p.onClick}
      disabled={p.disabled}
    >
      {p.children}
    </button>
  );
}
function geometry(document: SceneDocument): Scene {
  return document.schema_version === "2.0.0" ? document.geometry : document;
}

function readLocal(): SceneDocument {
  try {
    const document = JSON.parse(
      localStorage.getItem("bipv.scene.v1") || "null",
    );
    const scene = geometry(document);
    if (
      scene.schema_version === "1.0.0" &&
      scene.roof &&
      Array.isArray(scene.obstacles) &&
      scene.surfaces?.length &&
      (document.schema_version !== "2.0.0" ||
        Array.isArray(document.surface_evidence))
    )
      return document;
  } catch {}
  return INITIAL;
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
  const [workspace, setWorkspace] = useState<{
    organization: Organization;
    project?: Project;
  } | null>(null);
  function selectWorkspace(
    organization: Organization | null,
    project?: Project,
  ) {
    if (project) {
      try {
        localStorage.removeItem("bipv.cloudproject.v1");
        localStorage.removeItem("bipv.scene.v1");
      } catch {}
    }
    setWorkspace(organization ? { organization, project } : null);
  }

  return (
    <Studio
      key={workspace?.organization.id ?? "guest"}
      organization={workspace?.organization ?? null}
      initialProject={workspace?.project}
      onScope={selectWorkspace}
    />
  );
}

function Studio({
  organization,
  initialProject,
  onScope,
}: {
  organization: Organization | null;
  initialProject?: Project;
  onScope: (organization: Organization | null, project?: Project) => void;
}) {
  const [document, setDocument] = useState<SceneDocument>(() =>
      organization ? (initialProject?.scene ?? INITIAL) : readLocal(),
    ),
    [history, setHistory] = useState<SceneDocument[]>([]),
    [future, setFuture] = useState<SceneDocument[]>([]);
  const scene = geometry(document);
  const [result, setResult] = useState<Layout | null>(null),
    [resultInput, setResultInput] = useState(""),
    [computing, setComputing] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [mode, setMode] = useState("project"),
    [variantId, setVariantId] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [view, setView] = useState("orbit"),
    [hole, setHole] = useState<HoleSelection | null>(null),
    [planSurface, setPlanSurface] = useState<string | null>(null),
    [webglUnavailable, setWebglUnavailable] = useState(false),
    [grid, setGrid] = useState(true);
  const [sunHour, setSunHour] = useState(12),
    [sunDate, setSunDate] = useState("2026-11-20"),
    [toast, setToast] = useState(""),
    [saving, setSaving] = useState(false),
    [project, setProject] = useState<CloudRef | null>(() => {
      if (!organization) return readCloudRef();
      return initialProject
        ? {
            id: initialProject.id,
            revision: initialProject.revision,
            input: JSON.stringify(initialProject.scene),
          }
        : null;
    });
  const [accountOpen, setAccountOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const site = document.schema_version === "2.0.0" ? document.site : undefined;
  const projectKey = () =>
    organization ? { organizationId: organization.id } : workspaceKey();
  const documentInput = JSON.stringify(document);
  const dirty = project
    ? project.input !== documentInput
    : documentInput !== JSON.stringify(INITIAL);
  const canLeave = () =>
    !organization ||
    !dirty ||
    window.confirm("Porzucić niezapisane zmiany w projekcie organizacji?");
  const [projectModal, setProjectModal] = useState(false),
    [projects, setProjects] = useState<ProjectSummary[]>([]),
    [projectLoading, setProjectLoading] = useState(false),
    [cloudConfigured, setCloudConfigured] = useState(false),
    [exportMenu, setExportMenu] = useState(false),
    [help, setHelp] = useState(false),
    [confirmReset, setConfirmReset] = useState(false),
    [mobilePanel, setMobilePanel] = useState("");
  const [revisionProject, setRevisionProject] = useState<ProjectSummary | null>(
    null,
  );
  const [revisionList, setRevisionList] = useState<ProjectRevisionSummary[]>(
    [],
  );
  const [revisionError, setRevisionError] = useState("");
  const revisionRequest = useRef<AbortController | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const documentRef = useRef(document);
  documentRef.current = document;
  const serialized = JSON.stringify(scene);
  const stale = resultInput !== serialized;
  const calculating = computing || stale;
  const currentResult = stale ? null : result;
  const variant =
    currentResult?.variants.find((v) => v.id === variantId) ??
    currentResult?.variants[0];
  const surfaceChoices = scene.custom_surfaces ?? [
    { id: "south", name: "Połać frontowa" },
    { id: "north", name: "Połać tylna" },
  ];
  const obstacle = scene.obstacles.find((o) => o.id === selected);
  const requestedSurface =
    obstacle?.surface_id ?? hole?.surfaceId ?? planSurface;
  const activeSurfaceId =
    surfaceChoices.find((surface) => surface.id === requestedSurface)?.id ??
    scene.surfaces[0] ??
    surfaceChoices[0].id;
  const footprintPreview = scene.surfaces.length === 0;
  const inspectedSurface = scene.custom_surfaces?.find(
    (surface) => surface.id === activeSurfaceId,
  );
  const inspectedRing =
    hole?.surfaceId === activeSurfaceId
      ? inspectedSurface?.holes_uv_m?.[hole.index]
      : undefined;
  const provenance =
    document.schema_version === "2.0.0"
      ? document.surface_evidence.find(
          (item) => item.surface_id === activeSurfaceId,
        )
      : undefined;
  const geometryStatus =
    provenance?.status === "measured"
      ? "Zmierzona"
      : provenance?.status === "estimated"
        ? "Szacowana"
        : "Niezweryfikowana";
  const surfaceTitle = (id: string) =>
    surfaceChoices.find((s) => s.id === id)?.name ?? id;
  const changed = useCallback((next: SceneDocument) => {
    const previous = documentRef.current;
    documentRef.current = next;
    setHistory((h) => [...h.slice(-39), previous]);
    setFuture([]);
    setDocument(next);
  }, []);
  function applyLocatedModel(next: SceneV2, notice: string) {
    changed(next);
    setSelected(null);
    setHole(null);
    setPlanSurface(
      next.geometry.surfaces[0] ??
        next.geometry.custom_surfaces?.[0]?.id ??
        null,
    );
    setMode("project");
    setLocationOpen(false);
    setToast(notice);
  }
  async function confirmSite(
    chosenSite: SceneSite,
    center: { easting_m: number; northing_m: number },
    rings: PointUV[][][],
    signal: AbortSignal,
  ) {
    const current = documentRef.current;
    const { name, product_id, setback_m, gap_m, clearance_m } =
      geometry(current);
    const next = await api<SceneV2>(
      "scene/from-footprint",
      "POST",
      {
        name:
          name === INITIAL.name ||
          (current.schema_version === "2.0.0" && name === current.site?.address)
            ? chosenSite.address.slice(0, 100)
            : name,
        product_id,
        setback_m,
        gap_m,
        clearance_m,
        site: chosenSite,
        center: { easting_m: center.easting_m, northing_m: center.northing_m },
        rings_m: rings,
      },
      undefined,
      signal,
    );
    if (signal.aborted) return;
    if (documentRef.current !== current)
      throw new Error(
        "Scena zmieniła się podczas tworzenia bryły. Wybierz budynek ponownie.",
      );
    if (!webglUnavailable) setView("orbit");
    applyLocatedModel(
      next,
      next.geometry.surfaces.length
        ? "Utworzono szacowaną bryłę z obrysu wybranego budynku EGiB."
        : "Wyświetlono bryłę EGiB. Obrys przekracza limit obliczeń układu PV.",
    );
  }
  async function applyOrthophotoTrace(
    chosenSite: SceneSite,
    trace: OrthophotoTrace,
    signal: AbortSignal,
  ) {
    const current = documentRef.current;
    const { name, product_id, setback_m, gap_m, clearance_m } =
      geometry(current);
    const next = await api<SceneV2>(
      "scene/from-orthophoto",
      "POST",
      {
        name,
        product_id,
        setback_m,
        gap_m,
        clearance_m,
        site: chosenSite,
        trace,
      },
      undefined,
      signal,
    );
    if (signal.aborted) return;
    if (documentRef.current !== current)
      throw new Error("Scena zmieniła się podczas walidacji. Ponów edycję.");
    applyLocatedModel(
      next,
      trace.gable
        ? "Utworzono szacowany dach dwuspadowy z obrysu."
        : "Utworzono szacowany dach płaski z obrysu.",
    );
  }
  function changeGeometry(next: Scene, changedSurfaceId?: string) {
    if (document.schema_version === "1.0.0") {
      changed(next);
      return;
    }
    changed({
      ...document,
      geometry: next,
      surface_evidence: document.surface_evidence.map((item) =>
        item.surface_id === changedSurfaceId ||
        (!next.custom_surfaces && next.roof !== scene.roof)
          ? { ...item, status: "unverified" }
          : item,
      ),
    });
  }
  const patch = (partial: Partial<Scene>) =>
    changeGeometry({ ...scene, ...partial });
  function selectObstacle(id: string | null) {
    setSelected(id);
    setHole(null);
  }
  function selectHole(next: HoleSelection) {
    setSelected(null);
    setHole(next);
    setPlanSurface(next.surfaceId);
    setMode("project");
  }
  async function applyHole(nextRing: PointUV[]) {
    if (!hole || !inspectedRing) return;
    const requestedDocument = document;
    const candidate = {
      ...scene,
      custom_surfaces: scene.custom_surfaces?.map((surface) =>
        surface.id === hole.surfaceId
          ? {
              ...surface,
              holes_uv_m: surface.holes_uv_m?.map((ring, index) =>
                index === hole.index ? nextRing : ring,
              ),
            }
          : surface,
      ),
    };
    await api<Scene>("scene/validate", "POST", candidate);
    if (documentRef.current !== requestedDocument)
      throw new Error("Scena zmieniła się podczas walidacji. Ponów edycję.");
    changeGeometry(candidate, hole.surfaceId);
  }
  useEffect(() => {
    api<{ cloud_configured: boolean }>("health")
      .then((h) => setCloudConfigured(h.cloud_configured))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (organization) return;
    try {
      localStorage.setItem("bipv.scene.v1", documentInput);
    } catch {
      setToast("Pamięć urządzenia jest niedostępna. Wyeksportuj projekt JSON.");
    }
  }, [documentInput, organization]);
  useEffect(() => {
    if (organization) return;
    try {
      if (project)
        localStorage.setItem("bipv.cloudproject.v1", JSON.stringify(project));
      else localStorage.removeItem("bipv.cloudproject.v1");
    } catch {}
  }, [project, organization]);
  useEffect(() => {
    const controller = new AbortController();
    setComputing(true);
    setError("");
    const timeout = setTimeout(() => {
      api<Layout>(
        "layout",
        "POST",
        JSON.parse(serialized),
        undefined,
        controller.signal,
      )
        .then((r) => {
          if (controller.signal.aborted) return;
          setResult(r);
          setResultInput(serialized);
          setComputing(false);
        })
        .catch((e) => {
          if (!controller.signal.aborted && e.name !== "AbortError") {
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
    setFuture((f) => [document, ...f]);
    setDocument(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, document]);
    setDocument(future[0]);
    setFuture((f) => f.slice(1));
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches("input,textarea")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Escape") {
        selectObstacle(null);
        closeProjects();
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
        {
          scene: document,
          ...(project ? { expected_revision: project.revision } : {}),
        },
        projectKey(),
      );
      setProject({
        id: p.id,
        revision: p.revision,
        input: documentInput,
      });
      setToast("Zapisano w Supabase · rewizja " + p.revision);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function closeProjects() {
    revisionRequest.current?.abort();
    setProjectModal(false);
    setRevisionProject(null);
    setProjectLoading(false);
  }

  async function openRevisions(summary: ProjectSummary) {
    revisionRequest.current?.abort();
    const controller = new AbortController();
    revisionRequest.current = controller;
    setRevisionProject(summary);
    setRevisionList([]);
    setRevisionError("");
    setProjectLoading(true);
    try {
      const { revisions } = await api<{ revisions: ProjectRevisionSummary[] }>(
        "projects/" + summary.id + "/revisions",
        "GET",
        undefined,
        projectKey(),
        controller.signal,
      );
      if (!controller.signal.aborted) setRevisionList(revisions);
    } catch (e) {
      if (!controller.signal.aborted) setRevisionError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setProjectLoading(false);
    }
  }

  async function loadRevision(summary: ProjectSummary, revision: number) {
    const hasLocalChanges = dirty;
    if (
      hasLocalChanges &&
      !window.confirm("Zastąpić bieżące zmiany lokalne wybraną rewizją?")
    )
      return;

    revisionRequest.current?.abort();
    const controller = new AbortController();
    revisionRequest.current = controller;
    setRevisionError("");
    setProjectLoading(true);
    try {
      const path = "projects/" + summary.id;
      const key = projectKey();
      const [latest, snapshot] = await Promise.all([
        api<Project>(path, "GET", undefined, key, controller.signal),
        api<{ scene: SceneDocument }>(
          path + "/revisions/" + revision,
          "GET",
          undefined,
          key,
          controller.signal,
        ),
      ]);
      if (controller.signal.aborted) return;
      changed(snapshot.scene);
      setPlanSurface(null);
      setProject({
        id: latest.id,
        revision: latest.revision,
        input: JSON.stringify(latest.scene),
      });
      selectObstacle(null);
      closeProjects();
      setToast(
        "Wczytano rewizję " +
          revision +
          ". Zapisz projekt, aby utworzyć kolejną rewizję.",
      );
    } catch (e) {
      if (!controller.signal.aborted) setRevisionError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setProjectLoading(false);
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
        projectKey(),
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
        projectKey(),
      );
      changed(p.scene);
      setPlanSurface(null);
      setProject({
        id: p.id,
        revision: p.revision,
        input: JSON.stringify(p.scene),
      });
      selectObstacle(null);
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
      await api("projects/" + id, "DELETE", undefined, projectKey());
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
      setToast("Scena może zawierać do 12 przeszkód.");
      return;
    }
    const id = kind + "-" + crypto.randomUUID().slice(0, 8);
    const surfaceId = scene.surfaces[0] ?? activeSurfaceId;
    const exterior = scene.custom_surfaces?.find(
      (s) => s.id === surfaceId,
    )?.boundary_uv_m;
    const u = exterior
      ? Math.min(...exterior.map((point) => point[0])) + 0.6
      : scene.roof.width_m / 2 - 0.5;
    const v = exterior
      ? Math.min(...exterior.map((point) => point[1])) + 0.6
      : 1;
    const o: Obstacle = {
      id,
      kind,
      surface_id: surfaceId,
      u,
      v,
      width_m: 0.8,
      depth_m: 1,
      height_m: kind === "chimney" ? 1.1 : 0.12,
    };
    patch({ obstacles: [...scene.obstacles, o] });
    selectObstacle(id);
  };
  const exportJson = () => {
    download(
      "bipv-project.json",
      JSON.stringify(
        {
          format: "registry9-bipv-project/1",
          scene: document,
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
        "Powierzchnia objęta układem",
        "",
        String(variant.roof_area_m2),
        "m2",
        scene.custom_surfaces ? "import geometrii" : "scena parametryczna",
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
  async function exportModel(format: "obj" | "glb") {
    if (!variant || stale) return;
    setExportMenu(false);
    try {
      const response = await fetch(`/api/model.${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: document, variant: variant.id }),
      });
      if (!response.ok)
        throw new Error(
          `Eksport ${format.toUpperCase()} nie powiódł się. Spróbuj ponownie.`,
        );
      download(`bipv-model.${format}`, await response.blob());
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  function loadExample() {
    if (
      scene !== INITIAL &&
      dirty &&
      !window.confirm("Zastąpić bieżący szkic przykładem?")
    )
      return;
    setExportMenu(false);
    void importJson(
      new File([JSON.stringify(examplePlanes)], "example-planes.json"),
    );
  }

  async function importJson(f: File) {
    const requestedDocument = documentRef.current;
    try {
      if (f.size > 65000) throw new Error("Plik sceny przekracza 65 KB.");
      const j = JSON.parse(await f.text()),
        next = j.scene ?? j;
      const validated =
        next?.schema_version === "2.0.0"
          ? await api<SceneV2>("scene/v2/validate", "POST", next)
          : await api<Scene>("scene/validate", "POST", next);
      if (documentRef.current !== requestedDocument)
        throw new Error(
          "Scena zmieniła się podczas importu. Wczytaj plik ponownie.",
        );
      changed(validated);
      setProject(null);
      setPlanSurface(null);
      selectObstacle(null);
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
      <PortalNav current="studio" />
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
          {organization?.name ?? "TRYB GOŚCIA"}
        </span>
        <div className="header-actions">
          {cloudConfigured && (
            <IconButton
              label="Konto i organizacje"
              disabled={saving || projectLoading}
              onClick={() => setAccountOpen(true)}
            >
              <UserRound size={16} />
            </IconButton>
          )}
          <button
            className="button subtle"
            aria-label="Projekty"
            onClick={openProjects}
          >
            <FolderOpen size={15} />
            <span>Projekty</span>
          </button>
          <button
            className="button export-button"
            aria-label="Eksport"
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
              <button
                onClick={() => void exportModel("obj")}
                disabled={stale || !variant}
              >
                <Box size={16} />
                Model 3D OBJ
              </button>
              <button
                onClick={() => void exportModel("glb")}
                disabled={stale || !variant}
              >
                <Box size={16} />
                Model 3D GLB
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
              <button onClick={loadExample}>
                Wczytaj przykład dachu i fasady
              </button>
            </div>
          )}
          <button
            className="button primary"
            aria-label="Zapisz projekt"
            onClick={save}
            disabled={
              saving || !cloudConfigured || organization?.role === "viewer"
            }
          >
            {saving ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Cloud size={15} />
            )}
            <span>{saving ? "Zapisywanie…" : "Zapisz projekt"}</span>
          </button>
          <IconButton label="Pomoc BIPV Studio" onClick={() => setHelp(true)}>
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
            <span className="mini-badge">
              {scene.obstacles.length + surfaceChoices.length + 1}
            </span>
          </div>
          <button
            className="object-row project-location"
            aria-label={
              site ? "Zmień lokalizację budynku" : "Ustal lokalizację budynku"
            }
            onClick={() => setLocationOpen(true)}
          >
            <MapPin size={17} />
            <span>
              {site?.address ?? "Lokalizacja budynku"}
              <small>
                {site ? `EGiB · ${site.building_id}` : "Wyszukaj adres"}
              </small>
            </span>
            <ChevronRight size={13} />
          </button>
          <button
            className={
              "object-row building " +
              (selected === null && hole === null ? "selected" : "")
            }
            onClick={() => selectObstacle(null)}
          >
            <Box size={17} />
            <span>
              {scene.custom_surfaces
                ? "Powierzchnie projektu"
                : "Budynek mieszkalny"}
              <small>
                {scene.custom_surfaces
                  ? document.schema_version === "2.0.0" &&
                    document.surface_evidence.some(
                      (item) => item.egib_assumed_height_m,
                    )
                    ? "Skala z obrysu EGiB"
                    : "Geometria z importu"
                  : "Model parametryczny"}
              </small>
            </span>
            <ChevronDown size={13} />
          </button>
          <div className="object-children">
            {surfaceChoices.map(({ id, name }) => (
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
                  disabled={footprintPreview}
                  onChange={(e) => {
                    if (!e.target.checked && scene.surfaces.length === 1) {
                      setToast("Wybierz co najmniej jedną powierzchnię.");
                      return;
                    }
                    patch({
                      surfaces: e.target.checked
                        ? [...scene.surfaces, id]
                        : scene.surfaces.filter((s) => s !== id),
                    });
                  }}
                />
                {name}
                {!scene.custom_surfaces && (
                  <small>
                    {id === "south"
                      ? scene.roof.azimuth_deg
                      : (scene.roof.azimuth_deg + 180) % 360}
                    °
                  </small>
                )}
              </label>
            ))}
          </div>
          {footprintPreview && (
            <p className="info-note">
              Podgląd obrysu. Aby policzyć PV, wydziel mniejszą część dachu na
              ortofotomapie.
            </p>
          )}
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
                aria-pressed={selected === o.id}
                className={
                  "object-row obstacle-row " +
                  (selected === o.id ? "selected" : "")
                }
                onClick={() => {
                  selectObstacle(o.id);
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
                  min={-40}
                  max={40}
                  onChange={(u) => updateObstacle({ u })}
                />
                <Field
                  label="Pozycja V"
                  value={obstacle.v}
                  min={-40}
                  max={40}
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
                Przypisanie do powierzchni
                <select
                  value={obstacle.surface_id}
                  onChange={(e) =>
                    updateObstacle({
                      surface_id: e.target.value,
                    })
                  }
                >
                  {surfaceChoices.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
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
              <button
                className="text-button"
                onClick={() => selectObstacle(null)}
              >
                <ArrowLeft size={13} />
                Geometria budynku
              </button>
            </>
          ) : scene.custom_surfaces ? (
            <div className="surface-inspector">
              <label className="select-field">
                Sprawdzana powierzchnia
                <select
                  value={inspectedSurface?.id ?? ""}
                  onChange={(event) => {
                    setPlanSurface(event.currentTarget.value);
                    setHole(null);
                  }}
                >
                  {scene.custom_surfaces.map((surface) => (
                    <option key={surface.id} value={surface.id}>
                      {surface.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="info-note">
                <span>
                  Status geometrii <strong>{geometryStatus}</strong>
                  {provenance?.orthophoto_trace
                    ? " · obrys z ortofotomapy"
                    : ""}
                  {provenance?.egib_assumed_height_m
                    ? ` · obrys EGiB · wysokość założona ${provenance.egib_assumed_height_m} m`
                    : ""}
                  {provenance?.source_asset_ids.length
                    ? ` · źródła: ${provenance.source_asset_ids.length}`
                    : ""}
                </span>
              </p>
              <div className="hole-buttons" aria-label="Otwory powierzchni">
                {inspectedSurface?.holes_uv_m?.map((_, index) => (
                  <button
                    key={index}
                    className="button"
                    type="button"
                    aria-pressed={
                      hole?.surfaceId === inspectedSurface.id &&
                      hole.index === index
                    }
                    onClick={() =>
                      selectHole({ surfaceId: inspectedSurface.id, index })
                    }
                  >
                    Otwór {index + 1}
                  </button>
                ))}
              </div>
              {hole && inspectedRing && (
                <HoleEditor
                  key={`${hole.surfaceId}/${hole.index}`}
                  ring={inspectedRing}
                  onApply={applyHole}
                />
              )}
            </div>
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
            {scene.custom_surfaces ? "Scena z importu" : "Scena parametryczna"}
            <span className="mono">m / ENU</span>
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
                  aria-label={title}
                  disabled={id === "sun" && webglUnavailable}
                  className={mode === id ? "active" : ""}
                  onClick={() => {
                    setMode(id);
                    if (id === "sun" && view === "plan") setView("orbit");
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
                {view === "plan" ? "RZUT 2D" : "PODGLĄD 3D"}
              </span>
              <h1>{headline}</h1>
              <p>
                {webglUnavailable
                  ? "Podgląd 3D niedostępny · rzut i edycja są aktywne"
                  : mode === "sun"
                    ? `Kierunek słońca i cień · ${site?.address ?? "Szczecin"} · CET`
                    : mode === "variants"
                      ? "Deterministyczne przeszukiwanie siatki modułów"
                      : mode === "quality"
                        ? "Metry, wersja silnika i dane wejściowe"
                        : scene.custom_surfaces
                          ? "Dach i fasada · obrysy w metrach"
                          : "Dach dwuspadowy · model edytowalny"}
              </p>
            </div>
            <div className="view-controls">
              <IconButton
                label="Rzut 2D"
                active={view === "plan"}
                onClick={() => {
                  setView("plan");
                  if (mode === "sun") setMode("project");
                }}
              >
                <LayoutGrid size={17} />
              </IconButton>
              <IconButton
                label="Widok perspektywiczny"
                active={view === "orbit"}
                disabled={webglUnavailable}
                onClick={() => setView("orbit")}
              >
                <Box size={17} />
              </IconButton>
              <IconButton
                label="Widok z góry"
                active={view === "top"}
                disabled={webglUnavailable}
                onClick={() => setView("top")}
              >
                <Square size={17} />
              </IconButton>
              <IconButton
                label="Widok od frontu"
                active={view === "front"}
                disabled={webglUnavailable}
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
            {result && view === "plan" ? (
              <SurfacePlan
                surfaces={result.surfaces}
                surfaceId={activeSurfaceId}
                onSurface={(surfaceId) => {
                  setPlanSurface(surfaceId);
                  if (activeSurfaceId !== surfaceId) selectObstacle(null);
                }}
                obstacles={scene.obstacles}
                variant={stale ? undefined : variant}
                selected={selected}
                onSelect={selectObstacle}
                hole={hole}
                onHole={selectHole}
                showGrid={grid}
              />
            ) : result ? (
              <ViewportBoundary
                onUnavailable={() => {
                  setWebglUnavailable(true);
                  setView("plan");
                  if (mode === "sun") setMode("project");
                }}
              >
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
                    onSelect={selectObstacle}
                    hole={hole}
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
                    site={site}
                    footprintIds={
                      document.schema_version === "2.0.0"
                        ? document.surface_evidence
                            .filter((s) => s.egib_assumed_height_m)
                            .map((s) => s.surface_id)
                        : []
                    }
                  />
                </Suspense>
              </ViewportBoundary>
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
            {calculating && !error && result && (
              <div className="recompute">
                <LoaderCircle size={14} className="spin" />
                Poprzednia geometria · trwa przeliczanie
              </div>
            )}
            {view !== "plan" && (
              <>
                <div className="compass">
                  <span>N</span>
                  <div
                    style={{
                      transform: "rotate(" + scene.roof.azimuth_deg + "deg)",
                    }}
                  >
                    <ArrowRight size={25} />
                  </div>
                  <small>ENU</small>
                </div>
                <div className="canvas-hint">
                  <Move3D size={14} />
                  Obrót: przeciągnij<span>·</span>Zoom: kółko<span>·</span>
                  Kliknij obiekt
                </div>
                <div className="scale">
                  <span />
                  <small>Scena w metrach</small>
                </div>
              </>
            )}
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
                {currentResult?.variants.map((v, i) => (
                  <button
                    key={v.id}
                    className={variant?.id === v.id ? "active" : ""}
                    aria-pressed={variant?.id === v.id}
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
                        {i === 0 && <small>NAJWIĘCEJ MODUŁÓW</small>}
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
              <span>{scene.surfaces.length} · wybrane powierzchnie</span>
              <b>
                {error
                  ? "Błąd obliczenia"
                  : calculating
                    ? "Przeliczanie…"
                    : "Obliczono"}
              </b>
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
              <span>Pokrycie powierzchni</span>
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
              <span>Powierzchnia projektu</span>
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
                <dd>{currentResult?.engine_version ?? "—"}</dd>
                <dt>Układ współrzędnych</dt>
                <dd>ENU → (E, U, −N)</dd>
                <dt>Źródło geometrii</dt>
                <dd>
                  {scene.custom_surfaces
                    ? "Powierzchnie z importu"
                    : "Scena parametryczna"}
                </dd>
                <dt>Powierzchnia</dt>
                <dd>{surfaceTitle(activeSurfaceId)}</dd>
                <dt>Status geometrii</dt>
                <dd>{geometryStatus}</dd>
                <dt>Format sceny</dt>
                <dd>Scene {document.schema_version}</dd>
                <dt>Czas pierwszego obliczenia</dt>
                <dd>
                  {currentResult ? `${currentResult.duration_ms} ms` : "—"}
                </dd>
                <dt>Hash wejścia</dt>
                <dd className="hash">{currentResult?.source_hash ?? "—"}</dd>
                <dt>Rewizja zapisu</dt>
                <dd>
                  {project
                    ? String(project.revision) +
                      (dirty ? " · zmiany lokalne" : "")
                    : "Projekt lokalny"}
                </dd>
              </dl>
              <div className="section-label">ZAKRES WYNIKU</div>
              {currentResult?.warnings.map((w, i) => (
                <p className="quality-note" key={i}>
                  <ShieldCheck size={14} />
                  {w}
                </p>
              ))}
            </>
          ) : (
            <>
              <div className="section-label">
                PRODUKT BIPV<span className="label-tag">KATALOG TESTOWY</span>
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
              "status-dot " + (error ? "red" : calculating ? "amber" : "")
            }
          />
          <span data-testid="layout-status" aria-live="polite">
            {error
              ? "Błąd obliczenia"
              : calculating
                ? "Przeliczanie układu"
                : "Geometria obliczona"}
          </span>
          <span className="status-separator" />
          <Save size={12} />
          Kopia lokalna
        </div>
        <div className="status-middle">
          {currentResult?.engine_version ?? "—"}
          <span>·</span>
          {currentResult?.source_hash.slice(0, 10) ?? "oczekiwanie"}
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
      {accountOpen && (
        <AccountDialog
          active={organization}
          guestProject={organization ? null : project}
          guestDirty={dirty}
          canLeave={canLeave}
          onScope={(item, moved) => {
            setAccountOpen(false);
            onScope(item, moved);
          }}
          onClose={() => setAccountOpen(false)}
        />
      )}
      {projectModal && (
        <div className="modal-backdrop" onClick={closeProjects}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Projekty w Supabase"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {organization?.name ?? "PRZESTRZEŃ GOŚCINNA"}
                </span>
                <h2>
                  {revisionProject ? "Historia projektu" : "Twoje projekty."}
                </h2>
              </div>
              <IconButton label="Zamknij projekty" onClick={closeProjects}>
                <X size={19} />
              </IconButton>
            </div>
            {revisionProject ? (
              <>
                <p>{revisionProject.name} · do 20 ostatnich zapisów</p>
                {projectLoading ? (
                  <div className="empty">
                    <LoaderCircle className="spin" />
                    Ładowanie historii…
                  </div>
                ) : revisionError ? (
                  <p role="alert">{revisionError}</p>
                ) : revisionList.length ? (
                  revisionList.map((item) => (
                    <div className="project-list-row" key={item.revision}>
                      <button
                        type="button"
                        aria-label={"Wczytaj rewizję " + item.revision}
                        onClick={() =>
                          loadRevision(revisionProject, item.revision)
                        }
                      >
                        <History size={16} />
                        <span>
                          <strong>
                            Rewizja {item.revision} · {item.name}
                          </strong>
                          <small>
                            {new Date(item.saved_at).toLocaleString("pl-PL")}
                          </small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p>Ten projekt nie ma dostępnych rewizji.</p>
                )}
                <div className="modal-actions">
                  {revisionError && (
                    <button
                      className="button"
                      onClick={() => openRevisions(revisionProject)}
                    >
                      Spróbuj ponownie
                    </button>
                  )}
                  <button
                    className="button"
                    onClick={() => {
                      revisionRequest.current?.abort();
                      setRevisionProject(null);
                      setProjectLoading(false);
                    }}
                  >
                    <ArrowLeft size={14} /> Wróć do projektów
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  {organization
                    ? "Zapisy dostępne dla uczestników tej organizacji."
                    : "Zapisy są przypisane do klucza tej przeglądarki. Zachowaj eksport JSON."}
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
                        label={"Historia projektu " + p.name}
                        onClick={() => openRevisions(p)}
                      >
                        <History size={15} />
                      </IconButton>
                      <IconButton
                        label={"Usuń projekt " + p.name}
                        disabled={
                          !!organization && organization.role !== "owner"
                        }
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
              </>
            )}
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Pomoc BIPV Studio"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">REGISTRY9 ENGINEERING</span>
                <h2>Praca z projektem BIPV</h2>
              </div>
              <IconButton
                label="Zamknij informacje"
                onClick={() => setHelp(false)}
              >
                <X size={19} />
              </IconButton>
            </div>
            <p>
              Zaimportuj połać dachu lub fasadę, porównaj rozmieszczenie modułów
              i zapisz rewizję projektu.
            </p>
            <div className="help-grid">
              <div>
                <MousePointer2 />
                <strong>Geometria</strong>
                <p>
                  Zaznacz otwór w rzucie i popraw jego wierzchołek w metrach.
                  Ctrl / ⌘ + Z cofa zapisaną korektę.
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
              Panel Kontrola pokazuje status geometrii wybranej powierzchni.
              Ręczna korekta otworu wymaga ponownej weryfikacji pomiaru.
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
                  setPlanSurface(null);
                  selectObstacle(null);
                  setConfirmReset(false);
                }}
              >
                Utwórz scenę
              </button>
            </div>
          </section>
        </div>
      )}
      {locationOpen && (
        <LocationDialog
          current={site}
          previousTrace={
            document.schema_version === "2.0.0"
              ? document.surface_evidence.find((item) => item.orthophoto_trace)
                  ?.orthophoto_trace
              : undefined
          }
          onTrace={applyOrthophotoTrace}
          onConfirm={confirmSite}
          onClose={() => setLocationOpen(false)}
        />
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
