import { createFlightScene } from "./flight-scene-3d.js";

const flightHost = document.getElementById("game");
const gameSection = document.querySelector(".game-section");
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
  bossHealth: document.getElementById("boss-health"),
  bossFill: document.getElementById("boss-health-fill"),
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
  fullscreen: document.getElementById("fullscreen"),
  exit: document.getElementById("exit-flight"),
  aimReticle: document.getElementById("aim-reticle"),
  quality: document.getElementById("graphics-quality"),
  joystick: document.getElementById("joystick"),
  gun: document.getElementById("gun")
};

const gameWidth = 960;
const gameHeight = 540;
const keys = new Set();
const pressedControls = new Set();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const zones = ["ICELANDS", "NORTH SEA", "AURORA RIDGE", "WAR ZONE"];
const storage = {
  get(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { return; }
  }
};
const flightScene = createFlightScene(flightHost);

let best = Number(storage.get("skyPatrolBest", "0")) || 0;
let player;
let enemies = [];
let pendingContacts = [];
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
let nextEnemyId = 1;
let state = "ready";
let pausedState = "playing";
let phaseTime = 0;
let elapsed = 0;
let spawnTimer = 0;
let enemyFireTimer = 1.5;
let shotTimer = 0;
let joystickAxis = { x: 0, y: 0 };
let joystickPointer = null;
let aim = { x: 0.5, y: 0.43 };
let aimPointer = null;
let cockpitView = true;
let soundEnabled = false;
let audioContext = null;
let radarFrame = 0;
let lastFrame = 0;
let fullscreenRequestInFlight = false;

ui.best.textContent = formatScore(best);
ui.missiles.textContent = String(missiles);
ui.quality.value = storage.get("skyPatrolQuality", "balanced");
flightScene.setQuality(ui.quality.value);
ui.camera.textContent = "CHASE";
ui.camera.setAttribute("aria-pressed", "true");
ui.bossHealth.hidden = true;
player = { x: gameWidth / 2, y: gameHeight * 0.72, invulnerable: 0, bank: 0 };
requestAnimationFrame(frame);

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function setScreen(kicker, title, copy, buttonText) {
  ui.screen.classList.remove("main-menu");
  ui.kicker.textContent = kicker;
  ui.title.textContent = title;
  ui.title.style.whiteSpace = "pre-line";
  ui.copy.textContent = copy;
  ui.start.innerHTML = `${buttonText} <span aria-hidden="true">↗</span>`;
  ui.screen.classList.remove("hidden");
}

function showMainMenu(resume = false) {
  ui.kicker.textContent = resume ? "AIRFIELD / FLIGHT PARKED" : "SKY PATROL AIRFIELD / FLIGHT DECK";
  ui.title.textContent = resume ? "YOUR FLIGHT\nIS SAVED" : "PILOT YOUR\nOWN SORTIE";
  ui.title.style.whiteSpace = "pre-line";
  ui.copy.textContent = resume ? "Your last flight is paused. Resume your campaign or choose the classic arcade game." : "Take the 3D cockpit, clear three levels, then face the Unlimited War Machine.";
  ui.start.innerHTML = `${resume ? "RESUME FLIGHT" : "START 3D CAMPAIGN"} <span aria-hidden="true">↗</span>`;
  ui.screen.classList.add("main-menu");
  ui.screen.classList.remove("hidden");
}

function hideScreen() {
  ui.screen.classList.add("hidden");
}

function enterImmersiveMode() {
  document.body.classList.add("flight-mode");
  flightScene.resize();
  if (document.fullscreenElement || fullscreenRequestInFlight || !gameSection.requestFullscreen) return;
  fullscreenRequestInFlight = true;
  gameSection.requestFullscreen({ navigationUI: "hide" }).catch(() => {}).finally(() => {
    fullscreenRequestInFlight = false;
    flightScene.resize();
  });
}

async function leaveFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    try { await document.exitFullscreen(); } catch { return; }
  }
}

function updateFullscreenButton() {
  const fullscreen = Boolean(document.fullscreenElement);
  ui.fullscreen.textContent = fullscreen ? "↙" : "⛶";
  ui.fullscreen.setAttribute("aria-label", fullscreen ? "Exit fullscreen" : "Enter fullscreen");
  ui.fullscreen.title = fullscreen ? "Exit fullscreen" : "Enter fullscreen";
}

function resetMission() {
  score = 0;
  lives = 3;
  stage = 1;
  elapsed = 0;
  missiles = 3;
  enemies = [];
  pendingContacts = [];
  shots = [];
  enemyShots = [];
  rockets = [];
  particles = [];
  aim = { x: 0.5, y: 0.43 };
  player = { x: gameWidth / 2, y: gameHeight * 0.72, invulnerable: 0, bank: 0 };
  ui.score.textContent = formatScore(score);
  ui.lives.textContent = String(lives);
  ui.lives.classList.remove("lives-empty");
  ui.missiles.textContent = String(missiles);
  beginStage();
}

function beginStage() {
  stageSize = stage <= 3 ? 5 + stage * 2 : 1;
  spawned = 0;
  kills = 0;
  missiles = 3;
  phaseTime = 0;
  spawnTimer = 1.1;
  enemyFireTimer = 1.55;
  shotTimer = 0;
  enemies = [];
  pendingContacts = [];
  shots = [];
  enemyShots = [];
  rockets = [];
  state = "takeoff";
  ui.stage.textContent = String(stage).padStart(2, "0");
  ui.missiles.textContent = String(missiles);
  ui.rocket.disabled = false;
  ui.zone.textContent = stage === 4 ? "WAR ZONE" : zones[(stage - 1) % zones.length];
  ui.bossHealth.hidden = stage !== 4;
  ui.bossFill.style.width = "100%";
  updateMissionHud();
  ui.pause.textContent = "Ⅱ";
  ui.pause.setAttribute("aria-label", "Pause game");
  hideScreen();
  flightScene.resize();
}

function updateMissionHud() {
  ui.enemies.textContent = stage === 4 ? "BOSS" : `${String(kills).padStart(2, "0")}/${String(stageSize).padStart(2, "0")}`;
  ui.progress.style.width = `${stage === 4 ? 100 : Math.min(100, (kills / stageSize) * 100)}%`;
}

function showEndScreen(victory) {
  state = victory ? "victory" : "gameOver";
  if (score > best) {
    best = score;
    storage.set("skyPatrolBest", String(best));
    ui.best.textContent = formatScore(best);
  }
  if (victory) {
    setScreen("AIRFIELD / CAMPAIGN COMPLETE", "WAR MACHINE\nDESTROYED", `All four levels cleared. Final score: ${formatScore(score)}.`, "FLY AGAIN");
  } else {
    setScreen("AIRFIELD / AIRCRAFT LOST", "SORTIE\nFAILED", `Final score: ${formatScore(score)}. You reached Level ${String(stage).padStart(2, "0")}.`, "RESTART CAMPAIGN");
  }
}

function togglePause() {
  if (["playing", "takeoff", "landing"].includes(state)) {
    pausedState = state;
    state = "paused";
    setScreen("FLIGHT CONTROL / STANDBY", "FLIGHT\nPAUSED", "Your aircraft is holding position. Resume when ready.", "RESUME FLIGHT");
    ui.pause.textContent = "▶";
    ui.pause.setAttribute("aria-label", "Resume game");
  } else if (state === "paused") {
    state = pausedState;
    ui.screen.classList.remove("main-menu");
    hideScreen();
    ui.pause.textContent = "Ⅱ";
    ui.pause.setAttribute("aria-label", "Pause game");
  }
}

function startOrResume() {
  enterImmersiveMode();
  if (state === "paused") {
    togglePause();
  } else if (state === "stageClear") {
    stage += 1;
    beginStage();
  } else {
    resetMission();
  }
}

function exitFlight() {
  if (["playing", "takeoff", "landing"].includes(state)) {
    pausedState = state;
    state = "paused";
    setScreen("FLIGHT PARKED", "MISSION\nPAUSED", "Your flight is saved here. Resume to continue.", "RESUME FLIGHT");
    ui.pause.textContent = "▶";
    ui.pause.setAttribute("aria-label", "Resume game");
  }
  document.body.classList.remove("flight-mode");
  leaveFullscreen();
  showMainMenu(state === "paused");
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    leaveFullscreen();
  } else {
    enterImmersiveMode();
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
  if (stage === 4) {
    showEndScreen(true);
    return;
  }
  state = "stageClear";
  if (score > best) {
    best = score;
    storage.set("skyPatrolBest", String(best));
    ui.best.textContent = formatScore(best);
  }
  const message = stage === 3 ? "All fighters down. The Unlimited War Machine is entering the combat zone." : `Score ${formatScore(score)}. Level ${stage + 1} brings a larger enemy wave.`;
  setScreen(`AIRFIELD / LEVEL ${String(stage).padStart(2, "0")} CLEARED`, `LEVEL ${String(stage).padStart(2, "0")}\nCOMPLETE`, message, stage === 3 ? "FACE THE WAR MACHINE" : "NEXT LEVEL");
}

function addIncomingContact() {
  const boss = stage === 4;
  const heavy = !boss && stage >= 2 && Math.random() < Math.min(0.12 + stage * 0.04, 0.48);
  const hp = boss ? 30 : heavy ? 3 : 1;
  const warningTime = boss ? 2.7 : 1.6;
  pendingContacts.push({
    id: nextEnemyId++,
    x: boss ? 0.5 : 0.37 + Math.random() * 0.26,
    timer: warningTime,
    warningTime,
    visualProgress: 0,
    enemy: {
      id: nextEnemyId,
      x: boss ? 0.5 : 0.37 + Math.random() * 0.26,
      progress: 0,
      speed: boss ? 0.075 : 0.22 + Math.random() * 0.03 + Math.min(stage * 0.012, 0.08),
      drift: boss ? 15 : (Math.random() - 0.5) * 65,
      phase: Math.random() * Math.PI * 2,
      hp,
      maxHp: hp,
      heavy,
      boss,
      hitFlash: 0
    }
  });
  pendingContacts[pendingContacts.length - 1].enemy.x = pendingContacts[pendingContacts.length - 1].x;
  spawned += 1;
  updateMissionHud();
}

function enemyPosition(enemy) {
  const progress = Math.min(1, enemy.progress);
  const widthFraction = enemy.boss ? 0.18 + progress * 0.06 : 0.12 + progress * 0.12;
  return {
    x: enemy.x * gameWidth + Math.sin(elapsed * 1.3 + enemy.phase) * enemy.drift * progress,
    y: gameHeight * 0.3 + progress * gameHeight * 0.18,
    scale: 0.36 + progress * (enemy.boss ? 2.3 : 0.82),
    radius: gameWidth * widthFraction * 0.48
  };
}

function fireGun() {
  const targetX = aim.x * gameWidth;
  const targetY = aim.y * gameHeight;
  for (const barrelOffset of [-14, 14]) {
    const x = player.x + barrelOffset;
    const y = player.y - 42;
    const distance = Math.hypot(targetX - x, targetY - y) || 1;
    shots.push({ x, y, vx: (targetX - x) / distance * 560, vy: (targetY - y) / distance * 560 });
  }
  playTone(145, 0.055, "square", 0.023);
}

function findAimTarget() {
  if (state !== "playing") return null;
  const targetX = aim.x * gameWidth;
  const targetY = aim.y * gameHeight;
  let lockedTarget = null;
  let closestDistance = Infinity;
  for (const enemy of enemies) {
    if (enemy.progress < 0.12 || enemy.progress > 0.96) continue;
    const position = enemyPosition(enemy);
    const distance = Math.hypot(targetX - position.x, targetY - position.y);
    const lockRadius = position.radius + 8;
    if (distance <= lockRadius && distance < closestDistance) {
      lockedTarget = enemy;
      closestDistance = distance;
    }
  }
  return lockedTarget;
}

function updateAimFromPointer(event) {
  const bounds = flightHost.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  aim.x = Math.max(0.01, Math.min(0.99, (event.clientX - bounds.left) / bounds.width));
  aim.y = Math.max(0.01, Math.min(0.99, (event.clientY - bounds.top) / bounds.height));
}

function syncAimReticle() {
  ui.aimReticle.style.left = `${aim.x * 100}%`;
  ui.aimReticle.style.top = `${aim.y * 100}%`;
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

function hitPlayer() {
  if (player.invulnerable > 0 || state !== "playing") return;
  lives -= 1;
  ui.lives.textContent = String(lives);
  player.invulnerable = 1.6;
  playTone(90, 0.35, "triangle", 0.07);
  if (lives <= 0) {
    ui.lives.classList.add("lives-empty");
    showEndScreen(false);
  }
}

function destroyEnemy(enemy, rocketHit = false) {
  if (enemy.destroyed) return;
  enemy.destroyed = true;
  kills += 1;
  score += enemy.boss ? (rocketHit ? 1500 : 250) : enemy.heavy ? (rocketHit ? 400 : 250) : (rocketHit ? 250 : 150);
  ui.score.textContent = formatScore(score);
  updateMissionHud();
  playTone(rocketHit ? 70 : 110, rocketHit ? 0.35 : 0.18, "sawtooth", rocketHit ? 0.055 : 0.03);
}

function impactEnemy(enemy, rocketHit = false) {
  if (enemy.destroyed) return;
  enemy.hp -= enemy.boss && rocketHit ? 7 : enemy.heavy && rocketHit ? 2 : 1;
  enemy.hitFlash = 0.15;
  if (enemy.boss) ui.bossFill.style.width = `${Math.max(0, enemy.hp / enemy.maxHp * 100)}%`;
  if (enemy.hp <= 0) destroyEnemy(enemy, rocketHit);
}

function update(delta) {
  if (["ready", "paused", "stageClear", "gameOver", "victory"].includes(state)) return;
  phaseTime += delta;
  elapsed += delta;
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
  const axisX = Math.max(-1, Math.min(1, Number(right) - Number(left) + joystickAxis.x));
  const axisY = Math.max(-1, Math.min(1, Number(down) - Number(up) + joystickAxis.y));
  player.x = Math.max(65, Math.min(gameWidth - 65, player.x + axisX * 330 * delta));
  player.y = Math.max(gameHeight * 0.59, Math.min(gameHeight * 0.83, player.y + axisY * 245 * delta));
  player.bank += (axisX - player.bank) * Math.min(delta * 7, 1);
  const aimAxisX = Number(keys.has("l") || keys.has("L")) - Number(keys.has("j") || keys.has("J"));
  const aimAxisY = Number(keys.has("k") || keys.has("K")) - Number(keys.has("i") || keys.has("I"));
  aim.x = Math.max(0.01, Math.min(0.99, aim.x + aimAxisX * delta * 0.7));
  aim.y = Math.max(0.01, Math.min(0.99, aim.y + aimAxisY * delta * 0.7));

  shotTimer -= delta;
  if ((keys.has(" ") || pressedControls.has("fire")) && shotTimer <= 0) {
    fireGun();
    shotTimer = 0.16;
  }
  spawnTimer -= delta;
  if (spawnTimer <= 0 && spawned < stageSize) {
    addIncomingContact();
    spawnTimer = stage === 4 ? 1000 : Math.max(0.63, 1.45 - stage * 0.08) + Math.random() * 0.4;
  }
  for (let index = pendingContacts.length - 1; index >= 0; index -= 1) {
    const contact = pendingContacts[index];
    contact.timer -= delta;
    contact.visualProgress = Math.min(0.18, Math.max(0, 1 - contact.timer / contact.warningTime) * 0.18);
    contact.enemy.progress = contact.visualProgress;
    if (contact.timer <= 0) {
      enemies.push(contact.enemy);
      pendingContacts.splice(index, 1);
    }
  }

  enemyFireTimer -= delta;
  if (enemyFireTimer <= 0 && enemies.length > 0) {
    const shooters = enemies.filter((enemy) => enemy.progress > 0.18 && !enemy.destroyed);
    if (shooters.length > 0) {
      const shooter = shooters[Math.floor(Math.random() * shooters.length)];
      const position = enemyPosition(shooter);
      const spread = shooter.boss ? [-0.22, 0, 0.22] : [0];
      for (const offset of spread) enemyShots.push({ x: position.x, y: position.y + 12, vx: (player.x - position.x) * 0.12 + offset * gameWidth, vy: shooter.boss ? 210 : 235 + stage * 8 });
    }
    enemyFireTimer = stage === 4 ? 0.88 : Math.max(0.72, 1.65 - stage * 0.06);
  }

  for (const enemy of enemies) {
    enemy.progress += enemy.speed * delta;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);
    if (enemy.progress >= 0.98) {
      const position = enemyPosition(enemy);
      if (Math.abs(position.x - player.x) < position.radius + 12) hitPlayer();
      enemy.progress = 0;
      enemy.x = enemy.boss ? 0.5 : 0.37 + Math.random() * 0.26;
      score = Math.max(0, score - (enemy.boss ? 100 : 25));
      ui.score.textContent = formatScore(score);
    }
  }
  enemies = enemies.filter((enemy) => !enemy.destroyed);

  for (const shot of shots) {
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
  }
  shots = shots.filter((shot) => shot.y > 100 && !shot.hit);
  for (const shot of shots) {
    for (const enemy of enemies) {
      const position = enemyPosition(enemy);
      if (Math.hypot(shot.x - position.x, shot.y - position.y) < position.radius) {
        shot.hit = true;
        impactEnemy(enemy);
        break;
      }
    }
  }
  shots = shots.filter((shot) => !shot.hit);
  enemies = enemies.filter((enemy) => !enemy.destroyed);

  for (const rocket of rockets) {
    if (!enemies.includes(rocket.target)) {
      rocket.done = true;
      continue;
    }
    const target = enemyPosition(rocket.target);
    const differenceX = target.x - rocket.x;
    const differenceY = target.y - rocket.y;
    const distance = Math.hypot(differenceX, differenceY) || 1;
    rocket.x += (differenceX / distance) * rocket.speed * delta;
    rocket.y += (differenceY / distance) * rocket.speed * delta;
    if (distance < (rocket.target.boss ? 70 : 24) || rocket.y < 100) {
      impactEnemy(rocket.target, true);
      rocket.done = true;
    }
  }
  rockets = rockets.filter((rocket) => !rocket.done);

  for (const shot of enemyShots) {
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
    if (Math.hypot(shot.x - player.x, shot.y - player.y) < 26) {
      shot.hit = true;
      hitPlayer();
    }
  }
  enemyShots = enemyShots.filter((shot) => shot.y < gameHeight + 20 && !shot.hit);
  for (const particle of particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta;
  }
  particles = particles.filter((particle) => particle.life > 0);

  if (state === "playing" && spawned === stageSize && pendingContacts.length === 0 && enemies.length === 0) completeStage();
  updateTimer();
  updateRadar();
}

function updateTimer() {
  const totalSeconds = Math.floor(elapsed);
  ui.timer.textContent = `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function updateRadar() {
  radarFrame += 1;
  if (radarFrame % 4 !== 0) return;
  ui.radar.replaceChildren();
  for (const enemy of enemies) {
    const position = enemyPosition(enemy);
    const dot = document.createElement("i");
    dot.className = `radar-dot${enemy.locked ? " radar-locked" : ""}${enemy.boss ? " radar-boss" : ""}`;
    dot.style.left = `${Math.max(5, Math.min(91, position.x / gameWidth * 100))}%`;
    dot.style.top = `${Math.max(5, Math.min(91, enemy.progress * 82 + 7))}%`;
    ui.radar.append(dot);
  }
  for (const contact of pendingContacts) {
    const dot = document.createElement("i");
    dot.className = `radar-dot radar-incoming${contact.enemy.boss ? " radar-boss" : ""}`;
    dot.style.left = `${Math.max(5, Math.min(91, contact.x * 100))}%`;
    dot.style.top = `${7 + contact.visualProgress * 82}%`;
    dot.setAttribute("aria-label", contact.enemy.boss ? "Boss incoming" : "Hostile aircraft incoming");
    ui.radar.append(dot);
  }
}

function frame(timestamp) {
  const delta = Math.min((timestamp - lastFrame) / 1000 || 0, 0.04);
  lastFrame = timestamp;
  update(delta);
  syncAimReticle();
  const lockedTarget = findAimTarget();
  for (const enemy of enemies) enemy.locked = enemy === lockedTarget;
  ui.aimReticle.classList.toggle("locked", Boolean(lockedTarget));
  flightScene.update({
    delta,
    elapsed,
    phaseTime,
    state,
    reduceMotion: reducedMotion.matches,
    cockpitView,
    player: { x: player.x / gameWidth, y: player.y / gameHeight, bank: player.bank },
    aim,
    aimTargetId: lockedTarget?.id ?? null,
    enemies,
    contacts: pendingContacts,
    shots,
    enemyShots,
    rockets
  });
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
  const radius = bounds.width * 0.34;
  joystickAxis = {
    x: Math.max(-1, Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / radius)),
    y: Math.max(-1, Math.min(1, (event.clientY - bounds.top - bounds.height / 2) / radius))
  };
  ui.joystick.querySelector(".joystick-knob").style.transform = `translate(${joystickAxis.x * radius * 0.55}px, ${joystickAxis.y * radius * 0.55}px)`;
}

function releaseJoystick() {
  joystickPointer = null;
  joystickAxis = { x: 0, y: 0 };
  ui.joystick.querySelector(".joystick-knob").style.transform = "translate(0, 0)";
}

ui.start.addEventListener("click", startOrResume);
ui.pause.addEventListener("click", togglePause);
ui.restart.addEventListener("click", () => {
  enterImmersiveMode();
  resetMission();
});
ui.fullscreen.addEventListener("click", toggleFullscreen);
ui.exit.addEventListener("click", exitFlight);
ui.quality.addEventListener("change", () => {
  storage.set("skyPatrolQuality", ui.quality.value);
  flightScene.setQuality(ui.quality.value);
});
ui.camera.addEventListener("click", () => {
  cockpitView = !cockpitView;
  ui.camera.setAttribute("aria-pressed", String(cockpitView));
  ui.camera.textContent = cockpitView ? "CHASE" : "COCKPIT";
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
ui.gun.addEventListener("lostpointercapture", () => pressedControls.delete("fire"));

function pointerIsOverFlightScene(event) {
  const bounds = flightHost.getBoundingClientRect();
  return event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
}
document.addEventListener("pointerdown", (event) => {
  if (!pointerIsOverFlightScene(event) || event.target.closest(".flight-hud") || !["playing", "takeoff"].includes(state)) return;
  event.preventDefault();
  aimPointer = event.pointerId;
  flightHost.setPointerCapture(event.pointerId);
  updateAimFromPointer(event);
});
document.addEventListener("pointermove", (event) => {
  if (!pointerIsOverFlightScene(event) || event.target.closest(".flight-hud")) return;
  if (event.pointerType === "mouse" || aimPointer === event.pointerId) updateAimFromPointer(event);
});
function releaseAim(event) {
  if (aimPointer === event.pointerId) aimPointer = null;
}
document.addEventListener("pointerup", releaseAim);
document.addEventListener("pointercancel", releaseAim);

document.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "i", "I", "j", "J", "k", "K", "l", "L"].includes(event.key)) event.preventDefault();
  keys.add(event.key);
  if (event.key.toLowerCase() === "p" && !event.repeat) togglePause();
  if (event.key.toLowerCase() === "x" && !event.repeat) launchRocket();
  if (event.key.toLowerCase() === "f" && !event.repeat) toggleFullscreen();
  if (event.key === "Enter" && !event.repeat && state !== "playing") startOrResume();
});
document.addEventListener("keyup", (event) => keys.delete(event.key));
window.addEventListener("blur", () => {
  keys.clear();
  pressedControls.clear();
  aimPointer = null;
  releaseJoystick();
});
document.addEventListener("fullscreenchange", () => {
  updateFullscreenButton();
  flightScene.resize();
});
window.addEventListener("beforeunload", () => flightScene.dispose());
