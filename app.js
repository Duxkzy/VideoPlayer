// Video Player: plain JavaScript, no libraries.
// Everything runs in your browser, the videos never leave your device.
'use strict';

/* grab what we need from the page */
const $ = (selector) => document.querySelector(selector);

const fileInput   = $('#fileInput');
const subsInput   = $('#subsInput');
const dropzone    = $('#dropzone');
const stage       = $('#stage');
const player      = $('#player');
const video       = $('#video');
const controls    = $('#controls');
const progress    = $('#progress');
const tooltip     = $('#tooltip');
const playBtn     = $('#playBtn');
const bigPlayBtn  = $('#bigPlay');
const muteBtn     = $('#muteBtn');
const volumeInput = $('#volume');
const currentEl   = $('#current');
const durationEl  = $('#duration');
const ccBtn       = $('#ccBtn');
const speedBtn    = $('#speedBtn');
const pipBtn      = $('#pipBtn');
const fsBtn       = $('#fsBtn');
const captionsEl  = $('#captions');
const osdEl       = $('#osd');
const resumeBox   = $('#resume');
const resumeText  = $('#resumeText');
const menu        = $('#menu');
const titleEl     = $('#title');
const metaEl      = $('#meta');
const plItems     = $('#plItems');
const plCount     = $('#plCount');
const openBtn     = $('#openBtn');
const installBtn  = $('#installBtn');
const toast       = $('#toast');

/* what's going on right now */
const playlist = [];      // { file, key, duration, subs }
let currentIndex = -1;
let objectUrl = null;     // temporary blob: address of the video on screen
let openMode = 'play';    // 'play' = add and watch now, 'queue' = just add to the list

const current = () => playlist[currentIndex] || null;

// localStorage can throw (private mode, blocked storage…), so tiptoe around it
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};


/* opening files */
$('#pickBtn').addEventListener('click', () => pickVideos('play'));
openBtn.addEventListener('click', () => pickVideos('play'));
$('#addBtn').addEventListener('click', () => pickVideos('queue'));
$('#clearBtn').addEventListener('click', closeVideo);

function pickVideos(mode) {
  openMode = mode;
  fileInput.click();
}

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files, { play: openMode === 'play' });
  fileInput.value = '';   // so picking the same file again still counts as a change
  openMode = 'play';
});
fileInput.addEventListener('cancel', () => { openMode = 'play'; });

subsInput.addEventListener('change', () => {
  const file = subsInput.files[0];
  if (file && current()) loadSubtitles(file, current());
  subsInput.value = '';
});

const isSubtitle = (file) => /\.(srt|vtt)$/i.test(file.name);
const isVideo = (file) => !isSubtitle(file) && (!file.type || /^(video|audio)\//.test(file.type));

// how we recognize "the same video" next time: name + size + date, never the content
const fileKey = (file) => `${file.name}|${file.size}|${file.lastModified}`;
const baseName = (name) => name.replace(/\.[^.]+$/, '').toLowerCase();

function addFiles(fileList, { play }) {
  const files = Array.from(fileList);
  const rejected = files.filter((file) => !isVideo(file) && !isSubtitle(file));
  if (rejected.length === 1) showToast(`"${rejected[0].name}" no parece un video.`);
  if (rejected.length > 1) showToast(`${rejected.length} archivos no parecen videos.`);

  const added = files.filter(isVideo).map((file) => ({ file, key: fileKey(file), duration: null, subs: null }));
  playlist.push(...added);

  // subtitles stick to the video with the same name (movie.mp4 + movie.srt),
  // otherwise to the video you just opened, otherwise to the one on screen
  for (const file of files.filter(isSubtitle)) {
    const target = findSubtitleTarget(file, added);
    if (target) loadSubtitles(file, target);
    else showToast('Primero abre un video y después sus subtítulos.');
  }

  if (added.length && (play || currentIndex === -1)) loadItem(playlist.indexOf(added[0]));
  else renderPlaylist();
  if (added.length) probeDurations();
}

function findSubtitleTarget(file, added) {
  const subtitle = baseName(file.name);
  const matches = (item) => {
    const name = baseName(item.file.name);
    return subtitle === name || subtitle.startsWith(`${name}.`);   // "movie.es.srt" counts too
  };
  return added.find(matches) || playlist.find(matches) || added[0] || current();
}

function loadItem(index, { autoplay = true } = {}) {
  const item = playlist[index];
  if (!item) return;
  savePosition();   // remember where we were in the previous one
  closeMenu();
  currentIndex = index;

  // the browser reads the file straight from your disk, nothing gets uploaded
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(item.file);

  // textContent, never innerHTML: a file named "<img src=x onerror=...>" is just text here
  titleEl.textContent = item.file.name;
  metaEl.textContent = formatSize(item.file.size);
  document.title = `${item.file.name} · Video Player`;
  pendingResume = savedPosition(item);
  resumeBox.hidden = true;

  dropzone.hidden = true;
  stage.hidden = false;
  openBtn.hidden = false;
  document.activeElement?.blur();

  video.src = objectUrl;
  showSubtitles();
  renderPlaylist();
  if (autoplay) video.play().catch(() => {});   // if the browser blocks autoplay, it just waits for a tap
  if (fullscreenElement()) osd(item.file.name);
}

// back to the first screen, empty list
function closeVideo() {
  savePosition();
  if (fullscreenElement()) exitFullscreen();
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  closeMenu();
  playlist.length = 0;
  currentIndex = -1;
  video.removeAttribute('src');
  video.load();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  showSubtitles();
  renderPlaylist();
  resumeBox.hidden = true;
  stage.hidden = true;
  dropzone.hidden = false;
  openBtn.hidden = true;
  document.title = 'Video Player';
}

function removeItem(index, { autoplay } = {}) {
  if (index === currentIndex) savePosition();
  const wasPlaying = !video.paused;
  playlist.splice(index, 1);
  if (!playlist.length) {
    closeVideo();
    return;
  }
  if (index === currentIndex) {
    currentIndex = -1;   // so loadItem doesn't save a position for the wrong video
    loadItem(Math.min(index, playlist.length - 1), { autoplay: autoplay ?? wasPlaying });
  } else {
    if (index < currentIndex) currentIndex--;
    renderPlaylist();
  }
}

// a file the browser can't play gets kicked off the list and we move on to the next one
video.addEventListener('error', () => {
  const item = current();
  if (!item || !video.getAttribute('src')) return;
  showToast(`No se puede reproducir "${item.file.name}". Puede estar dañado o en un formato que tu navegador no soporta (MP4 y WebM funcionan en todos lados).`);
  removeItem(currentIndex, { autoplay: true });
});


/* drag and drop (on a computer) */
let dragDepth = 0;
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

function stopDragging() {
  dragDepth = 0;
  document.body.classList.remove('is-dragging');
}

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  document.body.classList.add('is-dragging');
});
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();   // without this the browser won't let you drop
  e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', (e) => {
  if (hasFiles(e) && --dragDepth <= 0) stopDragging();
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();   // otherwise the browser opens the file in a new tab
  stopDragging();
  addFiles(e.dataTransfer.files, { play: true });
});
// cancel a drag with Esc and some browsers never tell us. No mouse moves arrive
// while you're dragging, so the first one we get means the drag is over
window.addEventListener('pointermove', () => {
  if (dragDepth) stopDragging();
});


/* play / pause */
function togglePlay() {
  if (!current()) return;
  if (video.paused || video.ended) video.play().catch(() => {});
  else video.pause();
}

video.addEventListener('play', updatePlayState);
video.addEventListener('pause', updatePlayState);
video.addEventListener('emptied', updatePlayState);

function updatePlayState() {
  const paused = video.paused;
  const label = paused ? 'Reproducir' : 'Pausar';
  player.classList.toggle('is-paused', paused);
  stage.classList.toggle('is-playing', !paused);
  setButton(playBtn, paused ? 'play' : 'pause', label);
  setButton(bigPlayBtn, paused ? 'play' : 'pause', label);
  showControls();
  if (!paused) startProgressLoop();
}

// every button in the player says what it does with data-action="..."
const actions = {
  play: togglePlay,
  back: () => seekBy(-10),
  forward: () => seekBy(10),
  prev: playPrevious,
  next: playNext,
  mute: toggleMute,
  subs: toggleSubtitlesMenu,
  speed: toggleSpeedMenu,
  pip: togglePip,
  fullscreen: toggleFullscreen,
};
player.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  if (button) actions[button.dataset.action](button, e);
});


/* clicking or tapping the video itself.
   mouse: play/pause, and double click for fullscreen.
   finger: show/hide the controls, double tap on a side to jump 10 s (like YouTube) */
const DOUBLE_TAP_MS = 280;
let pointerType = 'mouse';
let tapTimer = 0;
let lastTap = { time: 0, side: '' };
let tapStreak = { side: '', until: 0 };   // after a double tap, every extra tap keeps jumping
let swallowClick = false;                 // that click was only closing a menu

player.addEventListener('pointerdown', (e) => { pointerType = e.pointerType; }, true);

video.addEventListener('click', (e) => {
  if (swallowClick) {
    swallowClick = false;
    return;
  }
  if (pointerType === 'mouse') {
    togglePlay();
    return;
  }

  const side = tapSide(e);
  const now = performance.now();
  const doubleTap = side && side === lastTap.side && now - lastTap.time < DOUBLE_TAP_MS;
  const streak = side && side === tapStreak.side && now < tapStreak.until;
  clearTimeout(tapTimer);
  if (doubleTap || streak) {
    lastTap = { time: 0, side: '' };
    tapStreak = { side, until: now + 700 };
    seekBy(side === 'left' ? -10 : 10);
    return;
  }
  lastTap = { time: now, side };
  // on the sides, wait a moment in case a second tap is coming
  tapTimer = setTimeout(toggleControls, side ? DOUBLE_TAP_MS : 0);
});

video.addEventListener('dblclick', () => {
  if (pointerType === 'mouse') toggleFullscreen();
});

function tapSide(e) {
  const box = player.getBoundingClientRect();
  const x = (e.clientX - box.left) / box.width;
  return x < 0.35 ? 'left' : x > 0.65 ? 'right' : '';
}

function toggleControls() {
  if (player.classList.contains('controls-hidden')) showControls();
  else hideControls();
}

// loading ring
video.addEventListener('waiting', () => player.classList.add('is-waiting'));
for (const type of ['playing', 'pause', 'seeked', 'canplay', 'emptied']) {
  video.addEventListener(type, () => player.classList.remove('is-waiting'));
}


/* time and progress bar */
video.addEventListener('loadedmetadata', () => {
  const { videoWidth: w, videoHeight: h } = video;
  stage.style.setProperty('--ratio', w && h ? w / h : 16 / 9);
  stage.classList.toggle('is-portrait', h > w);
  const item = current();
  if (item) metaEl.textContent = w && h ? `${formatSize(item.file.size)} · ${w}×${h}` : formatSize(item.file.size);
  resumeIfSaved();
});

video.addEventListener('durationchange', () => {
  const item = current();
  if (item && item.duration === null && Number.isFinite(video.duration)) {
    item.duration = video.duration;
    updateDurationLabel(item);
  }
  durationEl.textContent = Number.isFinite(video.duration) ? formatTime(video.duration) : '--:--';
  renderProgress();
});

video.addEventListener('timeupdate', () => {
  if (!scrubbing) renderProgress();
  renderCues();
  if (performance.now() - lastPositionSave > 5000) savePosition();
});

function renderProgress(time = video.currentTime) {
  const duration = video.duration;
  const ratio = duration > 0 && Number.isFinite(duration) ? Math.min(time / duration, 1) : 0;
  progress.style.setProperty('--p', ratio);
  const text = formatTime(time);
  if (currentEl.textContent !== text) {
    currentEl.textContent = text;
    progress.setAttribute('aria-valuenow', Math.round(ratio * 100));
    progress.setAttribute('aria-valuetext', `${text} de ${durationEl.textContent}`);
  }
}

// "timeupdate" only fires ~4 times a second; while playing we redraw every frame so the bar glides
let frame = 0;
function startProgressLoop() {
  cancelAnimationFrame(frame);
  const step = () => {
    if (!scrubbing) renderProgress();
    renderCues();
    if (!video.paused) frame = requestAnimationFrame(step);
  };
  step();
}

// dragging the bar (pointer events = mouse, finger and pen with the same code)
let scrubbing = false;

function pointerRatio(e) {
  const box = progress.getBoundingClientRect();
  return Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
}

function scrubTo(ratio) {
  const time = ratio * video.duration;
  video.currentTime = time;
  renderProgress(time);
  showControls();
}

// the little time bubble above the bar
function showTooltip(ratio) {
  tooltip.textContent = formatTime(ratio * video.duration);
  const width = progress.clientWidth;
  const half = tooltip.offsetWidth / 2;
  tooltip.style.left = `${Math.min(Math.max(ratio * width, half), width - half)}px`;
  progress.style.setProperty('--hover', ratio);
  progress.classList.add('is-hovering');
}

progress.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !Number.isFinite(video.duration)) return;
  scrubbing = true;
  progress.classList.add('is-dragging');
  progress.setPointerCapture(e.pointerId);   // keep getting moves even if you slide off the bar
  const ratio = pointerRatio(e);
  scrubTo(ratio);
  showTooltip(ratio);
});
progress.addEventListener('pointermove', (e) => {
  if (!Number.isFinite(video.duration)) return;
  if (!scrubbing && e.pointerType !== 'mouse') return;
  const ratio = pointerRatio(e);
  if (scrubbing) scrubTo(ratio);
  showTooltip(ratio);
});
progress.addEventListener('pointerup', stopScrubbing);
progress.addEventListener('pointercancel', stopScrubbing);
progress.addEventListener('pointerleave', (e) => {
  if (!scrubbing && e.pointerType === 'mouse') progress.classList.remove('is-hovering');
});

function stopScrubbing(e) {
  if (!scrubbing) return;
  scrubbing = false;
  progress.classList.remove('is-dragging');
  if (e.pointerType !== 'mouse') progress.classList.remove('is-hovering');
  showControls();
}

function seekTo(time) {
  if (!Number.isFinite(video.duration)) return;
  video.currentTime = Math.min(Math.max(time, 0), video.duration);
  renderProgress();
}

function seekBy(seconds) {
  if (!Number.isFinite(video.duration)) return;
  seekTo(video.currentTime + seconds);
  flashSeek(seconds);
}

// the "+10 s" ripple; quick repeated skips add up (+10, +20, +30…)
const flashes = { left: $('#flashBack'), right: $('#flashForward') };
const flashTotals = { left: 0, right: 0 };
const flashTimers = { left: 0, right: 0 };

function flashSeek(seconds) {
  const side = seconds < 0 ? 'left' : 'right';
  const flash = flashes[side];
  flashTotals[side] = (flash.classList.contains('is-visible') ? flashTotals[side] : 0) + Math.abs(seconds);
  flash.querySelector('span').textContent = `${seconds < 0 ? '−' : '+'}${flashTotals[side]} s`;
  flash.classList.add('is-visible');
  clearTimeout(flashTimers[side]);
  flashTimers[side] = setTimeout(() => flash.classList.remove('is-visible'), 600);
}


/* volume (remembered for next time) */
function setVolume(value) {
  value = Math.round(Math.min(Math.max(value, 0), 1) * 100) / 100;
  video.volume = value;
  video.muted = value === 0;
}

function changeVolume(delta) {
  setVolume((video.muted ? 0 : video.volume) + delta);
  osd(video.muted ? 'Silencio' : `Volumen ${Math.round(video.volume * 100)} %`);
}

function toggleMute() {
  if (video.muted || video.volume === 0) {
    if (video.volume === 0) video.volume = 0.5;
    video.muted = false;
  } else {
    video.muted = true;
  }
}

function updateVolumeUI() {
  const level = video.muted ? 0 : video.volume;
  volumeInput.value = level;
  volumeInput.style.setProperty('--level', level);
  const icon = level === 0 ? 'volume-off' : level < 0.5 ? 'volume-low' : 'volume-high';
  setButton(muteBtn, icon, level === 0 ? 'Activar sonido' : 'Silenciar');
}

let volumeSaveTimer = 0;
video.addEventListener('volumechange', () => {
  updateVolumeUI();
  clearTimeout(volumeSaveTimer);
  volumeSaveTimer = setTimeout(() => store.set('vp.volume', { volume: video.volume, muted: video.muted }), 300);
});
volumeInput.addEventListener('input', () => setVolume(Number(volumeInput.value)));


/* playback speed */
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const rateFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });
const formatRate = (rate) => `${rateFormat.format(rate)}×`;

function setSpeed(rate) {
  video.defaultPlaybackRate = rate;   // the default sticks around when the next video loads
  video.playbackRate = rate;
}

function stepSpeed(step) {
  const index = SPEEDS.indexOf(video.playbackRate);
  const rate = SPEEDS[Math.min(Math.max((index === -1 ? 2 : index) + step, 0), SPEEDS.length - 1)];
  setSpeed(rate);
  osd(`Velocidad ${formatRate(rate)}`);
}

function toggleSpeedMenu(button, e) {
  if (menuAnchor === button) {
    closeMenu();
    return;
  }
  openMenu(button, 'Velocidad', SPEEDS.map((rate) => ({
    label: formatRate(rate),
    checked: video.playbackRate === rate,
    onSelect: () => setSpeed(rate),
  })), { grid: true, keyboard: e?.detail === 0 });
}

video.addEventListener('ratechange', () => {
  speedBtn.textContent = formatRate(video.playbackRate);
  speedBtn.classList.toggle('is-on', video.playbackRate !== 1);
});


/* subtitles (.srt / .vtt). We read them ourselves and draw them over the video,
   that way they dodge the controls and look the same in every browser */
let subsOn = true;
let shownCues = [];      // the cues on screen right now, so we only touch the page when they change
let nativeTrack = null;  // only for the iPhone fullscreen player, which can't see our overlay

async function loadSubtitles(file, item) {
  try {
    const cues = parseSubtitles(await readText(file));
    if (!cues.length) throw new Error('no cues');
    item.subs = { name: file.name, cues };
    subsOn = true;
    if (item === current()) {
      showSubtitles();
      osd(`Subtítulos: ${file.name}`);
    }
    renderPlaylist();
  } catch {
    showToast(`No pude leer los subtítulos de "${file.name}".`);
  }
}

// most subtitle files are UTF-8, but older ones (lots of Spanish ones!) are Windows-1252
async function readText(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// works for both formats: all we need is the "start --> end" line and the text under it
function parseSubtitles(text) {
  const cues = [];
  const blocks = text.replace(/^/, '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timing = lines.findIndex((line) => line.includes('-->'));
    if (timing === -1) continue;
    const [start, end] = lines[timing].split('-->').map((part) => parseTimestamp(part.trim().split(/\s+/)[0]));
    const body = lines.slice(timing + 1).join('\n').replace(/\{\\[^}]*\}/g, '').trim();   // drops {\an8}-style tags
    if (end > start && body) cues.push({ start, end, text: body });
  }
  return cues;
}

// "01:02:03,456" or "02:03.456" → seconds
function parseTimestamp(value = '') {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/.exec(value);
  if (!match) return NaN;
  const [, hours = 0, minutes, seconds, millis] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis.padEnd(3, '0')) / 1000;
}

// call this whenever the subtitles themselves change (new video, new file, on/off)
function showSubtitles() {
  ccBtn.classList.toggle('is-on', subsOn && !!current()?.subs);
  shownCues = null;
  renderCues();
}

// runs on every frame while playing, so it has to be cheap: it only redraws when the cues change
function renderCues() {
  const time = video.currentTime;
  const cues = (subsOn && current()?.subs?.cues) || [];
  const active = cues.filter((cue) => cue.start <= time && time < cue.end);
  if (shownCues && active.length === shownCues.length && active.every((cue, i) => cue === shownCues[i])) return;
  shownCues = active;
  captionsEl.replaceChildren(...active.map((cue) => {
    const line = document.createElement('span');
    line.className = 'cue';
    // getCueAsHTML only lets harmless tags like <i> or <b> through, never real HTML
    line.append(new VTTCue(cue.start, cue.end, cue.text).getCueAsHTML());
    return line;
  }));
}
// redraw as soon as a jump starts, no need to wait for the video to catch up
video.addEventListener('seeking', renderCues);
video.addEventListener('seeked', renderCues);

function toggleSubtitles() {
  if (!current()?.subs) {
    osd('Este video no tiene subtítulos');
    return;
  }
  subsOn = !subsOn;
  showSubtitles();
  osd(subsOn ? 'Subtítulos activados' : 'Subtítulos desactivados');
}

function toggleSubtitlesMenu(button, e) {
  const subs = current()?.subs;
  if (!subs) {
    subsInput.click();   // nothing loaded yet, so straight to the file picker
    return;
  }
  if (menuAnchor === button) {
    closeMenu();
    return;
  }
  openMenu(button, 'Subtítulos', [
    { label: 'Desactivados', checked: !subsOn, onSelect: () => { subsOn = false; showSubtitles(); } },
    { label: subs.name, checked: subsOn, onSelect: () => { subsOn = true; showSubtitles(); } },
    { label: 'Cargar otro archivo…', onSelect: () => subsInput.click() },
  ], { keyboard: e?.detail === 0 });
}

// iPhone fullscreen uses Apple's own player, so there we hand the cues to the browser instead
video.addEventListener('webkitbeginfullscreen', () => {
  const subs = subsOn && current()?.subs;
  if (!subs) return;
  nativeTrack ??= video.addTextTrack('subtitles', 'Subtítulos', 'es');
  nativeTrack.mode = 'hidden';   // its cue list is only reachable when it isn't "disabled"
  for (const cue of Array.from(nativeTrack.cues)) nativeTrack.removeCue(cue);
  for (const cue of subs.cues) nativeTrack.addCue(new VTTCue(cue.start, cue.end, cue.text));
  nativeTrack.mode = 'showing';
});
video.addEventListener('webkitendfullscreen', () => {
  if (nativeTrack) nativeTrack.mode = 'disabled';
});


/* picture-in-picture: the video keeps playing in a small floating window */
const canPip = document.pictureInPictureEnabled === true;
const canWebkitPip = typeof video.webkitSupportsPresentationMode === 'function'
  && video.webkitSupportsPresentationMode('picture-in-picture');   // older Safari / iPhone

async function togglePip() {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (canPip) {
      await video.requestPictureInPicture();
    } else if (canWebkitPip) {
      video.webkitSetPresentationMode(video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
    }
  } catch {
    showToast('No se pudo abrir la ventana flotante.');
  }
}

function updatePipState() {
  const inPip = document.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture';
  player.classList.toggle('is-pip', inPip);
  setButton(pipBtn, inPip ? 'pip-exit' : 'pip', inPip ? 'Volver al reproductor' : 'Ventana flotante');
}
video.addEventListener('enterpictureinpicture', updatePipState);
video.addEventListener('leavepictureinpicture', updatePipState);
video.addEventListener('webkitpresentationmodechanged', updatePipState);


/* fullscreen */
const canFullscreen = document.fullscreenEnabled || document.webkitFullscreenEnabled;
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  Promise.resolve(exit.call(document)).catch(() => {});
}

function toggleFullscreen() {
  if (fullscreenElement()) {
    exitFullscreen();
  } else if (canFullscreen) {
    const request = player.requestFullscreen || player.webkitRequestFullscreen;
    Promise.resolve(request.call(player)).catch(() => {});
  } else if (video.webkitEnterFullscreen) {
    // iPhones only let the <video> itself go fullscreen (with Apple's own controls)
    video.webkitEnterFullscreen();
  }
}

function onFullscreenChange() {
  const isFullscreen = fullscreenElement() === player;
  player.classList.toggle('is-fullscreen', isFullscreen);
  setButton(fsBtn, isFullscreen ? 'fullscreen-exit' : 'fullscreen',
    isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa');
  closeMenu();

  // on a phone, turn the screen sideways if the video is wide (Chrome on Android; elsewhere nothing happens)
  if (isFullscreen && video.videoWidth > video.videoHeight) {
    screen.orientation?.lock?.('landscape').catch(() => {});
  } else if (!isFullscreen) {
    try { screen.orientation?.unlock?.(); } catch {}
  }
  showControls();
}
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);


/* the small popup menu (speed and subtitles share it) */
let menuAnchor = null;

function openMenu(anchor, title, items, { grid = false, keyboard = false } = {}) {
  closeMenu();
  const heading = document.createElement('p');
  heading.className = 'menu-title';
  heading.textContent = title;

  const list = document.createElement('div');
  list.className = 'menu-items';
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-item';
    button.textContent = item.label;
    if (item.checked === undefined) {
      button.setAttribute('role', 'menuitem');
    } else {
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', String(item.checked));
    }
    button.addEventListener('click', () => {
      closeMenu();
      item.onSelect();
    });
    list.append(button);
  }

  menu.replaceChildren(heading, list);
  menu.classList.toggle('is-grid', grid);
  menu.setAttribute('aria-label', title);
  menu.hidden = false;

  // pop it up right above its button, without spilling out of the player
  const box = player.getBoundingClientRect();
  const spot = anchor.getBoundingClientRect();
  menu.style.right = `${Math.max(8, box.right - spot.right)}px`;
  menu.style.bottom = `${box.bottom - spot.top + 6}px`;
  menu.style.maxHeight = `${Math.max(spot.top - box.top - 14, 80)}px`;

  menuAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  // opened with the keyboard? jump right into it. With a mouse or a finger, leave the focus alone
  if (keyboard) (menu.querySelector('[aria-checked="true"]') || list.firstElementChild).focus({ preventScroll: true });
  showControls();
}

function closeMenu({ returnFocus = false } = {}) {
  if (menu.hidden) return;
  menu.hidden = true;
  menuAnchor?.setAttribute('aria-expanded', 'false');
  if (returnFocus) menuAnchor?.focus();
  else if (menu.contains(document.activeElement)) document.activeElement.blur();
  menuAnchor = null;
  showControls();
}

// clicking anywhere else closes it (and that click shouldn't pause the video too)
document.addEventListener('pointerdown', (e) => {
  if (menu.hidden || menu.contains(e.target) || menuAnchor?.contains(e.target)) return;
  closeMenu();
  if (e.target === video) {
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 600);
  }
}, true);

function handleMenuKey(e) {
  const items = Array.from(menu.querySelectorAll('.menu-item'));
  const index = items.indexOf(document.activeElement);
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  if (e.key === 'Escape') {
    closeMenu({ returnFocus: index !== -1 });
  } else if (step) {
    // first arrow press lands on the selected option, the next ones move around
    const selected = items.find((item) => item.getAttribute('aria-checked') === 'true') || items[0];
    (index === -1 ? selected : items[(index + step + items.length) % items.length]).focus();
  } else if (e.key === 'Tab') {
    closeMenu();
    return true;
  } else {
    return index !== -1;   // Space/Enter press the focused item all by themselves
  }
  e.preventDefault();
  return true;
}


/* show / hide the controls */
let hideTimer = 0;
let hoveringControls = false;

function showControls() {
  player.classList.remove('controls-hidden');
  clearTimeout(hideTimer);
  if (!video.paused) hideTimer = setTimeout(hideControls, 2500);
}

function hideControls() {
  clearTimeout(hideTimer);
  if (video.paused || scrubbing || hoveringControls || !menu.hidden) return;
  player.classList.add('controls-hidden');
}

player.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') showControls();
});
player.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') hideControls();
});
controls.addEventListener('pointerenter', (e) => { hoveringControls = e.pointerType === 'mouse'; });
controls.addEventListener('pointerleave', () => { hoveringControls = false; });
controls.addEventListener('pointerdown', showControls);


/* keyboard */
document.addEventListener('keydown', (e) => {
  if (stage.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!menu.hidden && handleMenuKey(e)) return;
  const onButton = !!e.target.closest?.('button, summary');
  const onSlider = e.target.tagName === 'INPUT';

  switch (e.key) {
    case ' ':
      if (onButton) return;   // if you're tabbing around, Space presses the focused button
      togglePlay();
      break;
    case 'k': case 'K': togglePlay(); break;
    case 'j': case 'J': seekBy(-10); break;
    case 'l': case 'L': seekBy(10); break;
    case 'ArrowLeft':  if (onSlider) return; seekBy(-5); break;
    case 'ArrowRight': if (onSlider) return; seekBy(5); break;
    case 'ArrowUp':    if (onSlider) return; changeVolume(0.1); break;
    case 'ArrowDown':  if (onSlider) return; changeVolume(-0.1); break;
    case 'Home': if (onSlider) return; seekTo(0); break;
    case 'End':  if (onSlider) return; seekTo(video.duration); break;
    case 'm': case 'M': toggleMute(); osd(video.muted ? 'Silencio' : 'Sonido activado'); break;
    case 'c': case 'C': toggleSubtitles(); break;
    case 'f': case 'F': toggleFullscreen(); break;
    case 'i': case 'I': togglePip(); break;
    case '<': stepSpeed(-1); break;
    case '>': stepSpeed(1); break;
    case 'N': playNext(); break;       // Shift + N
    case 'P': playPrevious(); break;   // Shift + P
    default:
      if (!/^[0-9]$/.test(e.key)) return;
      seekTo((video.duration * Number(e.key)) / 10);   // 0–9 jump to 0 %–90 %
  }
  e.preventDefault();
  showControls();
});

// with a mouse (or a finger) buttons and the progress bar don't keep the focus, so Space
// always means play/pause and you don't get a focus ring around the bar after clicking it
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('button, summary, .progress')) e.preventDefault();
});


/* remember where you left each video (only on this device, in localStorage) */
const POSITIONS_KEY = 'vp.positions';
let pendingResume = 0;
let lastPositionSave = 0;
let resumeTimer = 0;

function loadPositions() {
  const positions = store.get(POSITIONS_KEY, {});
  return positions && typeof positions === 'object' ? positions : {};
}

function savedPosition(item) {
  const time = loadPositions()[item.key]?.t;
  return Number.isFinite(time) ? time : 0;
}

function savePosition() {
  lastPositionSave = performance.now();
  const item = current();
  const { currentTime: time, duration } = video;
  if (!item || !Number.isFinite(duration) || duration < 60) return;   // not worth it for short clips
  const positions = loadPositions();
  if (time < 5 || duration - time < 10) delete positions[item.key];   // barely started, or basically done
  else positions[item.key] = { t: Math.floor(time), at: Date.now() };
  // keep the 100 most recent so this never grows forever
  const keys = Object.keys(positions).sort((a, b) => (positions[b]?.at || 0) - (positions[a]?.at || 0));
  for (const key of keys.slice(100)) delete positions[key];
  store.set(POSITIONS_KEY, positions);
}

function resumeIfSaved() {
  const time = pendingResume;
  pendingResume = 0;
  if (!time || time > video.duration - 10) return;
  video.currentTime = time;
  resumeText.textContent = `Sigues donde lo dejaste (${formatTime(time)})`;
  resumeBox.hidden = false;
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { resumeBox.hidden = true; }, 8000);
}

$('#restartBtn').addEventListener('click', () => {
  seekTo(0);
  resumeBox.hidden = true;
  video.play().catch(() => {});
});

video.addEventListener('pause', savePosition);
video.addEventListener('ended', savePosition);
window.addEventListener('pagehide', savePosition);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) savePosition();
});


/* the playlist */
function renderPlaylist() {
  plCount.textContent = playlist.length === 1 ? '1 video' : `${playlist.length} videos`;
  player.classList.toggle('has-list', playlist.length > 1);
  for (const button of player.querySelectorAll('[data-action="next"]')) {
    button.disabled = currentIndex >= playlist.length - 1;
  }

  plItems.replaceChildren(...playlist.map((item, index) => {
    const isCurrent = index === currentIndex;
    const row = document.createElement('li');
    row.className = isCurrent ? 'pl-item is-current' : 'pl-item';

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'pl-main';
    main.title = item.file.name;
    if (isCurrent) main.setAttribute('aria-current', 'true');
    main.addEventListener('click', () => (isCurrent ? togglePlay() : loadItem(playlist.indexOf(item))));

    const number = document.createElement('span');
    number.className = 'pl-index';
    if (isCurrent) number.innerHTML = '<span class="eq"><i></i><i></i><i></i></span>';   // fixed markup, nothing from the file
    else number.textContent = index + 1;

    const name = document.createElement('span');
    name.className = 'pl-name';
    name.textContent = item.file.name;
    main.append(number, name);

    if (item.subs) {
      const badge = document.createElement('span');
      badge.className = 'pl-badge';
      badge.textContent = 'CC';
      badge.title = item.subs.name;
      main.append(badge);
    }

    const duration = document.createElement('span');
    duration.className = 'pl-duration';
    item.durationEl = duration;
    updateDurationLabel(item);
    main.append(duration);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pl-remove';
    remove.title = 'Quitar de la lista';
    remove.setAttribute('aria-label', `Quitar ${item.file.name}`);
    remove.innerHTML = '<svg class="icon"><use href="#i-close"/></svg>';
    remove.addEventListener('click', () => removeItem(playlist.indexOf(item)));

    row.append(main, remove);
    return row;
  }));
}

function updateDurationLabel(item) {
  if (!item.durationEl) return;
  if (item.duration === null) item.durationEl.textContent = '…';
  else item.durationEl.textContent = Number.isFinite(item.duration) ? formatTime(item.duration) : '—';
}

// find out how long each video is, in the background and one at a time
let probing = false;
async function probeDurations() {
  if (probing) return;
  probing = true;
  let item;
  while ((item = playlist.find((entry) => entry.duration === null))) {
    item.duration = await readDuration(item.file);
    updateDurationLabel(item);
  }
  probing = false;
}

function readDuration(file) {
  return new Promise((resolve) => {
    const probe = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      probe.removeAttribute('src');
      probe.load();
      resolve(value);
    };
    probe.preload = 'metadata';
    probe.muted = true;
    probe.addEventListener('loadedmetadata', () => done(probe.duration));
    probe.addEventListener('error', () => done(NaN));
    setTimeout(() => done(NaN), 15000);
    probe.src = url;
  });
}

function playNext() {
  if (currentIndex < playlist.length - 1) loadItem(currentIndex + 1);
}

// like most players: "previous" first rewinds the current video, press it again to go back
function playPrevious() {
  if (video.currentTime > 3 || currentIndex <= 0) seekTo(0);
  else loadItem(currentIndex - 1);
}

video.addEventListener('ended', () => {
  if (currentIndex < playlist.length - 1) loadItem(currentIndex + 1);
});


/* installable app (PWA). Browsers only allow it over https or on localhost.
   The manifest gets added from here because opening index.html straight from
   disk (file://) would make the browser complain about it */
let installPrompt = null;

function setupInstall() {
  if (!location.protocol.startsWith('http')) return;
  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = 'manifest.webmanifest';
  document.head.append(manifest);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();   // we show our own "Instalar app" button instead of the browser's banner
  installPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener('appinstalled', () => { installBtn.hidden = true; });


/* little helpers */
function setButton(button, icon, label) {
  button.querySelector('use').setAttribute('href', `#i-${icon}`);
  button.setAttribute('aria-label', label);
  button.title = label;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds / 60) % 60;
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const sizeFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${sizeFormat.format(bytes)} ${units[i]}`;
}

// quick message on top of the video ("Volumen 70 %", "Velocidad 1,5×"…)
let osdTimer = 0;
function osd(text) {
  osdEl.textContent = text;
  osdEl.classList.add('is-visible');
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => osdEl.classList.remove('is-visible'), 1100);
}

// error message at the bottom of the page
let toastTimer = 0;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 5000);
}


/* start up */
const savedVolume = store.get('vp.volume', null);
if (savedVolume) {
  const volume = Number(savedVolume.volume);
  video.volume = Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : 1;
  video.muted = savedVolume.muted === true;
}
updateVolumeUI();
pipBtn.hidden = !canPip && !canWebkitPip;
fsBtn.hidden = !canFullscreen && !video.webkitEnterFullscreen;
setupInstall();
