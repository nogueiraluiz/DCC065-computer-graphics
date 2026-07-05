// CollisionManager.js
import * as THREE from "three";

export class CollisionManager {
  constructor(type, onCollisionCallback = null, uiCallbacks = {}) {
    this.type = type;
    this.onCollisionCallback = onCollisionCallback;
    this.uiCallbacks = uiCallbacks;

    if (globalThis._gameStats === undefined) {
      globalThis._gameStats = { enemy: 0, player: 0 };
    }
  }

  _registerHit(target) {
    if (this.type === "enemy") {
      // IMPORTANTE: Removeu o "target.life = 0" daqui de dentro!
      // A vida agora é controlada estritamente pelo dano do laser.

      globalThis._gameStats.enemy =
        globalThis._estadoGlobalDoJogo.inimigosAbatidosContador;
      this.uiCallbacks.updateScore?.(globalThis._gameStats.enemy);
    }

    if (this.type === "player") {
      globalThis._estadoGlobalDoJogo.tirosTomadosPeloAviao += 1;
      globalThis._gameStats.player =
        globalThis._estadoGlobalDoJogo.tirosTomadosPeloAviao;
      this.uiCallbacks.updateLife?.(globalThis._gameStats.player);
    }

    if (this.onCollisionCallback) {
      this.onCollisionCallback(target, {
        score: globalThis._gameStats.enemy,
        life: globalThis._gameStats.player,
      });
    }

    this.uiCallbacks.updateSaldo?.(
      globalThis._gameStats.enemy,
      globalThis._gameStats.player,
    );
  }

  checkLaserAgainstTargets(
    activeLasers,
    targets,
    laserPool,
    camera = null,
    scene = null,
  ) {
    if (!activeLasers || !targets) return;

    for (let i = activeLasers.length - 1; i >= 0; i--) {
      let laser = activeLasers[i];
      if (!laser?.active) continue;

      for (const element of targets) {
        let target = element;
        if (!target) continue;

        const descobreMesh = target.mesh ? target.mesh : target;
        const boundingBox = this.getBoundingBox(target);

        const estaAtivo = target.ativo === undefined ? true : target.ativo;
        const estaCaindo = target.caindo === undefined ? false : target.caindo;

        if (!estaAtivo || estaCaindo) continue;

        if (laser.bb && boundingBox && laser.bb.intersectsBox(boundingBox)) {
          if (camera && scene?.fog && descobreMesh) {
            const distanciaAteCamera = descobreMesh.position.distanceTo(
              camera.position,
            );

            if (distanciaAteCamera > scene.fog.far) {
              continue;
            }
          }

          // === SISTEMA DE DANO SELETIVO ===
          if (target.isBoss) {
            // Se for o Boss, tira 10 de HP por tiro (Como ele tem 200 HP, precisará de 20 tiros)
            target.life -= 10;
          } else {
            // Se for um minion normal, zera a vida dele imediatamente (morre com 1 tiro)
            target.life = 0;
            if (descobreMesh.life !== undefined) descobreMesh.life = 0;
          }

          this._registerHit(target);
          laserPool.despawn(laser, i);
          break;
        }
      }
    }
  }

  getBoundingBox(target) {
    if (target.bb) {
      return target.bb;
    }
    if (target.geometry) {
      return target.geometry;
    }
    let obj = new THREE.Box3().setFromObject(target);
    if (obj) {
      return obj;
    }
    return null;
  }
}
