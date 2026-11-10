'use strict';
/* Classroom Earthquake Survival — pure WebGL, no external libraries. */
(function () {
  // =====================================================================
  // Setup
  // =====================================================================
  const canvas = document.getElementById('game');
  const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
  const ui = {
    hud: document.getElementById('hud'),
    status: document.getElementById('status'),
    message: document.getElementById('message'),
    hint: document.getElementById('hint'),
    menu: document.getElementById('menu'),
    complete: document.getElementById('complete'),
    start: document.getElementById('startBtn'),
    again: document.getElementById('againBtn'),
  };
  if (!gl) {
    document.getElementById('fatal').classList.remove('hidden');
    ui.menu.classList.add('hidden');
    return;
  }

  const VS = `
    attribute vec3 aPos; attribute vec3 aNor;
    uniform mat4 uProj, uView, uModel; uniform float uYaw;
    varying vec3 vN; varying vec3 vW; varying float vDepth;
    void main() {
      vec4 w = uModel * vec4(aPos, 1.0);
      vW = w.xyz;
      float c = cos(uYaw), s = sin(uYaw);
      vN = vec3(c * aNor.x + s * aNor.z, aNor.y, -s * aNor.x + c * aNor.z);
      vec4 v = uView * w;
      vDepth = -v.z;
      gl_Position = uProj * v;
    }`;
  const FS = `
    precision mediump float;
    uniform vec3 uColor; uniform float uEmis, uAlpha, uPat;
    varying vec3 vN; varying vec3 vW; varying float vDepth;
    void main() {
      vec3 n = normalize(vN);
      vec3 col = uColor;
      if (uPat > 2.5) {            // sky gradient for windows
        col = mix(vec3(0.62, 0.82, 0.98), vec3(0.28, 0.55, 0.92), clamp((vW.y - 1.0) / 1.4, 0.0, 1.0));
        if (vW.y < 1.25) col = vec3(0.42, 0.68, 0.36);
      } else if (uPat > 1.5) {     // ceiling tiles
        vec2 g = fract(vW.xz / 1.2);
        if (g.x < 0.03 || g.y < 0.03) col *= 0.82;
      } else if (uPat > 0.5) {     // wooden planks
        float plank = floor(vW.x * 3.0);
        float r = fract(sin(plank * 12.9898) * 43758.5453);
        float seg = fract(vW.z * 0.4 + r);
        col *= 0.86 + 0.18 * r + 0.04 * sin(vW.z * 9.0 + r * 20.0);
        if (fract(vW.x * 3.0) < 0.05 || seg < 0.012) col *= 0.65;
      }
      vec3 L = normalize(vec3(-0.6, 0.8, 0.25));
      float d = max(dot(n, L), 0.0);
      float hemi = 0.5 + 0.5 * n.y;
      float pool = 0.25 * exp(-dot(vW.xz, vW.xz) * 0.012);
      vec3 lit = col * (vec3(0.40, 0.37, 0.33) + vec3(1.0, 0.9, 0.74) * d * 0.55 + hemi * vec3(0.2, 0.18, 0.15) + pool);
      lit = mix(lit, col, uEmis);
      float fog = clamp((vDepth - 12.0) / 30.0, 0.0, 0.35);
      lit = mix(lit, vec3(0.95, 0.88, 0.78), fog);
      gl_FragColor = vec4(lit, uAlpha);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const loc = {};
  ['uProj', 'uView', 'uModel', 'uYaw', 'uColor', 'uEmis', 'uAlpha', 'uPat'].forEach(n => (loc[n] = gl.getUniformLocation(prog, n)));
  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aNor = gl.getAttribLocation(prog, 'aNor');

  // Unit cube geometry (centered at origin, size 1)
  (function buildCube() {
    const faces = [
      [[1, 0, 0], [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]]],
      [[-1, 0, 0], [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]]],
      [[0, 1, 0], [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]]],
      [[0, -1, 0], [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]]],
      [[0, 0, 1], [[.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [-.5, -.5, .5]]],
      [[0, 0, -1], [[-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [.5, -.5, -.5]]],
    ];
    const data = [], idx = [];
    faces.forEach((f, i) => {
      f[1].forEach(v => data.push(v[0], v[1], v[2], f[0][0], f[0][1], f[0][2]));
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aNor);
    gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 24, 12);
  })();

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Scene graph: groups with transforms, parts are boxes relative to a group
  const settings = { sensitivity: 1, volume: 0.6, fov: 72, cameraShake: true };
  const scenarios = {
    classroom: { name: 'Classroom', intro: 'Mr.Talha is starting class...', description: 'Tip: Move the chairs with left click hold' },
    gym: { name: 'Gym', intro: 'Mr.Talha is starting gym ', description: 'Tip: Stay away from the bsaketball hoops' },
    library: { name: 'Library', intro: '', description: 'Tip: stay way from the bookshelfs' },
    bathroom: { name: 'Bathroom', intro: 'u are in the school washroom...', description: 'Tip: stay away from mirrors' },
    recess: { name: 'Recess', intro: '', description: 'Tip: stay away from playstructures' },
  };
  let selectedScenario = 'classroom';
  let paused = false, settingsFrom = 'menu', heldChair = null, holdDistance = 0, leftHeld = false;
  const chairs = [];
  const objects = [];
  const groups = [];
  function makeGroup(x, z, yaw) {
    const g = { x, y: 0, z, yaw: yaw || 0, bx: x, bz: z, shakeX: 0, shakeY: 0, shakeZ: 0, tags: {} };
    groups.push(g);
    return g;
  }
  function box(g, x, y, z, sx, sy, sz, color, opt) {
    opt = opt || {};
    objects.push({ g, p: [x, y, z], s: [sx, sy, sz], c: typeof color === 'string' ? hex(color) : color, e: opt.e || 0, a: opt.a == null ? 1 : opt.a, pat: opt.pat || 0, tag: opt.tag || null });
  }

  // =====================================================================
  // Classroom
  // =====================================================================
  const ROOM = { x0: -7, x1: 7, z0: -9, z1: 9, h: 3.2 };
  const obstacles = []; // {x0,x1,z0,z1,low}
  const room = makeGroup(0, 0, 0);

  function buildClassroom() {
    const wall = '#efe6d4', trim = '#b88b5a';
    box(room, 0, -0.05, 0, 14, 0.1, 18, '#b07a45', { pat: 1 });                 // floor
    box(room, 0, ROOM.h + 0.05, 0, 14, 0.1, 18, '#f4f1ea', { pat: 2 });         // ceiling
    box(room, 0, 1.6, 9.05, 14.2, 3.2, 0.1, wall);                              // back wall
    box(room, 0, 1.6, -9.05, 14.2, 3.2, 0.1, wall);                             // front wall
    box(room, 7.05, 1.6, 0, 0.1, 3.2, 18.2, wall);                              // right wall
    box(room, -7.05, 1.6, 0, 0.1, 3.2, 18.2, '#f2e9d6');                        // left (window) wall
    // baseboards
    box(room, 0, 0.06, 8.98, 14, 0.12, 0.04, trim);
    box(room, 0, 0.06, -8.98, 14, 0.12, 0.04, trim);
    box(room, 6.98, 0.06, 0, 0.04, 0.12, 18, trim);
    box(room, -6.98, 0.06, 0, 0.04, 0.12, 18, trim);

    // Windows on the left wall with blue sky
    [-5, 0, 5].forEach(z => {
      box(room, -6.99, 1.75, z, 0.02, 1.4, 3, '#88c4f5', { e: 1, pat: 3 });
      box(room, -6.96, 1.03, z, 0.08, 0.06, 3.1, '#ffffff');
      box(room, -6.96, 2.47, z, 0.08, 0.06, 3.1, '#ffffff');
      box(room, -6.96, 1.75, z - 1.52, 0.08, 1.5, 0.06, '#ffffff');
      box(room, -6.96, 1.75, z + 1.52, 0.08, 1.5, 0.06, '#ffffff');
      box(room, -6.96, 1.75, z, 0.06, 1.4, 0.05, '#ffffff');
      box(room, -6.85, 0.98, z, 0.3, 0.05, 3.2, '#e9e2d3');                    // sill
    });

    // Whiteboard
    box(room, 0, 1.65, -8.97, 6.2, 1.7, 0.06, '#9aa1a8');
    box(room, 0, 1.65, -8.93, 6, 1.5, 0.04, '#fbfcfd', { e: 0.35 });
    box(room, 0, 0.88, -8.85, 6, 0.05, 0.16, '#9aa1a8');                       // marker tray
    box(room, -1.5, 0.92, -8.82, 0.15, 0.04, 0.04, '#d33');
    box(room, -1.2, 0.92, -8.82, 0.15, 0.04, 0.04, '#2650c7');
    // "writing" on board
    [[-2.2, 2.15, 2.0, '#2650c7'], [-2.0, 1.95, 2.6, '#333'], [-2.1, 1.75, 1.6, '#333'], [-1.9, 1.55, 2.4, '#333'], [1.6, 2.1, 1.6, '#c62828'], [1.7, 1.6, 1.2, '#2e7d32']].forEach(w => {
      box(room, w[0] + w[2] / 2, w[1], -8.9, w[2], 0.05, 0.02, w[3], { e: 0.3 });
    });
    box(room, 1.4, 1.85, -8.9, 0.05, 0.5, 0.02, '#c62828', { e: 0.3 });

    // Clock
    box(room, 4.5, 2.7, -8.97, 0.45, 0.45, 0.06, '#222');
    box(room, 4.5, 2.7, -8.93, 0.38, 0.38, 0.04, '#fff', { e: 0.4 });
    box(room, 4.5, 2.76, -8.9, 0.03, 0.14, 0.02, '#111');
    box(room, 4.55, 2.7, -8.9, 0.12, 0.03, 0.02, '#111');

    // Posters on right wall and back wall
    [['#e57373', -6], ['#64b5f6', -3], ['#ffd54f', 3], ['#81c784', 6]].forEach(p => {
      box(room, 6.97, 1.9, p[1], 0.04, 1.0, 0.8, '#fff');
      box(room, 6.95, 1.95, p[1], 0.04, 0.75, 0.65, p[0]);
    });
    box(room, -2, 1.8, 8.97, 3, 1.2, 0.06, '#c9935a');                         // cork board
    [['#fff59d', -3], ['#90caf9', -2.2], ['#f48fb1', -1.3], ['#a5d6a7', -0.8]].forEach((p, i) => {
      box(room, p[1], 1.8 + (i % 2 ? 0.2 : -0.15), 8.93, 0.5, 0.6, 0.02, p[0]);
    });

    // Door on right wall near front
    box(room, 6.97, 1.05, -7.2, 0.06, 2.1, 1.1, '#8d5a32');
    box(room, 6.92, 1.0, -6.8, 0.06, 0.08, 0.15, '#d4af37');

    // Ceiling lights
    [[-3.5, -5], [3.5, -5], [-3.5, 0], [3.5, 0], [-3.5, 5], [3.5, 5]].forEach(l => {
      box(room, l[0], ROOM.h - 0.03, l[1], 1.2, 0.06, 0.6, '#fffbea', { e: 1 });
    });

    // Bookshelf in back corner
    box(room, 5.6, 0.9, 8.6, 2.2, 1.8, 0.6, '#8a5a34');
    obstacles.push({ x0: 4.5, x1: 6.7, z0: 8.3, z1: 9, low: false });
    const bookColors = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#ef6c00'];
    [0.45, 1.05, 1.6].forEach(y => {
      for (let i = 0; i < 9; i++) {
        const h = 0.3 + ((i * 7) % 5) * 0.03;
        box(room, 4.75 + i * 0.2, y + h / 2 - 0.1, 8.28, 0.16, h, 0.35, bookColors[(i + Math.round(y * 3)) % 6]);
      }
    });
    // Trash bin
    box(room, -6.3, 0.25, -8.2, 0.4, 0.5, 0.4, '#4a6b8a');
  }

  // Desk with chair (classmate or empty)
  function buildDesk(x, z) {
    const g = makeGroup(x, z, 0);
    const wood = '#d9a066', metal = '#6b7178';
    box(g, 0, 0.74, 0, 1.1, 0.05, 0.65, wood);
    [[-0.5, -0.27], [0.5, -0.27], [-0.5, 0.27], [0.5, 0.27]].forEach(l => box(g, l[0], 0.36, l[1], 0.05, 0.72, 0.05, metal));
    box(g, 0, 0.6, -0.05, 1.0, 0.03, 0.5, '#9b6a3e');                           // book shelf under
    buildChair(x, z + 0.6);
    obstacles.push({ x0: x - 0.58, x1: x + 0.58, z0: z - 0.36, z1: z + 0.36, low: true });
    return g;
  }

  function buildTeacherDesk() {
    const g = makeGroup(3, -6.6, 0);
    const wood = '#8a5530';
    box(g, 0, 0.78, 0, 2.2, 0.07, 0.95, wood);
    box(g, -1.05, 0.38, 0, 0.08, 0.76, 0.9, wood);
    box(g, 1.05, 0.38, 0, 0.08, 0.76, 0.9, wood);
    box(g, 0, 0.42, 0.42, 2.1, 0.6, 0.05, '#7a4a28');
    box(g, -0.5, 0.86, 0, 0.5, 0.08, 0.35, '#1565c0');                          // books
    box(g, 0.4, 0.9, -0.1, 0.5, 0.03, 0.35, '#333');                            // laptop
    box(g, 0.75, 0.88, 0.15, 0.1, 0.12, 0.1, '#e53935');                        // apple
    buildChair(3, -7.65, Math.PI, '#333333');
    obstacles.push({ x0: 1.85, x1: 4.15, z0: -7.1, z1: -6.1, low: false });
  }

  // =====================================================================
  // Characters
  // =====================================================================
  const classmates = [];
  let teacher = null;

  function buildPerson(g, shirt, pants, skin, hair, seated) {
    const eye = '#222';
    if (seated) {
      box(g, -0.11, 0.5, -0.2, 0.16, 0.16, 0.45, pants);
      box(g, 0.11, 0.5, -0.2, 0.16, 0.16, 0.45, pants);
      box(g, -0.11, 0.25, -0.42, 0.15, 0.5, 0.15, pants);
      box(g, 0.11, 0.25, -0.42, 0.15, 0.5, 0.15, pants);
      box(g, 0, 0.84, 0.02, 0.46, 0.56, 0.26, shirt);
      box(g, -0.3, 0.85, -0.12, 0.12, 0.12, 0.42, shirt, { tag: 'arm' });
      box(g, 0.3, 0.85, -0.12, 0.12, 0.12, 0.42, shirt, { tag: 'arm' });
      box(g, 0, 1.3, 0, 0.32, 0.32, 0.3, skin, { tag: 'head' });
      box(g, 0, 1.48, 0.02, 0.35, 0.1, 0.34, hair, { tag: 'head' });
      box(g, 0, 1.36, 0.14, 0.35, 0.22, 0.08, hair, { tag: 'head' });
      box(g, -0.07, 1.33, -0.155, 0.05, 0.05, 0.02, eye, { tag: 'head' });
      box(g, 0.07, 1.33, -0.155, 0.05, 0.05, 0.02, eye, { tag: 'head' });
    } else {
      box(g, -0.12, 0.42, 0, 0.18, 0.84, 0.2, pants, { tag: 'legs' });
      box(g, 0.12, 0.42, 0, 0.18, 0.84, 0.2, pants, { tag: 'legs' });
      box(g, -0.12, 0.04, -0.04, 0.2, 0.08, 0.28, '#3b2a1d', { tag: 'legs' });
      box(g, 0.12, 0.04, -0.04, 0.2, 0.08, 0.28, '#3b2a1d', { tag: 'legs' });
      box(g, 0, 1.15, 0, 0.54, 0.66, 0.3, shirt);
      box(g, 0, 1.4, -0.155, 0.12, 0.12, 0.02, '#c62828');                     // tie/collar
      box(g, -0.35, 1.15, 0, 0.14, 0.6, 0.15, shirt, { tag: 'armL' });
      box(g, 0.35, 1.15, 0, 0.14, 0.6, 0.15, shirt, { tag: 'armR' });
      box(g, -0.35, 0.8, 0, 0.12, 0.12, 0.12, skin, { tag: 'armL' });
      box(g, 0.35, 0.8, 0, 0.12, 0.12, 0.12, skin, { tag: 'armR' });
      box(g, 0, 1.68, 0, 0.36, 0.36, 0.34, skin, { tag: 'head' });
      box(g, 0, 1.89, 0.02, 0.39, 0.1, 0.38, hair, { tag: 'head' });
      box(g, -0.08, 1.72, -0.175, 0.05, 0.05, 0.02, eye, { tag: 'head' });
      box(g, 0.08, 1.72, -0.175, 0.05, 0.05, 0.02, eye, { tag: 'head' });
      box(g, 0, 1.6, -0.175, 0.12, 0.03, 0.02, '#8d3b3b', { tag: 'head' });
    }
    box(g, 0, 0.012, seated ? -0.1 : 0, 0.7, 0.01, 0.7, '#000000', { a: 0.22 }); // blob shadow
  }

  function buildCharacters() {
    const cols = [-4, 0, 4], rows = [-3, 0, 3, 6];
    const empty = { '0,6': 1, '4,3': 1, '-4,0': 1, '0,-3': 1 };
    const looks = [
      ['#e53935', '#1e3a5f', '#f1c27d', '#3b2a1d'], ['#43a047', '#333333', '#8d5524', '#111111'],
      ['#fdd835', '#5d4037', '#ffdbac', '#c68642'], ['#8e24aa', '#263238', '#c68642', '#1b1b1b'],
      ['#fb8c00', '#37474f', '#e0ac69', '#4e342e'], ['#1e88e5', '#4e342e', '#ffdbac', '#e8c07a'],
      ['#00897b', '#212121', '#8d5524', '#222222'], ['#ec407a', '#283593', '#f1c27d', '#6d4c41'],
    ];
    let k = 0;
    rows.forEach(z => cols.forEach(x => {
      buildDesk(x, z);
      if (empty[x + ',' + z]) return;
      const g = makeGroup(x, z + 0.55, 0);
      const L = looks[k % looks.length];
      buildPerson(g, L[0], L[1], L[2], L[3], true);
      g.phase = k * 1.37;
      classmates.push(g);
      obstacles.push({ x0: x - 0.3, x1: x + 0.3, z0: z + 0.3, z1: z + 0.9, low: false });
      k++;
    }));
    teacher = makeGroup(-0.5, -7.4, Math.PI);
    buildPerson(teacher, '#2e6fb5', '#3e3e44', '#e0ac69', '#5a3a22', false);
    obstacles.push({ x0: -0.85, x1: -0.15, z0: -7.75, z1: -7.05, low: false });
  }

  function buildChair(x, z, yaw = 0, color = '#3f74b5') {
    const g = makeGroup(x, z, yaw);
    g.chair = true;
    chairs.push(g);
    box(g, 0, 0.45, 0, 0.48, 0.06, 0.48, color);
    box(g, 0, 0.77, 0.22, 0.48, 0.58, 0.05, color);
    [[-.2,-.2],[.2,-.2],[-.2,.2],[.2,.2]].forEach(l => box(g,l[0],.22,l[1],.045,.44,.045,'#6b7178'));
    return g;
  }

  function solid(x,y,z,w,h,d,color,low = false) {
    box(room,x,y,z,w,h,d,color);
    obstacles.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,low});
  }
  function table(x,z) {
    box(room,x,.78,z,2.4,.12,1.2,'#d9a066');
    [[-1,-.45],[1,-.45],[-1,.45],[1,.45]].forEach(l => box(room,x+l[0],.36,z+l[1],.09,.72,.09,'#6b7178'));
    obstacles.push({x0:x-1.2,x1:x+1.2,z0:z-.6,z1:z+.6,low:true});
    buildChair(x,z+1);
    buildChair(x,z-1,Math.PI);
  }
  function buildScenario() {
    objects.length = 0; groups.length = 0; obstacles.length = 0; classmates.length = 0; chairs.length = 0;
    teacher = null; groups.push(room); room.shakeX = room.shakeZ = 0;
    if (selectedScenario === 'classroom') { buildClassroom(); buildTeacherDesk(); buildCharacters(); return; }
    const outdoor = selectedScenario === 'recess';
    ROOM.h = selectedScenario === 'gym' ? 5.5 : 3.2;
    box(room,0,-.05,0,14,.1,18,outdoor ? '#6caa65' : selectedScenario === 'bathroom' ? '#c5ddd9' : '#b07a45',{pat:outdoor ? 0 : 1});
    if (!outdoor) {
      box(room,0,ROOM.h,0,14,.1,18,'#f4f1ea',{pat:2});
      box(room,0,ROOM.h/2,9.05,14.2,ROOM.h,.1,'#dee9e6');
      box(room,0,ROOM.h/2,-9.05,14.2,ROOM.h,.1,'#dee9e6');
      [-7.05,7.05].forEach(x=>box(room,x,ROOM.h/2,0,.1,ROOM.h,18.2,'#dee9e6'));
      [-4,4].forEach(x=>[-5,3].forEach(z=>box(room,x,ROOM.h-.08,z,1.5,.08,.7,'#fffbea',{e:1})));
      box(room,6.98,1.1,6,.04,2.2,1.3,'#347c88');
    }
    if (selectedScenario === 'library') {
      [-5.8,5.8].forEach(x => [-5,0,5].forEach(z => {
        solid(x,1.15,z,1.1,2.3,3,'#8a5a34');
        [.4,1,1.6,2.1].forEach(y=> { for(let i=0;i<10;i++) box(room,x+(x<0?.57:-.57),y,z-1.3+i*.27,.08,.35,.2,['#d45958','#388b9d','#ddbd50'][i%3]); });
      }));
      table(0,-3); table(0,3);
    } else if (selectedScenario === 'gym') {
      [-7.8,7.8].forEach(z=> {
        box(room,0,3.5,z,2.1,1.3,.12,'#f4f1ea');
        box(room,0,3,z+(z<0?.5:-.5),.7,.05,.7,'#d45958');
        box(room,0,2.75,z+(z<0?.5:-.5),.04,.5,.04,'#f4f1ea');
      });
      [-5.8,5.8].forEach(x=>solid(x,.35,0,1.2,.7,10,'#388b9d'));
      box(room,0,.01,0,.06,.01,15,'#f4f1ea');
      [-3,3].forEach(x=>box(room,x,.012,0,.05,.01,9,'#f4f1ea'));
      [-4,4].forEach(z=>box(room,0,.012,z,6,.01,.05,'#f4f1ea'));
      buildChair(-3,6.6); buildChair(0,6.6); buildChair(3,6.6);
    } else if (selectedScenario === 'bathroom') {
      [-5,-2,1].forEach(x=> {
        solid(x,1.1,-6,0.08,2.2,4,'#388b9d');
        solid(x+1.4,1,-4,2.6,2,.08,'#388b9d');
        solid(x+1.4,.35,-7,0.65,.7,.8,'#f4f1ea');
        box(room,x+1.4,.7,-7.35,.65,.8,.25,'#f4f1ea');
      });
      [-3,0,3].forEach(z=> {
        solid(6,.85,z,1.4,.2,1.1,'#f4f1ea');
        box(room,6.98,1.7,z,.03,1.1,1.1,'#a9cfdb',{e:.3});
        box(room,6,.98,z,.06,.2,.06,'#6b7178');
      });
      buildChair(0,6.6); solid(-5,.3,6,1,.6,1,'#388b9d');
    } else {
      box(room,0,2.5,-9.2,14,5,.25,'#d9dfdf');
      [-5,0,5].forEach(x=>box(room,x,2.8,-9.02,2,1.4,.04,'#71bdd4',{e:.5}));
      [-6,6].forEach(x=> { solid(x,1.2,-4,.4,2.4,.4,'#8a5a34'); box(room,x,3,-4,1.8,1.8,1.8,'#43895b'); });
      solid(-4,.2,0,3,.4,3,'#d4c27e');
      [[3,-3],[5,-3],[3,0],[5,0]].forEach(l=>solid(l[0],1.5,l[1],.12,3,.12,'#d45958'));
      box(room,4,3,-1.5,2.3,.12,3.3,'#ddbd50');
      table(-3,4); buildChair(0,6.6);
    }
    [[-3,-1],[3,2],[-2,-6]].forEach((p,i)=> {
      const g=makeGroup(p[0],p[1],0); g.phase=i; classmates.push(g);
      buildPerson(g,['#d45958','#388b9d','#ddbd50'][i],'#3e3e44','#e0ac69','#5a3a22',false);
      obstacles.push({x0:p[0]-.3,x1:p[0]+.3,z0:p[1]-.3,z1:p[1]+.3,low:false});
    });
  }


  // =====================================================================
  // Player
  // =====================================================================
  const PLAYER = { RADIUS: 0.3, WALK: 3.0, CROUCH_SPEED: 1.3, EYE: 1.6, CROUCH_EYE: 0.6 };
  const player = { x: 0, z: 8, yaw: 0, pitch: 0, eye: PLAYER.EYE, crouch: false };

  function resetPlayer() {
    player.x = 0; player.z = 8; player.yaw = 0; player.pitch = -0.46;
    player.eye = PLAYER.EYE; player.crouch = false;
  }

  function blocked(x, z) {
    const r = PLAYER.RADIUS;
    if (x - r < ROOM.x0 || x + r > ROOM.x1 || z - r < ROOM.z0 || z + r > ROOM.z1) return true;
    for (const c of chairs) {
      if (x + r > c.x-.25 && x-r < c.x+.25 && z+r > c.z-.25 && z-r < c.z+.25) return true;
    }
    for (const o of obstacles) {
      if (o.low && player.crouch) continue; // crouching lets you get under desks
      if (x + r > o.x0 && x - r < o.x1 && z + r > o.z0 && z - r < o.z1) return true;
    }
    return false;
  }

  function underDesk() {
    return obstacles.some(o => o.low && player.x > o.x0 - 0.1 && player.x < o.x1 + 0.1 && player.z > o.z0 - 0.15 && player.z < o.z1 + 0.15);
  }
  function nearDesk() {
    return obstacles.some(o => o.low && player.x > o.x0 - 0.9 && player.x < o.x1 + 0.9 && player.z > o.z0 - 0.9 && player.z < o.z1 + 0.9);
  }

  function updatePlayer(dt) {
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) s += 1;
    if (keys.KeyA || keys.ArrowLeft) s -= 1;
    const len = Math.hypot(f, s);
    if (len > 0) {
      f /= len; s /= len;
      const speed = player.crouch ? PLAYER.CROUCH_SPEED : PLAYER.WALK;
      const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
      const dx = (-sy * f + cy * s) * speed * dt;
      const dz = (-cy * f - sy * s) * speed * dt;
      if (!blocked(player.x + dx, player.z)) player.x += dx;
      if (!blocked(player.x, player.z + dz)) player.z += dz;
    }
    const target = player.crouch ? PLAYER.CROUCH_EYE : PLAYER.EYE;
    player.eye += (target - player.eye) * (1 - Math.exp(-10 * dt));
  }

  function setCrouch(on) {
    if (on) { player.crouch = true; return; }
    // only stand up if there's room (not under a desk)
    player.crouch = false;
    if (blocked(player.x, player.z)) player.crouch = true;
  }

  // =====================================================================
  // Controls
  // =====================================================================
  const keys = {};
  let dragging = false, lastMX = 0, lastMY = 0;
  // Ray-box picking checks the visible geometry, so furniture/walls occlude chairs.
  function rayBox(origin, direction, min, max) {
    let near = 0, far = 3.5;
    for (let i=0;i<3;i++) {
      if (Math.abs(direction[i]) < 1e-7) { if(origin[i]<min[i] || origin[i]>max[i]) return null; }
      else {
        let a=(min[i]-origin[i])/direction[i], b=(max[i]-origin[i])/direction[i];
        if(a>b) [a,b]=[b,a]; near=Math.max(near,a); far=Math.min(far,b);
        if(near>far) return null;
      }
    }
    return near;
  }
  function aimedChair() {
    let closest=3.5, hit=null;
    const cp=Math.cos(player.pitch), dir=[-Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp];
    for(const o of objects) {
      if(o.a<1) continue;
      const g=o.g,c=Math.cos(g.yaw),sn=Math.sin(g.yaw), dx=player.x-g.x, dz=player.z-g.z;
      const origin=[c*dx-sn*dz,player.eye-g.y,sn*dx+c*dz];
      const direction=[c*dir[0]-sn*dir[2],dir[1],sn*dir[0]+c*dir[2]];
      const distance=rayBox(origin,direction,o.p.map((v,i)=>v-o.s[i]/2),o.p.map((v,i)=>v+o.s[i]/2));
      if(distance!==null && distance<closest) {closest=distance;hit=g.chair?g:null;}
    }
    return hit;
  }
  function releaseChair() { heldChair=null; leftHeld=false; dragging=false; }
  function chairBlocked(chair,x,z) {
    const r=.23;
    if(x-r<ROOM.x0 || x+r>ROOM.x1 || z-r<ROOM.z0 || z+r>ROOM.z1) return true;
    if(Math.hypot(x-player.x,z-player.z)<.58) return true;
    return obstacles.some(o=>x+r>o.x0 && x-r<o.x1 && z+r>o.z0 && z-r<o.z1) || chairs.some(c=>c!==chair && Math.abs(c.x-x)<.52 && Math.abs(c.z-z)<.52);
  }
  function updateChair(dt) {
    if(!leftHeld || !heldChair) return;
    const x=player.x-Math.sin(player.yaw)*holdDistance, z=player.z-Math.cos(player.yaw)*holdDistance;
    const blend=1-Math.exp(-12*dt), nx=heldChair.x+(x-heldChair.x)*blend, nz=heldChair.z+(z-heldChair.z)*blend;
    if(!chairBlocked(heldChair,nx,heldChair.z)) heldChair.x=nx;
    if(!chairBlocked(heldChair,heldChair.x,nz)) heldChair.z=nz;
    heldChair.bx=heldChair.x; heldChair.bz=heldChair.z;
  }


  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'KeyC' && !e.repeat && isPlaying()) setCrouch(!player.crouch);
    if (e.code === 'KeyR' && isPlaying()) startGame();
    if (e.code === 'Escape' && !e.repeat) { if(!document.getElementById('settings').classList.contains('hidden')) closeSettings(); else if(paused) resumeGame(); else if(isPlaying()) pauseGame(); }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; releaseChair(); if(isPlaying()) pauseGame(); });

  function look(dx, dy) {
    player.yaw -= dx * .0025 * settings.sensitivity;
    player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - dy * .0025 * settings.sensitivity));
  }
  document.addEventListener('mousemove', e => {
    if (!isPlaying()) return;
    if (document.pointerLockElement === canvas) look(e.movementX || 0, e.movementY || 0);
    else if (dragging) { look(e.clientX - lastMX, e.clientY - lastMY); lastMX = e.clientX; lastMY = e.clientY; }
  });
  canvas.addEventListener('mousedown', e => {
    if (!isPlaying() || e.button !== 0) return;
    leftHeld = true; heldChair = aimedChair();
    if(heldChair) holdDistance = Math.hypot(heldChair.x-player.x,heldChair.z-player.z);
    dragging = true; lastMX = e.clientX; lastMY = e.clientY;
    requestLock();
  });
  window.addEventListener('mouseup', () => { releaseChair(); });
  canvas.addEventListener('contextmenu', e=>e.preventDefault());

  function requestLock() {
    try {
      const p = canvas.requestPointerLock && canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* drag-to-look fallback stays active */ }
  }
  function releaseLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  // =====================================================================
  // Camera
  // =====================================================================
  const proj = new Float32Array(16), view = new Float32Array(16), model = new Float32Array(16);

  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
  }
  function lookAt(out, ex, ey, ez, fx, fy, fz) {
    // forward f is normalized; right = f x up, up' = r x f
    let rx = -fz, ry = 0, rz = fx;
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    out[0] = rx; out[1] = ux; out[2] = -fx; out[3] = 0;
    out[4] = ry; out[5] = uy; out[6] = -fy; out[7] = 0;
    out[8] = rz; out[9] = uz; out[10] = -fz; out[11] = 0;
    out[12] = -(rx * ex + ry * ey + rz * ez);
    out[13] = -(ux * ex + uy * ey + uz * ez);
    out[14] = fx * ex + fy * ey + fz * ez;
    out[15] = 1;
  }
  function updateCamera(time) {
    const q = settings.cameraShake ? quakeIntensity : 0;
    const jx = q * 0.06 * (Math.sin(time * 37) + Math.sin(time * 23.1) * 0.6);
    const jy = q * 0.04 * Math.sin(time * 41.3);
    const jz = q * 0.06 * Math.sin(time * 29.7 + 1.3);
    const yaw = player.yaw + q * 0.015 * Math.sin(time * 31);
    const pitch = player.pitch + q * 0.015 * Math.sin(time * 27);
    const cp = Math.cos(pitch);
    lookAt(view, player.x + jx, player.eye + jy, player.z + jz, -Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    perspective(proj, settings.fov * Math.PI / 180, canvas.width / canvas.height, 0.05, 60);
  }
  window.addEventListener('resize', resize);
  resize();

  // =====================================================================
  // Earthquake
  // =====================================================================
  const QUAKE = { CLASS_TIME: 15, DURATION: 10, CALM_TIME: 4 };
  let quakeIntensity = 0;
  let audio = null;

  function startRumble() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audio) audio = { ctx: new AC() };
      const ctx = audio.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
      const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
      src.start();
      audio.src = src; audio.gain = gain;
    } catch (err) { audio = null; }
  }
  function setRumble(v) { if (audio && audio.gain) audio.gain.gain.setTargetAtTime(v * settings.volume, audio.ctx.currentTime, 0.1); }
  function stopRumble() {
    if (audio && audio.src) { try { audio.src.stop(); } catch (err) { /* already stopped */ } audio.src = null; audio.gain = null; }
  }

  function updateQuake(time) {
    if (state === 'quake') {
      const t = stateTime;
      const env = Math.min(1, t / 1.2) * Math.min(1, (QUAKE.DURATION - t) / 1.5);
      quakeIntensity = Math.max(0, env) * (0.8 + 0.2 * Math.sin(t * 3));
    } else {
      quakeIntensity = Math.max(0, quakeIntensity - 0.05);
    }
    setRumble(quakeIntensity);

    const q = quakeIntensity;
    // furniture/room jitter
    for (const g of groups) {
      if (g === teacher || classmates.includes(g)) continue;
      g.shakeX = q * 0.025 * Math.sin(time * 33 + g.bx);
      g.shakeZ = q * 0.025 * Math.sin(time * 28 + g.bz);
    }
    // classmates: shake and duck down
    const duck = state === 'quake' ? Math.min(1, Math.max(0, (stateTime - 1) / 0.8)) : (state === 'calm' ? Math.max(0, 1 - stateTime / 2) : 0);
    classmates.forEach(c => {
      c.shakeX = q * 0.06 * Math.sin(time * 30 + c.phase);
      c.shakeZ = q * 0.05 * Math.sin(time * 26 + c.phase * 2);
      c.y = -0.28 * duck;
      c.tags.arm = [0, 0.35 * duck, 0.1 * duck];
      c.tags.head = [0, -0.05 * duck + 0.01 * Math.sin(time * 2 + c.phase), -0.12 * duck];
    });
    // teacher: gestures during class, crouches and covers head during the quake
    if (teacher) {
      const tDuck = state === 'quake' ? Math.min(1, stateTime / 0.6) : duck;
      teacher.shakeX = q * 0.05 * Math.sin(time * 34);
      teacher.y = -0.45 * tDuck;
      teacher.tags.legs = [0, 0.45 * tDuck, 0];
      const g = state === 'class' || state === 'menu' ? Math.max(0, Math.sin(time * 2.2)) : 0;
      teacher.tags.armR = [0, 0.35 * g + 0.6 * tDuck, -0.15 * g];
      teacher.tags.armL = [0, 0.6 * tDuck, 0];
      teacher.tags.head = [0, -0.1 * tDuck, 0];
      teacher.yaw = Math.PI + (state === 'class' ? 0.35 * Math.sin(time * 0.8) : 0);
    }
  }

  // =====================================================================
  // Game states
  // =====================================================================
  let state = 'menu';
  let stateTime = 0;
  function isPlaying() { return !paused && (state === 'class' || state === 'quake' || state === 'calm'); }

  function setState(s) {
    state = s; stateTime = 0;
    if (s === 'quake') startRumble();
    if (s === 'calm') stopRumble();
    if (s === 'complete') {
      releaseChair();
      stopRumble();
      releaseLock();
      ui.complete.classList.remove('hidden');
      ui.hud.classList.add('hidden');
    }
  }

  function startGame() {
    paused = false; releaseChair(); ROOM.h = 3.2; buildScenario(); resetPlayer();
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('settings').classList.add('hidden');
    document.getElementById('locationLabel').textContent = scenarios[selectedScenario].name.toUpperCase();
    for (const k in keys) keys[k] = false;
    quakeIntensity = 0;
    stopRumble();
    ui.menu.classList.add('hidden');
    ui.complete.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    setState('class');
  }

  function updateGame(dt) {
    stateTime += dt;
    if (state === 'class' && stateTime >= QUAKE.CLASS_TIME) setState('quake');
    else if (state === 'quake' && stateTime >= QUAKE.DURATION) setState('calm');
    else if (state === 'calm' && stateTime >= QUAKE.CALM_TIME) setState('complete');
  }

  function pauseGame() {
    if(!isPlaying()) return;
    paused=true; releaseChair(); releaseLock(); setRumble(0);
    for(const k in keys) keys[k]=false;
    document.getElementById('pauseLocation').textContent=scenarios[selectedScenario].name;
    document.getElementById('pause').classList.remove('hidden');
    ui.hud.classList.add('hidden');
  }
  function resumeGame() {
    if(!paused) return;
    paused=false; document.getElementById('pause').classList.add('hidden'); ui.hud.classList.remove('hidden');
  }
  function mainMenu() {
    paused=false; state='menu'; stateTime=0; quakeIntensity=0; releaseChair(); releaseLock(); stopRumble();
    ['pause','settings','complete','hud'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    ui.menu.classList.remove('hidden'); resetPlayer();
  }
  function openSettings(from) {
    settingsFrom=from;
    document.getElementById(from).classList.add('hidden');
    document.getElementById('settings').classList.remove('hidden');
  }
  function closeSettings() {
    document.getElementById('settings').classList.add('hidden');
    document.getElementById(settingsFrom).classList.remove('hidden');
  }
  function syncSettings() {
    document.getElementById('sensitivity').value=settings.sensitivity;
    document.getElementById('volume').value=Math.round(settings.volume*100);
    document.getElementById('fov').value=settings.fov;
    document.getElementById('cameraShake').checked=settings.cameraShake;
    document.getElementById('sensitivityValue').textContent=settings.sensitivity.toFixed(1)+'×';
    document.getElementById('volumeValue').textContent=Math.round(settings.volume*100)+'%';
    document.getElementById('fovValue').textContent=settings.fov+'°'; resize();
  }
  document.querySelectorAll('[data-scenario]').forEach(btn=>btn.addEventListener('click',()=> {
    selectedScenario=btn.dataset.scenario;
    document.querySelectorAll('[data-scenario]').forEach(b=> { const on=b===btn; b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on)); });
    document.getElementById('scenarioDescription').textContent=scenarios[selectedScenario].description;
    ROOM.h=3.2; buildScenario(); resetPlayer();
  }));
  document.getElementById('pauseBtn').addEventListener('click',pauseGame);
  document.getElementById('resumeBtn').addEventListener('click',resumeGame);
  document.getElementById('restartBtn').addEventListener('click',startGame);
  ['mainMenuBtn','completeMenuBtn'].forEach(id=>document.getElementById(id).addEventListener('click',mainMenu));
  document.getElementById('settingsBtn').addEventListener('click',()=>openSettings('menu'));
  document.getElementById('pauseSettingsBtn').addEventListener('click',()=>openSettings('pause'));
  document.getElementById('settingsBackBtn').addEventListener('click',closeSettings);
  document.getElementById('resetSettingsBtn').addEventListener('click',()=> { Object.assign(settings,{sensitivity:1,volume:.6,fov:72,cameraShake:true});syncSettings(); });
  ['sensitivity','volume','fov'].forEach(id=>document.getElementById(id).addEventListener('input',e=> {
    settings[id]=Number(e.target.value)/(id==='volume'?100:1);syncSettings();
  }));
  document.getElementById('cameraShake').addEventListener('change',e=>settings.cameraShake=e.target.checked);

  ui.start.addEventListener('click', () => { startRumbleUnlock(); startGame(); });
  ui.again.addEventListener('click', () => { startGame(); });
  function startRumbleUnlock() {
    // Create/resume the audio context during a user gesture so rumble can play later.
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !audio) audio = { ctx: new AC() };
      if (audio && audio.ctx.state === 'suspended') audio.ctx.resume();
    } catch (err) { audio = null; }
  }

  // =====================================================================
  // UI
  // =====================================================================
  let lastUI = '';
  function updateUI() {
    let status = 'READY', statusCls = '', msg = '', msgCls = '', hint = '';
    if (state === 'class') {
      status = scenarios[selectedScenario].name.toUpperCase();
      msg = scenarios[selectedScenario].intro;
    } else if (state === 'quake') {
      if (player.crouch) {
        status = 'TAKE COVER'; statusCls = 'cover';
        msg = 'GOOD! STAY LOW AND HOLD ON.'; msgCls = 'good';
        hint = selectedScenario === 'recess' ? 'Stay in the open. Protect your head and neck.' : ['gym','bathroom'].includes(selectedScenario) ? 'Protect your head and neck. Stay away from tall fixtures.' : underDesk() ? '' : (nearDesk() ? 'Crawl under the desk for extra protection.' : 'Stay low and move toward a desk.');
      } else {
        status = 'EARTHQUAKE'; statusCls = 'quake';
        msg = 'EARTHQUAKE! DROP, COVER, AND HOLD ON!'; msgCls = 'alert';
        hint = ['gym','bathroom','recess'].includes(selectedScenario) ? 'Drop low and protect your head and neck.' : 'Press C to crouch, then get under a sturdy table.';
      }
    } else if (state === 'calm') {
      status = 'CALM'; statusCls = 'calm';
      msg = 'The earthquake is over wait for Mr.Talha';
    }
    const target = isPlaying() ? aimedChair() : null;
    document.getElementById('interaction').textContent = heldChair ? 'MOVING CHAIR — RELEASE TO DROP' : target ? 'HOLD LEFT CLICK TO MOVE CHAIR' : '';
    document.querySelector('.crosshair').classList.toggle('target',Boolean(target || heldChair));
    const key = status + msg + hint;
    if (key === lastUI) return;
    lastUI = key;
    ui.status.textContent = status;
    ui.status.className = 'status ' + statusCls;
    ui.message.textContent = msg;
    ui.message.className = 'message ' + msgCls + (msg ? ' show' : '');
    ui.hint.textContent = hint;
  }

  // =====================================================================
  // Rendering
  // =====================================================================
  function drawObject(o) {
    const g = o.g, c = Math.cos(g.yaw), s = Math.sin(g.yaw);
    let px = o.p[0], py = o.p[1], pz = o.p[2];
    if (o.tag && g.tags[o.tag]) { const t = g.tags[o.tag]; px += t[0]; py += t[1]; pz += t[2]; }
    const tx = g.x + g.shakeX + c * px + s * pz;
    const ty = g.y + g.shakeY + py;
    const tz = g.z + g.shakeZ - s * px + c * pz;
    const sx = o.s[0], sy = o.s[1], sz = o.s[2];
    model[0] = c * sx; model[1] = 0; model[2] = -s * sx; model[3] = 0;
    model[4] = 0; model[5] = sy; model[6] = 0; model[7] = 0;
    model[8] = s * sz; model[9] = 0; model[10] = c * sz; model[11] = 0;
    model[12] = tx; model[13] = o.tag === null && o.a < 1 ? 0.012 : ty; model[14] = tz; model[15] = 1;
    gl.uniformMatrix4fv(loc.uModel, false, model);
    gl.uniform1f(loc.uYaw, g.yaw);
    gl.uniform3fv(loc.uColor, o.c);
    gl.uniform1f(loc.uEmis, o.e);
    gl.uniform1f(loc.uAlpha, o.a);
    gl.uniform1f(loc.uPat, o.pat);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
  }

  function render(time) {
    gl.clearColor(0.95, 0.88, 0.78, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    updateCamera(time);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniformMatrix4fv(loc.uView, false, view);
    for (const o of objects) if (o.a >= 1) drawObject(o);
    gl.enable(gl.BLEND); gl.depthMask(false);
    for (const o of objects) if (o.a < 1) drawObject(o);
    gl.disable(gl.BLEND); gl.depthMask(true);
  }

  // Main loop
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    const time = now / 1000;
    if (isPlaying()) {
      updateGame(dt);
      if (isPlaying()) { updatePlayer(dt); updateChair(dt); }
    }
    {
      if(!paused && state !== 'menu') updateQuake(time);
      render(time);
      updateUI();
    }
    requestAnimationFrame(frame);
  }
  buildScenario(); resetPlayer(); syncSettings();
  requestAnimationFrame(frame);
})();
