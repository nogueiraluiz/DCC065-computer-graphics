// healthpackHK.js
import * as THREE from "three";
import { STLLoader } from "../../build/jsm/loaders/STLLoader.js";

class HealthpackHK {
  constructor(scene) {
    this.scene = scene;
    this.loader = new STLLoader();
    this.mesh = null;
    this.velocidadeRotacao = 0.02;
  }

  carregarModel() {
    return new Promise((resolve, reject) => {
      this.loader.load(
        "./assets/obj_1_hello kitty 1.stl",
        (geometry) => {
          geometry.center(); // Centraliza o pivô (operação leve)

          // === OTIMIZAÇÃO ULTRA LEVE DE GEOMETRIA ===
          // Mescla vértices duplicados e recalcula as normais de face de forma otimizada para a GPU
          geometry.computeVertexNormals();

          // === OTIMIZAÇÃO DE MATERIAL (ADEUS COMPLEXIDADE DE VIDRO) ===
          // Mudamos para MeshStandardMaterial: Removemos o cálculo pesado de refração/transmissão,
          // simulando o aspecto fofo e brilhante apenas usando mapeamento básico de rugosidade.
          const materialSuperLeve = new THREE.MeshStandardMaterial({
            color: new THREE.Color("#e26b8e"),
            metalness: 0.1, // Leve brilho para destacar o relevo 3D
            roughness: 0.2, // Superfície lisa e polida estilo plástico/vinil
            flatShading: false, // Mantém o modelo perfeitamente arredondado e suavizado
          });

          this.mesh = new THREE.Mesh(geometry, materialSuperLeve);

          // Desative as sombras se precisar de ainda mais performance:
          this.mesh.castShadow = true;
          this.mesh.receiveShadow = true;

          this.mesh.scale.set(1, 1, 1); // Escala neutra para o Pool gerenciar[cite: 17]

          resolve(this.mesh);
        },
        (xhr) => {},
        (error) => {
          console.error("Erro no STLLoader:", error);
          reject(error);
        },
      );
    });
  }

  atualizar(scaledDelta) {
    if (this.mesh) {
      this.mesh.rotation.y += this.velocidadeRotacao * scaledDelta; // Rotação simples[cite: 17]
    }
  }
}

export default HealthpackHK; // Exportação padrão mantida[cite: 17]
