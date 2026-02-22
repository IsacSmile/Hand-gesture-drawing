var vid = document.getElementById('vid');
var c   = document.getElementById('c');
var ctx = c.getContext('2d');

// ── Stored drawings ─
// Each item is either:
var drawings  = [];
var curStroke = null;

// ── State ───────────
var shift = false;

// Smoothed finger positions
var sx = null, sy = null;   // index finger tip
var mx = null, my = null;   // middle finger tip
var tx = null, ty = null;   // thumb tip

// Shape drawing state
var shapeStart = null;
var shapeLive  = null;
var pinching   = false;

// ── Color palette ───
var COLORS = [
  { label: 'White', stroke: '#FFFFFF', shadow: '#aaaaaa' },
  { label: 'Gold',  stroke: '#F5D061', shadow: '#f5a623' },
  { label: 'Cyan',  stroke: '#00E5FF', shadow: '#00bcd4' },
  { label: 'Pink',  stroke: '#FF4F9A', shadow: '#e91e8c' },
  { label: 'Lime',  stroke: '#AAFF00', shadow: '#76ff03' },
];
var activeColor  = 0;
var hoverColor   = -1;
var hoverStart   = 0;
var HOVER_DWELL  = 800;
var SWATCH_R     = 26;
var SWATCH_GAP   = 18;

// ── Shape palette ───
var SHAPES = [
  { label: 'Free',   icon: '✏️'  },
  { label: 'Circle', icon: '⭕'  },
  { label: 'Rect',   icon: '▭'   },
  { label: 'Square', icon: '⬜'  },
];
var activeShape      = 0;
var hoverShape       = -1;
var hoverShapeStart  = 0;
var SHAPE_R          = 26;
var SHAPE_GAP        = 18;

// ── Key bindings ────
window.onkeydown = function(e) {
  if (e.key  === 'Shift') shift = true;
  if (e.code === 'Space') drawings = [];
};
window.onkeyup = function(e) {
  if (e.key === 'Shift') shift = false;
};

// ── Gesture helpers ─
function isMiddleFingerUp(lm) {
  return lm[12].y < lm[9].y &&
         lm[8].y  > lm[6].y &&
         lm[16].y > lm[14].y;
}

function pinchDist(lm) {
  var dx = lm[4].x - lm[8].x;
  var dy = lm[4].y - lm[8].y;
  return Math.sqrt(dx * dx + dy * dy);
}

function eraseNear(x, y, radius) {
  drawings = drawings.filter(function(d) {
    if (d.type === 'stroke') {
      return !d.pts.some(function(pt) {
        var dx = pt.x - x, dy = pt.y - y;
        return Math.sqrt(dx*dx + dy*dy) < radius;
      });
    }
    if (d.type === 'shape') {
      var cx2 = (d.x1 + d.x2) / 2, cy2 = (d.y1 + d.y2) / 2;
      var dx = cx2 - x, dy = cy2 - y;
      return Math.sqrt(dx*dx + dy*dy) >= radius;
    }
    return true;
  });
}

// ── Render one shape 
function renderShape(d) {
  ctx.shadowColor = d.shadow;
  ctx.shadowBlur  = 15;
  ctx.strokeStyle = d.color;
  ctx.lineWidth   = 4;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.beginPath();

  var x1 = Math.min(d.x1, d.x2), y1 = Math.min(d.y1, d.y2);
  var x2 = Math.max(d.x1, d.x2), y2 = Math.max(d.y1, d.y2);
  var w  = x2 - x1, h = y2 - y1;
  var dispW = w, dispH = h;

  if (d.shape === 'circle') {
    var rx = w / 2, ry = h / 2;
    ctx.ellipse(x1 + rx, y1 + ry, rx, ry, 0, 0, 2 * Math.PI);
  } else if (d.shape === 'rect') {
    ctx.rect(x1, y1, w, h);
  } else if (d.shape === 'square') {
    var side = Math.min(w, h);
    ctx.rect(x1, y1, side, side);
    dispW = side; dispH = side;
  }
  ctx.stroke();

  var labelX = x1 + dispW / 2;
  var labelY = y1 + dispH + 22;
  ctx.save();
  ctx.shadowBlur   = 0;
  ctx.scale(-1, 1);
  ctx.fillStyle    = d.color;
  ctx.font         = 'bold 13px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(Math.round(dispW) + ' × ' + Math.round(dispH) + ' px', -labelX, labelY);
  ctx.restore();
}

// ── Watermark 
function drawWatermark() {
  ctx.save();
  ctx.scale(-1, 1);                          
  ctx.globalAlpha   = 0.2;                  
  ctx.fillStyle     = '#ffffff';
  ctx.font          = 'italic 500 14px "Georgia", serif';
  ctx.letterSpacing = '0.08em';
  ctx.textAlign     = 'right';
  ctx.textBaseline  = 'bottom';
  ctx.fillText('Engineered by Faiz Dev & Co.', -(16), c.height - 16);
  ctx.restore();
}

// ── Color palette HUD (top-right, vertical) 
function drawColorPalette(fingerX, fingerY) {
  var pcx    = c.width - 54;
  var startY = 54;
  var now    = Date.now();

  for (var i = 0; i < COLORS.length; i++) {
    var col = COLORS[i];
    var pcy = startY + i * (SWATCH_R * 2 + SWATCH_GAP) + SWATCH_R;

    var dx = fingerX - pcx, dy = fingerY - pcy;
    var inside = Math.sqrt(dx*dx + dy*dy) < SWATCH_R + 10;

    if (inside) {
      if (hoverColor !== i) { hoverColor = i; hoverStart = now; }
      if (now - hoverStart >= HOVER_DWELL) { activeColor = i; hoverColor = -1; }
    } else if (hoverColor === i) {
      hoverColor = -1;
    }

    var isActive  = (i === activeColor);
    var isHovered = (i === hoverColor);
    var progress  = isHovered ? Math.min(1, (now - hoverStart) / HOVER_DWELL) : 0;

    ctx.save();
    ctx.shadowColor = isActive ? col.shadow : 'transparent';
    ctx.shadowBlur  = isActive ? 22 : 0;

    ctx.beginPath();
    ctx.arc(pcx, pcy, SWATCH_R, 0, 2 * Math.PI);
    ctx.fillStyle   = col.stroke;
    ctx.globalAlpha = isActive ? 1 : 0.55;
    ctx.fill();
    ctx.strokeStyle = isActive ? '#fff' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth   = isActive ? 3 : 1.5;
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    if (isHovered && progress > 0) {
      ctx.beginPath();
      ctx.arc(pcx, pcy, SWATCH_R + 6, -Math.PI/2, -Math.PI/2 + progress * 2 * Math.PI);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 3;
      ctx.stroke();
    }

    // Label unmirrored, to the left of swatch
    ctx.save();
    ctx.scale(-1, 1);
    ctx.fillStyle    = 'rgba(255, 255, 255, 0.55)';
    ctx.font         = '14px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(col.label, -(pcx - SWATCH_R - 8), pcy);
    ctx.restore();

    ctx.restore();
  }
}

// ── Shape palette HUD (top-left, vertical) ────────────────────
function drawShapePalette(fingerX, fingerY) {
  var scx    = 54;
  var startY = 54;
  var now    = Date.now();

  for (var i = 0; i < SHAPES.length; i++) {
    var sh  = SHAPES[i];
    var scy = startY + i * (SHAPE_R * 2 + SHAPE_GAP) + SHAPE_R;

    var dx = fingerX - scx, dy = fingerY - scy;
    var inside = Math.sqrt(dx*dx + dy*dy) < SHAPE_R + 10;

    if (inside) {
      if (hoverShape !== i) { hoverShape = i; hoverShapeStart = now; }
      if (now - hoverShapeStart >= HOVER_DWELL) { activeShape = i; hoverShape = -1; }
    } else if (hoverShape === i) {
      hoverShape = -1;
    }

    var isActive  = (i === activeShape);
    var isHovered = (i === hoverShape);
    var progress  = isHovered ? Math.min(1, (now - hoverShapeStart) / HOVER_DWELL) : 0;
    var acol      = COLORS[activeColor];

    ctx.save();
    ctx.shadowColor = isActive ? acol.shadow : 'transparent';
    ctx.shadowBlur  = isActive ? 18 : 0;

    ctx.beginPath();
    ctx.arc(scx, scy, SHAPE_R, 0, 2 * Math.PI);
    ctx.fillStyle = isActive ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = isActive ? acol.stroke : 'rgba(255,255,255,0.25)';
    ctx.lineWidth   = isActive ? 2.5 : 1.5;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    if (isHovered && progress > 0) {
      ctx.beginPath();
      ctx.arc(scx, scy, SHAPE_R + 6, -Math.PI/2, -Math.PI/2 + progress * 2 * Math.PI);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 3;
      ctx.stroke();
    }

    // Icon + label unmirrored
    ctx.save();
    ctx.scale(-1, 1);
    ctx.font         = '18px serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sh.icon, -scx, scy);

    ctx.fillStyle    = isActive ? acol.stroke : 'rgba(255,255,255,0.55)';
    ctx.font         = '11px monospace';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(sh.label, -(scx + SHAPE_R + 8), scy);
    ctx.restore();

    ctx.restore();
  }
}

// ── Main render loop 
function run(res) {
  c.width  = window.innerWidth;
  c.height = window.innerHeight;

  ctx.drawImage(res.image, 0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(10, 6, 2, 0.85)';
  ctx.fillRect(0, 0, c.width, c.height);

  // ── Watermark ────
  drawWatermark();

  // Draw all stored drawings
  for (var i = 0; i < drawings.length; i++) {
    var d = drawings[i];
    if (d.type === 'stroke') {
      if (!d.pts.length) continue;
      ctx.shadowColor = d.pts[0].shadow;
      ctx.shadowBlur  = 15;
      ctx.strokeStyle = d.pts[0].color;
      ctx.lineWidth   = 16;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      for (var j = 0; j < d.pts.length; j++) {
        if (j === 0) ctx.moveTo(d.pts[j].x, d.pts[j].y);
        else         ctx.lineTo(d.pts[j].x, d.pts[j].y);
      }
      ctx.stroke();
    } else {
      renderShape(d);
    }
  }

  // Live shape preview
  if (shapeLive) renderShape(shapeLive);

  if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
    var lm = res.multiHandLandmarks[0];
    drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: 'rgba(245,208,97,0.3)', lineWidth: 2 });
    drawLandmarks (ctx, lm, { color: '#FFFFFF', lineWidth: 1, radius: 2 });

    // Smooth index finger tip
    var rx = lm[8].x * c.width,  ry = lm[8].y * c.height;
    if (sx === null) { sx = rx; sy = ry; }
    else { sx += (rx - sx) * 0.45; sy += (ry - sy) * 0.45; }

    // Smooth middle finger tip
    var rmx = lm[12].x * c.width, rmy = lm[12].y * c.height;
    if (mx === null) { mx = rmx; my = rmy; }
    else { mx += (rmx - mx) * 0.45; my += (rmy - my) * 0.45; }

    // Smooth thumb tip
    var rtx = lm[4].x * c.width, rty = lm[4].y * c.height;
    if (tx === null) { tx = rtx; ty = rty; }
    else { tx += (rtx - tx) * 0.45; ty += (rty - ty) * 0.45; }

    var middleUp = isMiddleFingerUp(lm);
    var pd       = pinchDist(lm);
    var isPinch  = pd < 0.07;
    var pmx      = (sx + tx) / 2, pmy = (sy + ty) / 2;

    // Draw HUDs
    drawColorPalette(sx, sy);
    drawShapePalette(sx, sy);

    if (middleUp) {
      // ── ERASE ───────
      ctx.shadowBlur  = 0;
      ctx.beginPath();
      ctx.arc(mx, my, 30, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255,80,80,0.8)';
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.fillStyle   = 'rgba(255,80,80,0.15)';
      ctx.fill();
      eraseNear(mx, my, 30);
      pinching   = false;
      shapeLive  = null;
      shapeStart = null;
      curStroke  = null;

    } else if (activeShape > 0) {
      // ── SHAPE MODE ──
      var col = COLORS[activeColor];

      // Pinch cursor dot
      ctx.beginPath();
      ctx.arc(pmx, pmy, 8, 0, 2 * Math.PI);
      ctx.shadowColor = col.shadow;
      ctx.shadowBlur  = isPinch ? 20 : 6;
      ctx.fillStyle   = isPinch ? col.stroke : 'rgba(255,255,255,0.3)';
      ctx.fill();
      ctx.shadowBlur  = 0;

      // Dashed line between thumb and index
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = isPinch ? col.stroke : 'rgba(255,255,255,0.2)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      var shapeMap = ['', 'circle', 'rect', 'square'];

      if (isPinch && !pinching) {
        pinching   = true;
        shapeStart = { x: pmx, y: pmy };
      } else if (isPinch && pinching && shapeStart) {
        shapeLive = {
          type: 'shape', shape: shapeMap[activeShape],
          x1: shapeStart.x, y1: shapeStart.y,
          x2: pmx, y2: pmy,
          color: col.stroke, shadow: col.shadow
        };
      } else if (!isPinch && pinching) {
        if (shapeLive) drawings.push(shapeLive);
        shapeLive  = null;
        pinching   = false;
        shapeStart = null;
      }

      curStroke = null;

    } else {
      // ── FREEHAND MODE ──────────────────────────────────────────
      shapeLive  = null;
      pinching   = false;
      shapeStart = null;

      var col = COLORS[activeColor];
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, 2 * Math.PI);
      ctx.shadowColor = col.shadow;
      ctx.shadowBlur  = shift ? 20 : 8;
      ctx.fillStyle   = shift ? col.stroke : 'rgba(245,208,97,0.4)';
      ctx.fill();
      ctx.shadowBlur  = 0;

      if (shift) {
        if (!curStroke) {
          curStroke = { type: 'stroke', pts: [] };
          drawings.push(curStroke);
        }
        curStroke.pts.push({ x: sx, y: sy, color: col.stroke, shadow: col.shadow });
      } else {
        curStroke = null;
      }
    }

  } else {
    curStroke  = null;
    pinching   = false;
    shapeLive  = null;
    shapeStart = null;
    sx = null; sy = null;
    mx = null; my = null;
    tx = null; ty = null;
    hoverColor = -1;
    hoverShape = -1;
  }
}

// ── MediaPipe setup ─
var h = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

h.setOptions({
  maxNumHands:            1,
  modelComplexity:        1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence:  0.5
});

h.onResults(run);

var cam = new Camera(vid, {
  onFrame: async () => { await h.send({ image: vid }); },
  width:  1280,
  height: 720
});

cam.start();