# AGUITECH Teleprompter Video (Multi-Escena)

> **BanCoppel · Afore Coppel — Herramienta interna de producción**

Teleprompter + Grabación de **N escenas** con greenscreen + Post-producción con chroma key en PHP.

De 1 a 20 textos independientes. Cada uno graba su clip, se procesa individualmente con PHP+FFmpeg+GD, y todo queda guardado en una sesión en SQLite con video final concatenable.

---

## 🚀 Demo

👉 **https://aguitech.github.io/teleprompter-video/**

---

## 🎯 Flujo multi-escena

```
┌──────────────────────────────────────────────────┐
│ SESIÓN (1)                                        │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Escena 1 │  │ Escena 2 │  │ Escena N │  ...   │
│  │ texto+tp │  │ texto+tp │  │ texto+tp │        │
│  │ grabar   │  │ grabar   │  │ grabar   │        │
│  │ WebM     │  │ WebM     │  │ WebM     │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       ↓             ↓             ↓                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ MP4 #1   │  │ MP4 #2   │  │ MP4 #N   │        │
│  └──────────┘  └──────────┘  └──────────┘        │
│       ↓             ↓             ↓                │
│       └─────────────┼─────────────┘                │
│                     ↓                              │
│              ┌────────────┐                        │
│              │ Final MP4  │ (concat.php)           │
│              └────────────┘                        │
└──────────────────────────────────────────────────┘
```

1. **Configura sesión** — título, marca, N (1-20) escenas, chroma global
2. **Escribe N textos** — cada uno con su textarea
3. **Graba N clips** — countdown 3-2-1 + teleprompter + MediaRecorder
4. **Procesa batch** — backend PHP aplica chroma a cada clip individual
5. **Concat (opcional)** — une todos los clips en 1 MP4 final
6. **Descarga** — cada MP4 por escena o el video final

---

## 🎨 Branding

| Marca | Color principal | Hex |
|---|---|---|
| **BanCoppel** | Azul corporativo | `#003D7A` |
| **Afore Coppel** | Verde | `#00A651` |
| **Acento** | Amarillo | `#FFD500` |

---

## ✨ Features del frontend

- **N escenas (1-20)** con cards individuales
- **Chroma config global** (color, tolerancia, modo de fondo)
- **Teleprompter modal** con scroll automático, play/pause/reset
- **MediaRecorder API** — graba webcam + micrófono por escena
- **Status tracking**: empty → draft → recording → recorded → uploading → processing → processed
- **Procesamiento batch** — botón "Procesar todas las escenas"
- **Galería** clickeable — carga sesión completa de vuelta al editor
- **Auto-generación de directorios** en backend
- **Word counter + char counter** en cada textarea
- **Persist state** en localStorage para no perder cambios al recargar (próximo)

---

## ⚙️ Stack del backend PHP

- **PHP 8+** con extensión GD para manipulación pixel a pixel
- **FFmpeg 6+** para extracción de frames (24fps) y reencoding H.264
- **SQLite 3** para persistir sesiones y escenas (zero config, zero server)
- **Almacenamiento** organizado: `storage/sessions/<session_id>/escena_NNN/{input, frames, processed, output}`
- **CORS habilitado** para acceso desde GitHub Pages

### Endpoints (7)

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/sessions.php` | Crea/actualiza sesión con N escenas (texto) |
| `GET` | `/api/sessions.php` | Lista todas las sesiones |
| `GET` | `/api/sessions.php?id=X` | Detalle de sesión con sus escenas |
| `DELETE` | `/api/sessions.php?id=X` | Elimina sesión completa |
| `POST` | `/api/process.php` | Procesa UNA escena (WebM → MP4 con chroma) |
| `GET` | `/api/download.php?session=X&scene=N` | Descarga MP4 de escena |
| `GET` | `/api/download.php?session=X&final=1` | Descarga video final concatenado |
| `GET` | `/api/frames.php?session=X&scene=N` | Lista frames PNG/JPG de una escena |
| `POST` | `/api/concat.php` | Une todas las escenas en MP4 final |

---

## 📦 Estructura

```
teleprompter-video/
├── docs/                          # GitHub Pages
│   ├── index.html                 # Single-page: scenes grid + gallery + API docs
│   └── assets/
│       ├── style.css              # Dark mode + branding + scenes grid
│       └── app.js                 # Multi-escena state, MediaRecorder, API client
├── api/                           # Backend PHP
│   ├── config.php                 # CORS + SQLite + helpers
│   ├── sessions.php               # CRUD sesiones
│   ├── process.php                # Procesa 1 escena con chroma
│   ├── concat.php                 # Une N escenas en MP4 final
│   ├── download.php               # Descarga MP4 (escena o final)
│   ├── frames.php                 # Lista frames PNG/JPG
│   └── list.php                   # DEPRECATED — usa sessions.php
├── sql/
│   └── schema.sql                 # MySQL schema (referencia)
├── storage/
│   ├── sessions/                  # Archivos por sesión
│   │   └── <session_id>/
│   │       ├── escena_001/
│   │       │   ├── input.webm
│   │       │   ├── frames/       # 72 JPEGs extraídos
│   │       │   ├── processed/    # 72 JPEGs chroma-aplicado
│   │       │   └── output.mp4     # Final de la escena
│   │       ├── escena_002/...
│   │       ├── escena_003/...
│   │       └── final.mp4          # Concatenado (opcional)
│   └── db/
│       └── teleprompter.sqlite    # BD con todas las sesiones
├── .github/workflows/pages.yml
├── README.md
└── .gitignore
```

---

## 🗄️ Schema SQLite

```sql
CREATE TABLE sesiones (
  id TEXT PRIMARY KEY,
  title TEXT,
  brand TEXT,           -- bancoppel | afore | ambas
  chroma_color TEXT,
  tolerance INTEGER,
  bg_mode TEXT,         -- transparent | bancoppel | afore | custom | none
  bg_color TEXT,
  scenes_count INTEGER,
  duration REAL,
  output_final TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE escenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  numero INTEGER NOT NULL,
  texto TEXT,
  video_path TEXT,
  output_path TEXT,
  frames INTEGER,
  duration REAL,
  output_size INTEGER,
  status TEXT,          -- draft | recording | recorded | processing | processed | error
  error_msg TEXT,
  created_at TEXT,
  processed_at TEXT,
  UNIQUE(session_id, numero),
  FOREIGN KEY(session_id) REFERENCES sesiones(id) ON DELETE CASCADE
);
```

(MySQL schema de referencia en `sql/schema.sql`)

---

## 🧪 Test E2E local

```bash
# 1. Genera 3 videos de prueba
for i in 1 2 3; do
  ffmpeg -f lavfi -i "color=c=0x00FF00:size=640x360:duration=3:rate=24" \
         -vf "drawtext=text='ESCENA $i':fontcolor=white:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2" \
         -c:v libx264 -pix_fmt yuv420p -t 3 -y scene_$i.mp4
done

# 2. Crea sesión
curl -X POST -H "Content-Type: application/json" -d '{
  "title": "Test", "brand": "afore",
  "chroma_color": "#00ff00", "tolerance": 80, "bg_mode": "bancoppel",
  "scenes": [{"numero":1,"texto":"..."},{"numero":2,"texto":"..."},{"numero":3,"texto":"..."}]
}' http://localhost:8766/api/sessions.php

# 3. Procesa cada escena
for i in 1 2 3; do
  curl -X POST \
    -F "session_id=sess_xxx" \
    -F "numero_escena=$i" \
    -F "video=@scene_$i.mp4" \
    -F "chroma_color=#00ff00" \
    -F "tolerance=80" \
    -F "bg_mode=bancoppel" \
    http://localhost:8766/api/process.php
done

# 4. Concat
curl -X POST -H "Content-Type: application/json" \
  -d '{"session_id":"sess_xxx"}' \
  http://localhost:8766/api/concat.php
```

**Resultados verificados:**
- ✅ 3 escenas × 72 frames = 216 frames extraídos
- ✅ 47.97M pixels con chroma aplicado (15.99M por escena)
- ✅ 3 MP4s individuales + 1 MP4 final concatenado
- ✅ BD SQLite con 1 sesión + 3 escenas status='processed'

---

## 🚀 Deploy

### Frontend (GitHub Pages — automático)
Push a `main` → `.github/workflows/pages.yml` redespliega.

### Backend (VPS / EasyPanel / cPanel)
```bash
# 1. Dependencias
apt-get install ffmpeg php-gd php-sqlite3 php-curl

# 2. Subir carpeta api/

# 3. Permisos de escritura
chmod -R 755 storage/
chown -R www-data:www-data storage/

# 4. Configurar dominio → /api/
# Ejemplo nginx:
location /teleprompter-video/api/ {
    fastcgi_pass unix:/var/run/php/php-fpm.sock;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root/teleprompter-video/api/$fastcgi_script_name;
}

# 5. Actualizar API_BASE en docs/assets/app.js
const API_BASE = 'https://api.tu-dominio.com/teleprompter-video/api';
```

---

## ⚠️ Limitaciones conocidas

1. **Chroma subsampling del H.264** → tolerancia default 80 (no 30)
2. **Performance pixel-by-pixel** → ~10-15 min para 720p × 30s × 24fps. Para producción a escala:
   - Migrar chroma a Python+OpenCV o ffmpeg's `chromakey` filter nativo
   - GPU con CUDA
3. **Concat usa `-c copy`** (sin re-encoding) → rápido pero requiere que todos los clips tengan el mismo codec/resolución/fps
4. **SQLite** → suficiente para ~100k sesiones. Migrar a MySQL/Postgres para más escala
5. **Sin auth** → agregar JWT si se expone a internet

---

## 🤝 Créditos

Construido por **AGUITECH** · https://aguitech.com.mx
Para **BanCoppel** + **Afore Coppel**
Por **Héctor Aguilar** · https://github.com/aguitech

Tagline: *Ingeniería + Diseño + Sistemas*

---

## 📝 Licencia

MIT — uso interno BanCoppel / Afore Coppel.
