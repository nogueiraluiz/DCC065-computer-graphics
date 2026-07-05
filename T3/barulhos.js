// barulhos.js
import * as THREE from "three";

export class GerenciadorAudio {
  constructor(camera) {
    this.camera = camera;
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);

    this.loader = new THREE.AudioLoader();
    this.sons = {};
  }

  async carregarSons() {
    const arquivos = {
      musicaFundo: "./assets/HelloKittyOnlineOST.mp3",
      musicaMorte: "./assets/EuMorri.mp3",
      musicaLoading: "./assets/hello-kitty.mp3",
      tiroTomado: "./assets/a-meme-tiro.mp3",
      laser: "./assets/laser-sound.mp3",
      alienAtingido: "./assets/falling.mp3",
      fairyDust: "./assets/fairy-dust.mp3",
      musicaBoss: "./assets/16-scientist-boss.mp3", // Música do Boss
      somVitoria: "./assets/hello-kitty.mp3", // Som de vitória
    };

    const promessas = Object.entries(arquivos).map(([nome, caminho]) => {
      return new Promise((resolve) => {
        this.loader.load(
          caminho,
          (buffer) => {
            const som = new THREE.Audio(this.listener);
            som.setBuffer(buffer);
            this.sons[nome] = som;
            resolve();
          },
          undefined,
          (err) => {
            console.warn(`[ÁUDIO] Não encontrou: ${caminho}. Pulando...`);
            resolve();
          },
        );
      });
    });

    await Promise.all(promessas);
    console.log("[ÁUDIO] Todos os sons da pasta assets foram carregados!");
  }

  tocarEfeito(nome, volume = 0.5) {
    if (globalThis._audioEnabled === false) return;

    const som = this.sons[nome];
    if (som) {
      if (som.isPlaying) som.stop();
      som.setVolume(volume);
      som.play();
    }
  }

  tocarMusicaLoop(nome, volume = 0.25) {
    if (globalThis._audioEnabled === false) return;

    const musica = this.sons[nome];
    if (musica && !musica.isPlaying) {
      musica.setLoop(true);
      musica.setVolume(volume);
      musica.play();
    }
  }

  pararSom(nome) {
    const som = this.sons[nome];
    if (som && som.isPlaying) {
      som.stop();
    }
  }

  sincronizarControles(jogoPausado = false) {
    // === REQUISITO 8: PRIORIDADE ABSOLUTA DE VITÓRIA ===
    // Se o Boss foi derrotado, limpa as músicas de combate e inicia a fanfarra trunfal
    if (globalThis._estadoGlobalDoJogo?.jogoVencido) {
      if (this.sons.musicaFundo?.isPlaying) this.sons.musicaFundo.stop();
      if (this.sons.musicaLoading?.isPlaying) this.sons.musicaLoading.stop();
      if (this.sons.musicaBoss?.isPlaying) this.sons.musicaBoss.stop();

      // Toca a música especial de vitória em loop se o áudio estiver ativado
      if (
        globalThis._audioEnabled !== false &&
        this.sons.somVitoria &&
        !this.sons.somVitoria.isPlaying
      ) {
        this.tocarMusicaLoop("somVitoria", 0.35); // Volume calibrado em 35%
      }
      return; // Aborta para não sofrer interferência das outras regras de pause
    }

    // REGRA DE SILÊNCIO ABSOLUTO (Pausas comuns de Gameplay ou Game Over)
    if (
      globalThis._audioEnabled === false ||
      jogoPausado ||
      globalThis._gameOverAtivo
    ) {
      if (this.sons.musicaFundo?.isPlaying) this.sons.musicaFundo.pause();
      if (this.sons.musicaLoading?.isPlaying) this.sons.musicaLoading.pause();
      if (this.sons.musicaBoss?.isPlaying) this.sons.musicaBoss.pause();
      if (this.sons.somVitoria?.isPlaying) this.sons.somVitoria.pause();
    } else {
      // REGRA DE PLAYBACK: Jogo rodando normalmente sem pausas

      // Se o Boss Final estiver ativo na tela, o tema dele ganha prioridade absoluta
      if (globalThis._estadoGlobalDoJogo?.bossAtivo) {
        if (this.sons.musicaFundo?.isPlaying) this.sons.musicaFundo.stop(); // Corta o tema normal

        if (this.sons.musicaBoss && !this.sons.musicaBoss.isPlaying) {
          this.tocarMusicaLoop("musicaBoss", 0.25); // Toca o tema do Boss
        }
      } else {
        // Se o Boss ainda não apareceu, toca a música de fundo alegre padrão
        if (this.sons.musicaBoss?.isPlaying) this.sons.musicaBoss.stop();

        if (
          this.sons.musicaFundo &&
          !this.sons.musicaFundo.isPlaying &&
          !globalThis._loadingAtivo
        ) {
          this.sons.musicaFundo.play(); // Retoma ou inicia o HelloKittyOnlineOST
        }
      }
    }
  }
}
