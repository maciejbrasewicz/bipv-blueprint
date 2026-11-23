"""Start the full BIPV Studio and open its runnable test lab.

No production deployment, cloud account or Docker is required. Bind only 127.0.0.1.
--self-test exercises the *packaged* frontend and server through HTTP and exits.
"""

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "web" / "dist"


def choose_port(preferred: int) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", preferred))
        except OSError:
            sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def retrieve(url: str, data: bytes | None = None):
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=50) as response:
        return response.status, response.read(), response.headers


def wait_for_server(origin: str, process: subprocess.Popen) -> dict:
    for _ in range(150):
        if process.poll() is not None:
            raise RuntimeError(f"Studio stopped before it was ready (exit={process.returncode})")
        try:
            status, raw, _ = retrieve(origin + "/api/health")
            if status == 200:
                return json.loads(raw)
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(0.3)
    raise RuntimeError("Studio did not start within 45 seconds")


def run_smoke(origin: str, health: dict) -> None:
    assert health["status"] == "ok", health
    assert health["cloud_configured"] is False, "Unexpected live cloud credentials in local mode"
    assert health["commit"] == (ROOT / "SOURCE_COMMIT.txt").read_text().strip()
    for path in ("/", "/testy", "/produkcja"):
        code, raw, _ = retrieve(origin + path)
        assert code == 200 and b'id="root"' in raw, (path, code)
        print(f"PASS: browser entry {path}")
    code, assets, _ = retrieve(origin + "/assets/" + next(
        p.name for p in (DIST / "assets").iterdir() if p.suffix == ".js"
    ))
    assert code == 200 and len(assets) > 100, "Compiled frontend JS not served"
    print("PASS: bundled React/Three.js JavaScript")
    code, catalog, _ = retrieve(origin + "/api/demo/tests")
    test_ids = {entry["id"] for entry in json.loads(catalog)}
    assert {"footprint-export", "production-plan", "pv", "obj"}.issubset(test_ids)
    for scenario in ("footprint-export", "production-plan", "pv", "obj"):
        code, raw, _ = retrieve(origin + "/api/demo/tests/" + scenario, b"{}")
        result = json.loads(raw)
        assert code == 200 and result["passed"] is True, (scenario, result.get("checks"))
        print(f"PASS: live local Lab {scenario}")
    code, raw, _ = retrieve(origin + "/api/catalog")
    assert code == 200 and json.loads(raw)["is_manufacturer_data"] is False
    print("PASS: explicit demonstration catalog, no manufacturer data claims")
    print("COMPLETE: local app + compiled UI + 4 executable QA scenarios, no cloud")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    if not (DIST / "index.html").is_file() or not (DIST / "assets").is_dir():
        raise SystemExit("Missing prebuilt UI: web/dist/index.html and assets must exist")

    commit = ROOT / "SOURCE_COMMIT.txt"
    if not commit.is_file():
        raise SystemExit("Missing exact source SHA: SOURCE_COMMIT.txt")

    port = choose_port(args.port)
    origin = f"http://127.0.0.1:{port}"
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("SUPABASE_") or key in ("DATABASE_URL", "RAILWAY_PUBLIC_DOMAIN"):
            env.pop(key)
    env.update(
        WEB_DIST=str(DIST),
        RAILWAY_GIT_COMMIT_SHA=commit.read_text(encoding="utf-8").strip(),
        PORT=str(port),
        PYTHONUNBUFFERED="1",
    )
    command = [
        sys.executable, "-m", "uvicorn", "server.app:app",
        "--host", "127.0.0.1", "--port", str(port), "--no-access-log",
    ]
    child = subprocess.Popen(command, cwd=ROOT, env=env)
    try:
        health = wait_for_server(origin, child)
        print("REGISTRY9 BIPV STUDIO - LOKALNE URUCHOMIENIE")
        print("LABORATORIUM:", origin + "/testy")
        print("STUDIO:", origin + "/")
        print("KALKULATOR:", origin + "/produkcja")
        print("IDENTYFIKATOR WERSJI:", health["commit"])
        print("DANE W CHMURZE:", "wlaczone" if health["cloud_configured"] else "wylaczone")
        if args.self_test:
            run_smoke(origin, health)
            return 0
        webbrowser.open(origin + "/testy")
        print("Zamknij terminal lub nacisnij Ctrl+C, aby zatrzymac serwer.")
        return child.wait()
    except KeyboardInterrupt:
        print("\nZatrzymywanie Studio...")
        return 0
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
