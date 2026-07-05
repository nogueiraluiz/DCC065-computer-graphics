import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

// WebGPURenderer roda em WebGPU quando disponível e cai para WebGL2 automaticamente
// nos demais navegadores. É o renderer exigido pelos materiais/shaders escritos em TSL.
export async function startRenderer(color) {

    const renderer = new WebGPURenderer({ antialias: true });

    renderer.setClearColor(color);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById("webgl-output").appendChild(renderer.domElement);

    await renderer.init();

    return renderer;
}
