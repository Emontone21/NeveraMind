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
| created_at | timestamptz | auto |
| updated_at | timestamptz | auto (trigger) |

- RLS habilitado, política `Allow all for anon` (app single-user, sin auth)
- Índice `idx_inventory_name` en `lower(name)` para búsqueda de upsert

## Estructura de archivos
```
src/
├── App.jsx                  # Root: tab state + ToastProvider + layout
├── main.jsx                 # Entry point, registra SW
├── index.css                # Tailwind + clases reutilizables (.btn-primary, .card, etc)
├── context/
│   └── AppContext.jsx        # ToastProvider + useToast hook (toasts globales)
├── lib/
│   ├── supabase.js           # Todas las operaciones DB (getInventory, upsertItem, deductIngredients, etc)
│   └── gemini.js             # parseReceipt() + getRecipeSuggestions()
├── components/
│   ├── BottomNav.jsx         # Navegación inferior con 3 tabs
│   ├── InventoryCard.jsx     # Card de item: toggle status, edición inline de qty, delete
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
1. Usuario sube foto → `FileReader` → base64
2. `parseReceipt()` envía imagen a Gemini Vision con prompt en español
3. Respuesta JSON parseada → lista editable (nombre, cantidad, unidad)
4. Al confirmar: `upsertItem()` por cada item — si el nombre ya existe (ilike), **suma** la cantidad

### Inventory
- CRUD completo vía Supabase
- Toggle disponible/consumido: `updateItemStatus()`
- Edición inline de cantidad: click en el número → input → blur confirma
- Si cantidad llega a 0, se marca automáticamente como consumido

### Recipes
1. Carga solo items con `status = 'disponible'`
2. Envía lista a `getRecipeSuggestions()` con filtro (proteico/vegetariano/carbohidratos/sin filtro)
3. Gemini devuelve 3 sugerencias con ingredientes y cantidades
4. "Voy a cocinar esto" → `deductIngredients()` descuenta cantidades (mínimo 0, marca consumido si llega a 0)

## Decisiones técnicas importantes
- **Modelo Gemini:** usar siempre `gemini-2.5-flash` — `gemini-1.5-flash` fue deprecado
- **Upsert por nombre:** comparación case-insensitive con `.ilike()` de Supabase
- **Sin autenticación:** RLS con política open, app single-user
- **Toast system:** global vía Context, auto-dismiss en 3 segundos
- **SW:** no cachea requests a `supabase.co` ni `googleapis.com` (siempre fresh)

## Comandos
```bash
npm run dev      # localhost:5173
npm run build    # build de producción en /dist
npm run preview  # preview del build
```
