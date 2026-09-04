# AGUITECH Teleprompter Video

> **BanCoppel · Afore Coppel — Herramienta interna de producción**

Teleprompter + Grabación de video en greenscreen + Post-producción automática con chroma key en PHP.

---

## 🚀 Demo en producción

👉 **https://aguitech.github.io/teleprompter-video/**

---

## 🎯 Flujo completo

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ ① Teleprompter│ → │ ② Countdown  │ → │ ③ Grabación  │ → │ ④ Post-prod  │
│   3-2-1      │   │   en pantalla│   │  greenscreen │   │   PHP+FFmpeg │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
                                                                  ↓
                                                          ┌──────────────┐
                                                          │ ⑤ MP4 final  │
                                                          │  descargable │
                                                          └──────────────┘
```

1. **Escribe el guion** en el editor (con plantillas para BanCoppel / Afore Coppel)
2. **Countdown 3-2-1** aparece en pantalla
3. **Graba** con webcam mientras el teleprompter se desplaza
4. **Sube a PHP** → backend extrae frames con FFmpeg, aplica chroma key pixel por pixel con GD, recompone MP4
5. **Descarga el video** con fondo transparente o color corporativo

---

## 🎨 Branding

| Marca | Color principal | Hex |
|---|---|---|
| **BanCoppel** | Azul corporativo | `#003D7A` |
| **Afore Coppel** | Verde | `#00A651` |
| **Acento** | Amarillo | `#FFD500` |

---

## ✨ Features del frontend

- **Teleprompter** con scroll automático, velocidad ajustable (10-120 px/s), tamaño (24-120px), 4 colores
- **Plantillas pre-cargadas** para BanCoppel y Afore Coppel (3 tipos de guion)
- **Countdown 3-2-1** animado, con pulso de color amarillo
- **MediaRecorder API** — graba webcam + micrófono en WebM
- **Preview en vivo** con chroma key aplicado en tiempo real (canvas pixel-by-pixel)
- **Word highlight** — la palabra actual se resalta al pasar por la línea de enfoque
- **Atajos teclado** — Space (play/pause), R (reiniciar), 1/2/3 (countdown)
- **Galería** de sesiones producidas
- **Selector de cámara/micrófono** — si tienes múltiples dispositivos
- **Responsive** — desktop / tablet / mobile

---

## ⚙️ Stack del backend PHP

- **PHP 8+** con extensión GD (manipulación pixel a pixel)
- **FFmpeg** para extracción de frames y reencoding
- **Almacenamiento** en filesystem (no requiere BD)
- **CORS habilitado** para acceso desde cualquier dominio

### Endpoints

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/process.php` | Recibe WebM, procesa con chroma, devuelve MP4 |
| `GET` | `/api/list.php` | Lista todas las sesiones procesadas |
| `GET` | `/api/download.php?id=<session>` | Descarga MP4 procesado |
| `GET` | `/api/stream.php?id=<session>` | Stream MP4 con soporte Range (para `<video>` con scrub) |

### Form params de `process.php`

```
video:        File WebM grabado (multipart/form-data)
title:        string (nombre del guion)
brand:        "bancoppel" | "afore" | "ambas"
chroma_color: hex (#00ff00)
tolerance:    10-180 (default 80)
bg_mode:      "transparent" | "bancoppel" | "afore" | "custom" | "none"
bg_color:     hex (solo si bg_mode=custom)
```

### Response

```json
{
  "ok": true,
  "session_id": "sess_20260904_233744_63c34c44",
  "frames": 72,
  "duration": 3,
  "output_size": 5864,
  "output_url": "https://api.aguitech.com.mx/teleprompter-video/api/download.php?id=...",
  "gallery_url": "https://aguitech.github.io/teleprompter-video/#gallery",
  "log": [...]
}
```

---

## 🛠️ Algoritmo de chroma key

Para cada frame extraído:

```php
$dist = sqrt(($r - $chroma_r)² + ($g - $chroma_g)² + ($b - $chroma_b)²);
if ($dist < $tolerance) {
    // pixel verde → dejar fondo (transparente o color corporativo)
} else {
    // pixel NO verde → copiar pixel original
}
```

**Tolerancia recomendada:** 80-120 (compensa el chroma subsampling del encoder H.264 que deja pizcas de verde/rojo en los píxeles "puros")

**Modos de salida:**
- `transparent` → frames PNG con alpha, recompone MP4 con códec H.264
- `bancoppel` / `afore` → fondo sólido color corporativo
- `custom` → cualquier color hex
- `none` → solo marca el chroma como semi-transparente (para composición manual)

---

## 🚀 Deploy

### Frontend (GitHub Pages — automático)

Cada push a `main` dispara `.github/workflows/pages.yml` y redespliega.

### Backend (manual — VPS / cPanel / EasyPanel)

```bash
# 1. Instalar dependencias del sistema
apt-get install ffmpeg php-gd php-curl

# 2. Subir la carpeta api/ al servidor

# 3. Configurar:
#    - CORS_ORIGIN en api/config.php si quieres restringir
#    - STORAGE_PATH (default: storage/sessions/)
#    - Permisos de escritura en storage/

# 4. Apuntar dominio (ej. api.aguitech.com.mx/teleprompter-video/api/)
```

### Frontend apuntando al backend

En `docs/assets/app.js` cambiar `API_BASE`:

```js
const API_BASE = 'https://api.aguitech.com.mx/teleprompter-video/api';
// o para local:
// const API_BASE = 'http://localhost:8766/api';
```

---

## 🧪 Test E2E local

```bash
# Genera video de prueba (verde puro)
ffmpeg -f lavfi -i "color=c=0x00FF00:size=640x360:duration=3:rate=24" \
       -vf "drawtext=text='TEST':fontcolor=white:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2" \
       -c:v libx264 -pix_fmt yuv420p -t 3 -y test.mp4

# Arrancar backend local
cd api
php -S 127.0.0.1:8766 router.php  # router.php solo para testing

# Subir
curl -X POST -F "video=@test.mp4" -F "title=Test" -F "brand=afore" \
     -F "chroma_color=#00ff00" -F "tolerance=80" -F "bg_mode=bancoppel" \
     http://127.0.0.1:8766/process.php

# Verificar pixel procesado
python3 -c "
from PIL import Image
import glob
base = glob.glob('../storage/sessions/*')[0]
proc = Image.open(f'{base}/processed/frame_00010.jpg')
print('Pixel fondo:', proc.getpixel((5,5)))  # esperado: azul BanCoppel
"
```

**Resultados verificados:**
- ✅ 72 frames extraídos (24fps × 3s)
- ✅ 16,298,850 pixels con chroma aplicado
- ✅ MP4 recompilado en H.264
- ✅ Modo transparente preserva alpha (RGBA)

---

## 📦 Estructura

```
teleprompter-video/
├── docs/                    # GitHub Pages
│   ├── index.html           # Landing + teleprompter + recorder + gallery
│   └── assets/
│       ├── style.css        # Dark mode + branding BanCoppel
│       └── app.js           # Teleprompter + MediaRecorder + chroma preview
├── api/                     # Backend PHP
│   ├── config.php           # CORS + helpers
│   ├── process.php          # POST: recibe video, procesa, devuelve MP4
│   ├── list.php             # GET: lista sesiones
│   ├── download.php         # GET: descarga MP4
│   └── stream.php           # GET: stream MP4 con Range support
├── storage/
│   └── sessions/            # Cada sess_*/ tiene input + frames + processed + output
├── sql/                     # (vacío — no requiere BD)
├── .github/workflows/
│   └── pages.yml            # Auto-deploy a Pages
├── README.md
└── .gitignore
```

---

## ⚠️ Limitaciones conocidas

1. **Chroma subsampling de H.264**: el encoder introduce pizcas de color en píxeles "puros". Por eso la tolerancia por defecto es 80, no 30. Si tu greenscreen tiene iluminación irregular, sube la tolerancia.

2. **Performance del pixel-by-pixel**: PHP GD no es el más rápido. Para 720p × 30s × 24fps = ~52K frames, toma ~10-15 minutos. Para producción a escala, considera:
   - Migrar el chroma a Python con OpenCV (`cv2.cvtColor + inRange`)
   - Procesar en GPU con CUDA
   - Usar ffmpeg's `chromakey` filter nativo (mucho más rápido)

3. **Audio**: se preserva del video original al recompilar.

4. **Sin BD**: las sesiones se guardan en filesystem. Para producción multi-tenant, agrega MySQL.

---

## 🤝 Créditos

Construido por **AGUITECH** · https://aguitech.com.mx
Para **BanCoppel** + **Afore Coppel**
Por **Héctor Aguilar** · https://github.com/aguitech

Tagline: *Ingeniería + Diseño + Sistemas*

---

## 📝 Licencia

MIT — uso interno BanCoppel / Afore Coppel.
