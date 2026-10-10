import * as THREE from "three";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createFlightScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7ab9db);
  scene.fog = new THREE.Fog(0x98cde2, 145, 980);

  const camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.1, 1500);
  camera.position.set(0, 0.45, 0.5);
  scene.add(camera);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  let quality = "balanced";
  function setQuality(level) {
    quality = ["low", "balanced", "high"].includes(level) ? level : "balanced";
    const cap = quality === "low" ? 0.85 : quality === "high" ? 1.6 : 1.2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    const cloudCount = quality === "low" ? 10 : quality === "high" ? cloudField.length : 20;
    cloudField.forEach((cloud, index) => { cloud.visible = index < cloudCount; });
    const lightStep = quality === "low" ? 3 : quality === "high" ? 1 : 2;
    runway.userData.lights.forEach((light, index) => { light.visible = index % lightStep === 0; });
    resize();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.className = "flight-renderer";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.replaceChildren(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xe5f7ff, 0x354d56, 2.1));
  const sunlight = new THREE.DirectionalLight(0xfff2da, 3.1);
  sunlight.position.set(-140, 210, 150);
  scene.add(sunlight);

  const world = new THREE.Group();
  scene.add(world);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshStandardMaterial({ color: 0x287c98, roughness: 0.31, metalness: 0.08 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -26, -610);
  world.add(ocean);

  const terrain = new THREE.Group();
  world.add(terrain);
  addIsland(terrain, -190, -175, 180, 59, 0x526b79);
  addIsland(terrain, 230, -245, 225, 76, 0x4b667a);
  addIsland(terrain, -465, -410, 265, 115, 0x354c68);
  addIsland(terrain, 490, -540, 310, 132, 0x3b526a);
  addIsland(terrain, 5, -900, 430, 165, 0x536778);
  addIsland(terrain, -720, -1030, 360, 182, 0x3e566b);
  addIsland(terrain, 780, -1250, 430, 196, 0x3d5065);

  const runway = makeRunway(world);
  const hangars = makeHangars(world);
  const cloudField = makeClouds(world);
  const skyObjects = makeSkyObjects(world);
  const cockpitParts = makeCockpit(camera);
  const cockpit = cockpitParts.frame;
  const reticle = cockpitParts.reticle;
  const playerModel = makeJet(0xc4d1d4, 0x39758a, false);
  playerModel.position.set(0, -2.1, -15);
  scene.add(playerModel);

  const aircraft = new Map();
  const contactMarkers = new Map();
  const playerRounds = [];
  const enemyRounds = [];
  const rocketModels = [];
  let lastElapsed = 0;
  let disposed = false;

  function resize() {
    if (disposed) return;
    const bounds = container.getBoundingClientRect();
    const viewWidth = Math.max(1, bounds.width);
    const viewHeight = Math.max(1, bounds.height);
    renderer.setSize(viewWidth, viewHeight, false);
    camera.aspect = viewWidth / viewHeight;
    camera.fov = viewWidth < viewHeight ? 82 : 72;
    camera.updateProjectionMatrix();
  }

  function screenToWorld(x, y, depth) {
    camera.updateMatrixWorld(true);
    const halfViewHeight = depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const localX = (x / 960 * 2 - 1) * halfViewHeight * camera.aspect;
    const localY = (1 - y / 540 * 2) * halfViewHeight;
    return camera.localToWorld(new THREE.Vector3(localX, localY, -depth));
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener("resize", resize);
  resize();

  function update(input) {
    const delta = Math.min(input.delta || 0, 0.04);
    lastElapsed = input.elapsed;
    const motion = input.reduceMotion ? 0.22 : 1;
    const playing = input.state === "playing";
    const takingOff = input.state === "takeoff";
    const landing = input.state === "landing";
    const phase = clamp(input.phaseTime / (takingOff ? 2.8 : 2.5), 0, 1);
    const moveX = clamp((input.player.x - 0.5) * 15, -7.2, 7.2);
    const moveY = clamp((input.player.y - 0.7) * -4.6, -1.8, 1.8);

    for (const cloud of cloudField) {
      cloud.position.x += cloud.userData.drift * delta * motion;
      cloud.position.z += cloud.userData.forward * delta * motion;
      if (cloud.position.x > 650) cloud.position.x = -650;
      if (cloud.position.x < -650) cloud.position.x = 650;
      if (cloud.position.z > 70) cloud.position.z = -1240;
    }
    for (const object of skyObjects) object.rotation.y += delta * object.userData.spin * motion;

    if (input.cockpitView) {
      cockpit.visible = true;
      playerModel.visible = false;
      camera.position.x += (moveX - camera.position.x) * Math.min(1, delta * 2.6);
      camera.position.y += ((0.45 + moveY + (takingOff ? phase * 0.7 : landing ? (1 - phase) * 0.38 : 0)) - camera.position.y) * Math.min(1, delta * 2.4);
      camera.position.z += ((takingOff ? 0.5 - phase * 1.1 : landing ? -0.4 + phase * 0.8 : 0.5) - camera.position.z) * Math.min(1, delta * 1.8);
      camera.rotation.order = "YXZ";
      camera.rotation.x += ((-moveY * 0.035 + (takingOff ? -0.06 : 0)) - camera.rotation.x) * Math.min(1, delta * 2.8);
      camera.rotation.y += ((-moveX * 0.015) - camera.rotation.y) * Math.min(1, delta * 2.4);
      camera.rotation.z += ((-input.player.bank * 0.3) - camera.rotation.z) * Math.min(1, delta * 3.2);
    } else {
      cockpit.visible = false;
      playerModel.visible = true;
      const desired = new THREE.Vector3(moveX * 0.82, 8.4 + moveY, 25);
      camera.position.lerp(desired, Math.min(1, delta * 2.2));
      camera.lookAt(moveX * 0.55, 1.5, -175);
      playerModel.position.set(moveX * 0.52, -2.1 + moveY * 0.25, -15);
      playerModel.rotation.z += (-input.player.bank * 0.36 - playerModel.rotation.z) * Math.min(1, delta * 3);
    }

    const aim = input.aim || { x: input.player.x, y: input.player.y - 42 / 540 };
    const reticleDepth = 4.5;
    const aimHalfHeight = reticleDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    reticle.position.set(
      (aim.x * 2 - 1) * aimHalfHeight * camera.aspect,
      (1 - aim.y * 2) * aimHalfHeight,
      -reticleDepth
    );
    reticle.visible = false;
    reticle.userData.material.color.setHex(input.aimTargetId ? 0xff3028 : 0xc5fff0);
    camera.updateMatrixWorld(true);

    runway.visible = takingOff || landing || input.state === "ready";
    hangars.visible = takingOff || landing || input.state === "ready";
    runway.position.z = takingOff ? -245 + phase * 38 : landing ? -207 - phase * 34 : -245;
    updateEnemies(input.enemies);
    updateContacts(input.contacts);
    updateRounds(input.shots, playerRounds, 0xfff1ab, delta, false);
    updateRounds(input.enemyShots, enemyRounds, 0xff725c, delta, true);
    updateRockets(input.rockets, delta);
    updateLights(input.elapsed, playing);
    renderer.render(scene, camera);
  }

  function updateEnemies(enemies, delta) {
    const visible = new Set();
    for (const enemy of enemies) {
      visible.add(enemy.id);
      let model = aircraft.get(enemy.id);
      if (!model) {
        model = enemy.boss ? makeWarMachine() : makeJet(enemy.heavy ? 0xa84551 : 0xd2dfe0, enemy.heavy ? 0x743c59 : 0x52778b, true);
        model.traverse((part) => {
          if (!part.isMesh || !part.material.emissive) return;
          part.userData.baseEmissive = part.material.emissive.clone();
          part.userData.baseEmissiveIntensity = part.material.emissiveIntensity;
        });
        world.add(model);
        aircraft.set(enemy.id, model);
      }
      const progress = clamp(enemy.progress, 0, 1);
      const distance = 460 - progress * 390;
      const targetX = enemy.x * 960 + Math.sin(lastElapsed * 1.3 + enemy.phase) * enemy.drift * progress;
      const targetY = 540 * 0.3 + progress * 540 * 0.18;
      model.position.copy(screenToWorld(targetX, targetY, distance));
      model.quaternion.copy(camera.quaternion);
      model.rotateY(Math.PI);
      const widthFraction = enemy.boss ? 0.18 + progress * 0.06 : 0.12 + progress * 0.12;
      const viewWidth = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
      const size = widthFraction * viewWidth / (enemy.boss ? 22 : 16);
      model.scale.setScalar(size);
      model.rotateZ(enemy.boss ? Math.sin(lastElapsed * 0.45) * 0.04 : Math.sin(lastElapsed + enemy.phase) * 0.08);
      model.traverse((part) => {
        if (!part.isMesh || !part.material.emissive) return;
        if (enemy.locked) {
          part.material.emissive.setHex(0xff241c);
          part.material.emissiveIntensity = 1.4;
        } else if (enemy.hitFlash > 0) {
          part.material.emissive.setHex(0x542222);
          part.material.emissiveIntensity = 0.8;
        } else if (part.userData.baseEmissive) {
          part.material.emissive.copy(part.userData.baseEmissive);
          part.material.emissiveIntensity = part.userData.baseEmissiveIntensity;
        }
      });
    }
    for (const [id, model] of aircraft) {
      if (!visible.has(id)) {
        world.remove(model);
        disposeTree(model);
        aircraft.delete(id);
      }
    }
  }

  function updateContacts(contacts) {
    const visible = new Set();
    for (const contact of contacts) {
      visible.add(contact.id);
      let marker = contactMarkers.get(contact.id);
      if (!marker) {
        marker = new THREE.Group();
        const material = new THREE.MeshBasicMaterial({
          color: contact.enemy.boss ? 0xff3028 : 0xffbd62,
          transparent: true,
          opacity: 0.76,
          toneMapped: false,
          depthTest: false
        });
        marker.userData.material = material;
        marker.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 6, 28), material));
        marker.add(new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.055, 0.055), material));
        marker.add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 2.7, 0.055), material));
        marker.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), material));
        world.add(marker);
        contactMarkers.set(contact.id, marker);
      }
      const progress = clamp(contact.visualProgress, 0, 0.18);
      const depth = 460 - progress * 390;
      const screenX = contact.x * 960;
      const screenY = 540 * 0.3 + progress * 540 * 0.18;
      const viewWidth = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
      const widthFraction = contact.enemy.boss ? 0.1 : 0.045 + progress * 0.035;
      marker.position.copy(screenToWorld(screenX, screenY, depth));
      marker.quaternion.copy(camera.quaternion);
      marker.scale.setScalar(widthFraction * viewWidth / 2);
      marker.rotation.z += 0.035;
      marker.userData.material.opacity = 0.56 + Math.sin(lastElapsed * 8 + contact.id) * 0.2;
    }
    for (const [id, marker] of contactMarkers) {
      if (!visible.has(id)) {
        world.remove(marker);
        disposeTree(marker);
        contactMarkers.delete(id);
      }
    }
  }

  function updateRounds(rounds, models, color, delta, incoming) {
    while (models.length < rounds.length) {
      const material = new THREE.MeshBasicMaterial({ color });
      const model = new THREE.Mesh(new THREE.SphereGeometry(incoming ? 0.8 : 0.58, 8, 6), material);
      world.add(model);
      models.push(model);
    }
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      const round = rounds[index];
      model.visible = Boolean(round);
      if (!round) continue;
      const progress = clamp((round.y / 540 - 0.3) / 0.18, 0, 1);
      const depth = 460 - progress * 390;
      model.position.copy(screenToWorld(round.x, round.y, depth));
    }
  }

  function updateRockets(rockets, delta) {
    while (rocketModels.length < rockets.length) {
      const model = new THREE.Mesh(
        new THREE.ConeGeometry(0.85, 5.6, 9),
        new THREE.MeshStandardMaterial({ color: 0xffcf7d, emissive: 0xa64824, emissiveIntensity: 1.3 })
      );
      model.rotation.x = Math.PI / 2;
      world.add(model);
      rocketModels.push(model);
    }
    for (let index = 0; index < rocketModels.length; index += 1) {
      const model = rocketModels[index];
      const rocket = rockets[index];
      model.visible = Boolean(rocket);
      if (!rocket) continue;
      const progress = clamp((rocket.y / 540 - 0.3) / 0.18, 0, 1);
      const depth = 460 - progress * 390;
      model.position.copy(screenToWorld(rocket.x, rocket.y, depth));
      model.rotation.z = Math.sin(lastElapsed * 12 + index) * 0.08;
    }
  }

  function updateLights(elapsed, playing) {
    runway.userData.lights.forEach((light, index) => {
      const blink = Math.floor(elapsed * 4 + index / 2) % 2;
      light.material.opacity = playing && blink ? 0.48 : 1;
    });
  }

  function dispose() {
    disposed = true;
    resizeObserver.disconnect();
    window.removeEventListener("resize", resize);
    scene.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material.dispose();
    });
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { update, resize, setQuality, dispose };
}

function makeHangars(parent) {
  const airfield = new THREE.Group();
  parent.add(airfield);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x879397, metalness: 0.24, roughness: 0.78 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x53636a, metalness: 0.54, roughness: 0.52 });
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x3c535d, metalness: 0.4, roughness: 0.65 });
  const apronMaterial = new THREE.MeshStandardMaterial({ color: 0x4d5c62, roughness: 0.9 });
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffd999, toneMapped: false });
  for (const side of [-1, 1]) {
    for (let index = 0; index < 2; index += 1) {
      const x = side * (145 + index * 100);
      const z = -200 - index * 250;
      const hangar = new THREE.Group();
      hangar.position.set(x, -24, z);
      const apron = new THREE.Mesh(new THREE.BoxGeometry(100, 0.24, 120), apronMaterial);
      apron.position.set(0, 0.05, 8);
      hangar.add(apron);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(66, 22, 88), wallMaterial);
      shell.position.set(0, 11, -2);
      hangar.add(shell);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(73, 3, 95), roofMaterial);
      roof.position.set(0, 23.5, -2);
      roof.rotation.z = side * -0.035;
      hangar.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(36, 17, 0.7), doorMaterial);
      door.position.set(0, 8.5, 42.5);
      hangar.add(door);
      for (const doorSide of [-1, 1]) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 16, 0.82), roofMaterial);
        seam.position.set(doorSide * 9, 8.5, 42.9);
        hangar.add(seam);
      }
      for (const edge of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), lampMaterial);
        lamp.position.set(edge * 23, 18, 43);
        hangar.add(lamp);
      }
      const parkedJet = makeJet(0xaab9bc, 0x42798a, false);
      parkedJet.scale.setScalar(1.6);
      parkedJet.position.set(side * -14, 0, 18);
      parkedJet.rotation.y = side * 0.23;
      hangar.add(parkedJet);
      airfield.add(hangar);
    }
  }
  return airfield;
}

function addIsland(parent, x, z, radius, peak, color) {
  const shore = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12),
    new THREE.MeshStandardMaterial({ color: color - 0x111111, roughness: 0.98 })
  );
  shore.position.set(x, -25, z);
  shore.scale.set(radius * 1.4, 12, radius * 1.75);
  parent.add(shore);

  const summit = new THREE.Mesh(
    new THREE.ConeGeometry(radius, peak, 9, 4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.94, flatShading: true })
  );
  summit.position.set(x, -20 + peak / 2, z);
  summit.rotation.y = 0.3;
  parent.add(summit);
  const snow = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 0.38, peak * 0.32, 9, 2),
    new THREE.MeshStandardMaterial({ color: 0xdce9e8, roughness: 0.86, flatShading: true })
  );
  snow.position.set(x, -20 + peak * 0.86, z);
  snow.rotation.y = 0.3;
  parent.add(snow);
}

function makeRunway(parent) {
  const runway = new THREE.Group();
  parent.add(runway);
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(37, 720),
    new THREE.MeshStandardMaterial({ color: 0x454d58, roughness: 0.95 })
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(0, -24, -220);
  runway.add(asphalt);
  const paint = new THREE.MeshBasicMaterial({ color: 0xf7f0d9 });
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 720), paint);
    edge.position.set(side * 17.3, -23.9, -220);
    runway.add(edge);
  }
  for (let index = 0; index < 23; index += 1) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 14), paint);
    marker.position.set(0, -23.89, 118 - index * 31);
    runway.add(marker);
  }
  const lights = [];
  const lightGeometry = new THREE.SphereGeometry(0.7, 8, 6);
  for (let index = 0; index < 44; index += 1) {
    for (const side of [-1, 1]) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffd58a, transparent: true });
      const light = new THREE.Mesh(lightGeometry, material);
      light.position.set(side * 20.3, -23.3, 110 - index * 16);
      runway.add(light);
      lights.push(light);
    }
  }
  runway.userData.lights = lights;
  return runway;
}

function makeClouds(parent) {
  const clouds = [];
  const material = new THREE.MeshStandardMaterial({ color: 0xf6fbff, roughness: 1, transparent: true, opacity: 0.88 });
  const puffGeometry = new THREE.SphereGeometry(1, 10, 8);
  for (let index = 0; index < 32; index += 1) {
    const cloud = new THREE.Group();
    const size = 9 + (index % 7) * 2.2;
    for (let puff = 0; puff < 5; puff += 1) {
      const mesh = new THREE.Mesh(puffGeometry, material);
      mesh.position.set(Math.sin(index * 11 + puff * 1.7) * size * 0.54, Math.cos(index + puff) * size * 0.12, Math.cos(index * 0.6 + puff) * size * 0.28);
      mesh.scale.set(size * (0.46 + (puff % 3) * 0.18), size * 0.3, size * 0.43);
      cloud.add(mesh);
    }
    cloud.position.set((index % 2 ? 1 : -1) * (90 + (index * 47) % 500), 22 + (index * 31) % 95, -115 - (index * 73) % 1100);
    cloud.userData.drift = (index % 2 ? -1 : 1) * (1.6 + index % 4);
    cloud.userData.forward = 1.2 + index % 3;
    parent.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}

function makeSkyObjects(parent) {
  const sun = new THREE.Mesh(new THREE.SphereGeometry(19, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }));
  sun.position.set(-190, 145, -830);
  parent.add(sun);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(11, 18, 12), new THREE.MeshStandardMaterial({ color: 0xb8c7d1, roughness: 0.84 }));
  planet.position.set(235, 155, -880);
  parent.add(planet);
  return [sun, planet];
}

function makeCockpit(camera) {
  const cockpit = new THREE.Group();
  camera.add(cockpit);
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1c2b34, metalness: 0.7, roughness: 0.38 });
  const edgeMetal = new THREE.MeshStandardMaterial({ color: 0x8499a3, metalness: 0.8, roughness: 0.28 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x91d8ec, transparent: true, opacity: 0.1, roughness: 0.08, metalness: 0.04, side: THREE.DoubleSide });
  addCockpitBox(cockpit, [0, -2.05, -4.9], [13.8, 2, 3.6], darkMetal);
  addCockpitBox(cockpit, [0, -1.02, -4.96], [13.5, 0.16, 3.5], edgeMetal);
  addCockpitBeam(cockpit, [-6.3, -1.9, -4.3], [-4.1, 4.25, -11.2], 0.24, edgeMetal);
  addCockpitBeam(cockpit, [6.3, -1.9, -4.3], [4.1, 4.25, -11.2], 0.24, edgeMetal);
  addCockpitBeam(cockpit, [-4.1, 4.25, -11.2], [4.1, 4.25, -11.2], 0.21, edgeMetal);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), glass);
  canopy.position.set(0, -0.22, -6.8);
  canopy.scale.set(7.4, 5.8, 9.2);
  cockpit.add(canopy);

  const screenMaterial = new THREE.MeshStandardMaterial({ color: 0x8af2dc, emissive: 0x30ad9d, emissiveIntensity: 1.8, roughness: 0.25 });
  addCockpitBox(cockpit, [-3.8, -1.66, -2.98], [1.55, 0.78, 0.09], screenMaterial);
  addCockpitBox(cockpit, [3.8, -1.66, -2.98], [1.55, 0.78, 0.09], screenMaterial);
  const console = new THREE.MeshStandardMaterial({ color: 0x3b515c, metalness: 0.62, roughness: 0.42 });
  for (const x of [-1.7, 0, 1.7]) {
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.13, 18), console);
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(x, -1.66, -3.04);
    cockpit.add(gauge);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ color: 0xd5efdb }));
    face.position.set(x, -1.66, -2.95);
    cockpit.add(face);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.2, 0.025), new THREE.MeshBasicMaterial({ color: 0x253e4a }));
    needle.position.set(x, -1.63, -2.92);
    needle.rotation.z = x * 0.22;
    cockpit.add(needle);
  }
  addCockpitBox(cockpit, [0, -2.84, -4.35], [4.6, 0.45, 0.24], console);
  for (let index = 0; index < 10; index += 1) {
    const color = index % 3 === 0 ? 0xf25f52 : 0x81dfb1;
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.09, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    button.position.set(-1.8 + index * 0.4, -2.6, -4.19);
    cockpit.add(button);
  }

  const noseMaterial = new THREE.MeshStandardMaterial({ color: 0xc3d2d5, metalness: 0.74, roughness: 0.31 });
  addCockpitBox(cockpit, [0, -3.05, -8.25], [12.5, 0.15, 3.6], noseMaterial);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 7.4, 12), noseMaterial);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, -3.04, -11.2);
  cockpit.add(nose);

  const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0xc5fff0, transparent: true, opacity: 0.8 });
  const reticle = new THREE.Group();
  reticle.userData.material = reticleMaterial;
  reticle.add(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.018, 6, 24), reticleMaterial));
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.018, 0.018), reticleMaterial);
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.62, 0.018), reticleMaterial);
  reticle.add(horizontal, vertical);
  camera.add(reticle);
  cockpit.traverse((object) => { if (object.isMesh) object.frustumCulled = false; });
  return { frame: cockpit, reticle };
}

function makeJet(bodyColor, glassColor, enemy) {
  const jet = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: bodyColor,
    emissive: enemy ? 0x702017 : 0x000000,
    emissiveIntensity: enemy ? 0.7 : 0,
    metalness: 0.62,
    roughness: 0.34,
    flatShading: true
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x344752, metalness: 0.72, roughness: 0.42 });
  const canopy = new THREE.MeshStandardMaterial({ color: glassColor, metalness: 0.35, roughness: 0.15, emissive: glassColor, emissiveIntensity: 0.15 });
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1, 10.5, 12), body);
  fuselage.rotation.x = -Math.PI / 2;
  jet.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.72, 4, 12), body);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -7.1;
  jet.add(nose);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-0.7, 2.2);
  wingShape.lineTo(-8.2, 1.4);
  wingShape.lineTo(-7.8, 0.2);
  wingShape.lineTo(-1.15, -2.3);
  wingShape.lineTo(1.15, -2.3);
  wingShape.lineTo(7.8, 0.2);
  wingShape.lineTo(8.2, 1.4);
  wingShape.lineTo(0.7, 2.2);
  wingShape.closePath();
  const wings = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, { depth: 0.25, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.05, bevelSegments: 1 }), body);
  wings.rotation.x = Math.PI / 2;
  wings.position.y = -0.3;
  jet.add(wings);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2, 2.5), body);
  fin.position.set(0, 1, 4.3);
  jet.add(fin);
  const glassBubble = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), canopy);
  glassBubble.scale.set(0.6, 0.58, 1.8);
  glassBubble.position.set(0, 0.64, -3.2);
  jet.add(glassBubble);
  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, 4.5, 10), dark);
    engine.rotation.x = -Math.PI / 2;
    engine.position.set(side * 1.35, -0.52, 3.3);
    jet.add(engine);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.31, 2.8, 8), new THREE.MeshBasicMaterial({ color: 0xffb15d, transparent: true, opacity: 0.84 }));
    flame.rotation.x = Math.PI / 2;
    flame.position.set(side * 1.35, -0.52, 6.6);
    jet.add(flame);
  }
  if (enemy) {
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xff594b, toneMapped: false });
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), lightMaterial);
      light.position.set(side * 6.5, 0.1, 0.3);
      jet.add(light);
    }
  }
  return jet;
}

function makeWarMachine() {
  const machine = makeJet(0x592b39, 0xff574d, true);
  const armor = new THREE.MeshStandardMaterial({ color: 0x753341, metalness: 0.78, roughness: 0.3, flatShading: true });
  const edge = new THREE.MeshStandardMaterial({ color: 0xe1a558, metalness: 0.7, roughness: 0.28 });
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.45, 5.8), armor);
    pod.position.set(side * 5.5, -0.2, 1.3);
    machine.add(pod);
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 4, 10), edge);
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(side * 6.2, -0.5, -3.5);
    machine.add(cannon);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 1, 5.5, 12), edge);
    engine.rotation.x = -Math.PI / 2;
    engine.position.set(side * 2, -1.1, 4.8);
    machine.add(engine);
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), new THREE.MeshStandardMaterial({ color: 0xff5748, emissive: 0xb32319, emissiveIntensity: 2.4, metalness: 0.45, roughness: 0.2 }));
  core.position.set(0, 1.1, -5.4);
  machine.add(core);
  return machine;
}

function addCockpitBox(parent, position, size, material) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  box.position.set(...position);
  parent.add(box);
  return box;
}

function addCockpitBeam(parent, start, end, radius, material) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = new THREE.Vector3().subVectors(to, from);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material);
  beam.position.copy(from).add(to).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(beam);
}

function disposeTree(group) {
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material.dispose();
  });
}
