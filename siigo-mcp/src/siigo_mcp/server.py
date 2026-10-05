"""MCP server for the Siigo Nube API (Colombia).

Use ``create_server()`` to build a server (tests inject settings, an
``httpx.MockTransport`` and a fake clock/sleep). The module-level ``mcp`` is
the instance used by the ``siigo-mcp`` entry point (stdio transport).

Write tools are registered only when ``SIIGO_ENABLE_WRITE`` is truthy.
"""

import base64
import binascii
import contextlib
import datetime as dt
import functools
import inspect
import logging
import os
import re
import signal
import sys
import tempfile
import unicodedata
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Annotated, Any, Literal, TypeVar, cast

import anyio
import httpx
from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.mcpserver.tools import Tool
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from pydantic import AfterValidator, ConfigDict, Field
from pydantic_core import to_jsonable_python

from . import __version__
from .client import (
    CONNECT_TIMEOUT,
    DATE_FILTER_RE,
    ClockFn,
    Settings,
    SiigoClient,
    SleepFn,
    active_positions,
    filter_active,
    http_env_vars,
    http_init_problem,
    normalize_list,
    redact_secrets,
    register_secret,
    render_json,
    truncate_output,
)
from .errors import (
    SiigoAPIError,
    SiigoConfigError,
    SiigoError,
    SiigoNetworkError,
    format_api_error,
    format_error,
    format_network_error,
    lower_keys,
    without_lone_surrogates,
)
from .idempotency import AnsweredKeys, call_reference, check_replay, differences, utc_now
from .models import EMAIL_PATTERN, CustomerCreate, InvoiceCreate, to_body
from .preflight import (
    DOCUMENT_TYPES_PATH,
    PAYMENT_TYPES_PATH,
    TAXES_PATH,
    CatalogCache,
    preflight_invoice,
)

log = logging.getLogger("siigo_mcp")
# Lines the user may need to recover a write (the Idempotency-Key of an invoice sent to
# Siigo): always emitted, whatever SIIGO_LOG_LEVEL says. Records that propagate to the root
# handlers are filtered only by this logger's own level.
audit_log = logging.getLogger("siigo_mcp.audit")
audit_log.setLevel(logging.INFO)

SERVER_NAME = "siigo_mcp"
GUID_PATTERN = r"^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$"
WRITE_TOOL_NAMES = frozenset(
    {
        "siigo_create_customer",
        "siigo_create_invoice",
        "siigo_send_invoice_email",
        "siigo_annul_invoice",
        "siigo_delete_invoice",
    }
)

INSTRUCTIONS = """\
Servidor MCP de Siigo Nube (software contable de Colombia).

Flujo recomendado: siigo_check_connection -> catálogos (siigo_list_document_types,
siigo_list_payment_types, siigo_list_taxes) y vendedores (siigo_list_users) -> consultas.
- Los IDs de documentos (facturas, clientes, productos...) son GUID; los de tipos de
  comprobante, impuestos, formas de pago, vendedores, centros de costo y bodegas son enteros.
- Siigo permite 100 solicitudes por minuto (10 en la empresa de pruebas) y BLOQUEA al usuario
  API si más del 80% de sus solicitudes fallan en 7 días: no repitas sin corregir los datos
  una llamada que falló con un error 4xx (salvo un 429: espera lo indicado y repítela).
- Si un listado trae `resume`, NO sigas con next_page (te saltarías registros): repite la
  llamada con los mismos filtros y page, page_size y skip de `resume`; cuando ya no traiga
  `resume`, sigue con next_page, el mismo page_size y skip=0. Las filas con `_compact: true`
  vienen resumidas; `truncation_message` dice qué siigo_get_* da el detalle, si existe
  (catálogos, vendedores y cuentas por pagar no la tienen).
- Las herramientas de escritura solo existen si SIIGO_ENABLE_WRITE=true.
- En siigo_create_invoice, stamp.send=true ENVÍA LA FACTURA A LA DIAN (acto legal e
  irreversible): pide confirmación explícita del usuario antes de usarlo.
- siigo_create_invoice exige idempotency_key: genera una NUEVA y única por cada venta y
  REUTILIZA LA MISMA en cualquier reintento de esa venta (tras un error, tiempo de espera,
  cancelación, interrupción o falta de respuesta): Siigo devuelve la factura ya creada con esa
  clave, tal como se creó, en vez de duplicarla. Nunca reutilices la clave de una venta para
  otra.
- Con replayed=true, siigo_create_invoice no creó ni cambió nada: Siigo devolvió una factura
  que ya existía con esa clave (lee `warning` y `differences`).
"""

# --------------------------------------------------------------------------- state


@dataclass
class AppState:
    settings: Settings
    client: SiigoClient
    catalogs: CatalogCache
    invoice_answers: AnsweredKeys


def _state(ctx: Context) -> AppState:
    return cast(AppState, ctx.request_context.lifespan_context)


# --------------------------------------------------------------------------- parameter types


def _valid_date(value: str) -> str:
    try:
        if "T" in value:
            dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
        else:
            dt.date.fromisoformat(value)
    except ValueError:
        raise ValueError("fecha inexistente; usa yyyy-MM-dd o yyyy-MM-ddTHH:mm:ssZ") from None
    return value


DateStr = Annotated[str, Field(pattern=DATE_FILTER_RE.pattern), AfterValidator(_valid_date)]
_DATE_HELP = " (yyyy-MM-dd o yyyy-MM-ddTHH:mm:ssZ en UTC)"
CreatedStart = Annotated[DateStr | None, Field(description="Creados desde esta fecha" + _DATE_HELP)]
CreatedEnd = Annotated[DateStr | None, Field(description="Creados hasta esta fecha" + _DATE_HELP)]
UpdatedStart = Annotated[
    DateStr | None, Field(description="Modificados desde esta fecha" + _DATE_HELP)
]
UpdatedEnd = Annotated[
    DateStr | None, Field(description="Modificados hasta esta fecha" + _DATE_HELP)
]
DateStart = Annotated[DateStr | None, Field(description="Fecha del documento desde" + _DATE_HELP)]
DateEnd = Annotated[DateStr | None, Field(description="Fecha del documento hasta" + _DATE_HELP)]

Page = Annotated[int, Field(ge=1, le=100_000, description="Número de página (empieza en 1)")]
PageSize = Annotated[
    int,
    Field(ge=1, le=100, description="Resultados por página (1-100; Siigo eleva valores < 10 a 10)"),
]
Skip = Annotated[
    int,
    Field(
        ge=0,
        le=999,
        description=(
            "Filas iniciales de la página que se omiten (0 por defecto). Úsalo solo con el valor "
            "`resume.skip` de una respuesta recortada, junto con su page y page_size"
        ),
    ),
]
Guid = Annotated[
    str,
    Field(
        pattern=GUID_PATTERN,
        description="ID del documento en Siigo (GUID); obténlo con la herramienta siigo_list_*",
    ),
]
PurchaseId = Annotated[
    str,
    Field(
        pattern=GUID_PATTERN,
        description=(
            "ID (GUID) de la factura de compra. Este servidor no tiene un listado de compras: "
            "el usuario debe darte el ID"
        ),
    ),
]
Identification = Annotated[
    str,
    Field(
        pattern=r"^[A-Za-z0-9]{1,20}$",
        description="Número de identificación (NIT sin dígito de verificación, cédula...)",
    ),
]
BranchOffice = Annotated[int, Field(ge=0, le=999, description="Sucursal (0-999; 0 por defecto)")]
IncludeInactive = Annotated[
    bool, Field(description="Incluir también los registros inactivos (por defecto solo activos)")
]
Refresh = Annotated[
    bool,
    Field(description="Ignorar la caché de 10 minutos y volver a consultar Siigo"),
]
FileName = Annotated[
    str | None,
    Field(
        max_length=120,
        description="Nombre del archivo sin extensión (ej. FV-2-22); por defecto el ID",
    ),
]
DocumentTypeCode = Literal["FV", "NC", "RC", "FC", "CC", "RP", "C", "DS"]


def _check_range(label: str, start: str | None, end: str | None) -> None:
    if not start or not end:
        return

    def parse(value: str) -> dt.datetime:
        if "T" in value:
            return dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
        return dt.datetime.combine(dt.date.fromisoformat(value), dt.time())

    if parse(start) > parse(end):
        raise ToolError(
            f"Rango de fechas inválido en {label}: el inicio ({start}) es posterior al fin ({end})."
        )


# --------------------------------------------------------------------------- registry


@dataclass(frozen=True)
class ToolSpec:
    fn: Callable[..., Awaitable[CallToolResult]]
    name: str
    title: str
    read_only: bool
    destructive: bool
    idempotent: bool
    write: bool

    @property
    def annotations(self) -> ToolAnnotations:
        return ToolAnnotations(
            title=self.title,
            read_only_hint=self.read_only,
            destructive_hint=self.destructive,
            idempotent_hint=self.idempotent,
            open_world_hint=True,
        )


TOOL_SPECS: list[ToolSpec] = []
_F = TypeVar("_F", bound=Callable[..., Awaitable[dict[str, Any]]])


def _tool_result(data: dict[str, Any]) -> CallToolResult:
    """The result as compact JSON text plus the same object as structuredContent.

    The SDK would render the text block as indented JSON (about 1.6 times longer): the
    25,000-character cap is measured with ``render_json``, the exact text sent here.
    """
    structured = without_lone_surrogates(to_jsonable_python(data, fallback=str))
    return CallToolResult(
        content=[TextContent(type="text", text=render_json(structured))],
        structured_content=structured,
    )


def _translate_errors(fn: _F) -> Callable[..., Awaitable[CallToolResult]]:
    """Re-raise every Siigo/httpx failure as an actionable ToolError (never a bare crash)."""

    @functools.wraps(fn)
    async def wrapper(*args: Any, **kwargs: Any) -> CallToolResult:
        try:
            return await _call(*args, **kwargs)
        except ToolError as exc:
            # Last line of defence: a lone surrogate in the text would crash the stdio writer.
            clean = without_lone_surrogates(str(exc))
            if clean == str(exc):
                raise
            raise ToolError(clean) from exc.__cause__

    async def _call(*args: Any, **kwargs: Any) -> CallToolResult:
        try:
            return _tool_result(await fn(*args, **kwargs))
        except ToolError:
            raise
        except SiigoError as exc:
            raise ToolError(format_error(exc)) from exc
        except httpx.HTTPError as exc:
            raise ToolError(
                f"Error de comunicación con Siigo ({type(exc).__name__}). Intenta de nuevo."
            ) from exc
        except Exception as exc:
            log.exception("Error inesperado en %s", fn.__name__)
            raise ToolError(
                f"Error inesperado ({type(exc).__name__}) procesando la respuesta de Siigo. "
                "Revisa los logs del servidor (stderr)."
            ) from exc

    return wrapper


def siigo_tool(
    name: str,
    title: str,
    *,
    read_only: bool = True,
    destructive: bool = False,
    idempotent: bool = True,
    write: bool = False,
) -> Callable[[_F], _F]:
    def decorator(fn: _F) -> _F:
        TOOL_SPECS.append(
            ToolSpec(
                fn=_translate_errors(fn),
                name=name,
                title=title,
                read_only=read_only,
                destructive=destructive,
                idempotent=idempotent,
                write=write,
            )
        )
        return fn

    return decorator


# --------------------------------------------------------------------------- shared helpers


# The siigo_get_* tool that returns a full row of each listing (named in truncation advice).
DETAIL_TOOLS = {
    "/v1/customers": "siigo_get_customer",
    "/v1/products": "siigo_get_product",
    "/v1/invoices": "siigo_get_invoice",
    "/v1/credit-notes": "siigo_get_credit_note",
    "/v1/vouchers": "siigo_get_voucher",
    "/v1/payment-receipts": "siigo_get_payment_receipt",
    "/v1/journals": "siigo_get_journal",
    "/v1/quotations": "siigo_get_quotation",
}


async def _list(
    ctx: Context, path: str, page: int, page_size: int, skip: int, **filters: Any
) -> dict[str, Any]:
    data = await _state(ctx).client.get(path, {"page": page, "page_size": page_size, **filters})
    return truncate_output(
        normalize_list(data, page),
        paginated=not isinstance(data, list),
        skip=skip,
        detail_tool=DETAIL_TOOLS.get(path),
        filterable=bool(filters),
    )


async def _get_one(ctx: Context, path: str) -> dict[str, Any]:
    data = await _state(ctx).client.get(path)
    return data if isinstance(data, dict) else {"result": data}


async def _catalog(
    ctx: Context,
    path: str,
    params: dict[str, Any] | None,
    include_inactive: bool,
    refresh: bool,
) -> dict[str, Any]:
    data, cached = await _state(ctx).catalogs.get(path, params, refresh=refresh)
    out = normalize_list(data)
    active = filter_active(out["results"], include_inactive)
    out.update(
        results=active,
        count=len(active),
        inactive_omitted=len(out["results"]) - len(active),
        cached=cached,
    )
    return truncate_output(out, paginated=False)  # catalogs are plain arrays, never paged


_WINDOWS_RESERVED = {"CON", "PRN", "AUX", "NUL"} | {
    f"{prefix}{n}" for prefix in ("COM", "LPT") for n in range(1, 10)
}


def safe_filename(name: str, ext: str, fallback: str = "documento") -> str:
    """ASCII-only file name without path separators, reserved names or a duplicated extension."""
    text = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    if text.lower().endswith("." + ext):
        text = text[: -(len(ext) + 1)]
    text = re.sub(r"[^A-Za-z0-9._-]+", "_", text).strip("._-")[:120]
    if not text:
        text = fallback
    if text.split(".")[0].upper() in _WINDOWS_RESERVED:
        text = "_" + text
    return f"{text}.{ext}"


def _write_file(directory: Path, filename: str, content: bytes) -> Path:
    directory = directory.expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    target = (directory / filename).resolve()
    if target.parent != directory:
        raise ValueError("nombre de archivo fuera de la carpeta de descargas")
    fd, tmp = tempfile.mkstemp(prefix=".siigo-", dir=directory)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(content)
        os.replace(tmp, target)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return target


async def _download(
    ctx: Context, path: str, doc_id: str, ext: str, file_name: str | None, code_key: str
) -> dict[str, Any]:
    state = _state(ctx)
    data = await state.client.get(path)
    low = lower_keys(data)
    encoded = low.get("base64")
    if not isinstance(encoded, str) or not encoded.strip():
        raise ToolError(
            f"Siigo no devolvió el archivo {ext.upper()} del documento {doc_id} (campo base64 "
            "vacío). Verifica que el documento exista y, para el XML, que haya sido enviado a la "
            "DIAN."
        )
    try:
        content = base64.b64decode("".join(encoded.split()), validate=True)
    except (binascii.Error, ValueError):
        raise ToolError(f"El {ext.upper()} recibido de Siigo no es base64 válido.") from None
    filename = safe_filename(file_name or str(low.get("id") or doc_id), ext, fallback=doc_id)
    try:
        target = await anyio.to_thread.run_sync(
            _write_file, state.settings.download_dir, filename, content
        )
    except (OSError, ValueError, RuntimeError) as exc:  # RuntimeError: "~" not expandable
        raise ToolError(
            f"No se pudo guardar el archivo en {state.settings.download_dir}: "
            f"{getattr(exc, 'strerror', None) or exc}. Revisa SIIGO_DOWNLOAD_DIR."
        ) from None
    out: dict[str, Any] = {
        "id": low.get("id") or doc_id,
        "path": str(target),
        "bytes": len(content),
        "format": ext,
    }
    if low.get(code_key):
        out[code_key] = low[code_key]
    return out


def _as_result(data: Any, **extra: Any) -> dict[str, Any]:
    if isinstance(data, dict) and data:
        return {**extra, **data} if extra else data
    return {**extra, "response": data}


def _matches_customer(row: Any, identification: str, branch_office: int) -> bool:
    if not isinstance(row, dict) or str(row.get("identification", "")) != identification:
        return False
    branch = row.get("branch_office")
    try:
        return branch is None or int(branch) == branch_office
    except (TypeError, ValueError):
        return True


# =========================================================================== tools: connection


@siigo_tool("siigo_check_connection", "Verificar conexión con Siigo")
async def siigo_check_connection(ctx: Context) -> dict[str, Any]:
    """Verifica la configuración y las credenciales de Siigo pidiendo un token nuevo (POST /auth).

    Úsala primero, antes de cualquier otra herramienta, o cuando otra falle por credenciales,
    Partner-Id o configuración. No consulta datos contables. Devuelve ok, base_url, partner_id,
    usuario, límite de solicitudes por minuto y si las herramientas de escritura están habilitadas.
    """
    state = _state(ctx)
    settings = state.settings
    problems = settings.config_problems()
    if problems:
        raise SiigoConfigError(problems)
    await state.client.authenticate(force=True)
    return {
        "ok": True,
        "base_url": settings.base_url,
        "partner_id": settings.partner_id,
        "username": settings.username,
        "rate_limit_per_minute": settings.rate_limit_per_minute,
        "write_enabled": settings.enable_write,
        "download_dir": str(settings.download_dir),
        "token_expires_in_seconds": int(state.client.token_expires_in),
    }


# =========================================================================== tools: customers


@siigo_tool("siigo_list_customers", "Listar clientes / terceros")
async def siigo_list_customers(
    ctx: Context,
    page: Page = 1,
    page_size: PageSize = 25,
    skip: Skip = 0,
    identification: Annotated[
        Identification | None, Field(description="Filtrar por identificación exacta")
    ] = None,
    branch_office: Annotated[BranchOffice | None, Field(description="Filtrar por sucursal")] = None,
    created_start: CreatedStart = None,
    created_end: CreatedEnd = None,
    updated_start: UpdatedStart = None,
    updated_end: UpdatedEnd = None,
) -> dict[str, Any]:
    """Lista los terceros (clientes, proveedores) de Siigo, paginados.

    Úsala para buscar un cliente/tercero por identificación (NIT o cédula) o para recorrer el
    listado; el `id` (GUID) de cada resultado sirve para siigo_get_customer. Para saber si un
    cliente existe antes de facturar, filtra por `identification`.
    No la uses para productos (siigo_list_products) ni para vendedores (siigo_list_users).
    Devuelve page, page_size, total_results, has_more, next_page y results; si la respuesta
    trae `resume`, pide el resto con page, page_size y skip de `resume`, no con next_page.
    """
    _check_range("created", created_start, created_end)
    _check_range("updated", updated_start, updated_end)
    return await _list(
        ctx,
        "/v1/customers",
        page,
        page_size,
        skip,
        identification=identification,
        branch_office=branch_office,
        created_start=created_start,
        created_end=created_end,
        updated_start=updated_start,
        updated_end=updated_end,
    )


@siigo_tool("siigo_get_customer", "Ver cliente / tercero")
async def siigo_get_customer(ctx: Context, customer_id: Guid) -> dict[str, Any]:
    """Obtiene el detalle completo de un tercero (cliente/proveedor) por su ID (GUID).

    Úsala cuando ya tienes el GUID (de siigo_list_customers). Si solo tienes el NIT o la cédula,
    usa siigo_list_customers(identification=...).
    """
    return await _get_one(ctx, f"/v1/customers/{customer_id}")


# =========================================================================== tools: products


@siigo_tool("siigo_list_products", "Listar productos")
async def siigo_list_products(
    ctx: Context,
    page: Page = 1,
    page_size: PageSize = 25,
    skip: Skip = 0,
    code: Annotated[
        str | None,
        Field(max_length=100, pattern=r"^[^'\s]+$", description="Filtrar por código exacto"),
    ] = None,
    ids: Annotated[
        list[Guid] | None,
        Field(max_length=20, description="Filtrar por hasta 20 IDs (GUID) de producto"),
    ] = None,
    created_start: CreatedStart = None,
    created_end: CreatedEnd = None,
    updated_start: UpdatedStart = None,
    updated_end: UpdatedEnd = None,
) -> dict[str, Any]:
    """Lista los productos y servicios (inventario) de Siigo, del más reciente al más antiguo.

    Úsala para encontrar el `code` de un producto antes de facturar o para revisar precios.
    No la uses para catálogos de impuestos o bodegas (siigo_list_taxes, siigo_list_warehouses).
    """
    _check_range("created", created_start, created_end)
    _check_range("updated", updated_start, updated_end)
    return await _list(
        ctx,
        "/v1/products",
        page,
        page_size,
        skip,
        code=code,
        ids=",".join(ids) if ids else None,
        created_start=created_start,
        created_end=created_end,
        updated_start=updated_start,
        updated_end=updated_end,
    )


@siigo_tool("siigo_get_product", "Ver producto")
async def siigo_get_product(ctx: Context, product_id: Guid) -> dict[str, Any]:
    """Obtiene el detalle de un producto o servicio por su ID (GUID).

    Si solo tienes el código del producto, usa siigo_list_products(code=...).
    """
    return await _get_one(ctx, f"/v1/products/{product_id}")


# =========================================================================== tools: invoices


@siigo_tool("siigo_list_invoices", "Listar facturas de venta")
async def siigo_list_invoices(
    ctx: Context,
    page: Page = 1,
    page_size: PageSize = 25,
    skip: Skip = 0,
    document_id: Annotated[
        int | None,
        Field(ge=1, description="ID del tipo de comprobante (siigo_list_document_types)"),
    ] = None,
    customer_identification: Annotated[
        Identification | None, Field(description="Identificación del cliente")
    ] = None,
    customer_branch_office: Annotated[
        BranchOffice | None, Field(description="Sucursal del cliente")
    ] = None,
    name: Annotated[
        str | None,
        Field(pattern=r"^[A-Za-z0-9-]{1,40}$", description="Nombre/número, ej. FV-1-457"),
    ] = None,
    created_start: CreatedStart = None,
    created_end: CreatedEnd = None,
    date_start: DateStart = None,
    date_end: DateEnd = None,
    updated_start: UpdatedStart = None,
    updated_end: UpdatedEnd = None,
) -> dict[str, Any]:
    """Lista las facturas de venta (FV, factura electrónica) de Siigo, paginadas.

    Úsala para buscar facturas por cliente, por número (name, ej. FV-1-457) o por rango de
    fechas, y para revisar saldos (`balance`) o cartera aproximada de un cliente.
    El estado DIAN de cada factura está en `stamp.status` (Draft, Accepted, Rejected).
    No la uses para notas crédito (siigo_list_credit_notes) ni cotizaciones
    (siigo_list_quotations).
    """
    _check_range("created", created_start, created_end)
    _check_range("date", date_start, date_end)
    _check_range("updated", updated_start, updated_end)
    return await _list(
        ctx,
        "/v1/invoices",
        page,
        page_size,
        skip,
        document_id=document_id,
        customer_identification=customer_identification,
        customer_branch_office=customer_branch_office,
        name=name,
        created_start=created_start,
        created_end=created_end,
        date_start=date_start,
        date_end=date_end,
        updated_start=updated_start,
        updated_end=updated_end,
    )


@siigo_tool("siigo_get_invoice", "Ver factura de venta")
async def siigo_get_invoice(ctx: Context, invoice_id: Guid) -> dict[str, Any]:
    """Obtiene el detalle de una factura de venta por su ID (GUID).

    Incluye ítems, pagos, total, saldo (`balance`), estado DIAN (`stamp.status`: Draft = guardada
    sin enviar, Accepted = aceptada, Rejected = rechazada; `stamp.cufe`), estado del correo
    (`mail.status`) y `public_url`. Si fue rechazada, usa siigo_get_invoice_dian_errors.
    """
    return await _get_one(ctx, f"/v1/invoices/{invoice_id}")


@siigo_tool("siigo_get_invoice_dian_errors", "Ver errores DIAN de una factura")
async def siigo_get_invoice_dian_errors(ctx: Context, invoice_id: Guid) -> dict[str, Any]:
    """Obtiene los motivos por los que la DIAN rechazó una factura electrónica.

    Úsala cuando siigo_get_invoice muestra stamp.status = Rejected. No sirve para errores de
    validación de Siigo al crear la factura (esos llegan en el mensaje de error de la creación).
    """
    return await _get_one(ctx, f"/v1/invoices/{invoice_id}/stamp/errors")


@siigo_tool("siigo_get_invoice_pdf", "Descargar PDF de factura", read_only=False, idempotent=True)
async def siigo_get_invoice_pdf(
    ctx: Context, invoice_id: Guid, file_name: FileName = None
) -> dict[str, Any]:
    """Descarga el PDF de una factura de venta y lo guarda en SIIGO_DOWNLOAD_DIR.

    Escribe un archivo local (no modifica nada en Siigo) y devuelve la ruta (`path`), el tamaño
    (`bytes`) y el CUFE si viene; nunca devuelve el contenido base64. Úsala cuando el usuario
    pida el PDF o la representación gráfica de la factura.
    """
    return await _download(
        ctx, f"/v1/invoices/{invoice_id}/pdf", invoice_id, "pdf", file_name, "cufe"
    )


@siigo_tool("siigo_get_invoice_xml", "Descargar XML de factura", read_only=False, idempotent=True)
async def siigo_get_invoice_xml(
    ctx: Context, invoice_id: Guid, file_name: FileName = None
) -> dict[str, Any]:
    """Descarga el XML electrónico (DIAN) de una factura y lo guarda en SIIGO_DOWNLOAD_DIR.

    Escribe un archivo local (no modifica nada en Siigo) y devuelve `path` y `bytes`; nunca el
    base64. Solo existe para facturas electrónicas enviadas a la DIAN.
    """
    return await _download(
        ctx, f"/v1/invoices/{invoice_id}/xml", invoice_id, "xml", file_name, "cufe"
    )


# =========================================================================== tools: credit notes


@siigo_tool("siigo_list_credit_notes", "Listar notas crédito")
async def siigo_list_credit_notes(
    ctx: Context,
    page: Page = 1,
    page_size: PageSize = 25,
    skip: Skip = 0,
    created_start: CreatedStart = None,
    created_end: CreatedEnd = None,
    updated_start: UpdatedStart = None,
    updated_end: UpdatedEnd = None,
) -> dict[str, Any]:
    """Lista las notas crédito (NC: devoluciones o anulaciones parciales de facturas), paginadas.

    Úsala para revisar notas crédito por fecha de creación o modificación. No la uses para
    facturas (siigo_list_invoices).
    """
    _check_range("created", created_start, created_end)
    _check_range("updated", updated_start, updated_end)
    return await _list(
        ctx,
        "/v1/credit-notes",
        page,
        page_size,
        skip,
        created_start=created_start,
        created_end=created_end,
        updated_start=updated_start,
        updated_end=updated_end,
    )


@siigo_tool("siigo_get_credit_note", "Ver nota crédito")
async def siigo_get_credit_note(ctx: Context, credit_note_id: Guid) -> dict[str, Any]:
    """Obtiene el detalle de una nota crédito por su ID (GUID)."""
    return await _get_one(ctx, f"/v1/credit-notes/{credit_note_id}")


@siigo_tool(
    "siigo_get_credit_note_pdf", "Descargar PDF de nota crédito", read_only=False, idempotent=True
)
async def siigo_get_credit_note_pdf(
    ctx: Context, credit_note_id: Guid, file_name: FileName = None
) -> dict[str, Any]:
    """Descarga el PDF de una nota crédito y lo guarda en SIIGO_DOWNLOAD_DIR.

    Escribe un archivo local (no modifica nada en Siigo) y devuelve `path`, `bytes` y el CUDE si
    viene; nunca devuelve el base64.
    """
    return await _download(
        ctx, f"/v1/credit-notes/{credit_note_id}/pdf", credit_note_id, "pdf", file_name, "cude"
    )


# =========================================================================== tools: vouchers etc.


@siigo_tool("siigo_list_vouchers", "Listar recibos de caja")
async def siigo_list_vouchers(
    ctx: Context,
    page: Page = 1,
    page_size: PageSize = 25,
    skip: Skip = 0,
    created_start: CreatedStart = None,
    created_end: CreatedEnd = None,
    updated_start: UpdatedStart = None,
    updated_end: UpdatedEnd = None,
) -> dict[str, Any]:
    """Lista los recibos de caja (RC: pagos recibidos de clientes, abonos, anticipos), paginados.

    Úsala para revisar cobros/recaudos. No la uses para pagos a proveedores (recibos de pago o
    egresos: siigo_list_payment_receipts).
    """
    _check_range("created", created_start, created_end)
    _check_range("updated", updated_start, updated_end)
    return await _list(
        ctx,
        "/v1/vouchers",
        page,
        page_size,
        skip,
        created_start=created_start,
        created_end=created_end,
        updated_start=updated_start,
        updated_end=updated_end,
    )


@siigo_tool("siigo_get_voucher", "Ver recibo de caja")
async def siigo_get_voucher(ctx: Context, voucher_id: Guid) -> dict[str, Any]:
    """Obtiene el detalle de un recibo de caja por su ID (GUID)."""
    return await _get_one(ctx, f"/v1/vouchers/{voucher_id}")


@siigo_tool("siigo_list_payment_receipts", "Listar recibos de pago / egresos")
async def siigo_list_payment_receipts(
    ctx: Context,
    page: Page = 1,
    page_size: PageSize = 25,
    skip: Skip = 0,
    created_start: CreatedStart = None,
    created_end: CreatedEnd = None,
    updated_start: UpdatedStart = None,
    updated_end: UpdatedEnd = None,
) -> dict[str, Any]:
    """Lista los recibos de pago o comprobantes de egreso (RP: pagos a proveedores), paginados.

    Úsala para revisar pagos realizados. No la uses para cobros a clientes
    (siigo_list_vouchers).
    """
    _check_range("created", created_start, created_end)
    _check_range("updated", updated_start, updated_end)
    return await _list(
        ctx,
        "/v1/payment-receipts",
        page,
        page_size,
        skip,
        created_start=created_start,
        created_end=created_end,
        updated_start=updated_start,
        updated_end=updated_end,
    )


@siigo_tool("siigo_get_payment_receipt", "Ver recibo de pago / egreso")
async def siigo_get_payment_receipt(ctx: Context, payment_receipt_id: Guid) -> dict[str, Any]:
    """Obtiene el detalle de un recibo de pago (comprobante de egreso) por su ID (GUID)."""
    return await _get_one(ctx, f"/v1/payment-receipts/{payment_receipt_id}")


@siigo_tool("siigo_list_journals", "Listar comprobantes contables")
async def siigo_list_journals(
    ctx: Context,
    page: Page = 1,
    page_size: PageSize = 25,
    skip: Skip = 0,
    document_id: Annotated[
        int | None,
        Field(ge=1, description="ID del tipo de comprobante CC (siigo_list_document_types)"),
    ] = None,
) -> dict[str, Any]:
    """Lista los comprobantes contables (CC, asientos o notas de contabilidad), paginados.

    Úsala para revisar asientos manuales. No la uses para facturas ni recibos, que tienen sus
    propias herramientas.
    """
    return await _list(ctx, "/v1/journals", page, page_size, skip, document_id=document_id)


@siigo_tool("siigo_get_journal", "Ver comprobante contable")
async def siigo_get_journal(ctx: Context, journal_id: Guid) -> dict[str, Any]:
    """Obtiene el detalle de un comprobante contable (asiento) por su ID (GUID)."""
    return await _get_one(ctx, f"/v1/journals/{journal_id}")


@siigo_tool("siigo_get_purchase", "Ver factura de compra")
async def siigo_get_purchase(ctx: Context, purchase_id: PurchaseId) -> dict[str, Any]:
    """Obtiene el detalle de una factura de compra (FC, gasto o compra a proveedor) por su GUID.

    Siigo no documenta un listado de compras; para saldos pendientes con proveedores usa
    siigo_list_accounts_payable (cuentas por pagar).
    """
    return await _get_one(ctx, f"/v1/purchases/{purchase_id}")


@siigo_tool("siigo_list_quotations", "Listar cotizaciones")
async def siigo_list_quotations(
    ctx: Context,
    page: Page = 1,
    page_size: PageSize = 25,
    skip: Skip = 0,
    name: Annotated[
        str | None,
        Field(pattern=r"^[A-Za-z0-9-]{1,40}$", description="Nombre/número, ej. C-1-25"),
    ] = None,
    customer_identification: Annotated[
        Identification | None, Field(description="Identificación del cliente")
    ] = None,
    customer_branch_office: Annotated[
        BranchOffice | None, Field(description="Sucursal del cliente")
    ] = None,
    created_start: CreatedStart = None,
    created_end: CreatedEnd = None,
) -> dict[str, Any]:
    """Lista las cotizaciones (C, presupuestos u ofertas a clientes), paginadas.

    Úsala para buscar cotizaciones por cliente, número o fecha de creación. No la uses para
    facturas (siigo_list_invoices).
    """
    _check_range("created", created_start, created_end)
    return await _list(
        ctx,
        "/v1/quotations",
        page,
        page_size,
        skip,
        name=name,
        customer_identification=customer_identification,
        customer_branch_office=customer_branch_office,
        created_start=created_start,
        created_end=created_end,
    )


@siigo_tool("siigo_get_quotation", "Ver cotización")
async def siigo_get_quotation(ctx: Context, quotation_id: Guid) -> dict[str, Any]:
    """Obtiene el detalle de una cotización por su ID (GUID)."""
    return await _get_one(ctx, f"/v1/quotations/{quotation_id}")


# =========================================================================== tools: catalogs


@siigo_tool("siigo_list_document_types", "Listar tipos de comprobante")
async def siigo_list_document_types(
    ctx: Context,
    type: Annotated[
        DocumentTypeCode,
        Field(
            description=(
                "FV factura de venta, NC nota crédito, RC recibo de caja, FC factura de compra, "
                "CC comprobante contable, RP recibo de pago, C cotización, DS documento soporte"
            )
        ),
    ],
    include_inactive: IncludeInactive = False,
    refresh: Refresh = False,
) -> dict[str, Any]:
    """Lista los tipos de comprobante configurados en Siigo para una clase de documento.

    Úsala antes de crear una factura: el `id` es el `document.id` de la factura y los campos
    automatic_number, cost_center_mandatory, seller_by_item, discount_type y electronic_type
    (NoElectronic = no electrónica) indican qué datos exige. Resultado en caché 10 minutos.
    """
    return await _catalog(ctx, DOCUMENT_TYPES_PATH, {"type": type}, include_inactive, refresh)


@siigo_tool("siigo_list_payment_types", "Listar formas de pago")
async def siigo_list_payment_types(
    ctx: Context,
    document_type: Annotated[
        Literal["FV", "NC", "RC"],
        Field(description="FV factura de venta, NC nota crédito, RC recibo de caja"),
    ] = "FV",
    include_inactive: IncludeInactive = False,
    refresh: Refresh = False,
) -> dict[str, Any]:
    """Lista las formas de pago (medios de pago: efectivo, crédito, transferencia...) de Siigo.

    Úsala antes de crear una factura: el `id` va en payments[].id; si `due_date` es true, ese
    pago exige fecha de vencimiento y la factura solo puede tener un pago. Caché de 10 minutos.
    """
    return await _catalog(
        ctx, PAYMENT_TYPES_PATH, {"document_type": document_type}, include_inactive, refresh
    )


@siigo_tool("siigo_list_taxes", "Listar impuestos")
async def siigo_list_taxes(
    ctx: Context, include_inactive: IncludeInactive = False, refresh: Refresh = False
) -> dict[str, Any]:
    """Lista los impuestos y retenciones configurados (IVA, Impoconsumo, Retefuente, ReteIVA...).

    Úsala para obtener los `id` de impuestos de los ítems de una factura (IVA, Impoconsumo) y de
    las retenciones a nivel de factura (ReteIVA, ReteICA, Autorretención). Caché de 10 minutos.
    """
    return await _catalog(ctx, TAXES_PATH, None, include_inactive, refresh)


@siigo_tool("siigo_list_users", "Listar usuarios / vendedores")
async def siigo_list_users(
    ctx: Context,
    page: Page = 1,
    page_size: PageSize = 25,
    skip: Skip = 0,
    include_inactive: IncludeInactive = False,
) -> dict[str, Any]:
    """Lista los usuarios de Siigo, que son los vendedores (sellers) de las facturas.

    Úsala para obtener el `id` que va en `seller` al crear una factura o en
    related_users.seller_id de un cliente. No la uses para clientes (siigo_list_customers).
    """
    data = await _state(ctx).client.get("/v1/users", {"page": page, "page_size": page_size})
    out = normalize_list(data, page)
    positions = active_positions(out["results"], include_inactive)
    active = [out["results"][i] for i in positions]
    out.update(
        results=active, count=len(active), inactive_omitted=len(out["results"]) - len(active)
    )
    return truncate_output(
        out, paginated=not isinstance(data, list), positions=positions, skip=skip
    )


@siigo_tool("siigo_list_cost_centers", "Listar centros de costo")
async def siigo_list_cost_centers(
    ctx: Context, include_inactive: IncludeInactive = False, refresh: Refresh = False
) -> dict[str, Any]:
    """Lista los centros de costo. El `id` va en `cost_center` de la factura. Caché 10 min."""
    return await _catalog(ctx, "/v1/cost-centers", None, include_inactive, refresh)


@siigo_tool("siigo_list_warehouses", "Listar bodegas")
async def siigo_list_warehouses(
    ctx: Context, include_inactive: IncludeInactive = False, refresh: Refresh = False
) -> dict[str, Any]:
    """Lista las bodegas (inventario). El `id` va en items[].warehouse. Caché de 10 minutos."""
    return await _catalog(ctx, "/v1/warehouses", None, include_inactive, refresh)


@siigo_tool("siigo_list_price_lists", "Listar listas de precios")
async def siigo_list_price_lists(
    ctx: Context, include_inactive: IncludeInactive = False, refresh: Refresh = False
) -> dict[str, Any]:
    """Lista las listas de precios configuradas en Siigo. Caché de 10 minutos."""
    return await _catalog(ctx, "/v1/price-lists", None, include_inactive, refresh)


@siigo_tool("siigo_list_account_groups", "Listar grupos de inventario")
async def siigo_list_account_groups(
    ctx: Context, include_inactive: IncludeInactive = False, refresh: Refresh = False
) -> dict[str, Any]:
    """Lista los grupos de inventario (grupos contables de productos). Caché de 10 minutos."""
    return await _catalog(ctx, "/v1/account-groups", None, include_inactive, refresh)


@siigo_tool("siigo_list_fixed_assets", "Listar activos fijos")
async def siigo_list_fixed_assets(
    ctx: Context, include_inactive: IncludeInactive = False, refresh: Refresh = False
) -> dict[str, Any]:
    """Lista los activos fijos registrados en Siigo. Caché de 10 minutos."""
    return await _catalog(ctx, "/v1/fixed-assets", None, include_inactive, refresh)


# =========================================================================== tools: reports


@siigo_tool("siigo_list_accounts_payable", "Listar cuentas por pagar")
async def siigo_list_accounts_payable(
    ctx: Context,
    page: Page = 1,
    page_size: PageSize = 25,
    skip: Skip = 0,
    due_date_start: Annotated[
        DateStr | None, Field(description="Vencimiento desde" + _DATE_HELP)
    ] = None,
    due_date_end: Annotated[
        DateStr | None, Field(description="Vencimiento hasta" + _DATE_HELP)
    ] = None,
    provider_identification: Annotated[
        Identification | None, Field(description="Identificación del proveedor")
    ] = None,
    provider_branch_office: Annotated[
        BranchOffice | None,
        Field(
            description=(
                "Sucursal del proveedor; solo junto con provider_identification (Siigo exige "
                "enviar primero la identificación del proveedor)"
            )
        ),
    ] = None,
) -> dict[str, Any]:
    """Lista las cuentas por pagar (saldos pendientes con proveedores), paginadas.

    Úsala para ver qué se le debe a proveedores y cuándo vence. No sirve para cartera de
    clientes (cuentas por cobrar): Siigo no tiene ese reporte; usa siigo_list_invoices y el campo
    `balance` de cada factura como aproximación. Para filtrar por sucursal
    (provider_branch_office) envía también provider_identification.
    """
    if provider_branch_office is not None and provider_identification is None:
        # Siigo documents the branch filter only after the provider's identification; sent
        # alone it is rejected (a failed request toward the 80% rule) or ignored (every
        # provider's payables would look filtered).
        raise ToolError(
            "provider_branch_office requiere provider_identification (Siigo exige enviar "
            "primero la identificación del proveedor, ej. provider_identification=1032492985 y "
            "provider_branch_office=1). No se consultó Siigo."
        )
    _check_range("due_date", due_date_start, due_date_end)
    return await _list(
        ctx,
        "/v1/accounts-payable",
        page,
        page_size,
        skip,
        due_date_start=due_date_start,
        due_date_end=due_date_end,
        provider_identification=provider_identification,
        provider_branch_office=provider_branch_office,
    )


Year = Annotated[int, Field(ge=1900, le=2100, description="Año del reporte (4 dígitos)")]
Month = Annotated[int, Field(ge=1, le=13, description="Mes 1-12 (13 = cierre del año)")]
Account = Annotated[
    str | None,
    Field(pattern=r"^\d{1,20}$", description="Cuenta contable PUC (solo dígitos), ej. 1105"),
]


def _report_body(
    year: int,
    month_start: int,
    month_end: int,
    account_start: str | None,
    account_end: str | None,
    includes_tax_difference: bool,
) -> dict[str, Any]:
    if month_start > month_end:
        raise ToolError(
            f"month_start ({month_start}) no puede ser mayor que month_end ({month_end})."
        )
    body: dict[str, Any] = {
        "year": year,
        "month_start": month_start,
        "month_end": month_end,
        "includes_tax_difference": includes_tax_difference,
    }
    if account_start:
        body["account_start"] = account_start
    if account_end:
        body["account_end"] = account_end
    return body


async def _report(ctx: Context, path: str, body: dict[str, Any]) -> dict[str, Any]:
    """POST of a read-only report: a failure never "may have executed" anything."""
    try:
        data = await _state(ctx).client.post(path, body)
    except (SiigoAPIError, SiigoNetworkError) as exc:
        exc.may_have_executed = False  # generating a report changes nothing: repeating is safe
        raise
    return _as_result(
        data, message="Reporte generado en Excel: ábrelo o descárgalo desde file_url."
    )


@siigo_tool("siigo_trial_balance_report", "Balance de prueba")
async def siigo_trial_balance_report(
    ctx: Context,
    year: Year,
    month_start: Month,
    month_end: Month,
    account_start: Account = None,
    account_end: Account = None,
    includes_tax_difference: Annotated[
        bool, Field(description="Incluir diferencias fiscales")
    ] = False,
) -> dict[str, Any]:
    """Genera el balance de prueba general de la empresa y devuelve el enlace al Excel.

    Úsala para saldos por cuenta contable (PUC) en un rango de meses. Devuelve file_id y file_url
    (Excel). Para el balance de un tercero específico usa siigo_trial_balance_by_third_party.
    """
    body = _report_body(
        year, month_start, month_end, account_start, account_end, includes_tax_difference
    )
    return await _report(ctx, "/v1/test-balance-report", body)


@siigo_tool("siigo_trial_balance_by_third_party", "Balance de prueba por tercero")
async def siigo_trial_balance_by_third_party(
    ctx: Context,
    year: Year,
    month_start: Month,
    month_end: Month,
    customer_identification: Annotated[
        Identification, Field(description="Identificación del tercero")
    ],
    customer_branch_office: BranchOffice = 0,
    account_start: Account = None,
    account_end: Account = None,
    includes_tax_difference: Annotated[
        bool, Field(description="Incluir diferencias fiscales")
    ] = False,
) -> dict[str, Any]:
    """Genera el balance de prueba por tercero (cliente o proveedor) y devuelve el enlace al Excel.

    Úsala para ver los movimientos y saldos contables de un tercero en un rango de meses.
    Devuelve file_id y file_url (Excel).
    """
    body = _report_body(
        year, month_start, month_end, account_start, account_end, includes_tax_difference
    )
    body["customer"] = {
        "identification": customer_identification,
        "branch_office": customer_branch_office,
    }
    return await _report(ctx, "/v1/test-balance-report-by-thirdparty", body)


# =========================================================================== tools: write


@siigo_tool(
    "siigo_create_customer",
    "Crear cliente / tercero",
    read_only=False,
    destructive=False,
    idempotent=False,
    write=True,
)
async def siigo_create_customer(
    ctx: Context,
    customer: Annotated[
        CustomerCreate, Field(description="Datos del tercero a crear (cliente o proveedor)")
    ],
    check_existing: Annotated[
        bool,
        Field(description="Buscar primero por identificación y no crear si ya existe"),
    ] = True,
) -> dict[str, Any]:
    """Crea un tercero (cliente, proveedor u otro) en Siigo.

    Úsala cuando el cliente no existe y se necesita para facturar. Por defecto primero lo busca
    por identificación y sucursal; si ya existe devuelve {"created": false, "customer": ...} sin
    crear nada. Requisitos: persona natural con name = ["Nombres", "Apellidos"] y empresa con
    name = ["Razón social"]; NIT sin dígito de verificación; códigos DANE de ciudad como texto
    (Bogotá: state_code "11", city_code "11001"); al menos un teléfono y un contacto (sin
    contactos la facturación falla con customer_settings).
    """
    state = _state(ctx)
    if check_existing:
        data = await state.client.get(
            "/v1/customers",
            {"identification": customer.identification, "branch_office": customer.branch_office},
        )
        for row in normalize_list(data)["results"]:
            if _matches_customer(row, customer.identification, customer.branch_office):
                return {
                    "created": False,
                    "message": "El tercero ya existe; no se creó uno nuevo.",
                    "customer": row,
                }
    created = await state.client.post("/v1/customers", to_body(customer))
    return {"created": True, "customer": created}


@siigo_tool(
    "siigo_create_invoice",
    "Crear factura de venta",
    read_only=False,
    destructive=False,
    idempotent=False,
    write=True,
)
async def siigo_create_invoice(
    ctx: Context,
    invoice: Annotated[
        InvoiceCreate,
        Field(
            description=(
                "Factura de venta. stamp.send=true la envía a la DIAN (irreversible); "
                "por defecto queda como borrador"
            )
        ),
    ],
    idempotency_key: Annotated[
        str,
        Field(
            pattern=r"^[A-Za-z0-9]{1,30}$",
            description=(
                "Obligatoria. Clave de idempotencia de ESTA venta: 1 a 30 letras o dígitos, sin "
                "guiones ni espacios. Genera una NUEVA y única por cada venta, p. ej. fecha + "
                "identificación del cliente + algo aleatorio (20261005x13832081x7Kq2). REUTILIZA "
                "LA MISMA si repites esta venta tras cualquier error, tiempo de espera, "
                "cancelación, interrupción o falta de respuesta: Siigo devuelve la factura ya "
                "creada con esa clave en vez de duplicarla. Nunca uses la clave de otra venta"
            ),
        ),
    ],
    skip_preflight: Annotated[
        bool,
        Field(description="Omitir la validación local previa (no recomendado)"),
    ] = False,
    check_customer: Annotated[
        bool,
        Field(description="En la validación previa, verificar que el cliente exista (1 solicitud)"),
    ] = True,
) -> dict[str, Any]:
    """Crea una factura de venta (FV) en Siigo.

    ADVERTENCIA: invoice.stamp.send=true ENVÍA LA FACTURA ELECTRÓNICA A LA DIAN, un acto legal
    e IRREVERSIBLE. Por defecto es false y la factura queda como borrador (stamp.status=Draft).
    Úsalo solo si el usuario lo confirma explícitamente.
    Antes de usarla obtén: document.id (siigo_list_document_types type=FV), seller
    (siigo_list_users), payments[].id (siigo_list_payment_types FV), impuestos
    (siigo_list_taxes) y códigos de producto (siigo_list_products); el cliente debe existir.
    Antes de enviar valida localmente (los errores cuentan para el bloqueo del 80%): tipo de
    comprobante, numeración, centro de costo, vendedor por ítem, fecha, formas de pago,
    impuestos, que el cliente exista y, solo en facturas simples (price sin IVA incluido,
    impuestos IVA o Impoconsumo, sin retenciones, anticipo ni moneda extranjera), que los
    pagos sumen el total; en los demás casos esa suma la valida Siigo (preflight.warnings).
    IDEMPOTENCIA: idempotency_key es obligatoria, NUEVA y única por cada venta; REUTILIZA LA
    MISMA en cualquier reintento de esa venta. Con una clave ya usada Siigo devuelve la
    factura que creó con ella TAL COMO ESTÁ: cambiar los datos (p. ej. corregir un precio) no
    la modifica ni crea otra.
    Devuelve replayed, la factura, idempotency_key, dian_send_requested (lo pedido en
    stamp.send) y dian_status/dian_note (lo que Siigo informa: Draft = no enviada a la DIAN).
    replayed=true: Siigo devolvió una factura que ya existía con esa clave; esta llamada no
    creó ninguna (lee `warning`; `differences` dice qué no coincide con lo pedido entre:
    cliente, sucursal, tipo, fecha enviada, códigos y cantidades de ítems y suma de pagos).
    Otros cambios (vendedor, observaciones...) no se detectan: revisa la factura devuelta.
    replayed=false: es nueva o la creó un intento anterior de esta venta hace menos de
    2 minutos. replayed=null: no se pudo determinar.
    """
    state = _state(ctx)
    key = idempotency_key
    body = to_body(invoice)
    preflight: dict[str, Any] = {"skipped": True}
    if not skip_preflight:
        report = await preflight_invoice(
            invoice, catalogs=state.catalogs, check_customer=check_customer
        )
        if report.problems:
            problems = "\n".join(f"- {p}" for p in report.problems)
            advice = (
                "Corrígelos y vuelve a intentar (skip_preflight=true solo si estás seguro de que "
                "Siigo la aceptará)."
            )
            if report.past_date:
                # The same call on a later day: the attempt that got no answer may have created it.
                advice = (
                    "Si esta llamada repite un intento anterior de esta misma venta que falló o "
                    "quedó sin respuesta, esa factura pudo haberse creado ya con esa fecha: para "
                    "obtenerla sin duplicarla, repite la llamada sin cambiar nada (tampoco la "
                    f"fecha), con la MISMA idempotency_key='{key}' y skip_preflight=true; Siigo "
                    "devolverá la factura creada con esa clave. Si es una venta nueva, corrígelos "
                    "y vuelve a intentar."
                )
            raise ToolError(
                "La factura NO se envió a Siigo: la validación local encontró problemas:\n"
                f"{problems}\n{advice}"
            )
        preflight = report.as_dict()
    # Logged before sending (whatever SIIGO_LOG_LEVEL is): if the answer never arrives,
    # stderr still has the key.
    audit_log.info("siigo_create_invoice: POST /v1/invoices con Idempotency-Key=%s", key)
    info: dict[str, Any] = {}
    started = utc_now()
    try:
        created = await state.client.post(
            "/v1/invoices", body, idempotency_key=key, response_info=info
        )
    except SiigoNetworkError as exc:
        note = _invoice_error_note(key, exc.may_have_executed, retryable=True)
        raise ToolError(format_network_error(exc, execution_note=False) + note) from exc
    except SiigoAPIError as exc:
        # A 2xx from POST /auth is not an answer to the invoice: it was not sent, or Siigo
        # rejected it (401) before the renewal of the token failed.
        note = _invoice_error_note(
            key,
            exc.may_have_executed,
            status=0 if exc.during_auth else exc.status,
            retryable=exc.during_auth or exc.status == 429 or "requests_limit" in exc.codes,
        )
        raise ToolError(format_api_error(exc, execution_note=False) + note) from exc
    if not isinstance(created, dict) or not created.get("id"):
        # A 2xx without the invoice (empty, 204, not an object): like an unreadable 2xx.
        raise ToolError(
            "La respuesta de Siigo a POST /v1/invoices no trae la factura (falta su id)."
            + _invoice_error_note(key, True, status=info.get("status", 0))
        )
    answer = created
    compared = dict(body)
    if "date" not in invoice.model_fields_set:
        del compared["date"]  # the default ("today") changes at midnight: not the caller's data
    mismatched = differences(answer, compared)
    replayed, reason = check_replay(
        answer,
        earlier_id=state.invoice_answers.get(key),
        reference=call_reference(started, info),
    )
    if mismatched:
        replayed = True  # a new invoice would carry the requested data
    state.invoice_answers.add(key, answer.get("id"))
    stamp = answer.get("stamp") if isinstance(answer.get("stamp"), dict) else {}
    status = stamp.get("status")
    dian_note = _dian_note(invoice.stamp.send, status, stamp.get("cufe"), replayed=replayed)
    out: dict[str, Any] = {"replayed": replayed}
    name = answer.get("name") or answer["id"]
    if mismatched:
        detail = "; ".join(
            f"{d['field']}: pedido {d['requested']}, devuelto {d['returned']}" for d in mismatched
        )
        out["warning"] = (
            f"ATENCIÓN: esta llamada NO creó ni modificó ninguna factura. Siigo devolvió la "
            f"factura {name}, creada antes con la idempotency_key '{key}' y con datos DISTINTOS "
            f"de los pedidos ({detail}): sigue existiendo así. {_OLD_INVOICE_ADVICE}"
        )
        out["differences"] = mismatched
    elif replayed:
        out["warning"] = (
            f"ATENCIÓN: esta llamada NO creó una factura nueva. Siigo devolvió la factura {name}, "
            f"creada antes con la misma idempotency_key '{key}' ({reason}). Si esta llamada "
            "repetía esta misma venta con los mismos datos, esa es su factura: no hay que hacer "
            "nada más. Si no corresponde a lo pedido, sigue existiendo tal cual. "
            + _OLD_INVOICE_ADVICE
        )
    else:
        out["replay_note"] = (
            "La creó esta llamada o un intento anterior de esta misma venta de hace menos de "
            f"2 minutos ({reason})."
            if replayed is False
            else f"No se pudo determinar si la creó esta llamada o un intento anterior con la "
            f"misma clave ({reason}); en cualquier caso hay una sola factura para esta clave."
        )
    if replayed:
        dian_note = "Factura que ya existía (no la creó esta llamada). " + dian_note
    out.update(
        idempotency_key=key,
        # What was asked for, never presented as what happened: Siigo's stamp.status says that.
        dian_send_requested=invoice.stamp.send,
        dian_status=status,
        dian_note=dian_note,
        summary={
            "id": answer.get("id"),
            "name": answer.get("name"),
            "date": answer.get("date"),
            "total": answer.get("total"),
            "balance": answer.get("balance"),
            "stamp_status": status,
            "cufe": stamp.get("cufe"),
            "public_url": answer.get("public_url"),
        },
        preflight=preflight,
        invoice=answer,
    )
    return out


# What to do with an invoice Siigo returned for a reused key that does not match the request.
_OLD_INVOICE_ADVICE = (
    "Muéstrasela al usuario. Si es de un intento anterior de esta misma venta (p. ej. "
    "interrumpido antes de corregir los datos), con su confirmación elimínala con "
    "siigo_delete_invoice si es borrador (stamp.status=Draft) o, si no, anúlala "
    "(siigo_annul_invoice) o revísala con una nota crédito; solo después crea la factura "
    "corregida con una idempotency_key nueva. Si es de otra venta, crea esta con una "
    "idempotency_key nueva."
)


def _dian_note(requested: bool, status: Any, cufe: Any, *, replayed: bool | None) -> str:
    """Plain statement of the DIAN outcome, based only on what Siigo answered."""
    text = str(status or "").strip()
    low = text.lower()
    if low == "accepted":
        return "Siigo informa que la DIAN aceptó la factura (stamp.status=Accepted)."
    if low == "rejected":
        return (
            "Siigo informa que la DIAN rechazó la factura (stamp.status=Rejected); consulta los "
            "motivos con siigo_get_invoice_dian_errors."
        )
    if low == "draft" or (not text and not cufe):
        shown = f"stamp.status={text}" if text else "sin stamp.status ni CUFE"
        if requested:
            why = (
                "esta llamada no envió nada: la factura ya existía con esta clave"
                if replayed
                else "por ejemplo, porque el tipo de comprobante no es electrónico o porque "
                "Siigo devolvió una factura creada antes con esta clave"
            )
            return (
                f"Se pidió stamp.send=true, pero Siigo respondió {shown}: la factura NO consta "
                f"como enviada a la DIAN ({why}). No le digas al usuario que se emitió ante la "
                "DIAN; verifica con siigo_get_invoice."
            )
        return f"Borrador: no se envió a la DIAN (stamp.send=false; {shown})."
    return (
        f"Siigo informa stamp.status={text or '(vacío)'}"
        + (" con CUFE" if cufe else "")
        + "; confirma el estado final ante la DIAN con siigo_get_invoice."
    )


def _invoice_error_note(
    key: str, may_have_executed: bool, *, status: int = 0, retryable: bool = False
) -> str:
    """The key whenever the invoice may exist or the call may be repeated as it is."""
    same_key = (
        f"repite la llamada con la MISMA idempotency_key='{key}': si Siigo ya la creó, "
        "devolverá esa factura en vez de duplicarla (no uses una clave nueva para esta venta)."
    )
    if 200 <= status < 300:
        return (
            f"\nSiigo respondió {status}: la factura probablemente SÍ se creó. Para verla, "
            + same_key
        )
    if may_have_executed:
        return f"\nLa factura pudo haberse creado. Para saberlo sin duplicarla, {same_key}"
    if retryable:
        return f"\nLa factura no se creó. Al reintentar usa la misma idempotency_key='{key}'."
    return ""


@siigo_tool(
    "siigo_send_invoice_email",
    "Enviar factura por correo",
    read_only=False,
    destructive=False,
    idempotent=False,
    write=True,
)
async def siigo_send_invoice_email(
    ctx: Context,
    invoice_id: Guid,
    mail_to: Annotated[
        str, Field(max_length=100, pattern=EMAIL_PATTERN, description="Correo del destinatario")
    ],
    copy_to: Annotated[
        list[Annotated[str, Field(max_length=100, pattern=EMAIL_PATTERN)]] | None,
        Field(max_length=4, description="Hasta 4 correos en copia (máximo 5 en total)"),
    ] = None,
) -> dict[str, Any]:
    """Envía por correo electrónico una factura de venta existente al cliente.

    Úsala cuando el usuario pida reenviar o enviar la factura por email. Cada llamada envía un
    correo real (no es idempotente). Máximo 5 direcciones en total (mail_to + copy_to).
    """
    body: dict[str, Any] = {"mail_to": mail_to}
    if copy_to:
        body["copy_to"] = ";".join(copy_to)
    data = await _state(ctx).client.post(f"/v1/invoices/{invoice_id}/mail", body)
    return _as_result(data, invoice_id=invoice_id)


@siigo_tool(
    "siigo_annul_invoice",
    "Anular factura de venta",
    read_only=False,
    destructive=True,
    idempotent=True,
    write=True,
)
async def siigo_annul_invoice(ctx: Context, invoice_id: Guid) -> dict[str, Any]:
    """ANULA una factura de venta en Siigo (POST /v1/invoices/{id}/annul). Destructivo.

    Úsala solo con confirmación explícita del usuario. Siigo no documenta con precisión cuándo
    corresponde anular y cuándo eliminar: en general, anular conserva el documento marcado como
    anulado, mientras que eliminar (siigo_delete_invoice) lo borra. Una factura electrónica ya
    aceptada por la DIAN normalmente se revierte con una nota crédito, no con esta herramienta.
    """
    data = await _state(ctx).client.post(f"/v1/invoices/{invoice_id}/annul")
    return _as_result(data, invoice_id=invoice_id)


@siigo_tool(
    "siigo_delete_invoice",
    "Eliminar factura de venta",
    read_only=False,
    destructive=True,
    idempotent=True,
    write=True,
)
async def siigo_delete_invoice(ctx: Context, invoice_id: Guid) -> dict[str, Any]:
    """ELIMINA una factura de venta de Siigo (DELETE /v1/invoices/{id}). Destructivo e irreversible.

    Úsala solo con confirmación explícita del usuario y, en general, para borradores (facturas
    no enviadas a la DIAN). Siigo no documenta con precisión cuándo eliminar y cuándo anular
    (siigo_annul_invoice); si Siigo responde delete_not_allowed, considera anular o emitir una
    nota crédito.
    """
    data = await _state(ctx).client.delete(f"/v1/invoices/{invoice_id}")
    return _as_result(data, invoice_id=invoice_id)


# =========================================================================== factory


def _no_http(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("cliente HTTP no inicializado", request=request)


_NO_HTTP = httpx.MockTransport(_no_http)


def create_server(
    settings: Settings | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    *,
    sleep: SleepFn | None = None,
    clock: ClockFn | None = None,
) -> MCPServer:
    """Build an MCP server. Write tools are registered only if ``settings.enable_write``."""
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(server: MCPServer) -> AsyncIterator[AppState]:
        timeout = httpx.Timeout(settings.timeout_seconds, connect=CONNECT_TIMEOUT)
        state_settings = settings
        # httpx honours proxy/CA variables only when it builds its own transport.
        env_vars = tuple(http_env_vars()) if transport is None else ()
        try:
            # Reads ALL_PROXY/HTTPS_PROXY/HTTP_PROXY/SSL_CERT_FILE/SSL_CERT_DIR (and the
            # system proxy settings) right here: an unsupported proxy scheme or a bad CA file
            # raises. Spec A.5: the server must start anyway and the tools report it.
            http = httpx.AsyncClient(
                base_url=settings.base_url,
                timeout=timeout,
                transport=transport,
                headers={"User-Agent": f"siigo-mcp/{__version__}"},
            )
        except Exception as exc:
            problem = http_init_problem(exc)
            log.error("Las herramientas responderán con error: %s", problem)
            state_settings = replace(settings, env_problems=(*settings.env_problems, problem))
            # Never used: every request first fails the configuration check.
            http = httpx.AsyncClient(base_url=settings.base_url, transport=_NO_HTTP)
        async with http:
            client = SiigoClient(state_settings, http, sleep=sleep, clock=clock, env_vars=env_vars)
            yield AppState(
                settings=state_settings,
                client=client,
                catalogs=CatalogCache(client, clock=clock),
                invoice_answers=AnsweredKeys(),
            )

    return MCPServer(
        SERVER_NAME,
        title="Siigo Nube",
        version=__version__,
        instructions=INSTRUCTIONS,
        log_level=cast(Any, settings.log_level),
        lifespan=lifespan,
        tools=[_build_tool(s) for s in TOOL_SPECS if settings.enable_write or not s.write],
    )


def _build_tool(spec: ToolSpec) -> Tool:
    """Register a tool whose arguments are strict.

    The SDK's argument model ignores unknown keys, so a misspelled filter
    (``identificacion``) would return unfiltered data that looks filtered, and a misspelled
    ``idempotencyKey`` would silently get a new key. Unknown keys are rejected instead, and
    the published inputSchema says so (``additionalProperties: false``).
    """
    tool = Tool.from_function(
        spec.fn,
        name=spec.name,
        title=spec.title,
        # Without the docstring's indentation, whatever the Python version (3.13+ strips it).
        description=inspect.cleandoc(spec.fn.__doc__ or ""),
        annotations=spec.annotations,
    )
    loose = tool.fn_metadata.arg_model
    strict = type(
        loose.__name__,
        (loose,),
        {"__module__": loose.__module__, "model_config": ConfigDict(extra="forbid")},
    )
    tool.fn_metadata.arg_model = strict
    tool.parameters = strict.model_json_schema(by_alias=True)
    return tool


mcp = create_server()

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


class RedactingFormatter(logging.Formatter):
    """Masks the access key and tokens anywhere in a log line, tracebacks included."""

    def format(self, record: logging.LogRecord) -> str:
        return redact_secrets(super().format(record))


def configure_logging(settings: Settings) -> None:
    """Send every log record to stderr (stdout carries the JSON-RPC stream)."""
    register_secret(settings.access_key)
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(RedactingFormatter(LOG_FORMAT))
    logging.basicConfig(level=settings.log_level, handlers=[handler], force=True)
    # httpx logs every URL at INFO (query strings may carry customer identifications).
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(
        logging.DEBUG if settings.log_level == "DEBUG" else logging.WARNING
    )


def _exit_on_sigint(signum: int, frame: Any) -> None:
    """Ctrl+C in a terminal: stop at once, without a traceback.

    The stdio transport reads stdin in a worker thread that cannot be interrupted, so the
    default handling needs several Ctrl+C presses and prints KeyboardInterrupt tracebacks.
    """
    log.info("siigo-mcp detenido (Ctrl+C)")
    for stream in (sys.stdout, sys.stderr):
        with contextlib.suppress(Exception):
            stream.flush()
    os._exit(0)


def main() -> None:
    """Entry point of the ``siigo-mcp`` command: stdio transport, logs to stderr."""
    settings = Settings.from_env()
    configure_logging(settings)
    log.info(
        "siigo-mcp %s iniciando (stdio): base_url=%s, escritura=%s, límite=%d/min",
        __version__,
        settings.base_url,
        "habilitada" if settings.enable_write else "deshabilitada",
        settings.rate_limit_per_minute,
    )
    problems = settings.config_problems()
    if problems:
        log.warning(
            "Configuración incompleta; las herramientas responderán con error: %s",
            "; ".join(problems),
        )
    try:
        previous = signal.signal(signal.SIGINT, _exit_on_sigint)
    except ValueError:  # not the main thread (embedded use): keep the default handling
        previous = None
    try:
        mcp.run()
    finally:
        if previous is not None:
            signal.signal(signal.SIGINT, previous)


if __name__ == "__main__":
    main()
