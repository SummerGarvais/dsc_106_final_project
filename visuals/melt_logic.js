import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';
import { getCached, setCached, urlFor, prefetch } from './data_cache.js';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

let currentData = null;
let colorScale = null;

const iceMeltContainer = document.getElementById('ice-melt-container');
let width = iceMeltContainer.offsetWidth;
let height = iceMeltContainer.offsetHeight;

const colors = [
    '#084594', '#1f64af', '#367ebd', '#60b2e9', '#99d6f9', '#f0f8ff',
    '#ffeabb', '#ffd4b3', '#ffb377', '#f97e3c', '#e34a33'
];

document.addEventListener('DOMContentLoaded', function () {
    initializeSeaMeltCanvas();

    new ResizeObserver(() => {
        const newW = iceMeltContainer.clientWidth;
        const newH = iceMeltContainer.clientHeight;
        if (newW === width && newH === height) return;
        width = newW;
        height = newH;
        const canvas = document.getElementById('melt-canvas');
        if (canvas) {
            resizeCanvas(canvas);
            if (currentData) paintFrame(currentData.data, getCurrentYear(), getCurrentMonth(), currentData.units);
        }
    }).observe(iceMeltContainer);
});

function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initializeSeaMeltCanvas() {
    width = iceMeltContainer.clientWidth;
    height = iceMeltContainer.clientHeight;

    const canvas = document.createElement('canvas');
    canvas.id = 'melt-canvas';

    const vizDiv = document.getElementById('ice-melt-container');
    if (vizDiv) {
        vizDiv.innerHTML = '';
        vizDiv.appendChild(canvas);
    }

    resizeCanvas(canvas);

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector("#melt-tooltip");
        if (tooltip) tooltip.style.visibility = 'hidden';
        const pointStatsDiv = document.getElementById('melt-point-stats');
        if (pointStatsDiv) {
            pointStatsDiv.innerHTML = `
                📍 <strong>Location:</strong> No Data |
                <strong>Ice flux:</strong> N/A <br>
                <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
            `;
        }
    });

    colorScale = d3.scaleSequentialLog().domain([0.01, 5]).interpolator(d3.interpolateBlues);
    buildLegend();
}

export async function loadNewMeltData() {
    const year = getCurrentYear();
    const month = getCurrentMonth();

    const cached = getCached('melt', year, month);
    if (cached) {
        currentData = cached;
        paintFrame(cached.data, year, month, cached.units);
        return;
    }

    try {
        const response = await fetch(urlFor('melt', year, month));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const newData = await response.json();
        setCached('melt', year, month, newData);
        currentData = newData;
        paintFrame(newData.data, year, month, newData.units);
    } catch (error) {
        console.error(`Error loading data for ${year}:`, error);
        const canvas = document.getElementById('melt-canvas');
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

export function renderMeltInterpolated(yA, mA, yB, mB, f) {
    const cv = document.getElementById('melt-canvas');
    if (cv && !canvasVisible(cv)) return;

    const a = getCached('melt', yA, mA);
    if (!a) { prefetch('melt', yA, mA); return; }
    const b = getCached('melt', yB, mB);
    if (!b) prefetch('melt', yB, mB);

    currentData = a;
    const label = f < 0.5 ? { y: yA, m: mA } : { y: yB, m: mB };
    paintFrame(a.data, label.y, label.m, a.units, { skipIfHidden: true, b: (b && f > 0) ? b.data : null, f });
}

// 11 flux levels (freeze→melt) as RGB, plus land, for direct ImageData writes
const MELT_RGB = [
    [8, 69, 148], [31, 100, 175], [54, 126, 189], [96, 178, 233], [153, 214, 249],
    [240, 248, 255], [255, 234, 187], [255, 212, 179], [255, 179, 119], [249, 126, 60], [227, 74, 51]
];
const MELT_LAND = [224, 224, 224];

// Convert flux units to human readable mm/day of ice change
const SECONDS_PER_DAY = 86400;
function fmtChange(v) {
    if (v === null || isNaN(v)) return '—';
    const mm = v * SECONDS_PER_DAY;
    const a = Math.abs(mm);
    if (a < 0.05) return '≈0 mm/day';
    const word = mm < 0 ? 'melting' : 'freezing';
    return `${a.toFixed(a < 10 ? 1 : 0)} mm/day ${word}`;
}
function meltRGB(value) {
    if (value <= -0.0009) return MELT_RGB[10];
    if (value <= -0.0007) return MELT_RGB[9];
    if (value <= -0.0005) return MELT_RGB[8];
    if (value <= -0.0003) return MELT_RGB[7];
    if (value <= -0.0001) return MELT_RGB[6];
    if (value <= 0) return MELT_RGB[5];
    if (value <= 0.0001) return MELT_RGB[4];
    if (value <= 0.0003) return MELT_RGB[3];
    if (value <= 0.0005) return MELT_RGB[2];
    if (value <= 0.0007) return MELT_RGB[1];
    return MELT_RGB[0];
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
    const canvas = document.getElementById('melt-canvas');
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
            const ai = nx - px - 1;
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
            const c = (value !== null && !isNaN(value)) ? meltRGB(value) : MELT_LAND;
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
    ctx.fillText(`Ice Melt Flux · ${monthName} ${year}`, width / 2, 20);
}

// Static legend with numeric flux endpoints
function buildLegend() {
    const div = document.getElementById('melt-overall-stats');
    if (!div) return;
    div.className = 'viz-stats';
    div.innerHTML = `<div class="legend">
        <span class="legend-label">Daily ice change (mm/day, water-equiv.)</span>
        <span class="ramp">
            <span>melting −78</span>
            <span class="bar" style="background:linear-gradient(to right,#e34a33,#f97e3c,#f0f8ff,#367ebd,#084594)"></span>
            <span>+78 freezing</span>
        </span>
        <span class="sw"><i style="background:#f0f8ff"></i>0 (no change)</span>
    </div>`;
}

function handleMouseMove(event) {
    if (!currentData) return;
    if ('ontouchstart' in window) return;

    const canvas = document.getElementById('melt-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const fluxData = currentData.data;
    if (!fluxData) return;

    const nx = fluxData[0].length;
    const ny = fluxData.length;
    const i = Math.floor(mouseX / rect.width * nx);
    const j = Math.floor(mouseY / rect.height * ny);

    if (i >= 0 && i < nx && j >= 0 && j < ny) {
        const meltFlux = fluxData[ny - j - 1][nx - i - 1];
        updateToolTip(event, meltFlux);
        updatePointStats(i, j, meltFlux);
    }
}

function updateToolTip(event, meltFlux) {
    let tooltip = document.querySelector("#melt-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "melt-tooltip";
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';
    if (meltFlux !== null && !isNaN(meltFlux)) {
        tooltip.innerHTML = `❄️ ${fmtChange(meltFlux)}`;
    } else {
        tooltip.innerHTML = `🌊 No sea ice / Land`;
    }
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = event.pageY + 'px';
}

function updatePointStats(i, j, meltFlux) {
    const pointStatsDiv = document.getElementById('melt-point-stats');
    if (!pointStatsDiv) return;
    const val = fmtChange(meltFlux);
    pointStatsDiv.innerHTML = `
        📍 <strong>Location:</strong> (${i}, ${j}) |
        <strong>Ice change:</strong> ${val}<br>
        <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
    `;
}

function createColorbar() {
    const colorbarDiv = document.getElementById('melt-colorbar');
    if (!colorbarDiv) return;
    colorbarDiv.innerHTML = '';

    const svg = d3.select("#colorbar").append("svg")
        .attr("width", 400).attr("height", 70)
        .style("display", "block").style("margin", "0 auto");

    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "iceGradient")
        .attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#f0f8ff");
    gradient.append("stop").attr("offset", "20%").attr("stop-color", "#c6dbef");
    gradient.append("stop").attr("offset", "40%").attr("stop-color", "#9ecae1");
    gradient.append("stop").attr("offset", "60%").attr("stop-color", "#6baed6");
    gradient.append("stop").attr("offset", "80%").attr("stop-color", "#2171b5");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#084594");

    svg.append("rect").attr("width", 300).attr("height", 20).attr("x", 50).attr("y", 10)
        .style("fill", "url(#iceGradient)").style("stroke", "#ddd").style("stroke-width", "1px");
    svg.append("text").attr("x", 50).attr("y", 45).text("0 m").style("font-size", "12px").style("text-anchor", "middle");
    svg.append("text").attr("x", 200).attr("y", 45).text("1 m").style("font-size", "12px").style("text-anchor", "middle");
    svg.append("text").attr("x", 350).attr("y", 45).text("3+ m").style("font-size", "12px").style("text-anchor", "middle");
    svg.append("text").attr("x", 200).attr("y", 65).text("Sea Ice Flux →").style("font-size", "11px").style("text-anchor", "middle").style("fill", "#666");
}
