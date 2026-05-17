# NeveraMind — Contexto del proyecto

## Qué es
PWA mobile-first para gestión de inventario de heladera/despensa. Permite escanear tickets de supermercado con IA, gestionar el inventario y recibir sugerencias de recetas basadas en lo disponible.

## Tech stack
- **React 18 + Vite 5** — frontend, sin router (3 tabs manejados con useState)
- **Tailwind CSS 3** — estilos, paleta verde (`brand-*`) definida en `tailwind.config.js`
- **Supabase** — base de datos Postgres, acceso vía REST con anon key (sin auth)
- **Google Gemini 2.5 Flash** — OCR de tickets (vision) y sugerencias de recetas (texto)
- **`@google/generative-ai` v0.24.1** — SDK oficial de Gemini
- **PWA** — `manifest.json` + `sw.js` con cache-first para assets estáticos

## Variables de entorno (`.env`)
```
VITE_SUPABASE_URL=https://yvmtsihjrhkpvmjoegeb.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_GEMINI_API_KEY=...
```

## Base de datos — Supabase
**Tabla única:** `inventory_items`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK, gen_random_uuid() |
| name | text | nombre del producto |
| quantity | numeric | cantidad |
| unit | text | kg / g / L / ml / unidades / etc |
| status | text | `'disponible'` \| `'consumido'` |
| expires_at | date | fecha de vencimiento estimada (nullable) |
| created_at | timestamptz | auto |
| updated_at | timestamptz | auto (trigger) |

- RLS habilitado, política `Allow all for anon` (app single-user, sin auth)
- Índice `idx_inventory_name` en `lower(name)` para búsqueda de upsert
- Índice parcial `idx_inventory_expires_disponible` para la sección "Por vencer pronto"

### Migraciones
Se aplican manualmente en el SQL Editor de Supabase:
- `supabase_schema.sql` — schema completo (idempotente)
- `supabase/migrations/0002_add_expiry.sql` — agrega `expires_at` + índice

## Estructura de archivos
```
src/
├── App.jsx                  # Root: tab state + ToastProvider + layout
├── main.jsx                 # Entry point, registra SW
├── index.css                # Tailwind + clases reutilizables (.btn-primary, .card, etc)
├── context/
│   └── AppContext.jsx        # ToastProvider + useToast hook (toasts globales)
├── lib/
│   ├── supabase.js           # Operaciones DB (getInventory, upsertItem, updateItemExpiry, deductIngredients, etc)
│   ├── gemini.js             # parseReceipt() + getRecipeSuggestions() + getGeneralSuggestions()
│   ├── expiry.js             # Helpers de fechas (daysUntilExpiry, bucket, label, defaults)
│   └── notifications.js      # Wrapper de @capacitor/local-notifications (no-op en web)
├── components/
│   ├── BottomNav.jsx         # Navegación inferior con 3 tabs
│   ├── InventoryCard.jsx     # Card de item: toggle status, edición inline qty+vencimiento, delete
│   ├── ExpiryBadge.jsx       # Badge de fecha con color por bucket (rojo/naranja/amarillo/verde)
│   ├── Spinner.jsx           # Loading state con emoji y mensaje
│   └── EmptyState.jsx        # Estado vacío genérico
└── pages/
    ├── Scanner.jsx           # Flujo: upload → preview → OCR → review editable → confirm
    ├── Inventory.jsx         # Lista completa con búsqueda, filtros y agregar manual
    └── Recipes.jsx           # Filtro → Gemini → 3 cards con "Voy a cocinar esto"
public/
├── manifest.json            # PWA manifest (display: standalone, theme: #22c55e)
├── sw.js                    # Service worker: cache-first assets, skip Supabase/Gemini
├── icon.svg / icon-192.png / icon-512.png
```

## Flujos principales

### Scanner
1. Usuario sube foto (Capacitor Camera o `<input type="file">`) → base64
2. `parseReceipt()` envía la imagen al Edge Function `gemini-proxy`. Gemini devuelve `name`, `quantity`, `unit` y `suggestedExpiryDays` por producto
3. El review pre-llena fechas de vencimiento (today + suggestedDays, o fallback heurístico por keyword en español). Editables como `<input type="date">`
4. Al confirmar: `upsertItem(name, qty, unit, expiresAt)` por cada item — si ya existe (ilike), **suma cantidad** + **mantiene la fecha más temprana**
5. Después de guardar: pide permiso de notificaciones + agenda recordatorios via `scheduleExpiryNotification()`

### Inventory
- CRUD completo vía Supabase
- Toggle disponible/consumido: `updateItemStatus()` — cancela la notif si pasa a consumido
- Edición inline de cantidad y fecha de vencimiento
- Si cantidad llega a 0, se marca automáticamente como consumido
- **Sección "Por vencer pronto"** (`selectExpiring(items, 3)`): card naranja en el tope con los items que vencen en ≤ 3 días (o ya vencidos)
- Cada card tiene un `<ExpiryBadge>` con color por bucket (`expired`/`critical`/`soon`/`week`/`ok`)
- En cada `load()` se re-sincronizan las notificaciones locales contra el inventario actual

### Recipes
1. Carga solo items con `status = 'disponible'`
2. Envía lista a `getRecipeSuggestions()` con filtro (proteico/vegetariano/carbohidratos/sin filtro)
3. Gemini devuelve 3 sugerencias con ingredientes y cantidades
4. "Voy a cocinar esto" → `deductIngredients()` descuenta cantidades (mínimo 0, marca consumido si llega a 0)

## Decisiones técnicas importantes
- **Modelo Gemini:** usar siempre `gemini-2.5-flash` — `gemini-1.5-flash` fue deprecado
- **Upsert por nombre:** comparación case-insensitive con `.ilike()` de Supabase. En merge se queda la `expires_at` **más temprana** (conservador, no olvida lotes viejos)
- **Sin autenticación:** RLS con política open, app single-user
- **Toast system:** global vía Context, auto-dismiss en 3 segundos
- **SW:** no cachea requests a `supabase.co` ni `googleapis.com` (siempre fresh)
- **Local Notifications:** se accede a `Capacitor.Plugins.LocalNotifications` directo (sin import del módulo NPM) para que el JS bundle compile aun cuando el paquete no esté instalado. La integración nativa requiere instalar el package + `cap sync ios`.
- **Notification ID:** primeros 8 hex chars del UUID → int. Determinístico, colisión despreciable a escala single-user.

## Comandos
```bash
npm run dev      # localhost:5173
npm run build    # build de producción en /dist
npm run preview  # preview del build
```
