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
      fairyDust: "./assets/fairy-dust.mp3", // SUCESSO: Mapeado para o Health Pack!
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

  sincronizarControles() {
    if (globalThis._audioEnabled === false) {
      if (this.sons.musicaFundo?.isPlaying) this.sons.musicaFundo.pause();
      if (this.sons.musicaLoading?.isPlaying) this.sons.musicaLoading.pause();
    } else {
      if (
        this.sons.musicaFundo &&
        !this.sons.musicaFundo.isPlaying &&
        !globalThis._loadingAtivo &&
        !globalThis._gameOverAtivo // Proteção: impede a música de reatar após a queda
      ) {
        this.sons.musicaFundo.play();
      }
    }
  }
}
