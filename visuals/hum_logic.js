import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';
import { getCached, setCached, urlFor, prefetch } from './data_cache.js';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

let currentData = null;
let colorScale = null;

const humContainer = document.getElementById('hum-container');
let width = humContainer.offsetWidth;
let height = humContainer.offsetHeight;

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
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ff0000';
            ctx.font = '16px Arial';
            ctx.fillText(`Failed to load data for ${year}, ${month}`, width / 2 - 150, height / 2);
        }
    }
}

export function renderHumInterpolated(yA, mA, yB, mB, f) {
    const cv = document.getElementById('hum-canvas');
    if (cv && !canvasVisible(cv)) return;

    const a = getCached('hum', yA, mA);
    if (!a) { prefetch('hum', yA, mA); return; }
    const b = getCached('hum', yB, mB);
    if (!b) prefetch('hum', yB, mB);

    currentData = a;
    const label = f < 0.5 ? { y: yA, m: mA } : { y: yB, m: mB };
    paintFrame(a.data, label.y, label.m, a.units, { skipIfHidden: true, b: (b && f > 0) ? b.data : null, f });
}

// 11 flux levels (dry → wet) as RGB, plus land, for direct ImageData writes
// Now: blue (dry, value=0) → yellow (humid, value=0.02)
const HUM_RGB = [
    [139, 30, 30],   // 0.0180+  desaturated angry red (most humid)
    [160, 60, 60],   // ~0.0162  muted dark red
    [180, 70, 70],   // ~0.0144  muted red
    [200, 85, 75],   // ~0.0126  muted red-orange
    [210, 110, 70],  // ~0.0108  muted orange
    [200, 140, 80],  // ~0.0090  muted orange-brown (mid-point)
    [170, 160, 90],  // ~0.0072  muted yellow-brown
    [140, 170, 110], // ~0.0054  muted olive/green
    [100, 160, 140], // ~0.0036  muted teal
    [70, 120, 170],  // ~0.0018  muted light blue
    [50, 70, 140]    // 0.0000  deep muted blue (driest)
];
const HUM_LAND = [224, 224, 224];

function HUMRGB(value) {
    // Map value range 0 to 0.02 across the 11 levels
    if (value >= 0.019) return HUM_RGB[0];   // 0.018 - 0.02
    if (value >= 0.018) return HUM_RGB[1];   // 0.016 - 0.018
    if (value >= 0.017) return HUM_RGB[2];   // 0.014 - 0.016
    if (value >= 0.015) return HUM_RGB[3];   // 0.012 - 0.014
    if (value >= 0.013) return HUM_RGB[4];   // 0.010 - 0.012
    if (value >= 0.011) return HUM_RGB[5];   // 0.008 - 0.010
    if (value >= 0.009) return HUM_RGB[6];   // 0.006 - 0.008
    if (value >= 0.006) return HUM_RGB[7];   // 0.004 - 0.006
    if (value >= 0.004) return HUM_RGB[8];   // 0.002 - 0.004
    if (value >= 0.002) return HUM_RGB[9];   // 0.001 - 0.002
    return HUM_RGB[10];                       // 0.000 - 0.001 (driest)
}

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

    const B = opts.b || null;
    const f = opts.f || 0;

    ensureOffscreen(nx, ny);
    const d = offImg.data;
    for (let py = 0; py < ny; py++) {
        const aRow = values[ny - py - 1];
        const bRow = B ? B[ny - py - 1] : null;
        for (let px = 0; px < nx; px++) {
            const ai = px;
            let value = aRow[ai];
            if (bRow) {
                const bv = bRow[ai];
                const aBad = value === null || isNaN(value);
                const bBad = bv === null || isNaN(bv);
                if (aBad && bBad) value = NaN;
                else if (aBad) value = bv;
                else if (!bBad) value = value + (bv - value) * f;
            }
            const o = (py * nx + px) * 4;
            const c = (value !== null && !isNaN(value)) ? HUMRGB(value) : HUM_LAND;
            d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
    }
    offCtx.putImageData(offImg, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offCanvas, 0, 0, width, height);

    drawAnnotations(ctx, year, month);
}

function drawAnnotations(ctx, year, month) {
    const monthName = MONTH_NAMES[month] || month;
    const titleSize = Math.max(11, Math.min(16, width / 28));
    ctx.font = `500 ${titleSize}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(26,26,24,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Specific Humidity · ${monthName} ${year}`, width / 2, 20);
}

// Static legend with numeric flux endpoints
function buildLegend() {
    const div = document.getElementById('hum-overall-stats');
    if (!div) return;
    div.className = 'viz-stats';
    div.innerHTML = `<div class="legend">
        <span class="legend-label">Near-Surface Specific Humidity</span>
        <span class="ramp">
            <span>Dry 0.00</span>
            <span class="bar" style="background:linear-gradient(to right,#3a5c8c,#6498c4,#a6c7c7,#d6d4aa,#e8b87a,#aa4c3a,#8b3a2a)"></span>
            <span>0.02 Wet</span>
        </span>
    </div>`;
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
    const i = Math.floor(mouseX / rect.width * nx);
    const j = Math.floor(mouseY / rect.height * ny);

    if (i >= 0 && i < nx && j >= 0 && j < ny) {
        const hum = humData[ny - j - 1][i];
        updateToolTip(event, hum);
        updatePointStats(i, j, hum);
    }
}

function updateToolTip(event, hum) {
    let tooltip = document.querySelector("#hum-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "hum-tooltip";
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';
    if (hum !== null && !isNaN(hum)) {
        tooltip.innerHTML = `💦 ${hum.toFixed(4)}`;
    } else {
        tooltip.innerHTML = `🌊 No Data`;
    }
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = event.pageY + 'px';
}

function updatePointStats(i, j, hum) {
    const pointStatsDiv = document.getElementById('hum-point-stats');
    if (!pointStatsDiv) return;
    const val = hum;
    pointStatsDiv.innerHTML = `
        📍 <strong>Location:</strong> (${i}, ${j}) |
        <strong>Humidity:</strong> ${val.toFixed(4)}<br>
        <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
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
