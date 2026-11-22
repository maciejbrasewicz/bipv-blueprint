import { Download, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { api, download } from "./api";
import PortalNav from "./PortalNav";

type Scenario = {
  id: string;
  title: string;
  criterion: string;
  source: string;
};
type Check = {
  label: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
};
type Result = {
  id: string;
  source: string;
  version: string;
  elapsed_ms: number;
  passed: boolean;
  checks: Check[];
};

function Evidence({ value }: { value: unknown }) {
  return typeof value === "object" && value !== null ? (
    <pre>{JSON.stringify(value, null, 2)}</pre>
  ) : (
    <span>{String(value)}</span>
  );
}

export default function TestLab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, Result | string>>({});
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<Scenario[]>(
      "demo/tests",
      "GET",
      undefined,
      undefined,
      controller.signal,
    )
      .then(setScenarios)
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function run(selected: Scenario[]) {
    if (running) return;
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
    setRunning(null);
  }

  function exportResults() {
    download(
      "ET-2025-7-przebieg-demo.json",
      JSON.stringify({ scope: "demo", scenarios, results }, null, 2),
    );
  }

  return (
    <div className="lab-page">
      <PortalNav current="tests" />
      <main className="lab-main">
        <header className="lab-intro">
          <div>
            <p className="lab-kicker">ET/2025/7</p>
            <h1>Testy Electrotile</h1>
            <p>Uruchom scenariusz i sprawdź, czy wynik odpowiada wzorcowi.</p>
          </div>
          <div className="lab-actions">
            <button
              className="button primary"
              type="button"
              disabled={!scenarios.length || !!running}
              onClick={() => void run(scenarios)}
            >
              <Play size={16} /> Uruchom wszystkie
            </button>
            <button
              className="button"
              type="button"
              disabled={!Object.keys(results).length || !!running}
              onClick={exportResults}
            >
              <Download size={16} /> Pobierz raport JSON
            </button>
          </div>
        </header>
        {loading && <p role="status">Wczytuję scenariusze…</p>}
        {loadError && (
          <p role="alert">Nie udało się wczytać scenariuszy. {loadError}</p>
        )}
        <section
          className="lab-scenarios"
          aria-label="Scenariusze demonstracyjne"
        >
          {scenarios.map((scenario) => {
            const result = results[scenario.id];
            const pending = running === scenario.id;
            return (
              <article
                className="lab-scenario"
                key={scenario.id}
                aria-labelledby={`lab-${scenario.id}`}
              >
                <div className="lab-scenario-top">
                  <div>
                    <p className="lab-kicker">{scenario.criterion}</p>
                    <h2 id={`lab-${scenario.id}`}>{scenario.title}</h2>
                    <p className="lab-source">{scenario.source}</p>
                  </div>
                  <div className="lab-scenario-actions">
                    <span
                      className="lab-status"
                      data-result={
                        typeof result === "object" && !pending
                          ? result.passed
                            ? "pass"
                            : "fail"
                          : undefined
                      }
                      role="status"
                    >
                      {pending
                        ? "W toku"
                        : typeof result === "string"
                          ? "Błąd uruchomienia"
                          : result
                            ? result.passed
                              ? "Zaliczony"
                              : "Niezaliczony"
                            : "Do uruchomienia"}
                    </span>
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
                      Wynik i dowody · {result.elapsed_ms} ms · wersja{" "}
                      {result.version.slice(0, 12)}
                    </summary>
                    {result.checks.map((row) => (
                      <div className="lab-check" key={row.label}>
                        <h3>
                          {row.label}{" "}
                          <span
                            className="lab-status"
                            data-result={row.passed ? "pass" : "fail"}
                          >
                            {row.passed ? "OK" : "Rozbieżność"}
                          </span>
                        </h3>
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
        </section>
        <p className="lab-scope">
          Próby odbiorcze ET/2025/7 wymagają systemu i danych Electrotile.
        </p>
      </main>
    </div>
  );
}
