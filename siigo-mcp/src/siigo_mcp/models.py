"""Pydantic payload models for the write tools (spec D.1-D.3).

Rules verified against mcp 2.3 / pydantic 2.x:
- amounts are ``float`` (a ``Decimal`` would be serialised as a JSON string);
- the invoice field ``date`` is typed ``dt.date`` (a bare ``date`` would clash);
- bodies are serialised with ``exclude_none=True`` so optional fields are never ``null``;
- ``extra="forbid"`` makes unknown keys a validation error.
"""

from __future__ import annotations

import datetime as dt
import re
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

# Colombia is UTC-5 with no DST. A fixed offset avoids needing tzdata on Windows.
BOGOTA = dt.timezone(dt.timedelta(hours=-5), "America/Bogota")


def today_bogota() -> dt.date:
    return dt.datetime.now(BOGOTA).date()


def _max_decimals(n: int) -> AfterValidator:
    def check(v: float) -> float:
        exponent = Decimal(str(v)).as_tuple().exponent
        if isinstance(exponent, int) and exponent < -n:
            raise ValueError(f"máximo {n} decimales")
        return v

    return AfterValidator(check)


Money2 = Annotated[float, Field(ge=0), _max_decimals(2)]
Qty2 = Annotated[float, Field(gt=0), _max_decimals(2)]
Price6 = Annotated[float, Field(gt=0), _max_decimals(6)]
Digits10 = Annotated[str, Field(pattern=r"^\d{1,10}$")]
IdType = Literal[
    "13", "31", "22", "42", "50", "R-00-PN", "91", "41", "47", "11", "43", "21", "12", "89", "48"
]  # fmt: skip
EMAIL_PATTERN = r"^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$"


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# --------------------------------------------------------------------------- customer


class Phone(_M):
    indicative: Digits10 | None = Field(None, description="Indicativo, solo dígitos (ej. 57)")
    number: Digits10 | None = Field(None, description="Número, solo dígitos (máx. 10)")
    extension: Digits10 | None = Field(None, description="Extensión, solo dígitos")


class City(_M):
    country_code: str = Field(
        "Co", pattern=r"^[A-Za-z]{2,3}$", description='Código de país, ej. "Co" para Colombia'
    )
    state_code: str = Field(
        pattern=r"^[A-Za-z0-9]{1,10}$",
        description='Código DANE del departamento COMO TEXTO, ej. "11" Bogotá, "05" Antioquia',
    )
    city_code: str = Field(
        pattern=r"^[A-Za-z0-9]{1,10}$",
        description='Código DANE del municipio COMO TEXTO, ej. "11001" Bogotá, "05001" Medellín',
    )


class Address(_M):
    address: str = Field(min_length=1, max_length=256, description="Dirección (máx. 256)")
    city: City
    postal_code: str | None = Field(
        None, pattern=r"^[A-Za-z0-9]{1,10}$", description="Código postal (opcional)"
    )


class Contact(_M):
    first_name: str = Field(min_length=1, max_length=50, description="Nombres del contacto")
    last_name: str | None = Field(None, max_length=50, description="Apellidos del contacto")
    email: str | None = Field(
        None, max_length=100, pattern=EMAIL_PATTERN, description="Correo (recibe facturas)"
    )
    phone: Phone | None = None


class FiscalResponsibility(_M):
    code: Literal["R-99-PN", "O-13", "O-15", "O-23", "O-47"] = Field(
        description=(
            "R-99-PN no aplica (persona natural sin responsabilidades), O-13 gran contribuyente, "
            "O-15 autorretenedor, O-23 agente de retención IVA, O-47 régimen simple"
        )
    )


class RelatedUsers(_M):
    seller_id: int | None = Field(None, description="ID de vendedor (siigo_list_users)")
    collector_id: int | None = Field(None, description="ID de cobrador (siigo_list_users)")


class CustomerCreate(_M):
    """Tercero (cliente/proveedor) para POST /v1/customers."""

    type: Literal["Customer", "Supplier", "Other"] = Field(
        "Customer", description="Customer=cliente, Supplier=proveedor, Other=otro"
    )
    person_type: Literal["Person", "Company"] = Field(
        description="Person=persona natural, Company=persona jurídica (empresa)"
    )
    id_type: IdType = Field(
        description=(
            "Tipo de identificación: 13 cédula de ciudadanía, 31 NIT, 22 cédula de extranjería, "
            "41 pasaporte, 12 tarjeta de identidad, 11 registro civil, 42 documento extranjero, "
            "50 NIT de otro país, 47 PEP, 48 PPT, 91 NUIP, 21 tarjeta de extranjería, "
            "43 sin identificación del exterior, 89 salvoconducto, R-00-PN no obligado"
        )
    )
    identification: str = Field(
        description=(
            "Número de identificación sin puntos ni guiones. NIT SIN dígito de verificación. "
            "Tipos 13, 31 y 11: 3 a 13 dígitos; otros: 1 a 20 letras o dígitos"
        )
    )
    check_digit: str | None = Field(
        None, pattern=r"^\d$", description="Dígito de verificación del NIT (Siigo lo calcula)"
    )
    name: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        min_length=1,
        max_length=2,
        description=(
            'Persona natural: ["Nombres", "Apellidos"] (2 elementos). '
            'Empresa: ["Razón social"] (1 elemento)'
        ),
    )
    commercial_name: str | None = Field(None, description="Nombre comercial")
    branch_office: int = Field(0, ge=0, le=999, description="Sucursal (0 por defecto)")
    active: bool = True
    vat_responsible: bool = Field(False, description="Responsable de IVA")
    fiscal_responsibilities: list[FiscalResponsibility] = Field(
        default_factory=lambda: [FiscalResponsibility(code="R-99-PN")],
        min_length=1,
        description="Responsabilidades fiscales (por defecto R-99-PN)",
    )
    address: Address
    phones: list[Phone] = Field(min_length=1, description="Al menos un teléfono")
    contacts: list[Contact] = Field(
        min_length=1,
        max_length=10,
        description="Al menos un contacto (sin contactos, la facturación falla)",
    )
    comments: str | None = Field(None, max_length=4000)
    related_users: RelatedUsers | None = None

    @model_validator(mode="after")
    def _rules(self) -> CustomerCreate:
        need = 2 if self.person_type == "Person" else 1
        if len(self.name) != need:
            raise ValueError(
                f"name debe tener {need} elemento(s) para person_type={self.person_type}: "
                + ('["Nombres", "Apellidos"]' if need == 2 else '["Razón social"]')
            )
        if self.id_type in {"13", "31", "11"}:
            pattern, rule = r"\d{3,13}", "3 a 13 dígitos (NIT sin dígito de verificación)"
        else:
            pattern, rule = r"[A-Za-z0-9]{1,20}", "1 a 20 letras o dígitos"
        if not re.fullmatch(pattern, self.identification):
            raise ValueError(
                f"identification inválida para id_type={self.id_type}: debe tener {rule}, "
                "sin puntos, guiones ni espacios"
            )
        return self


# --------------------------------------------------------------------------- invoice


class Ref(_M):
    id: int = Field(ge=1)


class CustomerRef(_M):
    identification: str = Field(
        min_length=1,
        max_length=20,
        pattern=r"^[A-Za-z0-9]+$",
        description="Identificación del cliente (debe existir y estar activo en Siigo)",
    )
    branch_office: int = Field(0, ge=0, le=999)


class InvoiceItem(_M):
    code: str = Field(
        min_length=1,
        pattern=r"^[^'\s]+$",
        description="Código de un producto existente y activo (siigo_list_products)",
    )
    description: str | None = Field(None, description="Descripción del ítem (opcional)")
    quantity: Qty2 = Field(description="Cantidad > 0, máx. 2 decimales")
    price: Price6 | None = Field(
        None, description="Precio unitario SIN IVA (máx. 6 decimales). Envía price O taxed_price"
    )
    taxed_price: Price6 | None = Field(
        None, description="Precio unitario CON IVA incluido. Envía price O taxed_price"
    )
    discount: Money2 | None = Field(
        None,
        description="Descuento: valor o porcentaje según discount_type del tipo de documento",
    )
    taxes: list[Ref] = Field(
        default_factory=list,
        max_length=3,
        description="Impuestos del ítem [{id}] (siigo_list_taxes); nunca ReteIVA/ReteICA aquí",
    )
    warehouse: int | None = Field(None, description="ID de bodega (siigo_list_warehouses)")
    seller: int | None = Field(None, description="Vendedor del ítem si el tipo lo exige")

    @model_validator(mode="after")
    def _one_price(self) -> InvoiceItem:
        if (self.price is None) == (self.taxed_price is None):
            raise ValueError("envía exactamente uno de price o taxed_price")
        if len({t.id for t in self.taxes}) != len(self.taxes):
            raise ValueError("impuesto repetido en el ítem")
        return self


class Payment(_M):
    id: int = Field(ge=1, description="ID de forma de pago (siigo_list_payment_types FV)")
    value: Money2 = Field(description="Valor, máx. 2 decimales; la suma debe igualar el total")
    due_date: dt.date | None = Field(
        None,
        description="Fecha de vencimiento yyyy-MM-dd (obligatoria si la forma de pago la pide)",
    )


class SendFlag(_M):
    send: bool = False


class Currency(_M):
    code: str = Field(pattern=r"^[A-Z]{3}$", description="Moneda ISO 4217, ej. USD")
    exchange_rate: float = Field(gt=0, description="Tasa de cambio")


class InvoiceCreate(_M):
    """Factura de venta para POST /v1/invoices."""

    document: Ref = Field(description="Tipo de comprobante {id} (siigo_list_document_types FV)")
    date: dt.date = Field(
        default_factory=today_bogota,
        description="Fecha yyyy-MM-dd; por defecto hoy en Colombia. Electrónica: no anterior a hoy",
    )
    number: int | None = Field(
        None, ge=1, description="Consecutivo; SOLO si el tipo tiene automatic_number=false"
    )
    customer: CustomerRef
    seller: int = Field(ge=1, description="ID del vendedor (siigo_list_users)")
    cost_center: int | None = Field(None, description="Centro de costo si el tipo lo exige")
    currency: Currency | None = None
    observations: str | None = Field(None, max_length=4000)
    retentions: list[Ref] | None = Field(
        None, description="Retenciones a nivel factura [{id}]: ReteICA, ReteIVA, Autorretención"
    )
    advance_payment: Money2 | None = Field(None, description="Anticipo, máx. 2 decimales")
    items: list[InvoiceItem] = Field(min_length=1, max_length=500)
    payments: list[Payment] = Field(min_length=1)
    stamp: SendFlag = Field(
        default_factory=SendFlag,
        description=(
            "stamp.send=true ENVÍA LA FACTURA A LA DIAN (acto legal e irreversible). "
            "Por defecto false (queda como borrador)"
        ),
    )
    mail: SendFlag = Field(
        default_factory=SendFlag, description="mail.send=true envía el correo al cliente"
    )
    additional_fields: dict[str, Any] | None = Field(
        None, description="Campos adicionales, ej. {purchase_order: {prefix, number}}"
    )


def to_body(model: BaseModel) -> dict[str, Any]:
    """Serialise a model to a Siigo JSON body (no ``null`` fields)."""
    return model.model_dump(mode="json", exclude_none=True)
