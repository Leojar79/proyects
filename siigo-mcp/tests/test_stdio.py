"""Real stdio transport tests: the server runs as a subprocess, exactly as Claude launches it."""

from __future__ import annotations

import json
import os
import queue
import signal
import subprocess
import sys
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import anyio
import pytest
from conftest import invoice_payload
from mcp import Client, StdioServerParameters

from siigo_mcp.server import WRITE_TOOL_NAMES

pytestmark = pytest.mark.anyio

SERVER_ARGS = ["-m", "siigo_mcp.server"]


def params(env: dict[str, str]) -> StdioServerParameters:
    return StdioServerParameters(command=sys.executable, args=SERVER_ARGS, env=env)


async def test_stdio_lists_tools_and_reports_missing_config():
    with anyio.fail_after(60):
        async with Client(params({"SIIGO_PARTNER_ID": "TestApp"})) as client:
            tools = (await client.list_tools()).tools
            names = {t.name for t in tools}
            assert len(names) == 34 and not names & WRITE_TOOL_NAMES
            result = await client.call_tool("siigo_check_connection", {})
    assert result.is_error
    text = result.content[0].text
    assert "SIIGO_USERNAME" in text and "SIIGO_ACCESS_KEY" in text


async def test_stdio_write_flag_registers_write_tools():
    env = {"SIIGO_ENABLE_WRITE": "true", "SIIGO_PARTNER_ID": "TestApp"}
    with anyio.fail_after(60):
        async with Client(params(env)) as client:
            names = {t.name for t in (await client.list_tools()).tools}
    assert len(names) == 39 and names >= WRITE_TOOL_NAMES


@pytest.mark.skipif(os.name == "nt", reason="~user expansion only fails on POSIX")
async def test_stdio_starts_even_if_download_dir_cannot_be_expanded():
    """Spec A.5: a bad SIIGO_DOWNLOAD_DIR is reported by the tools, it never kills the server."""
    env = {
        "SIIGO_USERNAME": "api@empresa.com",
        "SIIGO_ACCESS_KEY": "StdioSecretKey",
        "SIIGO_PARTNER_ID": "TestApp",
        "SIIGO_DOWNLOAD_DIR": "~siigo_no_such_user_zz9/descargas",
    }
    with anyio.fail_after(60):
        async with Client(params(env)) as client:
            assert len((await client.list_tools()).tools) == 34
            result = await client.call_tool("siigo_check_connection", {})
    assert result.is_error and "SIIGO_DOWNLOAD_DIR" in result.content[0].text


@pytest.mark.parametrize(
    ("var", "value", "credentials"),
    [
        # A SOCKS proxy (VPN/proxy tools): supported through httpx[socks]; this one is dead.
        ("ALL_PROXY", "socks5://127.0.0.1:1", True),
        ("HTTPS_PROXY", "ftp://proxy:21", False),  # unsupported proxy scheme
        ("SSL_CERT_FILE", "/nonexistent/siigo-ca.pem", False),
        ("SSL_CERT_FILE", "NOT_PEM", False),
    ],
)
async def test_stdio_starts_with_a_bad_proxy_or_ca_environment(var, value, credentials, tmp_path):
    """Regression: these variables crashed the lifespan before the initialize answer."""
    if value == "NOT_PEM":
        value = str(tmp_path / "hostname")
        Path(value).write_text("esto no es un certificado\n")
    env = {"SIIGO_PARTNER_ID": "TestApp", var: value}
    if credentials:
        env |= {"SIIGO_USERNAME": "api@empresa.com", "SIIGO_ACCESS_KEY": "StdioSecretKey"}
    with anyio.fail_after(60):
        async with Client(params(env)) as client:
            assert len((await client.list_tools()).tools) == 34
            result = await client.call_tool("siigo_check_connection", {})
    assert result.is_error and var in result.content[0].text, result.content[0].text


# --------------------------------------------------------------------------- full stack


class _FakeSiigoHandler(BaseHTTPRequestHandler):
    seen: list[dict[str, Any]] = []

    def _reply(self, status: int, body: Any) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"null")
        self.seen.append({"method": "POST", "path": self.path, "headers": dict(self.headers),
                          "body": body})  # fmt: skip
        if self.path == "/auth":
            self._reply(200, {"access_token": "stdio-token", "expires_in": 86400})
        else:
            self._reply(404, {"Errors": [{"Code": "not_found", "Message": "x"}]})

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        self.seen.append({"method": "GET", "path": self.path, "headers": dict(self.headers)})
        if self.path.startswith("/v1/taxes"):
            self._reply(200, [{"id": 13156, "name": "IVA 19%", "type": "IVA", "active": True}])
        else:
            self._reply(404, {"Errors": [{"Code": "not_found", "Message": "x"}]})

    def log_message(self, *args: Any) -> None:  # keep test output clean
        return


@pytest.fixture
def fake_siigo_http() -> Iterator[str]:
    _FakeSiigoHandler.seen = []
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _FakeSiigoHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_address[1]}"
    finally:
        httpd.shutdown()
        httpd.server_close()


async def test_stdio_full_stack_against_local_http(fake_siigo_http: str, tmp_path: Path):
    env = {
        "SIIGO_USERNAME": "api@empresa.com",
        "SIIGO_ACCESS_KEY": "StdioSecretKey",
        "SIIGO_PARTNER_ID": "TestApp",
        "SIIGO_BASE_URL": fake_siigo_http,
        "SIIGO_RATE_LIMIT_PER_MINUTE": "1000",
        "SIIGO_DOWNLOAD_DIR": str(tmp_path),
    }
    with anyio.fail_after(60):
        async with Client(params(env)) as client:
            check = await client.call_tool("siigo_check_connection", {})
            taxes = await client.call_tool("siigo_list_taxes", {})
    assert not check.is_error and check.structured_content["base_url"] == fake_siigo_http
    assert not taxes.is_error and taxes.structured_content["results"][0]["id"] == 13156
    seen = _FakeSiigoHandler.seen
    assert [s["path"] for s in seen] == ["/auth", "/v1/taxes"]
    assert seen[0]["body"] == {"username": "api@empresa.com", "access_key": "StdioSecretKey"}
    assert all(s["headers"].get("Partner-Id") == "TestApp" for s in seen)
    assert seen[1]["headers"]["Authorization"] == "Bearer stdio-token"


class _RejectingAuthHandler(_FakeSiigoHandler):
    """A Siigo that rejects the credentials: every POST /auth answers 401."""

    seen: list[dict[str, Any]] = []

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)
        self.seen.append({"method": "POST", "path": self.path})
        self._reply(401, {"Errors": [{"Code": "unauthorized", "Message": "Invalid credentials"}]})


async def test_stdio_parallel_calls_share_one_failed_auth():
    """Regression (spec A.4), through the real stdio server: parallel tool calls behind a
    rejected /auth each sent their own POST /auth (one failed request per call)."""
    _RejectingAuthHandler.seen = []
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _RejectingAuthHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    env = {
        "SIIGO_USERNAME": "api@empresa.com",
        "SIIGO_ACCESS_KEY": "StdioSecretKey",
        "SIIGO_PARTNER_ID": "TestApp",
        "SIIGO_BASE_URL": f"http://127.0.0.1:{httpd.server_address[1]}",
        "SIIGO_RATE_LIMIT_PER_MINUTE": "100",
    }
    results = []
    try:
        with anyio.fail_after(60):
            async with Client(params(env)) as client:

                async def one() -> None:
                    results.append(await client.call_tool("siigo_list_customers", {}))

                async with anyio.create_task_group() as tg:
                    for _ in range(5):
                        tg.start_soon(one)
    finally:
        httpd.shutdown()
        httpd.server_close()
    assert len(results) == 5 and all(r.is_error for r in results)
    assert [s["path"] for s in _RejectingAuthHandler.seen] == ["/auth"]
    assert all("SIIGO_ACCESS_KEY" in r.content[0].text for r in results)


class _SurrogateErrorHandler(_FakeSiigoHandler):
    """A Siigo whose error messages carry half an emoji (a lone UTF-16 surrogate)."""

    seen: list[dict[str, Any]] = []
    CUT = "Gracias por su compra \ud83d"  # json.dumps escapes it as \\ud83d

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)
        self.seen.append({"method": "POST", "path": self.path})
        if self.path == "/auth":
            self._reply(200, {"access_token": "stdio-token", "expires_in": 86400})
        else:
            self._reply(500, {"Errors": [{"Code": "unhandled_error", "Message": self.CUT}]})

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        self.seen.append({"method": "GET", "path": self.path})
        self._reply(400, {"Errors": [{"Code": "invalid_name", "Message": self.CUT,
                                      "Params": [self.CUT]}]})  # fmt: skip


async def test_stdio_error_with_a_lone_surrogate_keeps_the_server_alive(tmp_path: Path):
    """Regression: a lone surrogate in a Siigo error body reached the ToolError text and the
    stdio writer crashed the whole server, so a possibly created invoice lost its key notice."""
    _SurrogateErrorHandler.seen = []
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _SurrogateErrorHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    env = {
        "SIIGO_USERNAME": "api@empresa.com",
        "SIIGO_ACCESS_KEY": "StdioSecretKey",
        "SIIGO_PARTNER_ID": "TestApp",
        "SIIGO_BASE_URL": f"http://127.0.0.1:{httpd.server_address[1]}",
        "SIIGO_RATE_LIMIT_PER_MINUTE": "1000",
        "SIIGO_DOWNLOAD_DIR": str(tmp_path),
        "SIIGO_ENABLE_WRITE": "true",
    }
    try:
        with anyio.fail_after(60):
            async with Client(params(env)) as client:
                listing = await client.call_tool("siigo_list_customers", {})
                invoice = await client.call_tool(
                    "siigo_create_invoice",
                    {"invoice": invoice_payload(), "idempotency_key": "VentaSur1",
                     "skip_preflight": True},
                )  # fmt: skip
                alive = await client.call_tool("siigo_check_connection", {})
    finally:
        httpd.shutdown()
        httpd.server_close()
    assert listing.is_error and "invalid_name" in listing.content[0].text
    assert "\ufffd" in listing.content[0].text
    assert invoice.is_error and "VentaSur1" in invoice.content[0].text
    assert "MISMA idempotency_key" in invoice.content[0].text
    assert not alive.is_error


# --------------------------------------------------------------------------- raw JSON-RPC pipe


def _entry_point() -> list[str]:
    script = Path(sys.executable).parent / ("siigo-mcp.exe" if os.name == "nt" else "siigo-mcp")
    return [str(script)] if script.exists() else [sys.executable, *SERVER_ARGS]


def test_raw_jsonrpc_pipe_stdout_is_clean():
    messages = [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "pipe-test", "version": "0"},
            },
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "siigo_list_taxes", "arguments": {}},
        },
    ]
    env = {k: v for k, v in os.environ.items() if not k.startswith("SIIGO_")}
    env["SIIGO_LOG_LEVEL"] = "DEBUG"  # maximum logging: it must all go to stderr
    proc = subprocess.Popen(
        _entry_point(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True,
        encoding="utf-8",
    )
    lines: queue.Queue[str | None] = queue.Queue()

    def pump() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            lines.put(line)
        lines.put(None)

    reader = threading.Thread(target=pump, daemon=True)
    reader.start()
    assert proc.stdin is not None
    for message in messages:
        proc.stdin.write(json.dumps(message) + "\n")
    proc.stdin.flush()  # keep stdin open: EOF would cancel in-flight requests

    received: list[dict[str, Any]] = []
    try:
        while not {1, 2, 3} <= {m.get("id") for m in received}:
            line = lines.get(timeout=60)
            assert line is not None, "server closed stdout early"
            if not line.strip():
                continue
            message = json.loads(line)  # every stdout line must be JSON
            assert message.get("jsonrpc") == "2.0", line
            received.append(message)
    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        reader.join(timeout=5)
        stderr = proc.stderr.read() if proc.stderr else ""
        for stream in (proc.stdout, proc.stderr):
            if stream is not None:
                stream.close()
    by_id = {m["id"]: m for m in received if "id" in m}
    assert by_id[1]["result"]["serverInfo"]["name"] == "siigo_mcp"
    assert len(by_id[2]["result"]["tools"]) == 34
    call = by_id[3]["result"]
    assert call["isError"] is True and "SIIGO_USERNAME" in call["content"][0]["text"]
    assert "siigo-mcp" in stderr and "iniciando" in stderr  # logs went to stderr


# --------------------------------------------------------------------------- Ctrl+C


@pytest.mark.skipif(os.name == "nt", reason="POSIX signals")
def test_single_sigint_exits_cleanly_without_traceback():
    """README: run the server by hand and leave with Ctrl+C (one press, no traceback)."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("SIIGO_")}
    proc = subprocess.Popen(
        _entry_point(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True,
        encoding="utf-8",
    )
    lines: queue.Queue[str] = queue.Queue()
    threading.Thread(
        target=lambda: lines.put(proc.stdout.readline() if proc.stdout else ""), daemon=True
    ).start()
    try:
        assert proc.stdin is not None
        initialize = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "sigint-test", "version": "0"},
            },
        }
        proc.stdin.write(json.dumps(initialize) + "\n")
        proc.stdin.flush()  # stdin stays open, as in an interactive terminal
        assert json.loads(lines.get(timeout=60))["id"] == 1  # the event loop is running
        proc.send_signal(signal.SIGINT)
        returncode = proc.wait(timeout=15)
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        stderr = proc.stderr.read() if proc.stderr else ""
        for stream in (proc.stdin, proc.stdout, proc.stderr):
            if stream is not None:
                stream.close()
    assert returncode == 0, stderr
    assert "Traceback" not in stderr and "KeyboardInterrupt" not in stderr, stderr
    assert "detenido" in stderr
