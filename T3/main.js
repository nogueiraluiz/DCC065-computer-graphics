/**
 * @file Ponto de entrada da cena. Inicializa renderer, cena, câmera, avião e loop de animação.
 */

import * as THREE from "three";
import Stats from "../../build/jsm/libs/stats.module.js";
import { criaAviao } from "./aviao.js";
import { onWindowResize } from "../libs/util/util.js";
import { createWorldTiles, updateTiles, createWaterPlane } from "./tiles.js";
import { initMouseTracking, inputUpdate } from "./input.js";
import { initMobileControls } from "./mobile.js";
import { updateCamera } from "./camera.js";
import { CriadorInimigos } from "./criadorInimigos.js";
import { initPauseMenu, initUI } from "./buttons.js";
import { LaserPool } from "./sistemaTiros.js";
import { CollisionManager } from "./collisionManager.js";
import { criaTarget } from "./target.js";
import { CONFIG } from "./config.js";
import { initSceneLighting, updateLightVolume } from "./light.js";
import { startRenderer } from "./renderer.js";
import { GerenciadorItens } from "./GerenciadorItens.js";
import { GerenciadorAudio } from "./barulhos.js";

const BASE_COLOR = "rgb(148, 181, 224)";
let scene = new THREE.Scene();
scene.fog = new THREE.Fog(BASE_COLOR, 1, 1200);
let renderer = await startRenderer(BASE_COLOR);

const stats = new Stats();
document.getElementById("webgl-output").appendChild(stats.domElement);

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

// LoadingManager compartilhado: rastreia o progresso REAL de todo asset
// (áudio, modelos OBJ/MTL dos inimigos, STL do health pack) carregado através
// dele, para a barra de carregamento refletir o andamento de verdade.
const loadingManager = new THREE.LoadingManager();

// Áudio Global acoplado seguramente à câmera
globalThis.audioGeral = new GerenciadorAudio(camera, loadingManager);
globalThis._loadingAtivo = true;

initMouseTracking();
initMobileControls();

const aviaoController = criaAviao(scene);
let aviaoMesh = aviaoController.object;
aviaoMesh.position.set(0, CONFIG.input.planeBaseY, 0);

const targetMesh = criaTarget(scene);
targetMesh.position.set(0, CONFIG.input.planeBaseY, 140);

let tempoInimigo = 0;
let listaInimigos = [];

const criadorInimigos = new CriadorInimigos(scene, loadingManager);
const gerenciadorItens = new GerenciadorItens(scene, loadingManager);

let inimigosAbatidos = 0;
let aviaoBB = new THREE.Box3();

let laserPool = new LaserPool(scene, "player", "rgb(255, 25, 140)", 80);
let laserPoolInimigos = new LaserPool(scene, "enemy", "rgb(21, 0, 255)", 40);

const hud = initUI(scene, light);
const inimigoCollisionManager = new CollisionManager("enemy", null, hud);

let pauseMenu = null;

const clock = new THREE.Clock();
let isPaused = false;
let gameSpeed = CONFIG.modos.velocidadeJogoPadrao;

if (!CONFIG.DISABLE_START_MENU) {
  pauseMenu = initPauseMenu({
    renderer,
    getIsPaused: () => isPaused,
    setPaused: (value) => {
      isPaused = value;
      pauseMenu.toggleDisplay(value);
      if (!value) clock.getDelta();
    },
    getGameSpeed: () => gameSpeed,
    setGameSpeed: (value) => {
      gameSpeed = value;
    },
  });
}

// =============================================================================
// TELA DE CARREGAMENTO: progresso real via LoadingManager, exibido suavizado
// =============================================================================
// O LoadingManager conta cada requisição feita pelos loaders que o recebem
// (AudioLoader, MTLLoader, OBJLoader, STLLoader — ver GerenciadorAudio,
// CriadorInimigos e GerenciadorItens). onProgress reflete a fração real de
// assets já carregados — nunca um valor inventado.
//
// Como os assets são pequenos/locais, o carregamento real pode terminar em
// poucos milissegundos, tempo curto demais para a barra "andar" visualmente.
// Por isso o valor mostrado na tela (`progressoExibido`) sobe em direção ao
// valor real (`progressoAlvo`) numa velocidade limitada, em vez de saltar
// direto pro valor final — a barra sempre mostra o progresso verdadeiro,
// só que sem pular de 0% pra 100% num único frame.
const fillBar = document.getElementById("real-loading-bar-fill");
const percentText = document.getElementById("real-loading-bar-percent");

let progressoAlvo = 0;
let progressoExibido = 0;
let renderIniciado = false;
let transicaoLoadingAgendada = false;
const VELOCIDADE_BARRA = 0.7; // fração por segundo (~1.4s para encher do zero ao máximo)

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  progressoAlvo = Math.max(progressoAlvo, itemsLoaded / itemsTotal);
};

loadingManager.onError = (url) => {
  console.warn(`[CARREGAMENTO] Falha ao buscar: ${url}`);
};

let ultimoTempoBarra = null;
function animarBarraCarregamento(agora) {
  if (ultimoTempoBarra === null) ultimoTempoBarra = agora;
  const dt = (agora - ultimoTempoBarra) / 1000;
  ultimoTempoBarra = agora;

  if (progressoExibido < progressoAlvo) {
    progressoExibido = Math.min(
      progressoAlvo,
      progressoExibido + VELOCIDADE_BARRA * dt,
    );
  }

  const porcentagem = Math.round(progressoExibido * 100);
  if (fillBar) fillBar.style.width = `${porcentagem}%`;
  if (percentText) percentText.textContent = `${porcentagem}%`;

  if (progressoExibido >= 1) {
    concluirTelaDeCarregamento();
    return;
  }

  requestAnimationFrame(animarBarraCarregamento);
}
requestAnimationFrame(animarBarraCarregamento);

function concluirTelaDeCarregamento() {
  if (transicaoLoadingAgendada) return;
  transicaoLoadingAgendada = true;

  if (pauseMenu && typeof pauseMenu.setLoadingComplete === "function") {
    pauseMenu.setLoadingComplete();
  }

  if (!renderIniciado) {
    renderIniciado = true;
    requestAnimationFrame(render);
  }
}

// ORQUESTRADOR SEQUENCIAL SEGURO ANTI-LAG
async function inicializarEcossistemaDoJogo() {
  try {
    // 1. Carrega buffers de áudio na thread secundária (sem tocar nada ainda:
    // navegadores bloqueiam áudio antes do primeiro gesto do usuário — aqui,
    // o clique no botão START na tela seguinte).
    await globalThis.audioGeral.carregarSons();

    // 2. Monta os pools síncronos na memória da GPU (Processamento do OBJ/MTL)
    await criadorInimigos.inicializarPool(8);
    await gerenciadorItens.inicializarPool();

    // 3. Transfere os minions estáticos criados para a fila ativa de combate
    if (criadorInimigos.poolMinions && criadorInimigos.poolMinions.length > 0) {
      criadorInimigos.poolMinions.forEach((minion, i) => {
        minion.indice = i;
        listaInimigos.push(minion);

        if (i < 2) {
          const canto = i % 2 === 0 ? -40 : 40;
          minion.mesh.position.set(
            canto,
            CONFIG.input.planeBaseY,
            CONFIG.inimigos.posicaoZCombate,
          );
          minion.offsetZAtual = 0;
          minion.posiguezCombate = CONFIG.inimigos.posicaoZCombate;
          minion.posicaoZOriginal = CONFIG.inimigos.posicaoZCombate;
          minion.ativo = true;
          minion.mesh.visible = true;
          minion.bb.setFromObject(minion.mesh);
        }
      });
    }

    progressoAlvo = 1;
    console.log("[SISTEMA] Todos os elementos foram pré-carregados!");
  } catch (err) {
    console.error("[FALHA CRÍTICA] Inicialização interrompida:", err);
  }
}

function gerenciarDisparoInimigos(scaledDelta, aviaoMesh) {
  if (!aviaoMesh || !camera || globalThis._shootEnabled === false) return;

  listaInimigos.forEach((inimigoTarget) => {
    if (!inimigoTarget.ativo || !inimigoTarget.mesh || inimigoTarget.caindo)
      return;

    // Se NÃO for o boss, verifica a distância da névoa normalmente
    if (!inimigoTarget.isBoss) {
      const dist = inimigoTarget.mesh.position.distanceTo(camera.position);
      if (scene.fog && dist > scene.fog.far) return;
    }

    // Força a inicialização segura do tempo de recarga caso seja nulo ou indefinido
    if (
      inimigoTarget.tempoRecarga === undefined ||
      Number.isNaN(inimigoTarget.tempoRecarga)
    ) {
      inimigoTarget.tempoRecarga = CONFIG.inimigos.delayPrimeiroTiro;
    }

    inimigoTarget.tempoRecarga += scaledDelta;

    // Define a cadência baseada no tipo de inimigo
    const intervaloBase = inimigoTarget.isBoss
      ? CONFIG.inimigos.intervaloTiroBoss || 0.5
      : CONFIG.inimigos.intervaloTiro;

    const intervaloAdaptado = intervaloBase / gameSpeed;

    if (inimigoTarget.tempoRecarga >= intervaloAdaptado) {
      let direcaoAlvo = new THREE.Vector3();
      // Calcula a direção em relação à posição do avião do jogador
      direcaoAlvo
        .subVectors(aviaoMesh.position, inimigoTarget.mesh.position)
        .normalize();

      // Dispara o laser do pool dos inimigos
      laserPoolInimigos.shoot(inimigoTarget.mesh.position, direcaoAlvo);

      if (globalThis.audioGeral)
        globalThis.audioGeral.tocarEfeito("laser", 0.05);

      inimigoTarget.tempoRecarga = 0;
    }
  });
}
let estaAtirando = false;
let tempoUltimoTiro = 0;
const CADENCIA_TIRO = CONFIG.lasers.cadenciaJogador;

globalThis.addEventListener("mousedown", (e) => {
  if (e.button === 0) estaAtirando = true;
});
globalThis.addEventListener("mouseup", (e) => {
  if (e.button === 0) estaAtirando = false;
});
globalThis.addEventListener("keydown", (e) => {
  if (e.code === "Space") estaAtirando = true;
});
globalThis.addEventListener("keyup", (e) => {
  if (e.code === "Space") estaAtirando = false;
});
globalThis.addEventListener("blur", () => {
  estaAtirando = false;
});

const jogadorCollisionManager = new CollisionManager(
  "player",
  (target) => {
    if (globalThis.audioGeral)
      globalThis.audioGeral.tocarEfeito("tiroTomado", 0.08);

    if (
      globalThis._estadoGlobalDoJogo.tirosTomadosPeloAviao >=
        CONFIG.armas.limiteTiros &&
      !aviaoMesh.caindo
    ) {
      aviaoMesh.caindo = true;
      aviaoMesh.velocidadeQuedaY = 25;
      aviaoMesh.velocidadeGiro = Math.random() * 8 + 6;
      globalThis._gameOverAtivo = true;
      globalThis._shootEnabled = false;

      if (globalThis.audioGeral) {
        globalThis.audioGeral.pararSom("musicaFundo");
        globalThis.audioGeral.tocarMusicaLoop("musicaMorte", 1.0);
      }
      hud.showMorteAviso();
    }
  },
  hud,
);

window.addEventListener(
  "resize",
  () => {
    onWindowResize(camera, renderer);
    updateLightVolume(light, scene.fog.far);
  },
  false,
);

const waterNormals = new THREE.TextureLoader().load(
  '../assets/textures/NormalMapping/waternormals.jpg',
  (tex) => { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
);
  
createWorldTiles(scene);
createWaterPlane(scene, waterNormals);

const _direcaoTiroJogador = new THREE.Vector3();

function gerenciarDisparoJogador(scaledDelta) {
  tempoUltimoTiro += scaledDelta;
  if (globalThis._shootEnabled === false) return;

  // No mobile, o disparo é automático: atira sempre que o joystick desloca a
  // mira (ver mobile.js), sem precisar de um botão de tiro dedicado.
  const disparoAtivo = estaAtirando || globalThis._mobileFiring === true;

  if (
    disparoAtivo &&
    tempoUltimoTiro >= CADENCIA_TIRO &&
    targetMesh &&
    aviaoMesh
  ) {
    _direcaoTiroJogador
      .subVectors(targetMesh.position, aviaoMesh.position)
      .normalize();
    laserPool.shoot(aviaoMesh.position, _direcaoTiroJogador);

    if (globalThis.audioGeral) globalThis.audioGeral.tocarEfeito("laser", 0.08);
    tempoUltimoTiro = 0;
  }
}

function processarReciclagemInimigos() {
  listaInimigos.forEach((inimigoTarget) => {
    if (!inimigoTarget?.ativo) return;

    const meshInterna = inimigoTarget.mesh;
    if (!meshInterna) return;

    // Garante que o Boss use 'life' corretamente e não caia por falta de definição
    const vidaAtual =
      inimigoTarget.life !== undefined ? inimigoTarget.life : 50;

    const foiAbatido = vidaAtual <= 0 || inimigoTarget.destruido === true;

    if (foiAbatido && !inimigoTarget.caindo) {
      inimigoTarget.caindo = true;
      inimigoTarget.velocidadeQuedaY = 25;
      inimigoTarget.velocidadeGiro = Math.random() * 8 + 6;

      if (globalThis.audioGeral)
        globalThis.audioGeral.tocarEfeito("alienAtingido", 0.1);

      if (gerenciadorItens && !inimigoTarget.isBoss) {
        gerenciadorItens.registrarAbate(aviaoMesh);
      }
      return;
    }

    const bateuNoChao = meshInterna.position.y <= -20;

    if (bateuNoChao) {
      inimigoTarget.ativo = false;
      inimigoTarget.caindo = false;
      meshInterna.visible = false;

      // === SE O INIMIGO DESTRUÍDO ERA O BOSS -> VITÓRIA COMPLETA ===
      if (inimigoTarget.isBoss) {
        globalThis._estadoGlobalDoJogo.jogoVencido = true; // Trava o estado do jogo
        if (hud && typeof hud.showVictoryScreen === "function") {
          hud.showVictoryScreen();
        }
        if (globalThis.audioGeral) {
          globalThis.audioGeral.sincronizarControles();
        }
        return;
      }

      // Lógica normal para minions regulares
      globalThis._estadoGlobalDoJogo.inimigosAbatidosContador++;
      inimigosAbatidos =
        globalThis._estadoGlobalDoJogo.inimigosAbatidosContador;

      if (hud && typeof hud.updateScore === "function") {
        hud.updateScore(inimigosAbatidos);
      }

      // Reseta o minion para o pool
      inimigoTarget.life = 50;
      inimigoTarget.destruido = false;
      meshInterna.life = 50;

      inimigoTarget.offsetZAtual = CONFIG.inimigos.distanciaSpawnZ;
      inimigoTarget.posicaoZOriginal =
        CONFIG.inimigos.posiguezCombate || CONFIG.inimigos.posicaoZCombate;
      inimigoTarget.tempoRecarga = CONFIG.inimigos.delayPrimeiroTiro;
    }
  });

  // === GATILHO MAESTRO DO BOSS FINAL ===
  if (
    globalThis._estadoGlobalDoJogo.inimigosAbatidosContador >=
      CONFIG.boss.gatilhoAbates &&
    !globalThis._estadoGlobalDoJogo.bossAtivo &&
    !globalThis._estadoGlobalDoJogo.jogoVencido &&
    !globalThis._bossFoiInstanciado
  ) {
    globalThis._estadoGlobalDoJogo.bossAtivo = true;
    globalThis._bossFoiInstanciado = true;

    // Ativa passando os 3 parâmetros corretos
    const bossFinal = criadorInimigos.ativarBossFinal(
      0,
      CONFIG.input.planeBaseY,
      aviaoMesh,
    );

    if (bossFinal && !listaInimigos.includes(bossFinal)) {
      listaInimigos.push(bossFinal);
    }

    if (globalThis.audioGeral) {
      globalThis.audioGeral.sincronizarControles();
    }
    console.log("[SISTEMA] O Boss Supremo despertou!");
  }
}

function render() {
  // === BARREIRA ATÔMICA PREVENTIVA CONTRA MATRIZES NaN ===
  if (!aviaoMesh || !listaInimigos || !criadorInimigos.inicializado) {
    requestAnimationFrame(render);
    return;
  }

  // Requisito 8: Se venceu o jogo, congela as físicas e mantém a interface UI respondendo a cliques
  if (
    globalThis._estadoGlobalDoJogo &&
    globalThis._estadoGlobalDoJogo.jogoVencido
  ) {
    if (globalThis.audioGeral) globalThis.audioGeral.sincronizarControles();
    stats.update();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
    return;
  }

  const delta = clock.getDelta();

  if (!isPaused) {
    const scaledDelta = delta * gameSpeed;

    if (aviaoMesh.caindo) {
      aviaoMesh.position.x += (0 - aviaoMesh.position.x) * 0.1;
      aviaoMesh.position.y -= (aviaoMesh.velocidadeQuedaY || 25) * scaledDelta;
      aviaoMesh.rotation.z += (aviaoMesh.velocidadeGiro || 6) * scaledDelta;

      if (aviaoMesh.position.y <= -10) {
        isPaused = true;
        hud.showGameOver();
      }
    } else {
      inputUpdate(aviaoMesh, targetMesh, camera, scaledDelta);
    }

    updateTiles(scaledDelta);
    updateCamera(camera, aviaoMesh, scaledDelta);

    // SANITIZAÇÃO COMPLETA DA MATRIZ DA CÂMERA CONTRA TRAVAMENTOS NO AUDIOLISTENER
    camera.updateMatrixWorld(true);
    const mEl = camera.matrixWorld.elements;
    let matrizBugada = false;
    for (let k = 0; k < 16; k++) {
      if (!Number.isFinite(mEl[k]) || Number.isNaN(mEl[k])) {
        matrizBugada = true;
        break;
      }
    }
    if (matrizBugada) {
      camera.position.set(0, 105, -150);
      camera.lookAt(0, 120, 0);
      camera.updateMatrixWorld(true);
    }

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
      gerenciadorItens.atualizar(scaledDelta, aviaoMesh, () => {
        if (globalThis._estadoGlobalDoJogo) {
          globalThis._estadoGlobalDoJogo.tirosTomadosPeloAviao = Math.max(
            0,
            globalThis._estadoGlobalDoJogo.tirosTomadosPeloAviao - 5,
          );
          globalThis._gameStats.player =
            globalThis._estadoGlobalDoJogo.tirosTomadosPeloAviao;
          hud.updateLife(globalThis._gameStats.player);
          if (globalThis.audioGeral)
            globalThis.audioGeral.tocarEfeito("fairyDust", 0.16);
        }
      });
    }

    aviaoBB.setFromObject(aviaoMesh);
    gerenciarDisparoJogador(scaledDelta);
    gerenciarDisparoInimigos(scaledDelta, aviaoMesh);

    laserPool.update(scaledDelta, aviaoMesh, scene.fog.far);
    laserPoolInimigos.update(scaledDelta, aviaoMesh, scene.fog.far);

    const inimigosProntosParaColidir = listaInimigos.filter(
      (m) => m.ativo && !m.caindo,
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

    if (globalThis.audioGeral)
      globalThis.audioGeral.sincronizarControles(isPaused);
  }

  hud.updateAltitude(aviaoMesh.position.y);
  stats.update();
  requestAnimationFrame(render);
  renderer.render(scene, camera);
}

// Dispara a cadeia assíncrona blindada e sequencial
inicializarEcossistemaDoJogo();
