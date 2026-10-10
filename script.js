const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const stageEl = document.getElementById("stage");
const livesEl = document.getElementById("lives");
const screen = document.getElementById("screen");
const screenKicker = document.getElementById("screen-kicker");
const screenTitle = document.getElementById("screen-title");
const screenCopy = document.getElementById("screen-copy");
const startButton = document.getElementById("start");
const pauseButton = document.getElementById("pause");
const joystick = document.getElementById("joystick");
const joystickKnob = joystick.querySelector(".joystick-knob");
const rocketButton = document.getElementById("rocket");
const missilesEl = document.getElementById("missiles");

const width = canvas.width;
const height = canvas.height;
const keys = new Set();
const controls = new Set();
const stars = Array.from({ length: 150 }, (_, index) => ({
  x: (index * 173 + 41) % width,
  y: (index * 307 + 17) % height,
  size: index % 7 === 0 ? 2 : 1,
  speed: 18 + (index % 5) * 15,
  color: index % 9 === 0 ? "#ffd18d" : index % 4 === 0 ? "#a9bbff" : "#e5ebff"
}));
const galaxyCanvas = document.createElement("canvas");
galaxyCanvas.width = width;
galaxyCanvas.height = height;
const galaxyCtx = galaxyCanvas.getContext("2d");

let best = Number(localStorage.getItem("skyPatrolBest") || 0);
let player;
let enemies;
let shots;
let enemyShots;
let particles;
let score;
let lives;
let stage = 1;
let stageSize = 0;
let spawnedThisStage = 0;
let spawnTimer;
let enemyFireTimer;
let shotTimer;
let elapsed;
let lastFrame = 0;
let gameState = "ready";
let missiles;

bestEl.textContent = formatScore(best);
buildGalaxy();

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function resetGame() {
  player = { x: width / 2, y: height - 66, width: 34, height: 42, invulnerable: 0 };
  enemies = [];
  shots = [];
  enemyShots = [];
  particles = [];
  score = 0;
  lives = 3;
  missiles = 3;
  stage = 1;
  elapsed = 0;
  scoreEl.textContent = formatScore(score);
  livesEl.textContent = String(lives);
  livesEl.classList.remove("lives-empty");
  missilesEl.textContent = String(missiles);
  rocketButton.disabled = false;
  pauseButton.textContent = "Ⅱ";
  pauseButton.setAttribute("aria-label", "Pause game");
  beginStage();
}

function beginStage() {
  enemies = [];
  shots = [];
  enemyShots = [];
  stageSize = 5 + stage * 2;
  spawnedThisStage = 0;
  spawnTimer = 0.6;
  enemyFireTimer = 1.3;
  shotTimer = 0;
  stageEl.textContent = String(stage).padStart(2, "0");
  gameState = "playing";
  screen.classList.add("hidden");
}

function showScreen(kicker, title, copy, buttonLabel) {
  screenKicker.textContent = kicker;
  screenTitle.textContent = title;
  screenTitle.style.whiteSpace = "pre-line";
  screenCopy.textContent = copy;
  startButton.innerHTML = `${buttonLabel} <span aria-hidden="true">↗</span>`;
  screen.classList.remove("hidden");
}

function endGame() {
  gameState = "gameOver";
  if (score > best) {
    best = score;
    localStorage.setItem("skyPatrolBest", String(best));
    bestEl.textContent = formatScore(best);
  }
  showScreen("FLIGHT CONTROL / SORTIE ENDED", "SORTIE\nOVER", `Final score: ${formatScore(score)}. Ready for another flight?`, "FLY AGAIN");
}

function completeStage() {
  gameState = "stageClear";
  showScreen(`SECTOR ${String(stage).padStart(2, "0")} CLEARED`, `STAGE ${String(stage).padStart(2, "0")}\nCOMPLETE`, "All hostile aircraft eliminated. Prepare for the next wave.", "NEXT STAGE");
}

function togglePause() {
  if (gameState === "playing") {
    gameState = "paused";
    showScreen("FLIGHT CONTROL / STANDBY", "MISSION\nPAUSED", "Take a breath. The sky can wait.", "RESUME FLIGHT");
    pauseButton.textContent = "▶";
    pauseButton.setAttribute("aria-label", "Resume game");
  } else if (gameState === "paused") {
    gameState = "playing";
    pauseButton.textContent = "Ⅱ";
    pauseButton.setAttribute("aria-label", "Pause game");
    screen.classList.add("hidden");
  }
}

function startOrResume() {
  if (gameState === "paused") {
    togglePause();
  } else if (gameState === "stageClear") {
    stage += 1;
    beginStage();
  } else {
    resetGame();
  }
}

function spawnEnemy() {
  const x = 46 + Math.random() * (width - 92);
  const tough = stage >= 2 && Math.random() < Math.min(0.15 + stage * 0.04, 0.5);
  enemies.push({
    x,
    y: -30,
    radius: tough ? 19 : 15,
    speed: 85 + Math.random() * 45 + Math.min(stage * 8, 100),
    drift: (Math.random() - 0.5) * 48,
    phase: Math.random() * Math.PI * 2,
    hp: tough ? 2 : 1,
    tough
  });
}

function fireShot() {
  shots.push({ x: player.x, y: player.y - 24, speed: 440 });
  particles.push({ x: player.x, y: player.y - 28, vx: 0, vy: -35, life: 0.12, color: "#c8f169", size: 4 });
}

function fireRocket() {
  if (gameState !== "playing" || missiles <= 0) return;
  missiles -= 1;
  missilesEl.textContent = String(missiles);
  rocketButton.disabled = missiles === 0;
  shots.push({ x: player.x, y: player.y - 24, speed: 300, damage: 2, rocket: true });
}

function burst(x, y, color, amount = 10) {
  for (let index = 0; index < amount; index += 1) {
    const angle = (Math.PI * 2 * index) / amount;
    const speed = 45 + Math.random() * 110;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.35,
      color,
      size: 2 + Math.random() * 3
    });
  }
}

function hitPlayer() {
  if (player.invulnerable > 0) return;
  lives -= 1;
  livesEl.textContent = String(lives);
  player.invulnerable = 1.35;
  burst(player.x, player.y, "#ff805c", 16);
  if (lives <= 0) {
    livesEl.classList.add("lives-empty");
    endGame();
  }
}

function update(delta) {
  if (gameState !== "playing") return;
  elapsed += delta;
  player.invulnerable = Math.max(0, player.invulnerable - delta);

  const movingLeft = keys.has("ArrowLeft") || keys.has("a") || keys.has("A") || controls.has("left");
  const movingRight = keys.has("ArrowRight") || keys.has("d") || keys.has("D") || controls.has("right");
  if (movingLeft) player.x -= 330 * delta;
  if (movingRight) player.x += 330 * delta;
  player.x = Math.max(22, Math.min(width - 22, player.x));

  shotTimer -= delta;
  if ((keys.has(" ") || controls.has("fire")) && shotTimer <= 0) {
    fireShot();
    shotTimer = 0.19;
  }

  spawnTimer -= delta;
  if (spawnTimer <= 0 && spawnedThisStage < stageSize) {
    spawnEnemy();
    spawnedThisStage += 1;
    spawnTimer = Math.max(0.38, 0.95 - stage * 0.035) + Math.random() * 0.35;
  }

  enemyFireTimer -= delta;
  if (enemyFireTimer <= 0 && enemies.length > 0) {
    const shooter = enemies[Math.floor(Math.random() * enemies.length)];
    enemyShots.push({
      x: shooter.x,
      y: shooter.y + 12,
      vx: Math.max(-75, Math.min(75, (player.x - shooter.x) * 0.16)),
      speed: 185 + Math.min(stage * 8, 90)
    });
    enemyFireTimer = Math.max(0.55, 1.55 - stage * 0.06);
  }

  for (const enemy of enemies) {
    enemy.y += enemy.speed * delta;
    enemy.x += Math.sin(elapsed * 1.8 + enemy.phase) * enemy.drift * delta;
    if (enemy.y > height + 20) {
      enemy.y = -24;
      enemy.x = 42 + Math.random() * (width - 84);
    }
    if (player.invulnerable <= 0 && Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.radius + 16) {
      enemy.destroyed = true;
      hitPlayer();
      burst(enemy.x, enemy.y, "#ff805c", 8);
    }
  }
  enemies = enemies.filter((enemy) => !enemy.destroyed);

  for (const shot of shots) shot.y -= shot.speed * delta;
  shots = shots.filter((shot) => shot.y > -10 && !shot.hit);
  for (const shot of enemyShots) {
    shot.x += (shot.vx || 0) * delta;
    shot.y += shot.speed * delta;
  }
  enemyShots = enemyShots.filter((shot) => shot.y < height + 12 && !shot.hit);

  for (const shot of shots) {
    for (const enemy of enemies) {
      if (Math.hypot(shot.x - enemy.x, shot.y - enemy.y) < enemy.radius + 5) {
        shot.hit = true;
        enemy.hp -= shot.damage || 1;
        if (enemy.hp <= 0) {
          enemy.destroyed = true;
          score += enemy.tough ? 200 : 100;
          scoreEl.textContent = formatScore(score);
          burst(enemy.x, enemy.y, enemy.tough ? "#ffb75e" : "#ff805c");
        } else {
          burst(enemy.x, enemy.y, "#ffcf7a", 5);
        }
        break;
      }
    }
  }
  enemies = enemies.filter((enemy) => !enemy.destroyed);
  shots = shots.filter((shot) => !shot.hit);

  for (const shot of enemyShots) {
    if (Math.hypot(shot.x - player.x, shot.y - player.y) < 20) {
      shot.hit = true;
      hitPlayer();
    }
  }
  enemyShots = enemyShots.filter((shot) => !shot.hit);

  for (const particle of particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta;
  }
  particles = particles.filter((particle) => particle.life > 0);

  if (gameState === "playing" && spawnedThisStage === stageSize && enemies.length === 0) completeStage();
}

function buildGalaxy() {
  const background = galaxyCtx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#080d20");
  background.addColorStop(0.52, "#10162d");
  background.addColorStop(1, "#07151e");
  galaxyCtx.fillStyle = background;
  galaxyCtx.fillRect(0, 0, width, height);

  const nebula = (x, y, radius, color) => {
    const glow = galaxyCtx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(9, 14, 32, 0)");
    galaxyCtx.fillStyle = glow;
    galaxyCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  nebula(210, 185, 290, "rgba(69, 82, 173, .32)");
  nebula(735, 300, 340, "rgba(47, 126, 151, .25)");
  nebula(470, 500, 230, "rgba(167, 77, 104, .16)");

  galaxyCtx.save();
  galaxyCtx.translate(555, 250);
  galaxyCtx.rotate(-0.24);
  galaxyCtx.scale(1, 0.42);
  const core = galaxyCtx.createRadialGradient(0, 0, 8, 0, 0, 245);
  core.addColorStop(0, "rgba(255, 226, 177, .42)");
  core.addColorStop(0.18, "rgba(177, 157, 255, .2)");
  core.addColorStop(0.55, "rgba(83, 126, 188, .1)");
  core.addColorStop(1, "rgba(34, 58, 115, 0)");
  galaxyCtx.fillStyle = core;
  galaxyCtx.beginPath();
  galaxyCtx.arc(0, 0, 245, 0, Math.PI * 2);
  galaxyCtx.fill();
  for (let arm = 0; arm < 3; arm += 1) {
    for (let index = 0; index < 180; index += 1) {
      const progress = index / 180;
      const angle = progress * 5.2 + arm * (Math.PI * 2 / 3);
      const radius = 22 + progress * 210;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      galaxyCtx.globalAlpha = 0.06 + (1 - progress) * 0.16;
      galaxyCtx.fillStyle = (index + arm) % 5 === 0 ? "#ffd9ad" : "#b8c4ff";
      galaxyCtx.fillRect(x, y, 2 + (index % 3), 2 + (index % 3));
    }
  }
  galaxyCtx.restore();
  galaxyCtx.globalAlpha = 1;

  const planet = galaxyCtx.createRadialGradient(778, 105, 4, 778, 105, 48);
  planet.addColorStop(0, "#d7d0c3");
  planet.addColorStop(0.58, "#8f9ca9");
  planet.addColorStop(1, "rgba(71, 92, 123, .08)");
  galaxyCtx.fillStyle = planet;
  galaxyCtx.beginPath();
  galaxyCtx.arc(778, 105, 48, 0, Math.PI * 2);
  galaxyCtx.fill();
  galaxyCtx.strokeStyle = "rgba(194, 207, 221, .38)";
  galaxyCtx.lineWidth = 2;
  galaxyCtx.beginPath();
  galaxyCtx.ellipse(778, 105, 67, 15, -0.18, 0, Math.PI * 2);
  galaxyCtx.stroke();
}

function drawPlane(x, y, enemy = false, damaged = false) {
  ctx.save();
  ctx.translate(x, y);
  if (enemy) ctx.rotate(Math.PI);
  ctx.fillStyle = enemy ? (damaged ? "#ffc36e" : "#ff805c") : "#d7e3cb";
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(6, -4);
  ctx.lineTo(21, 9);
  ctx.lineTo(20, 14);
  ctx.lineTo(6, 11);
  ctx.lineTo(4, 20);
  ctx.lineTo(10, 24);
  ctx.lineTo(10, 27);
  ctx.lineTo(0, 24);
  ctx.lineTo(-10, 27);
  ctx.lineTo(-10, 24);
  ctx.lineTo(-4, 20);
  ctx.lineTo(-6, 11);
  ctx.lineTo(-20, 14);
  ctx.lineTo(-21, 9);
  ctx.lineTo(-6, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = enemy ? "#662f2a" : "#64827c";
  ctx.beginPath();
  ctx.ellipse(0, -3, 3, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!enemy) {
    ctx.shadowColor = "#ffb75e";
    ctx.shadowBlur = 13;
    ctx.fillStyle = "#ffb75e";
    ctx.fillRect(-3, 19, 2, 9 + Math.random() * 8);
    ctx.fillRect(1, 19, 2, 9 + Math.random() * 8);
  }
  ctx.restore();
}

function render(delta) {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(galaxyCanvas, 0, 0);

  ctx.fillStyle = "#ffffff";
  for (const star of stars) {
    star.y += star.speed * delta * (gameState === "playing" ? 1 : 0.25);
    if (star.y > height) star.y = 0;
    ctx.globalAlpha = 0.35 + ((star.x + Math.floor(elapsed * 12)) % 5) / 8;
    ctx.fillStyle = star.color;
    ctx.fillRect(star.x, star.y, star.size, star.size * 2);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(200, 241, 105, .07)";
  ctx.lineWidth = 1;
  for (let y = 110; y < height; y += 100) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  for (const shot of shots) {
    ctx.fillStyle = shot.rocket ? "#ffb75e" : "#d8ff8a";
    ctx.shadowColor = shot.rocket ? "#ff805c" : "#c8f169";
    ctx.shadowBlur = shot.rocket ? 16 : 12;
    ctx.fillRect(shot.x - (shot.rocket ? 4 : 2), shot.y - (shot.rocket ? 12 : 8), shot.rocket ? 8 : 4, shot.rocket ? 24 : 16);
  }
  ctx.shadowBlur = 0;
  for (const shot of enemyShots) {
    ctx.fillStyle = "#ff805c";
    ctx.shadowColor = "#ff805c";
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  for (const enemy of enemies) drawPlane(enemy.x, enemy.y, true, enemy.hp < 2);
  if (player && (player.invulnerable <= 0 || Math.floor(elapsed * 12) % 2 === 0)) drawPlane(player.x, player.y);

  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life / 0.7);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function frame(timestamp) {
  const delta = Math.min((timestamp - lastFrame) / 1000 || 0, 0.04);
  lastFrame = timestamp;
  update(delta);
  render(delta);
  requestAnimationFrame(frame);
}

startButton.addEventListener("click", startOrResume);
pauseButton.addEventListener("click", togglePause);

document.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
  keys.add(event.key);
  if (event.key.toLowerCase() === "p" && !event.repeat) togglePause();
  if ((event.key === "Enter" || event.key === " ") && gameState !== "playing") startOrResume();
});

document.addEventListener("keyup", (event) => keys.delete(event.key));
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "x" && !event.repeat) fireRocket();
});
window.addEventListener("blur", () => {
  keys.clear();
  controls.clear();
  joystick.style.setProperty("--stick-x", "0px");
  joystick.classList.remove("is-active");
});

let joystickPointer = null;
function moveJoystick(event) {
  const bounds = joystick.getBoundingClientRect();
  const center = bounds.left + bounds.width / 2;
  const offset = Math.max(-bounds.width * 0.35, Math.min(bounds.width * 0.35, event.clientX - center));
  const direction = offset / (bounds.width * 0.35);
  joystick.style.setProperty("--stick-x", `${offset}px`);
  controls.delete("left");
  controls.delete("right");
  if (direction < -0.2) controls.add("left");
  if (direction > 0.2) controls.add("right");
}
function releaseJoystick(event) {
  if (joystickPointer !== event.pointerId) return;
  joystickPointer = null;
  controls.delete("left");
  controls.delete("right");
  joystick.style.setProperty("--stick-x", "0px");
  joystick.classList.remove("is-active");
}
joystick.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  joystick.classList.add("is-active");
  moveJoystick(event);
});
joystick.addEventListener("pointermove", (event) => {
  if (joystickPointer === event.pointerId) moveJoystick(event);
});
joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);
joystick.addEventListener("lostpointercapture", releaseJoystick);
rocketButton.addEventListener("click", fireRocket);

for (const button of document.querySelectorAll("[data-control]")) {
  const control = button.dataset.control;
  const release = () => {
    controls.delete(control);
    button.classList.remove("is-active");
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    controls.add(control);
    button.classList.add("is-active");
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

player = { x: width / 2, y: height - 66, invulnerable: 0 };
enemies = [];
shots = [];
enemyShots = [];
particles = [];
render(0);
requestAnimationFrame(frame);