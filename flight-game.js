const canvas = document.getElementById("game");
if (window.innerWidth <= 640) {
  canvas.width = 600;
  canvas.height = 1000;
}
const ctx = canvas.getContext("2d");
const ui = {
  score: document.getElementById("score"),
  best: document.getElementById("best"),
  stage: document.getElementById("stage"),
  lives: document.getElementById("lives"),
  enemies: document.getElementById("enemy-count"),
  zone: document.getElementById("zone"),
  progress: document.getElementById("zone-progress"),
  timer: document.getElementById("timer"),
  missiles: document.getElementById("missiles"),
  radar: document.getElementById("radar-enemies"),
  screen: document.getElementById("screen"),
  kicker: document.getElementById("screen-kicker"),
  title: document.getElementById("screen-title"),
  copy: document.getElementById("screen-copy"),
  start: document.getElementById("start"),
  pause: document.getElementById("pause"),
  restart: document.getElementById("restart"),
  camera: document.getElementById("camera"),
  sound: document.getElementById("sound"),
  rocket: document.getElementById("rocket"),
  joystick: document.getElementById("joystick"),
  gun: document.getElementById("gun")
};

const width = canvas.width;
const height = canvas.height;
const keys = new Set();
const pressedControls = new Set();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const clouds = Array.from({ length: 15 }, (_, index) => ({
  x: (index * 211 + 85) % width,
  y: 42 + (index * 59) % 145,
  scale: 0.45 + (index % 5) * 0.16,
  speed: 5 + (index % 4) * 3
}));
const mountainLayers = [
  { y: 180, amplitude: 43, frequency: 0.019, color: "#50677d", phase: 0.3 },
  { y: 195, amplitude: 52, frequency: 0.014, color: "#344b68", phase: 1.8 },
  { y: 224, amplitude: 33, frequency: 0.024, color: "#536982", phase: 3.2 }
];
const zones = ["ICELANDS", "NORTH SEA", "AURORA RIDGE", "STARFALL"];
const storage = {
  get(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { return; }
  }
};

let best = Number(storage.get("skyPatrolBest", "0")) || 0;
let player;
let enemies = [];
let shots = [];
let enemyShots = [];
let rockets = [];
let particles = [];
let score = 0;
let lives = 3;
let stage = 1;
let stageSize = 7;
let spawned = 0;
let kills = 0;
let missiles = 3;
let state = "ready";
let pausedState = "playing";
let phaseTime = 0;
let elapsed = 0;
let spawnTimer = 0;
let enemyFireTimer = 1.4;
let shotTimer = 0;
let joystickAxis = { x: 0, y: 0 };
let joystickPointer = null;
let cockpitView = false;
let soundEnabled = false;
let audioContext = null;
let radarFrame = 0;
let lastFrame = 0;

ui.best.textContent = formatScore(best);
ui.missiles.textContent = String(missiles);
renderScene();
requestAnimationFrame(frame);

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function setScreen(kicker, title, copy, buttonText) {
  ui.kicker.textContent = kicker;
  ui.title.textContent = title;
  ui.title.style.whiteSpace = "pre-line";
  ui.copy.textContent = copy;
  ui.start.innerHTML = `${buttonText} <span aria-hidden="true">↗</span>`;
  ui.screen.classList.remove("hidden");
}

function hideScreen() {
  ui.screen.classList.add("hidden");
}

function resetMission() {
  score = 0;
  lives = 3;
  stage = 1;
  elapsed = 0;
  missiles = 3;
  enemies = [];
  shots = [];
  enemyShots = [];
  rockets = [];
  particles = [];
  player = { x: width / 2, y: height - 105, invulnerable: 0, bank: 0 };
  ui.score.textContent = formatScore(score);
  ui.lives.textContent = String(lives);
  ui.lives.classList.remove("lives-empty");
  ui.missiles.textContent = String(missiles);
  beginStage();
}

function beginStage() {
  stageSize = 7 + (stage - 1) * 2;
  spawned = 0;
  kills = 0;
  missiles = 3;
  phaseTime = 0;
  spawnTimer = 0.45;
  enemyFireTimer = 1.5;
  shotTimer = 0;
  enemies = [];
  shots = [];
  enemyShots = [];
  rockets = [];
  state = "takeoff";
  ui.stage.textContent = String(stage).padStart(2, "0");
  ui.missiles.textContent = String(missiles);
  ui.rocket.disabled = false;
  ui.zone.textContent = zones[(stage - 1) % zones.length];
  updateMissionHud();
  ui.pause.textContent = "Ⅱ";
  ui.pause.setAttribute("aria-label", "Pause game");
  hideScreen();
}

function updateMissionHud() {
  ui.enemies.textContent = `${String(kills).padStart(2, "0")}/${String(stageSize).padStart(2, "0")}`;
  ui.progress.style.width = `${Math.min(100, (kills / stageSize) * 100)}%`;
}

function finishGame() {
  state = "gameOver";
  if (score > best) {
    best = score;
    storage.set("skyPatrolBest", String(best));
    ui.best.textContent = formatScore(best);
  }
  setScreen("AIRFIELD / AIRCRAFT LOST", "SORTIE\nFAILED", `Final score: ${formatScore(score)}. You reached Stage ${String(stage).padStart(2, "0")}.`, "FLY AGAIN");
}

function togglePause() {
  if (state === "playing" || state === "takeoff" || state === "landing") {
    pausedState = state;
    state = "paused";
    setScreen("FLIGHT CONTROL / STANDBY", "FLIGHT\nPAUSED", "Your aircraft is holding position. Resume when ready.", "RESUME FLIGHT");
    ui.pause.textContent = "▶";
    ui.pause.setAttribute("aria-label", "Resume game");
  } else if (state === "paused") {
    state = pausedState;
    hideScreen();
    ui.pause.textContent = "Ⅱ";
    ui.pause.setAttribute("aria-label", "Pause game");
  }
}

function startOrResume() {
  if (state === "paused") {
    togglePause();
  } else if (state === "stageClear") {
    stage += 1;
    beginStage();
  } else {
    resetMission();
  }
}

function completeStage() {
  if (state !== "playing") return;
  state = "landing";
  phaseTime = 0;
  shots = [];
  enemyShots = [];
  rockets = [];
  playTone(330, 0.3, "sine", 0.05);
}

function showStageClear() {
  state = "stageClear";
  if (score > best) {
    best = score;
    storage.set("skyPatrolBest", String(best));
    ui.best.textContent = formatScore(best);
  }
  setScreen("AIRFIELD / LANDING COMPLETE", `STAGE ${String(stage).padStart(2, "0")}\nCLEARED`, `Score ${formatScore(score)}. Fuel up for the next sortie.`, "NEXT STAGE");
}

function createEnemy() {
  const heavy = stage >= 2 && Math.random() < Math.min(0.12 + stage * 0.035, 0.42);
  enemies.push({
    x: width * (0.18 + Math.random() * 0.64),
    progress: 0,
    speed: 0.13 + Math.random() * 0.055 + Math.min(stage * 0.012, 0.09),
    drift: (Math.random() - 0.5) * 65,
    phase: Math.random() * Math.PI * 2,
    hp: heavy ? 3 : 1,
    heavy,
    hitFlash: 0
  });
}

function enemyPosition(enemy) {
  const perspective = Math.min(1, enemy.progress);
  return {
    x: enemy.x + Math.sin(elapsed * 1.3 + enemy.phase) * enemy.drift * perspective,
    y: height * 0.26 + perspective * height * 0.6,
    scale: 0.36 + perspective * 0.82
  };
}

function fireGun() {
  shots.push({ x: player.x - 14, y: player.y - 42, speed: 560 });
  shots.push({ x: player.x + 14, y: player.y - 42, speed: 560 });
  particles.push({ x: player.x - 14, y: player.y - 40, vx: 0, vy: -22, life: 0.11, color: "#fff4ae", size: 5 });
  particles.push({ x: player.x + 14, y: player.y - 40, vx: 0, vy: -22, life: 0.11, color: "#fff4ae", size: 5 });
  playTone(150, 0.055, "square", 0.025);
}

function launchRocket() {
  if (state !== "playing" || missiles <= 0 || enemies.length === 0) return;
  const target = enemies.reduce((nearest, enemy) => {
    if (!nearest) return enemy;
    return Math.abs(enemyPosition(enemy).x - player.x) < Math.abs(enemyPosition(nearest).x - player.x) ? enemy : nearest;
  }, null);
  rockets.push({ x: player.x, y: player.y - 46, target, speed: 720 });
  missiles -= 1;
  ui.missiles.textContent = String(missiles);
  ui.rocket.disabled = missiles <= 0;
  playTone(260, 0.16, "sawtooth", 0.04);
}

function damagePlayer() {
  if (player.invulnerable > 0 || state !== "playing") return;
  lives -= 1;
  ui.lives.textContent = String(lives);
  player.invulnerable = 1.6;
  burst(player.x, player.y, "#ff745a", 17);
  playTone(90, 0.35, "triangle", 0.08);
  if (lives <= 0) {
    ui.lives.classList.add("lives-empty");
    finishGame();
  }
}

function destroyEnemy(enemy, rocketHit = false) {
  if (enemy.destroyed) return;
  enemy.destroyed = true;
  kills += 1;
  score += enemy.heavy ? (rocketHit ? 400 : 250) : (rocketHit ? 250 : 150);
  ui.score.textContent = formatScore(score);
  updateMissionHud();
  const position = enemyPosition(enemy);
  burst(position.x, position.y, enemy.heavy ? "#ffc16c" : "#ff805c", 14);
  playTone(rocketHit ? 70 : 110, rocketHit ? 0.35 : 0.18, "sawtooth", rocketHit ? 0.06 : 0.035);
}

function burst(x, y, color, amount = 10) {
  for (let index = 0; index < amount; index += 1) {
    const angle = (Math.PI * 2 * index) / amount;
    const speed = 38 + Math.random() * 120;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.3 + Math.random() * 0.45, color, size: 2 + Math.random() * 3 });
  }
}

function update(delta) {
  if (["ready", "paused", "stageClear", "gameOver"].includes(state)) return;
  const motionScale = reducedMotion.matches ? 0.3 : 1;
  phaseTime += delta;
  elapsed += delta;
  for (const cloud of clouds) {
    cloud.x -= cloud.speed * delta * motionScale;
    if (cloud.x < -110) cloud.x = width + 100;
  }

  if (state === "takeoff") {
    if (phaseTime >= 2.8) {
      state = "playing";
      phaseTime = 0;
    }
    updateTimer();
    return;
  }
  if (state === "landing") {
    if (phaseTime >= 2.5) showStageClear();
    updateTimer();
    return;
  }

  player.invulnerable = Math.max(0, player.invulnerable - delta);
  const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
  const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
  const up = keys.has("ArrowUp") || keys.has("w") || keys.has("W");
  const down = keys.has("ArrowDown") || keys.has("s") || keys.has("S");
  const axisX = Number(right) - Number(left) + joystickAxis.x;
  const axisY = Number(down) - Number(up) + joystickAxis.y;
  player.x = Math.max(65, Math.min(width - 65, player.x + axisX * 330 * delta));
  player.y = Math.max(height * 0.59, Math.min(height * 0.83, player.y + axisY * 245 * delta));
  player.bank += (Math.max(-1, Math.min(1, axisX)) - player.bank) * Math.min(delta * 7, 1);

  shotTimer -= delta;
  if ((keys.has(" ") || pressedControls.has("fire")) && shotTimer <= 0) {
    fireGun();
    shotTimer = 0.16;
  }
  spawnTimer -= delta;
  if (spawnTimer <= 0 && spawned < stageSize) {
    createEnemy();
    spawned += 1;
    spawnTimer = Math.max(0.43, 1.15 - stage * 0.035) + Math.random() * 0.35;
    updateMissionHud();
  }
  enemyFireTimer -= delta;
  if (enemyFireTimer <= 0 && enemies.length > 0) {
    const shooters = enemies.filter((enemy) => enemy.progress > 0.25 && !enemy.destroyed);
    if (shooters.length > 0) {
      const shooter = shooters[Math.floor(Math.random() * shooters.length)];
      const position = enemyPosition(shooter);
      enemyShots.push({ x: position.x, y: position.y + 12, vx: (player.x - position.x) * 0.12, vy: 230 + stage * 8 });
    }
    enemyFireTimer = Math.max(0.72, 1.65 - stage * 0.06);
  }

  for (const enemy of enemies) {
    enemy.progress += enemy.speed * delta;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);
    const position = enemyPosition(enemy);
    if (enemy.progress >= 0.98) {
      if (Math.abs(position.x - player.x) < (enemy.heavy ? 48 : 36) && Math.abs(position.y - player.y) < 54) {
        damagePlayer();
      } else {
        score = Math.max(0, score - 25);
        ui.score.textContent = formatScore(score);
      }
      enemy.progress = 0;
      enemy.x = width * (0.18 + Math.random() * 0.64);
    }
  }
  enemies = enemies.filter((enemy) => !enemy.destroyed);

  for (const shot of shots) shot.y -= shot.speed * delta;
  shots = shots.filter((shot) => shot.y > 110 && !shot.hit);
  for (const shot of shots) {
    for (const enemy of enemies) {
      const position = enemyPosition(enemy);
      if (Math.hypot(shot.x - position.x, shot.y - position.y) < 19 * position.scale + 7) {
        shot.hit = true;
        enemy.hp -= 1;
        enemy.hitFlash = 0.12;
        if (enemy.hp <= 0) destroyEnemy(enemy);
        else burst(position.x, position.y, "#ffe09b", 5);
        break;
      }
    }
  }
  shots = shots.filter((shot) => !shot.hit);
  enemies = enemies.filter((enemy) => !enemy.destroyed);

  for (const rocket of rockets) {
    const target = enemies.includes(rocket.target) ? enemyPosition(rocket.target) : { x: rocket.x, y: 100 };
    const differenceX = target.x - rocket.x;
    const differenceY = target.y - rocket.y;
    const distance = Math.hypot(differenceX, differenceY) || 1;
    rocket.x += (differenceX / distance) * rocket.speed * delta;
    rocket.y += (differenceY / distance) * rocket.speed * delta;
    if (distance < 24 || rocket.y < 110) {
      if (enemies.includes(rocket.target)) destroyEnemy(rocket.target, true);
      burst(rocket.x, rocket.y, "#ffc16c", 10);
      rocket.done = true;
    }
  }
  rockets = rockets.filter((rocket) => !rocket.done);

  for (const shot of enemyShots) {
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
    if (Math.hypot(shot.x - player.x, shot.y - player.y) < 25) {
      shot.hit = true;
      damagePlayer();
      burst(shot.x, shot.y, "#ffb16a", 5);
    }
  }
  enemyShots = enemyShots.filter((shot) => shot.y < height && !shot.hit);
  for (const particle of particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta;
  }
  particles = particles.filter((particle) => particle.life > 0);

  if (state === "playing" && spawned === stageSize && enemies.length === 0) completeStage();
  updateTimer();
  updateRadar();
}

function updateTimer() {
  const totalSeconds = Math.floor(elapsed);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  ui.timer.textContent = `${minutes}:${seconds}`;
}

function updateRadar() {
  radarFrame += 1;
  if (radarFrame % 6 !== 0) return;
  ui.radar.replaceChildren();
  for (const enemy of enemies) {
    const position = enemyPosition(enemy);
    const dot = document.createElement("i");
    dot.className = "radar-dot";
    dot.style.left = `${Math.max(8, Math.min(88, position.x / width * 100))}%`;
    dot.style.top = `${Math.max(8, Math.min(88, enemy.progress * 85 + 6))}%`;
    ui.radar.append(dot);
  }
}

function drawCloud(cloud) {
  ctx.save();
  ctx.translate(cloud.x, cloud.y * height / 540);
  ctx.scale(cloud.scale, cloud.scale * 0.52);
  ctx.fillStyle = "rgba(255, 255, 255, .78)";
  ctx.shadowColor = "rgba(255, 255, 255, .55)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.ellipse(-31, 3, 38, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(0, -9, 34, 26, 0, 0, Math.PI * 2);
  ctx.ellipse(33, 2, 40, 19, 0, 0, Math.PI * 2);
  ctx.ellipse(4, 8, 60, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMountains() {
  const verticalScale = height / 540;
  for (const layer of mountainLayers) {
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 12) {
      const y = (layer.y + Math.sin(x * layer.frequency + layer.phase) * layer.amplitude + Math.sin(x * 0.045 + layer.phase) * 18) * verticalScale;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = layer.color;
    ctx.fill();
  }
  ctx.fillStyle = "rgba(220, 235, 238, .66)";
  for (let index = 0; index < 8; index += 1) {
    const peakX = index * 148 + 75;
    const peakY = (153 + Math.sin(index * 1.9) * 21) * verticalScale;
    ctx.beginPath();
    ctx.moveTo(peakX - 15, peakY + 19);
    ctx.lineTo(peakX, peakY);
    ctx.lineTo(peakX + 18, peakY + 20);
    ctx.lineTo(peakX + 7, peakY + 15);
    ctx.lineTo(peakX, peakY + 19);
    ctx.lineTo(peakX - 6, peakY + 14);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRunway(progress) {
  const horizonY = height * 0.35;
  const runwayTop = 16 + Math.min(1, progress) * 35;
  const runwayBottom = width * (0.18 + Math.min(1, progress) * 0.12);
  ctx.fillStyle = "#444b55";
  ctx.beginPath();
  ctx.moveTo(width / 2 - runwayTop / 2, horizonY);
  ctx.lineTo(width / 2 + runwayTop / 2, horizonY);
  ctx.lineTo(width / 2 + runwayBottom, height + 12);
  ctx.lineTo(width / 2 - runwayBottom, height + 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(240, 242, 230, .82)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2 - runwayTop / 2, horizonY);
  ctx.lineTo(width / 2 - runwayBottom, height);
  ctx.moveTo(width / 2 + runwayTop / 2, horizonY);
  ctx.lineTo(width / 2 + runwayBottom, height);
  ctx.stroke();
  const travel = (elapsed * (state === "takeoff" ? 260 : 105)) % 1;
  for (let index = 0; index < 12; index += 1) {
    const distance = (index / 12 + travel) % 1;
    const y = horizonY + Math.pow(distance, 1.7) * (height - horizonY);
    const spread = runwayTop / 2 + Math.pow(distance, 1.5) * (runwayBottom - runwayTop / 2);
    const lightSize = 2 + distance * 5;
    ctx.fillStyle = index % 2 ? "#ffcf83" : "#fff1bd";
    ctx.shadowColor = "#ffda91";
    ctx.shadowBlur = 5 + distance * 9;
    ctx.fillRect(width / 2 - spread, y, lightSize, lightSize);
    ctx.fillRect(width / 2 + spread - lightSize, y, lightSize, lightSize);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,.86)";
  for (let index = 0; index < 5; index += 1) {
    const y = horizonY + Math.pow((index + 1) / 6, 1.7) * (height - horizonY);
    const size = 1.5 + index * 1.15;
    ctx.fillRect(width / 2 - size / 2, y, size, size * 3);
  }
}

function drawLandscape() {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#17a9dd");
  sky.addColorStop(0.37, "#8dd9f2");
  sky.addColorStop(0.58, "#eef5eb");
  sky.addColorStop(1, "#24516a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const sunGlow = ctx.createRadialGradient(width * 0.32, height * 0.31, 8, width * 0.32, height * 0.31, width * 0.19);
  sunGlow.addColorStop(0, "rgba(255, 250, 221, .9)");
  sunGlow.addColorStop(1, "rgba(255, 250, 221, 0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, width, height * 0.65);
  for (const cloud of clouds) drawCloud(cloud);
  drawMountains();

  const water = ctx.createLinearGradient(0, 218, 0, height);
  water.addColorStop(0, "#91d5e5");
  water.addColorStop(0.28, "#2b7895");
  water.addColorStop(1, "#0a314d");
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.47);
  ctx.lineTo(width, height * 0.45);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = "#b8e5e9";
  for (let index = 0; index < 12; index += 1) {
    const y = height * 0.5 + index * index * (height / 360);
    const lineWidth = 15 + index * 25;
    const xOffset = (elapsed * (16 + index * 3)) % (width + lineWidth) - lineWidth;
    ctx.beginPath();
    ctx.moveTo(xOffset, y);
    ctx.lineTo(xOffset + lineWidth, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (state === "takeoff") drawRunway(Math.min(1, phaseTime / 2.8));
  if (state === "landing") drawRunway(0.3 + Math.min(1, phaseTime / 2.5) * 0.7);
}

function drawPlayerPlane() {
  if (!player || (player.invulnerable > 0 && Math.floor(elapsed * 13) % 2 === 0)) return;
  const takeoff = state === "takeoff" ? Math.min(1, phaseTime / 2.8) : 1;
  const landing = state === "landing" ? Math.min(1, phaseTime / 2.5) : 0;
  const planeY = player.y + (1 - takeoff) * 55 + landing * 64;
  const scale = 0.92 + takeoff * 0.16 + landing * 0.12;
  ctx.save();
  ctx.translate(player.x, planeY);
  ctx.rotate(player.bank * -0.11);
  ctx.scale(scale, scale);
  ctx.shadowColor = "#ffb854";
  ctx.shadowBlur = 17;
  ctx.fillStyle = "#ffb854";
  ctx.beginPath();
  ctx.moveTo(-15, 23);
  ctx.lineTo(-11, 41 + Math.random() * 10);
  ctx.lineTo(-4, 31);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(15, 23);
  ctx.lineTo(11, 41 + Math.random() * 10);
  ctx.lineTo(4, 31);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#dce5e6";
  ctx.beginPath();
  ctx.moveTo(0, -42);
  ctx.lineTo(7, -12);
  ctx.lineTo(57, 16);
  ctx.lineTo(59, 24);
  ctx.lineTo(12, 16);
  ctx.lineTo(8, 34);
  ctx.lineTo(18, 42);
  ctx.lineTo(18, 46);
  ctx.lineTo(0, 41);
  ctx.lineTo(-18, 46);
  ctx.lineTo(-18, 42);
  ctx.lineTo(-8, 34);
  ctx.lineTo(-12, 16);
  ctx.lineTo(-59, 24);
  ctx.lineTo(-57, 16);
  ctx.lineTo(-7, -12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#71848b";
  ctx.beginPath();
  ctx.ellipse(0, -10, 5, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#243e55";
  ctx.beginPath();
  ctx.ellipse(0, -15, 3, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (cockpitView) drawCockpit();
}

function drawJet(x, y, scale, enemy = false, heavy = false, flash = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(enemy ? Math.PI : 0);
  ctx.scale(scale, scale);
  ctx.fillStyle = flash ? "#fff1b4" : enemy ? (heavy ? "#bd4553" : "#d9e2e6") : "#dce5e6";
  ctx.beginPath();
  ctx.moveTo(0, -23);
  ctx.lineTo(6, -5);
  ctx.lineTo(25, 9);
  ctx.lineTo(25, 14);
  ctx.lineTo(7, 11);
  ctx.lineTo(5, 21);
  ctx.lineTo(12, 27);
  ctx.lineTo(12, 30);
  ctx.lineTo(0, 26);
  ctx.lineTo(-12, 30);
  ctx.lineTo(-12, 27);
  ctx.lineTo(-5, 21);
  ctx.lineTo(-7, 11);
  ctx.lineTo(-25, 14);
  ctx.lineTo(-25, 9);
  ctx.lineTo(-6, -5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = enemy ? "#435764" : "#5e7888";
  ctx.beginPath();
  ctx.ellipse(0, -3, 4, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  if (enemy && heavy) {
    ctx.fillStyle = "#ffd176";
    ctx.fillRect(-3, 11, 6, 3);
  }
  ctx.restore();
}

function drawCockpit() {
  const shade = ctx.createLinearGradient(0, height * 0.68, 0, height);
  shade.addColorStop(0, "rgba(18, 36, 53, 0)");
  shade.addColorStop(0.45, "rgba(18, 36, 53, .38)");
  shade.addColorStop(1, "rgba(11, 22, 34, .96)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, height * 0.66, width, height * 0.34);
  ctx.strokeStyle = "rgba(219, 239, 249, .48)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, height + 25);
  ctx.quadraticCurveTo(width * 0.5, height * 0.53, width, height + 25);
  ctx.stroke();
  ctx.fillStyle = "rgba(18, 35, 49, .88)";
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, height - 23);
  ctx.quadraticCurveTo(width / 2, height - 125, width, height - 23);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#a4e1f1";
  ctx.font = "12px monospace";
  ctx.fillText(`ALT ${Math.round(820 + elapsed * 14)} FT`, width / 2 - 55, height - 35);
  ctx.fillText(`HDG ${String(Math.round((player.x / width) * 90 + 315) % 360).padStart(3, "0")}`, width / 2 + 12, height - 35);
}

function renderScene() {
  ctx.clearRect(0, 0, width, height);
  drawLandscape();
  for (const enemy of enemies) {
    const position = enemyPosition(enemy);
    drawJet(position.x, position.y, position.scale, true, enemy.heavy, enemy.hitFlash > 0);
  }
  for (const shot of shots) {
    ctx.fillStyle = "#fff2a1";
    ctx.shadowColor = "#ffeaa1";
    ctx.shadowBlur = 12;
    ctx.fillRect(shot.x - 2, shot.y - 8, 4, 16);
  }
  ctx.shadowBlur = 0;
  for (const shot of enemyShots) {
    ctx.fillStyle = "#ff725d";
    ctx.shadowColor = "#ff725d";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  for (const rocket of rockets) {
    ctx.save();
    ctx.translate(rocket.x, rocket.y);
    ctx.rotate(-0.4);
    ctx.fillStyle = "#fff2b0";
    ctx.fillRect(-3, -9, 6, 19);
    ctx.fillStyle = "#ff8a55";
    ctx.fillRect(-2, 8, 4, 12);
    ctx.restore();
  }
  for (const particle of particles) {
    ctx.globalAlpha = Math.min(1, particle.life / 0.5);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
  drawPlayerPlane();
}

function frame(timestamp) {
  const delta = Math.min((timestamp - lastFrame) / 1000 || 0, 0.04);
  lastFrame = timestamp;
  update(delta);
  renderScene();
  requestAnimationFrame(frame);
}

function playTone(frequency, duration, type, volume) {
  if (!soundEnabled) return;
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { return; }
}

function setJoystick(event) {
  const bounds = ui.joystick.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const radius = bounds.width * 0.34;
  const rawX = (event.clientX - centerX) / radius;
  const rawY = (event.clientY - centerY) / radius;
  joystickAxis = { x: Math.max(-1, Math.min(1, rawX)), y: Math.max(-1, Math.min(1, rawY)) };
  ui.joystick.querySelector(".joystick-knob").style.transform = `translate(${joystickAxis.x * radius * 0.55}px, ${joystickAxis.y * radius * 0.55}px)`;
}

function releaseJoystick() {
  joystickPointer = null;
  joystickAxis = { x: 0, y: 0 };
  ui.joystick.querySelector(".joystick-knob").style.transform = "translate(0, 0)";
}

ui.start.addEventListener("click", startOrResume);
ui.pause.addEventListener("click", togglePause);
ui.restart.addEventListener("click", resetMission);
ui.camera.addEventListener("click", () => {
  cockpitView = !cockpitView;
  ui.camera.setAttribute("aria-pressed", String(cockpitView));
  ui.camera.textContent = cockpitView ? "VIEW" : "CAM";
});
ui.rocket.addEventListener("click", launchRocket);
ui.sound.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  ui.sound.textContent = soundEnabled ? "SFX ON" : "SFX OFF";
  ui.sound.setAttribute("aria-pressed", String(soundEnabled));
  ui.sound.setAttribute("aria-label", soundEnabled ? "Turn sound off" : "Turn sound on");
  if (soundEnabled) playTone(660, 0.12, "sine", 0.04);
});

ui.joystick.addEventListener("pointerdown", (event) => {
  joystickPointer = event.pointerId;
  ui.joystick.setPointerCapture(event.pointerId);
  setJoystick(event);
});
ui.joystick.addEventListener("pointermove", (event) => {
  if (joystickPointer === event.pointerId) setJoystick(event);
});
ui.joystick.addEventListener("pointerup", releaseJoystick);
ui.joystick.addEventListener("pointercancel", releaseJoystick);

ui.gun.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  pressedControls.add("fire");
  ui.gun.setPointerCapture(event.pointerId);
});
ui.gun.addEventListener("pointerup", () => pressedControls.delete("fire"));
ui.gun.addEventListener("pointercancel", () => pressedControls.delete("fire"));

document.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) event.preventDefault();
  keys.add(event.key);
  if (!event.repeat && event.key.toLowerCase() === "p") togglePause();
  if (!event.repeat && event.key.toLowerCase() === "x") launchRocket();
  if (!event.repeat && event.key === "Enter" && state !== "playing") startOrResume();
});
document.addEventListener("keyup", (event) => keys.delete(event.key));
window.addEventListener("blur", () => {
  keys.clear();
  pressedControls.clear();
  releaseJoystick();
});

player = { x: width / 2, y: height - 105, invulnerable: 0, bank: 0 };
