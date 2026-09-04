/* ==============================================================
   BanCoppel + Afore Coppel — Teleprompter + Recorder
   ============================================================== */

(function () {
  'use strict';

  // ============ STATE ============
  const state = {
    tpSpeed: 30,
    tpSize: 56,
    tpColor: '#ffffff',
    tpPlaying: false,
    tpRafId: null,
    tpLastTs: 0,
    tpCurrentWordIdx: -1,
    tpCurrentScroll: 0,

    stream: null,
    mediaRecorder: null,
    recordedChunks: [],
    recording: false,
    recordingMimeType: '',

    chromaColor: '#00ff00',
    tolerance: 40,
  };

  const TEMPLATES = {
    bancoppel: '¡Bienvenido a BanCoppel!\n\nTu banco de confianza, cerca de ti. Estamos en cada rincón de México para ofrecerte soluciones financieras accesibles.\n\nCon BanCoppel, tus ahorros están seguros y tus sueños más cerca. Desde cuentas de ahorro hasta créditos personales, tenemos el producto ideal para ti.\n\nGracias por confiar en BanCoppel. Cerca de ti, siempre.',
    afore: 'Afore Coppel: construye tu futuro hoy.\n\n¿Sabías que el 65% de los mexicanos no tiene un plan de retiro? En Afore Coppel te ayudamos a construir el futuro que mereces.\n\nCon nuestro programa personalizado, tu ahorro crece con el tiempo. Pequeñas contribuciones hoy se convierten en tranquilidad mañana.\n\nAfore Coppel. Tu retiro, nuestra prioridad.',
    promo: '¡Promoción especial de temporada!\n\nAfore Coppel te ofrece bonificación en tus primeros 6 meses al abrir tu cuenta de ahorro para el retiro.\n\nAdemás, BanCoppel te regala una cuenta de ahorro sin comisiones al contratar tu plan de retiro.\n\nNo dejes pasar esta oportunidad. Tu futuro empieza hoy.\n\nAcércate a tu sucursal BanCoppel más cercana o visita aforecoppel.com.mx'
  };

  // ============ DOM ============
  const $ = id => document.getElementById(id);
  const dom = {
    // Teleprompter
    tpTitle: $('tp-title'),
    tpBrand: $('tp-brand'),
    tpSpeed: $('tp-speed'),
    tpSpeedVal: $('tp-speed-val'),
    tpSize: $('tp-size'),
    tpSizeVal: $('tp-size-val'),
    colorSwatches: document.querySelectorAll('.color-swatch'),
    templateBtns: document.querySelectorAll('.template-btn'),
    tpLoadRecorder: $('tp-load-recorder'),
    tpEditor: $('tp-editor'),
    tpWords: $('tp-words'),
    tpChars: $('tp-chars'),
    tpTime: $('tp-time'),
    tpContent: $('tp-content'),
    tpPreview: $('tp-preview'),
    tpCountdown: $('tp-countdown'),
    tpCountdownNum: $('tp-countdown-num'),
    tpPlay: $('tp-play'),
    tpReset: $('tp-reset'),

    // Recorder
    recVideo: $('rec-video'),
    recCanvas: $('rec-canvas'),
    recTeleprompter: $('rec-teleprompter'),
    recTpScroll: $('rec-tp-scroll'),
    recOverlay: $('rec-overlay'),
    recStatus: $('rec-status'),
    recTimer: $('rec-timer'),
    recPrecount: $('rec-precount'),
    recStart: $('rec-start'),
    recStop: $('rec-stop'),
    recCamera: $('rec-camera'),
    recMic: $('rec-mic'),
    recBg: $('rec-bg'),
    recBgColor: $('rec-bg-color'),
    recChromaColor: $('rec-chroma-color'),
    recTol: $('rec-tol'),
    recTolVal: $('rec-tol-val'),
    recPreviewGroup: $('rec-preview-group'),
    recPreview: $('rec-preview'),
    recOutput: $('rec-output'),
    recPlayback: $('rec-playback'),
    recDownload: $('rec-download'),
    recProcess: $('rec-process'),
    recProgress: $('rec-progress'),
    recProgressFill: $('rec-progress-fill'),
    recProgressStatus: $('rec-progress-status'),
  };

  // ============ TELEPROMPTER ============
  function updateTpStats() {
    const text = dom.tpEditor.value;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const chars = text.length;
    const minutes = Math.ceil(words / 150);
    dom.tpWords.textContent = words;
    dom.tpChars.textContent = chars;
    dom.tpTime.textContent = minutes;
  }

  function renderTpContent() {
    const text = dom.tpEditor.value.trim();
    if (!text) {
      dom.tpContent.innerHTML = '<p style="color:#555;">— Escribe tu guion —</p>';
      state.tpCurrentWordIdx = -1;
      return;
    }
    const paragraphs = text.split(/\n\s*\n/);
    let html = '';
    let wordIdx = 0;
    paragraphs.forEach(para => {
      const words = para.trim().split(/\s+/);
      html += '<p>';
      words.forEach((w, i) => {
        html += `<span class="word" data-idx="${wordIdx}">${escapeHtml(w)}</span>`;
        if (i < words.length - 1) html += ' ';
        wordIdx++;
      });
      html += '</p>';
    });
    dom.tpContent.innerHTML = html;
    dom.tpContent.style.fontSize = state.tpSize + 'px';
    dom.tpContent.style.color = state.tpColor;
    dom.tpContent.scrollTop = 0;
    state.tpCurrentWordIdx = -1;
    updateActiveWord();
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function updateActiveWord() {
    const rect = dom.tpPreview.getBoundingClientRect();
    const eyeline = rect.height / 2;
    const words = dom.tpContent.querySelectorAll('.word');
    let active = -1;
    words.forEach((w, i) => {
      const r = w.getBoundingClientRect();
      if (r.top + r.height / 2 <= eyeline + 10) active = i;
    });
    if (active !== state.tpCurrentWordIdx) {
      words.forEach(w => w.classList.remove('active'));
      state.tpCurrentWordIdx = active;
      if (active >= 0 && words[active]) words[active].classList.add('active');
    }
  }

  function tpCountdown(n, cb) {
    dom.tpCountdown.style.display = 'flex';
    dom.tpCountdownNum.textContent = n;
    const tick = () => {
      n--;
      if (n <= 0) {
        dom.tpCountdown.style.display = 'none';
        cb();
        return;
      }
      dom.tpCountdownNum.textContent = n;
      setTimeout(tick, 700);
    };
    setTimeout(tick, 700);
  }

  function tpPlay() {
    if (!dom.tpEditor.value.trim()) {
      flashEditor();
      return;
    }
    tpCountdown(3, () => {
      state.tpPlaying = true;
      state.tpLastTs = performance.now();
      dom.tpPlay.textContent = '⏸ Pausar';
      tpLoop();
    });
  }

  function tpPause() {
    state.tpPlaying = false;
    if (state.tpRafId) cancelAnimationFrame(state.tpRafId);
    dom.tpPlay.textContent = '▶ Reproducir';
  }

  function tpReset() {
    tpPause();
    dom.tpContent.scrollTop = 0;
    state.tpCurrentWordIdx = -1;
    updateActiveWord();
  }

  function tpLoop(ts) {
    if (!state.tpPlaying) return;
    if (!ts) ts = performance.now();
    const dt = (ts - state.tpLastTs) / 1000;
    state.tpLastTs = ts;
    dom.tpContent.scrollTop += state.tpSpeed * dt;
    updateActiveWord();
    if (dom.tpContent.scrollTop >= dom.tpContent.scrollHeight - dom.tpContent.clientHeight - 5) {
      tpPause();
      return;
    }
    state.tpRafId = requestAnimationFrame(tpLoop);
  }

  function flashEditor() {
    dom.tpEditor.style.outline = '2px solid var(--danger)';
    setTimeout(() => { dom.tpEditor.style.outline = ''; }, 500);
    dom.tpEditor.focus();
  }

  // ============ RECORDER ============
  async function initDevices() {
    try {
      // Pedir permisos primero
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      dom.recVideo.srcObject = state.stream;

      // Listar dispositivos
      const devices = await navigator.mediaDevices.enumerateDevices();
      dom.recCamera.innerHTML = '<option value="">Cámara por defecto</option>';
      dom.recMic.innerHTML = '<option value="">Micrófono por defecto</option>';

      devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        if (d.kind === 'videoinput') {
          opt.textContent = d.label || `Cámara ${dom.recCamera.length}`;
          dom.recCamera.appendChild(opt);
        } else if (d.kind === 'audioinput') {
          opt.textContent = d.label || `Mic ${dom.recMic.length}`;
          dom.recMic.appendChild(opt);
        }
      });

      dom.recStart.disabled = false;
      return true;
    } catch (e) {
      console.error('No se pudo acceder a cámara/micrófono:', e);
      dom.recStatus.textContent = '⚠️ Sin acceso a cámara/mic';
      return false;
    }
  }

  function startRecording() {
    if (!state.stream) {
      alert('Primero debes permitir acceso a cámara/micrófono');
      return;
    }

    state.recordedChunks = [];

    // Elegir el mejor mime type disponible
    const mimeOptions = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    let mimeType = '';
    for (const m of mimeOptions) {
      if (MediaRecorder.isTypeSupported(m)) {
        mimeType = m;
        break;
      }
    }

    try {
      state.mediaRecorder = new MediaRecorder(state.stream, mimeType ? { mimeType } : undefined);
      state.recordingMimeType = state.mediaRecorder.mimeType;
    } catch (e) {
      alert('MediaRecorder no soportado: ' + e.message);
      return;
    }

    state.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) state.recordedChunks.push(e.data);
    };

    state.mediaRecorder.onstop = () => {
      const blob = new Blob(state.recordedChunks, { type: state.recordingMimeType });
      const url = URL.createObjectURL(blob);
      dom.recPlayback.src = url;
      dom.recPlayback.dataset.blobUrl = url;
      dom.recPlayback.dataset.blobSize = blob.size;
      dom.recOutput.style.display = 'block';
      state.recordedChunks = [];

      // Generar video con chroma preview
      applyChromaToPreview(blob);
    };

    state.mediaRecorder.start();
    state.recording = true;
    dom.recStatus.textContent = '● GRABANDO';
    dom.recStatus.classList.add('recording');
    dom.recTimer.style.display = 'block';
    dom.recStart.disabled = true;
    dom.recStop.disabled = false;
    dom.recPrecount.disabled = true;

    // Timer
    const start = Date.now();
    state.timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      dom.recTimer.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }, 200);
  }

  function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    state.recording = false;
    dom.recStatus.textContent = '✓ Grabación detenida';
    dom.recStatus.classList.remove('recording');
    dom.recTimer.style.display = 'none';
    dom.recStart.disabled = false;
    dom.recStop.disabled = true;
    dom.recPrecount.disabled = false;
    if (state.timerInterval) clearInterval(state.timerInterval);

    // Ocultar teleprompter overlay
    dom.recTeleprompter.style.display = 'none';
  }

  // ============ CHROMA KEY EN TIEMPO REAL (preview) ============
  function applyChromaToPreview(blob) {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    video.src = URL.createObjectURL(blob);
    video.muted = true;
    video.loop = true;
    video.play();

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const stream = canvas.captureStream(30);
      dom.recPreview.srcObject = stream;
      dom.recPreviewGroup.style.display = 'block';

      const targetColor = hexToRgb(state.chromaColor);
      const tol = state.tolerance;

      function draw() {
        if (video.ended || video.paused) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = frame.data;

        // Aplicar fondo seleccionado
        const bgMode = dom.recBg.value;
        let bgR = 0, bgG = 0, bgB = 0;
        if (bgMode === 'bancoppel') { bgR = 0; bgG = 61; bgB = 122; }
        else if (bgMode === 'afore') { bgR = 0; bgG = 166; bgB = 81; }
        else if (bgMode === 'custom') {
          const c = hexToRgb(dom.recBgColor.value);
          bgR = c.r; bgG = c.g; bgB = c.b;
        }

        for (let i = 0; i < data.length; i += 4) {
          const dr = data[i] - targetColor.r;
          const dg = data[i + 1] - targetColor.g;
          const db = data[i + 2] - targetColor.b;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);

          if (dist < tol) {
            if (bgMode === 'transparent') {
              data[i + 3] = 0; // alpha 0
            } else if (bgMode !== 'none') {
              data[i] = bgR;
              data[i + 1] = bgG;
              data[i + 2] = bgB;
              data[i + 3] = 255;
            } else {
              // Sin reemplazar: solo ajustar bordes
              data[i + 3] = Math.max(0, (dist / tol) * 255);
            }
          }
        }

        ctx.putImageData(frame, 0, 0);
        requestAnimationFrame(draw);
      }

      draw();
    };
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  }

  // ============ SUBIR A PHP ============
  async function processInPhp() {
    if (!dom.recPlayback.dataset.blobUrl) {
      alert('No hay video para procesar');
      return;
    }

    dom.recProgress.style.display = 'block';
    dom.recProgressFill.style.width = '0%';
    dom.recProgressFill.textContent = '0%';
    dom.recProgressStatus.textContent = 'Preparando video...';

    const blob = await fetch(dom.recPlayback.dataset.blobUrl).then(r => r.blob());

    const formData = new FormData();
    formData.append('video', blob, 'recording.webm');
    formData.append('title', dom.tpTitle.value || 'Sin título');
    formData.append('brand', dom.tpBrand.value || 'bancoppel');
    formData.append('chroma_color', state.chromaColor);
    formData.append('tolerance', state.tolerance);
    formData.append('bg_mode', dom.recBg.value);
    formData.append('bg_color', dom.recBgColor.value);

    dom.recProgressStatus.textContent = 'Subiendo a servidor...';

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.round(e.loaded / e.total * 100);
          dom.recProgressFill.style.width = pct + '%';
          dom.recProgressFill.textContent = pct + '%';
          dom.recProgressStatus.textContent = `Subiendo... ${pct}%`;
        }
      };
      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.ok) {
              dom.recProgressFill.style.width = '100%';
              dom.recProgressFill.textContent = '✓ 100%';
              dom.recProgressStatus.textContent = `✓ Procesado · session_id: ${data.session_id}`;
              loadGallery();
            } else {
              dom.recProgressStatus.textContent = '✗ ' + data.error;
            }
          } catch (e) {
            dom.recProgressStatus.textContent = '✗ Respuesta inválida del servidor';
          }
        } else {
          dom.recProgressStatus.textContent = '✗ Error HTTP ' + xhr.status;
        }
      };
      xhr.onerror = () => {
        dom.recProgressStatus.textContent = '✗ Error de red';
      };
      xhr.open('POST', 'https://api.aguitech.com.mx/teleprompter-video/api/process.php');
      xhr.send(formData);
    } catch (e) {
      dom.recProgressStatus.textContent = '✗ ' + e.message;
    }
  }

  // ============ DESCARGAR ============
  function downloadWebm() {
    if (!dom.recPlayback.dataset.blobUrl) return;
    const a = document.createElement('a');
    a.href = dom.recPlayback.dataset.blobUrl;
    a.download = `teleprompter-${Date.now()}.webm`;
    a.click();
  }

  // ============ GALLERY ============
  async function loadGallery() {
    try {
      const r = await fetch('https://api.aguitech.com.mx/teleprompter-video/api/list.php');
      const data = await r.json();
      if (!data.ok) {
        document.getElementById('gallery-grid').innerHTML = '<div class="gallery-empty">No hay sesiones aún</div>';
        return;
      }
      renderGallery(data.sessions);
    } catch (e) {
      document.getElementById('gallery-grid').innerHTML = '<div class="gallery-empty">Backend no disponible · ejecutándose standalone</div>';
    }
  }

  function renderGallery(sessions) {
    const grid = document.getElementById('gallery-grid');
    if (!sessions.length) {
      grid.innerHTML = '<div class="gallery-empty">No hay sesiones grabadas aún. ¡Sé el primero!</div>';
      return;
    }
    grid.innerHTML = sessions.map(s => `
      <div class="gallery-card">
        <div class="gallery-thumb">${s.brand === 'afore' ? '🟢' : '🔵'}</div>
        <div class="gallery-info">
          <h4>${escapeHtml(s.title)}</h4>
          <p>
            <span>${s.frames || 0} frames</span>
            <span>${(s.duration || 0).toFixed(1)}s</span>
          </p>
          <p>
            <span>${s.brand || '—'}</span>
            <span>${new Date(s.created_at).toLocaleDateString()}</span>
          </p>
        </div>
      </div>
    `).join('');
  }

  // ============ EVENTS ============
  function bindEvents() {
    // Teleprompter sliders
    dom.tpSpeed.addEventListener('input', e => {
      state.tpSpeed = parseInt(e.target.value);
      dom.tpSpeedVal.textContent = state.tpSpeed;
    });
    dom.tpSize.addEventListener('input', e => {
      state.tpSize = parseInt(e.target.value);
      dom.tpSizeVal.textContent = state.tpSize;
      dom.tpContent.style.fontSize = state.tpSize + 'px';
    });
    dom.colorSwatches.forEach(b => {
      b.addEventListener('click', () => {
        state.tpColor = b.dataset.color;
        dom.tpContent.style.color = state.tpColor;
        dom.colorSwatches.forEach(s => s.classList.remove('active'));
        b.classList.add('active');
      });
    });

    // Templates
    dom.templateBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tpl = TEMPLATES[btn.dataset.template];
        if (tpl) {
          dom.tpEditor.value = tpl;
          renderTpContent();
          updateTpStats();
        }
      });
    });

    dom.tpEditor.addEventListener('input', () => {
      renderTpContent();
      updateTpStats();
    });

    dom.tpPlay.addEventListener('click', () => state.tpPlaying ? tpPause() : tpPlay());
    dom.tpReset.addEventListener('click', tpReset);

    // Continuar a grabación
    dom.tpLoadRecorder.addEventListener('click', () => {
      const text = dom.tpEditor.value;
      dom.recTpScroll.innerHTML = text.split(/\n\s*\n/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
      document.getElementById('step2').scrollIntoView({ behavior: 'smooth' });
    });

    // Recorder controls
    dom.recPrecount.addEventListener('click', () => {
      if (!state.stream) {
        initDevices().then(ok => {
          if (ok) recPrecount();
        });
      } else {
        recPrecount();
      }
    });

    dom.recStart.addEventListener('click', startRecording);
    dom.recStop.addEventListener('click', stopRecording);

    dom.recBg.addEventListener('change', e => {
      dom.recBgColor.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });

    dom.recChromaColor.addEventListener('input', e => {
      state.chromaColor = e.target.value;
    });

    dom.recTol.addEventListener('input', e => {
      state.tolerance = parseInt(e.target.value);
      dom.recTolVal.textContent = state.tolerance;
    });

    dom.recDownload.addEventListener('click', downloadWebm);
    dom.recProcess.addEventListener('click', processInPhp);

    // Atajos teclado
    document.addEventListener('keydown', e => {
      const tag = e.target.tagName;
      const inField = tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT';

      if (e.code === 'Space' && !inField) {
        e.preventDefault();
        state.tpPlaying ? tpPause() : tpPlay();
      } else if (e.key === 'r' && !inField) {
        tpReset();
      }
    });

    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const href = a.getAttribute('href');
        if (href.length > 1) {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            const top = target.getBoundingClientRect().top + window.scrollY - 80;
            window.scrollTo({ top, behavior: 'smooth' });
          }
        }
      });
    });
  }

  function recPrecount() {
    if (!state.stream) {
      initDevices().then(ok => {
        if (ok) recPrecount();
      });
      return;
    }
    // Mostrar teleprompter en pantalla
    dom.recTeleprompter.style.display = 'block';

    let n = 3;
    dom.recOverlay.style.display = 'flex';
    dom.recOverlay.style.alignItems = 'center';
    dom.recOverlay.style.justifyContent = 'center';
    dom.recOverlay.style.background = 'rgba(0,0,0,0.7)';
    dom.recOverlay.style.fontSize = '8rem';
    dom.recOverlay.style.fontWeight = '900';
    dom.recOverlay.style.color = 'var(--ac-yellow)';
    dom.recOverlay.innerHTML = `<span>${n}</span>`;

    const tick = () => {
      n--;
      if (n <= 0) {
        dom.recOverlay.style.cssText = '';
        dom.recOverlay.style.display = 'block';
        dom.recStatus.textContent = 'Listo para grabar';
        startRecording();
        return;
      }
      dom.recOverlay.innerHTML = `<span>${n}</span>`;
      setTimeout(tick, 1000);
    };
    setTimeout(tick, 1000);
  }

  // ============ INIT ============
  function init() {
    bindEvents();
    renderTpContent();
    updateTpStats();
    loadGallery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
