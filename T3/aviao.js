/**
 * @file Constrói o modelo 3D do avião (corpo, asas, leme e detalhes) com texturas otimizadas.
 */

import * as THREE from "three";

const textureLoader = new THREE.TextureLoader();

function criaTexturaPelucia() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);

  for (let i = 0; i < size * size * 4; i += 4) {
    // Gera uma variação de relevo micro-fina
    const ruido = 220 + Math.random() * 35;
    data[i] = ruido; // R
    data[i + 1] = ruido; // G
    data[i + 2] = ruido; // B
    data[i + 3] = 255; // A
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16); // Deixa o ruído bem denso para parecer algodão/pelo
  texture.needsUpdate = true;
  return texture;
}

const texturaFofa = criaTexturaPelucia();

// 2. Branco Puro Acetinado para as Asas, Empenagem e Leme
const materialMetalCartoon = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#e26b8e"),
  metalness: 0.02,
  roughness: 0.01,
  flatShading: false,
  opacity: 1.0, // Corrigido de 10.0 (máximo é 1.0)
  ior: 1.5,
  clearcoat: 1.0,
  clearcoatRoughness: 0.0,
  transparent: true,
});

const materialMetalNormal = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#ffffff"), // Rosa marshmallow fofinho e doce
  bumpMap: texturaFofa, // Aplica o relevo micro-poroso de pelúcia
  bumpScale: 0.015, // Bem sutil para parecer toque de algodão
  roughness: 0.95, // Superfície opaca (marshmallow não reflete espelhado)
  metalness: 0.0, // Zero aspecto de metal

  // === EFEITO DE VELUDO / PELO (SHEEN) ===
  sheen: 1.0, // Ativa o brilho de penugem/tecido nas bordas
  sheenRoughness: 0.8, // Dispersão suave do brilho aveludado
  sheenColor: new THREE.Color("#e2f7ff"), // As bordas brilham branco fofinho com a luz
});

// 3. Vidro Amarelo Cristalino Iluminado para Detalhes, Rodas e Orelhas
const materialVidroOtimizado = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#ffd902"), // Amarelo gema reativo
  emissive: new THREE.Color("#7a6100"), // Luz interna suave para garantir brilho em qualquer ângulo
  emissiveIntensity: 0.6,
  metalness: 0.0,
  roughness: 0.0, // Vidro perfeitamente liso e reflexivo
  transparent: true,
  transmission: 0.7, // Transparência cristalina e leve para a GPU
  opacity: 1.0,
  ior: 1.5, // Índice de refração do vidro real
  clearcoat: 1.0, // Verniz brilhante espelhado
  clearcoatRoughness: 0.0,
  side: THREE.DoubleSide,
});

/**
 * Cria e adiciona o avião à cena.
 * @param {THREE.Scene} scene
 * @returns {{ object: THREE.Mesh }} Objeto raiz do avião.
 */
export function criaAviao(scene) {
  // --- Geometrias (formas brutas, sem posição ainda) ---
  const cilindroCorpo = new THREE.CylinderGeometry(3, 2.6, 10, 20); // fuselagem cilíndrica
  const asa = new THREE.CylinderGeometry(1.2, 2.8, 12, 5); // asa com perfil pentagonal
  const sphereoNariz = new THREE.CapsuleGeometry(3, 2, 3, 20); // nariz arredondado
  const sphereoRabo = new THREE.SphereGeometry(2.6, 20, 5); // tampa traseira
  const cilindroRabo = new THREE.CapsuleGeometry(1, 5, 2, 12); // empenagem horizontal
  const cilindroLeme = new THREE.CylinderGeometry(2, 1, 6.5); // leme vertical
  const cilindroKitty = new THREE.CylinderGeometry(0.1, 2, 1, 3); // orelhas da Hello Kitty
  const sphereFofo = new THREE.SphereGeometry(0.4); // nó de fita (objeto raiz)

  // --- COMPARTILHAMENTO DE MATERIAIS (PROBLEMA 2 RESOLVIDO) ---
  const corpo = new THREE.Mesh(cilindroCorpo, materialMetalCartoon);
  const nariz = new THREE.Mesh(sphereoNariz, materialMetalNormal);
  const rabo = new THREE.Mesh(sphereoRabo, materialMetalNormal);

  const empenagem = new THREE.Mesh(cilindroRabo, materialMetalCartoon);
  const basa1 = new THREE.Mesh(asa, materialMetalNormal); // asa esquerda
  const basa2 = new THREE.Mesh(asa, materialMetalNormal); // asa direita
  const leme = new THREE.Mesh(cilindroLeme, materialMetalNormal);

  const roda1 = new THREE.Mesh(cilindroRabo, materialVidroOtimizado); // detalhe frontal
  const kitty = new THREE.Mesh(cilindroKitty, materialVidroOtimizado); // orelha direita
  const kitty2 = new THREE.Mesh(cilindroKitty, materialVidroOtimizado); // orelha esquerda
  const object = new THREE.Mesh(sphereFofo, materialVidroOtimizado); // raiz da hierarquia

  let angle = THREE.MathUtils.degToRad(90); // 90° em radianos, usado em várias rotações

  // --- Hierarquia de objetos ---
  corpo.position.set(0, 5, 0);
  corpo.add(nariz, basa1, basa2, rabo, leme, roda1, kitty, kitty2);
  leme.add(empenagem); // empenagem horizontal presa ao leme vertical

  // --- Posicionamento e rotação de cada parte relativa ao seu pai ---

  // Asas giradas 135° para ficarem horizontais (cilindro nasce vertical)
  basa2.rotateZ(-1.5 * angle);
  basa1.rotateZ(1.5 * angle);
  basa1.position.set(-3.5, 0, 0); // asa esquerda
  basa2.position.set(3.5, 0, 0); // asa direita

  nariz.position.set(0, 5, 0); // frente do avião
  rabo.position.set(0, -5.5, 0); // tampa da cauda

  roda1.scale.set(1, 1, 0.5); // achata a cápsula para parecer um disco
  roda1.position.set(0, 2, 2.6); // detalhe na barriga

  // Orelhas da Hello Kitty: rotacionadas para ficarem em pé
  kitty.rotateX(0.5 * angle);
  kitty.position.set(2.5, 7, -1);
  kitty2.rotateX(0.5 * angle);
  kitty2.position.set(-2.5, 7, -1);

  object.position.set(0, 8.8, 0); // posição inicial do nó raiz
  object.scale.set(1.2, 1, 1);

  // Leme vertical na cauda, inclinado para frente
  leme.position.set(0, -7.2, -1.2);
  leme.rotateX(0.5 * angle);
  empenagem.rotateZ(angle); // empenagem horizontal (90° do leme)
  empenagem.translateX(-2); // desloca para o lado após rotacionar

  // Corpo principal girado 90° para que o "topo" do cilindro aponte para frente
  corpo.rotateX(angle);
  object.add(corpo);
  corpo.position.set(0, 0, -5.2); // reposiciona após a rotação para centralizar
  corpo.scale.set(0.6, 0.6, 0.6);

  scene.add(object); // adiciona o avião inteiro à cena por meio do objeto raiz

  return { object };
}
