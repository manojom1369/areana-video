(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const useIcon = (id) => `<svg><use href="#${id}"></use></svg>`;

  const state = {
    duration: 32,
    currentTime: 9.6,
    frameRate: 30,
    playing: false,
    activeTool: 'media',
    activeMedia: 'North Coast',
    activeLook: 'warm',
    hasVideo: false,
    objectUrls: [],
    timelineZoom: 48,
    toastTimer: null,
    raf: null,
    lastFrame: null,
    titleVisible: true,
  };

  const playButton = $('#playButton');
  const playIcon = $('#playIcon');
  const stageCenterPlay = $('#stageCenterPlay');
  const previewVideo = $('#previewVideo');
  const videoStage = $('#videoStage');
  const stageArt = $('#stageArt');
  const stageTitle = $('#stageTitle');
  const titleInput = $('#titleInput');
  const currentTimeLabel = $('#currentTime');
  const durationLabel = $('#durationTime');
  const footerDuration = $('#footerDuration');
  const playhead = $('#playhead');
  const toast = $('#toast');
  const toastMessage = $('#toastMessage');
  const mediaCount = $('#mediaCount');
  const mediaGrid = $('#mediaGrid');

  const formatTime = (seconds, frames = true) => {
    const safe = Math.max(0, Number(seconds) || 0);
    const whole = Math.floor(safe);
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    const frame = Math.floor((safe - whole) * state.frameRate);
    const base = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return frames ? `${base}:${String(frame).padStart(2, '0')}` : base;
  };

  const showToast = (message, duration = 2300) => {
    toastMessage.textContent = message;
    toast.classList.add('visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
  };

  const updateTimeUI = () => {
    currentTimeLabel.textContent = formatTime(state.currentTime, true);
    durationLabel.textContent = formatTime(state.duration, true);
    footerDuration.textContent = formatTime(state.duration, false);
    const percent = Math.max(0, Math.min(100, (state.currentTime / state.duration) * 100));
    playhead.style.left = `${percent}%`;
    const stageTime = $('.stage-bottom-meta span:first-child');
    if (stageTime) stageTime.textContent = `${formatTime(state.currentTime, false)} / ${formatTime(state.duration, false)}`;
    const code = $('.stage-timecode');
    if (code) code.textContent = formatTime(state.currentTime, true);
  };

  const updatePlayUI = () => {
    state.playing ? playIcon.innerHTML = '<use href="#i-pause"></use>' : playIcon.innerHTML = '<use href="#i-play"></use>';
    stageCenterPlay.innerHTML = state.playing ? useIcon('i-pause') : useIcon('i-play');
    playButton.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    stageCenterPlay.setAttribute('aria-label', state.playing ? 'Pause preview' : 'Play preview');
    videoStage.classList.toggle('playing', state.playing);
    videoStage.classList.toggle('paused', !state.playing);
  };

  const stopAnimation = () => {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = null;
    state.lastFrame = null;
  };

  const playbackFrame = (now) => {
    if (!state.playing) return;
    if (state.lastFrame === null) state.lastFrame = now;
    const delta = (now - state.lastFrame) / 1000;
    state.lastFrame = now;
    if (!state.hasVideo) {
      state.currentTime += delta;
      if (state.currentTime >= state.duration) state.currentTime = 0;
      updateTimeUI();
    }
    state.raf = requestAnimationFrame(playbackFrame);
  };

  const togglePlayback = () => {
    if (state.hasVideo && previewVideo.src) {
      if (previewVideo.paused) {
        previewVideo.play().catch(() => showToast('Click the preview to allow playback.'));
      } else {
        previewVideo.pause();
      }
      return;
    }
    state.playing = !state.playing;
    if (state.playing) {
      stopAnimation();
      state.raf = requestAnimationFrame(playbackFrame);
    } else {
      stopAnimation();
    }
    updatePlayUI();
  };

  const setCurrentTime = (time) => {
    const next = Math.max(0, Math.min(state.duration, Number(time) || 0));
    if (state.hasVideo && previewVideo.src) {
      previewVideo.currentTime = next;
    } else {
      state.currentTime = next;
      updateTimeUI();
    }
  };

  const seekFromEvent = (event) => {
    const content = $('.timeline-content');
    const rect = content.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    setCurrentTime((x / rect.width) * state.duration);
  };

  const setVideoSource = (url, title, duration) => {
    previewVideo.src = url;
    previewVideo.classList.add('visible');
    videoStage.classList.add('video-active');
    state.hasVideo = true;
    state.activeMedia = title;
    if (duration && Number.isFinite(duration)) state.duration = duration;
    previewVideo.load();
    try {
      if (previewVideo.readyState > 0) previewVideo.currentTime = Math.min(state.currentTime, state.duration);
    } catch (error) {
      // Metadata is still loading; the time will settle on the next update.
    }
    updateInspectorTitle(title);
    updateTimeUI();
    showToast(`${title} is ready to edit`);
  };

  const clearVideoSource = () => {
    previewVideo.pause();
    previewVideo.removeAttribute('src');
    previewVideo.load();
    previewVideo.classList.remove('visible');
    videoStage.classList.remove('video-active');
    state.hasVideo = false;
    state.playing = false;
    stopAnimation();
    updatePlayUI();
  };

  const updateInspectorTitle = (name) => {
    const inspectorTitle = $('#inspectorTitle');
    if (inspectorTitle) inspectorTitle.textContent = name;
  };

  const selectMediaCard = (card) => {
    $$('.media-card').forEach((item) => item.classList.remove('selected'));
    card.classList.add('selected');
    const source = card.dataset.src;
    const title = card.querySelector('.media-card-name')?.textContent.trim() || 'Untitled clip';
    const duration = Number(card.dataset.duration);
    state.duration = Number.isFinite(duration) && duration > 0 ? duration : 32;
    state.currentTime = Math.min(state.currentTime, state.duration);
    state.activeMedia = title;
    updateInspectorTitle(title);
    if (source) {
      setVideoSource(source, title, duration);
    } else {
      stageArt.style.backgroundImage = '';
      stageArt.style.backgroundSize = '';
      stageArt.style.backgroundPosition = '';
      stageArt.classList.remove('image-background');
      clearVideoSource();
      updateTimeUI();
      showToast(`${title} added to the preview`);
    }
  };

  const addUploadedCard = (file, url) => {
    const card = document.createElement('button');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const isImage = file.type.startsWith('image/');
    const title = file.name.replace(/\.[^/.]+$/, '').slice(0, 28) || 'Untitled media';
    card.className = 'media-card uploaded-card';
    card.dataset.media = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    card.dataset.src = url;
    card.dataset.kind = isVideo ? 'video' : isAudio ? 'audio' : isImage ? 'image' : 'file';
    card.innerHTML = `
      <span class="media-thumbnail upload-thumb ${isAudio ? 'audio-thumb' : isImage ? 'image-thumb' : ''}">
        <span class="uploaded-file-icon">${isAudio ? useIcon('i-music') : isImage ? useIcon('i-grid') : useIcon('i-play')}</span>
        <span class="media-length">${isAudio ? 'AUDIO' : isImage ? 'IMAGE' : 'NEW'}</span>
      </span>
      <span class="media-card-name"></span><span class="media-card-meta">${isAudio ? 'Audio file' : isImage ? 'Image file' : 'Local video'}</span>`;
    card.querySelector('.media-card-name').textContent = title;
    card.addEventListener('click', () => {
      if (isVideo) {
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => {
          card.dataset.duration = String(probe.duration || 32);
          setVideoSource(url, title, probe.duration || 32);
          selectMediaCardVisual(card);
        };
        probe.src = url;
      } else if (isImage) {
        const image = new Image();
        image.onload = () => {
          stageArt.style.backgroundImage = `url("${url}")`;
          stageArt.style.backgroundSize = 'cover';
          stageArt.style.backgroundPosition = 'center';
          stageArt.classList.add('image-background');
          clearVideoSource();
          selectMediaCardVisual(card);
          updateInspectorTitle(title);
          showToast(`${title} is on the canvas`);
        };
        image.src = url;
      } else {
        selectMediaCardVisual(card);
        showToast(`${title} is available in your project media`);
      }
    });
    mediaGrid.appendChild(card);
    return card;
  };

  const selectMediaCardVisual = (card) => {
    $$('.media-card').forEach((item) => item.classList.remove('selected'));
    card.classList.add('selected');
    const title = card.querySelector('.media-card-name')?.textContent.trim() || 'Untitled clip';
    state.activeMedia = title;
    updateInspectorTitle(title);
    updateTimeUI();
  };

  const processFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      state.objectUrls.push(url);
      const card = addUploadedCard(file, url);
      if (file.type.startsWith('video/') && !state.hasVideo) {
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => {
          card.dataset.duration = String(probe.duration || 32);
          setVideoSource(url, card.querySelector('.media-card-name').textContent, probe.duration || 32);
          selectMediaCardVisual(card);
        };
        probe.src = url;
      }
    });
    mediaCount.textContent = `${$$('.media-card').length} items`;
    showToast(files.length === 1 ? `${files[0].name} uploaded` : `${files.length} files uploaded`);
  };

  const setTool = (tool) => {
    state.activeTool = tool;
    $$('.asset-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tool === tool));
    $$('.asset-content').forEach((content) => content.classList.add('hidden'));
    const panel = $(`#${tool}Tool`);
    if (panel) panel.classList.remove('hidden');
  };

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const setTitleText = (value) => {
    const text = (value || 'Make room for\nthe in-between.').trim();
    const lines = text.split(/\r?\n/);
    titleInput.value = text;
    stageTitle.innerHTML = lines.map((line, index) => {
      const safeLine = escapeHtml(line);
      return index === lines.length - 1 ? `<em>${safeLine}</em>` : safeLine;
    }).join('<br>');
  };

  const addText = (value, isCustom = false) => {
    let text = value;
    if (isCustom) {
      text = window.prompt('What should the title card say?', 'Type something beautiful');
      if (!text) return;
    }
    setTitleText(text);
    state.titleVisible = true;
    $('#stageCopy').style.display = '';
    showToast('Title card added to the timeline');
  };

  const openExport = () => {
    $('#exportModal').classList.remove('hidden');
  };

  const closeExport = () => {
    $('#exportModal').classList.add('hidden');
  };

  // Playback controls
  [playButton, stageCenterPlay].forEach((button) => button.addEventListener('click', togglePlayback));
  previewVideo.addEventListener('play', () => {
    state.playing = true;
    updatePlayUI();
    stopAnimation();
    state.raf = requestAnimationFrame(playbackFrame);
  });
  previewVideo.addEventListener('pause', () => {
    state.playing = false;
    stopAnimation();
    updatePlayUI();
  });
  previewVideo.addEventListener('timeupdate', () => {
    state.currentTime = previewVideo.currentTime;
    updateTimeUI();
  });
  previewVideo.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(previewVideo.duration)) {
      state.duration = previewVideo.duration;
      updateTimeUI();
    }
  });
  previewVideo.addEventListener('ended', () => {
    state.currentTime = state.duration;
    updateTimeUI();
    state.playing = false;
    updatePlayUI();
  });

  // Timeline click and drag seeking
  let draggingPlayhead = false;
  $('.timeline-content').addEventListener('pointerdown', (event) => {
    if (event.target.closest('.timeline-clip')) return;
    draggingPlayhead = true;
    $('.timeline-content').setPointerCapture?.(event.pointerId);
    seekFromEvent(event);
  });
  $('.timeline-content').addEventListener('pointermove', (event) => {
    if (draggingPlayhead) seekFromEvent(event);
  });
  $('.timeline-content').addEventListener('pointerup', () => { draggingPlayhead = false; });
  $('.timeline-content').addEventListener('pointercancel', () => { draggingPlayhead = false; });

  // Asset tools
  $$('.asset-tab').forEach((tab) => tab.addEventListener('click', () => setTool(tab.dataset.tool)));
  $('#fileInput').addEventListener('change', (event) => processFiles(event.target.files));
  const uploadZone = $('#uploadZone');
  ['dragenter', 'dragover'].forEach((eventName) => uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((eventName) => uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove('dragging');
  }));
  uploadZone.addEventListener('drop', (event) => processFiles(event.dataTransfer.files));
  $$('.media-card').forEach((card) => card.addEventListener('click', () => selectMediaCard(card)));

  // Text presets and music/stickers
  $$('.text-preset').forEach((preset) => preset.addEventListener('click', () => addText(preset.dataset.addText)));
  $$('.music-row').forEach((row) => row.addEventListener('click', () => {
    const musicName = row.dataset.music || 'First light';
    const audioClip = $('.audio-clip .clip-name');
    if (audioClip) audioClip.textContent = musicName;
    showToast(`${musicName} added to the audio track`);
  }));
  $$('.sticker-button').forEach((button) => button.addEventListener('click', () => {
    const sticker = button.dataset.sticker || '✦';
    let element = $('.stage-sticker');
    if (!element) {
      element = document.createElement('div');
      element.className = 'stage-sticker';
      videoStage.appendChild(element);
    }
    element.textContent = sticker;
    showToast(`${sticker} sticker added`);
  }));
  $('.outline-action')?.addEventListener('click', (event) => {
    if (event.currentTarget.closest('#textTool')) addText('', true);
  });

  // Canvas and inspector controls
  $('.toolbar-label').addEventListener('click', () => {
    videoStage.classList.toggle('show-guides');
    showToast(videoStage.classList.contains('show-guides') ? 'Safe area guides on' : 'Safe area guides off');
  });
  $('#zoomRange').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    $('#zoomValue').textContent = `${value}%`;
    videoStage.style.transform = `scale(${value / 78})`;
  });
  $('#scaleRange').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    $('#scaleValue').textContent = `${value}%`;
    $('#stageCopy').style.transform = `scale(${value / 100})`;
    $('#stageCopy').style.transformOrigin = 'top left';
  });
  titleInput.addEventListener('input', (event) => setTitleText(event.target.value));
  $$('.look-card').forEach((card) => card.addEventListener('click', () => {
    $$('.look-card').forEach((item) => item.classList.remove('selected'));
    card.classList.add('selected');
    state.activeLook = card.dataset.look;
    stageArt.style.filter = state.activeLook === 'mono' ? 'grayscale(1)' : state.activeLook === 'fade' ? 'saturate(.55) brightness(1.12)' : state.activeLook === 'clean' ? 'saturate(.8) contrast(1.12)' : 'none';
    showToast(`${card.querySelector('small').textContent} look applied`);
  }));
  $('#autoColorButton').addEventListener('click', () => {
    stageArt.style.filter = 'saturate(1.05) contrast(1.04)';
    showToast('Auto color applied');
  });
  $$('.property-tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.property-tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    showToast(`${tab.textContent} controls selected`);
  }));
  $$('.style-button').forEach((button) => button.addEventListener('click', () => button.classList.toggle('active')));

  $$('.timeline-clip').forEach((clip) => clip.addEventListener('click', (event) => {
    event.stopPropagation();
    $$('.timeline-clip').forEach((item) => item.classList.remove('selected-clip'));
    clip.classList.add('selected-clip');
    updateInspectorTitle(clip.dataset.clip || 'Selected layer');
    showToast(`${clip.dataset.clip || 'Layer'} selected`);
  }));

  // Timeline zoom buttons
  const setTimelineZoom = (value) => {
    state.timelineZoom = Math.max(25, Math.min(100, value));
    $('#timelineZoomFill').style.width = `${state.timelineZoom}%`;
    $('.timeline-content').style.minWidth = `${Math.max(0, (state.timelineZoom - 48) * 7)}px`;
  };
  $('#timelineZoomOut').addEventListener('click', () => setTimelineZoom(state.timelineZoom - 10));
  $('#timelineZoomIn').addEventListener('click', () => setTimelineZoom(state.timelineZoom + 10));

  // Export modal and project actions
  $('#exportButton').addEventListener('click', openExport);
  $('#closeExport').addEventListener('click', closeExport);
  $('#exportModal').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeExport(); });
  $('#modalExportButton').addEventListener('click', () => {
    const button = $('#modalExportButton');
    button.disabled = true;
    button.querySelector('span:nth-child(2)').textContent = 'Preparing export…';
    showToast('Export is being prepared', 3500);
    setTimeout(() => {
      button.disabled = false;
      button.querySelector('span:nth-child(2)').textContent = 'Export video';
      closeExport();
      showToast('Your video is ready to download', 3200);
    }, 1400);
  });
  $('#newProjectButton').addEventListener('click', () => {
    const name = window.prompt('Name your new project', 'Untitled project');
    if (!name) return;
    $('#projectNameButton').childNodes[0].textContent = `${name} `;
    showToast(`${name} created`);
  });
  $('#projectNameButton').addEventListener('click', () => {
    const current = $('#projectNameButton').childNodes[0].textContent.trim();
    const name = window.prompt('Rename project', current);
    if (!name) return;
    $('#projectNameButton').childNodes[0].textContent = `${name} `;
    showToast('Project renamed');
  });

  // Generic feedback buttons
  $$('[data-toast]').forEach((button) => button.addEventListener('click', () => showToast(button.dataset.toast)));
  $('#magicAction').addEventListener('click', () => {
    setTimeout(() => showToast('Found 4 moments with the most energy'), 300);
    showToast('Scanning your footage…', 900);
  });
  $('[data-add-text="Type something beautiful"]')?.addEventListener('click', () => addText('', true));

  // Keyboard shortcuts
  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (event.key === 'Escape') closeExport();
    if (event.code === 'Space' && !typing) {
      event.preventDefault();
      togglePlayback();
    }
    if (event.key === 'ArrowLeft' && !typing) setCurrentTime(state.currentTime - .5);
    if (event.key === 'ArrowRight' && !typing) setCurrentTime(state.currentTime + .5);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      $('#newProjectButton').click();
    }
  });

  // Startup state
  setTitleText(titleInput.value);
  updateTimeUI();
  updatePlayUI();
  setTimelineZoom(state.timelineZoom);
  setTimeout(() => showToast('Saved just now', 1800), 650);
})();
