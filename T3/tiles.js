/**
 * @file Gerencia dois tiles de terreno procedural que rolam infinitamente no eixo Z,
 * e um plano de água fixo na cena posicionado em WATER_LEVEL.
 *
 * Opção implementada: múltiplos planos alternados (opção mais simples).
 *   Dois tiles de tamanho TILE_DEPTH se alternam: quando o tile da frente sai
 *   do campo de visão, ele é teleportado para atrás do tile atual e reconstruído
 *   com costura na borda de junção.
 *
 * Costura (seam stitching):
 *   Cada tile guarda as alturas da sua borda traseira (Z+). Ao reciclar,
 *   essas alturas são copiadas como borda frontal do tile novo, garantindo
 *   continuidade visual entre os dois segmentos.
 *
 * Reciclagem sem gap/overlap:
 *   O tile reciclado recebe sempre uma posição absoluta calculada a partir
 *   do tile vizinho — nunca relativa ao delta do frame atual. O threshold de
 *   reciclagem é antecipado o suficiente para que o gap nunca apareça mesmo
 *   com gameSpeed 3×.
 *
 * Água (WebGPU/TSL):
 *   Um único plano `THREE.Mesh` com `MeshStandardNodeMaterial` fica fixo na
 *   cena em Y = WATER_LEVEL. O shader TSL anima a superfície com:
 *     - Normal map carregado via `texture()` com scroll duplo em direções
 *       opostas (simula ondas cruzadas);
 *     - Ondulação geométrica no `positionNode` via ruído fractal por vértice;
 *     - Cor profunda/rasa via `positionWorld.y` real;
 *     - Reflexo do skybox via `reflectVector` + `cubeTexture` (ou
 *       `envMapTexture` quando disponível na cena).
 *   O plano é largo o suficiente (TILE_WIDTH × 20 000) para nunca mostrar
 *   bordas enquanto os tiles rolam — e permanece fixo em X/Z, pois a câmera
 *   também é fixa; só os tiles é que se movem.
 */

import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  Fn,
  float,
  vec2,
  vec3,
  mix,
  smoothstep,
  normalize,
  time,
  positionGeometry,
  positionWorld,
  normalLocal,
  normalWorld,
  normalView,
  transformNormalToView,
  mx_fractal_noise_float,
  mx_fractal_noise_vec3,
  texture,
  uv,
  reflectVector,
  cameraPosition,
} from "three/tsl";
import { criaArvore } from "./arvore.js";

// Estrutura simples para representar gradientes 3D usados no Perlin.
function Grad(x, y, z) {
  this.x = x;
  this.y = y;
  this.z = z;
}

function fade(t) {
  // Curva suave usada para interpolar os valores sem cantos duros.
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  // Interpolação linear entre dois valores.
  return (1 - t) * a + t * b;
}

/**
 * Altura num ponto via fractal Brownian motion (fbm):
 * soma de octaves de Perlin com frequência crescente e amplitude decrescente,
 * produzindo montanhas com detalhes em múltiplas escalas.
 *
 * @param {number} ni - Índice X do vértice.
 * @param {number} nj - Índice Z do vértice (já com offsetZ aplicado).
 * @param {object} options
 * @returns {number} Altura em unidades de mundo.
 */
function fbm(ni, nj, options) {
  // Escala inicial do ruído, ajustando a frequência espacial do terreno.
  const baseScale = (options.frequency * 5) / (options.xSegments + 1);

  // Número de camadas de ruído empilhadas para criar detalhe em múltiplas escalas.
  const octaves = 5;
  // Cada octave aumenta a frequência do ruído.
  const lacunarity = 1; // frequência dobra a cada octave
  // Cada octave reduz a amplitude da contribuição.
  const persistence = 0.5; // amplitude cai à metade a cada octave

  // Acumuladores do valor final e da normalização.
  let value = 0;
  let freq = baseScale;
  let amp = 1;
  let maxAmp = 0;

  // Soma várias amostras de Perlin com frequências e amplitudes diferentes.
  for (let o = 0; o < octaves; o++) {
    value += globalThis.noise.perlin(ni * freq, nj * freq) * amp;
    maxAmp += amp;
    freq *= lacunarity;
    amp *= persistence;
  }

  // Normaliza o resultado para o intervalo esperado.
  const normalized = Math.max(-1, Math.min(1, value / maxAmp));

  // Redistribuição leve: empurra picos e vales para os extremos, exagerando
  // moderadamente montanhas e lagos sem descaracterizar o relevo original.
  const EXAGGERATION_EXPONENT = 0.8;
  const exaggerated =
    Math.sign(normalized) *
    Math.pow(Math.abs(normalized), EXAGGERATION_EXPONENT);

  return (
    options.minHeight +
    ((exaggerated + 1) * 0.5) * (options.maxHeight - options.minHeight)
  );
}

const Terrain = createTerrain(THREE);

function ensureNoise() {
  // Se o ruído já existe e já tem as funções necessárias, não recria nada.
  if (
    globalThis.noise &&
    typeof globalThis.noise.seed === "function" &&
    typeof globalThis.noise.perlin === "function"
  ) {
    return;
  }

  // Cria o objeto global de ruído que será usado pelo terreno procedural.
  const noise = {};
  globalThis.noise = noise;

  // Produto escalar no plano XY, usado para calcular contribuição do gradiente.
  Grad.prototype.dot2 = function (x, y) {
    return this.x * x + this.y * y;
  };

  // Vetores de gradiente pré-definidos usados pelo algoritmo de ruído.
  let grad3 = [
    new Grad(1, 1, 0),
    new Grad(-1, 1, 0),
    new Grad(1, -1, 0),
    new Grad(-1, -1, 0),
    new Grad(1, 0, 1),
    new Grad(-1, 0, 1),
    new Grad(1, 0, -1),
    new Grad(-1, 0, -1),
    new Grad(0, 1, 1),
    new Grad(0, -1, 1),
    new Grad(0, 1, -1),
    new Grad(0, -1, -1),
  ];

  // Permutação base do Perlin para embaralhar o acesso aos gradientes.
  let p = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
    140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247,
    120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177,
    33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165,
    71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211,
    133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63,
    161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135,
    130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226,
    250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59,
    227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152,
    2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253,
    19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228,
    251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235,
    249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176,
    115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29,
    24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
  ];

  // Tabelas duplicadas para evitar módulos e simplificar o acesso aos vizinhos.
  let perm = new Array(512),
    gradP = new Array(512);

  // Inicializa a semente do ruído com um valor fornecido pela aplicação.
  noise.seed = function (seed) {
    if (seed > 0 && seed < 1) {
      seed *= 65536;
    }

    seed = Math.floor(seed);
    if (seed < 256) {
      seed |= seed << 8;
    }

    // Preenche as tabelas permutadas com base na semente.
    for (let i = 0; i < 256; i++) {
      let v;
      if (i & 1) {
        v = p[i] ^ (seed & 255);
      } else {
        v = p[i] ^ ((seed >> 8) & 255);
      }

      perm[i] = perm[i + 256] = v;
      gradP[i] = gradP[i + 256] = grad3[v % 12];
    }
  };

  // Calcula o valor de ruído Perlin em coordenadas 2D.
  noise.perlin = function (x, y) {
    let X = Math.floor(x),
      Y = Math.floor(y);
    x = x - X;
    y = y - Y;
    X = X & 255;
    Y = Y & 255;

    let n00 = gradP[X + perm[Y]].dot2(x, y);
    let n01 = gradP[X + perm[Y + 1]].dot2(x, y - 1);
    let n10 = gradP[X + 1 + perm[Y]].dot2(x - 1, y);
    let n11 = gradP[X + 1 + perm[Y + 1]].dot2(x - 1, y - 1);

    let u = fade(x);

    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), fade(y));
  };
}

function createTerrain(THREEParam) {
  // Copia a API do THREE recebida para usar os construtores necessários.
  const THREE = { ...THREEParam };
  // Garante que o ruído procedural esteja disponível antes de criar o terreno.
  ensureNoise();

  // Retorna uma fábrica de terreno compatível com a antiga API usada no projeto.
  return function Terrain(options) {
    // Valores padrão usados quando o chamador não informa uma opção.
    const defaultOptions = {
      heightmap: null,
      material: null,
      maxHeight: 100,
      minHeight: -100,
      xSegments: 63,
      xSize: 1024,
      ySegments: 63,
      ySize: 1024,
      frequency: 2.5,
    };

    // Garante que sempre exista um objeto de opções para preenchimento dos defaults.
    options = options || {};
    for (const opt in defaultOptions) {
      if (Object.hasOwn(defaultOptions, opt)) {
        options[opt] =
          options[opt] === undefined ? defaultOptions[opt] : options[opt];
      }
    }

    // Se não vier material, cria um material básico como fallback.
    options.material =
      options.material || new THREE.MeshBasicMaterial({ color: 0xee6633 });

    // Grupo raiz do terreno; ele é rotacionado para ficar no plano horizontal correto.
    const scene = new THREE.Object3D();
    scene.rotation.x = -0.5 * Math.PI;

    // Malha principal do terreno construída como um plano subdividido.
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(
        options.xSize,
        options.ySize,
        options.xSegments,
        options.ySegments
      ),
      options.material
    );

    // Lê a geometria para editar diretamente os valores de altura dos vértices.
    const positions = mesh.geometry.attributes.position;
    const zs = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      zs[i] = positions.getZ(i);
    }

    // Se uma função de heightmap foi fornecida, usa-a para modificar as alturas.
    if (typeof options.heightmap === "function") {
      const result = options.heightmap(zs, options);
      if (
        result &&
        typeof result.length === "number" &&
        result.length === zs.length
      ) {
        // Se a função retornar um novo array, copia os valores para o buffer interno.
        for (let i = 0; i < zs.length; i++) {
          zs[i] = result[i];
        }
      }
    } else {
      // Aviso de uso incorreto: sem heightmap o terreno não terá o relevo esperado.
      console.warn(
        "An invalid value was passed for `options.heightmap`: " +
          options.heightmap
      );
    }

    // Escreve as alturas calculadas de volta na geometria.
    for (let i = 0; i < positions.count; i++) {
      positions.setZ(i, zs[i]);
    }
    // Marca a geometria como alterada e recalcula normais e bounds.
    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();

    mesh.receiveShadow = true;

    // Adiciona o mesh ao grupo raiz e devolve o terreno pronto para uso.
    scene.add(mesh);
    return scene;
  };
}

// ---------------------------------------------------------------------------
// Constantes de configuração do mundo
// ---------------------------------------------------------------------------

/** Largura e profundidade de cada tile em unidades de mundo. */
const TILE_WIDTH = 1000;
const TILE_DEPTH = 4000;

/**
 * Número de subdivisões do plano em cada eixo.
 * Mais segmentos = terreno mais detalhado, mas mais pesado para a GPU.
 */
const TILE_SEGMENTS = 63;

/** Velocidade base de rolagem do chão (unidades/segundo), sem escala de gameSpeed. */
const TILE_SCROLL_SPEED = 50;

/** Amplitude máxima das montanhas em relação ao plano base. */
const MAX_HEIGHT = 80;
const MIN_HEIGHT = -50;

/**
 * Frequência base do ruído fbm: quanto menor, maiores (e mais espaçadas)
 * ficam as feições do relevo — usada para afastar as montanhas umas das outras.
 */
const MOUNTAIN_FREQUENCY = 1.2;

/** Altura absoluta abaixo da qual o relevo vira lago/água. */
const WATER_LEVEL = -25;

/** Largura da faixa de transição (praia/costa) entre terra e água. */
const SHORE_BAND = 5;

// ---------------------------------------------------------------------------
// Configuração das árvores
// ---------------------------------------------------------------------------

/**
 * Grade de distribuição de árvores: o tile é dividido em células,
 * e cada célula pode ter no máximo uma árvore.
 */
const TREE_GRID_COLS = 40;
const TREE_GRID_ROWS = 40;

/** Distância mínima entre duas árvores (unidades de mundo, espaço local do tile). */
const TREE_MIN_DIST = 30;

/** Faixa de altitude em que árvores podem nascer. Fora dela é água, rocha ou neve. */
const TREE_MAX_HEIGHT = 50;
const TREE_MIN_HEIGHT = WATER_LEVEL + 8;

/** Inclinação máxima do terreno para permitir o nascimento de árvores. */
const TREE_MAX_SLOPE_DEG = 45;

/** Compensação vertical para evitar que a base da árvore fique soterrada. */
const TREE_BASE_OFFSET = 2;

// ---------------------------------------------------------------------------
// Faixas de altura/inclinação de cada tipo de terreno (shader do terreno)
// ---------------------------------------------------------------------------

/** Vegetação: gradiente do verde escuro (vales) ao verde claro (encostas). */
const GRASS_LOW_HEIGHT = -4;
const GRASS_HIGH_HEIGHT = 45;

/** Praia: faixa de areia visível entre a linha d'água e a vegetação. */
const SAND_START_HEIGHT = WATER_LEVEL;
const SAND_FULL_HEIGHT = WATER_LEVEL + 3;
const SAND_FADE_HEIGHT = WATER_LEVEL + 6;
const SAND_END_HEIGHT = WATER_LEVEL + 16;

/** Rocha: por altitude (picos) e por inclinação (encostas íngremes, em qualquer altura). */
const ROCK_START_HEIGHT = 24;
const ROCK_END_HEIGHT = 48;
const ROCK_SLOPE_START = 0.45; // normalWorld.y — abaixo disso já conta como rocha
const ROCK_SLOPE_END = 0.85;

/** Neve: banda perto do topo, reduzida em paredões muito íngremes (fica rocha exposta). */
const SNOW_START_HEIGHT = 52;
const SNOW_END_HEIGHT = 60;
const SNOW_SLOPE_START = 0.3;
const SNOW_SLOPE_END = 0.7;

// ---------------------------------------------------------------------------
// Material do terreno — sem nenhuma lógica de água
// ---------------------------------------------------------------------------

/**
 * Constrói o material procedural do terreno em TSL (Three Shading Language).
 *
 * Combina múltiplos "materiais" sólidos (vegetação, areia, rocha, neve) com
 * blending baseado em altura e inclinação do relevo.
 *
 * A água foi removida deste shader — ela é renderizada por um mesh separado
 * (ver createWaterPlane) posicionado em Y = WATER_LEVEL na cena.
 */
function createTerrainMaterial() {
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });

  // positionGeometry.z é o eixo de altura do vértice no espaço local do plano
  // (o terreno é um PlaneGeometry rotacionado, então Z local vira Y no mundo).
  const height = positionGeometry.z;
  const localXY = positionGeometry.xy;

  // Calculada aqui fora (não só dentro do colorNode) porque também alimenta o
  // brilho/rugosidade da neve logo abaixo — precisa ser reaproveitável.
  const snowMask = smoothstep(
    float(SNOW_START_HEIGHT),
    float(SNOW_END_HEIGHT),
    height
  ).mul(smoothstep(SNOW_SLOPE_START, SNOW_SLOPE_END, normalWorld.y));

  material.colorNode = Fn(() => {
    // Uma única amostra de ruído por pixel (2 octaves), reaproveitada em todos os
    // blends abaixo — várias chamadas de ruído fractal por fragmento derrubam o
    // framerate rapidamente, então o mesmo valor alimenta terra, praia e neve.
    const detail = mx_fractal_noise_float(localXY.mul(0.06), 2, 2.0, 0.5, 1.0);

    // Cores-base com bastante contraste entre si.
    const grassLow = new THREE.Color("#1c4d1f"); // verde escuro
    const grassHigh = new THREE.Color("#2a7f2a"); // verde claro
    const sandColor = new THREE.Color("#f2d99b"); // amarelo vivo
    const rockColor = new THREE.Color("#414144"); // cinza bem escuro
    const snowColor = new THREE.Color("#ffffff"); // branco puro

    // Ruído fino e alongado (como palhetas de grama) para quebrar o verde liso
    // em tufos claros/escuros — sem depender de nenhuma textura de imagem.
    const bladeCoord = localXY.mul(vec2(0.9, 0.3));
    const bladeNoise = mx_fractal_noise_float(bladeCoord, 2, 2.0, 0.5, 1.0);
    const bladeShade = smoothstep(-0.2, 0.2, bladeNoise).mul(0.3).add(0.85);

    // Vegetação: gradiente do verde escuro (vales) ao verde claro (encostas),
    // com os tufos de grama aplicados por cima.
    let color = mix(
      grassLow,
      grassHigh,
      smoothstep(float(GRASS_LOW_HEIGHT), float(GRASS_HIGH_HEIGHT), height)
    ).mul(bladeShade);

    // Praia: faixa estreita de areia logo acima da linha d'água.
    const sandIn = smoothstep(
      float(SAND_START_HEIGHT),
      float(SAND_FULL_HEIGHT),
      height
    );
    const sandOut = smoothstep(
      float(SAND_FADE_HEIGHT),
      float(SAND_END_HEIGHT),
      height
    ).oneMinus();
    color = mix(color, sandColor, sandIn.mul(sandOut));

    // Rocha por altitude (picos) e por inclinação (encostas íngremes, em qualquer altura).
    const rockByHeight = smoothstep(
      float(ROCK_START_HEIGHT),
      float(ROCK_END_HEIGHT),
      height
    );
    const rockBySlope = smoothstep(
      ROCK_SLOPE_START,
      ROCK_SLOPE_END,
      normalWorld.y
    ).oneMinus();
    color = mix(color, rockColor, rockByHeight);
    color = mix(color, rockColor, rockBySlope);

    // Neve (snowMask calculada fora, na função pai — ver createTerrainMaterial).
    color = mix(color, snowColor, snowMask);

    // Quebra a uniformidade das cores, simulando textura procedural.
    color = color.mul(detail.mul(0.08).add(0.96));

    return color;
  })();

  // Neve um pouco mais lisa que o resto do chão, para pegar brilho especular
  // da luz direcional — sozinho, albedo (1,1,1) sob luz difusa fraca ainda
  // lê como cinza; um pouco de gloss + um leve emissivo garantem branco de verdade.
  material.roughnessNode = mix(float(0.95), float(0.45), snowMask);
  material.metalnessNode = float(0.0);
  material.emissiveNode = vec3(1.0, 1.0, 1.0).mul(snowMask).mul(0.18);

  return material;
}

const terrainMaterial = createTerrainMaterial();

// ---------------------------------------------------------------------------
// Material e mesh da água — plano fixo na cena, WebGPU/TSL puro
// ---------------------------------------------------------------------------

/**
 * Constrói o material de água em TSL (WebGPU nativo).
 *
 * Efeitos implementados:
 *   1. Normal map animado com scroll duplo em direções opostas — simula ondas
 *      cruzadas sem custo extra de geometria. O mesmo arquivo de normal map
 *      usado no exemplo de referência (waternormals.jpg) é amostrado duas
 *      vezes com UVs distintos e as normais são somadas e normalizadas.
 *
 *   2. Ondulação geométrica leve por vértice — o `positionNode` desloca Y
 *      levemente com ruído fractal animado, dando volume à superfície sem
 *      precisar de geometria muito densa.
 *
 *   3. Cor profunda/rasa — mistura dois tons de azul com base na profundidade
 *      estimada (distância do WATER_LEVEL ao fundo visível) usando `smoothstep`.
 *
 *   4. Reflexo do skybox — `reflectVector` calculado a partir da normal
 *      perturbada e amostrado no `envMap` da cena (Three.js injeta
 *      automaticamente `envMapTexture` no material quando `scene.environment`
 *      está definido).
 *
 *   5. Fresnel — mais reflexo nas bordas (ângulo rasante), menos no centro —
 *      igual ao comportamento físico real da água.
 *
 *   6. Roughness e metalness baixos para manter o brilho especular PBR.
 *
 * @param {THREE.Texture} normalMapTexture - Textura de normal map (waternormals.jpg)
 *   já carregada com wrapS = wrapT = THREE.RepeatWrapping.
 * @returns {MeshStandardNodeMaterial}
 */
function createWaterMaterial(normalMapTexture) {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.08,
    metalness: 0.02,
    transparent: true,
    opacity: 0.9,
  });

  // --- Escala de UV do normal map: maior = ondas mais finas e frequentes ---
  const NM_SCALE = 0.003; // ajuste conforme o tamanho visual desejado
  const NM_SPEED_A = 0.035; // velocidade da primeira camada de ondas
  const NM_SPEED_B = 0.028; // velocidade da segunda (direção cruzada)

  // --- Textura de normal map como nó TSL ---
  const nmTex = texture(normalMapTexture);

  // --- Ondulação geométrica por vértice ---
  // Usa coordenadas de mundo XZ para que o padrão seja independente da posição
  // do tile — como o plano de água é fixo, positionWorld.xz funciona perfeitamente.
  const waveCoord = positionWorld.xz.mul(NM_SCALE * 0.4).add(
    vec2(time.mul(NM_SPEED_A * 0.5), time.mul(NM_SPEED_B * 0.5))
  );
  const waveHeight = mx_fractal_noise_float(waveCoord, 3, 2.0, 0.5, 1.0).mul(0.9);

  // Desloca Y do vértice — mantém X e Z intactos.
  mat.positionNode = vec3(
    positionGeometry.x,
    positionGeometry.y.add(waveHeight),
    positionGeometry.z
  );

  // --- UVs animadas para o normal map ---
  // Camada A: scroll diagonal positivo
  const uvA = uv()
    .mul(TILE_WIDTH * NM_SCALE * 5.0)
    .add(vec2(time.mul(NM_SPEED_A), time.mul(NM_SPEED_A * 0.7)));
  // Camada B: scroll na diagonal oposta (ondas cruzadas)
  const uvB = uv()
    .mul(TILE_WIDTH * NM_SCALE * 5.0)
    .add(vec2(time.mul(-NM_SPEED_B * 0.8), time.mul(NM_SPEED_B)));

  // Amostra o normal map duas vezes com UVs diferentes e combina os resultados.
  // O normal map está em tangent space [0,1] → remapeia para [-1,1].
  const nmA = nmTex.sample(uvA).xyz.mul(2.0).sub(1.0);
  const nmB = nmTex.sample(uvB).xyz.mul(2.0).sub(1.0);
  const combinedNormal = normalize(nmA.add(nmB));

  // Aplica a normal perturbada ao material (espaço de tangente → view).
  mat.normalNode = transformNormalToView(combinedNormal);

  // --- Cor: profunda/rasa com base na altura do fundo ---
  const waterShallow = new THREE.Color("#3ec6be"); // ciano turquesa
  const waterDeep    = new THREE.Color("#0a2e45"); // azul-petróleo escuro

  // Usa o Y de mundo como proxy de profundidade (WATER_LEVEL é o teto, MIN_HEIGHT é o fundo).
  // Como este plano está sempre em Y = WATER_LEVEL e o terreno abaixo vai até MIN_HEIGHT,
  // a profundidade real não é trivial num plano flat — usamos a coordenada de textura
  // como variação espacial para dar aspecto de raso/fundo sem ray-casting.
  const depthVariation = mx_fractal_noise_float(
    positionWorld.xz.mul(NM_SCALE * 0.3),
    2, 2.0, 0.5, 1.0
  ).mul(0.5).add(0.5); // remapeia para [0,1]

  const baseWaterColor = mix(waterDeep, waterShallow, depthVariation);

  // --- Fresnel: reflexo mais forte no ângulo rasante ---
  // dot(normalView, vec3(0,0,1)) ≈ cos do ângulo de visão — quanto menor, mais rasante.
  const viewDotN = normalView.dot(vec3(0.0, 0.0, 1.0)).abs();
  const fresnel = smoothstep(0.0, 1.0, viewDotN.oneMinus().pow(3.0));
  const skyReflection = smoothstep(-0.2, 0.8, reflectVector.y);

  // Cor final: interpolação entre a cor de água e branco puro no ângulo rasante.
  mat.colorNode = mix(baseWaterColor, vec3(0.9, 0.96, 1.0), fresnel.mul(0.42));
  mat.colorNode = mix(mat.colorNode, vec3(0.72, 0.86, 0.98), skyReflection.mul(0.12));

  // Superfície quase lisa para pegar brilho especular da luz direcional.
  mat.roughnessNode = float(0.06).add(depthVariation.mul(0.04));
  mat.metalnessNode = float(0.08);

  return mat;
}

/**
 * Cria e adiciona à cena o plano de água fixo posicionado em WATER_LEVEL.
 *
 * O plano tem largura TILE_WIDTH (o corredor exato do jogo) e profundidade
 * generosa (20 000) para nunca mostrar bordas enquanto os tiles se movem.
 * Ele permanece fixo em X/Z porque a câmera também é fixa — só os tiles rolam.
 *
 * Uso no arquivo principal:
 * ```js
 * // Carregue a textura de normal map UMA vez e passe aqui:
 * const waterNormals = new THREE.TextureLoader().load(
 *   '../assets/textures/NormalMapping/waternormals.jpg',
 *   (tex) => { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
 * );
 * const waterMesh = createWaterPlane(scene, waterNormals);
 * ```
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Texture} normalMapTexture - Normal map com RepeatWrapping já configurado.
 * @returns {THREE.Mesh} O mesh de água (guarde para passar a updateWater).
 */
export function createWaterPlane(scene, normalMapTexture) {
  const geometry = new THREE.PlaneGeometry(
    TILE_WIDTH,  // largura: mesma do corredor do terreno
    20000,       // profundidade: longa o suficiente para cobrir qualquer posição de tile
    32,          // segmentos X: resolução suficiente para a ondulação geométrica
    128          // segmentos Z: mais denso no eixo de rolagem para ondas visíveis
  );

  const material = createWaterMaterial(normalMapTexture);

  const waterMesh = new THREE.Mesh(geometry, material);

  // Rotaciona o plano para ficar horizontal (PlaneGeometry está em XY por padrão).
  waterMesh.rotation.x = -Math.PI / 2;

  // Posiciona exatamente no nível da água — ligeiramente acima para evitar z-fighting
  // com vértices do terreno que podem estar exatamente em WATER_LEVEL.
  waterMesh.position.y = WATER_LEVEL + 0.3;

  // Centralizado em X/Z: a câmera é fixa, o plano não precisa se mover.
  waterMesh.position.x = 0;
  waterMesh.position.z = 0;

  waterMesh.receiveShadow = false; // água não precisa de sombra projetada
  waterMesh.userData.isWater = true;

  scene.add(waterMesh);
  return waterMesh;
}

// ---------------------------------------------------------------------------
// Semente do ruído — terreno igual a cada execução
// ---------------------------------------------------------------------------

const TERRAIN_SEED = Math.random() * 65536;
if (globalThis.noise && typeof globalThis.noise.seed === "function") {
  globalThis.noise.seed(TERRAIN_SEED);
}

// ---------------------------------------------------------------------------
// Estado interno — dois tiles fixos, sem array crescente
// ---------------------------------------------------------------------------

/**
 * tileA e tileB são os dois tiles permanentes da cena.
 * A lógica de "frente/trás" é determinada dinamicamente pela posição Z,
 * não por índice fixo, o que elimina ambiguidade durante a reciclagem.
 */
let tileA = null;
let tileB = null;

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Cria os dois tiles iniciais e os adiciona à cena.
 *
 * @param {THREE.Scene} scene
 */
export function createWorldTiles(scene) {
  // Cria os dois tiles permanentes que serão reciclados durante o jogo.
  tileA = createTileGroup();
  tileB = createTileGroup();

  // Posiciona o primeiro tile na origem e o segundo logo atrás dele.
  tileA.position.set(0, 0, 0);
  tileA.userData.tileZ = 0;

  tileB.position.set(0, 0, TILE_DEPTH);
  tileB.userData.tileZ = 1;

  // Primeiro tile: sem costura (não há vizinho à frente).
  rebuildTerrain(tileA, null);
  // Segundo tile: costura com a borda traseira do primeiro.
  rebuildTerrain(tileB, tileA.userData.backEdgeHeights);

  // Adiciona os dois tiles à cena principal.
  scene.add(tileA);
  scene.add(tileB);
}

/**
 * Avança os tiles e recicla o que saiu pela frente da câmera.
 *
 * Garantia contra gap/overlap:
 *   - Identifica explicitamente qual tile está à frente (maior Z) e qual está atrás.
 *   - O tile reciclado recebe `frontTile.position.z + TILE_DEPTH` — posição absoluta,
 *     calculada depois que ambos os tiles já foram movidos neste frame.
 *   - O threshold é conservador (−TILE_DEPTH * 0.5) para que a reciclagem ocorra
 *     bem antes do tile sair completamente da tela, com margem para gameSpeed 3×.
 *
 * @param {number} delta - Segundos desde o último frame (já multiplicado por gameSpeed).
 */
export function updateTiles(delta) {
  // Calcula o deslocamento total deste frame.
  const move = TILE_SCROLL_SPEED * delta;

  // Move os dois tiles para trás, simulando o avanço do jogador.
  tileA.position.z -= move;
  tileB.position.z -= move;

  // Identifica qual tile está mais perto da câmera e qual está mais distante.
  const frontTile =
    tileA.position.z >= tileB.position.z ? tileA : tileB;
  const backTile =
    tileA.position.z < tileB.position.z ? tileA : tileB;

  // Define o limite em que o tile de trás já pode ser reaproveitado sem aparecer gap.
  const recycleThreshold = -TILE_DEPTH * 0.5;

  if (backTile.position.z < recycleThreshold) {
    // Coloca o tile reciclado exatamente após o tile da frente.
    backTile.position.z = frontTile.position.z + TILE_DEPTH;
    backTile.userData.tileZ += 2;

    // Reconstrói o terreno usando a borda traseira do tile da frente como costura.
    rebuildTerrain(backTile, frontTile.userData.backEdgeHeights);
  }
}

// ---------------------------------------------------------------------------
// Criação e reconstrução de terreno
// ---------------------------------------------------------------------------

/** Cria um Group vazio com os campos userData necessários. */
function createTileGroup() {
  const group = new THREE.Group();
  group.userData = {
    tileZ: null,
    terrain: null,
    backEdgeHeights: null,
    heightMatrix: null,
  };
  return group;
}

// ---------------------------------------------------------------------------
// Geração de heightmap com fbm (fractal Brownian motion)
// ---------------------------------------------------------------------------
//
// As funções abaixo eram declaradas dentro de rebuildTerrain() e portanto
// recriadas (novas closures) a cada reciclagem de tile. Nenhuma delas captura
// variáveis locais de rebuildTerrain — todas recebem tudo via parâmetro — então
// foram içadas para o escopo do módulo: mesmo comportamento, sem realocar
// closures a cada troca de tile.

/**
 * Retorna uma função de heightmap para o THREE.Terrain.
 *
 * Variedade entre tiles:
 *   Cada tileZ diferente amostra uma fatia diferente do espaço de ruído contínuo.
 *   `offsetZ = tileZ * TILE_SEGMENTS` garante que tiles consecutivos nunca
 *   repitam a mesma região — o ruído é contínuo e infinito nessa direção.
 *
 * Costura:
 *   Quando `frontEdgeHeights` é fornecido, a linha j=0 (borda frontal) é
 *   forçada aos valores do tile vizinho, e a linha j=1 é suavizada com
 *   média ponderada para evitar descontinuidade visual.
 *
 * @param {number} tileZ
 * @param {Float32Array|null} frontEdgeHeights
 * @param {number} cols
 * @returns {Function}
 */
function buildFbmHeightmap(tileZ, frontEdgeHeights, cols) {
  // Desloca a amostragem ao longo do eixo Z para que cada tile pegue uma fatia diferente do ruído.
  const offsetZ = tileZ * TILE_SEGMENTS;

  // Retorna uma função que o construtor de terreno vai chamar para preencher as alturas.
  return function perlinHeightmap(g, options) {
    // Se o ruído ainda não estiver disponível, sai sem alterar os valores.
    if (!globalThis.noise || typeof globalThis.noise.perlin !== "function") return;

    // Calcula a quantidade de vértices em cada eixo da grade.
    const xl = options.xSegments + 1;
    const yl = options.ySegments + 1;

    // Preenche cada vértice com uma altura baseada em fbm.
    // Passo 1: preenche toda a grade com ruído fbm
    for (let i = 0; i < xl; i++) {
      for (let j = 0; j < yl; j++) {
        g[j * xl + i] += fbm(i, j + offsetZ, options);
      }
    }

    // Se houver costura anterior, força a primeira linha a casar com ela.
    // Passo 2: costura da borda frontal (j=0)
    if (frontEdgeHeights && frontEdgeHeights.length === xl) {
      for (let i = 0; i < xl; i++) {
        // Usa o valor exato da borda anterior na linha de junção.
        const seamHeight = frontEdgeHeights[i];
        // Mantém também uma amostra da linha seguinte para suavizar a transição.
        const generatedHeight = g[1 * xl + i];

        g[0 * xl + i] = seamHeight;                               // linha de costura exata
        g[1 * xl + i] = seamHeight * 0.5 + generatedHeight * 0.5; // suavização da transição
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Utilidades de borda (seam stitching)
// ---------------------------------------------------------------------------

/**
 * Captura as alturas da última linha de vértices (borda traseira, Z máximo).
 * O tile seguinte usará esses valores para costurar sua borda frontal.
 *
 * @param {THREE.Group} terrainGroup
 * @param {number} cols
 * @returns {Float32Array}
 */
function extractBackEdge(terrainGroup, cols) {
  // Pega a malha principal do terreno gerado.
  const mesh = terrainGroup.children[0];
  if (!mesh) return null;

  // Lê as posições para capturar a última linha de vértices.
  const positions = mesh.geometry.attributes.position;
  // Última linha da grade, correspondente à borda traseira do tile.
  const lastRow = TILE_SEGMENTS; // última linha: índice = TILE_SEGMENTS
  // Array com as alturas que serão usadas na costura do próximo tile.
  const heights = new Float32Array(cols);

  // Copia as alturas da borda traseira para o array de retorno.
  for (let i = 0; i < cols; i++) {
    heights[i] = positions.getZ(lastRow * cols + i);
  }

  return heights;
}

// ---------------------------------------------------------------------------
// Plantio de árvores
// ---------------------------------------------------------------------------

// Constantes reaproveitadas em toda amostragem/plantio — içadas para fora do
// loop quente (eram recriadas a cada rebuildTerrain/candidata antes).
const TREE_LOCAL_UP = new THREE.Vector3(0, 0, 1);
const TREE_WORLD_UP = new THREE.Vector3(0, 1, 0);
const TERRAIN_ROTATION_AXIS = new THREE.Vector3(1, 0, 0);
const TREE_MAX_SLOPE_COS = Math.cos(THREE.MathUtils.degToRad(TREE_MAX_SLOPE_DEG));

// Tamanho do balde do hash espacial usado para o teste de distância mínima
// entre árvores — igual a TREE_MIN_DIST, o que garante que qualquer ponto a
// menos de TREE_MIN_DIST de distância cai no mesmo balde ou em um vizinho
// imediato (grade uniforme com célula >= raio de busca é uma técnica padrão
// de spatial hashing para busca de vizinhos por raio fixo).
const TREE_BUCKET_SIZE = TREE_MIN_DIST;

function treeBucketKey(cx, cz) {
  return cx + "," + cz;
}

/**
 * Converte uma posição normalizada (u, v) nos índices/frações de célula da
 * grade do terreno, usados tanto pela amostragem de altura quanto de normal.
 *
 * @param {number} u
 * @param {number} v
 * @returns {{x0: number, z0: number, x1: number, z1: number, tx: number, tz: number}}
 */
function terrainGridCoords(u, v) {
  const fx = Math.min(u * TILE_SEGMENTS, TILE_SEGMENTS - 0.001);
  const fz = Math.min(v * TILE_SEGMENTS, TILE_SEGMENTS - 0.001);
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  return { x0, z0, x1: x0 + 1, z1: z0 + 1, tx: fx - x0, tz: fz - z0 };
}

/**
 * Interpola só a altura no ponto amostrado — mais barato que amostrar altura
 * e normal juntas, e usado como filtro rápido antes do cálculo de normal
 * (que precisa de vetores) em plantTrees.
 *
 * @param {THREE.BufferAttribute} positions
 * @param {{x0: number, z0: number, x1: number, z1: number, tx: number, tz: number}} coords
 * @param {number} cols
 * @returns {number}
 */
function sampleTerrainHeight(positions, coords, cols) {
  const { x0, z0, x1, z1, tx, tz } = coords;

  const h00 = positions.getZ(z0 * cols + x0);
  const h10 = positions.getZ(z0 * cols + x1);
  const h01 = positions.getZ(z1 * cols + x0);
  const h11 = positions.getZ(z1 * cols + x1);

  const height0 = h00 + (h10 - h00) * tx;
  const height1 = h01 + (h11 - h01) * tx;
  return height0 + (height1 - height0) * tz;
}

/**
 * Interpola a normal do terreno no ponto amostrado (mesma grade/frações de
 * sampleTerrainHeight). Soma os componentes ponderados diretamente em vez de
 * construir quatro THREE.Vector3 intermediários (n00..n11) — mesma matemática
 * bilinear de antes, sem as alocações extras.
 *
 * @param {THREE.BufferAttribute} normals
 * @param {{x0: number, z0: number, x1: number, z1: number, tx: number, tz: number}} coords
 * @param {number} cols
 * @returns {{localNormal: THREE.Vector3, worldNormal: THREE.Vector3}}
 */
function sampleTerrainNormal(normals, coords, cols) {
  const { x0, z0, x1, z1, tx, tz } = coords;
  const i00 = z0 * cols + x0;
  const i10 = z0 * cols + x1;
  const i01 = z1 * cols + x0;
  const i11 = z1 * cols + x1;

  const w00 = (1 - tx) * (1 - tz);
  const w10 = tx * (1 - tz);
  const w01 = (1 - tx) * tz;
  const w11 = tx * tz;

  const nx = normals.getX(i00) * w00 + normals.getX(i10) * w10 + normals.getX(i01) * w01 + normals.getX(i11) * w11;
  const ny = normals.getY(i00) * w00 + normals.getY(i10) * w10 + normals.getY(i01) * w01 + normals.getY(i11) * w11;
  const nz = normals.getZ(i00) * w00 + normals.getZ(i10) * w10 + normals.getZ(i01) * w01 + normals.getZ(i11) * w11;

  const localNormal = new THREE.Vector3(nx, ny, nz).normalize();
  // Converte a normal local do terreno para o espaço do mundo, considerando a rotação do plano.
  const worldNormal = localNormal.clone().applyAxisAngle(TERRAIN_ROTATION_AXIS, -Math.PI / 2).normalize();

  return { localNormal, worldNormal };
}

/**
 * Planta árvores no tile respeitando altura, inclinação e distância mínima.
 *
 * Distância mínima via spatial hashing: em vez de comparar cada candidata
 * contra todas as árvores já plantadas (O(n²), a fonte de um travamento
 * perceptível durante a reciclagem do tile), as árvores plantadas são
 * indexadas por balde de grade (TREE_BUCKET_SIZE = TREE_MIN_DIST) e cada
 * candidata só verifica os 9 baldes ao redor do seu — resultado idêntico ao
 * scan completo, pois nenhum ponto fora desses baldes pode estar a menos de
 * TREE_MIN_DIST de distância.
 *
 * @param {THREE.Group} tile
 * @param {THREE.BufferGeometry} geometry
 * @param {number} cols
 */
function plantTrees(tile, geometry, cols) {
  // Acessa os atributos de posição e normal do terreno para amostrar altura e inclinação.
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  // Sem esses atributos não dá para decidir onde plantar árvores.
  if (!positions || !normals) return;

  // Metade da largura e da profundidade do tile, usadas para converter coordenadas locais.
  const halfWidth = TILE_WIDTH / 2;
  const halfDepth = TILE_DEPTH / 2;
  // Tamanho de cada célula da grade de tentativa de plantio.
  const cellW = TILE_WIDTH / TREE_GRID_COLS;
  const cellD = TILE_DEPTH / TREE_GRID_ROWS;
  // Hash espacial das árvores já plantadas neste tile, por balde de grade.
  const treeBuckets = new Map();

  // Percorre a grade inteira do tile tentando plantar uma árvore em cada célula.
  for (let row = 0; row < TREE_GRID_ROWS; row++) {
    for (let col = 0; col < TREE_GRID_COLS; col++) {
      // Escolhe uma posição aleatória dentro da célula para quebrar o padrão visual.
      const localX = -halfWidth + (col + Math.random()) * cellW;
      const localZ = -halfDepth + (row + Math.random()) * cellD;
      // Converte a posição local em coordenadas normalizadas no intervalo [0, 1].
      const u = (localX + halfWidth) / TILE_WIDTH;
      const v = (localZ + halfDepth) / TILE_DEPTH;

      const coords = terrainGridCoords(u, v);

      // Filtro barato primeiro: só altura, sem tocar em normais/vetores.
      const height = sampleTerrainHeight(positions, coords, cols);
      // Rejeita pontos fora da faixa de altitude desejada para árvores.
      if (height < TREE_MIN_HEIGHT || height > TREE_MAX_HEIGHT) continue;

      // Só amostra a normal (mais cara) se a altura já passou no filtro.
      const { localNormal, worldNormal } = sampleTerrainNormal(normals, coords, cols);
      // Rejeita pontos cuja inclinação local seja maior que o permitido.
      if (localNormal.dot(TREE_LOCAL_UP) < TREE_MAX_SLOPE_COS) continue;

      // Verifica se a árvore nova ficaria perto demais de alguma árvore já colocada,
      // olhando só os baldes vizinhos (3x3) em vez de todas as árvores do tile.
      const bucketX = Math.floor(localX / TREE_BUCKET_SIZE);
      const bucketZ = Math.floor(localZ / TREE_BUCKET_SIZE);
      let tooClose = false;

      for (let dx = -1; dx <= 1 && !tooClose; dx++) {
        for (let dz = -1; dz <= 1 && !tooClose; dz++) {
          const bucket = treeBuckets.get(treeBucketKey(bucketX + dx, bucketZ + dz));
          if (!bucket) continue;

          for (const p of bucket) {
            // Diferença em X e Z entre a posição candidata e uma árvore anterior.
            const ddx = localX - p.x;
            const ddz = localZ - p.z;
            // Se a distância ao quadrado for menor que o mínimo permitido, rejeita a posição.
            if (ddx * ddx + ddz * ddz < TREE_MIN_DIST * TREE_MIN_DIST) {
              tooClose = true;
              break;
            }
          }
        }
      }
      // Se já existe árvore muito perto, não planta outra aqui.
      if (tooClose) continue;

      // Escolhe aleatoriamente um dos dois tipos de árvore disponíveis.
      const tipo = Math.random() < 0.5 ? 1 : 2;
      // Cria a árvore na origem; a posição real será ajustada logo abaixo.
      const object = criaArvore(tipo);
      // Adiciona a árvore como filha do tile para que ela acompanhe a reciclagem.
      tile.add(object);

      // Alinha a orientação da árvore com a normal do terreno.
      //object.quaternion.setFromUnitVectors(TREE_WORLD_UP, worldNormal);
      // Posiciona a árvore exatamente sobre o ponto amostrado do terreno.
      object.position.set(localX, height, localZ);
      // Levanta um pouco a base da árvore para evitar que ela afunde no chão.
      object.position.addScaledVector(worldNormal, TREE_BASE_OFFSET);
      // Marca o objeto para remoção quando o tile for reconstruído.
      object.userData.isTree = true;

      // Registra a posição ocupada no balde correspondente.
      let bucket = treeBuckets.get(treeBucketKey(bucketX, bucketZ));
      if (!bucket) {
        bucket = [];
        treeBuckets.set(treeBucketKey(bucketX, bucketZ), bucket);
      }
      bucket.push({ x: localX, z: localZ });
    }
  }
}

/**
 * Destrói o terreno e as árvores do tile e constrói tudo novo.
 * As árvores são filhas do tile (não da cena), então se movem com ele.
 *
 * @param {THREE.Group} tile
 * @param {Float32Array|null} frontEdgeHeights - Alturas a costurar na borda frontal.
 */
function rebuildTerrain(tile, frontEdgeHeights) {
  // Remove o terreno anterior antes de construir um novo.
  if (tile.userData.terrain) {
    tile.remove(tile.userData.terrain);
    tile.userData.terrain.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    tile.userData.terrain = null;
  }

  // Remove as árvores antigas, porque o tile será reconstruído com novos dados.
  const toRemove = tile.children.filter((c) => c.userData.isTree);
  for (const tree of toRemove) {
    tile.remove(tree);
    tree.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
  }

  // Gera um novo heightmap com base no índice lógico do tile e na costura anterior.
  const cols = TILE_SEGMENTS + 1;
  const heightmap = buildFbmHeightmap(
    tile.userData.tileZ,
    frontEdgeHeights,
    cols
  );
  tile.userData.heightMatrix = heightmap;

  const terrainGroup = Terrain({
    heightmap,
    material: terrainMaterial,
    xSize: TILE_WIDTH,
    ySize: TILE_DEPTH,
    xSegments: TILE_SEGMENTS,
    ySegments: TILE_SEGMENTS,
    maxHeight: MAX_HEIGHT,
    minHeight: MIN_HEIGHT,
    frequency: MOUNTAIN_FREQUENCY,
  });

  // Planta árvores sobre a malha gerada.
  plantTrees(tile, terrainGroup.children[0].geometry, cols);

  // Captura a borda traseira para costurar o próximo tile quando ele for criado.
  tile.userData.backEdgeHeights = extractBackEdge(terrainGroup, cols);

  // Anexa o terreno final ao tile e registra a referência.
  tile.add(terrainGroup);
  tile.userData.terrain = terrainGroup;
}
