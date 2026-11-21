import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface ArchitecturalSculptureSceneProps {
  reducedMotion?: boolean;
  onReady?: () => void;
}

function detectSoftwareWebGL(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(renderer)) {
        return true;
      }
    }
  } catch {
    // Ignore extension query errors
  }
  return false;
}

function createArchitecturalFloorTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#151210';
    ctx.fillRect(0, 0, size, size);

    // Subtle stone grain noise
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    let seed = 4219;
    for (let i = 0; i < data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      const noise = ((seed >>> 24) / 255 - 0.5) * 14;
      data[i] = Math.max(8, Math.min(48, 22 + noise));
      data[i + 1] = Math.max(7, Math.min(42, 18 + noise * 0.85));
      data[i + 2] = Math.max(6, Math.min(36, 16 + noise * 0.72));
      data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    // Subtle directional mineral striations
    ctx.strokeStyle = 'rgba(184, 109, 55, 0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y + ((y * 7) % 5));
      ctx.lineTo(size, y + ((y * 13) % 7));
      ctx.stroke();
    }

    // Architectural slab expansion joints
    ctx.strokeStyle = 'rgba(10, 8, 7, 0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();

    // Very faint bronze specular seam highlight
    ctx.strokeStyle = 'rgba(184, 109, 55, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2 + 1.5, 0);
    ctx.lineTo(size / 2 + 1.5, size);
    ctx.moveTo(0, size / 2 + 1.5);
    ctx.lineTo(size, size / 2 + 1.5);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 14);
  return texture;
}

function createHorizonShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    depthWrite: false,
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uCharcoal: { value: new THREE.Color('#12100F') },
      uBrown: { value: new THREE.Color('#382920') },
      uAmber: { value: new THREE.Color('#B86D37') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uPointer;
      uniform vec3 uCharcoal;
      uniform vec3 uBrown;
      uniform vec3 uAmber;
      varying vec2 vUv;

      void main() {
        // Vertical horizon glow rising cleanly from floor seam
        float horizonBand = smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.14, 0.56, vUv.y));
        float upperFalloff = smoothstep(0.08, 0.65, vUv.y);

        // Horizontal warm focal sweep behind the architectural monoliths
        float focalX = 0.56 + uPointer.x * 0.04 + sin(uTime * 0.25) * 0.025;
        float horizontalGlow = exp(-pow((vUv.x - focalX) * 2.15, 2.0));

        vec3 col = mix(uBrown * 0.65, uCharcoal, upperFalloff);
        col = mix(col, uBrown * 1.18, horizonBand * 0.72);
        col += uAmber * horizonBand * horizontalGlow * 0.54;

        // Subtle dark ground transition at very bottom
        float floorFade = smoothstep(0.0, 0.055, vUv.y);
        col = mix(uCharcoal * 0.9, col, floorFade);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createGlowSpriteTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0, 'rgba(232, 152, 86, 0.92)');
    grad.addColorStop(0.28, 'rgba(184, 109, 55, 0.45)');
    grad.addColorStop(0.65, 'rgba(92, 52, 24, 0.12)');
    grad.addColorStop(1, 'rgba(18, 16, 15, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function ArchitecturalSculptureScene({
  reducedMotion = false,
  onReady,
}: ArchitecturalSculptureSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const disposableGeometries: THREE.BufferGeometry[] = [];
    const disposableMaterials: THREE.Material[] = [];
    const disposableTextures: THREE.Texture[] = [];

    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      disposableGeometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      disposableMaterials.push(m);
      return m;
    };

    // Probe WebGL renderer capabilities cleanly
    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const probeGl =
        probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (probeGl) {
        isSoftwareGl = detectSoftwareWebGL(probeGl);
      }
    } catch {
      isSoftwareGl = false;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'pan-y';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#12100F');
    scene.fog = new THREE.FogExp2('#12100F', 0.048);

    // PMREM metallic & glass reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.85;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Camera with clean optical framing (right third on desktop, balanced on mobile)
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 80);
    const baseCameraPos = new THREE.Vector3(0.55, 2.38, 8.75);
    const targetPos = new THREE.Vector3(0, 2.24, 0);

    const applyResponsiveCameraFraming = (w: number, h: number) => {
      camera.aspect = w / Math.max(h, 1);
      if (w >= 1024) {
        camera.setViewOffset(w, h, -w * 0.19, h * 0.015, w, h);
        camera.fov = 34;
      } else {
        camera.setViewOffset(w, h, -w * 0.08, -h * 0.04, w, h);
        camera.fov = 44;
      }
      camera.updateProjectionMatrix();
    };
    applyResponsiveCameraFraming(width, height);
    camera.position.copy(baseCameraPos);

    // OrbitControls for drag-to-rotate around the sculpture's spine
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(targetPos);
    controls.enableDamping = true;
    controls.dampingFactor = 0.048;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.52;
    controls.minPolarAngle = 0.92;
    controls.maxPolarAngle = 1.5;
    controls.update();

    let isDragging = false;
    const onControlStart = () => {
      isDragging = true;
    };
    const onControlEnd = () => {
      isDragging = false;
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('end', onControlEnd);

    // =====================================================
    // 1. ARCHITECTURAL ENVIRONMENT
    // =====================================================
    const floorTex = createArchitecturalFloorTexture();
    floorTex.anisotropy = isSoftwareGl
      ? 1
      : Math.min(8, renderer.capabilities.getMaxAnisotropy());
    disposableTextures.push(floorTex);

    const floorMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: floorTex,
        color: '#17120F',
        roughness: 0.28,
        metalness: 0.34,
        envMapIntensity: 0.78,
      })
    );
    const floorMesh = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(58, 58)),
      floorMat
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Warm burnt-amber horizon backdrop plane
    const horizonMat = createHorizonShaderMaterial();
    disposableMaterials.push(horizonMat);
    const horizonPlane = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(60, 24)),
      horizonMat
    );
    horizonPlane.position.set(0, 7.2, -23.5);
    scene.add(horizonPlane);

    // Monumental architectural planes extending into deep perspective
    const monolithMatDark = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#14100E',
        roughness: 0.82,
        metalness: 0.14,
      })
    );
    const monolithMatEarth = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#211813',
        roughness: 0.72,
        metalness: 0.18,
      })
    );
    const bronzeTrimMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#C77A40',
        roughness: 0.22,
        metalness: 0.94,
      })
    );

    const architecturalSlabs: Array<{
      size: [number, number, number];
      pos: [number, number, number];
      rotY: number;
      mat: THREE.Material;
      edgeLine?: boolean;
    }> = [
      // Left monumental perspective planes
      { size: [0.6, 12.0, 7.2], pos: [-6.4, 6.0, -5.6], rotY: 0.14, mat: monolithMatDark, edgeLine: true },
      { size: [0.6, 13.0, 8.6], pos: [-8.6, 6.5, -13.0], rotY: 0.08, mat: monolithMatEarth },
      // Right monumental perspective planes
      { size: [0.6, 12.0, 7.0], pos: [5.9, 6.0, -4.8], rotY: -0.16, mat: monolithMatDark, edgeLine: true },
      { size: [0.65, 13.0, 9.0], pos: [8.0, 6.5, -12.6], rotY: -0.1, mat: monolithMatEarth, edgeLine: true },
      // Distant recessed portal columns framing the burnt-amber horizon
      { size: [3.4, 14.0, 0.8], pos: [-4.6, 7.0, -16.8], rotY: 0.18, mat: monolithMatDark },
      { size: [3.6, 14.0, 0.8], pos: [4.8, 7.0, -17.2], rotY: -0.16, mat: monolithMatEarth, edgeLine: true },
      // High architectural soffit plane creating deep gallery ceiling shadow
      { size: [26.0, 0.9, 3.2], pos: [0, 8.6, -11.5], rotY: 0, mat: monolithMatDark },
    ];

    architecturalSlabs.forEach((slab) => {
      const geo = trackGeo(new THREE.BoxGeometry(...slab.size));
      const mesh = new THREE.Mesh(geo, slab.mat);
      mesh.position.set(...slab.pos);
      mesh.rotation.y = slab.rotY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      if (slab.edgeLine) {
        const edgeGeo = trackGeo(new THREE.EdgesGeometry(geo));
        const edgeMat = trackMat(
          new THREE.LineBasicMaterial({
            color: '#B86D37',
            transparent: true,
            opacity: 0.13,
          })
        );
        const lines = new THREE.LineSegments(edgeGeo, edgeMat);
        lines.position.copy(mesh.position);
        lines.rotation.copy(mesh.rotation);
        scene.add(lines);
      }
    });

    // Subtle inlaid floor bronze perspective axis line
    const floorLineGeo = trackGeo(new THREE.BoxGeometry(0.016, 0.004, 24));
    const floorAxis = new THREE.Mesh(floorLineGeo, bronzeTrimMat);
    floorAxis.position.set(0, 0.002, -9.5);
    scene.add(floorAxis);

    // =====================================================
    // 2. TRANSLUCENT SMOKED-BRONZE GLASS SCULPTURE
    // =====================================================
    const sculptureRoot = new THREE.Group();
    sculptureRoot.position.set(0, 0, 0);
    scene.add(sculptureRoot);

    // Sub-part A: Grounded architectural stepped plinth (y = 0 .. 0.18)
    const plinthGroup = new THREE.Group();
    const baseStepGeo = trackGeo(new THREE.CylinderGeometry(1.12, 1.26, 0.09, 8));
    const baseStep = new THREE.Mesh(baseStepGeo, monolithMatEarth);
    baseStep.position.y = 0.045;
    baseStep.castShadow = true;
    baseStep.receiveShadow = true;
    plinthGroup.add(baseStep);

    const upperPlinthGeo = trackGeo(new THREE.CylinderGeometry(0.84, 0.94, 0.09, 8));
    const upperPlinth = new THREE.Mesh(upperPlinthGeo, monolithMatDark);
    upperPlinth.position.y = 0.135;
    upperPlinth.castShadow = true;
    upperPlinth.receiveShadow = true;
    plinthGroup.add(upperPlinth);

    const plinthRingGeo = trackGeo(new THREE.TorusGeometry(0.92, 0.009, 12, 64));
    const plinthRing = new THREE.Mesh(plinthRingGeo, bronzeTrimMat);
    plinthRing.rotation.x = Math.PI / 2;
    plinthRing.position.y = 0.182;
    plinthGroup.add(plinthRing);
    sculptureRoot.add(plinthGroup);

    // Sub-part B: Rotating crystal monolith assembly
    const crystalGroup = new THREE.Group();
    crystalGroup.position.y = 0.24;
    sculptureRoot.add(crystalGroup);

    // Smoked-bronze translucent architectural glass with crisp facet reflections
    const smokedGlassMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#4B3324'),
        attenuationColor: new THREE.Color('#B86D37'),
        attenuationDistance: 1.65,
        roughness: 0.12,
        metalness: 0.14,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        ior: 1.58,
        reflectivity: 1.0,
        envMapIntensity: 2.35,
        flatShading: true,
        transmission: isSoftwareGl ? 0 : 0.84,
        thickness: isSoftwareGl ? 0 : 1.75,
        transparent: true,
        opacity: isSoftwareGl ? 0.72 : 1.0,
        depthWrite: isSoftwareGl,
      })
    );

    // Faceted 8-sided tapered architectural spire (3 joined sections)
    const lowerPrismGeo = trackGeo(new THREE.CylinderGeometry(0.68, 0.34, 0.58, 8, 1));
    const lowerPrism = new THREE.Mesh(lowerPrismGeo, smokedGlassMat);
    lowerPrism.position.y = 0.35;
    lowerPrism.castShadow = true;
    crystalGroup.add(lowerPrism);

    const mainShaftGeo = trackGeo(new THREE.CylinderGeometry(0.41, 0.68, 2.75, 8, 1));
    const mainShaft = new THREE.Mesh(mainShaftGeo, smokedGlassMat);
    mainShaft.position.y = 2.015;
    mainShaft.castShadow = true;
    crystalGroup.add(mainShaft);

    const crownSpireGeo = trackGeo(new THREE.ConeGeometry(0.41, 0.88, 8, 1));
    const crownSpire = new THREE.Mesh(crownSpireGeo, smokedGlassMat);
    crownSpire.position.y = 3.83;
    crownSpire.castShadow = true;
    crystalGroup.add(crownSpire);

    // Sub-part C: Delicate bronze wireframe edge geometry on outer facets
    const wireframeMat = trackMat(
      new THREE.LineBasicMaterial({
        color: '#D58C52',
        transparent: true,
        opacity: 0.52,
      })
    );
    [
      { geo: lowerPrismGeo, y: 0.35 },
      { geo: mainShaftGeo, y: 2.015 },
      { geo: crownSpireGeo, y: 3.83 },
    ].forEach(({ geo, y }) => {
      const edges = trackGeo(new THREE.EdgesGeometry(geo, 1));
      const wire = new THREE.LineSegments(edges, wireframeMat);
      wire.position.y = y;
      crystalGroup.add(wire);
    });

    // Sub-part D: Delicate counter-rotated internal geometric lattice
    const innerLatticeMat = trackMat(
      new THREE.LineBasicMaterial({
        color: '#B86D37',
        transparent: true,
        opacity: 0.42,
      })
    );
    const latticeGeo = trackGeo(new THREE.OctahedronGeometry(0.42, 1));
    const latticeEdges = trackGeo(new THREE.EdgesGeometry(latticeGeo, 1));
    const innerLattice = new THREE.LineSegments(latticeEdges, innerLatticeMat);
    innerLattice.scale.set(0.74, 4.45, 0.74);
    innerLattice.position.y = 2.02;
    crystalGroup.add(innerLattice);

    // Sub-part E: Subtle amber internal illumination core + volumetric halo sprite
    const coreMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#8F4D21',
        emissive: new THREE.Color('#D17B39'),
        emissiveIntensity: 1.35,
        roughness: 0.2,
        metalness: 0.3,
        flatShading: true,
        transparent: true,
        opacity: 0.9,
      })
    );
    const coreShaftGeo = trackGeo(new THREE.CylinderGeometry(0.045, 0.11, 2.3, 6));
    const coreShaft = new THREE.Mesh(coreShaftGeo, coreMat);
    coreShaft.position.y = 2.02;
    crystalGroup.add(coreShaft);

    const coreTipGeo = trackGeo(new THREE.ConeGeometry(0.045, 0.45, 6));
    const coreTip = new THREE.Mesh(coreTipGeo, coreMat);
    coreTip.position.y = 3.39;
    crystalGroup.add(coreTip);

    const glowTex = createGlowSpriteTexture();
    disposableTextures.push(glowTex);
    const glowSpriteMat = trackMat(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: '#D88542',
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const coreHalo = new THREE.Sprite(glowSpriteMat);
    coreHalo.position.set(0, 2.15, 0);
    coreHalo.scale.set(2.1, 3.6, 1);
    crystalGroup.add(coreHalo);

    const innerLight = new THREE.PointLight('#D98340', 3.6, 8.2, 1.7);
    innerLight.position.set(0, 2.15, 0);
    crystalGroup.add(innerLight);

    // Warm ground pool reflection under the crystal plinth
    const groundGlowLight = new THREE.PointLight('#B86D37', 2.4, 5.2, 1.8);
    groundGlowLight.position.set(0, 0.55, 0.45);
    sculptureRoot.add(groundGlowLight);

    // Sub-part F: Fine metallic orbital rings
    const orbitalRig = new THREE.Group();
    orbitalRig.position.y = 2.25;
    sculptureRoot.add(orbitalRig);

    const ringSpecs = [
      { radius: 1.48, tube: 0.011, tiltX: 0.46, tiltZ: -0.32, speedY: 0.14, speedZ: 0.04 },
      { radius: 1.88, tube: 0.0085, tiltX: -0.58, tiltZ: 0.4, speedY: -0.1, speedZ: -0.03 },
      { radius: 2.28, tube: 0.007, tiltX: 0.22, tiltZ: 0.16, speedY: 0.07, speedZ: 0.02 },
    ];

    const orbitalMeshes: Array<{
      group: THREE.Group;
      speedY: number;
      speedZ: number;
      baseTiltX: number;
      baseTiltZ: number;
    }> = [];

    const ringNodeGeo = trackGeo(new THREE.OctahedronGeometry(0.032, 0));

    ringSpecs.forEach((spec, idx) => {
      const ringGroup = new THREE.Group();
      ringGroup.rotation.set(spec.tiltX, idx * 1.1, spec.tiltZ);

      const torusGeo = trackGeo(new THREE.TorusGeometry(spec.radius, spec.tube, 14, 128));
      const torus = new THREE.Mesh(torusGeo, bronzeTrimMat);
      torus.rotation.x = Math.PI / 2;
      ringGroup.add(torus);

      // Architectural bronze orbital node accent
      const node = new THREE.Mesh(ringNodeGeo, bronzeTrimMat);
      node.position.set(spec.radius, 0, 0);
      ringGroup.add(node);

      orbitalRig.add(ringGroup);
      orbitalMeshes.push({
        group: ringGroup,
        speedY: spec.speedY,
        speedZ: spec.speedZ,
        baseTiltX: spec.tiltX,
        baseTiltZ: spec.tiltZ,
      });
    });

    // =====================================================
    // 3. CINEMATIC LIGHTING & MOVING AMBER REFLECTIONS
    // =====================================================
    const hemiLight = new THREE.HemisphereLight('#4B3527', '#12100F', 0.62);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#F0CAA7', 2.45);
    keyLight.position.set(5.4, 7.6, 5.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 26;
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 8;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#B86D37', 1.9);
    rimLight.position.set(-4.8, 4.2, -7.5);
    scene.add(rimLight);

    // Dynamic moving amber accent light creating subtle warm reflections
    const movingAmberLight = new THREE.PointLight('#CC783B', 4.6, 12, 1.65);
    movingAmberLight.position.set(2.4, 1.8, -1.8);
    scene.add(movingAmberLight);

    // =====================================================
    // 4. POINTER PERSPECTIVE & RENDER LOOP
    // =====================================================
    const pointerTarget = new THREE.Vector2(0, 0);
    const pointerCurrent = new THREE.Vector2(0, 0);

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointerTarget.set(
        Math.max(-1, Math.min(1, nx)),
        Math.max(-1, Math.min(1, ny))
      );
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      applyResponsiveCameraFraming(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    let disposed = false;
    let rafId = 0;
    let timerId = 0;
    let elapsed = 0;
    let lastTime = performance.now();
    let readySignaled = false;

    const afterDraw = (next: () => void) => {
      if (!isSoftwareGl) {
        rafId = window.requestAnimationFrame(next);
        return;
      }
      const gl2 = renderer.getContext() as WebGL2RenderingContext;
      const fence = typeof gl2.fenceSync === 'function'
        ? gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0)
        : null;
      const poll = () => {
        if (disposed) return;
        if (fence && gl2.clientWaitSync(fence, 0, 0) === gl2.TIMEOUT_EXPIRED) {
          timerId = window.setTimeout(poll, 4);
          return;
        }
        if (fence) gl2.deleteSync(fence);
        timerId = window.setTimeout(next, 80);
      };
      poll();
    };

    const tick = () => {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (!reducedMotion) {
        elapsed += dt;

        // Smooth pointer parallax interpolation
        pointerCurrent.lerp(pointerTarget, 0.045);
        horizonMat.uniforms.uTime.value = elapsed;
        horizonMat.uniforms.uPointer.value.copy(pointerCurrent);

        // Slow crystal rotation & gentle sculptural float
        crystalGroup.rotation.y += dt * 0.14;
        innerLattice.rotation.y -= dt * 0.22;

        // Subtle internal amber light breathing
        innerLight.intensity = 3.1 + Math.sin(elapsed * 1.35) * 0.45;
        coreMat.emissiveIntensity = 1.45 + Math.sin(elapsed * 1.35) * 0.2;

        // Orbital ring precession
        orbitalMeshes.forEach((ring, index) => {
          ring.group.rotation.y += dt * ring.speedY;
          ring.group.rotation.x =
            ring.baseTiltX + Math.sin(elapsed * 0.45 + index) * 0.045;
          ring.group.rotation.z =
            ring.baseTiltZ + Math.cos(elapsed * 0.35 + index) * 0.035;
        });

        // Moving amber reflections across floor & smoked-bronze glass facets
        movingAmberLight.position.set(
          Math.sin(elapsed * 0.42) * 2.85,
          1.45 + Math.cos(elapsed * 0.6) * 0.55,
          -1.45 + Math.cos(elapsed * 0.42) * 1.65
        );

        // Pointer-responsive subtle perspective shift (strictly without fighting OrbitControls drag)
        if (!isDragging) {
          controls.target.set(
            pointerCurrent.x * 0.18,
            2.25 - pointerCurrent.y * 0.1,
            0
          );
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (!readySignaled) {
        readySignaled = true;
        onReady?.();
      }

      if (!reducedMotion) {
        afterDraw(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      window.removeEventListener('pointermove', handlePointerMove);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('end', onControlEnd);
      controls.dispose();

      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      disposableGeometries.forEach((g) => g.dispose());
      disposableMaterials.forEach((m) => m.dispose());
      disposableTextures.forEach((t) => t.dispose());
      envTarget.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [reducedMotion, onReady]);

  return (
    <div
      ref={mountRef}
      className="relative w-full h-full select-none"
      aria-label="Interactive translucent smoked-bronze architectural sculpture in 3D space"
    >
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#12100F] text-xs tracking-widest uppercase text-[#A69A8C]">
          Restoring architectural scene…
        </div>
      )}
    </div>
  );
}
