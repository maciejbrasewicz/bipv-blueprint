import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Building2, LogOut, X } from "lucide-react";
import { api, ApiError, workspaceKey } from "./api";
import type { CloudRef, Organization, Project } from "./types";

type Props = {
  active: Organization | null;
  guestProject: CloudRef | null;
  guestDirty: boolean;
  canLeave: () => boolean;
  onScope: (organization: Organization | null, project?: Project) => void;
  onClose: () => void;
};

export default function AccountDialog({
  active,
  guestProject,
  guestDirty,
  canLeave,
  onScope,
  onClose,
}: Props) {
  const [organizations, setOrganizations] = useState<Organization[] | null>(
    null,
  );
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<{ organizations: Organization[] }>(
      "account/organizations",
      "GET",
      undefined,
      undefined,
      controller.signal,
    )
      .then(({ organizations }) => {
        setSignedIn(true);
        setOrganizations(organizations);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setOrganizations([]);
          if (!(error instanceof ApiError) || error.status !== 401)
            setError(error.message);
        }
      });
    return () => controller.abort();
  }, []);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
      if (error instanceof ApiError && error.status === 401) setSignedIn(false);
    } finally {
      setBusy(false);
    }
  }

  function signIn(event: FormEvent) {
    event.preventDefault();
    if (active && !canLeave()) return;
    void perform(async () => {
      await api("account/sign-in", "POST", { email, password });
      setPassword("");
      if (active) {
        onScope(null);
        return;
      }
      const result = await api<{ organizations: Organization[] }>(
        "account/organizations",
      );
      setOrganizations(result.organizations);
      setSignedIn(true);
    });
  }

  function create(event: FormEvent) {
    event.preventDefault();
    void perform(async () => {
      const item = await api<Organization>("account/organizations", "POST", {
        name,
      });
      setOrganizations((current) => [...(current ?? []), item]);
      setDestination(item.id);
      setName("");
    });
  }

  function moveProject() {
    const target = organizations?.find((item) => item.id === destination);
    if (!guestProject || !target || guestDirty || target.role === "viewer")
      return;
    if (
      !window.confirm(
        `Przenieść projekt wraz z rewizjami do organizacji „${target.name}”? Klucz gościa straci do niego dostęp.`,
      )
    )
      return;
    void perform(async () => {
      const { id } = await api<{ id: string }>(
        "account/claim",
        "POST",
        {
          project_id: guestProject.id,
          organization_id: target.id,
          expected_revision: guestProject.revision,
        },
        workspaceKey(),
      );
      const project = await api<Project>("projects/" + id, "GET", undefined, {
        organizationId: target.id,
      });
      onScope(target, project);
    });
  }

  const editable =
    organizations?.filter((item) => item.role !== "viewer") ?? [];

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <section
        className="modal account-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Konto i organizacje"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>Konto i organizacje</h2>
          <button
            className="icon-button"
            aria-label="Zamknij konto"
            onClick={onClose}
            disabled={busy}
          >
            <X size={19} />
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {organizations === null ? (
          <p>Sprawdzanie sesji…</p>
        ) : !signedIn ? (
          <form className="account-form" onSubmit={signIn}>
            <label>
              E-mail
              <input
                autoComplete="email"
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Hasło
              <input
                autoComplete="current-password"
                type="password"
                required
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Zaloguj się
            </button>
          </form>
        ) : (
          <>
            {organizations.map((item) => (
              <div className="project-list-row" key={item.id}>
                <button
                  disabled={busy || active?.id === item.id}
                  onClick={() => {
                    if (canLeave()) onScope(item);
                  }}
                >
                  <Building2 size={17} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {
                        {
                          owner: "Właściciel",
                          designer: "Projektant",
                          viewer: "Obserwator",
                        }[item.role]
                      }
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              </div>
            ))}
            <form className="account-form account-inline" onSubmit={create}>
              <label>
                Nazwa organizacji
                <input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button className="button" disabled={busy || !name.trim()}>
                Utwórz organizację
              </button>
            </form>
            {guestProject && editable.length > 0 && (
              <div className="account-form account-inline">
                <label>
                  Organizacja docelowa
                  <select
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                  >
                    <option value="">Wybierz organizację</option>
                    {editable.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button"
                  disabled={busy || guestDirty || !destination}
                  onClick={moveProject}
                >
                  Przenieś otwarty projekt gościa
                </button>
                {guestDirty && (
                  <p>Zapisz zmiany w projekcie przed przeniesieniem.</p>
                )}
              </div>
            )}
            <div className="modal-actions">
              {active && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    if (canLeave()) onScope(null);
                  }}
                >
                  Tryb gościa
                </button>
              )}
              <button
                className="button"
                disabled={busy}
                onClick={() => {
                  if (!active || canLeave())
                    void perform(async () => {
                      await api("account/sign-out", "POST");
                      if (active) onScope(null);
                      else onClose();
                    });
                }}
              >
                <LogOut size={15} /> Wyloguj się
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
