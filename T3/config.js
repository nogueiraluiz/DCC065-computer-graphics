/**
 * @file Centraliza os parâmetros de balanceamento, design, física, câmera e cenário do jogo.
 */

const VELOCIDADE_PADRAO = 0.8;
globalThis._estadoGlobalDoJogo = {
  tirosTomadosPeloAviao: 0,
  inimigosAbatidosContador: 0,
  bossAtivo: false, // Sinaliza se a batalha contra o Boss começou
  jogoVencido: false, // Bloqueia e trava as lógicas na vitória
};

export const CONFIG = {
  // === CONFIGURAÇÕES DO BOSS FINAL ===
  boss: {
    bossVida: 200,
    gatilhoAbates: 5,
    // Alteração 1: Aumentado de 400 para 480 para ele recuar mais para trás em Z
    posicaoZCombateBoss: 400,
    multiplicadores: {
      alien: {
        escalaBoss: 35,
        // Alteração 3: Reduzido de 9 para 7 para os minions ficarem levemente menores
        escalaMinion: 7,
      },
      ovni: {
        escalaBoss: 0.35,
        // Alteração 3: Reduzido de 0.08 para 0.06 para os minions ficarem levemente menores
        escalaMinion: 0.06,
      },
    },
  },

  // === CONFIGURAÇÕES DOS INIMIGOS REGULARES ===
  inimigos: {
    velocidadePerseguicao: 2,
    velocidadeZigueZague: 1.4,
    intervaloTiro: 1,
    delayPrimeiroTiro: -1.5,
    posicaoZCombate: 120, // Requisito 4: Posição e distância regulamentar de combate
    distanciaSpawnZ: 1000,
    gravidadeQueda: 300,
  },

  // === CONFIGURAÇÕES DO SISTEMA DE LASERS ===
  lasers: {
    velocidadeJogador: 4,
    velocidadeInimigo: 2,
    cadenciaJogador: 0.1,
    distanciaSumiçoPerto: -140,
  },

  // === CONFIGURAÇÕES DO INPUT / CONTROLES ===
  input: {
    smoothFactorXY: 4.5,
    planeBaseY: 105,
    boundsX: 65,
    boundsY: 25,
  },

  // === CONFIGURAÇÕES DA CÂMERA ===
  camera: {
    offsetZ: -95,
    offsetY: 0,
    lookAhead: 200,
    rollFactor: 0.005,
    xyTimeConstant: 1,
    multiplicadorBalançoX: 0.07,
    multiplicadorBalançoY: 0.07,
  },

  cenario: {
    tiles: {
      tamanho: 2000,
      segmentos: 63,
      velocidadeRolagem: 50,
      alturaMaxima: 100,
      alturaMinima: -20,
      sementeRuido: 1337,
    },
    arvores: {
      gradesColunas: 20,
      gradesLinhas: 20,
      distanciaMinima: 50,
      alturaMinimaNascimento: -10,
      alturaMaximaNascimento: 50,
    },
  },

  armas: {
    limiteTiros: 20,
  },

  itens: {
    distanciaAtracao: 120,
    distanciaColeta: 8,
    velocidadeAtracao: 8.5,
    porcentagemCura: 25,
  },

  modos: {
    tempoModoEspecial: 10,
    tempoTransicaoOnda: 5,
    velocidadeJogoPadrao: VELOCIDADE_PADRAO,
    velocidadeTecla1: VELOCIDADE_PADRAO,
    velocidadeTecla2: 1.2 * VELOCIDADE_PADRAO,
    velocidadeTecla3: 2 * VELOCIDADE_PADRAO,
  },

  DISABLE_START_MENU: false,
};
