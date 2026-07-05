/**
 * @file Material TSL (Three.js Shading Language) do terreno procedural.
 *
 * Substitui a antiga coloração por vértice (CPU) por um único MeshStandardNodeMaterial
 * que roda inteiramente na GPU e faz duas coisas:
 *
 *   1. Procedural Material Blending: mistura texturas de areia/grama/rocha (mais
 *      neve procedural, sem asset de imagem) com base na altura e na inclinação
 *      do terreno, com ruído para deformar as bordas das faixas e evitar o
 *      efeito de "curva de nível" perfeitamente horizontal.
 *
 *   2. Água embutida no mesmo shader: nas regiões abaixo de WATER_LEVEL, o
 *      próprio shader achata o vértice (no espaço local, eixo Z — ver nota
 *      abaixo) até um plano de água, anima uma ondulação com ruído e recalcula
 *      a normal daquele plano por diferença central, dando o efeito de água
 *      sem precisar de um mesh de água separado.
 *
 * Nota sobre eixos: a geometria do terreno é um PlaneGeometry cuja altura é
 * escrita em `positions.setZ()` (tiles.js) ANTES do grupo raiz ser rotacionado
 * -90° em X. Ou seja: a altura "crua" de cada vértice vive em `positionLocal.z`,
 * e não em `positionLocal.y`/`positionWorld.y`. Como a rotação é de exatamente
 * -90° em X e as tiles nunca têm offset em Y, `positionLocal.z` já é numericamente
 * igual à altura em mundo — por isso a lógica de altura abaixo lê sempre esse
 * valor cru (guardado como varying) e nunca depende de `positionWorld.y` já
 * deslocado pela água, evitando qualquer dependência circular entre a máscara
 * de água e a própria geometria que ela desloca.
 *
 * Nota sobre tiling: os tiles do terreno se movem (translação em Z) para criar
 * a ilusão de que o avião avança. Texturas/ruído amostrados por `positionWorld`
 * ficam "grudados" no espaço do mundo em vez de na malha — como a malha desliza
 * por baixo, o padrão parece "deslizar" (fica visualmente preso ao referencial
 * da câmera/avião, que é o que fica parado). Por isso todo o tiling de textura
 * e ruído aqui usa `positionLocal.xy` (invariante ao transform do objeto): o
 * padrão fica preso à geometria e se move junto com o terreno, como deveria.
 */

import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  positionLocal,
  normalWorld,
  normalView,
  positionViewDirection,
  varying,
  mx_noise_float,
  remapClamp,
  smoothstep,
  mix,
  clamp,
  dot,
  pow,
  vec2,
  vec3,
  float,
  time,
  transformNormalToView,
  texture,
} from "three/tsl";

// ---------------------------------------------------------------------------
// Texturas de terreno (tiling em espaço LOCAL da malha — preso à geometria,
// não ao mundo, para não deslizar conforme o tile se move).
// ---------------------------------------------------------------------------

const textureLoader = new THREE.TextureLoader();

function loadTiledColorTexture(path) {
  const tex = textureLoader.load(path);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sandTexture = loadTiledColorTexture("../assets/textures/sand.jpg");
const grassTexture = loadTiledColorTexture("../assets/textures/grass.jpg");
const rockTexture = loadTiledColorTexture("../assets/textures/granite.png");

// Frequência de repetição de cada textura no espaço local da malha (ciclos/unidade).
const SAND_SCALE = 0.05;
const GRASS_SCALE = 0.045;
const ROCK_SCALE = 0.035;

// ---------------------------------------------------------------------------
// Água
// ---------------------------------------------------------------------------

const WATER_COLOR_SHALLOW = vec3(0.16, 0.5, 0.52);
const WATER_COLOR_DEEP = vec3(0.02, 0.1, 0.18);

const WAVE_FREQ_A = 0.05;
const WAVE_FREQ_B = 0.11;
const WAVE_SPEED_A = 0.35;
const WAVE_SPEED_B = -0.5;
const WAVE_AMPLITUDE = 0.5;
const NORMAL_SAMPLE_EPS = 0.6;

/** Altura da ondulação da água (soma de dois ruídos deslocados no tempo). */
function waveHeight(xz) {
  const a = mx_noise_float(xz.mul(WAVE_FREQ_A).add(vec2(time.mul(WAVE_SPEED_A), 0.0)), 1, 0);
  const b = mx_noise_float(xz.mul(WAVE_FREQ_B).add(vec2(0.0, time.mul(WAVE_SPEED_B))), 1, 0);
  return a.add(b).mul(WAVE_AMPLITUDE * 0.5);
}

/** Normal do plano de água reconstruída por diferença central do campo de ondulação. */
function waterNormalFromHeightfield(xz) {
  const eps = NORMAL_SAMPLE_EPS;
  const hL = waveHeight(xz.add(vec2(eps, 0.0)));
  const hR = waveHeight(xz.sub(vec2(eps, 0.0)));
  const hD = waveHeight(xz.add(vec2(0.0, eps)));
  const hU = waveHeight(xz.sub(vec2(0.0, eps)));
  return vec3(hL.sub(hR), eps * 2.0, hD.sub(hU)).normalize();
}

/**
 * Cria o material do terreno e calcula o nível de água a partir do range de
 * altura do relevo (mesmas constantes usadas na geração procedural em tiles.js).
 *
 * @param {number} minHeight
 * @param {number} maxHeight
 * @returns {{ material: THREE.Material, waterLevel: number }}
 */
export function createTerrainMaterial(minHeight, maxHeight) {
  const range = maxHeight - minHeight;
  // Frações calibradas empiricamente a partir da distribuição real do fbm
  // usado em tiles.js (5 octaves, lacunarity=1 => equivalente a um único
  // Perlin normalizado): sobre ~164k amostras simuladas, a altura nunca chega
  // nem perto dos extremos minHeight/maxHeight (min observado -14.6, máx 73.9,
  // mediana em 30). Usar frações "ingênuas" perto de 0 ou 1 (como 0.12/0.82)
  // cai fora do range realmente produzido — por isso nunca aparecia água nem
  // neve. As frações abaixo foram escolhidas a partir dos percentis reais.
  const waterLevel = minHeight + range * 0.28; // ~p6-7: fundo dos vales vira lago
  const waterEdgeBand = range * 0.015;

  // Altura crua do vértice (antes de qualquer achatamento pela água), usada
  // tanto no vertex quanto no fragment shader.
  const rawHeightLocal = positionLocal.z;
  const rawHeight = varying(rawHeightLocal, "vRawTerrainHeight");
  // Coordenada de tiling presa à geometria (ver nota de eixos no topo do arquivo).
  const surfaceXZ = vec2(positionLocal.x, positionLocal.y);

  // -------------------------------------------------------------------------
  // Blend de materiais por altura + inclinação, com ruído para quebrar bandas
  // -------------------------------------------------------------------------
  const heightT = remapClamp(rawHeight, minHeight, maxHeight, 0.0, 1.0);
  const warp = mx_noise_float(surfaceXZ.mul(0.008), 1, 0).mul(0.06);
  const warpedT = clamp(heightT.add(warp), 0.0, 1.0);

  // Transição mais estreita (menos "blend") = faixas mais nítidas entre
  // materiais, o que ajuda a distinguir onde uma termina e a outra começa.
  const BLEND = 0.05;
  const SAND_TOP = 0.33;  // ~p20: praia logo acima da água
  const GRASS_TOP = 0.7; // ~p65: grama domina a faixa média
  const ROCK_TOP = 0.75;  // ~p93: neve só nos picos mais altos

  // Tingimento multiplicativo por cima das texturas: as fotos originais de
  // areia/pedra/neve têm luminância parecida (todas claras/acinzentadas), o
  // que dificultava distinguir uma da outra. Cada tinta empurra a cor final
  // para uma faixa de tom/luminância própria e bem separada das vizinhas.
  const SAND_TINT = vec3(1.15, 0.85, 0.5);  // amarelo/laranja quente
  const ROCK_TINT = vec3(0.5, 0.48, 0.46);  // cinza-pedra escurecido
  const SNOW_TINT = vec3(1.05, 1.05, 1.1);  // branco-azulado bem claro

  const sandColor = texture(sandTexture, surfaceXZ.mul(SAND_SCALE)).rgb.mul(SAND_TINT);
  const grassColor = texture(grassTexture, surfaceXZ.mul(GRASS_SCALE)).rgb;
  const rockColor = texture(rockTexture, surfaceXZ.mul(ROCK_SCALE)).rgb.mul(ROCK_TINT);
  const snowNoise = mx_noise_float(surfaceXZ.mul(0.15), 1, 0);
  const snowColor = vec3(0.92, 0.95, 1.0).add(snowNoise.mul(0.04)).mul(SNOW_TINT);

  let landColor = mix(sandColor, grassColor, smoothstep(SAND_TOP - BLEND, SAND_TOP + BLEND, warpedT));
  landColor = mix(landColor, rockColor, smoothstep(GRASS_TOP - BLEND, GRASS_TOP + BLEND, warpedT));
  landColor = mix(landColor, snowColor, smoothstep(ROCK_TOP - BLEND, ROCK_TOP + BLEND, warpedT));

  // Encostas íngremes viram rocha nua, independente da altura.
  const slope = clamp(normalWorld.y.oneMinus(), 0.0, 1.0);
  const slopeRock = smoothstep(0.25, 0.55, slope);
  landColor = mix(landColor, rockColor, slopeRock);

  // -------------------------------------------------------------------------
  // Máscara de água (1 = submerso, 0 = seco), com transição suave na margem
  // -------------------------------------------------------------------------
  const dryness = smoothstep(waterLevel - waterEdgeBand, waterLevel + waterEdgeBand, rawHeight);
  const isWater = dryness.oneMinus();
  const isWaterVertex = smoothstep(waterLevel - waterEdgeBand, waterLevel + waterEdgeBand, rawHeightLocal).oneMinus();

  // -------------------------------------------------------------------------
  // Deslocamento de vértice: achata os vales alagados até WATER_LEVEL e
  // aplica a ondulação animada só onde há água.
  // -------------------------------------------------------------------------
  const flatLocalZ = float(waterLevel).max(rawHeightLocal).add(waveHeight(surfaceXZ).mul(isWaterVertex));
  const displacedLocalZ = mix(rawHeightLocal, flatLocalZ, isWaterVertex);

  const material = new MeshStandardNodeMaterial();
  material.positionNode = vec3(positionLocal.x, positionLocal.y, displacedLocalZ);

  // -------------------------------------------------------------------------
  // Cor, normal e rugosidade finais: mistura terreno seco com água animada
  // -------------------------------------------------------------------------
  const depthT = clamp(float(waterLevel).sub(rawHeight).div(waterLevel - minHeight), 0.0, 1.0);
  const waterBaseColor = mix(WATER_COLOR_SHALLOW, WATER_COLOR_DEEP, depthT);

  const waterNormalWorld = waterNormalFromHeightfield(surfaceXZ);
  const waterNormalViewSpace = transformNormalToView(waterNormalWorld);
  const finalNormal = mix(normalView, waterNormalViewSpace, isWater);

  const fresnel = pow(clamp(dot(positionViewDirection, finalNormal).oneMinus(), 0.0, 1.0), 3.0);
  const waterColor = mix(waterBaseColor, vec3(1.0, 1.0, 1.0), fresnel.mul(0.4));

  material.colorNode = mix(landColor, waterColor, isWater);
  material.normalNode = finalNormal;
  material.roughnessNode = mix(float(0.95), float(0.15), isWater);
  material.metalness = 0.0;

  return { material, waterLevel };
}
