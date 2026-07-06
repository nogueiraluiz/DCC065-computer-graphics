// GerenciadorItens.js
import * as THREE from "three";
import HealthpackHK from "./healthpackHK.js";

export class GerenciadorItens {
  constructor(scene) {
    this.scene = scene;
    this.poolHealthPacks = [];
    this.tamanhoPool = 5;

    // Controle por abates
    this.contadorAbates = 0;
    this.abatesNecessarios = 3;

    this.inicializado = false;

    // DIMINUÍDO: Mudado de 0.015 para 0.011 para que o pacote de vida fique um pouco menor
    this.escalaPadrao = 0.07;

    // Controle interno para forçar a GPU a digerir o shader no primeiro frame
    this.framesPrecompilacao = 0;

    // Distância em Z em que o item passa a ser atraído suavemente pro avião no plano XY
    this.raioAtracaoZ = 20;
    this.velocidadeAtracao = 1.5;
  }

  async inicializarPool() {
    if (this.inicializado) return;

    try {
      const geradorBase = new HealthpackHK(this.scene);
      const meshBase = await geradorBase.carregarModel();

      if (meshBase) {
        // Deita o modelo mãe nativamente uma única vez
        meshBase.rotation.set(-Math.PI / 2, 0, 0);

        for (let i = 0; i < this.tamanhoPool; i++) {
          const meshClonada = meshBase.clone();

          // Isola o material para evitar conflito de Shaders refratários
          if (meshClonada.material) {
            meshClonada.material = meshClonada.material.clone();
          }

          // TRUQUE SUPREMO ANTI-LAG: Iniciamos o item na frente do campo de visão da câmera
          // mas invisível apenas por opacidade zero. Isso força o motor WebGL a compilar
          // o Shader de vidro na GPU IMEDIATAMENTE no carregamento do jogo, acabando com o gaguejo depois!
          meshClonada.visible = true;
          meshClonada.position.set(0, 100, -10); // Spawna logo atrás/perto da câmera para compilar

          // Aplica a nova escala ajustada menor
          meshClonada.scale.set(
            this.escalaPadrao,
            this.escalaPadrao,
            this.escalaPadrao,
          );

          this.scene.add(meshClonada);

          this.poolHealthPacks.push({
            mesh: meshClonada,
            ativo: false,
            coletado: false,
            tempoAnimacaoColeta: 0,
            velocidadeRotacao: 0.02,
          });
        }
        this.inicializado = true;
        console.log("Pool estático pré-compilado na GPU com sucesso!");
      }
    } catch (erro) {
      console.error("Falha ao construir o Pool de Itens:", erro);
    }
  }

  registrarAbate(aviaoMesh) {
    // Se o motor ainda não carregou o modelo do disco, ignora
    if (!this.inicializado || !aviaoMesh || this.framesPrecompilacao < 5)
      return;

    this.contadorAbates++;

    if (this.contadorAbates >= this.abatesNecessarios) {
      this.contadorAbates = 0;

      const packDisponivel = this.poolHealthPacks.find((p) => !p.ativo);

      if (packDisponivel) {
        const xMinimo = -65;
        const xMaximo = 65;
        const randomX = Math.random() * (xMaximo - xMinimo) + xMinimo;

        const alturaMinima = 90;
        const alturaMaxima = 125;
        const randomY =
          Math.random() * (alturaMaxima - alturaMinima) + alturaMinima;

        const spawnZ = aviaoMesh.position.z + 500;

        // Reseta estados visuais de coletas anteriores
        packDisponivel.coletado = false;
        packDisponivel.tempoAnimacaoColeta = 0;
        packDisponivel.mesh.scale.set(
          this.escalaPadrao,
          this.escalaPadrao,
          this.escalaPadrao,
        );

        packDisponivel.mesh.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.color = new THREE.Color("#e26b8e"); // Restaura Rosa Lindo original
            child.material.emissive = new THREE.Color(0x000000);
            child.material.emissiveIntensity = 0;
            child.material.transmission = 0.9;
            child.material.transparent = true;
            child.material.roughness = 0.05;
          }
        });

        // Teletransporte matemático instantâneo sem compilar nada do zero
        packDisponivel.mesh.position.set(randomX, randomY, spawnZ);
        packDisponivel.ativo = true;
      }
    }
  }

  atualizar(scaledDelta, aviaoMesh, callbackCura) {
    if (!this.inicializado) return;

    // Rotina de segurança da GPU: Mantém escondido no subsolo nos primeiros frames da partida
    if (this.framesPrecompilacao < 5) {
      this.framesPrecompilacao++;
      if (this.framesPrecompilacao === 5) {
        // Envia todos os itens inativos para o limbo oculto após a GPU compilar os shaders com sucesso
        this.poolHealthPacks.forEach((p) => {
          if (!p.ativo) p.mesh.position.set(0, -9999, 0);
        });
      }
      return;
    }

    this.poolHealthPacks.forEach((pack) => {
      if (!pack.ativo) return;

      // Animação de explosão e brilho amarelo (Coletado)
      if (pack.coletado) {
        pack.tempoAnimacaoColeta += scaledDelta * 6.5;

        pack.mesh.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.transmission = 0.0;
            child.material.transparent = false;
            child.material.roughness = 1.0;

            child.material.color = new THREE.Color(0xffff00); // Amarelo Lindo desejado
            child.material.emissive = new THREE.Color(0xffff00);
            child.material.emissiveIntensity =
              Math.sin(pack.tempoAnimacaoColeta * 2) * 18;
          }
        });

        const fatorEscala =
          this.escalaPadrao * (1 + Math.sin(pack.tempoAnimacaoColeta) * 1.5);
        pack.mesh.scale.set(fatorEscala, fatorEscala, fatorEscala);

        if (pack.tempoAnimacaoColeta >= Math.PI / 2) {
          pack.ativo = false;
          pack.mesh.position.set(0, -9999, 0); // Devolve ao subsolo seguro
        }
        return;
      }

      pack.mesh.position.z -= 45 * scaledDelta;
      pack.mesh.rotation.z += pack.velocidadeRotacao * scaledDelta * 60;

      // Atração suave no plano XY quando o avião está perto o suficiente em Z
      const dzPlano = Math.abs(aviaoMesh.position.z - pack.mesh.position.z);

      if (dzPlano < this.raioAtracaoZ) {
        const dxPlano = aviaoMesh.position.x - pack.mesh.position.x;
        const dyPlano = aviaoMesh.position.y - pack.mesh.position.y;
        const fatorLerp = Math.min(this.velocidadeAtracao * scaledDelta, 1);
        pack.mesh.position.x += dxPlano * fatorLerp;
        pack.mesh.position.y += dyPlano * fatorLerp;
      }

      // Colisão aritmética veloz
      const dx = pack.mesh.position.x - aviaoMesh.position.x;
      const dy = pack.mesh.position.y - aviaoMesh.position.y;
      const dz = pack.mesh.position.z - aviaoMesh.position.z;
      const distanciaSq = dx * dx + dy * dy + dz * dz;

      if (distanciaSq < 200 && !pack.coletado) {
        pack.coletado = true;
        pack.tempoAnimacaoColeta = 0;

        if (typeof callbackCura === "function") {
          callbackCura(25);
        }
      }

      if (pack.mesh.position.z < aviaoMesh.position.z - 80) {
        pack.ativo = false;
        pack.mesh.position.set(0, -9999, 0);
      }
    });
  }

  getAtivos() {
    return this.poolHealthPacks.filter((p) => p.ativo && !p.coletado);
  }
}
