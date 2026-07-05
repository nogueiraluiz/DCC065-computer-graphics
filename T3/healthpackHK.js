// healthpackHK.js
import * as THREE from "three";
import { STLLoader } from "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/jsm/loaders/STLLoader.js";

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
          geometry.center(); // Apenas centraliza o pivô (operação leve)

          // O seu material de vidro realista idêntico
          const materialFofo = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color("#e26b8e"),
            metalness: 0.0, // Garantido em 0.0 para não ficar preto
            roughness: 0.05,
            transparent: true,
            transmission: 0.9,
            opacity: 1.0,
            ior: 1.5,
            thickness: 2.5,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05,
            side: THREE.DoubleSide,
          });

          this.mesh = new THREE.Mesh(geometry, materialFofo);
          this.mesh.castShadow = true;
          this.mesh.receiveShadow = true;

          // RESTRUTURAÇÃO ULTRA LEVE: Removemos o computeBoundingBox() dinâmico.
          // Deixamos a escala neutra em 1, pois controlamos o tamanho real no Pool!
          this.mesh.scale.set(1, 1, 1);

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
      this.mesh.rotation.y += this.velocidadeRotacao * scaledDelta;
    }
  }
}

// === A LINHA QUE ESTAVA FALTANDO PARA FAZER O COMPILADOR PARAR DE RECLAMAR: ===
export default HealthpackHK;
