import * as THREE from "three";
import { OrbitControls } from "../../build/jsm/controls/OrbitControls.js";
import {
  initRenderer,
  initCamera,
  initDefaultBasicLight,
  setDefaultMaterial,
  InfoBox,
  onWindowResize,
  createGroundPlaneXZ,
} from "../../libs/util/util.js";
import { carregarHelloKitty } from "./healthpackHK.js";
import { BoxGeometry } from "../../build/three.core.js";

let scene, renderer, camera, material, light, orbit; // Initial variables
scene = new THREE.Scene(); // Create main scene
renderer = initRenderer(); // Init a basic renderer
material = setDefaultMaterial(); // create a basic material
light = initDefaultBasicLight(scene); // Create a basic light to illuminate the scene
camera = initCamera(new THREE.Vector3(0, 15, 30)); // Init camera in this position
scene.add(camera); // Add camera to the scene
orbit = new OrbitControls(camera, renderer.domElement); // Enable mouse rotation, pan, zoom etc.

// Listen window size changes
window.addEventListener(
  "resize",
  function () {
    onWindowResize(camera, renderer);
  },
  false,
);

// Show axes (parameter is size of each axis)
let axesHelper = new THREE.AxesHelper(12);
scene.add(axesHelper);

// create the ground plane
let plane = createGroundPlaneXZ(20, 20);
scene.add(plane);

// === CORREÇÃO DO CARREGAMENTO ASSÍNCRONO ===
let corpo = null; // Inicializa como nulo

carregarHelloKitty().then((mesh) => {
  corpo = mesh;
  // fiquem apoiadas exatamente em cima do seu plano cinza, em vez de afundadas
  corpo.position.set(0, 3.0, 0);

  scene.add(corpo); // Adiciona a Hello Kitty na cena após carregar em pé
});

render();

function render() {
  requestAnimationFrame(render);
  renderer.render(scene, camera); // Render scene
}
