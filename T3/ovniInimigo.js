import * as THREE from "three";
import { OBJLoader } from "../build/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "../build/jsm/loaders/MTLLoader.js";

// Lista de cores pastéis/arcade metálicas que existiam antes
const CORES_OVNI = [
  "#0b5d9a", // Azul Escuro
  "#538db7", // Azul Claro
  "#e06187", // Rosa Escuro
  "#e26b8e", // Rosa Claro
  "#fbd8b6", // Bege Suave
];

export function carregarAviaoInimigo2() {
  return new Promise((resolve) => {
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath("./assets/Flying saucer/");
    mtlLoader.load("1352 Flying Saucer.mtl", (materials) => {
      materials.preload();
      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.load(
        "./assets/Flying saucer/1352 Flying Saucer.obj",
        (object) => {
          object.name = "aviaoInimigo";
          object.scale.set(0.12, 0.12, 0.12);

          // Sorteia uma cor da lista para este OVNI específico
          const corSorteada =
            CORES_OVNI[Math.floor(Math.random() * CORES_OVNI.length)];

          // Varre todas as sub-malhas do modelo OBJ para injetar o material metálico colorido
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

          resolve(object);
        },
      );
    });
  });
}
