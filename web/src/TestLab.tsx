import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  Check,
  ClipboardList,
  Layers3,
  Play,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, download } from "./api";
import FootprintReference, {
  type FootprintSpecimen,
} from "./FootprintReference";
import PortalNav from "./PortalNav";

type Scenario = {
  id: string;
  title: string;
  criterion: string;
  source: string;
};

type Requirement = {
  id: string;
  title: string;
  threshold: string;
  required: string;
  studio_tests: string[];
  status: "blocked";
};

type Metric = Record<string, number | string>;
type CheckResult = {
  label: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
};

type Artifact = {
  name: string;
  label: string;
  media_type: string;
  sha256: string;
  bytes: number;
};

type Report = {
  id: string;
  source: string;
  scope: string;
  version: string;
  elapsed_ms: number;
  passed: boolean;
  checks: CheckResult[];
  run_id?: string;
  recorded_at?: string;
  artifacts?: Artifact[];
};
type Result = Report & { artifact_payloads?: Record<string, string> };

const FEATURED_ID = "footprint-export";

function ResultStatus({
  result,
  pending,
}: {
  result?: Result | string;
  pending: boolean;
}) {
  const outcome = typeof result === "object" ? result.passed : undefined;
  return (
    <span
      className="lab-status"
      data-result={
        pending || outcome === undefined ? undefined : outcome ? "pass" : "fail"
      }
      role="status"
    >
      {pending
        ? "W toku"
        : typeof result === "string"
          ? "Błąd uruchomienia"
          : outcome === undefined
            ? "Do uruchomienia"
            : outcome
              ? "Zaliczony"
              : "Niezaliczony"}
    </span>
  );
}

function FootprintResult({ report }: { report: Result }) {
  const metrics = Object.entries(report.checks[0].expected as Metric);
  return (
    <div className="lab-proof">
      <div className="lab-result-meta">
        <h3>Pomiar eksportu</h3>
        <p>
          {report.elapsed_ms} ms · wydanie{" "}
          <code title={report.version}>{report.version.slice(0, 12)}</code>
        </p>
      </div>
      <table className="lab-metrics" aria-label="Porównanie eksportu OBJ i GLB">
        <thead>
          <tr>
            <th scope="col">Parametr</th>
            <th scope="col">Wzorzec</th>
            {report.checks.map((row) => (
              <th scope="col" key={row.label}>
                {row.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map(([metric, target]) => (
            <tr key={metric}>
              <th scope="row">{metric}</th>
              <td>{target}</td>
              {report.checks.map((format) => {
                const measured = (format.actual as Metric)[metric];
                return (
                  <td
                    key={format.label}
                    data-result={measured === target ? "pass" : "fail"}
                  >
                    {measured}
                    {measured === target && <Check size={14} aria-hidden />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ReportFiles report={report} />
    </div>
  );
}

function ReportFiles({ report }: { report: Result }) {
  if (!report.artifacts?.length || !report.artifact_payloads) return null;
  const payloads = report.artifact_payloads;
  return (
    <div className="lab-artifacts">
      <div className="lab-files">
        {report.artifacts.map((artifact) => (
          <button
            type="button"
            className="button"
            key={artifact.name}
            onClick={() => {
              const bytes = Uint8Array.from(
                atob(payloads[artifact.name]),
                (character) => character.charCodeAt(0),
              );
              download(
                artifact.name,
                new Blob([bytes], { type: artifact.media_type }),
              );
            }}
          >
            <ArrowDownToLine size={16} /> {artifact.label}
          </button>
        ))}
      </div>
      <details className="lab-integrity">
        <summary>Identyfikator przebiegu i sumy SHA-256</summary>
        <p>
          <code>{report.run_id}</code> ·{" "}
          {report.recorded_at &&
            new Date(report.recorded_at).toLocaleString("pl-PL", {
              timeZone: "Europe/Warsaw",
            })}
        </p>
        <dl>
          {report.artifacts.map((artifact) => (
            <div key={artifact.name}>
              <dt>{artifact.name}</dt>
              <dd>
                <code>{artifact.sha256}</code>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function Evidence({ value }: { value: unknown }) {
  return typeof value === "object" && value !== null ? (
    <pre>{JSON.stringify(value, null, 2)}</pre>
  ) : (
    <span>{String(value)}</span>
  );
}

export default function TestLab() {
  const [data, setData] = useState<{
    scenarios: Scenario[];
    requirements: Requirement[];
    specimen: FootprintSpecimen;
  }>();
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [results, setResults] = useState<Record<string, Result | string>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [plan, setPlan] = useState(false);
  const featured = data?.scenarios.find(
    (scenario) => scenario.id === FEATURED_ID,
  );
  const featuredResult = results[FEATURED_ID];

  useEffect(() => {
    const controller = new AbortController();
    function fetchLab<T>(path: string) {
      return api<T>(path, "GET", undefined, undefined, controller.signal);
    }

    Promise.all([
      fetchLab<Scenario[]>("demo/tests"),
      fetchLab<Requirement[]>("demo/requirements"),
      fetchLab<FootprintSpecimen>("demo/specimens/footprint"),
    ])
      .then(([scenarios, requirements, specimen]) =>
        setData({ scenarios, requirements, specimen }),
      )
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, [loadAttempt]);

  async function run(selected: Scenario[]) {
    if (running) return;
    try {
      for (const scenario of selected) {
        setRunning(scenario.id);
        try {
          const result = await api<Result>(`demo/tests/${scenario.id}`, "POST");
          setResults((previous) => ({ ...previous, [scenario.id]: result }));
        } catch (error) {
          setResults((previous) => ({
            ...previous,
            [scenario.id]: (error as Error).message,
          }));
        }
      }
    } finally {
      setRunning(null);
    }
  }

  function exportResults() {
    const reports = Object.fromEntries(
      Object.entries(results).map(([id, result]) => {
        if (typeof result === "string")
          return [id, { execution_error: result }];
        const { artifact_payloads: _payloads, ...report } = result;
        return [id, report];
      }),
    );
    download(
      "ET-2025-7-przebieg-demo.json",
      JSON.stringify(
        {
          schema_version: 1,
          scope: "demo",
          requirements: data?.requirements,
          results: reports,
        },
        null,
        2,
      ),
    );
  }

  return (
    <div className="lab-page">
      <PortalNav current="tests" />
      <main className="lab-main">
        <header className="lab-intro">
          <div>
            <p className="lab-kicker">BIPV STUDIO / ET/2025/7</p>
            <h1>Testy Electrotile</h1>
            <p className="lab-lead">
              Uruchom próby na działającym Studio, porównaj wyniki z wzorcami i
              pobierz pliki z pomiaru.
            </p>
          </div>
          <div className="lab-actions">
            <button
              className="button"
              type="button"
              disabled={!data || !!running}
              onClick={() => data && void run(data.scenarios)}
            >
              <Play size={16} /> Uruchom wszystkie
            </button>
            <button
              className="button"
              type="button"
              disabled={!Object.keys(results).length || !!running}
              onClick={exportResults}
            >
              <ArrowDownToLine size={16} /> Pobierz raport JSON
            </button>
          </div>
        </header>
        {!data && !loadError && <p role="status">Wczytuję laboratorium…</p>}
        {loadError && (
          <div className="lab-error" role="alert">
            <p>Nie udało się wczytać laboratorium. {loadError}</p>
            <button
              type="button"
              className="button"
              onClick={() => {
                setLoadError("");
                setLoadAttempt((value) => value + 1);
              }}
            >
              Ponów wczytanie
            </button>
          </div>
        )}
        {data && featured && (
          <article
            className="lab-feature"
            aria-labelledby="lab-footprint-export"
          >
            <div className="lab-feature-body">
              <div className="lab-feature-copy">
                <p className="lab-kicker">
                  <Box size={15} /> {data.specimen.id} · Eksport 3D
                </p>
                <h2 id="lab-footprint-export">{featured.title}</h2>
                <p>
                  Studio tworzy oba modele z obrysu kontrolnego. Pomiar
                  sprawdza, czy obie siatki zawierają kompletne pionowe ściany
                  obrysu i dziedzińca.
                </p>
                <div className="lab-actions">
                  <button
                    type="button"
                    className="button lab-run"
                    disabled={!!running}
                    onClick={() => void run([featured])}
                  >
                    <Play size={16} /> Uruchom test eksportu
                  </button>
                  <ResultStatus
                    result={featuredResult}
                    pending={running === FEATURED_ID}
                  />
                </div>
                {running !== FEATURED_ID &&
                  typeof featuredResult === "string" && (
                    <p role="alert">{featuredResult}</p>
                  )}
                <a className="lab-text-link" href="#lab-requirements">
                  Zakres odbioru <ArrowDown size={14} />
                </a>
              </div>
              <figure className="lab-figure">
                <figcaption>
                  <span>
                    <Layers3 size={16} /> Wzorzec geometryczny
                  </span>
                  <div
                    className="lab-view-switch"
                    role="group"
                    aria-label="Widok wzorca"
                  >
                    <button
                      type="button"
                      aria-pressed={!plan}
                      onClick={() => setPlan(false)}
                    >
                      Bryła
                    </button>
                    <button
                      type="button"
                      aria-pressed={plan}
                      onClick={() => setPlan(true)}
                    >
                      Rzut
                    </button>
                  </div>
                </figcaption>
                <FootprintReference specimen={data.specimen} plan={plan} />
                <div className="lab-figure-meta">
                  <span>Obrys + dziedziniec</span>
                  <span>{data.specimen.height_m} m · założona wysokość</span>
                </div>
              </figure>
            </div>
            {running !== FEATURED_ID && typeof featuredResult === "object" && (
              <FootprintResult report={featuredResult} />
            )}
          </article>
        )}
        {data && (
          <>
            <section className="lab-suite" aria-labelledby="lab-scenarios">
              <div className="lab-section-heading">
                <h2 id="lab-scenarios">Pozostałe próby Studio</h2>
                <a href="/" className="lab-text-link">
                  Otwórz Studio <ArrowUpRight size={16} />
                </a>
              </div>
              <div className="lab-scenarios">
                {data.scenarios
                  .filter((scenario) => scenario.id !== FEATURED_ID)
                  .map((scenario) => {
                    const result = results[scenario.id];
                    const pending = running === scenario.id;
                    return (
                      <article
                        id={`lab-case-${scenario.id}`}
                        className="lab-scenario"
                        key={scenario.id}
                        aria-labelledby={`lab-${scenario.id}`}
                      >
                        <div className="lab-scenario-top">
                          <div>
                            <p className="lab-kicker">{scenario.criterion}</p>
                            <h3 id={`lab-${scenario.id}`}>{scenario.title}</h3>
                            <p className="lab-source">{scenario.source}</p>
                            {scenario.id === "production-plan" && (
                              <a
                                href="/produkcja"
                                className="lab-text-link lab-workbench"
                              >
                                Otwórz kalkulator <ArrowUpRight size={14} />
                              </a>
                            )}
                          </div>
                          <div className="lab-actions">
                            <ResultStatus result={result} pending={pending} />
                            <button
                              className="button"
                              type="button"
                              aria-label={`Uruchom: ${scenario.title}`}
                              disabled={!!running}
                              onClick={() => void run([scenario])}
                            >
                              <Play size={14} /> Uruchom
                            </button>
                          </div>
                        </div>
                        {!pending && typeof result === "string" && (
                          <p role="alert">{result}</p>
                        )}
                        {!pending && typeof result === "object" && (
                          <details className="lab-evidence" open>
                            <summary>
                              Wynik i dowody · {result.elapsed_ms} ms · wydanie{" "}
                              {result.version.slice(0, 12)}
                            </summary>
                            <ReportFiles report={result} />
                            {result.checks.map((row) => (
                              <div className="lab-check" key={row.label}>
                                <h4>
                                  {row.label}{" "}
                                  <span
                                    className="lab-status"
                                    data-result={row.passed ? "pass" : "fail"}
                                  >
                                    {row.passed ? "OK" : "Rozbieżność"}
                                  </span>
                                </h4>
                                <dl>
                                  <div>
                                    <dt>Oczekiwano</dt>
                                    <dd>
                                      <Evidence value={row.expected} />
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Otrzymano</dt>
                                    <dd>
                                      <Evidence value={row.actual} />
                                    </dd>
                                  </div>
                                </dl>
                              </div>
                            ))}
                          </details>
                        )}
                      </article>
                    );
                  })}
              </div>
            </section>
            <section className="lab-scope" aria-labelledby="lab-requirements">
              <div className="lab-section-heading">
                <h2 id="lab-requirements">
                  <ClipboardList size={21} /> Zakres odbioru
                </h2>
              </div>
              <p>
                Próby odbiorcze wymagają środowiska Electrotile i uzgodnionych
                wzorców.
              </p>
              <div className="lab-requirements">
                {data.requirements.map((requirement) => (
                  <article className="lab-requirement" key={requirement.id}>
                    <div>
                      <span className="lab-kicker">{requirement.id}</span>
                      <span className="lab-status">Czeka na dane</span>
                    </div>
                    <h3>{requirement.title}</h3>
                    <p>{requirement.threshold}</p>
                    <p className="lab-source">{requirement.required}</p>
                    {requirement.studio_tests.length > 0 && (
                      <p className="lab-related">
                        Próby Studio ·{" "}
                        {requirement.studio_tests.map((id) => (
                          <a
                            key={id}
                            href={
                              id === FEATURED_ID
                                ? "#lab-footprint-export"
                                : `#lab-case-${id}`
                            }
                          >
                            {
                              data.scenarios.find(
                                (scenario) => scenario.id === id,
                              )?.title
                            }
                          </a>
                        ))}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
