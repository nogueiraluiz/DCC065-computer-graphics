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
      globalThis._estadoGlobalDoJogo.inimigosAbatidosContador += 1;
      globalThis._gameStats.enemy =
        globalThis._estadoGlobalDoJogo.inimigosAbatidosContador;
      this.uiCallbacks.updateScore?.(globalThis._gameStats.enemy);
      if (target) {
        target.life = 0;
      }
    }

    if (this.type === "player") {
      // CONSISTÊNCIA GLOBAL: Soma o dano diretamente na variável do config centralizado
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

          if (typeof target.takeDamage === "function") {
            target.takeDamage(10);
          } else if (
            descobreMesh.userData &&
            typeof descobreMesh.userData.takeDamage === "function"
          ) {
            descobreMesh.userData.takeDamage(10);
          } else {
            if (target.life !== undefined) target.life -= 50;
            if (descobreMesh.life !== undefined) descobreMesh.life -= 50;
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
