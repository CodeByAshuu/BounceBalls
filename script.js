/*
  2D Physics Playground
  - Circle bodies
  - Gravity, collisions, restitution
  - Spatial hash broadphase for performance
  - Fixed timestep integration for stability
  - Mouse interactions (spawn & drag)
*/

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const gravityInput = document.getElementById('gravity');
const restitutionInput = document.getElementById('restitution');
const addBtn = document.getElementById('addBall');
const clearBtn = document.getElementById('clear');
const pauseBtn = document.getElementById('pause');
const countEl = document.getElementById('count');
const fpsEl = document.getElementById('fps');

let W = 0, H = 0;
function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth = canvas.offsetWidth;
  H = canvas.clientHeight = canvas.offsetHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize);
resize();

// ---------- physics world ----------
const world = {
  bodies: [],
  gravity: 800, // px/s^2
  restitution: 0.8,
  timeStep: 1/120, // fixed physics step
  maxSubsteps: 6,
  cellSize: 80, // spatial hash cell size, tuned dynamically
};

class Body {
  constructor(x,y,r){
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.r = r; this.invMass = 1 / (Math.PI * r * r); // lighter when bigger
    this.color = `hsl(${Math.floor(Math.random()*360)} 70% 60%)`;
    this.id = Math.random().toString(36).slice(2,9);
  }
}

// spatial hash map
function hashKey(x,y,cellSize){
  const xi = Math.floor(x / cellSize);
  const yi = Math.floor(y / cellSize);
  return `${xi},${yi}`;
}

function buildSpatialHash(bodies, cellSize){
  const map = new Map();
  for(const b of bodies){
    const minX = Math.floor((b.x - b.r) / cellSize);
    const maxX = Math.floor((b.x + b.r) / cellSize);
    const minY = Math.floor((b.y - b.r) / cellSize);
    const maxY = Math.floor((b.y + b.r) / cellSize);
    for(let xi=minX; xi<=maxX; xi++){
      for(let yi=minY; yi<=maxY; yi++){
        const key = xi+','+yi;
        if(!map.has(key)) map.set(key, []);
        map.get(key).push(b);
      }
    }
  }
  return map;
}

// collision resolution between two circles
function resolveCircleCircle(a,b){
  const dx = b.x - a.x; const dy = b.y - a.y;
  const dist = Math.hypot(dx,dy) || 1e-6;
  const overlap = a.r + b.r - dist;
  if(overlap > 0){
    // normalize
    const nx = dx / dist; const ny = dy / dist;
    // push apart proportionally to inverse mass
    const invMassSum = a.invMass + b.invMass;
    const push = Math.max(overlap, 0) / invMassSum;
    a.x -= nx * push * a.invMass;
    a.y -= ny * push * a.invMass;
    b.x += nx * push * b.invMass;
    b.y += ny * push * b.invMass;

    // relative velocity
    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const relVelAlongNormal = rvx * nx + rvy * ny;
    if(relVelAlongNormal > 0) return; // separating

    const e = Math.min(world.restitution, world.restitution);
    const j = -(1 + e) * relVelAlongNormal / invMassSum;
    const impulseX = j * nx; const impulseY = j * ny;
    a.vx -= impulseX * a.invMass;
    a.vy -= impulseY * a.invMass;
    b.vx += impulseX * b.invMass;
    b.vy += impulseY * b.invMass;
  }
}

// integrate velocities and positions
function integrate(b, dt){
  b.vy += world.gravity * dt; // gravity
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

function collideWorldBounds(b){
  // left
  if(b.x - b.r < 0){ b.x = b.r; b.vx = -b.vx * world.restitution; }
  // right
  if(b.x + b.r > W){ b.x = W - b.r; b.vx = -b.vx * world.restitution; }
  // top
  if(b.y - b.r < 0){ b.y = b.r; b.vy = -b.vy * world.restitution; }
  // bottom
  if(b.y + b.r > H){ b.y = H - b.r; b.vy = -b.vy * world.restitution; }
}

// physics step using spatial hash
function physicsStep(dt){
  // integrate
  for(const b of world.bodies) integrate(b, dt);
  // rebuild spatial hash
  const cellSize = world.cellSize;
  const map = buildSpatialHash(world.bodies, cellSize);
  // test collisions within cells
  for(const [k, list] of map.entries()){
    const n = list.length;
    for(let i=0;i<n;i++){
      const A = list[i];
      for(let j=i+1;j<n;j++){
        const B = list[j];
        resolveCircleCircle(A,B);
      }
    }
  }
  // world bounds
  for(const b of world.bodies) collideWorldBounds(b);
}

// ---------- rendering ----------
function clear(){ ctx.fillStyle = '#021027'; ctx.fillRect(0,0,W,H); }
function draw(){
  clear();
  // draw bodies
  for(const b of world.bodies){
    ctx.beginPath();
    ctx.fillStyle = b.color;
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();
    // subtle rim
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke();
  }
}

// ---------- controls & UI ----------
gravityInput.addEventListener('input', ()=> world.gravity = Number(gravityInput.value));
restitutionInput.addEventListener('input', ()=> world.restitution = Number(restitutionInput.value));
addBtn.addEventListener('click', ()=> spawnRandom());
clearBtn.addEventListener('click', ()=> { world.bodies.length = 0; updateCount(); });
let paused = false;
pauseBtn.addEventListener('click', ()=> { paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; });

function spawnRandom(){
  const r = 8 + Math.random()*28;
  const x = 60 + Math.random()*(W-120);
  const y = 60 + Math.random()*(H-120);
  const b = new Body(x,y,r);
  b.vx = (Math.random()-0.5)*200;
  b.vy = (Math.random()-0.5)*200;
  world.bodies.push(b);
  updateCount();
}

function updateCount(){ countEl.textContent = world.bodies.length; }

// mouse interactions
let mouse = {x:0,y:0,down:false,dragging:null,prevX:0,prevY:0};
canvas.addEventListener('pointerdown', (e)=>{
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left);
  mouse.y = (e.clientY - rect.top);
  mouse.down = true;
  // find nearest body within radius
  for(let i = world.bodies.length-1; i>=0; i--){
    const b = world.bodies[i];
    const dx = mouse.x - b.x, dy = mouse.y - b.y;
    if(dx*dx + dy*dy <= b.r*b.r){ mouse.dragging = b; break; }
  }
  if(!mouse.dragging){
    // spawn new
    const r = 10 + Math.random()*24;
    const b = new Body(mouse.x, mouse.y, r);
    world.bodies.push(b);
    updateCount();
    mouse.dragging = b;
  }
  mouse.prevX = mouse.x; mouse.prevY = mouse.y;
});
canvas.addEventListener('pointermove', (e)=>{
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left);
  mouse.y = (e.clientY - rect.top);
  if(mouse.down && mouse.dragging){
    // move body to mouse (kinematic drag)
    const b = mouse.dragging;
    b.x = mouse.x; b.y = mouse.y;
    b.vx = (mouse.x - mouse.prevX) * 60; // estimate velocity
    b.vy = (mouse.y - mouse.prevY) * 60;
    mouse.prevX = mouse.x; mouse.prevY = mouse.y;
  }
});
window.addEventListener('pointerup', ()=>{ mouse.down=false; mouse.dragging=null; });

// ---------- main loop (fixed timestep) ----------
let last = performance.now();
let acc = 0;
let fpsCounter = { lastTime: performance.now(), frames: 0 };

function loop(now){
  const maxDt = 0.05; // clamp
  let dt = (now - last) / 1000;
  if(dt > maxDt) dt = maxDt;
  last = now;
  if(!paused){
    acc += dt;
    const step = world.timeStep;
    let substeps = 0;
    while(acc >= step && substeps < world.maxSubsteps){
      physicsStep(step);
      acc -= step; substeps++;
    }
  }
  draw();

  // fps
  fpsCounter.frames++;
  if(now - fpsCounter.lastTime >= 500){
    const fps = Math.round((fpsCounter.frames * 1000) / (now - fpsCounter.lastTime));
    fpsEl.textContent = fps;
    fpsCounter.lastTime = now; fpsCounter.frames = 0;
  }

  requestAnimationFrame(loop);
}

// tune cell size based on average radius
function tuneCellSize(){
  if(world.bodies.length === 0) return;
  let sum = 0; for(const b of world.bodies) sum += b.r;
  const avg = sum / world.bodies.length;
  world.cellSize = Math.max(40, Math.min(120, avg * 4));
}

// initial fill
for(let i=0;i<14;i++) spawnRandom();
updateCount();

// responsive canvas initial size
function fitCanvas(){
  // make canvas fill available area
  const rect = canvas.getBoundingClientRect();
  if(rect.width === 0){
    // first render; compute from computed style
    canvas.style.width = '100%';
    canvas.style.height = '600px';
  }
  resize();
}
fitCanvas();

// auto-tune and start loop
setInterval(tuneCellSize, 1200);
requestAnimationFrame(loop);