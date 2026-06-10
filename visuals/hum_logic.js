import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';
import { getCached, setCached, urlFor, prefetch } from './data_cache.js';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

let currentData = null;
let colorScale = null;
let baseline1850 = null;   // cached per-month 1850 baseline

// Fetch (or return cached) the 1850 baseline for a given month
async function ensureBaseline(month) {
    const cached = getCached('hum', 1850, month);
    if (cached) { baseline1850 = cached; return; }
    try {
        const res = await fetch(urlFor('hum', 1850, month));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCached('hum', 1850, month, data);
        baseline1850 = data;
    } catch (e) {
        console.error('Failed to load 1850 humidity baseline:', e);
        baseline1850 = null;
    }
}

const humContainer = document.getElementById('hum-container');
let width = humContainer.offsetWidth;
let height = humContainer.offsetHeight;

// Split-slider state
let splitX = 0.5;        // 0–1, fraction of canvas width
let isDragging = false;

const colors = [
    '#084594', '#1f64af', '#367ebd', '#60b2e9', '#99d6f9', '#f0f8ff',
    '#ffeabb', '#ffd4b3', '#ffb377', '#f97e3c', '#e34a33'
];

document.addEventListener('DOMContentLoaded', function () {
    initializeHumCanvas();

    new ResizeObserver(() => {
        const newW = humContainer.clientWidth;
        const newH = humContainer.clientHeight;
        if (newW === width && newH === height) return;
        width = newW;
        height = newH;
        const canvas = document.getElementById('hum-canvas');
        if (canvas) {
            resizeCanvas(canvas);
            if (currentData) paintFrame(currentData.data, getCurrentYear(), getCurrentMonth(), currentData.units);
        }
    }).observe(humContainer);
});

function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initializeHumCanvas() {
    width = humContainer.clientWidth;
    height = humContainer.clientHeight;

    const canvas = document.createElement('canvas');
    canvas.id = 'hum-canvas';

    const vizDiv = document.getElementById('hum-container');
    if (vizDiv) {
        vizDiv.innerHTML = '';
        vizDiv.appendChild(canvas);
    }

    resizeCanvas(canvas);

    // Split-slider drag
    canvas.addEventListener('mousedown',   onSplitMouseDown);
    canvas.addEventListener('mousemove',   onSplitMouseMove);
    canvas.addEventListener('mouseup',     onSplitMouseUp);
    canvas.addEventListener('mouseleave',  onSplitMouseUp);
    canvas.addEventListener('touchstart',  onSplitTouchStart, { passive: true });
    canvas.addEventListener('touchmove',   onSplitTouchMove,  { passive: false });
    canvas.addEventListener('touchend',    onSplitMouseUp);

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector("#hum-tooltip");
        if (tooltip) tooltip.style.visibility = 'hidden';
        const pointStatsDiv = document.getElementById('hum-point-stats');
        if (pointStatsDiv) {
            pointStatsDiv.innerHTML = `
                📍 <strong>Location:</strong> No Data |
                <strong>Humidity:</strong> N/A <br>
                <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
            `;
        }
    });

    colorScale = d3.scaleSequentialLog().domain([0.01, 5]).interpolator(d3.interpolateBlues);
    buildLegend();
}

export async function loadNewHumData() {
    const year = getCurrentYear();
    const month = getCurrentMonth();

    await ensureBaseline(month);

    const cached = getCached('hum', year, month);
    if (cached) {
        currentData = cached;
        paintFrame(cached.data, year, month, cached.units);
        return;
    }

    try {
        const response = await fetch(urlFor('hum', year, month));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const newData = await response.json();
        setCached('hum', year, month, newData);
        currentData = newData;
        paintFrame(newData.data, year, month, newData.units);
    } catch (error) {
        console.error(`Error loading data for ${year}:`, error);
        const canvas = document.getElementById('hum-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0f1d2a';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#e9eef4';
            ctx.font = '16px Arial';
            ctx.fillText(`Failed to load data for ${year}, ${month}`, width / 2 - 150, height / 2);
        }
    }
}

export function renderHumInterpolated(yA, mA, yB, mB, f) {
    const cv = document.getElementById('hum-canvas');
    if (cv && !canvasVisible(cv)) return;

    // Keep baseline in sync with the displayed month
    const displayMonth = f < 0.5 ? mA : mB;
    if (!baseline1850 || getCached('hum', 1850, displayMonth) !== baseline1850) {
        ensureBaseline(displayMonth);
    }

    const a = getCached('hum', yA, mA);
    if (!a) { prefetch('hum', yA, mA); return; }
    const b = getCached('hum', yB, mB);
    if (!b) prefetch('hum', yB, mB);

    currentData = a;
    const label = f < 0.5 ? { y: yA, m: mA } : { y: yB, m: mB };
    paintFrame(a.data, label.y, label.m, a.units, { skipIfHidden: true, b: (b && f > 0) ? b.data : null, f });
}

// ── Color scales ─────────────────────────────────────────────────────────────
// Absolute scale (used on the left / 1850 side): dry blue → wet red
const HUM_ABS_STOPS = [
    [50,  70, 140],   // 0.000  deep blue  (driest)
    [70, 120, 170],   // 0.004
    [100,160, 140],   // 0.008  teal
    [140,170, 110],   // 0.012  olive
    [200,140,  80],   // 0.016  orange-brown
    [139, 30,  30],   // 0.020  deep red   (wettest)
];
const ABS_MAX = 20;

function humAbsRGB(v) {
    const t = Math.max(0, Math.min(1, (v * 1000) / ABS_MAX))
    const seg = Math.min(HUM_ABS_STOPS.length - 2, Math.floor(t * (HUM_ABS_STOPS.length - 1)));
    const tt  = t * (HUM_ABS_STOPS.length - 1) - seg;
    const a   = HUM_ABS_STOPS[seg];
    const b   = HUM_ABS_STOPS[seg + 1];
    return [
        (a[0] + (b[0] - a[0]) * tt) | 0,
        (a[1] + (b[1] - a[1]) * tt) | 0,
        (a[2] + (b[2] - a[2]) * tt) | 0,
    ];
}

// Diverging scale (used on the right / current-year side):
//   negative diff → blue (drier than 1850)
//   zero          → light grey
//   positive diff → red  (wetter than 1850)
const DIFF_MAX = 0.015;   // ±0.004 kg/kg covers ~95th-percentile changes

function humDiffRGB(diff) {
    const t = Math.max(-1, Math.min(1, diff / DIFF_MAX));
    if (t < 0) {
        // Blue side
        const s = -t;
        return [
            (220 + (30  - 220) * s) | 0,
            (220 + (80  - 220) * s) | 0,
            (220 + (200 - 220) * s) | 0,
        ];
    } else {
        // Red side
        return [
            (220 + (200 - 220) * t) | 0,
            (220 + (40  - 220) * t) | 0,
            (220 + (40  - 220) * t) | 0,
        ];
    }
}

const HUM_LAND = [40, 50, 60];

let offCanvas = null, offCtx = null, offImg = null, offW = 0, offH = 0;
function ensureOffscreen(nx, ny) {
    if (!offCanvas) { offCanvas = document.createElement('canvas'); offCtx = offCanvas.getContext('2d'); }
    if (offW !== nx || offH !== ny) {
        offCanvas.width = nx; offCanvas.height = ny;
        offImg = offCtx.createImageData(nx, ny);
        offW = nx; offH = ny;
    }
}
function canvasVisible(canvas) {
    const r = canvas.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return r.bottom > 0 && r.top < vh;
}

function paintFrame(values, year, month, units, opts = {}) {
    const canvas = document.getElementById('hum-canvas');
    if (!canvas || !values || values.length === 0) return;
    if (opts.skipIfHidden && !canvasVisible(canvas)) return;

    const ctx = canvas.getContext('2d');
    const ny = values.length;
    const nx = values[0].length;
    const B  = opts.b || null;
    const f  = opts.f || 0;

    const baseData = baseline1850?.data || null;
    const splitPx  = Math.round(splitX * nx);   // split position in data-grid columns

    ensureOffscreen(nx, ny);
    const d = offImg.data;

    for (let py = 0; py < ny; py++) {
        const aRow   = values[ny - py - 1];
        const bRow   = B ? B[ny - py - 1] : null;
        const baseRow = baseData ? baseData[ny - py - 1] : null;

        for (let px = 0; px < nx; px++) {
            let value = aRow[px];
            if (bRow) {
                const bv   = bRow[px];
                const aBad = value === null || isNaN(value);
                const bBad = bv    === null || isNaN(bv);
                if (aBad && bBad)   value = NaN;
                else if (aBad)      value = bv;
                else if (!bBad)     value = value + (bv - value) * f;
            }

            const o = (py * nx + px) * 4;
            let c;

            if (value === null || isNaN(value)) {
                c = HUM_LAND;
            } else if (px < splitPx) {
                // LEFT side — always show 1850 absolute humidity
                const baseVal = baseRow ? baseRow[px] : null;
                c = (baseVal !== null && !isNaN(baseVal)) ? humAbsRGB(baseVal) : HUM_LAND;
            } else {
                 c = humAbsRGB(value);
            }

            d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
    }
    offCtx.putImageData(offImg, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offCanvas, 0, 0, width, height);

    drawSplitLine(ctx, year);
    drawAnnotations(ctx, year, month);
}

// Draw the draggable divider line + handle
function drawSplitLine(ctx, year) {
    const x = splitX * width;

    // Vertical line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    // Circular handle at mid-height
    const hy = height / 2;
    const r  = 14;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(x, hy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Arrow glyphs inside handle
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = `bold ${r}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⇔', x, hy);

    // Side labels
    const labelSize = Math.max(10, Math.min(13, width / 40));
    ctx.font = `500 ${labelSize}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';

    // Left label — always 1850
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('1850 (baseline)', 8, 32);

    // Right label — current year or "1850" if at baseline
    ctx.textAlign = 'right';
    const rightLabel = `${year}`;
    ctx.fillText(rightLabel, width - 8, 32);

    ctx.restore();
}

function drawAnnotations(ctx, year, month) {
    const monthName = MONTH_NAMES[month] || month;
    const titleSize = Math.max(11, Math.min(16, width / 28));
    ctx.save();
    ctx.font = `500 ${titleSize}px system-ui, sans-serif`;
    const titleText = `Specific Humidity · ${monthName} ${year}`;
    const tw = ctx.measureText(titleText).width;
    const pad = 5, bx = width / 2 - tw / 2 - pad, by = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(bx, by, tw + pad * 2, titleSize + 6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleText, width / 2, by + (titleSize + 6) / 2);
    ctx.restore();
}

// Static legend — two scales side by side
function buildLegend() {
    const div = document.getElementById('hum-overall-stats');
    if (!div) return;
    div.className = 'viz-stats';
    div.innerHTML = `<div class="legend">
        <span class="ramp">
            <span>0 g/kg</span>
            <span class="bar" style="background:linear-gradient(to right,#32467c,#467898,#64a08c,#8caa6e,#c88c50,#8b1e1e)"></span>
            <span>20 g/kg</span>
        </span>
    </div>`;
}

// ── Split-slider drag handlers ─────────────────────────────────────────────
function splitFractionFromEvent(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
}

function onSplitMouseDown(e) {
    const canvas = document.getElementById('hum-canvas');
    if (!canvas) return;
    const x = (e.clientX - canvas.getBoundingClientRect().left) / canvas.getBoundingClientRect().width;
    if (Math.abs(x - splitX) < 0.06) {   // within ~6% of the handle
        isDragging = true;
        canvas.style.cursor = 'ew-resize';
    }
}

function onSplitMouseMove(e) {
    const canvas = document.getElementById('hum-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;

    // Update cursor hint even when not dragging
    canvas.style.cursor = Math.abs(x - splitX) < 0.06 ? 'ew-resize' : 'default';

    if (!isDragging) return;
    splitX = Math.max(0.02, Math.min(0.98, x));
    if (currentData) paintFrame(currentData.data, getCurrentYear(), getCurrentMonth(), currentData.units);
}

function onSplitMouseUp() {
    isDragging = false;
    const canvas = document.getElementById('hum-canvas');
    if (canvas) canvas.style.cursor = 'default';
}

function onSplitTouchStart(e) {
    const canvas = document.getElementById('hum-canvas');
    if (!canvas || !e.touches[0]) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches[0].clientX - rect.left) / rect.width;
    if (Math.abs(x - splitX) < 0.08) isDragging = true;
}

function onSplitTouchMove(e) {
    if (!isDragging || !e.touches[0]) return;
    e.preventDefault();
    const canvas = document.getElementById('hum-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    splitX = Math.max(0.02, Math.min(0.98, (e.touches[0].clientX - rect.left) / rect.width));
    if (currentData) paintFrame(currentData.data, getCurrentYear(), getCurrentMonth(), currentData.units);
}

function handleMouseMove(event) {
    if (!currentData) return;
    if ('ontouchstart' in window) return;

    const canvas = document.getElementById('hum-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const humData = currentData.data;
    if (!humData) return;

    const nx = humData[0].length;
    const ny = humData.length;
    const i  = Math.floor(mouseX / rect.width  * nx);
    const j  = Math.floor(mouseY / rect.height * ny);

    if (i >= 0 && i < nx && j >= 0 && j < ny) {
        const hum      = humData[ny - j - 1][i];
        const baseRow  = baseline1850?.data?.[ny - j - 1];
        const baseVal  = baseRow ? baseRow[i] : null;
        const onLeft   = (mouseX / rect.width) < splitX;
        updateToolTip(event, hum, baseVal, onLeft, getCurrentYear());
        updatePointStats(i, j, hum, baseVal, onLeft, getCurrentYear());
    }
}

function updateToolTip(event, hum, baseVal, onLeft, year) {
    let tooltip = document.querySelector("#hum-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "hum-tooltip";
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';

    if (onLeft) {
        // Left side always shows 1850 absolute
        tooltip.innerHTML = baseVal !== null && !isNaN(baseVal)
            `💧 1850 baseline: ${(baseVal * 1000).toFixed(2)} g/kg`
            `💧 ${(hum * 1000).toFixed(2)} g/kg`
    } else if (year === 1850 || baseVal === null || isNaN(baseVal)) {
        tooltip.innerHTML = hum !== null && !isNaN(hum)
            ? `💧 ${(hum * 1000).toFixed(2)} g/kg`
            : `🌍 No data`;
    } else {
        tooltip.innerHTML = hum !== null && !isNaN(hum)
        ? `💧 ${(hum * 1000).toFixed(2)} g/kg`
        : `🌍 No data`;
    }

    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top  = event.pageY + 'px';
}

function updatePointStats(i, j, hum, baseVal, onLeft, year) {
    const pointStatsDiv = document.getElementById('hum-point-stats');
    if (!pointStatsDiv) return;

    let valStr;
    if (onLeft) {
        valStr = baseVal !== null && !isNaN(baseVal) ? `${baseVal.toFixed(4)} kg/kg (1850)` : 'N/A';
    } else if (year === 1850 || baseVal === null || isNaN(baseVal)) {
        valStr = hum !== null && !isNaN(hum) ? `${hum.toFixed(4)} kg/kg` : 'N/A';
    } else {
        tooltip.innerHTML = hum !== null && !isNaN(hum)
        ? `💧 ${hum.toFixed(4)} kg/kg`
        : `🌍 No data`;
    }

    pointStatsDiv.innerHTML = `
        📍 <strong>Location:</strong> (${i}, ${j}) |
        <strong>Humidity:</strong> ${valStr}<br>
        <span style="font-size: 12px; color: #666;">Drag the centre divider to compare 1850 vs ${year}</span>
    `;
}

function createColorbar() {
    const colorbarDiv = document.getElementById('hum-colorbar');
    if (!colorbarDiv) return;
    colorbarDiv.innerHTML = '';

    const svg = d3.select("#colorbar").append("svg")
        .attr("width", 400).attr("height", 70)
        .style("display", "block").style("margin", "0 auto");

    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "humGradient")
        .attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#f0f8ff");
    gradient.append("stop").attr("offset", "20%").attr("stop-color", "#c6dbef");
    gradient.append("stop").attr("offset", "40%").attr("stop-color", "#9ecae1");
    gradient.append("stop").attr("offset", "60%").attr("stop-color", "#6baed6");
    gradient.append("stop").attr("offset", "80%").attr("stop-color", "#2171b5");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#084594");

    svg.append("rect").attr("width", 300).attr("height", 20).attr("x", 50).attr("y", 10)
        .style("fill", "url(#humGradient)").style("stroke", "#ddd").style("stroke-width", "1px");
    svg.append("text").attr("x", 50).attr("y", 45).text("0 m").style("font-size", "12px").style("text-anchor", "middle");
    svg.append("text").attr("x", 200).attr("y", 45).text("1 m").style("font-size", "12px").style("text-anchor", "middle");
    svg.append("text").attr("x", 350).attr("y", 45).text("3+ m").style("font-size", "12px").style("text-anchor", "middle");
    svg.append("text").attr("x", 200).attr("y", 65).text("Humidity Change →").style("font-size", "11px").style("text-anchor", "middle").style("fill", "#666");
}