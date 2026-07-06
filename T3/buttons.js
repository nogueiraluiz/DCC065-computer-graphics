// buttons.js
import { CONFIG } from "./config.js";
import GUI from "../../libs/util/dat.gui.module.js";
import { updateLightVolume } from "./light.js";

// A fonte fofa e arredondada oficial do seu jogo
const FONTE_PADRAO = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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

    showGameOver() {
      if (document.getElementById("game-arcade-over")) return;

      const avisoMorteAntigo = document.getElementById("ui-container-morte");
      if (avisoMorteAntigo) {
        avisoMorteAntigo.remove();
      }

      const gameOverOverlay = document.createElement("div");
      gameOverOverlay.id = "game-arcade-over";
      gameOverOverlay.style.cssText = `
        position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        background-color: rgba(61, 64, 91, 0.5); z-index: 3000; font-family: ${FONTE_PADRAO};
      `;

      const panel = document.createElement("div");
      panel.style.cssText = `
        display: flex; flex-direction: column; align-items: center; gap: 20px;
        min-width: 300px; padding: 36px; border-radius: 20px; background-color: #fbf8f3;
        border: 4px solid #3d405b; box-shadow: 8px 8px 0px #3d405b; text-align: center;
        font-family: ${FONTE_PADRAO};
      `;

      // Título em Rosa Hello Kitty (#e06187) igual ao "PAUSADO"
      const title = document.createElement("div");
      title.innerHTML = `
        <span style="color: #e06187; font-size: 36px; font-weight: 900; letter-spacing: 2px; font-family: ${FONTE_PADRAO}; text-transform: uppercase;">GAME OVER</span>
        <div style="font-size: 14px; font-weight: 800; color: #7d809b; margin-top: 8px; text-transform: uppercase; font-family: ${FONTE_PADRAO};">O avião foi destruído!</div>
      `;

      // Único Botão: Tentar Novamente em Amarelo Arcade (#f2d925) com texto escuro
      const btnRestart = document.createElement("button");
      btnRestart.textContent = "TENTAR NOVAMENTE";
      btnRestart.style.cssText = `
        width: 100%; padding: 14px 28px; font-size: 14px; font-weight: 900; color: #3d405b;
        background-color: #f2d925; border: 3px solid #3d405b; border-radius: 12px;
        cursor: pointer; box-shadow: 4px 4px 0px #3d405b; transition: all 0.1s ease-in-out;
        font-family: ${FONTE_PADRAO}; letter-spacing: 0.5px;
      `;
      btnRestart.addEventListener("click", () => globalThis.location.reload());

      // Efeito de clique físico tridimensional no botão
      btnRestart.addEventListener("mousedown", () => {
        btnRestart.style.transform = "translate(2px, 2px)";
        btnRestart.style.boxShadow = "2px 2px 0px #3d405b";
      });
      btnRestart.addEventListener("mouseup", () => {
        btnRestart.style.transform = "none";
        btnRestart.style.boxShadow = "4px 4px 0px #3d405b";
      });

      panel.appendChild(title);
      panel.appendChild(btnRestart);
      gameOverOverlay.appendChild(panel);
      document.body.appendChild(gameOverOverlay);
    },

    // === MODIFICADO: AVISO COM BOTÃO INFERIOR ACOPLADO E Z-INDEX SEGURO ===
    showMorteAviso() {
      if (document.getElementById("ui-container-morte")) return;

      const mainContainer = document.createElement("div");
      mainContainer.id = "ui-container-morte";
      mainContainer.style.cssText = `
        position: fixed;
        top: 45%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        z-index: 900; /* Fica abaixo de overlays de pause (10) ou outros menus principais */
        pointer-events: auto;
      `;

      const aviso = document.createElement("div");
      aviso.textContent = "Ai, eu morri";
      aviso.style.cssText = `
        background: #cb1e6f;
        color: #ffffff;
        font-family: ${FONTE_PADRAO};
        font-size: 24px;
        font-weight: 900;
        padding: 16px 32px;
        border: 4px solid #1a1a1a;
        border-radius: 12px;
        box-shadow: 6px 6px 0px #1a1a1a;
        text-transform: uppercase;
        letter-spacing: 1px;
        text-align: center;
        transition: transform 0.05s;
      `;

      const quickBtn = document.createElement("button");
      quickBtn.textContent = "REINICIAR";
      quickBtn.style.cssText = `
        padding: 10px 24px;
        font-size: 13px;
        font-weight: 900;
        color: #1a1a1a;
        background-color: #f2d925;
        border: 3px solid #1a1a1a;
        border-radius: 12px;
        cursor: pointer;
        box-shadow: 4px 4px 0px #1a1a1a;
        font-family: ${FONTE_PADRAO};
        transition: transform 0.05s;
      `;
      quickBtn.addEventListener("click", () => globalThis.location.reload());
      quickBtn.addEventListener("mousedown", () => {
        quickBtn.style.transform = "translate(2px, 2px)";
        quickBtn.style.boxShadow = "2px 2px 0px #1a1a1a";
      });

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

      mainContainer.appendChild(aviso);
      mainContainer.appendChild(quickBtn);
      document.body.appendChild(mainContainer);
    },
    showVictoryScreen() {
      if (document.getElementById("game-arcade-victory")) return;

      const victoryOverlay = document.createElement("div");
      victoryOverlay.id = "game-arcade-victory";
      victoryOverlay.style.cssText = `
        position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        background-color: rgba(148, 181, 224, 0.7); z-index: 4000; font-family: ${FONTE_PADRAO};
      `;

      const panel = document.createElement("div");
      panel.style.cssText = `
        display: flex; flex-direction: column; align-items: center; gap: 24px;
        min-width: 360px; padding: 40px; border-radius: 25px; background-color: #fbf8f3;
        border: 4px solid #3d405b; box-shadow: 8px 8px 0px #3d405b; text-align: center;
        font-family: ${FONTE_PADRAO};
      `;

      const title = document.createElement("div");
      title.innerHTML = `
        <span style="color: #e06187; font-size: 38px; font-weight: 900; letter-spacing: 2px; font-family: ${FONTE_PADRAO}; text-transform: uppercase; display: block;">VITÓRIA!</span>
        <div style="font-size: 20px; font-weight: 800; color: #3d405b; margin-top: 14px; line-height: 1.4; font-family: ${FONTE_PADRAO};">
          Parabéns, a Hello Kitty salvou o mundo da invasão alienígena!
        </div>
      `;

      const btnPlayAgain = document.createElement("button");
      btnPlayAgain.textContent = "JOGAR NOVAMENTE";
      btnPlayAgain.style.cssText = `
        width: 100%; padding: 14px 28px; font-size: 14px; font-weight: 900; color: #3d405b;
        background-color: #f2d925; border: 3px solid #3d405b; border-radius: 12px;
        cursor: pointer; box-shadow: 4px 4px 0px #3d405b; transition: all 0.1s ease-in-out;
        font-family: ${FONTE_PADRAO}; letter-spacing: 0.5px;
      `;
      btnPlayAgain.addEventListener("click", () =>
        globalThis.location.reload(),
      );

      btnPlayAgain.addEventListener("mousedown", () => {
        btnPlayAgain.style.transform = "translate(2px, 2px)";
        btnPlayAgain.style.boxShadow = "2px 2px 0px #3d405b";
      });

      panel.appendChild(title);
      panel.appendChild(btnPlayAgain);
      victoryOverlay.appendChild(panel);
      document.body.appendChild(victoryOverlay);
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

  // =========================================================================
  // 1. TELA DE CARREGAMENTO — visível assim que a página abre, sem nenhum
  // clique prévio. Fundo temático de céu (mesma paleta do fog/sky do jogo)
  // com "nuvens" simples em CSS, já que não há um asset de imagem de fundo.
  // =========================================================================
  const loadingScreen = document.createElement("div");
  loadingScreen.id = "real-loading-screen";
  loadingScreen.style.cssText = `
    position: fixed; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; overflow: hidden;
    background: linear-gradient(180deg, #6fa3e0 0%, #94b5e0 45%, #bcd3ee 100%);
    z-index: 2500; font-family: ${FONTE_PADRAO}; user-select: none;
    transition: opacity 0.35s ease, transform 0.35s ease;
  `;

  let loadingEncerrado = false;

  // "Nuvens" decorativas simples, só CSS — reforçam o tema de céu/avião.
  const cloudsLayer = document.createElement("div");
  cloudsLayer.style.cssText = `position: absolute; inset: 0; pointer-events: none;`;
  const nuvemSpecs = [
    { top: "12%", left: "8%", size: 90, dur: "22s" },
    { top: "22%", left: "68%", size: 130, dur: "28s" },
    { top: "68%", left: "20%", size: 110, dur: "25s" },
    { top: "78%", left: "72%", size: 80, dur: "19s" },
  ];
  nuvemSpecs.forEach((n, i) => {
    const nuvem = document.createElement("div");
    nuvem.style.cssText = `
      position: absolute; top: ${n.top}; left: ${n.left}; width: ${n.size}px; height: ${n.size * 0.5}px;
      background: rgba(255,255,255,0.85); border-radius: 50%;
      box-shadow: ${n.size * 0.35}px ${n.size * 0.08}px 0 -${n.size * 0.08}px rgba(255,255,255,0.85),
                  -${n.size * 0.3}px ${n.size * 0.1}px 0 -${n.size * 0.1}px rgba(255,255,255,0.7);
      animation: nuvemFlutua ${n.dur} ease-in-out infinite alternate;
      animation-delay: -${i * 3}s;
    `;
    cloudsLayer.appendChild(nuvem);
  });
  loadingScreen.appendChild(cloudsLayer);

  // Ícone da Hello Kitty: emoji em vez de imagem (não há asset de ícone no
  // projeto, e assim não depende de nenhum arquivo externo para renderizar).
  const kittyIcon = document.createElement("div");
  kittyIcon.textContent = "🎀";
  kittyIcon.style.cssText = `
    width: 100px; height: 100px;
    font-size: 72px; line-height: 100px; text-align: center;
    margin-bottom: 24px; position: relative;
  `;

  // Animações CSS: a Hello Kitty balança, o texto pisca e as nuvens flutuam.
  if (!document.getElementById("kitty-dance-style")) {
    const styleSheet = document.createElement("style");
    styleSheet.id = "kitty-dance-style";
    styleSheet.textContent = `
      @keyframes kittyBalanço {
        0% { transform: rotate(-10deg) scale(1); }
        100% { transform: rotate(10deg) scale(1.05); }
      }
      @keyframes piscarTexto {
        from { opacity: 1; } to { opacity: 0.5; }
      }
      @keyframes nuvemFlutua {
        from { transform: translateX(0); } to { transform: translateX(40px); }
      }
      .loading-fade-out {
        opacity: 0;
        transform: scale(0.98);
        pointer-events: none;
      }
    `;
    document.head.appendChild(styleSheet);
  }
  kittyIcon.style.animation =
    "kittyBalanço 0.6s infinite alternate ease-in-out";

  const loadingText = document.createElement("div");
  loadingText.textContent = "PREPARANDO MUNDO FOFO...";
  loadingText.style.cssText = `
    color: #ffffff; font-size: 20px; font-weight: 900; letter-spacing: 2px;
    margin-bottom: 20px; text-shadow: 3px 3px 0px #3d405b; text-transform: uppercase;
    animation: piscarTexto 0.8s infinite alternate; position: relative;
  `;

  const barContainer = document.createElement("div");
  barContainer.style.cssText = `
    width: 280px; height: 24px; background: #fbf8f3;
    border: 4px solid #3d405b; border-radius: 12px; overflow: hidden;
    box-shadow: 4px 4px 0px #3d405b; position: relative;
  `;

  const fillBar = document.createElement("div");
  fillBar.id = "real-loading-bar-fill";
  fillBar.style.cssText = `
    width: 0%; height: 100%; background: #e06187; /* Rosa Hello Kitty */
    transition: width 0.15s ease-out;
  `;

  // Percentual numérico real (não é só decoração — reflete o progresso
  // efetivo dos assets carregados, atualizado pelo LoadingManager em main.js).
  const percentText = document.createElement("div");
  percentText.id = "real-loading-bar-percent";
  percentText.textContent = "0%";
  percentText.style.cssText = `
    color: #ffffff; font-size: 14px; font-weight: 900; margin-top: 10px;
    text-shadow: 2px 2px 0px #3d405b; letter-spacing: 1px; position: relative;
  `;

  const loadingStage = document.createElement("div");
  loadingStage.style.cssText = `
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  `;

  const welcomePanel = document.createElement("div");
  welcomePanel.style.cssText = `
    display: none; flex-direction: column; align-items: center; justify-content: center; gap: 24px;
    min-width: 320px; padding: 40px 30px; border-radius: 25px; background-color: #fbf8f3;
    border: 4px solid #3d405b; box-shadow: 8px 8px 0px #3d405b; text-align: center;
    font-family: ${FONTE_PADRAO};
  `;

  const welcomeTitle = document.createElement("div");
  welcomeTitle.innerHTML = `
    <span style="color: #e06187; display: block; font-size: 16px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; font-family: ${FONTE_PADRAO};">Bem-vindo ao</span>
    <span style="color: #1f6494; font-size: 36px; font-weight: 900; line-height: 1.1; letter-spacing: 1px; font-family: ${FONTE_PADRAO};">HELLO KITTY<br><span style="color: #e06187; font-family: ${FONTE_PADRAO};">WORLD</span></span>
  `;

  const playButton = document.createElement("button");
  playButton.textContent = "INICIAR";
  playButton.style.cssText = `
    padding: 16px 40px; font-size: 20px; font-weight: 900; font-family: ${FONTE_PADRAO};
    color: #3d405b; background-color: #f2d925; border: 3px solid #3d405b; border-radius: 50px;
    cursor: pointer; box-shadow: 4px 4px 0px #3d405b; transition: all 0.1s ease-in-out; letter-spacing: 1px;
  `;

  function esconderLoadingEIniciar() {
    if (loadingEncerrado) return;
    loadingEncerrado = true;

    loadingScreen.classList.add("loading-fade-out");
    loadingScreen.addEventListener(
      "transitionend",
      (event) => {
        if (event.target !== loadingScreen) return;
        loadingScreen.remove();
        setPaused(false);
        if (globalThis.audioGeral) {
          globalThis._loadingAtivo = false;
          globalThis.audioGeral.pararSom("musicaLoading");
          globalThis.audioGeral.tocarMusicaLoop("musicaFundo", 0.2);
        }
      },
      { once: true },
    );
  }

  playButton.addEventListener("click", () => {
    esconderLoadingEIniciar();
  });

  barContainer.appendChild(fillBar);
  loadingStage.appendChild(kittyIcon);
  loadingStage.appendChild(loadingText);
  loadingStage.appendChild(barContainer);
  loadingStage.appendChild(percentText);
  welcomePanel.appendChild(welcomeTitle);
  welcomePanel.appendChild(playButton);
  loadingScreen.appendChild(loadingStage);
  loadingScreen.appendChild(welcomePanel);
  document.body.appendChild(loadingScreen);

  // =========================================================================
  // 3. MENU DE PAUSE INTERNO (SISTEMA PADRÃO DO ESCAPE)
  // =========================================================================
  const pauseOverlay = document.createElement("div");
  pauseOverlay.style.cssText = `
    position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
    background-color: rgba(61, 64, 91, 0.4); z-index: 2100; user-select: none; font-family: ${FONTE_PADRAO};
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
    if (document.body.contains(loadingScreen))
      return;
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
    if (document.body.contains(loadingScreen))
      return;
    if (getIsPaused()) setPaused(false);
  });

  pauseOverlay.addEventListener("pointerdown", () => {
    if (document.body.contains(loadingScreen))
      return;
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
    setLoadingComplete() {
      loadingStage.style.display = "none";
      welcomePanel.style.display = "flex";
    },
    toggleDisplay: (value) => {
      if (document.body.contains(loadingScreen))
        return;
      pauseOverlay.style.display = value ? "flex" : "none";
    },
  };
}