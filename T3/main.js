/**
 * @file Ponto de entrada da cena. Inicializa renderer, cena, câmera, avião e loop de animação.
 */

import * as THREE from "three";
import Stats from "../../build/jsm/libs/stats.module.js";
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
import { GerenciadorItens } from "./GerenciadorItens.js";
import { GerenciadorAudio } from "./barulhos.js";

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

// Áudio Global Inicializado Seguramente com a Câmera Pronta
globalThis.audioGeral = new GerenciadorAudio(camera);

globalThis._loadingAtivo = true;
await globalThis.audioGeral.carregarSons();
globalThis.audioGeral.tocarMusicaLoop("musicaLoading", 0.3);

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
let contadorAbatesParaDrop = 0;
let aviaoBB = new THREE.Box3();

// Sistema de tiros
let laserPool = new LaserPool(scene, "player", "rgb(255, 25, 140)", 80);
let laserPoolInimigos = new LaserPool(scene, "enemy", "rgb(21, 0, 255)", 40);

// UI e HUD
const hud = initUI(scene, light);
const inimigoCollisionManager = new CollisionManager("enemy", null, hud);

// PROBLEMA 2 RESOLVIDO (Parte A): Som do Tiro dos Inimigos sincronizado estritamente dentro do cronômetro real do disparo
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

      // Toca o som de tiro do alien de forma limpa e harmônica no momento do disparo físico
      if (globalThis.audioGeral) {
        globalThis.audioGeral.tocarEfeito("laser", 0.05); // Volume suave (5%)
      }

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

const jogadorCollisionManager = new CollisionManager(
  "player",
  (target, status) => {
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

      // BLOQUEIO GLOBAL DE SOM: Ativa o sinalizador que desliga a música ambiente de forma atômica
      globalThis._gameOverAtivo = true;

      if (globalThis.audioGeral) {
        globalThis.audioGeral.pararSom("musicaFundo"); // Corta na hora o HelloKittyOnlineOST
        globalThis.audioGeral.tocarMusicaLoop("musicaMorte", 0.4); // Toca o triste EuMorri.mp3 em loop contínuo
      }

      globalThis._shootEnabled = false;
      hud.showMorteAviso();
    }
  },
  hud,
);

// Health pack
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

if (!CONFIG.DISABLE_START_MENU) {
  const pauseMenu = initPauseMenu({
    renderer: renderer,
    getIsPaused: () => isPaused,
    setPaused: (value) => {
      isPaused = value;
      pauseMenu.toggleDisplay(value);
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

const _direcaoTiroJogador = new THREE.Vector3();

// PROBLEMA 2 RESOLVIDO (Parte B): Som do tiro do jogador amarrado firmemente na saída do laser
function gerenciarDisparoJogador(scaledDelta) {
  tempoUltimoTiro += scaledDelta;
  if (globalThis._shootEnabled === false) return;

  if (
    estaAtirando &&
    tempoUltimoTiro >= CADENCIA_TIRO &&
    targetMesh &&
    aviaoMesh
  ) {
    _direcaoTiroJogador
      .subVectors(targetMesh.position, aviaoMesh.position)
      .normalize();
    laserPool.shoot(aviaoMesh.position, _direcaoTiroJogador);

    if (globalThis.audioGeral) {
      globalThis.audioGeral.tocarEfeito("laser", 0.08); // Volume calibrado em 8%
    }

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
      if (globalThis.audioGeral) {
        globalThis.audioGeral.tocarEfeito("alienAtingido", 0.1);
      }

      // PROBLEMA 1 RESOLVIDO: Reintroduzido o gatilho vital que registra o abate e dropa o Health Pack a cada 3 baixas
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
  });
}

// Inicia o loop do jogo
render();

function render() {
  const delta = clock.getDelta();

  if (!isPaused) {
    const scaledDelta = delta * gameSpeed;

    if (
      globalThis._estadoGlobalDoJogo &&
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
        globalThis.audioGeral.pararSom("musicaFundo"); // Corta a música alegre na hora

        // CORREÇÃO: Mudado de 0.4 para 1.0 para a música de morte tocar bem ALTA!
        globalThis.audioGeral.tocarMusicaLoop("musicaMorte", 1.0);
      }

      hud.showMorteAviso();
    }

    if (aviaoMesh.caindo) {
      aviaoMesh.position.x += (0 - aviaoMesh.position.x) * 0.1;

      if (aviaoMesh.velocidadeQuedaY === undefined)
        aviaoMesh.velocidadeQuedaY = 5;
      if (aviaoMesh.velocidadeGiro === undefined) aviaoMesh.velocidadeGiro = 6;

      aviaoMesh.position.y -= aviaoMesh.velocidadeQuedaY * scaledDelta;
      aviaoMesh.rotation.z += aviaoMesh.velocidadeGiro * scaledDelta;

      if (aviaoMesh.position.y <= -10) {
        isPaused = true;
        hud.showGameOver();
      }
    } else {
      inputUpdate(aviaoMesh, targetMesh, camera, scaledDelta);
    }

    updateTiles(scaledDelta);
    updateCamera(camera, aviaoMesh, scaledDelta);

    if (aviaoMesh && !aviaoMesh.caindo) {
      tempoInimigo += scaledDelta;
      criadorInimigos.atualizarMovimento(
        scaledDelta,
        aviaoMesh,
        camera,
        listaInimigos,
      );
    }

    // Processamento da Cura do Item
    if (gerenciadorItens) {
      gerenciadorItens.atualizar(scaledDelta, aviaoMesh, (quantidadeCura) => {
        if (globalThis._estadoGlobalDoJogo) {
          const tirosRecuperados = 5;

          globalThis._estadoGlobalDoJogo.tirosTomadosPeloAviao = Math.max(
            0,
            globalThis._estadoGlobalDoJogo.tirosTomadosPeloAviao -
              tirosRecuperados,
          );

          globalThis._gameStats.player =
            globalThis._estadoGlobalDoJogo.tirosTomadosPeloAviao;

          hud.updateLife(globalThis._gameStats.player);

          if (typeof hud.updateSaldo === "function") {
            hud.updateSaldo(
              globalThis._gameStats.enemy,
              globalThis._gameStats.player,
            );
          }

          // === ADICIONADO: Som mágico com volume ideal (Mais alto que tiros, mais baixo que a OST) ===
          if (globalThis.audioGeral) {
            globalThis.audioGeral.tocarEfeito("fairyDust", 0.16); // Volume calibrado e destacado
          }
        }
        console.log(
          `[SINCRO CURA] Vida alterada na raiz global! Menos ${quantidadeCura}% de danos acumulados.`,
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

    if (globalThis.audioGeral) {
      globalThis.audioGeral.sincronizarControles();
    }
  }

  hud.updateAltitude(aviaoMesh.position.y);
  stats.update();
  requestAnimationFrame(render);
  renderer.render(scene, camera);
}
