import * as THREE from "three";
import { OBJLoader } from "../../build/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "../../build/jsm/loaders/MTLLoader.js";

export function carregarAviaoInimigo() {
  return new Promise((resolve) => {
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath("./assets/alien in green spaceship/");
    mtlLoader.load("materials.mtl", (materials) => {
      materials.preload();
      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.load(
        "./assets/alien in green spaceship/model.obj",
        (object) => {
          object.name = "aviaoInimigo";
          object.scale.set(13, 10, 10);

          // === INJEÇÃO METÁLICA CONSERVATIVA E SEGURA ===
          object.traverse((child) => {
            if (child.isMesh && child.material) {
              const aplicarBrilho = (mat) => {
                // Garante suporte a reflexos especulares nativos do MTLLoader
                if (mat.specular) {
                  // Define a cor do reflexo como um cinza claro/branco para refletir a luz da cena como metal
                  mat.specular.setHex(0xcccccc);
                }
                if (mat.shininess !== undefined) {
                  // Controla o polimento: valores mais altos deixam o reflexo mais concentrado e "metálico"
                  mat.shininess = 64;
                }

                // Se o material original tiver suporte a canais padrão de sombreamento,
                // isso garante que ele reaja dinamicamente às luzes básicas da sua main.js
                mat.needsUpdate = true;
              };

              if (Array.isArray(child.material)) {
                child.material.forEach(aplicarBrilho);
              } else {
                aplicarBrilho(child.material);
              }
            }
          });

          resolve(object);
        },
      );
    });
  });
}
