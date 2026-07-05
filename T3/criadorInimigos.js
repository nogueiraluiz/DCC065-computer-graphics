import * as THREE from "three";
import { carregarAviaoInimigo } from "./alienVerde.js";
import { carregarAviaoInimigo2 } from "./ovniInimigo.js";
import { CONFIG } from "./config.js";

export class CriadorInimigos {
  constructor(scene) {
    this.scene = scene;
    this.tempoInimigo = 0;
    this.velocidadePerseguicao = CONFIG.inimigos.velocidadePerseguicao;
    this.velocidadeZigueZague = CONFIG.inimigos.velocidadeZigueZague;

    this.poolMinions = [];
    this.bossUnico = null;
    this.inicializado = false;
  }

  async inicializarPool(quantidadeCopias = 8) {
    if (this.inicializado) return;
    try {
      for (let i = 0; i < quantidadeCopias; i++) {
        const tipoInimigo = i % 2 === 0 ? "alien" : "ovni";
        const aviaoMesh =
          tipoInimigo === "alien"
            ? await carregarAviaoInimigo()
            : await carregarAviaoInimigo2();

        aviaoMesh.position.set(0, -500, 0);
        aviaoMesh.visible = false;
        this.scene.add(aviaoMesh);

        const esc = CONFIG.boss.multiplicadores[tipoInimigo].escalaMinion;
        aviaoMesh.scale.set(esc, esc, esc);

        this.poolMinions.push({
          mesh: aviaoMesh,
          bb: new THREE.Box3().setFromObject(aviaoMesh),
          ativo: false,
          caindo: false,
          velocidadeQuedaY: 0,
          velocidadeGiro: 0,
          tipo: tipoInimigo,
          cantoOriginalX: 0,
          posicaoZOriginal: CONFIG.inimigos.posicaoZCombate,
          offsetZAtual: 500,
          indice: i,
        });
      }

      const bossMesh = await carregarAviaoInimigo();
      bossMesh.position.set(0, -500, 0);
      bossMesh.visible = false;
      this.scene.add(bossMesh);

      const escBoss = CONFIG.boss.multiplicadores.alien.escalaBoss;
      bossMesh.scale.set(escBoss, escBoss, escBoss);

      this.bossUnico = {
        mesh: bossMesh,
        bb: new THREE.Box3().setFromObject(bossMesh),
        ativo: false,
        caindo: false,
        velocidadeQuedaY: 0,
        velocidadeGiro: 0,
        tipo: "alien",
        isBoss: true,
        isMinion: false,
        life: CONFIG.boss.bossVida,
        cantoOriginalX: 0,
        // CORREÇÃO: Agora usa o novo Z mais recuado vindo do config.js
        posicaoZOriginal: CONFIG.boss.posicaoZCombateBoss,
        offsetZAtual: 500,
        indice: 99,
      };

      this.inicializado = true;
      console.log(
        "[POOL] Sistema síncrono carregado com movimentação original.",
      );
    } catch (error) {
      console.error("[POOL] Erro fatal no carregamento:", error);
    }
  }

  // CORRIGIDO: Agora recebe a instância do avião do jogador para calcular o spawn relativo correto
  ativarBossFinal(x, y, aviaoJogador) {
    if (!this.inicializado || !this.bossUnico || !aviaoJogador) return null;

    const referencaZ = aviaoJogador.position.z;
    this.bossUnico.mesh.position.set(x, y, referencaZ + 500);
    this.bossUnico.mesh.rotation.set(0, 0, 0);
    this.bossUnico.mesh.visible = true;
    this.bossUnico.ativo = true;
    this.bossUnico.caindo = false;
    this.bossUnico.life = CONFIG.boss.bossVida;
    this.bossUnico.offsetZAtual = 500;
    this.bossUnico.bb.setFromObject(this.bossUnico.mesh);

    return this.bossUnico;
  }

  atualizarMovimento(scaledDelta, aviaoMesh, camera, listaInimigos) {
    if (!aviaoMesh || !listaInimigos || !this.inicializado) return;

    this.tempoInimigo += scaledDelta;
    const fovRadianos = (camera.fov * Math.PI) / 180;

    let inimigosAtivos = listaInimigos.filter(
      (inimigo) => inimigo.ativo && !inimigo.caindo,
    );
    let ativosNaTela = inimigosAtivos.length;
    inimigosAtivos.sort((a, b) => a.indice - b.indice);

    listaInimigos.forEach((inimigoTarget) => {
      if (!inimigoTarget.ativo) return;

      const inimigo = inimigoTarget.mesh;
      if (!inimigo) return;

      inimigo.visible = true;

      if (inimigoTarget.caindo) {
        const forcaGravidade = CONFIG.inimigos.gravidadeQueda || 300;
        inimigoTarget.velocidadeQuedaY += scaledDelta * forcaGravidade;
        inimigo.position.y -= inimigoTarget.velocidadeQuedaY * scaledDelta;

        inimigo.rotation.x += inimigoTarget.velocidadeGiro * 2 * scaledDelta;
        inimigo.rotation.z += inimigoTarget.velocidadeGiro * 2.5 * scaledDelta;

        inimigo.position.z = aviaoMesh.position.z + inimigoTarget.offsetZAtual;
        inimigoTarget.bb.makeEmpty();
        return;
      }

      const i = inimigoTarget.isBoss ? 99 : inimigoTarget.indice;
      const ordem = inimigosAtivos.indexOf(inimigoTarget);

      // --- MOVIMENTAÇÃO ORIGINAL EM Z (APROXIMAÇÃO DE 500 ATÉ O JOGADOR) ---
      inimigoTarget.offsetZAtual = THREE.MathUtils.lerp(
        inimigoTarget.offsetZAtual,
        inimigoTarget.posicaoZOriginal,
        scaledDelta * 1.5,
      );
      inimigo.position.z = aviaoMesh.position.z + inimigoTarget.offsetZAtual;

      // --- LIMITES EM X BASEADOS NO MONITOR ---
      const distanciaFixaCamera = 150 + inimigoTarget.offsetZAtual;
      const metadeAlturaVisivel =
        Math.tan(fovRadianos / 2) * distanciaFixaCamera;
      const limiteBordaMonitorX = metadeAlturaVisivel * camera.aspect;

      const distanciaSegurancaBorda = 8;
      const amplitudeX = Math.max(
        10,
        limiteBordaMonitorX - distanciaSegurancaBorda,
      );

      const direcaoSinal = i % 2 === 0 ? 1 : -1;
      const variacaoVelocidade = this.velocidadeZigueZague * (1 + i * 0.05);

      let destinoX =
        direcaoSinal *
        Math.sin(this.tempoInimigo * variacaoVelocidade) *
        amplitudeX;
      destinoX = THREE.MathUtils.clamp(destinoX, -65, 65);

      let posXAnterior = inimigo.position.x;
      inimigo.position.x = THREE.MathUtils.lerp(
        inimigo.position.x,
        destinoX,
        scaledDelta * this.velocidadePerseguicao,
      );

      // --- SEPARAÇÃO VERTICAL EM Y (MANTÉM ENTRE 85 E 115) ---
      const centroTelaY = CONFIG.input.planeBaseY;
      const novaDistanciaY = 24;

      let offsetY = 0;
      if (ativosNaTela > 1 && ordem !== -1 && !inimigoTarget.isBoss) {
        offsetY = (ordem === 0 ? -0.5 : 0.5) * novaDistanciaY;
      }

      const flutuacaoOrganica = Math.sin(this.tempoInimigo * 2 + i) * 1.5;
      let destinoY = centroTelaY + offsetY + flutuacaoOrganica;
      destinoY = THREE.MathUtils.clamp(destinoY, 85, 115);

      inimigo.position.y = THREE.MathUtils.lerp(
        inimigo.position.y,
        destinoY,
        scaledDelta * this.velocidadePerseguicao,
      );

      let velocidadexReal =
        (inimigo.position.x - posXAnterior) / (scaledDelta || 0.016);
      inimigo.rotation.z = THREE.MathUtils.lerp(
        inimigo.rotation.z,
        -velocidadexReal * 0.002,
        scaledDelta * 5,
      );

      inimigoTarget.bb.setFromObject(inimigo);
    });

    if (ativosNaTela < 2 && !globalThis._estadoGlobalDoJogo.jogoVencido) {
      const reservas = listaInimigos.filter(
        (inimigo) => !inimigo.ativo && !inimigo.isBoss,
      );

      if (reservas.length > 0) {
        const proximoReserva =
          reservas[Math.floor(Math.random() * reservas.length)];

        if (proximoReserva?.mesh) {
          const distanciaSpawnZ = 950;
          const borderSpawnX =
            Math.tan(fovRadianos / 2) * distanciaSpawnZ * camera.aspect;

          let bordaNascimentoX =
            Math.random() < 0.5 ? -borderSpawnX * 0.85 : borderSpawnX * 0.85;
          bordaNascimentoX = THREE.MathUtils.clamp(bordaNascimentoX, -65, 65);

          proximoReserva.posicaoZOriginal = CONFIG.inimigos.posicaoZCombate;
          proximoReserva.offsetZAtual = 500;

          proximoReserva.caindo = false;
          proximoReserva.velocidadeQuedaY = 0;
          proximoReserva.velocidadeGiro = 0;
          proximoReserva.mesh.rotation.set(0, 0, 0);

          proximoReserva.mesh.position.set(
            bordaNascimentoX,
            CONFIG.input.planeBaseY,
            aviaoMesh.position.z + 500,
          );

          proximoReserva.cantoOriginalX = bordaNascimentoX;
          proximoReserva.bb.setFromObject(proximoReserva.mesh);

          proximoReserva.ativo = true;
          proximoReserva.mesh.visible = true;
        }
      }
    }
  }
}
