// buttons.js
import { CONFIG } from "./config.js";
import GUI from "../../libs/util/dat.gui.module.js";
import { updateLightVolume } from "./light.js";

// A fonte fofa e arredondada oficial do seu jogo
const FONTE_PADRAO = "'Arial Rounded MT Bold', sans-serif";

export function initUI(scene, light) {
  const container = document.createElement("div");
  container.id = "game-arcade-ui";
  container.style.cssText = `
    position: fixed;
    top: 25px;
    left: 30%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: row;
    gap: 24px;
    font-family: ${FONTE_PADRAO};
    pointer-events: none;
    z-index: 1000;
  `;
  document.body.appendChild(container);

  const boxStyle = `
    background: rgba(255, 255, 255, 0.9);
    border: 3px solid #1a1a1a;
    border-radius: 12px;
    padding: 8px 14px;
    min-width: 160px;
    box-shadow: 4px 4px 0px #1a1a1a;
    display: flex;
    flex-direction: column;
    justify-content: center;
    font-family: ${FONTE_PADRAO};
  `;

  const lifeBox = document.createElement("div");
  lifeBox.style.cssText = boxStyle + "order: 1;";
  lifeBox.innerHTML = `
    <div style="font-size: 10px; font-weight: 800; color: #7d809b; text-transform: uppercase; letter-spacing: 0.8px; font-family: ${FONTE_PADRAO};">Vida do Avião</div>
    <div style="width: 100%; height: 14px; background: #e0e0e0; border: 2px solid #1a1a1a; border-radius: 8px; margin-top: 4px; overflow: hidden; position: relative;">
      <div id="ui-life-bar" style="width: 100%; height: 100%; background: #23b500; transition: width 0.15s ease-out, background-color 0.3s;"></div>
    </div>
  `;

  const scoreBox = document.createElement("div");
  scoreBox.style.cssText = boxStyle + "order: 2;";
  scoreBox.innerHTML = `
    <div style="font-size: 10px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 0.8px; font-family: ${FONTE_PADRAO};">Placar de Combate</div>
    <div style="font-size: 16px; font-weight: 900; color: #1a1a1a; margin-top: 2px; font-family: ${FONTE_PADRAO};">
      Inimigos derrotados: <span id="ui-score-val" style="color: #e06187;">0</span>
    </div>
  `;

  const saldoBox = document.createElement("div");
  saldoBox.style.cssText = boxStyle + "order: 3;";
  saldoBox.innerHTML = `
    <div style="font-size: 10px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 0.8px; font-family: ${FONTE_PADRAO};">Eficiência</div>
    <div style="font-size: 16px; font-weight: 900; color: #1a1a1a; margin-top: 2px; font-family: ${FONTE_PADRAO};">
      Saldo de tiros: <span id="ui-saldo-val" style="color: #1a1a1a;">0</span>
    </div>
  `;

  container.appendChild(lifeBox);
  container.appendChild(scoreBox);
  container.appendChild(saldoBox);

  const scoreSpan = scoreBox.querySelector("#ui-score-val");
  const lifeBar = lifeBox.querySelector("#ui-life-bar");
  const saldoSpan = saldoBox.querySelector("#ui-saldo-val");

  // =========================================================================
  // DAT.GUI CUSTOMIZADO E ARREDONDADO
  // =========================================================================
  let gui = new GUI();
  const altitudeParams = { altitude: 0 };
  gui.add(altitudeParams, "altitude").name("Altitude").listen();

  let fogParams = { fogFar: scene.fog.far };
  let fogController = gui
    .add(fogParams, "fogFar", 50, 2000, 1)
    .onChange((value) => {
      scene.fog.far = value;
      updateLightVolume(light, value);
    });

  fogController.name("Alcance da Névoa");

  const guiContainer = gui.domElement.parentElement;
  if (guiContainer) {
    guiContainer.style.cssText += `
      background: #fbf8f3 !important;
      border: 3px solid #3d405b !important;
      border-radius: 16px !important;
      box-shadow: 4px 4px 0px #3d405b !important;
      font-family: ${FONTE_PADRAO} !important;
      padding: 4px !important;
    `;

    const sliderBar = guiContainer.querySelector(".dg .c .fill");
    if (sliderBar) {
      sliderBar.style.setProperty("background-color", "#f2d925", "important");
    }

    const sliderTrack = guiContainer.querySelector(".dg .c .slider");
    if (sliderTrack) {
      sliderTrack.style.setProperty("background-color", "#ffffff", "important");
      sliderTrack.style.setProperty("border", "1px solid #d1d3dc", "important");
      sliderTrack.style.setProperty("border-radius", "8px", "important");
    }

    const labels = guiContainer.querySelectorAll(
      ".dg .property-name, .dg .c input[type=text], .dg .title, .dg .cr",
    );
    labels.forEach((el) => {
      el.style.setProperty("color", "#3d405b", "important");
      el.style.setProperty("font-weight", "800", "important");
      el.style.setProperty("font-family", FONTE_PADRAO, "important");
      el.style.setProperty("border-radius", "6px", "important");
    });
  }

  return {
    updateScore(n) {
      scoreSpan.innerText = n;
    },
    updateLife(tirosRecebidos) {
      const maxTiros = 20;
      const porcentagem = Math.max(0, 100 - (tirosRecebidos / maxTiros) * 100);
      lifeBar.style.width = `${porcentagem}%`;

      if (porcentagem > 50) lifeBar.style.backgroundColor = "#23b500";
      else if (porcentagem > 25) lifeBar.style.backgroundColor = "#f2d925";
      else lifeBar.style.backgroundColor = "#d6213b";
    },
    updateSaldo(kills, hits) {
      const resultado = kills - hits;
      saldoSpan.innerText = resultado;
      saldoSpan.style.color = resultado < 0 ? "#ff0000" : "#23b500";
    },
    updateAltitude(y) {
      altitudeParams.altitude = Math.round(y);
    },
    // === COMBINADO: GAME OVER LIMPA O AVISO ANTERIOR E CONSTRUÇÃO DOS BOTÕES VERTICAIS ===
    showGameOver() {
      if (document.getElementById("game-arcade-over")) return;

      // Se o aviso "Ai, eu morri" ainda estiver na tela após o avião cair, remove ele agora
      const avisoMorteAntigo = document.getElementById("ui-aviso-morte");
      if (avisoMorteAntigo) {
        avisoMorteAntigo.remove();
      }

      const gameOverOverlay = document.createElement("div");
      gameOverOverlay.id = "game-arcade-over";
      gameOverOverlay.style.cssText = `
        position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        background-color: rgba(61, 64, 91, 0.75); z-index: 3000; font-family: ${FONTE_PADRAO};
      `;

      const panel = document.createElement("div");
      panel.style.cssText = `
        display: flex; flex-direction: column; align-items: center; gap: 16px;
        min-width: 300px; padding: 36px; border-radius: 20px; background-color: #fbf8f3;
        border: 4px solid #3d405b; box-shadow: 8px 8px 0px #3d405b; text-align: center;
        font-family: ${FONTE_PADRAO};
      `;

      const title = document.createElement("div");
      title.innerHTML = `
        <span style="color: #d6213b; font-size: 36px; font-weight: 900; letter-spacing: 1px; font-family: ${FONTE_PADRAO};">GAME OVER</span>
        <div style="font-size: 14px; font-weight: 800; color: #7d809b; margin-top: 8px; text-transform: uppercase; font-family: ${FONTE_PADRAO};">O avião foi destruído!</div>
      `;

      // Botão Superior: Tentar Novamente (Azul) - Cantos Arredondados de 12px
      const btnRestart = document.createElement("button");
      btnRestart.textContent = "TENTAR NOVAMENTE";
      btnRestart.style.cssText = `
        width: 100%; padding: 14px 28px; font-size: 14px; font-weight: 900; color: #ffffff;
        background-color: #1f6494; border: 3px solid #3d405b; border-radius: 12px;
        cursor: pointer; box-shadow: 4px 4px 0px #3d405b; transition: all 0.1s ease-in-out;
        font-family: ${FONTE_PADRAO}; letter-spacing: 0.5px;
      `;
      btnRestart.addEventListener("click", () => globalThis.location.reload());

      // Botão Inferior: Voltar ao Menu (Grafite) - Cantos Arredondados de 12px
      const btnExit = document.createElement("button");
      btnExit.textContent = "VOLTAR AO MENU";
      btnExit.style.cssText = `
        width: 100%; padding: 14px 28px; font-size: 14px; font-weight: 900; color: #ffffff;
        background-color: #3d405b; border: 3px solid #1a1a1a; border-radius: 12px;
        cursor: pointer; box-shadow: 4px 4px 0px #1a1a1a; transition: all 0.1s ease-in-out;
        font-family: ${FONTE_PADRAO}; letter-spacing: 0.5px;
      `;
      btnExit.addEventListener("click", () => globalThis.location.reload());

      // Efeitos dinâmicos de clique físico estilo arcade para os dois botões
      [btnRestart, btnExit].forEach((btn) => {
        btn.addEventListener("mousedown", () => {
          btn.style.transform = "translate(2px, 2px)";
          btn.style.boxShadow =
            "2px 2px 0px " + (btn === btnRestart ? "#3d405b" : "#1a1a1a");
        });
        btn.addEventListener("mouseup", () => {
          btn.style.transform = "none";
          btn.style.boxShadow =
            "4px 4px 0px " + (btn === btnRestart ? "#3d405b" : "#1a1a1a");
        });
      });

      panel.appendChild(title);
      panel.appendChild(btnRestart);
      panel.appendChild(btnExit);
      gameOverOverlay.appendChild(panel);
      document.body.appendChild(gameOverOverlay);
    },

    // === COMBINADO: AVISO TEMPORÁRIO "AI, EU MORRI" DURANTE A QUEDA ===
    showMorteAviso() {
      if (document.getElementById("ui-aviso-morte")) return;

      const aviso = document.createElement("div");
      aviso.id = "ui-aviso-morte";
      aviso.textContent = "Ai, eu morri";
      aviso.style.cssText = `
        position: fixed;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #cb1e2b;
        color: #ffffff;
        font-family: ${FONTE_PADRAO};
        font-size: 24px;
        font-weight: 900;
        padding: 16px 32px;
        border: 4px solid #1a1a1a;
        border-radius: 12px;
        box-shadow: 6px 6px 0px #1a1a1a;
        z-index: 2500;
        text-transform: uppercase;
        letter-spacing: 1px;
        animation: piscar 0.3s infinite alternate;
        pointer-events: none;
      `;

      if (!document.getElementById("arcade-piscar-style")) {
        const styleSheet = document.createElement("style");
        styleSheet.id = "arcade-piscar-style";
        styleSheet.textContent = `
          @keyframes piscar {
            from { opacity: 1; }
            to { opacity: 0.6; }
          }
        `;
        document.head.appendChild(styleSheet);
      }

      document.body.appendChild(aviso);
    },
  };
}

export function initPauseMenu({
  renderer,
  setPaused,
  getIsPaused,
  setGameSpeed,
  getGameSpeed,
}) {
  if (globalThis._shootEnabled === undefined) globalThis._shootEnabled = true;
  if (globalThis._audioEnabled === undefined) globalThis._audioEnabled = true;

  setTimeout(() => {
    setPaused(true);
  }, 10);

  const startOverlay = document.createElement("div");
  startOverlay.style.cssText = `
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: rgb(148, 181, 224); z-index: 2000; user-select: none; font-family: ${FONTE_PADRAO};
  `;

  const startPanel = document.createElement("div");
  startPanel.style.cssText = `
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px;
    min-width: 320px; padding: 40px 30px; border-radius: 25px; background-color: #fbf8f3;
    border: 4px solid #3d405b; box-shadow: 8px 8px 0px #3d405b; text-align: center;
    font-family: ${FONTE_PADRAO};
  `;

  const startTitle = document.createElement("div");
  startTitle.innerHTML = `
    <span style="color: #e06187; display: block; font-size: 16px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; font-family: ${FONTE_PADRAO};">Bem-vindo ao</span>
    <span style="color: #1f6494; font-size: 36px; font-weight: 900; line-height: 1.1; letter-spacing: 1px; font-family: ${FONTE_PADRAO};">HELLO KITTY<br><span style="color: #e06187; font-family: ${FONTE_PADRAO};">WORLD</span></span>
  `;

  const playButton = document.createElement("button");
  playButton.textContent = "JOGAR";
  playButton.style.cssText = `
    padding: 16px 40px; font-size: 20px; font-weight: 900; font-family: ${FONTE_PADRAO};
    color: #3d405b; background-color: #f2d925; border: 3px solid #3d405b; border-radius: 50px;
    cursor: pointer; box-shadow: 4px 4px 0px #3d405b; transition: all 0.1s ease-in-out; letter-spacing: 1px;
  `;

  playButton.addEventListener(
    "mouseenter",
    () => (playButton.style.transform = "scale(1.05)"),
  );
  playButton.addEventListener(
    "mouseleave",
    () => (playButton.style.transform = "scale(1)"),
  );
  playButton.addEventListener("mousedown", () => {
    playButton.style.transform = "translate(2px, 2px)";
    playButton.style.boxShadow = "2px 2px 0px #3d405b";
  });

  playButton.addEventListener("click", () => {
    startOverlay.style.display = "none";
    setPaused(false);
  });

  startPanel.appendChild(startTitle);
  startPanel.appendChild(playButton);
  startOverlay.appendChild(startPanel);
  document.body.appendChild(startOverlay);

  const pauseOverlay = document.createElement("div");
  pauseOverlay.style.cssText = `
    position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
    background-color: rgba(61, 64, 91, 0.4); z-index: 10; user-select: none; font-family: ${FONTE_PADRAO};
  `;

  const pausePanel = document.createElement("div");
  pausePanel.style.cssText = `
    display: flex; flex-direction: column; gap: 16px; min-width: 290px; padding: 24px 26px;
    border-radius: 20px; background-color: #fbf8f3; border: 3px solid #3d405b; box-shadow: 0 12px 30px rgba(61, 64, 91, 0.15);
    font-family: ${FONTE_PADRAO};
  `;

  const pauseTitle = document.createElement("div");
  pauseTitle.textContent = "PAUSADO";
  pauseTitle.style.cssText = `font-family: ${FONTE_PADRAO}; font-size: 28px; font-weight: 900; letter-spacing: 2px; text-align: center; color: #e06187;`;

  const speedLabel = document.createElement("div");
  speedLabel.textContent = "Velocidade do Jogo";
  speedLabel.style.cssText = `font-family: ${FONTE_PADRAO}; font-size: 13px; font-weight: 800; color: #7d809b; text-align: center; text-transform: uppercase; letter-spacing: 0.5px;`;

  const speedRow = document.createElement("div");
  speedRow.style.cssText = "display: flex; align-items: center; gap: 8px;";

  const speedButtonBase = {
    padding: "10px 10px",
    border: "2px solid #3d405b",
    background: "#ffffff",
    color: "#3d405b",
    cursor: "pointer",
    flex: "1",
    transition: "all 0.15s ease-in-out",
    fontFamily: FONTE_PADRAO,
    fontWeight: "900",
    fontSize: "13px",
    borderRadius: "12px",
  };

  const speedButton1 = document.createElement("button");
  speedButton1.textContent = "1.0x";
  Object.assign(speedButton1.style, speedButtonBase);

  const speedButton2 = document.createElement("button");
  speedButton2.textContent = "2.0x";
  Object.assign(speedButton2.style, speedButtonBase);

  const speedButton3 = document.createElement("button");
  speedButton3.textContent = "3.0x";
  Object.assign(speedButton3.style, speedButtonBase);

  // === CORREÇÃO TIPOGRÁFICA COMPACTA: Substituídos os seletores sans-serif ===
  const toggleShootingButton = document.createElement("button");
  toggleShootingButton.style.cssText = `padding: 12px 12px; border-radius: 12px; border: 2px solid #f2d925; font-size: 14px; font-weight: 900; cursor: pointer; transition: all 0.15s ease-in-out; font-family: ${FONTE_PADRAO};`;

  const toggleAudioButton = document.createElement("button");
  toggleAudioButton.style.cssText = `padding: 12px 12px; border-radius: 12px; border: 2px solid #f2d925; font-size: 14px; font-weight: 900; cursor: pointer; transition: all 0.15s ease-in-out; font-family: ${FONTE_PADRAO};`;

  const resumeButton = document.createElement("button");
  resumeButton.textContent = "Resumir";
  resumeButton.style.cssText = `padding: 12px 12px; border-radius: 12px; border: none; background: #1f6494; color: #ffffff; font-size: 14px; font-weight: 900; cursor: pointer; box-shadow: 0 3px 6px rgba(31, 100, 148, 0.4); font-family: ${FONTE_PADRAO};`;

  const closeButton = document.createElement("button");
  closeButton.textContent = "Reiniciar Jogo";
  closeButton.style.cssText = `padding: 12px 12px; border-radius: 12px; border: none; background: #d6213b; color: #ffffff; font-size: 14px; font-weight: 900; cursor: pointer; box-shadow: 0 3px 6px rgba(214, 33, 59, 0.4); font-family: ${FONTE_PADRAO};`;

  speedRow.appendChild(speedButton1);
  speedRow.appendChild(speedButton2);
  speedRow.appendChild(speedButton3);
  pausePanel.appendChild(pauseTitle);
  pausePanel.appendChild(speedLabel);
  pausePanel.appendChild(speedRow);
  pausePanel.appendChild(toggleShootingButton);
  pausePanel.appendChild(toggleAudioButton);
  pausePanel.appendChild(resumeButton);
  pausePanel.appendChild(closeButton);
  pauseOverlay.appendChild(pausePanel);
  document.body.appendChild(pauseOverlay);

  function updateSpeedButtons() {
    const activeColor = "#f2d925";
    const activeTextColor = "#3d405b";
    const inactiveColor = "#ffffff";
    const currentSpeed = getGameSpeed();
    const s1 = CONFIG.modos.velocidadeTecla1;
    const s2 = CONFIG.modos.velocidadeTecla2;
    const s3 = CONFIG.modos.velocidadeTecla3;

    speedButton1.style.background =
      currentSpeed === s1 ? activeColor : inactiveColor;
    speedButton1.style.borderColor =
      currentSpeed === s1 ? "#3d405b" : "#d1d3dc";
    speedButton1.style.color = activeTextColor;
    speedButton2.style.background =
      currentSpeed === s2 ? activeColor : inactiveColor;
    speedButton2.style.borderColor =
      currentSpeed === s2 ? "#3d405b" : "#d1d3dc";
    speedButton2.style.color = activeTextColor;
    speedButton3.style.background =
      currentSpeed === s3 ? activeColor : inactiveColor;
    speedButton3.style.borderColor =
      currentSpeed === s3 ? "#3d405b" : "#d1d3dc";
    speedButton3.style.color = activeTextColor;
  }

  function updateShootingButton() {
    if (globalThis._shootEnabled) {
      toggleShootingButton.textContent = "Tiros: Ativados (G)";
      toggleShootingButton.style.background = "#fbe750";
      toggleShootingButton.style.color = "#3d405b";
      toggleShootingButton.style.boxShadow = "0 3px 6px #f2d925";
    } else {
      toggleShootingButton.textContent = "Tiros: Desativados (G)";
      toggleShootingButton.style.background = "#d6213b";
      toggleShootingButton.style.color = "#ffffff";
      toggleShootingButton.style.boxShadow = "none";
    }
  }

  function updateAudioButton() {
    if (globalThis._audioEnabled) {
      toggleAudioButton.textContent = "Áudio: Ativado (S)";
      toggleAudioButton.style.background = "#fbe750";
      toggleAudioButton.style.color = "#3d405b";
      toggleAudioButton.style.boxShadow = "0 3px 6px #f2d925";
    } else {
      toggleAudioButton.textContent = "Áudio: Mudo (S)";
      toggleAudioButton.style.background = "#d6213b";
      toggleAudioButton.style.color = "#ffffff";
      toggleAudioButton.style.boxShadow = "none";
    }
  }

  globalThis.addEventListener("keydown", (event) => {
    if (startOverlay.style.display !== "none") return;
    if (event.key === "Escape") {
      setPaused(!getIsPaused());
      return;
    }
    if (event.key === "g" || event.key === "G") {
      globalThis._shootEnabled = !globalThis._shootEnabled;
      updateShootingButton();
      return;
    }
    if (event.key === "s" || event.key === "S") {
      globalThis._audioEnabled = !globalThis._audioEnabled;
      updateAudioButton();
      return;
    }

    if (event.key === "1") {
      setGameSpeed(CONFIG.modos.velocidadeTecla1);
      updateSpeedButtons();
    } else if (event.key === "2") {
      setGameSpeed(CONFIG.modos.velocidadeTecla2);
      updateSpeedButtons();
    } else if (event.key === "3") {
      setGameSpeed(CONFIG.modos.velocidadeTecla3);
      updateSpeedButtons();
    }
  });

  renderer.domElement.addEventListener("pointerdown", () => {
    if (startOverlay.style.display !== "none") return;
    if (getIsPaused()) setPaused(false);
  });

  pauseOverlay.addEventListener("pointerdown", () => {
    if (startOverlay.style.display !== "none") return;
    if (getIsPaused()) setPaused(false);
  });
  pausePanel.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  toggleShootingButton.addEventListener("click", () => {
    globalThis._shootEnabled = !globalThis._shootEnabled;
    updateShootingButton();
  });
  toggleAudioButton.addEventListener("click", () => {
    globalThis._audioEnabled = !globalThis._audioEnabled;
    updateAudioButton();
  });
  resumeButton.addEventListener("click", () => {
    setPaused(false);
  });
  closeButton.addEventListener("click", () => {
    globalThis.location.reload();
  });
  speedButton1.addEventListener("click", () => {
    setGameSpeed(CONFIG.modos.velocidadeTecla1);
    updateSpeedButtons();
  });
  speedButton2.addEventListener("click", () => {
    setGameSpeed(CONFIG.modos.velocidadeTecla2);
    updateSpeedButtons();
  });
  speedButton3.addEventListener("click", () => {
    setGameSpeed(CONFIG.modos.velocidadeTecla3);
    updateSpeedButtons();
  });

  updateSpeedButtons();
  updateShootingButton();
  updateAudioButton();

  return {
    toggleDisplay: (value) => {
      if (startOverlay.style.display !== "none") return;
      pauseOverlay.style.display = value ? "flex" : "none";
    },
  };
}
