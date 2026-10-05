# siigo-mcp

Servidor [MCP](https://modelcontextprotocol.io) para la API de **Siigo Nube (Colombia)**. Permite
que Claude (Claude Code o Claude Desktop) consulte y, si lo habilitas, cree información contable
en tu empresa de Siigo: terceros/clientes, productos, facturas de venta (con PDF y XML), notas
crédito, recibos de caja, recibos de pago, comprobantes contables, cotizaciones, catálogos,
cuentas por pagar y balance de prueba.

- Escrito en Python con el SDK oficial `mcp` 2.x (`MCPServer`), transporte **stdio**.
- **Solo lectura por defecto.** Las herramientas que crean, envían, anulan o eliminan solo
  existen si defines `SIIGO_ENABLE_WRITE=true`; si no, Claude ni siquiera las ve.
- Cuida los límites de Siigo: espaciado de solicitudes, reintentos acotados, caché de catálogos
  y validación local antes de crear facturas (cada error cuenta para el bloqueo del 80%).

> No es un producto oficial de Siigo S.A.S.

## Requisitos

- Python 3.10 o superior (lo gestiona `uv`).
- [uv](https://docs.astral.sh/uv/) instalado:
  - macOS/Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
  - Windows (PowerShell): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
    (sin `-ExecutionPolicy ByPass` el instalador se detiene en equipos con la política
    `Restricted`, la predeterminada en Windows 10/11), o bien `winget install --id=astral-sh.uv -e`.
- Una empresa en **Siigo Nube** con un **usuario API** y su **access key**.
- Un **Partner-Id** (nombre de tu integración).

## Obtener las credenciales

| Dato | Variable | Dónde se obtiene |
|---|---|---|
| Usuario API | `SIIGO_USERNAME` | En Siigo Nube: menú **Alianzas → Mi Credencial API**. Es un correo electrónico. |
| Access key | `SIIGO_ACCESS_KEY` | En la misma pantalla, junto al usuario API. Trátala como una contraseña. |
| Partner-Id | `SIIGO_PARTNER_ID` | Lo eliges tú: el nombre de tu aplicación o empresa, de **3 a 100 letras o dígitos, sin espacios, guiones ni caracteres especiales** (ej. `MiEmpresaMCP`). Usa siempre el mismo valor. |

- **Ambiente de pruebas (sandbox):** se solicita a soporte de Siigo indicando el NIT de la
  empresa. La empresa de pruebas solo admite **10 solicitudes por minuto**: configura
  `SIIGO_RATE_LIMIT_PER_MINUTE=10`.
- Siigo vigila el Partner-Id y puede exigir que esté asociado a una aplicación registrada; si el
  formato es válido y aun así recibes `invalid_partner_id`, contacta a soporte de Siigo.

## Instalación con uv

```bash
cd /home/user/proyects/siigo-mcp
uv sync                 # crea .venv e instala las dependencias exactas de uv.lock
uv run pytest -q        # opcional: ejecuta las pruebas (no se conectan a Siigo)
```

El comando del servidor es `uv run --directory /home/user/proyects/siigo-mcp siigo-mcp`.
Usa siempre la **ruta absoluta** de la carpeta del proyecto.

## Registro en Claude Code

El nombre del servidor va **justo después de `add`** y **antes** de los `-e`; el comando del
servidor va después de `--`:

```bash
claude mcp add siigo_mcp \
  -e SIIGO_USERNAME=usuario@empresa.com \
  -e SIIGO_ACCESS_KEY=xxxxxxxx \
  -e SIIGO_PARTNER_ID=MiEmpresaMCP \
  -e SIIGO_RATE_LIMIT_PER_MINUTE=10 \
  -- uv run --directory /home/user/proyects/siigo-mcp siigo-mcp
```

- `-e` acepta varios valores: si pones `-e` antes del nombre (`claude mcp add -e A=1 siigo_mcp ...`)
  falla con *Invalid environment variable format*.
- Alcance: usa `-s local` (por defecto) o `-s user`, que guardan la configuración fuera del
  repositorio. **Evita `-s project`**: escribe `.mcp.json` con tus credenciales en texto plano
  en la carpeta desde donde ejecutas `claude` (normalmente la raíz del repositorio). Solo
  `siigo-mcp/.gitignore` ignora `.mcp.json`, y únicamente dentro de `siigo-mcp/`: un `.mcp.json`
  en la raíz del repositorio **NO** está ignorado y un `git add` lo subiría con tu access key. Si
  necesitas alcance de proyecto, agrega `.mcp.json` al `.gitignore` de la raíz o usa la variante
  con `--env-file` de abajo, que no guarda secretos en `.mcp.json`.
- Para habilitar escritura agrega `-e SIIGO_ENABLE_WRITE=true` al registrarlo. Si el servidor ya
  está registrado, `claude mcp add` responde *already exists*: quítalo y regístralo de nuevo
  (ver [Habilitar escritura](#habilitar-escritura)).
- Comandos útiles: `claude mcp list`, `claude mcp get siigo_mcp`,
  `claude mcp remove siigo_mcp -s local`. Dentro de una sesión, `/mcp` muestra el estado.

Alternativa sin guardar secretos en la configuración de Claude: copia `.env.example` como `.env`,
complétalo y registra el servidor así:

```bash
claude mcp add siigo_mcp -- uv run --directory /home/user/proyects/siigo-mcp \
  --env-file /home/user/proyects/siigo-mcp/.env siigo-mcp
```

## Registro en Claude Desktop

Edita `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "siigo_mcp": {
      "command": "/RUTA/ABSOLUTA/A/uv",
      "args": ["run", "--directory", "/RUTA/ABSOLUTA/A/siigo-mcp", "siigo-mcp"],
      "env": {
        "SIIGO_USERNAME": "usuario@empresa.com",
        "SIIGO_ACCESS_KEY": "xxxxxxxx",
        "SIIGO_PARTNER_ID": "MiEmpresaMCP",
        "SIIGO_RATE_LIMIT_PER_MINUTE": "10"
      }
    }
  }
}
```

- Usa la ruta **absoluta** de `uv` (`which uv` en macOS/Linux, `where uv` en Windows): las apps
  de escritorio no siempre heredan el `PATH` de tu terminal.
- En Windows escapa las barras invertidas (`"C:\\Users\\yo\\siigo-mcp"`) o usa `/`.
- Todos los valores de `env` deben ser texto (entre comillas).
- **Cierra Claude Desktop por completo y vuelve a abrirlo** después de editar el archivo.

## Variables de entorno

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|---|---|---|
| `SIIGO_USERNAME` | sí | — | Correo del usuario API. |
| `SIIGO_ACCESS_KEY` | sí | — | Access key del usuario API. Secreta: nunca se registra en logs ni en mensajes de error. |
| `SIIGO_PARTNER_ID` | sí | — | 3 a 100 letras o dígitos, sin espacios ni guiones. |
| `SIIGO_BASE_URL` | no | `https://api.siigo.com` | URL base (sin `/v1`). Debe ser `https://`; `http://` solo se acepta para `localhost` (pruebas). |
| `SIIGO_RATE_LIMIT_PER_MINUTE` | no | `100` | Solicitudes por minuto; usa `10` con la empresa de pruebas. |
| `SIIGO_TIMEOUT_SECONDS` | no | `120` | Tiempo máximo de espera por solicitud (Siigo recomienda 120 s o más). |
| `SIIGO_DOWNLOAD_DIR` | no | `~/Downloads/siigo` | Carpeta donde se guardan los PDF y XML. Si no hay carpeta personal, se usa `siigo-downloads/` dentro del proyecto (ignorada por git). |
| `SIIGO_LOG_LEVEL` | no | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` o `CRITICAL`. Los logs van a stderr. La línea con la `Idempotency-Key` de cada factura enviada se escribe siempre, sea cual sea el nivel. |
| `SIIGO_ENABLE_WRITE` | no | desactivado | `true`, `1` o `yes` (sin importar mayúsculas) registra las herramientas de escritura; `false`, `0`, `no` u `off` la dejan desactivada. Otro valor (p. ej. `sí`) se reporta como inválido y la escritura queda desactivada. |

Si falta una variable o cualquiera de las de la tabla tiene un valor inválido (incluidos un
`SIIGO_DOWNLOAD_DIR` con un `~usuario` que no existe, un `SIIGO_LOG_LEVEL` desconocido o un
`SIIGO_ENABLE_WRITE` no reconocido), el servidor **arranca igual** y cada herramienta responde con
un error que nombra exactamente qué variable corregir. `siigo_check_connection` muestra además
`write_enabled` y `download_dir`.

## Herramientas

Los IDs de documentos (facturas, clientes, productos…) son GUID; los de catálogos (tipo de
comprobante, impuesto, forma de pago, vendedor, centro de costo, bodega) son enteros. Los listados
devuelven `page`, `page_size`, `total_results`, `count`, `has_more`, `next_page` y `results`.
Las respuestas llegan a Claude como JSON compacto, y la de cada listado tiene **máximo 25.000
caracteres** (el límite se mide sobre ese mismo texto; las herramientas `siigo_get_*` devuelven el
documento completo). Si una página no cabe, se recorta (`truncated: true`, `omitted`):
trae las filas completas que caben, `next_page` vacío y `resume` (`page`, `page_size`, `skip`).
Para el resto, llama de nuevo a la misma herramienta con los mismos filtros y esos tres valores
(los listados paginados aceptan el argumento `skip`: el servidor omite las primeras `skip` filas
de la página); cuando una respuesta ya no traiga `resume`, sigue con `next_page`, el mismo
`page_size` y `skip=0`. Cada llamada avanza al menos una fila y ninguna fila se salta ni se
repite: una fila que por sí sola supera el límite llega resumida (`_compact: true`: campos
simples como `id`, `name`, fecha, cliente, `total`, `balance` y estado, sin ítems ni pagos) y
`siigo_get_*` con su `id` da el detalle. Los catálogos no se paginan: si no caben completos, las
últimas filas llegan resumidas (`_compact: true`) y solo se omiten las que ni así caben.
Las fechas de filtro usan `yyyy-MM-dd` o `yyyy-MM-ddTHH:mm:ssZ` (UTC). Los argumentos desconocidos o
mal escritos (p. ej. `identificacion` en vez de `identification`) se rechazan con un error en vez
de ignorarse, para que un filtro mal escrito no devuelva datos sin filtrar.

### Lectura (siempre disponibles)

| Herramienta | Qué hace | Endpoint |
|---|---|---|
| `siigo_check_connection` | Verifica configuración y credenciales (pide un token nuevo) | `POST /auth` |
| `siigo_list_customers` / `siigo_get_customer` | Terceros: clientes y proveedores | `/v1/customers` |
| `siigo_list_products` / `siigo_get_product` | Productos y servicios | `/v1/products` |
| `siigo_list_invoices` / `siigo_get_invoice` | Facturas de venta (saldo, estado DIAN) | `/v1/invoices` |
| `siigo_get_invoice_dian_errors` | Motivos de rechazo de la DIAN | `/v1/invoices/{id}/stamp/errors` |
| `siigo_get_invoice_pdf` / `siigo_get_invoice_xml` | Guarda el PDF / XML en `SIIGO_DOWNLOAD_DIR` y devuelve la ruta | `/v1/invoices/{id}/pdf`, `/xml` |
| `siigo_list_credit_notes` / `siigo_get_credit_note` | Notas crédito | `/v1/credit-notes` |
| `siigo_get_credit_note_pdf` | Guarda el PDF de una nota crédito | `/v1/credit-notes/{id}/pdf` |
| `siigo_list_vouchers` / `siigo_get_voucher` | Recibos de caja (cobros) | `/v1/vouchers` |
| `siigo_list_payment_receipts` / `siigo_get_payment_receipt` | Recibos de pago / egresos | `/v1/payment-receipts` |
| `siigo_list_journals` / `siigo_get_journal` | Comprobantes contables | `/v1/journals` |
| `siigo_get_purchase` | Factura de compra | `/v1/purchases/{id}` |
| `siigo_list_quotations` / `siigo_get_quotation` | Cotizaciones | `/v1/quotations` |
| `siigo_list_document_types` | Tipos de comprobante (FV, NC, RC, FC, CC, RP, C, DS) | `/v1/document-types` |
| `siigo_list_payment_types` | Formas de pago (FV, NC, RC) | `/v1/payment-types` |
| `siigo_list_taxes` | Impuestos y retenciones | `/v1/taxes` |
| `siigo_list_users` | Usuarios / vendedores | `/v1/users` |
| `siigo_list_cost_centers`, `siigo_list_warehouses`, `siigo_list_price_lists`, `siigo_list_account_groups`, `siigo_list_fixed_assets` | Centros de costo, bodegas, listas de precios, grupos de inventario, activos fijos | `/v1/...` |
| `siigo_list_accounts_payable` | Cuentas por pagar a proveedores (`provider_branch_office` solo junto con `provider_identification`, como exige Siigo) | `/v1/accounts-payable` |
| `siigo_trial_balance_report` | Balance de prueba (enlace a Excel) | `POST /v1/test-balance-report` |
| `siigo_trial_balance_by_third_party` | Balance de prueba por tercero (enlace a Excel) | `POST /v1/test-balance-report-by-thirdparty` |

Los catálogos se guardan en caché 10 minutos (usa `refresh=true` para forzar la consulta) y por
defecto omiten los registros inactivos (`include_inactive=true` para verlos). Las herramientas de
descarga escriben un archivo local, pero no modifican nada en Siigo y nunca devuelven el base64.

### Escritura (solo con `SIIGO_ENABLE_WRITE=true`)

| Herramienta | Qué hace | Anotación |
|---|---|---|
| `siigo_create_customer` | Crea un tercero; antes lo busca por identificación y no lo duplica | no destructiva |
| `siigo_create_invoice` | Crea una factura de venta con validación local previa e `Idempotency-Key` | no destructiva |
| `siigo_send_invoice_email` | Envía la factura por correo (máx. 5 direcciones) | no destructiva |
| `siigo_annul_invoice` | Anula una factura | **destructiva** |
| `siigo_delete_invoice` | Elimina una factura | **destructiva** |

## Habilitar escritura

Agrega `SIIGO_ENABLE_WRITE=true` a las variables del servidor y reinicia el cliente:

- **Claude Code, servidor ya registrado** (el caso normal si seguiste este README): Claude Code no
  tiene un comando para cambiar las variables de un servidor existente, y repetir
  `claude mcp add siigo_mcp ...` falla con *MCP server siigo_mcp already exists*. Quítalo y
  regístralo de nuevo con todas las variables más `SIIGO_ENABLE_WRITE=true`, usando el mismo
  alcance (`-s`) con el que lo registraste (`claude mcp get siigo_mcp` lo muestra):

  ```bash
  claude mcp remove siigo_mcp -s local
  claude mcp add siigo_mcp \
    -e SIIGO_USERNAME=usuario@empresa.com \
    -e SIIGO_ACCESS_KEY=xxxxxxxx \
    -e SIIGO_PARTNER_ID=MiEmpresaMCP \
    -e SIIGO_RATE_LIMIT_PER_MINUTE=10 \
    -e SIIGO_ENABLE_WRITE=true \
    -- uv run --directory /home/user/proyects/siigo-mcp siigo-mcp
  ```

- **Claude Code registrado con `--env-file`:** no hace falta registrarlo de nuevo; cambia
  `SIIGO_ENABLE_WRITE=true` en tu `.env`.
- **Claude Desktop:** agrega `"SIIGO_ENABLE_WRITE": "true"` al bloque `env`.

Después reinicia Claude Code, o cierra y abre Claude Desktop. `siigo_check_connection` muestra
`write_enabled: true` cuando quedó habilitada. Al usar la escritura ten en cuenta:

- **`stamp.send=true` en `siigo_create_invoice` envía la factura electrónica a la DIAN: es un
  acto legal e irreversible.** Por defecto es `false` y la factura queda como borrador
  (`stamp.status = Draft`). Pide a Claude que te muestre la factura antes de enviarla.
- Antes de crear una factura el servidor valida localmente el tipo de comprobante, la
  numeración, el centro de costo, el vendedor por ítem, la fecha (una factura electrónica no
  puede tener fecha pasada, hora de Colombia), las formas de pago, los impuestos y que el
  cliente exista. Si algo de eso falla, **no envía nada** a Siigo. Que la suma de pagos sea
  igual al total solo se valida localmente en **facturas simples** (ítems con `price` sin IVA
  incluido, impuestos IVA o Impoconsumo, sin retenciones, anticipo ni moneda extranjera); en
  los demás casos (por ejemplo, con ReteIVA, ReteFuente o ReteICA) la valida Siigo, el
  resultado lo advierte en `preflight.warnings` y un `invalid_total_payments` cuenta para la
  regla del 80%.
- Cada factura se envía con una `Idempotency-Key`: con la misma clave Siigo devuelve la
  factura ya creada en vez de duplicarla. La herramienta le indica a Claude que genere una
  `idempotency_key` **nueva para cada venta** antes de la primera llamada y la reutilice en
  cualquier reintento de esa misma factura, también cuando la llamada expiró, se canceló (Esc)
  o no devolvió respuesta. Si Claude no envía ninguna, el servidor genera una aleatoria en cada
  llamada, así que dos ventas idénticas (p. ej. el mismo servicio a consumidor final dos veces
  el mismo día) dan dos facturas. Si el propio servidor no recibió la respuesta de Siigo
  (tiempo de espera, cancelación, error 408 o 5xx), recuerda esa clave mientras sigue en
  ejecución y durante 2 horas: repetir esa llamada idéntica sin clave reutiliza la misma. Si
  Siigo sí respondió pero la respuesta no llegó a Claude, una llamada idéntica sin clave crea
  otra factura (si es dentro de esas 2 horas y sin reiniciar el servidor, el resultado lo
  advierte en `notes`): por eso conviene que Claude envíe siempre su propia clave.
- Si Siigo responde con una factura que ya existía porque la clave ya se había usado, el
  resultado trae `created: false`, `replayed: true` y, al inicio, un `warning`: esa llamada
  **no creó** ninguna factura. Si era una venta nueva, hay que repetirla con otra
  `idempotency_key`. El servidor lo detecta cuando ya había recibido una respuesta con esa
  clave, cuando la factura devuelta es de otro cliente, otro tipo de comprobante u otro total, o
  cuando su `metadata.created` es anterior a la llamada (según el reloj de Siigo, no el de tu
  equipo).
- La clave se escribe en el log (stderr) antes de enviar la factura, sea cual sea
  `SIIGO_LOG_LEVEL`, y viene en el resultado (`idempotency_key`) y en los errores en los que la
  factura pudo haberse creado (falla de red, tiempo de espera, error 5xx/408/429, una respuesta
  2xx ilegible o un fallo al renovar el token durante un reintento): verifica con
  `siigo_list_invoices` y, si la repites, usa esa misma clave.
- El resultado separa lo pedido de lo ocurrido: `dian_send_requested` es el valor de
  `stamp.send`, y `dian_status`/`dian_note` describen lo que respondió Siigo (`Draft` = no se
  envió a la DIAN, por ejemplo porque el tipo de comprobante no es electrónico).
- Para pruebas usa un tipo de comprobante FV con `electronic_type = NoElectronic`.
- Siigo no documenta con precisión cuándo anular y cuándo eliminar; una factura ya aceptada por
  la DIAN normalmente se revierte con una nota crédito.

## Primera prueba recomendada

Con credenciales de la empresa de pruebas y `SIIGO_RATE_LIMIT_PER_MINUTE=10`, pídele a Claude, en
este orden (unas 8 solicitudes, dentro del límite de 10 por minuto):

1. `siigo_check_connection` — «Verifica la conexión con Siigo».
2. `siigo_list_document_types` con `type=FV` — «¿Qué tipos de factura de venta tengo?».
3. `siigo_list_payment_types` con `FV` — «¿Qué formas de pago tengo para facturas?».
4. `siigo_list_taxes` — «Lista los impuestos».
5. `siigo_list_users` — «¿Quiénes son los vendedores?».
6. `siigo_list_customers` — «Muéstrame los primeros clientes».
7. `siigo_create_customer` (con escritura habilitada: en Claude Code hay que quitar y volver a
   registrar el servidor, ver [Habilitar escritura](#habilitar-escritura)) — crea un cliente de
   prueba.
8. `siigo_create_invoice` sobre un tipo FV `NoElectronic` y con `stamp.send=false`.

## Solución de problemas

**HTTP 429 / `requests_limit`.** Superaste el límite de Siigo (100 por minuto; 10 en la empresa
de pruebas). El servidor espera el tiempo que indica Siigo («Try again in N seconds» o la cabecera
`Retry-After`, también en los errores 500/503/504 que se reintentan) y reintenta las lecturas hasta
2 veces (máximo 60 s de espera; si Siigo pide más, no reintenta). Las escrituras sin
`Idempotency-Key` (crear cliente, enviar correo, reportes) **no** se reintentan: espera los
segundos indicados y vuelve a pedirlo. Con la empresa de pruebas configura
`SIIGO_RATE_LIMIT_PER_MINUTE=10`.

**Usuario API bloqueado (regla del 80%).** Si más del 80% de las solicitudes de un usuario API
fallan en 7 días, Siigo lo bloquea temporalmente y avisa por correo. Por eso el servidor valida
fechas, IDs y facturas antes de enviarlas y nunca reintenta errores 4xx. Tampoco repite un
`POST /auth` fallido: las llamadas que esperaban ese token (aunque Claude lance varias en
paralelo) y las siguientes reciben el mismo error sin contactar a Siigo, durante 5 s tras una
falla de red o 5xx, durante el tiempo que pidió Siigo tras un 429 y, si rechazó las
credenciales o el Partner-Id, hasta que uses `siigo_check_connection` (que siempre lo intenta
de nuevo). Si te bloquean, corrige la causa (Partner-Id, credenciales, datos) y contacta a
soporte de Siigo.

**`invalid_partner_id` o `header_required`.** `SIIGO_PARTNER_ID` debe tener de 3 a 100 letras o
dígitos, sin espacios, guiones ni tildes (ej. `MiEmpresaMCP`). Si el formato es correcto y el
error continúa, Siigo puede exigir que el Partner-Id esté registrado: contacta a soporte.

**401 / `unauthorized`.** El servidor renueva el token y reintenta una vez; si vuelve a fallar,
revisa `SIIGO_USERNAME` y `SIIGO_ACCESS_KEY` y que el usuario API no esté bloqueado. El servidor
envía `Authorization: Bearer <token>`, como el SDK oficial y el sandbox. Algunos clientes de la
comunidad envían el token sin el prefijo `Bearer`; si con credenciales correctas el 401 persiste,
esa podría ser la causa (esta alternativa no está implementada; repórtalo).

**Las herramientas responden «La configuración de Siigo está incompleta o es inválida».** Falta
alguna variable o tiene un formato inválido; el mensaje dice cuál. Corrígela y reinicia el cliente.

**El servidor no aparece o «failed to start».** Verifica la ruta absoluta de `uv` y del proyecto,
ejecuta `uv sync` en la carpeta y prueba manualmente
`uv run --directory /home/user/proyects/siigo-mcp siigo-mcp` (debe quedarse esperando; sal con
Ctrl+C o con Ctrl+D, y termina sin errores). Los logs van a stderr; usa `SIIGO_LOG_LEVEL=DEBUG`
para más detalle.

**`document_settings` / `invalid_dian_resolution`.** El tipo de comprobante no tiene una
resolución DIAN vigente. Para pruebas usa un tipo FV `NoElectronic`.

**`invalid_total_payments`.** La suma de `payments[].value` debe ser igual al total: por ítem,
base = cantidad × precio − descuento; impuesto = base × % / 100; ambos redondeados a 2 decimales.

**Tiempo de espera agotado o llamada interrumpida.** Siigo puede tardar al crear documentos, y
el cliente MCP puede rendirse antes que el servidor (o tú puedes interrumpir con Esc); en ese caso
no llega ningún error con la clave, pero la factura pudo haberse creado. Verifica primero con
`siigo_list_invoices`. Si la repites, usa la **misma** `idempotency_key` de la llamada original:
si Claude envió una, está en los argumentos de esa llamada en la conversación; si no, en el log
del servidor, en la línea `Idempotency-Key=...` (se escribe siempre, sea cual sea
`SIIGO_LOG_LEVEL`). Repetir la llamada idéntica **sin** clave solo reutiliza la clave original si
el servidor tampoco recibió la respuesta de Siigo (tiempo de espera, cancelación, error 408 o
5xx), no se ha reiniciado, han pasado menos de 2 horas y la factura es exactamente igual (fecha
incluida); en otro caso se enviaría con una clave nueva y podría duplicarse. Dónde está el
log: Claude Desktop guarda el stderr de cada servidor en `mcp-server-siigo_mcp.log`
(habitualmente en `~/Library/Logs/Claude/` en macOS y `%APPDATA%\Claude\logs\` en Windows); en
Claude Code, inícialo con `claude --debug` para ver los mensajes de los servidores MCP. Para
otras escrituras, verifica primero en Siigo si la operación se ejecutó (el error lo advierte).

**Proxy, VPN o certificados (`ALL_PROXY`, `HTTPS_PROXY`, `HTTP_PROXY`, `SSL_CERT_FILE`,
`SSL_CERT_DIR`).** El servidor usa el proxy y los certificados de su entorno (Claude Code hereda
el de tu terminal; en minúsculas, como `https_proxy`, también cuentan). Se admiten proxies
`http://`, `https://` y `socks5://`. Si una de estas variables es inválida (p. ej. un proxy
`ftp://` o un `SSL_CERT_FILE` que no existe o no es PEM), el servidor arranca igual y cada
herramienta responde con un error que nombra la variable; si el proxy no responde, el error de
conexión también la nombra. Corrígela, o anúlala solo para este servidor definiéndola vacía
(`-e ALL_PROXY=` en `claude mcp add`, `"ALL_PROXY": ""` en el `env` de Claude Desktop), y reinicia
el cliente.

## Seguridad

- **No subas credenciales a git.** `siigo-mcp/.gitignore` ignora `.env`, `.mcp.json` y las
  carpetas de descargas, pero **solo dentro de `siigo-mcp/`**: un `.mcp.json` o `.env` en la raíz
  del repositorio (por ejemplo el que crea `claude mcp add -s project` ejecutado desde ahí) **NO**
  está ignorado. Usa `-s local` o `-s user`, o agrega esos archivos al `.gitignore` de la raíz.
  Usa `.env.example` solo como plantilla (contiene valores de ejemplo).
- La access key y los tokens nunca se escriben en logs ni en mensajes de error (se reemplazan
  por `***` si Siigo los repitiera, incluso dentro de `Params` y aunque sea un token anterior a
  una renovación).
- Las credenciales solo viajan por `https://`: `SIIGO_BASE_URL` con `http://` se rechaza salvo
  para `localhost`.
- La escritura está desactivada por defecto; habilítala solo cuando la necesites.
- Las herramientas destructivas (anular, eliminar) están marcadas como tales para que el cliente
  pida confirmación.

## Desarrollo

```bash
uv sync
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
```

Las pruebas usan `httpx.MockTransport`, el cliente MCP en proceso y el servidor real por stdio
como subproceso; no se conectan a Siigo.

## Limitaciones conocidas

- No incluye (pendiente para una fase 2): listado de compras, actualización de clientes,
  creación de notas crédito, recibos y comprobantes, webhooks, envío por lotes ni envío
  posterior a la DIAN.
- Siigo no tiene un reporte de cartera (cuentas por cobrar); usa `siigo_list_invoices` y el campo
  `balance` como aproximación.
- No hay catálogo de ciudades en la API; los códigos DANE están en la
  [lista de ciudades de Siigo](https://saprodcentralassets.blob.core.windows.net/siigoapi/documentation/Lista-de-ciudades.xlsx)
  (ej. Bogotá `11` / `11001`, Medellín `05` / `05001`).
