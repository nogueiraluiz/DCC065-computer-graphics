/**
 * @file Cria dois tipos de árvore 3D para popular os tiles do cenário.
 *
 * As árvores são construídas na origem local (0, 0, 0) e não são adicionadas
 * a nenhum pai aqui — quem chama criaArvore é responsável por adicionar o
 * objeto retornado ao tile ou à cena e definir sua posição.
 */

import * as THREE from 'three';
import { MeshToonNodeMaterial } from 'three/webgpu';
import { Fn, mix, smoothstep, uniform, vec2, positionGeometry, mx_fractal_noise_float, mx_rotate2d } from 'three/tsl';

/** Cores possíveis para as folhas das árvores. */
const COR_FOLHA = ["#738417", "#2e6f40", "#388347", "#BF5B05", "#92780A"];

// Material de madeira compartilhado entre todas as instâncias (criado uma única vez)
const madeira = new THREE.MeshToonMaterial({color: "brown"});

/**
 * Cria o material das folhas com um shader TSL: um ruído bem pronunciado
 * quebra a cor lisa em manchas claras/escuras, simulando o aspecto grumoso
 * de uma copa cheia de folhas — sem usar nenhuma textura de imagem.
 *
 * Aleatorização: como as folhas de cada tipo de árvore reaproveitam a mesma
 * geometria compartilhada (`geomFolha1`, `geomFolha6`, etc.), o ruído — que
 * depende só da posição local do vértice — ficaria idêntico em toda árvore
 * do mesmo tipo. Por isso cada árvore sorteia seu próprio deslocamento,
 * escala e contraste de ruído, tornando cada copa visualmente diferente.
 *
 * Tudo isso (cor de base incluída) é passado como `uniform`, nunca como
 * constante presa no grafo do nó — assim toda árvore continua reaproveitando
 * o mesmo shader já compilado; só os valores de entrada mudam por instância.
 *
 * @param {string} hexColor
 * @returns {THREE.MeshToonNodeMaterial}
 */
function criaMaterialFolha(hexColor) {
  const material = new MeshToonNodeMaterial();

  // Mesmo escolhendo a mesma cor da paleta (COR_FOLHA só tem 5 opções), cada
  // árvore recebe um pequeno desvio de matiz/luminosidade — assim nunca duas
  // árvores acabam com o EXATO mesmo tom de verde só por coincidência.
  const baseColorObj = new THREE.Color(hexColor);
  const hsl = { h: 0, s: 0, l: 0 };
  baseColorObj.getHSL(hsl);
  hsl.h = (hsl.h + (Math.random() - 0.5) * 0.1 + 1) % 1;
  hsl.l = THREE.MathUtils.clamp(hsl.l + (Math.random() - 0.5) * 0.16, 0.12, 0.75);
  baseColorObj.setHSL(hsl.h, hsl.s, hsl.l);
  const baseColor = uniform(baseColorObj);

  // Sorteados uma vez por árvore, na criação do material. Faixas bem largas
  // e um contraste forte de propósito — o objetivo não é só deslocar o mesmo
  // padrão, e sim mudar a "personalidade" dele (manchas finas vs. enormes,
  // suaves vs. duras, giradas em ângulos diferentes) para que fique
  // inconfundível mesmo à distância da câmera do jogo.
  const noiseOffset = uniform(new THREE.Vector2(
    Math.random() * 200 - 100,
    Math.random() * 200 - 100,
  ));
  const noiseRotationDeg = uniform(Math.random() * 360);
  const noiseScale = uniform(0.4 + Math.random() * 3.6); // 0.4 .. 4.0 — manchas enormes ou bem finas
  const noiseOctaves = uniform(2 + Math.floor(Math.random() * 3)); // 2, 3 ou 4
  const clumpWidth = uniform(0.05 + Math.random() * 0.3); // transição dura ou suave
  const darkFactor = uniform(0.2 + Math.random() * 0.3); // 0.20 .. 0.50 — mais escuro
  const lightFactor = uniform(1.2 + Math.random() * 0.7); // 1.20 .. 1.90 — mais claro

  material.colorNode = Fn(() => {
    // Projeta a posição local (inclinando um pouco o eixo Y na amostragem)
    // para que o ruído varie tanto ao redor da copa quanto entre as camadas,
    // depois gira e desloca pelo ângulo/offset sorteados desta árvore.
    const projected = vec2(
      positionGeometry.x.add(positionGeometry.y.mul(0.7)),
      positionGeometry.z,
    );
    const leafCoord = mx_rotate2d(projected, noiseRotationDeg).add(noiseOffset).mul(noiseScale);

    const leafNoise = mx_fractal_noise_float(leafCoord, noiseOctaves, 2.0, 0.5, 1.0);
    // Transição estreita (em vez de suave) para virar manchas bem definidas,
    // como se fossem tufos de folhas diferentes, não um gradiente contínuo.
    const clump = smoothstep(clumpWidth.negate(), clumpWidth, leafNoise);

    const darkLeaf = baseColor.mul(darkFactor);
    const lightLeaf = baseColor.mul(lightFactor);
    return mix(darkLeaf, lightLeaf, clump);
  })();

  return material;
}
/** Escalas possíveis — sorteadas aleatoriamente a cada criação. */
const ESCALAS_POSSIVEIS = [0.75, 1, 1.5, 1.75];

// ---------------------------------------------------------------------------
// Geometrias pré-criadas e compartilhadas entre todas as instâncias.
// Criar geometrias uma única vez e reutilizá-las reduz alocações de memória na GPU.
// ---------------------------------------------------------------------------

// Tipo 1 — conífera em camadas (estilo pinheiro)
const geomTronco1 = new THREE.CylinderGeometry(1, 1, 6);     // tronco reto
const geomFolha1  = new THREE.CylinderGeometry(0, 4,   4);   // camada base (maior)
const geomFolha2  = new THREE.CylinderGeometry(0, 3.5, 3.5);
const geomFolha3  = new THREE.CylinderGeometry(0, 3,   3);
const geomFolha4  = new THREE.CylinderGeometry(0, 2.5, 2.5);
const geomFolha5  = new THREE.CylinderGeometry(0, 2,   2.5); // ponta (menor)

// Tipo 2 — árvore de folha larga com copa esférica e galho lateral
const geomTronco2 = new THREE.CylinderGeometry(0.5, 0.5, 5);  // tronco mais fino
const geomGalho1  = new THREE.CylinderGeometry(0.3, 0.3, 2.5); // galho inclinado
const geomFolha6  = new THREE.SphereGeometry(2);               // copa principal
const geomFolha7  = new THREE.SphereGeometry(1.5);             // copa secundária no galho

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Constrói uma árvore 3D e retorna seu objeto raiz.
 *
 * A árvore é posicionada na origem (0, 0, 0) em espaço local.
 * Quem chama esta função deve adicioná-la a um pai (tile, cena, etc.)
 * e definir sua posição final.
 *
 * @param {1|2} tipo - Tipo 1: conífera em camadas. Tipo 2: árvore com copa esférica.
 * @returns {THREE.Mesh} Objeto raiz da árvore (já com filhos e escala aplicados).
 */
export function criaArvore(tipo) {
  const corAleatorio   = COR_FOLHA[Math.floor(Math.random() * COR_FOLHA.length)];
  const folha          = criaMaterialFolha(corAleatorio);
  const escalaSorteada = ESCALAS_POSSIVEIS[Math.floor(Math.random() * ESCALAS_POSSIVEIS.length)];

  let object;

  if (tipo === 1) {
    // Conífera: tronco com 5 camadas cônicas sobrepostas, cada uma menor e mais alta
    object = new THREE.Mesh(geomTronco1, madeira);

    const folhas1 = new THREE.Mesh(geomFolha1, folha);
    const folhas2 = new THREE.Mesh(geomFolha2, folha);
    const folhas3 = new THREE.Mesh(geomFolha3, folha);
    const folhas4 = new THREE.Mesh(geomFolha4, folha);
    const folhas5 = new THREE.Mesh(geomFolha5, folha);

    // Camadas empilhadas ao longo do Y — cada uma um pouco mais alta que a anterior
    folhas1.position.set(0, 2,   0);
    folhas2.position.set(0, 3,   0);
    folhas3.position.set(0, 4,   0);
    folhas4.position.set(0, 5,   0);
    folhas5.position.set(0, 6,   0);

    object.add(folhas1, folhas2, folhas3, folhas4, folhas5);

  } else {
    // Folha larga: tronco fino com galho inclinado e duas copas esféricas
    object = new THREE.Mesh(geomTronco2, madeira);

    const galho1  = new THREE.Mesh(geomGalho1, madeira);
    galho1.rotateX(THREE.MathUtils.degToRad(60)); // inclina o galho para fora do tronco
    galho1.position.set(0, 0, 1);

    const folhas6 = new THREE.Mesh(geomFolha6, folha); // copa no topo do tronco
    folhas6.position.set(0, 2.5, 0);

    const folhas7 = new THREE.Mesh(geomFolha7, folha); // copa menor na ponta do galho
    folhas7.position.set(0, 1.7, 3);

    object.add(galho1, folhas6, folhas7);
  }

  object.scale.set(escalaSorteada, escalaSorteada, escalaSorteada);

  object.traverse(obj => obj.castShadow = true );

  return object;
}
