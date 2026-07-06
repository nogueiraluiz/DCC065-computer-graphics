import * as THREE from "three";
import { OBJLoader } from "../../build/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "../../build/jsm/loaders/MTLLoader.js";

const ASSET_BASE = new URL("./assets/alien-green-spaceship/", import.meta.url);

// Cache do template carregado da rede: o pool pede várias cópias deste inimigo,
// mas o OBJ/MTL só precisa ser buscado e parseado uma única vez — as demais
// cópias são clones baratos (geometria/material compartilhados) do mesmo template.
let templatePromise = null;

function carregarTemplate(manager) {
  if (templatePromise) return templatePromise;

  templatePromise = new Promise((resolve, reject) => {
    const mtlLoader = new MTLLoader(manager);
    mtlLoader.setPath(ASSET_BASE.href);
    mtlLoader.load(
      "materials.mtl",
      (materials) => {
        materials.preload();
        const objLoader = new OBJLoader(manager);
        objLoader.setMaterials(materials);
        objLoader.load(
          new URL("model.obj", ASSET_BASE).href,
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
          undefined,
          (error) => {
            console.error("[ALIEN] Falha ao carregar model.obj:", error);
            reject(error);
          },
        );
      },
      undefined,
      (error) => {
        console.error("[ALIEN] Falha ao carregar materials.mtl:", error);
        reject(error);
      },
    );
  });

  return templatePromise;
}

export async function carregarAviaoInimigo(manager) {
  const template = await carregarTemplate(manager);
  return template.clone(true);
}
