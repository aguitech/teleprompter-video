/* ==============================================================
   BanCoppel + Afore Coppel — Multi-Escena Teleprompter + Recorder
   Premium UI · Toast system · Enhanced gallery
   by AGUITECH · 2026
   ============================================================== */

(function () {
  'use strict';

  // ============ CONFIG ============
  const API_BASE = 'https://api.aguitech.com.mx/teleprompter-video/api';

  const state = {
    sessionId: null,
    sessionTitle: 'Nueva producción',
    brand: 'bancoppel',
    chromaColor: '#00ff00',
    tolerance: 80,
    bgMode: 'transparent',
    bgColor: '#003D7A',
    scenes: [],
  };

  const SCENE_STATUS = {
    EMPTY: 'empty',
    DRAFT: 'draft',
    RECORDING: 'recording',
    RECORDED: 'recorded',
    UPLOADING: 'uploading',
    PROCESSING: 'processing',
    PROCESSED: 'processed',
    ERROR: 'error',
  };

  const STATUS_LABELS = {
    empty: 'Vacío',
    draft: 'Borrador',
    recording: '● Grabando',
    recorded: '◉ Grabado',
    uploading: '⏳ Subiendo',
    processing: '⚙️ Procesando',
    processed: '✓ Listo',
    error: '✗ Error',
  };

  const STATUS_ICONS = {
    empty: '○',
    draft: '✎',
    recording: '●',
    recorded: '◉',
    uploading: '↑',
    processing: '⚙',
    processed: '✓',
    error: '✕',
  };

  const BRAND_LABELS = {
    bancoppel: '🏦 BanCoppel',
    afore: '💚 Afore Coppel',
    ambas: '🔄 Mixto',
  };

  const BRAND_COLORS = {
    bancoppel: 'var(--bancoppel-blue)',
    afore: 'var(--afore-green)',
    ambas: 'var(--accent-purple)',
  };

  // ============ TOAST SYSTEM ============
  function toast(msg, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    el.innerHTML = `<span style="font-size:16px;font-weight:700;">${icon}</span><span>${escapeHtml(msg)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toastIn 0.3s reverse';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ============ DOM ============
  const $ = id => document.getElementById(id);
  const dom = {
    sessionTitleInput: $('session-title'),
    sessionBrand: $('session-brand'),
    sceneCount: $('scene-count'),
    sessionIdBadge: $('session-id-badge'),
    sessionTitleDisplay: $('session-title-display'),
    btnNewSession: $('btn-new-session'),
    btnSaveSession: $('btn-save-session'),
    scenesGrid: $('scenes-grid'),
    sceneCountDisplay: $('scene-count-display'),
    btnRegenerate: $('btn-regenerate'),
    globalChromaColor: $('global-chroma-color'),
    globalTolerance: $('global-tolerance'),
    globalTolVal: $('global-tol-val'),
    globalBgMode: $('global-bg-mode'),
    globalBgColor: $('global-bg-color'),
    masterSessionId: $('master-session-id'),
    masterScenesCount: $('master-scenes-count'),
    masterRecordedCount: $('master-recorded-count'),
    btnProcessAll: $('btn-process-all'),
    btnProcessStatus: $('btn-process-status'),
    galleryGrid: $('gallery-grid'),
    galleryCount: $('gallery-count'),
    btnGalleryRefresh: $('btn-gallery-refresh'),
    sceneTemplate: $('scene-template'),
  };

  // ============ SCENE MANAGEMENT ============
  function generateScenes(count) {
    const existingByNum = {};
    state.scenes.forEach(s => { existingByNum[s.numero] = s; });

    state.scenes = [];
    for (let i = 1; i <= count; i++) {
      const existing = existingByNum[i];
      state.scenes.push({
        numero: i,
        texto: existing?.texto || '',
        status: existing?.texto ? SCENE_STATUS.DRAFT : SCENE_STATUS.EMPTY,
        mediaRecorder: null,
        recordedChunks: [],
        stream: null,
        blob: null,
        blobUrl: null,
        outputUrl: null,
        sceneId: existing?.sceneId || null,
        frames: existing?.frames || 0,
        duration: existing?.duration || 0,
        chromaHits: existing?.chromaHits || 0,
        timerInterval: null,
        startTime: 0,
      });
    }
    renderScenes();
    updateMaster();
  }

  function renderScenes() {
    dom.scenesGrid.innerHTML = '';
    state.scenes.forEach(scene => {
      const card = dom.sceneTemplate.content.cloneNode(true);
      const cardEl = card.querySelector('.scene-card');
      cardEl.dataset.scene = scene.numero;
      updateSceneCard(cardEl, scene);
      dom.scenesGrid.appendChild(cardEl);
      bindSceneEvents(cardEl, scene);
    });
  }

  function updateSceneCard(cardEl, scene) {
    cardEl.querySelector('.scene-num').textContent = scene.numero;
    const statusEl = cardEl.querySelector('.scene-status');
    statusEl.dataset.status = scene.status;
    statusEl.querySelector('.status-text').textContent = STATUS_LABELS[scene.status];
    cardEl.dataset.status = scene.status;

    const textEl = cardEl.querySelector('.scene-text');
    if (textEl.value !== scene.texto) textEl.value = scene.texto || '';

    const words = (scene.texto || '').trim().split(/\s+/).filter(Boolean).length;
    const chars = (scene.texto || '').length;
    cardEl.querySelector('.scene-words').textContent = `${words} palabras`;
    cardEl.querySelector('.scene-chars').textContent = `${chars} chars`;

    const outputEl = cardEl.querySelector('.scene-output');
    const playbackEl = cardEl.querySelector('.scene-playback');
    const dlMp4 = cardEl.querySelector('.btn-download-mp4');
    const viewFrames = cardEl.querySelector('.btn-view-frames');
    if (scene.outputUrl) {
      outputEl.style.display = 'block';
      playbackEl.src = scene.outputUrl;
      dlMp4.href = scene.outputUrl;
      const ts = Date.now();
      dlMp4.setAttribute('download', `${state.sessionId || 'session'}_scene_${scene.numero}_${ts}.mp4`);
      viewFrames.href = `${API_BASE}/frames.php?session=${state.sessionId}&scene=${scene.numero}`;
      const meta = outputEl.querySelector('.output-meta');
      if (meta) {
        meta.innerHTML = `
          <span>🎞️ ${scene.frames || 0} frames</span>
          <span>⏱️ ${(scene.duration || 0).toFixed(1)}s</span>
          <span>🎨 ${(scene.chromaHits || 0).toLocaleString()} px</span>
        `;
      }
    } else {
      outputEl.style.display = 'none';
    }
  }

  function updateAllSceneCards() {
    const cards = dom.scenesGrid.querySelectorAll('.scene-card');
    cards.forEach(cardEl => {
      const num = parseInt(cardEl.dataset.scene);
      const scene = state.scenes.find(s => s.numero === num);
      if (scene) updateSceneCard(cardEl, scene);
    });
  }

  function updateMaster() {
    dom.sessionIdBadge.textContent = state.sessionId || 'Sin sesión activa';
    dom.sessionTitleDisplay.textContent = state.sessionTitle || 'Nueva producción';
    dom.sceneCountDisplay.textContent = state.scenes.length;
    dom.masterSessionId.textContent = state.sessionId || '—';
    dom.masterScenesCount.textContent = state.scenes.length;
    const recorded = state.scenes.filter(s => s.blob).length;
    const processed = state.scenes.filter(s => s.outputUrl).length;
    dom.masterRecordedCount.textContent = `${recorded} grabadas / ${processed} procesadas`;
    dom.btnProcessAll.disabled = !state.sessionId || recorded === 0;

    // Brand badge color
    if (state.brand && dom.sessionIdBadge) {
      dom.sessionIdBadge.style.borderColor = BRAND_COLORS[state.brand];
      dom.sessionIdBadge.style.color = BRAND_COLORS[state.brand];
    }
  }

  // ============ SCENE EVENTS ============
  function bindSceneEvents(cardEl, scene) {
    const textEl = cardEl.querySelector('.scene-text');
    textEl.addEventListener('input', () => {
      scene.texto = textEl.value;
      if (scene.status === SCENE_STATUS.EMPTY && scene.texto) scene.status = SCENE_STATUS.DRAFT;
      if (!scene.texto && scene.status === SCENE_STATUS.DRAFT) scene.status = SCENE_STATUS.EMPTY;
      updateSceneCard(cardEl, scene);
    });

    cardEl.querySelector('.scene-collapse').addEventListener('click', () => {
      cardEl.classList.toggle('collapsed');
    });

    cardEl.querySelector('.btn-preview').addEventListener('click', () => {
      if (!scene.texto) { toast('Escribe el texto primero', 'error'); return; }
      openTpPreview(scene);
    });
    cardEl.querySelector('.btn-tp-play').addEventListener('click', () => {
      if (!scene.texto) { toast('Escribe el texto primero', 'error'); return; }
      openTpPreview(scene);
    });

    cardEl.querySelector('.btn-record').addEventListener('click', () => startRecording(scene));
    cardEl.querySelector('.btn-stop').addEventListener('click', () => stopRecording(scene));
    cardEl.querySelector('.btn-upload').addEventListener('click', () => uploadScene(scene));
  }

  // ============ TELEPROMPTER PREVIEW (modal) ============
  function openTpPreview(scene) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>📺 Escena ${scene.numero} · Preview Teleprompter</h3>
          <button class="modal-close" type="button">✕</button>
        </div>
        <div class="modal-body">
          <div class="tp-fullscreen" id="modal-tp">${escapeHtml(scene.texto).replace(/\n/g, '<br>')}</div>
          <div style="display:flex;justify-content:center;gap:8px;margin-top:14px;">
            <button id="modal-play" class="btn-primary">▶ Reproducir</button>
            <button id="modal-reset" class="btn-secondary">↻ Reiniciar</button>
            <button id="modal-close2" class="btn-secondary">✕ Cerrar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const tpEl = modal.querySelector('#modal-tp');
    let playing = false;
    let rafId = null;
    let lastTs = 0;

    function play() {
      playing = true;
      lastTs = performance.now();
      modal.querySelector('#modal-play').textContent = '⏸ Pausar';
      const tick = (ts) => {
        if (!playing) return;
        if (!ts) ts = performance.now();
        const dt = (ts - lastTs) / 1000;
        lastTs = ts;
        tpEl.scrollTop += 30 * dt;
        if (tpEl.scrollTop >= tpEl.scrollHeight - tpEl.clientHeight) {
          playing = false;
          modal.querySelector('#modal-play').textContent = '▶ Reproducir';
          toast(`Teleprompter de escena ${scene.numero} terminado`, 'success');
          return;
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }
    function pause() {
      playing = false;
      if (rafId) cancelAnimationFrame(rafId);
      modal.querySelector('#modal-play').textContent = '▶ Reproducir';
    }
    function reset() {
      pause();
      tpEl.scrollTop = 0;
    }
    function close() {
      pause();
      modal.remove();
    }

    modal.querySelector('#modal-play').addEventListener('click', () => playing ? pause() : play());
    modal.querySelector('#modal-reset').addEventListener('click', reset);
    modal.querySelector('#modal-close').addEventListener('click', close);
    modal.querySelector('#modal-close2').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
  }

  // ============ RECORDING ============
  async function startRecording(scene) {
    if (!scene.texto) { toast('Escribe el texto primero', 'error'); return; }

    const cardEl = dom.scenesGrid.querySelector(`[data-scene="${scene.numero}"]`);
    const videoWrap = cardEl.querySelector('.scene-video-wrap');
    const videoEl = cardEl.querySelector('.scene-video');
    const overlay = cardEl.querySelector('.scene-overlay');
    const timer = cardEl.querySelector('.scene-timer');
    const tpOverlay = cardEl.querySelector('.scene-tp-overlay');
    const tpScroll = cardEl.querySelector('.scene-tp-scroll');

    try {
      scene.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
    } catch (e) {
      toast('No se pudo acceder a cámara/mic: ' + e.message, 'error', 6000);
      return;
    }

    videoEl.srcObject = scene.stream;
    videoWrap.style.display = 'block';

    let n = 3;
    overlay.textContent = n;
    overlay.classList.add('recording');
    await new Promise(r => setTimeout(r, 600));
    const tick = () => {
      n--;
      if (n <= 0) {
        overlay.textContent = '● GRABANDO';
        startActualRecording(scene, videoEl, overlay, timer, tpOverlay, tpScroll);
        return;
      }
      overlay.textContent = n;
      setTimeout(tick, 1000);
    };
    setTimeout(tick, 200);
    toast('🎬 Preparando grabación escena ' + scene.numero + '...', 'info');
  }

  function startActualRecording(scene, videoEl, overlay, timer, tpOverlay, tpScroll) {
    tpOverlay.style.display = 'block';
    tpScroll.innerHTML = scene.texto.split('\n').map(p => `<p>${escapeHtml(p)}</p>`).join('');

    scene.recordedChunks = [];

    const mimeOptions = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    let mimeType = '';
    for (const m of mimeOptions) {
      if (MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
    }

    try {
      scene.mediaRecorder = new MediaRecorder(scene.stream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      toast('MediaRecorder error: ' + e.message, 'error');
      return;
    }

    scene.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) scene.recordedChunks.push(e.data);
    };

    scene.mediaRecorder.onstop = () => {
      const blob = new Blob(scene.recordedChunks, { type: scene.mediaRecorder.mimeType });
      scene.blob = blob;
      scene.blobUrl = URL.createObjectURL(blob);
      scene.status = SCENE_STATUS.RECORDED;

      if (scene.stream) scene.stream.getTracks().forEach(t => t.stop());

      videoEl.srcObject = null;
      videoEl.src = scene.blobUrl;
      videoEl.controls = true;
      videoEl.muted = false;

      updateAllSceneCards();
      updateMaster();
      toast(`✓ Escena ${scene.numero} grabada · ${(blob.size / 1024).toFixed(0)}KB`, 'success');
    };

    scene.mediaRecorder.start();
    scene.status = SCENE_STATUS.RECORDING;
    scene.startTime = Date.now();
    updateAllSceneCards();
    updateMaster();

    timer.style.display = 'block';
    scene.timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - scene.startTime) / 1000);
      timer.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    }, 200);

    const cardEl = dom.scenesGrid.querySelector(`[data-scene="${scene.numero}"]`);
    cardEl.querySelector('.btn-record').disabled = true;
    cardEl.querySelector('.btn-record').classList.add('recording');
    cardEl.querySelector('.btn-stop').disabled = false;
    cardEl.querySelector('.btn-upload').disabled = true;

    toast(`● Grabando escena ${scene.numero}`, 'info', 2000);
  }

  function stopRecording(scene) {
    if (scene.mediaRecorder && scene.mediaRecorder.state !== 'inactive') {
      scene.mediaRecorder.stop();
    }
    scene.status = SCENE_STATUS.RECORDED;
    if (scene.timerInterval) clearInterval(scene.timerInterval);

    const cardEl = dom.scenesGrid.querySelector(`[data-scene="${scene.numero}"]`);
    cardEl.querySelector('.btn-record').disabled = false;
    cardEl.querySelector('.btn-record').classList.remove('recording');
    cardEl.querySelector('.btn-stop').disabled = true;
    cardEl.querySelector('.btn-upload').disabled = false;

    cardEl.querySelector('.scene-tp-overlay').style.display = 'none';
    cardEl.querySelector('.scene-overlay').classList.remove('recording');

    updateAllSceneCards();
    updateMaster();
  }

  // ============ UPLOAD ============
  async function uploadScene(scene) {
    if (!scene.blob) { toast('No hay grabación para subir', 'error'); return; }
    if (!state.sessionId) {
      toast('Guarda la sesión primero (💾 Guardar sesión)', 'error', 5000);
      return;
    }

    const cardEl = dom.scenesGrid.querySelector(`[data-scene="${scene.numero}"]`);
    const progress = cardEl.querySelector('.scene-progress');
    const progressFill = cardEl.querySelector('.scene-progress-fill');
    const progressStatus = cardEl.querySelector('.scene-progress-status');

    progress.style.display = 'block';
    progressFill.style.width = '0%';
    progressFill.textContent = '0%';
    progressStatus.textContent = 'Subiendo a PHP...';
    scene.status = SCENE_STATUS.UPLOADING;
    updateAllSceneCards();

    const formData = new FormData();
    formData.append('session_id', state.sessionId);
    formData.append('numero_escena', scene.numero);
    formData.append('video', scene.blob, `scene_${scene.numero}.webm`);
    formData.append('chroma_color', state.chromaColor);
    formData.append('tolerance', state.tolerance);
    formData.append('bg_mode', state.bgMode);
    formData.append('bg_color', state.bgColor);

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.round(e.loaded / e.total * 50);
          progressFill.style.width = pct + '%';
          progressFill.textContent = pct + '%';
        }
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.ok) {
            progressFill.style.width = '100%';
            progressFill.textContent = '✓';
            progressStatus.textContent = `✓ Procesado · ${data.frames} frames · ${data.duration.toFixed(1)}s · ${data.chroma_hits.toLocaleString()} px chroma`;
            scene.status = SCENE_STATUS.PROCESSED;
            scene.outputUrl = data.output_url;
            scene.sceneId = data.scene_id;
            scene.frames = data.frames;
            scene.duration = data.duration;
            scene.chromaHits = data.chroma_hits;
            updateAllSceneCards();
            updateMaster();
            toast(`✓ Escena ${scene.numero} procesada · ${data.frames} frames`, 'success');
            resolve(data);
          } else {
            progressStatus.textContent = '✗ ' + data.error;
            scene.status = SCENE_STATUS.ERROR;
            updateAllSceneCards();
            toast('✗ Error: ' + data.error, 'error');
          }
        } catch (e) {
          progressStatus.textContent = '✗ Respuesta inválida';
          scene.status = SCENE_STATUS.ERROR;
          updateAllSceneCards();
          toast('✗ Respuesta inválida del servidor', 'error');
        }
      };
      xhr.onerror = () => {
        progressStatus.textContent = '✗ Error de red';
        scene.status = SCENE_STATUS.ERROR;
        updateAllSceneCards();
        toast('✗ Error de red al subir escena ' + scene.numero, 'error');
      };
      xhr.open('POST', `${API_BASE}/process.php`);
      xhr.send(formData);
    });
  }

  // ============ BATCH PROCESS ============
  async function processAll() {
    const pending = state.scenes.filter(s => s.blob && s.status !== SCENE_STATUS.PROCESSED);
    if (!pending.length) {
      toast('No hay escenas pendientes de procesar', 'info');
      return;
    }

    setProcessStatus(`⏳ Procesando ${pending.length} escenas...`, 'processing');
    dom.btnProcessAll.disabled = true;
    toast(`⚙️ Batch: procesando ${pending.length} escenas con chroma`, 'info');

    let okCount = 0;
    for (let i = 0; i < pending.length; i++) {
      const scene = pending[i];
      setProcessStatus(`⏳ Procesando escena ${i + 1}/${pending.length}...`, 'processing');
      try {
        await uploadScene(scene);
        okCount++;
      } catch (e) {
        setProcessStatus(`✗ Error en escena ${scene.numero}: ${e.message}`, 'error');
        toast('✗ Error en escena ' + scene.numero, 'error');
      }
    }

    setProcessStatus(`✓ ${okCount}/${pending.length} escenas procesadas`, 'success');
    dom.btnProcessAll.disabled = false;
    toast(`✓ Batch completo: ${okCount}/${pending.length} procesadas`, okCount === pending.length ? 'success' : 'error');
    loadGallery();
  }

  function setProcessStatus(msg, type) {
    dom.btnProcessStatus.textContent = msg;
    dom.btnProcessStatus.className = 'status-line ' + (type || '');
    if (type === 'success') dom.btnProcessStatus.style.color = 'var(--afore-green)';
    else if (type === 'error') dom.btnProcessStatus.style.color = 'var(--accent-pink)';
    else if (type === 'processing') dom.btnProcessStatus.style.color = 'var(--accent-purple)';
    else dom.btnProcessStatus.style.color = '';
  }

  // ============ SESSION MANAGEMENT ============
  async function saveSession() {
    state.sessionTitle = dom.sessionTitleInput.value || 'Sin título';
    state.brand = dom.sessionBrand.value;
    state.chromaColor = dom.globalChromaColor.value;
    state.tolerance = parseInt(dom.globalTolerance.value);
    state.bgMode = dom.globalBgMode.value;
    state.bgColor = dom.globalBgColor.value;

    state.scenes.forEach(s => {
      if (s.status === SCENE_STATUS.EMPTY && s.texto) s.status = SCENE_STATUS.DRAFT;
    });

    const payload = {
      id: state.sessionId,
      title: state.sessionTitle,
      brand: state.brand,
      chroma_color: state.chromaColor,
      tolerance: state.tolerance,
      bg_mode: state.bgMode,
      bg_color: state.bgColor,
      scenes: state.scenes.map(s => ({ numero: s.numero, texto: s.texto })),
    };

    try {
      const r = await fetch(`${API_BASE}/sessions.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (data.ok) {
        state.sessionId = data.session.id;
        dom.sessionTitleInput.value = data.session.title;
        updateAllSceneCards();
        updateMaster();
        setProcessStatus(`✓ Sesión guardada · ${data.session.scenes_count} escenas`, 'success');
        toast(`✓ Sesión "${data.session.title}" guardada en PHP+SQLite`, 'success', 5000);
        loadGallery();
      } else {
        setProcessStatus('✗ ' + data.error, 'error');
        toast('✗ Error guardando sesión: ' + data.error, 'error');
      }
    } catch (e) {
      setProcessStatus('✗ ' + e.message, 'error');
      toast('✗ Error de red: ' + e.message, 'error');
    }
  }

  function newSession() {
    if (state.scenes.some(s => s.blob) && !confirm('¿Descartar la sesión actual y crear una nueva?')) {
      return;
    }
    state.sessionId = null;
    state.sessionTitle = 'Nueva producción';
    dom.sessionTitleInput.value = state.sessionTitle;
    dom.sceneCount.value = 3;
    generateScenes(3);
    setProcessStatus('', '');
    updateMaster();
    toast('🆕 Nueva sesión iniciada', 'info');
  }

  // ============ GALLERY ============
  async function loadGallery() {
    try {
      const r = await fetch(`${API_BASE}/sessions.php`);
      const data = await r.json();
      if (!data.ok) {
        dom.galleryGrid.innerHTML = '<div class="gallery-empty">Backend no disponible · ejecutándose standalone</div>';
        dom.galleryCount.textContent = '— sesiones';
        return;
      }
      renderGallery(data.sessions);
    } catch (e) {
      dom.galleryGrid.innerHTML = '<div class="gallery-empty">Backend no disponible · ejecutándose standalone</div>';
      dom.galleryCount.textContent = '— sesiones';
    }
  }

  function renderGallery(sessions) {
    dom.galleryCount.textContent = `${sessions.length} sesión${sessions.length !== 1 ? 'es' : ''}`;

    if (!sessions.length) {
      dom.galleryGrid.innerHTML = `
        <div class="gallery-empty">
          🎬 No hay sesiones guardadas aún.<br>
          <span style="font-size:12px;margin-top:8px;display:inline-block;">Crea la primera arriba y se guardará automáticamente.</span>
        </div>`;
      return;
    }

    dom.galleryGrid.innerHTML = sessions.map(s => {
      const brandEmoji = s.brand === 'afore' ? '💚' : s.brand === 'ambas' ? '🔄' : '🏦';
      const brandLabel = BRAND_LABELS[s.brand] || s.brand;
      const date = new Date(s.created_at);
      const dateStr = date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const scenesProcessed = s.scenes_processed || 0;
      const scenesCount = s.scenes_count || 0;
      const duration = (s.total_duration || 0).toFixed(1);
      const totalPixels = s.total_chroma_hits || 0;

      // Generar miniaturas para cada escena (basado en estado)
      const scenesMini = [];
      for (let i = 1; i <= scenesCount; i++) {
        const isProcessed = i <= scenesProcessed;
        scenesMini.push(`<div class="scene-mini" ${isProcessed ? 'data-status="done"' : 'data-status="draft"'}>${isProcessed ? '✓' : i}</div>`);
      }

      return `
        <div class="gallery-card" data-id="${s.id}">
          <div class="gallery-thumb" style="background: linear-gradient(135deg, ${brandColor(s.brand, 0.3)}, rgba(139, 92, 246, 0.3));">
            <div class="gallery-thumb-placeholder">${brandEmoji}</div>
            <div class="gallery-thumb-overlay">
              <span class="gallery-thumb-badge">${scenesProcessed}/${scenesCount} procesadas</span>
            </div>
          </div>
          <div class="gallery-body">
            <h3 class="gallery-title">${escapeHtml(s.title)}</h3>
            <div class="gallery-meta">
              <span>${brandLabel}</span>
              <span>${dateStr}</span>
              <span>${timeStr}</span>
            </div>
            <div class="gallery-meta">
              <span>🎬 ${scenesCount} escenas</span>
              <span>⏱️ ${duration}s</span>
              <span>🎨 ${formatNumber(totalPixels)} px</span>
            </div>
            <div class="gallery-scenes-strip">
              ${scenesMini.join('')}
            </div>
            <div class="gallery-actions">
              <button class="btn-primary btn-load-session">📂 Cargar</button>
              <button class="btn-secondary btn-concat">🔗 Concat</button>
              <button class="btn-secondary btn-delete-session">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind events
    dom.galleryGrid.querySelectorAll('.gallery-card').forEach(card => {
      const id = card.dataset.id;
      card.querySelector('.btn-load-session').addEventListener('click', e => {
        e.stopPropagation();
        loadSession(id);
      });
      card.querySelector('.btn-concat').addEventListener('click', e => {
        e.stopPropagation();
        concatSession(id);
      });
      card.querySelector('.btn-delete-session').addEventListener('click', e => {
        e.stopPropagation();
        deleteSession(id);
      });
    });
  }

  function brandColor(brand, alpha = 1) {
    const colors = {
      bancoppel: [0, 102, 255],
      afore: [0, 255, 136],
      ambas: [139, 92, 246],
    };
    const [r, g, b] = colors[brand] || [0, 102, 255];
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function formatNumber(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  }

  async function concatSession(id) {
    toast(`🔗 Concatenando ${id}...`, 'info');
    try {
      const r = await fetch(`${API_BASE}/concat.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: id }),
      });
      const data = await r.json();
      if (data.ok) {
        toast(`✓ Concat listo · ${data.scenes_count} escenas · ${data.duration.toFixed(1)}s`, 'success', 6000);
        window.open(data.final_url, '_blank');
      } else {
        toast('✗ Error en concat: ' + data.error, 'error');
      }
    } catch (e) {
      toast('✗ Error: ' + e.message, 'error');
    }
  }

  async function deleteSession(id) {
    if (!confirm(`¿Eliminar la sesión "${id}" completa (BD + archivos)?`)) return;
    try {
      const r = await fetch(`${API_BASE}/sessions.php?id=${id}`, { method: 'DELETE' });
      const data = await r.json();
      if (data.ok) {
        toast('🗑️ Sesión eliminada', 'success');
        loadGallery();
      } else {
        toast('✗ Error: ' + data.error, 'error');
      }
    } catch (e) {
      toast('✗ Error: ' + e.message, 'error');
    }
  }

  async function loadSession(id) {
    try {
      const r = await fetch(`${API_BASE}/sessions.php?id=${id}`);
      const data = await r.json();
      if (!data.ok) { toast('Error cargando sesión', 'error'); return; }
      const session = data.session;
      state.sessionId = session.id;
      state.sessionTitle = session.title;
      state.brand = session.brand;
      state.chromaColor = session.chroma_color || '#00ff00';
      state.tolerance = session.tolerance || 80;
      state.bgMode = session.bg_mode || 'transparent';
      state.bgColor = session.bg_color || '#003D7A';

      dom.sessionTitleInput.value = session.title;
      dom.sessionBrand.value = session.brand;
      dom.globalChromaColor.value = state.chromaColor;
      dom.globalTolerance.value = state.tolerance;
      dom.globalTolVal.textContent = state.tolerance;
      dom.globalBgMode.value = state.bgMode;
      dom.globalBgColor.value = state.bgColor;
      dom.globalBgColor.style.display = state.bgMode === 'custom' ? 'inline-block' : 'none';

      generateScenes(session.scenes.length);
      session.scenes.forEach((sc, i) => {
        if (state.scenes[i]) {
          state.scenes[i].texto = sc.texto || '';
          state.scenes[i].outputUrl = sc.output_url;
          state.scenes[i].sceneId = sc.id;
          state.scenes[i].frames = sc.frames || 0;
          state.scenes[i].duration = sc.duration || 0;
          state.scenes[i].chromaHits = sc.chroma_hits || 0;
          state.scenes[i].status = sc.output_url ? SCENE_STATUS.PROCESSED : (sc.texto ? SCENE_STATUS.DRAFT : SCENE_STATUS.EMPTY);
        }
      });
      renderScenes();
      updateMaster();
      document.getElementById('step1').scrollIntoView({ behavior: 'smooth' });
      setProcessStatus(`✓ Sesión "${session.title}" cargada · ${session.scenes.length} escenas`, 'success');
      toast(`✓ Sesión "${session.title}" cargada`, 'success', 4000);
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  // ============ UTILS ============
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ============ EVENTS GLOBALES ============
  function bindGlobalEvents() {
    dom.sessionTitleInput.addEventListener('input', () => {
      state.sessionTitle = dom.sessionTitleInput.value;
      updateMaster();
    });

    dom.sceneCount.addEventListener('change', () => {
      const n = Math.max(1, Math.min(20, parseInt(dom.sceneCount.value) || 1));
      dom.sceneCount.value = n;
      generateScenes(n);
    });

    dom.btnRegenerate.addEventListener('click', () => {
      if (state.scenes.some(s => s.texto) && !confirm('¿Regenerar y perder los textos actuales?')) return;
      generateScenes(parseInt(dom.sceneCount.value) || 1);
    });

    dom.globalChromaColor.addEventListener('input', e => state.chromaColor = e.target.value);
    dom.globalTolerance.addEventListener('input', e => {
      state.tolerance = parseInt(e.target.value);
      dom.globalTolVal.textContent = state.tolerance;
    });
    dom.globalBgMode.addEventListener('change', e => {
      state.bgMode = e.target.value;
      dom.globalBgColor.style.display = state.bgMode === 'custom' ? 'inline-block' : 'none';
    });
    dom.globalBgColor.addEventListener('input', e => state.bgColor = e.target.value);

    dom.btnNewSession.addEventListener('click', newSession);
    dom.btnSaveSession.addEventListener('click', saveSession);
    dom.btnProcessAll.addEventListener('click', processAll);
    dom.btnGalleryRefresh.addEventListener('click', loadGallery);

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

  // ============ INIT ============
  function init() {
    bindGlobalEvents();
    generateScenes(3);
    updateMaster();
    loadGallery();
    setTimeout(() => toast('🎬 Teleprompter Video cargado · BanCoppel & Afore', 'success', 4000), 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
