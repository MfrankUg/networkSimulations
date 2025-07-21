// --- Network Topology Coordinates ---
const canvas = document.getElementById('network-canvas');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');

const SWITCH_SIZE = { w: 120, h: 40 };
const SWITCHES = {
  A: { x: 350, y: 80 },
  B: { x: 170, y: 350 },
  C: { x: 530, y: 350 },
};
const LINKS = [
  ['A', 'B'],
  ['A', 'C'],
  ['B', 'C'],
];
const BROADCAST_COLORS = {
  A: '#ffd600', // yellow
  B: '#00e676', // green
  C: '#40c4ff', // blue
};
const BROADCAST_STROKES = {
  A: '#ffab00',
  B: '#00b248',
  C: '#01579b',
};

let stpEnabled = false;
let blockedLink = null; // e.g., ['B','C']

// --- Multi-broadcast animation state ---
let activeBroadcasts = [];
let isAnyAnimating = false;

function getCanvasScale() {
  return canvas.width / 700;
}

function drawNetwork() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Draw links
  LINKS.forEach(([s1, s2]) => {
    ctx.save();
    ctx.lineWidth = 6 * getCanvasScale();
    if (stpEnabled && isBlockedLink(s1, s2)) {
      ctx.strokeStyle = '#e53935';
      ctx.setLineDash([16 * getCanvasScale(), 12 * getCanvasScale()]);
    } else {
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(...switchCenter(SWITCHES[s1]));
    ctx.lineTo(...switchCenter(SWITCHES[s2]));
    ctx.stroke();
    ctx.restore();
  });
  // Draw switches and labels
  Object.entries(SWITCHES).forEach(([label, pos]) => {
    drawSwitch(pos.x, pos.y, label);
    drawSwitchLabel(pos.x, pos.y, label);
  });
}

function drawSwitch(x, y, label) {
  const scale = getCanvasScale();
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#1a3a5b';
  ctx.lineWidth = 2 * scale;
  ctx.fillRect(x * scale, y * scale, SWITCH_SIZE.w * scale, SWITCH_SIZE.h * scale);
  ctx.strokeRect(x * scale, y * scale, SWITCH_SIZE.w * scale, SWITCH_SIZE.h * scale);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = '#1a3a5b';
    ctx.fillRect(x * scale + 12 * scale + i * 13 * scale, y * scale + 10 * scale, 8 * scale, 8 * scale);
    ctx.fillRect(x * scale + 12 * scale + i * 13 * scale, y * scale + 24 * scale, 8 * scale, 8 * scale);
  }
  ctx.restore();
}

function drawSwitchLabel(x, y, label) {
  const scale = getCanvasScale();
  ctx.save();
  ctx.font = `${20 * scale}px Segoe UI`;
  ctx.fillStyle = '#377cae';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let labelX = (x + SWITCH_SIZE.w + 14) * scale;
  let labelY = (y + SWITCH_SIZE.h / 2) * scale;
  if (label === 'B') {
    labelX = (x - 44) * scale;
    ctx.textAlign = 'right';
  }
  ctx.fillText('SW ' + label, labelX, labelY);
  ctx.restore();
}

function switchCenter(pos) {
  const scale = getCanvasScale();
  return [
    (pos.x + SWITCH_SIZE.w / 2) * scale,
    (pos.y + SWITCH_SIZE.h / 2) * scale,
  ];
}

function isBlockedLink(s1, s2) {
  if (!blockedLink) return false;
  return (
    (blockedLink[0] === s1 && blockedLink[1] === s2) ||
    (blockedLink[1] === s1 && blockedLink[0] === s2)
  );
}

function setSTP(enabled) {
  stpEnabled = enabled;
  if (enabled) {
    blockedLink = ['B', 'C'];
    info.textContent =
      'STP is ON. SW A is Root Bridge. Link between SW B and SW C is blocked to prevent loops.';
  } else {
    blockedLink = null;
    info.textContent =
      'STP is OFF. All links are active. Broadcasts will loop endlessly (broadcast storm).';
  }
  drawNetwork();
}

function getBroadcastPaths(from) {
  if (!stpEnabled) {
    if (from === 'A') return [['A', 'B', 'C', 'A']];
    if (from === 'B') return [['B', 'A', 'C', 'B']];
    if (from === 'C') return [['C', 'A', 'B', 'C']];
  } else {
    if (from === 'A') return [['A', 'B'], ['A', 'C']];
    if (from === 'B') return [['B', 'A', 'C']];
    if (from === 'C') return [['C', 'A', 'B']];
  }
  return [];
}

function startBroadcast(from, color, stroke, cb) {
  const paths = getBroadcastPaths(from);
  let anims = [];
  paths.forEach((path) => {
    let segs = [];
    for (let i = 0; i < path.length - 1; i++) {
      segs.push([path[i], path[i + 1]]);
    }
    anims.push({ segs, segIdx: 0, t: 0 });
  });
  activeBroadcasts.push({
    from,
    color,
    stroke,
    anims,
    done: false,
    storm: false,
    cb,
  });
  if (!isAnyAnimating) animateAllBroadcasts();
}

function animateAllBroadcasts() {
  isAnyAnimating = true;
  function drawFrame() {
    drawNetwork();
    let allDone = true;
    activeBroadcasts.forEach((bcast) => {
      if (bcast.done) return;
      let anims = bcast.anims;
      let animDone = true;
      anims.forEach((anim) => {
        if (anim.segIdx < anim.segs.length) {
          animDone = false;
          const [s1, s2] = anim.segs[anim.segIdx];
          drawFrameOnLinkSmooth(s1, s2, anim.t, bcast.color, bcast.stroke);
          anim.t += 0.025;
          if (anim.t >= 1) {
            anim.t = 0;
            anim.segIdx++;
          }
        }
      });
      if (!animDone) {
        allDone = false;
      } else if (!bcast.storm && !stpEnabled) {
        bcast.storm = true;
        bcast.stormStep = 0;
        bcast.stormPath = getBroadcastPaths(bcast.from)[0];
        allDone = false;
      } else if (bcast.storm && !stpEnabled) {
        // Endless storm: animate arrows in a loop
        bcast.stormStep = (bcast.stormStep + 1) % (bcast.stormPath.length - 1);
        allDone = false;
      } else {
        bcast.done = true;
        if (bcast.cb) bcast.cb();
      }
    });
    // Draw all active storm arrows
    activeBroadcasts.forEach((bcast) => {
      if (bcast.storm && !bcast.done && !stpEnabled) {
        const path = bcast.stormPath;
        for (let i = 0; i < path.length - 1; i++) {
          drawArrowOnLink(path[i], path[i + 1], bcast.color, bcast.stroke);
        }
        info.textContent = 'Broadcast storm! Frames are endlessly looping due to no STP.';
      }
    });
    // Show info for STP ON
    if (stpEnabled && !allDone) {
      info.textContent = 'STP is ON. Broadcast follows a loop-free path.';
    }
    if (!allDone && (!stpEnabled || (stpEnabled && activeBroadcasts.some(b => !b.done)))) {
      requestAnimationFrame(drawFrame);
    } else {
      isAnyAnimating = false;
      activeBroadcasts = [];
      info.textContent = 'All broadcasts complete.';
      drawNetwork();
    }
  }
  drawFrame();
}

function drawFrameOnLinkSmooth(s1, s2, t, color, stroke) {
  const [x1, y1] = switchCenter(SWITCHES[s1]);
  const [x2, y2] = switchCenter(SWITCHES[s2]);
  const x = x1 + (x2 - x1) * t;
  const y = y1 + (y2 - y1) * t;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 16 * getCanvasScale(), 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.lineWidth = 3 * getCanvasScale();
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

function drawArrowOnLink(s1, s2, color, stroke) {
  const [x1, y1] = switchCenter(SWITCHES[s1]);
  const [x2, y2] = switchCenter(SWITCHES[s2]);
  const t = 0.6;
  const x = x1 + (x2 - x1) * t;
  const y = y1 + (y2 - y1) * t;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 12 * Math.cos(angle - 0.3) * getCanvasScale(), y - 12 * Math.sin(angle - 0.3) * getCanvasScale());
  ctx.lineTo(x - 12 * Math.cos(angle + 0.3) * getCanvasScale(), y - 12 * Math.sin(angle + 0.3) * getCanvasScale());
  ctx.lineTo(x, y);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.restore();
}

function resizeCanvasAndLabels() {
  const container = canvas.parentElement;
  const width = Math.min(container.offsetWidth, 700);
  const height = 500 * (width / 700);
  canvas.width = width;
  canvas.height = height;
  // Device label positions (relative to switch positions)
  const labelA = document.getElementById('label-a');
  const labelB = document.getElementById('label-b');
  const labelC = document.getElementById('label-c');
  // Calculate scaled switch positions
  const scale = width / 700;
  // Place label A to the right of SW A
  labelA.style.left = ((SWITCHES.A.x + SWITCH_SIZE.w + 18) * scale) + 'px';
  labelA.style.top = ((SWITCHES.A.y + SWITCH_SIZE.h / 2 - 18) * scale) + 'px';
  // Place label B to the left of SW B
  labelB.style.left = ((SWITCHES.B.x - 120) * scale) + 'px';
  labelB.style.top = ((SWITCHES.B.y + SWITCH_SIZE.h / 2 - 18) * scale) + 'px';
  // Place label C to the right of SW C
  labelC.style.left = ((SWITCHES.C.x + SWITCH_SIZE.w + 18) * scale) + 'px';
  labelC.style.top = ((SWITCHES.C.y + SWITCH_SIZE.h / 2 - 18) * scale) + 'px';
  drawNetwork();
}
window.addEventListener('resize', resizeCanvasAndLabels);

document.getElementById('toggle-stp').onclick = function () {
  setSTP(!stpEnabled);
  this.textContent = 'STP: ' + (stpEnabled ? 'ON' : 'OFF');
};
document.getElementById('broadcast-a').onclick = function () {
  info.textContent = 'Broadcast sent from SW A' + (stpEnabled ? ' (STP ON)' : ' (STP OFF)');
  startBroadcast('A', BROADCAST_COLORS.A, BROADCAST_STROKES.A);
};
document.getElementById('broadcast-b').onclick = function () {
  info.textContent = 'Broadcast sent from SW B' + (stpEnabled ? ' (STP ON)' : ' (STP OFF)');
  startBroadcast('B', BROADCAST_COLORS.B, BROADCAST_STROKES.B);
};
document.getElementById('broadcast-c').onclick = function () {
  info.textContent = 'Broadcast sent from SW C' + (stpEnabled ? ' (STP ON)' : ' (STP OFF)');
  startBroadcast('C', BROADCAST_COLORS.C, BROADCAST_STROKES.C);
};
document.getElementById('broadcast-all').onclick = function () {
  info.textContent = 'Broadcasts sent from SW A, SW B, and SW C (simultaneously)';
  startBroadcast('A', BROADCAST_COLORS.A, BROADCAST_STROKES.A);
  startBroadcast('B', BROADCAST_COLORS.B, BROADCAST_STROKES.B);
  startBroadcast('C', BROADCAST_COLORS.C, BROADCAST_STROKES.C);
};

resizeCanvasAndLabels();
setSTP(false); 