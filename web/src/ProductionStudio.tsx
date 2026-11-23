import {
  ArrowDownToLine,
  ArrowUpRight,
  Calculator,
  Scissors,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { api, download } from "./api";
import PortalNav from "./PortalNav";

type Cut = {
  profile: string;
  length_mm: number;
  angle_a_mdeg: number;
  angle_b_mdeg: number;
};

type Job = {
  design_revision: string;
  catalog_revision: string;
  cuts: Record<string, Cut>;
  profiles: Record<
    string,
    { length_mm: number; kerf_mm: number; passes_per_piece: number }
  >;
  circuits: Record<string, { reserve_mm: number }>;
};

type Plan = {
  input_sha256: string;
  design_revision: string;
  catalog_revision: string;
  stc_mwp: number;
  sheet_bom: Record<string, number>;
  stock: {
    id: string;
    profile: string;
    length_mm: number;
    kerf_passes: number;
    scrap_mm: number;
    cuts: (Cut & { id: string })[];
  }[];
  wires: Record<
    string,
    {
      start: string;
      end: string;
      cable_sku: string;
      connector_start: string;
      connector_end: string;
      segments: string[];
      length_mm: number;
    }
  >;
};

const cutLabels: Record<string, string> = {
  "rail-east": "Profil wschodni",
  "rail-west": "Profil zachodni",
  "rail-entry": "Profil przy wejściu",
};

const number = new Intl.NumberFormat("pl-PL");

export default function ProductionStudio() {
  const [job, setJob] = useState<Job>();
  const [result, setResult] = useState<Plan>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<Job>(
      "demo/specimens/production",
      "GET",
      undefined,
      undefined,
      controller.signal,
    )
      .then(setJob)
      .catch((err: Error) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, []);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!job || pending) return;
    const form = new FormData(event.currentTarget);
    const edited = {
      ...job,
      cuts: Object.fromEntries(
        Object.entries(job.cuts).map(([id, cut]) => [
          id,
          { ...cut, length_mm: Number(form.get(`cut-${id}`)) },
        ]),
      ),
      circuits: Object.fromEntries(
        Object.entries(job.circuits).map(([id, circuit]) => [
          id,
          { ...circuit, reserve_mm: Number(form.get(`circuit-${id}`)) },
        ]),
      ),
    };
    setPending(true);
    setResult(undefined);
    setError("");
    try {
      setResult(await api<Plan>("production-plan", "POST", edited));
    } catch (err) {
      const message = (err as Error).message;
      setError(
        message.startsWith("cut_exceeds_stock")
          ? "Detal wraz z rzazem przekracza długość sztangi. Zmień długość detalu."
          : message,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="lab-page">
      <PortalNav current="production" />
      <main className="lab-main plan-main">
        <header className="lab-intro">
          <div>
            <p className="lab-kicker">BIPV STUDIO / MODUŁ II</p>
            <h1>Przedmiar i wiązki</h1>
            <p className="lab-lead">
              Przelicz długości profili i zapas przewodu na projekcie
              kontrolnym. Otrzymasz listę arkuszy, plan cięć i trasę wiązki.
            </p>
          </div>
          <a href="/testy#lab-case-production-plan" className="lab-text-link">
            Test ET-PROD-01 <ArrowUpRight size={16} />
          </a>
        </header>

        <div className="plan-grid">
          <form
            className="lab-scenario plan-form"
            onSubmit={(event) => void calculate(event)}
            onChange={() => {
              setResult(undefined);
              setError("");
            }}
          >
            <div className="plan-form-heading">
              <Scissors size={19} />
              <h2>Zlecenie kontrolne</h2>
            </div>
            <p>Katalog Studio z danymi syntetycznymi</p>
            {job ? (
              <>
                <fieldset disabled={pending}>
                  <legend>Długości cięć (mm)</legend>
                  {Object.entries(job.cuts).map(([id, cut]) => (
                    <label key={id}>
                      <span>{cutLabels[id] ?? id}</span>
                      <input
                        type="number"
                        name={`cut-${id}`}
                        min={1}
                        max={
                          job.profiles[cut.profile].length_mm -
                          job.profiles[cut.profile].kerf_mm *
                            job.profiles[cut.profile].passes_per_piece
                        }
                        step={1}
                        required
                        defaultValue={cut.length_mm}
                      />
                    </label>
                  ))}
                </fieldset>
                <fieldset disabled={pending}>
                  <legend>Wiązka</legend>
                  {Object.entries(job.circuits).map(([id, circuit]) => (
                    <label key={id}>
                      <span>Zapas przewodu (mm)</span>
                      <input
                        type="number"
                        name={`circuit-${id}`}
                        min={0}
                        max={1000000}
                        step={1}
                        required
                        defaultValue={circuit.reserve_mm}
                      />
                    </label>
                  ))}
                </fieldset>
              </>
            ) : (
              !error && <p role="status">Wczytuję zlecenie…</p>
            )}
            <button
              className="button primary"
              type="submit"
              disabled={!job || pending}
            >
              <Calculator size={17} /> {pending ? "Obliczam…" : "Oblicz plan"}
            </button>
            {error && (
              <p className="plan-error" role="alert">
                {error}
              </p>
            )}
          </form>

          <section
            className="lab-scenario plan-output"
            aria-labelledby="plan-output"
          >
            <div className="lab-result-meta">
              <h2 id="plan-output">Plan produkcji</h2>
              {result && (
                <button
                  className="button"
                  type="button"
                  onClick={() =>
                    download(
                      "plan-produkcji.json",
                      JSON.stringify(result, null, 2),
                    )
                  }
                >
                  <ArrowDownToLine size={16} /> Pobierz plan
                </button>
              )}
            </div>
            {result ? (
              <>
                <dl
                  className="plan-stats"
                  role="status"
                  aria-label="Podsumowanie planu"
                >
                  <div>
                    <dt>Moc STC</dt>
                    <dd>{number.format(result.stc_mwp / 1000)} Wp</dd>
                  </div>
                  <div>
                    <dt>Sztangi</dt>
                    <dd>{number.format(result.stock.length)}</dd>
                  </div>
                  <div>
                    <dt>Wiązka</dt>
                    <dd>
                      {number.format(
                        Object.values(result.wires).reduce(
                          (sum, wire) => sum + wire.length_mm,
                          0,
                        ),
                      )}{" "}
                      mm
                    </dd>
                  </div>
                </dl>
                <h3>Arkusze według SKU</h3>
                <ul className="plan-parts">
                  {Object.entries(result.sheet_bom).map(([sku, quantity]) => (
                    <li key={sku}>
                      <code>{sku}</code> <span>{quantity} szt.</span>
                    </li>
                  ))}
                </ul>
                <h3>Rozkrój profili</h3>
                <div className="plan-stocks">
                  {result.stock.map((stock) => (
                    <article key={stock.id}>
                      <h4>
                        {stock.id} · {stock.profile}
                      </h4>
                      <p>
                        {number.format(stock.length_mm)} mm · odpad{" "}
                        {number.format(stock.scrap_mm)} mm
                      </p>
                      <ul>
                        {stock.cuts.map((cut) => (
                          <li key={cut.id}>
                            {cutLabels[cut.id] ?? cut.id} ·{" "}
                            {number.format(cut.length_mm)} mm ·{" "}
                            {cut.angle_a_mdeg / 1000}° /{" "}
                            {cut.angle_b_mdeg / 1000}°
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
                <h3>Trasa wiązki</h3>
                {Object.entries(result.wires).map(([id, wire]) => (
                  <article className="plan-wire" key={id}>
                    <p>
                      <strong>
                        {wire.start} → {wire.end}
                      </strong>{" "}
                      · {number.format(wire.length_mm)} mm
                    </p>
                    <p>
                      {wire.segments.join(" → ")} · {wire.connector_start} /{" "}
                      {wire.connector_end}
                    </p>
                  </article>
                ))}
                <details className="lab-integrity">
                  <summary>Rewizje i SHA-256 konfiguracji</summary>
                  <p>
                    {result.design_revision} · {result.catalog_revision}
                  </p>
                  <code>{result.input_sha256}</code>
                </details>
              </>
            ) : (
              <p role="status">
                {pending
                  ? "Przeliczam zlecenie…"
                  : "Oblicz zlecenie, aby zobaczyć wynik."}
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
