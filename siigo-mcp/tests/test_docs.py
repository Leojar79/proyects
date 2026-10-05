"""The README and .gitignore must tell the truth about secrets and local files."""

from __future__ import annotations

import pathlib
import re
import shutil
import subprocess

import pytest

from siigo_mcp.client import _default_download_dir

ROOT = pathlib.Path(__file__).resolve().parent.parent
README = (ROOT / "README.md").read_text(encoding="utf-8")
GITIGNORE = [
    line.strip()
    for line in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    if line.strip() and not line.startswith("#")
]


def paragraphs(text: str) -> list[str]:
    return [p for p in re.split(r"\n\s*\n", text) if p.strip()]


def test_gitignore_covers_secrets_and_every_download_folder(monkeypatch):
    def no_home(cls):
        raise RuntimeError("Could not determine home directory.")

    monkeypatch.setattr(pathlib.Path, "home", classmethod(no_home))
    fallback = _default_download_dir()  # used when no home directory exists
    assert fallback.parent == pathlib.Path.cwd()
    for pattern in (".env", ".mcp.json", "downloads/", f"{fallback.name}/"):
        assert pattern in GITIGNORE, pattern


def test_readme_never_claims_mcp_json_is_ignored_outside_the_project():
    """`claude mcp add -s project` writes .mcp.json in the CURRENT directory (spec F.1).

    Only siigo-mcp/.gitignore lists it, so a .mcp.json at the repository root is NOT
    ignored: every paragraph that pairs the two must say so.
    """
    hits = [p for p in paragraphs(README) if ".mcp.json" in p and ".gitignore" in p]
    assert hits
    for paragraph in hits:
        assert "siigo-mcp/" in paragraph and "NO" in paragraph, paragraph
    assert "`.env` y `.mcp.json` están en `.gitignore`" not in README
    assert "(está en `.gitignore`, pero no lo compartas)" not in README


def test_readme_manual_run_mentions_clean_exit_keys():
    paragraph = next(p for p in paragraphs(README) if "failed to start" in p)
    assert "Ctrl+C" in paragraph and "Ctrl+D" in paragraph


@pytest.mark.skipif(shutil.which("git") is None, reason="git not installed")
def test_git_really_ignores_what_the_readme_says(tmp_path):
    """Checked with git itself in a scratch repo that holds a copy of siigo-mcp/.gitignore."""
    project = tmp_path / "repo" / "siigo-mcp"
    project.mkdir(parents=True)
    shutil.copy(ROOT / ".gitignore", project / ".gitignore")
    repo = project.parent
    subprocess.run(["git", "init", "-q", str(repo)], check=True)

    def ignored(rel: str) -> bool:
        isolate = f"core.excludesFile={tmp_path / 'no-global-excludes'}"
        cmd = ["git", "-C", str(repo), "-c", isolate, "check-ignore", "-q", "--no-index", rel]
        return subprocess.run(cmd, check=False).returncode == 0

    for rel in (
        "siigo-mcp/.env",
        "siigo-mcp/.mcp.json",
        "siigo-mcp/downloads/FV-1-1.pdf",
        "siigo-mcp/siigo-downloads/FV-1-1.pdf",
    ):
        assert ignored(rel), rel
    # The README must not promise this one: the repository root is outside siigo-mcp/.
    assert not ignored(".mcp.json")


def section(title: str) -> str:
    start = README.index(f"\n## {title}\n")
    end = README.find("\n## ", start + 1)
    return README[start : end if end != -1 else None]


def test_readme_windows_uv_install_bypasses_the_execution_policy():
    """Regression: the uv installer refuses to run under Windows' default Restricted policy."""
    official = 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
    assert official in section("Requisitos")
    assert 'powershell -c "irm' not in README


def test_readme_enabling_writes_in_claude_code_removes_and_re_adds_the_server():
    """Regression: re-running `claude mcp add` on a registered server fails (already exists)."""
    text = section("Habilitar escritura")
    remove = text.index("claude mcp remove siigo_mcp -s local")
    add = text.index("claude mcp add siigo_mcp \\")
    assert remove < add < text.index("-e SIIGO_ENABLE_WRITE=true") < text.index("-- uv run")
    assert "already exists" in text and "--env-file" in text and "Claude Desktop" in text
    steps = section("Primera prueba recomendada")
    step7 = steps[steps.index("\n7. ") : steps.index("\n8. ")]
    assert "(#habilitar-escritura)" in step7
    registration = section("Registro en Claude Code")
    assert "already exists" in registration and "(#habilitar-escritura)" in registration


def test_readme_paging_matches_the_resume_and_skip_behaviour():
    text = section("Herramientas")
    assert "skip" in text and "25.000" in text and "_compact" in text
    assert "descarta las primeras" not in text  # the server skips the rows, not the reader


def test_readme_documents_proxy_and_interrupted_invoice_calls():
    troubleshooting = section("Solución de problemas")
    for fragment in ("ALL_PROXY", "socks5://", "SSL_CERT_FILE", "Idempotency-Key=", "Esc"):
        assert fragment in troubleshooting, fragment
    assert "dian_send_requested" in section("Habilitar escritura")


def flat(text: str) -> str:
    return " ".join(text.split())


def troubleshooting_paragraph(start: str) -> str:
    return flat(next(p for p in paragraphs(section("Solución de problemas")) if start in p))


def test_readme_timeout_advice_keeps_the_original_key():
    """Regression: the advice offered retrying "o ninguna" (no key) whenever the invoice was
    identical; when the original call carried Claude's key, that retry used another key and
    Siigo created a second invoice."""
    text = troubleshooting_paragraph("Tiempo de espera agotado")
    assert "o ninguna" not in README and "clave derivada" not in README
    assert "usa la **misma** `idempotency_key` de la llamada original" in text
    assert "argumentos de esa llamada" in text
    # A keyless retry is only safe under the conditions the server really implements.
    assert "**sin** clave solo reutiliza la clave original" in text
    assert "el servidor tampoco recibió la respuesta de Siigo" in text
    assert "no se ha reiniciado" in text and "2 horas" in text and "fecha incluida" in text


def test_readme_says_the_key_is_logged_at_any_level_and_where_the_log_is():
    """Regression: the key was logged at INFO, so SIIGO_LOG_LEVEL=WARNING dropped the line the
    README pointed to; and the README never said where the server's stderr ends up."""
    text = troubleshooting_paragraph("Tiempo de espera agotado")
    assert "sea cual sea `SIIGO_LOG_LEVEL`" in text
    assert "mcp-server-siigo_mcp.log" in text and "claude --debug" in text
    assert "sea cual sea `SIIGO_LOG_LEVEL`" in flat(section("Habilitar escritura"))
    assert "se escribe siempre, sea cual sea el nivel" in flat(section("Variables de entorno"))


def test_readme_qualifies_the_local_payments_total_check():
    """Regression: the README promised that the payments-equal-total check always runs and
    that nothing is sent otherwise; it is skipped with retentions, taxed_price, etc."""
    text = flat(section("Habilitar escritura"))
    assert "que la suma de pagos sea igual al total. Si algo falla" not in text
    assert "solo se valida localmente en **facturas simples**" in text
    for fragment in ("sin retenciones, anticipo ni moneda extranjera", "la valida Siigo"):
        assert fragment in text, fragment


def test_readme_explains_new_keys_and_replays():
    text = flat(section("Habilitar escritura"))
    assert "deriva" not in text and "**nueva para cada venta**" in text
    assert "dos ventas idénticas" in text and "dan dos facturas" in text
    assert "`created: false`, `replayed: true`" in text and "**no creó** ninguna factura" in text


def test_readme_documents_that_failed_auth_is_not_repeated():
    text = troubleshooting_paragraph("Usuario API bloqueado")
    assert "Tampoco repite un `POST /auth` fallido" in text and "siigo_check_connection" in text
