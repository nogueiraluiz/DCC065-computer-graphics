import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

// forceWebGL: true faz o renderer rodar sempre sobre o backend WebGL2,
// nunca sobre a API WebGPU de verdade. Isso mantém o mesmo requisito de
// hardware/navegador que o antigo THREE.WebGLRenderer já exigia — é só
// a classe que habilita materiais TSL (Node Materials) no three.js.
export async function startRenderer(color) {

    const renderer = new WebGPURenderer({ antialias: true, forceWebGL: true });
    await renderer.init();

    renderer.setClearColor(color);

    renderer.shadowMap.enabled = true;
    renderer.shadowMapSoft = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById("webgl-output").appendChild(renderer.domElement);

    return renderer;
}