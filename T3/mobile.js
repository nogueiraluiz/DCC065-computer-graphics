// mobile.js - Controles para versão mobile: joystick virtual + botões de overlay
import * as THREE from 'three';
import { mouse } from './input.js';

const FONT = "'Arial Rounded MT Bold', sans-serif";

function isMobileDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

export function initMobileControls() {
  if (!isMobileDevice()) return;

  injectMobileStyles();
  createJoystick();
  createOverlayButtons();

  // Tiro: toque em qualquer área fora do joystick e dos botões de overlay dispara
  document.body.addEventListener('touchstart', (e) => {
    if (e.target.closest('#mobile-joystick-base') || e.target.closest('#mobile-overlay-buttons')) return;
    globalThis._mobileFiring = true;
  }, { passive: true });
  document.body.addEventListener('touchend', () => {
    globalThis._mobileFiring = false;
  }, { passive: true });
  document.body.addEventListener('touchcancel', () => {
    globalThis._mobileFiring = false;
  }, { passive: true });
}

function injectMobileStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @media (pointer: coarse) {
      /* HUD compacto: empilha verticalmente e no canto esquerdo */
      #game-arcade-ui {
        flex-direction: column !important;
        left: 10px !important;
        transform: none !important;
        gap: 6px !important;
        top: 10px !important;
      }
      #game-arcade-ui > div {
        min-width: 110px !important;
        padding: 4px 10px !important;
      }
      /* Oculta dat.GUI no mobile */
      .dg.ac {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function createJoystick() {
  const BASE_SIZE = 120;
  const THUMB_SIZE = 52;
  const MAX_RADIUS = 40;

  const base = document.createElement('div');
  base.id = 'mobile-joystick-base';
  base.style.cssText = `
    position: fixed;
    bottom: 28px;
    left: 28px;
    width: ${BASE_SIZE}px;
    height: ${BASE_SIZE}px;
    border-radius: 50%;
    background: rgba(30, 30, 50, 0.30);
    border: 3px solid rgba(255, 255, 255, 0.45);
    z-index: 5000;
    touch-action: none;
    user-select: none;
  `;

  const thumb = document.createElement('div');
  thumb.id = 'mobile-joystick-thumb';
  thumb.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: ${THUMB_SIZE}px;
    height: ${THUMB_SIZE}px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.80);
    border: 3px solid rgba(255, 255, 255, 0.95);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  `;

  base.appendChild(thumb);
  document.body.appendChild(base);

  let activeId = null;
  let centerX = 0;
  let centerY = 0;

  function recalcCenter() {
    const rect = base.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
  }

  base.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeId !== null) return;
    recalcCenter();
    activeId = e.changedTouches[0].identifier;
  }, { passive: false });

  base.addEventListener('touchmove', (e) => {
    e.preventDefault();
    e.stopPropagation();
    for (const t of e.changedTouches) {
      if (t.identifier !== activeId) continue;
      let dx = t.clientX - centerX;
      let dy = t.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > MAX_RADIUS) {
        const s = MAX_RADIUS / dist;
        dx *= s;
        dy *= s;
      }
      thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      // Escala igual ao mouse: deslocamento em pixels / metade da tela = NDC
      // Multiplicador 2.5 para que o alcance máximo do joystick cubra ~50% da mira
      const scaleX = (window.innerWidth / 2) / 2.5;
      const scaleY = (window.innerHeight / 2) / 2.5;
      mouse.x = THREE.MathUtils.clamp(dx / scaleX, -1, 1);
      mouse.y = THREE.MathUtils.clamp(-dy / scaleY, -1, 1);
    }
  }, { passive: false });

  function onRelease(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === activeId) {
        activeId = null;
        thumb.style.transform = 'translate(-50%, -50%)';
        mouse.x = 0;
        mouse.y = 0;
      }
    }
  }

  base.addEventListener('touchend', onRelease, { passive: false });
  base.addEventListener('touchcancel', onRelease, { passive: false });
}

function createOverlayButtons() {
  const container = document.createElement('div');
  container.id = 'mobile-overlay-buttons';
  container.style.cssText = `
    position: fixed;
    bottom: 28px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    z-index: 5000;
    touch-action: manipulation;
  `;

  function makeBtn() {
    const btn = document.createElement('button');
    btn.style.cssText = `
      width: 64px;
      height: 64px;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.70);
      background: rgba(30, 30, 50, 0.55);
      color: #ffffff;
      font-size: 11px;
      font-weight: 900;
      font-family: ${FONT};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      line-height: 1.35;
      padding: 4px;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.40);
      touch-action: manipulation;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    `;
    return btn;
  }

  // --- Botão Tela Cheia ---
  const btnFS = makeBtn();
  let isFullscreen = false;

  function syncFS() {
    isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFullscreen) {
      btnFS.innerHTML = 'SAIR<br>TELA';
      btnFS.style.background = 'rgba(31, 100, 148, 0.80)';
      btnFS.style.borderColor = 'rgba(90, 180, 240, 0.90)';
      btnFS.style.color = '#ffffff';
    } else {
      btnFS.innerHTML = 'TELA<br>CHEIA';
      btnFS.style.background = 'rgba(30, 30, 50, 0.55)';
      btnFS.style.borderColor = 'rgba(255, 255, 255, 0.70)';
    }
  }

  btnFS.addEventListener('click', () => {
    if (!isFullscreen) {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
      if (req) req.call(el);
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
      if (exit) exit.call(document);
    }
  });

  document.addEventListener('fullscreenchange', syncFS);
  document.addEventListener('webkitfullscreenchange', syncFS);

  // --- Botão Música ---
  const btnMusica = makeBtn();

  function syncMusica() {
    const on = globalThis._audioEnabled !== false;
    btnMusica.innerHTML = on ? 'MUS.<br>ON' : 'MUS.<br>OFF';
    if (on) {
      btnMusica.style.background = 'rgba(242, 217, 37, 0.85)';
      btnMusica.style.borderColor = 'rgba(242, 217, 37, 0.95)';
      btnMusica.style.color = '#3d405b';
    } else {
      btnMusica.style.background = 'rgba(214, 33, 59, 0.75)';
      btnMusica.style.borderColor = 'rgba(255, 100, 100, 0.90)';
      btnMusica.style.color = '#ffffff';
    }
  }

  btnMusica.addEventListener('click', () => {
    globalThis._audioEnabled = !globalThis._audioEnabled;
    syncMusica();
  });

  syncFS();
  syncMusica();

  container.appendChild(btnFS);
  container.appendChild(btnMusica);
  document.body.appendChild(container);
}
