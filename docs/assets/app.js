/* ==============================================================
   BanCoppel + Afore Coppel — Multi-Escena Teleprompter + Recorder
   ============================================================== */

(function () {
  'use strict';

  // ============ STATE GLOBAL ============
  const API_BASE = 'https://api.aguitech.com.mx/teleprompter-video/api';

  const state = {
    sessionId: null,
    sessionTitle: 'Nueva producción',
    brand: 'bancoppel',
    chromaColor: '#00ff00',
    tolerance: 80,
    bgMode: 'transparent',
    bgColor: '#003D7A',
    scenes: [],  // [{numero, texto, status, blobUrl, outputUrl, etc}]
  };

  const SCENE_STATUS = {
    EMPTY: 'empty',       // sin texto
    DRAFT: 'draft',       // con texto pero sin grabar
    RECORDING: 'recording',
    RECORDED: 'recorded', // grabado, sin subir
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

  const TEMPLATES = {
    bancoppel: '¡Bienvenido a BanCoppel! Tu banco de confianza, cerca de ti. Estamos en cada rincón de México para ofrecerte soluciones financieras accesibles. Con BanCoppel, tus ahorros están seguros y tus sueños más cerca. Gracias por confiar en nosotros.',
    afore: 'Afore Coppel: construye tu futuro hoy. ¿Sabías que el 65% de los mexicanos no tiene un plan de retiro? En Afore Coppel te ayudamos a construir el futuro que mereces. Pequeñas contribuciones hoy se convierten en tranquilidad mañana. Tu retiro, nuestra prioridad.',
    promo: '¡Promoción especial de temporada! Afore Coppel te ofrece bonificación en tus primeros 6 meses al abrir tu cuenta de ahorro para el retiro. Además, BanCoppel te regala una cuenta de ahorro sin comisiones al contratar tu plan de retiro. No dejes pasar esta oportunidad.',
  };

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
    state.scenes = [];
    for (let i = 1; i <= count; i++) {
      const existing = state.scenes[i - 1];
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
        timerInterval: null,
        startTime: 0,
        tpSpeed: 30,
        tpSize: 36,
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
    // Number
    cardEl.querySelector('.scene-num').textContent = scene.numero;
    // Status badge
    const statusEl = cardEl.querySelector('.scene-status');
    statusEl.dataset.status = scene.status;
    statusEl.querySelector('.status-text').textContent = STATUS_LABELS[scene.status];
    // Card border based on status
    cardEl.dataset.status = scene.status;
    // Textarea
    const textEl = cardEl.querySelector('.scene-text');
    if (textEl.value !== scene.texto) textEl.value = scene.texto || '';
    // Stats
    const words = (scene.texto || '').trim().split(/\s+/).filter(Boolean).length;
    const chars = (scene.texto || '').length;
    cardEl.querySelector('.scene-words').textContent = `${words} palabras`;
    cardEl.querySelector('.scene-chars').textContent = `${chars} chars`;

    // Output MP4
    const outputEl = cardEl.querySelector('.scene-output');
    const playbackEl = cardEl.querySelector('.scene-playback');
    const dlMp4 = cardEl.querySelector('.btn-download-mp4');
    const viewFrames = cardEl.querySelector('.btn-view-frames');
    if (scene.outputUrl) {
      outputEl.style.display = 'block';
      playbackEl.src = scene.outputUrl;
      dlMp4.href = scene.outputUrl;
      dlMp4.setAttribute('download', `${state.sessionId}_scene_${scene.numero}.mp4`);
      viewFrames.href = `https://api.aguitech.com.mx/teleprompter-video/api/frames.php?session=${state.sessionId}&scene=${scene.numero}`;
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
    dom.masterRecordedCount.textContent = recorded;
    dom.btnProcessAll.disabled = !state.sessionId || recorded === 0;
  }

  // ============ SCENE EVENTS ============
  function bindSceneEvents(cardEl, scene) {
    // Texto
    const textEl = cardEl.querySelector('.scene-text');
    textEl.addEventListener('input', () => {
      scene.texto = textEl.value;
      if (scene.status === SCENE_STATUS.EMPTY && scene.texto) scene.status = SCENE_STATUS.DRAFT;
      if (!scene.texto && scene.status === SCENE_STATUS.DRAFT) scene.status = SCENE_STATUS.EMPTY;
      updateSceneCard(cardEl, scene);
    });

    // Collapse
    cardEl.querySelector('.scene-collapse').addEventListener('click', () => {
      cardEl.classList.toggle('collapsed');
    });

    // Preview / TP play (simple — abrir dialog con el texto)
    cardEl.querySelector('.btn-preview').addEventListener('click', () => {
      if (!scene.texto) { alert('Escribe el texto primero'); return; }
      openTpPreview(scene);
    });
    cardEl.querySelector('.btn-tp-play').addEventListener('click', () => {
      if (!scene.texto) { alert('Escribe el texto primero'); return; }
      openTpPreview(scene);
    });

    // Record
    cardEl.querySelector('.btn-record').addEventListener('click', () => startRecording(scene));
    cardEl.querySelector('.btn-stop').addEventListener('click', () => stopRecording(scene));

    // Upload
    cardEl.querySelector('.btn-upload').addEventListener('click', () => uploadScene(scene));
  }

  // ============ TELEPROMPTER PREVIEW (modal) ============
  function openTpPreview(scene) {
    const modal = document.createElement('div');
    modal.className = 'tp-modal';
    modal.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 9999;
      display: flex; align-items: center; justify-content: center; padding: 2rem;
    `;
    modal.innerHTML = `
      <div style="max-width: 800px; width: 100%; background: #000; border-radius: 12px; overflow: hidden;">
        <div style="padding: 1rem 1.5rem; background: var(--bg-2); display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: var(--ac-yellow);">ESCENA ${scene.numero} — Preview</strong>
          <button id="modal-close" style="background: transparent; border: 1px solid var(--border); color: var(--text); width: 32px; height: 32px; border-radius: 6px; cursor: pointer;">✕</button>
        </div>
        <div id="modal-tp" style="height: 60vh; overflow-y: auto; padding: 50vh 5%; text-align: center; font-size: 2rem; font-weight: 700; line-height: 1.4; color: #fff; scrollbar-width: none;">
          <p>${escapeHtml(scene.texto).replace(/\n/g, '<br>')}</p>
          <p style="color: #555; margin-top: 2rem;">— FIN —</p>
        </div>
        <div style="padding: 1rem 1.5rem; background: var(--bg-2); display: flex; justify-content: center; gap: 0.5rem;">
          <button id="modal-play" style="padding: 0.7rem 1.5rem; background: linear-gradient(135deg, var(--bc-blue-light), var(--ac-green)); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">▶ Reproducir</button>
          <button id="modal-reset" style="padding: 0.7rem 1.5rem; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 6px; cursor: pointer;">↻ Reiniciar</button>
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

    modal.querySelector('#modal-play').addEventListener('click', () => playing ? pause() : play());
    modal.querySelector('#modal-reset').addEventListener('click', reset);
    modal.querySelector('#modal-close').addEventListener('click', () => {
      pause();
      modal.remove();
    });
  }

  // ============ RECORDING (MediaRecorder) ============
  async function startRecording(scene) {
    if (!scene.texto) { alert('Escribe el texto primero'); return; }

    const cardEl = dom.scenesGrid.querySelector(`[data-scene="${scene.numero}"]`);
    const videoWrap = cardEl.querySelector('.scene-video-wrap');
    const videoEl = cardEl.querySelector('.scene-video');
    const overlay = cardEl.querySelector('.scene-overlay');
    const timer = cardEl.querySelector('.scene-timer');
    const tpOverlay = cardEl.querySelector('.scene-tp-overlay');
    const tpScroll = cardEl.querySelector('.scene-tp-scroll');

    // Permisos + stream
    try {
      scene.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
    } catch (e) {
      alert('No se pudo acceder a cámara/mic: ' + e.message);
      return;
    }

    videoEl.srcObject = scene.stream;
    videoWrap.style.display = 'block';

    // Countdown
    let n = 3;
    overlay.textContent = n;
    overlay.classList.add('recording');
    await new Promise(r => setTimeout(r, 800));
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
      alert('MediaRecorder error: ' + e.message);
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

      // Stop tracks
      if (scene.stream) {
        scene.stream.getTracks().forEach(t => t.stop());
      }

      // Show download link for WebM
      videoEl.srcObject = null;
      videoEl.src = scene.blobUrl;
      videoEl.controls = true;
      videoEl.muted = false;

      updateAllSceneCards();
      updateMaster();
    };

    scene.mediaRecorder.start();
    scene.status = SCENE_STATUS.RECORDING;
    scene.startTime = Date.now();
    updateAllSceneCards();
    updateMaster();

    // Timer
    timer.style.display = 'block';
    scene.timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - scene.startTime) / 1000);
      timer.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    }, 200);

    // Update controls
    const cardEl = dom.scenesGrid.querySelector(`[data-scene="${scene.numero}"]`);
    cardEl.querySelector('.btn-record').disabled = true;
    cardEl.querySelector('.btn-stop').disabled = false;
    cardEl.querySelector('.btn-upload').disabled = true;
  }

  function stopRecording(scene) {
    if (scene.mediaRecorder && scene.mediaRecorder.state !== 'inactive') {
      scene.mediaRecorder.stop();
    }
    scene.status = SCENE_STATUS.RECORDED;
    if (scene.timerInterval) clearInterval(scene.timerInterval);

    const cardEl = dom.scenesGrid.querySelector(`[data-scene="${scene.numero}"]`);
    cardEl.querySelector('.btn-record').disabled = false;
    cardEl.querySelector('.btn-stop').disabled = true;
    cardEl.querySelector('.btn-upload').disabled = false;

    // Hide overlay elements
    cardEl.querySelector('.scene-tp-overlay').style.display = 'none';
    cardEl.querySelector('.scene-overlay').classList.remove('recording');

    updateAllSceneCards();
    updateMaster();
  }

  // ============ UPLOAD ============
  async function uploadScene(scene) {
    if (!scene.blob) { alert('No hay grabación para subir'); return; }
    if (!state.sessionId) {
      alert('Guarda la sesión primero (botón "💾 Guardar sesión")');
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
          const pct = Math.round(e.loaded / e.total * 50); // upload = 50% del proceso
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
            progressStatus.textContent = `✓ Procesado · ${data.frames} frames · ${data.duration}s`;
            scene.status = SCENE_STATUS.PROCESSED;
            scene.outputUrl = data.output_url;
            scene.sceneId = data.scene_id;
            updateAllSceneCards();
            updateMaster();
            resolve(data);
          } else {
            progressStatus.textContent = '✗ ' + data.error;
            scene.status = SCENE_STATUS.ERROR;
            updateAllSceneCards();
          }
        } catch (e) {
          progressStatus.textContent = '✗ Respuesta inválida';
          scene.status = SCENE_STATUS.ERROR;
          updateAllSceneCards();
        }
      };
      xhr.onerror = () => {
        progressStatus.textContent = '✗ Error de red';
        scene.status = SCENE_STATUS.ERROR;
        updateAllSceneCards();
      };
      xhr.open('POST', `${API_BASE}/process.php`);
      xhr.send(formData);
    });
  }

  // ============ BATCH PROCESS ============
  async function processAll() {
    const pending = state.scenes.filter(s => s.blob && s.status !== SCENE_STATUS.PROCESSED);
    if (!pending.length) return;

    setProcessStatus(`⏳ Procesando ${pending.length} escenas...`, 'processing');
    dom.btnProcessAll.disabled = true;

    for (let i = 0; i < pending.length; i++) {
      const scene = pending[i];
      setProcessStatus(`⏳ Procesando escena ${i + 1}/${pending.length}...`, 'processing');
      try {
        await uploadScene(scene);
      } catch (e) {
        setProcessStatus(`✗ Error en escena ${scene.numero}: ${e.message}`, 'error');
      }
    }

    setProcessStatus(`✓ ${pending.length} escenas procesadas`, 'success');
    dom.btnProcessAll.disabled = false;
    loadGallery();
  }

  function setProcessStatus(msg, type) {
    dom.btnProcessStatus.textContent = msg;
    dom.btnProcessStatus.className = 'status-line ' + (type || '');
  }

  // ============ SESSION MANAGEMENT ============
  async function saveSession() {
    state.sessionTitle = dom.sessionTitleInput.value || 'Sin título';
    state.brand = dom.sessionBrand.value;
    state.chromaColor = dom.globalChromaColor.value;
    state.tolerance = parseInt(dom.globalTolerance.value);
    state.bgMode = dom.globalBgMode.value;
    state.bgColor = dom.globalBgColor.value;

    // Update scenes statuses based on texto
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
        loadGallery();
      } else {
        setProcessStatus('✗ ' + data.error, 'error');
      }
    } catch (e) {
      setProcessStatus('✗ ' + e.message, 'error');
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
  }

  // ============ GALLERY ============
  async function loadGallery() {
    try {
      const r = await fetch(`${API_BASE}/sessions.php`);
      const data = await r.json();
      if (!data.ok) {
        dom.galleryGrid.innerHTML = '<div class="gallery-empty">Backend no disponible</div>';
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
    dom.galleryCount.textContent = `${sessions.length} sesiones`;
    if (!sessions.length) {
      dom.galleryGrid.innerHTML = '<div class="gallery-empty">No hay sesiones guardadas aún. ¡Crea la primera!</div>';
      return;
    }
    dom.galleryGrid.innerHTML = sessions.map(s => `
      <div class="gallery-card" data-id="${s.id}">
        <div class="gallery-thumb">
          ${s.brand === 'afore' ? '🟢' : s.brand === 'ambas' ? '🟣' : '🔵'}
          <span class="scenes-pill">${s.scenes_count} escenas</span>
        </div>
        <div class="gallery-info">
          <h4>${escapeHtml(s.title)}</h4>
          <p><span>${s.brand}</span><span>${new Date(s.created_at).toLocaleDateString()}</span></p>
          <p><span>${s.scenes_processed}/${s.scenes_count} procesadas</span><span>${(s.duration || 0).toFixed(1)}s</span></p>
        </div>
      </div>
    `).join('');

    // Click → cargar sesión
    dom.galleryGrid.querySelectorAll('.gallery-card').forEach(card => {
      card.addEventListener('click', () => loadSession(card.dataset.id));
    });
  }

  async function loadSession(id) {
    try {
      const r = await fetch(`${API_BASE}/sessions.php?id=${id}`);
      const data = await r.json();
      if (!data.ok) { alert('Error cargando sesión'); return; }
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
      dom.globalBgColor.style.display = state.bgMode === 'custom' ? 'block' : 'none';

      generateScenes(session.scenes.length);
      session.scenes.forEach((sc, i) => {
        if (state.scenes[i]) {
          state.scenes[i].texto = sc.texto || '';
          state.scenes[i].outputUrl = sc.output_url;
          state.scenes[i].sceneId = sc.id;
          state.scenes[i].status = sc.output_url ? SCENE_STATUS.PROCESSED : (sc.texto ? SCENE_STATUS.DRAFT : SCENE_STATUS.EMPTY);
        }
      });
      renderScenes();
      updateMaster();
      document.getElementById('step1').scrollIntoView({ behavior: 'smooth' });
      setProcessStatus(`✓ Sesión "${session.title}" cargada`, 'success');
    } catch (e) {
      alert('Error: ' + e.message);
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

  // ============ INIT ============
  function init() {
    bindGlobalEvents();
    generateScenes(3);
    updateMaster();
    loadGallery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
