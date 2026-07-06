import * as THREE from "three";
import { OBJLoader } from "../../build/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "../../build/jsm/loaders/MTLLoader.js";

const ASSET_BASE = new URL("./assets/flying-saucer/", import.meta.url);

// Lista de cores pastéis/arcade metálicas que existiam antes
const CORES_OVNI = [
  "#0b5d9a", // Azul Escuro
  "#538db7", // Azul Claro
  "#e06187", // Rosa Escuro
  "#e26b8e", // Rosa Claro
  "#fbd8b6", // Bege Suave
];

// Cache do template carregado da rede: o pool pede várias cópias deste inimigo,
// mas o OBJ/MTL só precisa ser buscado e parseado uma única vez — as demais
// cópias são clones baratos (geometria compartilhada) do mesmo template, cada
// uma recebendo sua própria cor sorteada por cima.
let templatePromise = null;

function carregarTemplate(manager) {
  if (templatePromise) return templatePromise;

  templatePromise = new Promise((resolve, reject) => {
    const mtlLoader = new MTLLoader(manager);
    mtlLoader.setPath(ASSET_BASE.href);
    mtlLoader.load(
      "flying-saucer.mtl",
      (materials) => {
        materials.preload();
        const objLoader = new OBJLoader(manager);
        objLoader.setMaterials(materials);
        objLoader.load(
          new URL("flying-saucer.obj", ASSET_BASE).href,
          (object) => {
            object.name = "aviaoInimigo";
            object.scale.set(0.12, 0.12, 0.12);
            resolve(object);
          },
          undefined,
          (error) => {
            console.error("[OVNI] Falha ao carregar flying-saucer.obj:", error);
            reject(error);
          },
        );
      },
      undefined,
      (error) => {
        console.error("[OVNI] Falha ao carregar flying-saucer.mtl:", error);
        reject(error);
      },
    );
  });

  return templatePromise;
}

export async function carregarAviaoInimigo2(manager) {
  const template = await carregarTemplate(manager);
  const object = template.clone(true);

  // Sorteia uma cor da lista para este OVNI específico
  const corSorteada =
    CORES_OVNI[Math.floor(Math.random() * CORES_OVNI.length)];

  // Varre todas as sub-malhas do clone para injetar o material metálico colorido
  object.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(corSorteada),
        metalness: 0.0, // Remove totalmente o aspecto de metal pesado/ferro
        roughness: 0.15, // Deixa a superfície bem lisinha, parecendo plástico de brinquedo novo ou vinil
        flatShading: false, // Desativa as arestas duras! Deixa o modelo perfeitamente redondo e fofinho
        clearcoat: 1.0, // Adiciona uma camada extra de verniz brilhante por cima (estilo esmalte/porcelana)
        clearcoatRoughness: 0.1,
      });
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return object;
}
