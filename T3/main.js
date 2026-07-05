/**
 * @file Ponto de entrada da cena. Inicializa renderer, cena, câmera, avião e loop de animação.
 */

import * as THREE from "three";
import Stats from "../build/jsm/libs/stats.module.js";
import { criaAviao } from "./aviao.js";
import { onWindowResize } from "../libs/util/util.js";
import { createWorldTiles, updateTiles } from "./tiles.js";
import { initMouseTracking, inputUpdate } from "./input.js";
import { updateCamera } from "./camera.js";
import { CriadorInimigos } from "./criadorInimigos.js";
import { initPauseMenu, initUI } from "./buttons.js";
import { LaserPool } from "./sistemaTiros.js";
import { CollisionManager } from "./collisionManager.js";
import { criaTarget } from "./target.js";
import { CONFIG } from "./config.js";
import { initSceneLighting, updateLightVolume } from "./light.js";
import { startRenderer } from "./renderer.js";
import { initMobileControls } from "./mobile.js";
import { GerenciadorItens } from "./GerenciadorItens.js";

// Cor do céu — usada tanto no fundo do renderer quanto na névoa para fundir o horizonte
const BASE_COLOR = "rgb(148, 181, 224)";
let scene = new THREE.Scene();
scene.fog = new THREE.Fog(BASE_COLOR, 1, 1200);
let renderer = await startRenderer(BASE_COLOR);

// Painel de FPS no canto da tela
const stats = new Stats();
document.getElementById("webgl-output").appendChild(stats.domElement);

// FOV de 22° = zoom longo, parecido com câmera de perseguição de shoot-em-up
let camera = new THREE.PerspectiveCamera(
  22,
  window.innerWidth / window.innerHeight,
  0.1,
  2100,
);
camera.position.set(0, 105, -150);
camera.lookAt(0, 120, 0);
scene.add(camera);

let light = initSceneLighting(camera, scene);

initMouseTracking();

// Cria o modelo do avião e posiciona no centro da cena
const aviaoController = criaAviao(scene);
let aviaoMesh = aviaoController.object;
aviaoMesh.position.set(0, CONFIG.input.planeBaseY, 0);

// Target
const targetMesh = criaTarget(scene);
targetMesh.position.set(0, CONFIG.input.planeBaseY, 140);

// População inimigo
let tempoInimigo = 0;
let listaInimigos = [];
const POPULACAO_TOTAL = 5;

const criadorInimigos = new CriadorInimigos(scene);

for (let i = 0; i < POPULACAO_TOTAL; i++) {
  _setLoadingProgress(10 + (i / POPULACAO_TOTAL) * 80, `Carregando inimigos... ${i + 1}/${POPULACAO_TOTAL}`);
  const ladoDoCanto = i % 2 === 0 ? -80 : 80;
  const posicaoZFixaDesteInimigo = CONFIG.inimigos.posicaoZCombate;

  const inimigoSorteado = await criadorInimigos.criarInimigoAleatorio(
    ladoDoCanto,
    CONFIG.input.planeBaseY,
    posicaoZFixaDesteInimigo,
  );

  inimigoSorteado.indice = i;
  inimigoSorteado.life = 100;
  inimigoSorteado.destruido = false;
  if (inimigoSorteado.mesh) {
    inimigoSorteado.mesh.life = 100;
  }

  inimigoSorteado.offsetZAtual = posicaoZFixaDesteInimigo;
  listaInimigos.push(inimigoSorteado);

  if (i < 2) {
    inimigoSorteado.ativo = true;
    inimigoSorteado.mesh.visible = true;
  }
}

// Vida dos Inimigos e do Jogador
let inimigosAbatidos = 0;
let contadorAbatesParaDrop = 0; // ADICIONE ESTA LINHA AQUI PARA CRIAR A VARIÁVEL
let aviaoBB = new THREE.Box3();

// Sistema de tiros
let laserPool = new LaserPool(scene, "player", "rgb(255, 25, 140)", 80);
let laserPoolInimigos = new LaserPool(scene, "enemy", "rgb(21, 0, 255)", 40);

// Passamos a scene e a light para o buttons.js instanciar e estilizar o dat.GUI sem duplicar
const hud = initUI(scene, light);
const inimigoCollisionManager = new CollisionManager("enemy", null, hud);

// Tiro dos inimigos
const INTERVALO_TIRO_INIMIGO = CONFIG.inimigos.intervaloTiro;

function gerenciarDisparoInimigos(scaledDelta, aviaoMesh) {
  if (!aviaoMesh || !camera) return;
  if (globalThis._shootEnabled === false) return;

  listaInimigos.forEach((inimigoTarget) => {
    if (!inimigoTarget.ativo || !inimigoTarget.mesh || inimigoTarget.caindo)
      return;

    const distanciaAteCamera = inimigoTarget.mesh.position.distanceTo(
      camera.position,
    );

    if (scene.fog && distanciaAteCamera > scene.fog.far) {
      return;
    }

    if (
      inimigoTarget.tempoRecarga === undefined ||
      inimigoTarget.tempoRecarga === null
    ) {
      inimigoTarget.tempoRecarga = CONFIG.inimigos.delayPrimeiroTiro;
    }

    inimigoTarget.tempoRecarga += scaledDelta;
    inimigoTarget.posicaoZOriginal = CONFIG.inimigos.posicaoZCombate;

    const intervaloAdaptado = CONFIG.inimigos.intervaloTiro / gameSpeed;

    if (inimigoTarget.tempoRecarga >= intervaloAdaptado) {
      let direcaoAlvo = new THREE.Vector3();
      direcaoAlvo.subVectors(aviaoMesh.position, inimigoTarget.mesh.position);

      laserPoolInimigos.shoot(inimigoTarget.mesh.position, direcaoAlvo);
      inimigoTarget.tempoRecarga = 0;
    }
  });
}

// Controle de entrada de tiros
let estaAtirando = false;
let tempoUltimoTiro = 0;
const CADENCIA_TIRO = CONFIG.lasers.cadenciaJogador;

globalThis.addEventListener("mousedown", (event) => {
  if (event.button === 0) estaAtirando = true;
});
globalThis.addEventListener("mouseup", (event) => {
  if (event.button === 0) estaAtirando = false;
});
globalThis.addEventListener("keydown", (event) => {
  if (event.code === "Space") estaAtirando = true;
});
globalThis.addEventListener("keyup", (event) => {
  if (event.code === "Space") estaAtirando = false;
});
globalThis.addEventListener("blur", () => {
  estaAtirando = false;
});

// Mobile: disparo controlado pelo movimento do joystick via globalThis._mobileFiring (ver mobile.js)

const jogadorCollisionManager = new CollisionManager(
  "player",
  (target, status) => {
    // Se atingiu o limite e o avião ainda não iniciou a queda
    if (status.life >= CONFIG.armas.limiteTiros && !aviaoMesh.caindo) {
      aviaoMesh.caindo = true;
      aviaoMesh.velocidadeQuedaY = 25; // Mesma velocidade de queda dos inimigos
      aviaoMesh.velocidadeGiro = Math.random() * 8 + 6;

      // Bloqueia disparos do jogador imediatamente
      globalThis._shootEnabled = false;

      // Cria o aviso "Ai, eu morri" na tela
      hud.showMorteAviso(resetGame);
    }
  },
  hud,
);

//Health pack 
const gerenciadorItens = new GerenciadorItens(scene);
gerenciadorItens.inicializarPool();

window.addEventListener(
  "resize",
  function () {
    onWindowResize(camera, renderer);
    updateLightVolume(light, scene.fog.far);
  },
  false,
);

createWorldTiles(scene);

const clock = new THREE.Clock();
let isPaused = false;
let gameSpeed = CONFIG.modos.velocidadeJogoPadrao;

let pauseMenu = null;
if (!CONFIG.DISABLE_START_MENU) {
  pauseMenu = initPauseMenu({
    renderer: renderer,
    getIsPaused: () => isPaused,
    setPaused: (value) => {
      isPaused = value;
      if (pauseMenu) pauseMenu.toggleDisplay(value);
      if (!value) {
        clock.getDelta();
      }
    },
    getGameSpeed: () => gameSpeed,
    setGameSpeed: (value) => {
      gameSpeed = value;
    },
  });
}

initMobileControls();
_setLoadingProgress(100, 'Pronto!');
// Exibe o botão JOGAR na tela de carregamento; ela só some quando o jogador clicar
const _loadingStartBtn = document.getElementById('loading-start-btn');
if (_loadingStartBtn) {
  _loadingStartBtn.style.display = 'block';
  _loadingStartBtn.addEventListener('click', () => {
    _hideLoadingScreen();
    // Inicia o jogo diretamente (pula a tela inicial do menu de pausa)
    if (pauseMenu) pauseMenu.start();
    else { isPaused = false; clock.getDelta(); }
  });
  // Efeito de clique físico no botão
  _loadingStartBtn.addEventListener('mousedown', () => {
    _loadingStartBtn.style.transform = 'translate(2px, 2px)';
    _loadingStartBtn.style.boxShadow = '2px 2px 0px #3d405b';
  });
  _loadingStartBtn.addEventListener('mouseup', () => {
    _loadingStartBtn.style.transform = 'none';
    _loadingStartBtn.style.boxShadow = '4px 4px 0px #3d405b';
  });
}

const _direcaoTiroJogador = new THREE.Vector3();

function gerenciarDisparoJogador(scaledDelta) {
  tempoUltimoTiro += scaledDelta;
  if (globalThis._shootEnabled === false) return;

  const disparando = estaAtirando || globalThis._mobileFiring === true;
  if (
    disparando &&
    tempoUltimoTiro >= CADENCIA_TIRO &&
    targetMesh &&
    aviaoMesh
  ) {
    _direcaoTiroJogador
      .subVectors(targetMesh.position, aviaoMesh.position)
      .normalize();
    laserPool.shoot(aviaoMesh.position, _direcaoTiroJogador);
    tempoUltimoTiro = 0;
  }
}

function processarReciclagemInimigos() {
  listaInimigos.forEach((inimigoTarget) => {
    if (!inimigoTarget?.ativo) return;

    const meshInterna = inimigoTarget.mesh;
    if (!meshInterna) return;

    const foiAbatido =
      inimigoTarget.life <= 0 ||
      inimigoTarget.destruido === true ||
      meshInterna.life <= 0 ||
      (meshInterna.userData && meshInterna.userData.life <= 0);

    if (foiAbatido && !inimigoTarget.caindo) {
      inimigoTarget.caindo = true;
      inimigoTarget.velocidadeQuedaY = 25;
      inimigoTarget.velocidadeGiro = Math.random() * 8 + 6;
      // Avisa o gerenciador que um abate aconteceu, passando o aviaoMesh como referência de posição
      if (gerenciadorItens) {
        gerenciadorItens.registrarAbate(aviaoMesh);
      }
      return;
    }

    const bateuNoChao = meshInterna.position.y <= -20;

    if (bateuNoChao) {
      inimigoTarget.ativo = false;
      inimigoTarget.active = false;
      inimigoTarget.caindo = false;
      meshInterna.visible = false;
      inimigosAbatidos++;

      inimigoTarget.life = 100;
      inimigoTarget.destruido = false;
      meshInterna.life = 100;

      inimigoTarget.offsetZAtual = CONFIG.inimigos.distanciaSpawnZ;
      inimigoTarget.posicaoZOriginal = CONFIG.inimigos.posicaoZCombate;
      inimigoTarget.tempoRecarga = CONFIG.inimigos.delayPrimeiroTiro;
    }

   if (foiAbatido && !inimigoTarget.caindo) {
     inimigoTarget.caindo = true;
     inimigoTarget.velocidadeQuedaY = 50;
     inimigoTarget.velocidadeGiro = Math.random() * 8 + 6;

     if (meshInterna.userData) meshInterna.userData.destruido = false;

     return;
   }
  });
}

function _setLoadingProgress(pct, txt) {
  const bar = document.getElementById('loading-bar');
  const label = document.getElementById('loading-text');
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = txt;
}

function _hideLoadingScreen() {
  const el = document.getElementById('loading-screen');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 500);
}

function resetGame() {
  document.getElementById("ui-container-morte")?.remove();

  aviaoMesh.caindo = false;
  aviaoMesh.position.set(0, CONFIG.input.planeBaseY, 0);
  aviaoMesh.rotation.set(0, 0, 0);
  aviaoMesh.velocidadeQuedaY = undefined;
  aviaoMesh.velocidadeGiro = undefined;

  globalThis._shootEnabled = true;
  estaAtirando = false;
  globalThis._mobileFiring = false;
  tempoUltimoTiro = 0;

  listaInimigos.forEach((inimigo) => {
    inimigo.caindo = false;
    inimigo.ativo = false;
    inimigo.life = 100;
    inimigo.destruido = false;
    inimigo.tempoRecarga = CONFIG.inimigos.delayPrimeiroTiro;
    inimigo.velocidadeQuedaY = 0;
    inimigo.velocidadeGiro = 0;
    if (inimigo.mesh) {
      inimigo.mesh.life = 100;
      inimigo.mesh.visible = false;
      inimigo.mesh.rotation.set(0, 0, 0);
    }
    inimigo.offsetZAtual = CONFIG.inimigos.posicaoZCombate;
    inimigo.posicaoZOriginal = CONFIG.inimigos.posicaoZCombate;
  });

  if (listaInimigos[0]) {
    listaInimigos[0].ativo = true;
    listaInimigos[0].mesh.visible = true;
    listaInimigos[0].mesh.position.set(-80, CONFIG.input.planeBaseY, CONFIG.inimigos.posicaoZCombate);
  }
  if (listaInimigos[1]) {
    listaInimigos[1].ativo = true;
    listaInimigos[1].mesh.visible = true;
    listaInimigos[1].mesh.position.set(80, CONFIG.input.planeBaseY, CONFIG.inimigos.posicaoZCombate);
  }

  laserPool.clearAll();
  laserPoolInimigos.clearAll();

  inimigosAbatidos = 0;
  inimigoCollisionManager.reset();
  jogadorCollisionManager.reset();

  hud.updateScore(0);
  hud.updateLife(0);
  hud.updateSaldo(0, 0);

  gameSpeed = CONFIG.modos.velocidadeJogoPadrao;
  if (pauseMenu) pauseMenu.syncSpeedButtons();

  if (pauseMenu) pauseMenu.showStartScreen();
  isPaused = true;
  clock.getDelta();
}

// Teto de delta por frame: evita que um hitch (aba em segundo plano, GC, troca
// de aba por muito tempo) jogue um delta gigante direto na física do avião,
// câmera e lerps — o que causava "espasmos"/piruetas ao voltar para a página,
// piorado em gameSpeed 2x/3x (scaledDelta = delta * gameSpeed amplifica ainda mais).
const MAX_DELTA = 1 / 15;

// Inicia o loop do jogo
render();

function render() {
  const delta = Math.min(clock.getDelta(), MAX_DELTA);

  if (!isPaused) {
    const scaledDelta = delta * gameSpeed;

    // === LÓGICA DE QUEDA E PERDA DE CONTROLE BLINDADA ===
    if (aviaoMesh.caindo) {
      aviaoMesh.position.x += (0 - aviaoMesh.position.x) * 0.1;

      if (aviaoMesh.velocidadeQuedaY === undefined)
        aviaoMesh.velocidadeQuedaY = 5;
      if (aviaoMesh.velocidadeGiro === undefined) aviaoMesh.velocidadeGiro = 6;

      // Cai em Y cruzando o chão para sumir da tela
      aviaoMesh.position.y -= aviaoMesh.velocidadeQuedaY * scaledDelta;

      // Gira apenas no eixo Z descontroladamente
      aviaoMesh.rotation.z += aviaoMesh.velocidadeGiro * scaledDelta;

      // Quando sumir totalmente da viewport de câmera (Y <= -250), congela e abre o Game Over
      if (aviaoMesh.position.y <= -10) {
        isPaused = true;
        }
    } else {
      // CORREÇÃO MESTRA: O input só lê se NÃO estiver caindo (Removido o duplo comando abaixo)
      inputUpdate(aviaoMesh, targetMesh, camera, scaledDelta);
    }

    updateTiles(scaledDelta);
    updateCamera(camera, aviaoMesh, scaledDelta);
    gerenciadorItens.atualizar(scaledDelta, aviaoMesh);

    if (aviaoMesh && !aviaoMesh.caindo) {
      tempoInimigo += scaledDelta;
      criadorInimigos.atualizarMovimento(
        scaledDelta,
        aviaoMesh,
        camera,
        listaInimigos,
      );
    }

    if (gerenciadorItens) {
      gerenciadorItens.atualizar(scaledDelta, aviaoMesh, (quantidadeCura) => {
        if (aviaoMesh.userData && aviaoMesh.userData.life !== undefined) {
          aviaoMesh.userData.life = Math.min(
            100,
            aviaoMesh.userData.life + quantidadeCura,
          );
        } else if (aviaoMesh.life !== undefined) {
          aviaoMesh.life = Math.min(100, aviaoMesh.life + quantidadeCura);
        }

        // Sincroniza e força a atualização visual da barra de vida (HUD) do jogo
        if (typeof atualizarBarraVidaUI === "function") {
          atualizarBarraVidaUI();
        } else if (hud && typeof hud.updateHealth === "function") {
          const vidaAtual =
            (aviaoMesh.userData && aviaoMesh.userData.life) ||
            aviaoMesh.life ||
            100;
          hud.updateHealth(vidaAtual);
        }

        console.log(
          `[TESTE COLETA] HA coletado! Distância validada. Energia recuperada em +${quantidadeCura}%`,
        );
      });
    }

    aviaoBB.setFromObject(aviaoMesh);
    gerenciarDisparoJogador(scaledDelta);
    gerenciarDisparoInimigos(scaledDelta, aviaoMesh);

    laserPool.update(scaledDelta, aviaoMesh, scene.fog.far);
    laserPoolInimigos.update(scaledDelta, aviaoMesh);

    listaInimigos.forEach((inimigo) => {
      if (inimigo.ativo && inimigo.mesh && inimigo.bb) {
        if (inimigo.caindo) {
          inimigo.bb.makeEmpty();
        } else {
          inimigo.bb.setFromObject(inimigo.mesh);
        }
      }
    });

    const inimigosProntosParaColidir = listaInimigos.filter(
      (inimigo) => inimigo.ativo && !inimigo.caindo,
    );

    inimigoCollisionManager.checkLaserAgainstTargets(
      laserPool.getActiveLasers(),
      inimigosProntosParaColidir,
      laserPool,
      camera,
      scene,
    );

    processarReciclagemInimigos();

    if (!aviaoMesh.caindo) {
      jogadorCollisionManager.checkLaserAgainstTargets(
        laserPoolInimigos.getActiveLasers(),
        [{ ativo: true, mesh: aviaoMesh, bb: aviaoBB }],
        laserPoolInimigos,
      );
    }
  }

  hud.updateAltitude(aviaoMesh.position.y);
  stats.update();
  requestAnimationFrame(render);
  renderer.render(scene, camera);
}
