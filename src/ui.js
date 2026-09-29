// UI: HUD updates, dialogs, mode switch, toasts, touch control visibility.

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      titlePanel: $('title-panel'),
      titleFooter: $('title-footer'),
      runHud: $('run-hud'),
      hudTime: $('hud-time'),
      hudCrystals: $('hud-crystals'),
      hudIsland: $('hud-island'),
      hudIslandName: $('hud-island-name'),
      jumpMeter: $('jump-meter'),
      segs: [...document.querySelectorAll('#jump-meter .seg')],
      toast: $('toast'),
      touch: $('touch-controls'),
      btnPause: $('btn-pause'),
      btnSound: $('btn-sound'),
      icoMute: $('ico-mute'),
      icoSound: $('ico-sound'),
      pillTripo: $('pill-tripo'),
      pillClassic: $('pill-classic'),
      tripoStatus: $('tripo-status'),
      modeLabel: $('mode-label'),
      modeSwitch: $('mode-switch'),
      dialogHelp: $('dialog-help'),
      dialogPause: $('dialog-pause'),
      dialogFinish: $('dialog-finish'),
      pauseStats: $('pause-stats'),
      finishTime: $('finish-time'),
      finishFalls: $('finish-falls'),
      finishCrystals: $('finish-crystals'),
      finishBest: $('finish-best'),
      finishStars: [...$('finish-stars').children],
    };
    this._toastTimer = null;
    this._lastHud = { time: -1, crystals: -1, island: -1, jumps: -1 };

    const coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.isTouch = coarse;
  }

  showTouch() {
    if (this.isTouch) this.el.touch.classList.remove('hidden');
  }

  hideTitle() {
    this.el.titlePanel.style.transition = 'opacity .5s ease, transform .5s ease';
    this.el.titlePanel.style.opacity = '0';
    this.el.titleFooter.style.transition = 'opacity .5s ease';
    this.el.titleFooter.style.opacity = '0';
    setTimeout(() => {
      this.el.titlePanel.classList.add('hidden');
      this.el.titleFooter.classList.add('hidden');
    }, 520);
  }

  showTitle() {
    this.el.titlePanel.classList.remove('hidden');
    this.el.titleFooter.classList.remove('hidden');
    this.el.titlePanel.style.opacity = '1';
    this.el.titleFooter.style.opacity = '1';
  }

  startRunUI() {
    this.hideTitle();
    // On touch devices the mode switch would crowd the play view — hide it while running.
    if (this.isTouch) this.el.modeSwitch.classList.add('hidden');
    this.el.runHud.classList.remove('hidden');
    this.el.jumpMeter.classList.remove('hidden');
    this.el.btnPause.classList.remove('hidden');
    this.showTouch();
  }

  endRunUI() {
    this.el.runHud.classList.add('hidden');
    this.el.jumpMeter.classList.add('hidden');
    this.el.btnPause.classList.add('hidden');
    this.el.touch.classList.add('hidden');
    this.el.modeSwitch.classList.remove('hidden');
  }

  hud({ time, crystals, total, islandIdx, islandName, progress, jumps }) {
    const h = this._lastHud;
    const tStr = fmtTime(time);
    if (h.time !== tStr) { this.el.hudTime.textContent = tStr; h.time = tStr; }
    if (h.crystals !== crystals) {
      this.el.hudCrystals.textContent = `${crystals} / ${total}`;
      h.crystals = crystals;
      this.el.hudCrystals.parentElement.classList.remove('pulse');
      void this.el.hudCrystals.parentElement.offsetWidth;
      this.el.hudCrystals.parentElement.classList.add('pulse');
    }
    if (h.island !== islandIdx) {
      this.el.hudIsland.textContent = `${islandIdx + 1} / 13`;
      this.el.hudIslandName.textContent = islandName;
      h.island = islandIdx;
    }
    if (h.jumps !== jumps) {
      this.el.segs.forEach((s, i) => s.classList.toggle('on', i < jumps));
      h.jumps = jumps;
    }
  }

  toast(msg, ms = 1800) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), ms);
  }

  setMutedIcon(muted) {
    this.el.icoMute.hidden = !muted;
    this.el.icoSound.hidden = muted;
  }

  setMode(mode, report) {
    const tripo = mode === 'imported';
    this.el.pillTripo.classList.toggle('active', tripo);
    this.el.pillClassic.classList.toggle('active', !tripo);
    this.el.tripoStatus.textContent = report;
    this.el.modeLabel.textContent = tripo ? 'TRIPO 3D WORLD' : 'CLASSIC THREE.JS';
  }

  showHelp() { this.el.dialogHelp.classList.remove('hidden'); }
  hideHelp() { this.el.dialogHelp.classList.add('hidden'); }
  showPause(statsText) {
    this.el.pauseStats.textContent = statsText;
    this.el.dialogPause.classList.remove('hidden');
  }
  hidePause() { this.el.dialogPause.classList.add('hidden'); }

  showFinish({ time, falls, crystals, total, stars, best }) {
    this.el.finishTime.textContent = fmtTime(time);
    this.el.finishFalls.textContent = String(falls);
    this.el.finishCrystals.textContent = `${crystals} / ${total}`;
    this.el.finishBest.textContent = best ? fmtTime(best) : '—';
    this.el.finishStars.forEach((s, i) => s.classList.toggle('on', i < stars));
    this.el.dialogFinish.classList.remove('hidden');
  }
  hideFinish() { this.el.dialogFinish.classList.add('hidden'); }

  dialogVisible(name) {
    return !this.el[name].classList.contains('hidden');
  }
}

export function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`;
}
