import { useEffect, useState } from "react";
import type { PointUV } from "./types";

export default function HoleEditor({
  ring,
  onApply,
}: {
  ring: PointUV[];
  onApply: (ring: PointUV[]) => Promise<void>;
}) {
  const [vertex, setVertex] = useState(0);
  const [u, setU] = useState(String(ring[0][0]));
  const [v, setV] = useState(String(ring[0][1]));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const coordinates: PointUV = [Number(u), Number(v)];
  useEffect(() => {
    setU(String(ring[vertex][0]));
    setV(String(ring[vertex][1]));
    setError("");
  }, [ring, vertex]);
  const changed = coordinates.some(
    (value, axis) => value !== ring[vertex][axis],
  );

  return (
    <form
      className="hole-editor"
      aria-label="Korekta otworu"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || !changed) return;
        setPending(true);
        setError("");
        try {
          await onApply(
            ring.map((point, index) =>
              index === vertex ? coordinates : point,
            ),
          );
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="select-field">
        Wierzchołek otworu
        <select
          value={vertex}
          disabled={pending}
          onChange={(event) => {
            setVertex(Number(event.currentTarget.value));
          }}
        >
          {ring.map((_, index) => (
            <option key={index} value={index}>
              Punkt {index + 1}
            </option>
          ))}
        </select>
      </label>
      <div className="field-grid">
        {(
          [
            ["U", u, setU],
            ["V", v, setV],
          ] as const
        ).map(([axis, coordinate, setCoordinate]) => (
          <label className="field" key={axis}>
            <span>{axis} otworu (m)</span>
            <div className="number-field">
              <input
                aria-label={`${axis} otworu (m)`}
                type="number"
                min="-40"
                max="40"
                step="any"
                required
                disabled={pending}
                value={coordinate}
                onChange={(event) => setCoordinate(event.currentTarget.value)}
              />
              <small aria-hidden="true">m</small>
            </div>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="hole-error">
          {error}
        </p>
      )}
      <button
        className="button full"
        disabled={pending || !changed}
        type="submit"
      >
        {pending ? "Sprawdzanie…" : "Zastosuj korektę"}
      </button>
    </form>
  );
}
