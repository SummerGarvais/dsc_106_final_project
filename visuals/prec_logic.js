import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';
import { getCached, setCached, urlFor, prefetch } from './data_cache.js';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

let currentData = null;
let colorScale = null;

const precContainer = document.getElementById('prec-container');
let width = precContainer.offsetWidth;
let height = precContainer.offsetHeight;

// Stops as RGB triples
const PREC_HIGH = [8, 69, 148];
const PREC_MID = [254, 217, 118];
const PREC_LOW = [255, 255, 255];
// Writes the interpolated color straight into an ImageData buffer 
function writePrecRGB(d, o, precValue, minPrecip, maxPrecip) {
    const t = Math.max(0, Math.min(1, (precValue - minPrecip) / (maxPrecip - minPrecip)));
    let a, b, tt;
    if (t <= 0.5) { a = PREC_HIGH; b = PREC_MID; tt = t * 2; }
    else { a = PREC_MID; b = PREC_LOW; tt = (t - 0.5) * 2; }
    d[o] = (a[0] + (b[0] - a[0]) * tt) | 0;
    d[o + 1] = (a[1] + (b[1] - a[1]) * tt) | 0;
    d[o + 2] = (a[2] + (b[2] - a[2]) * tt) | 0;
    d[o + 3] = 255;
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

document.addEventListener('DOMContentLoaded', function () {
    initializePrecCanvas();

    new ResizeObserver(() => {
        const newW = precContainer.clientWidth;
        const newH = precContainer.clientHeight;
        if (newW === width && newH === height) return;
        width = newW;
        height = newH;
        const canvas = document.getElementById('prec-canvas');
        if (canvas) {
            resizeCanvas(canvas);
            if (currentData) paintFrame(currentData.data, getCurrentYear(), getCurrentMonth(), currentData.units);
        }
    }).observe(precContainer);
});

function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initializePrecCanvas() {
    width = precContainer.clientWidth;
    height = precContainer.clientHeight;

    const canvas = document.createElement('canvas');
    canvas.id = 'prec-canvas';

    const vizDiv = document.getElementById('prec-container');
    if (vizDiv) {
        vizDiv.innerHTML = '';
        vizDiv.appendChild(canvas);
    }

    resizeCanvas(canvas);

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector("#prec-tooltip");
        if (tooltip) tooltip.style.visibility = 'hidden';
        const pointStatsDiv = document.getElementById('prec-point-stats');
        if (pointStatsDiv) {
            pointStatsDiv.innerHTML = `
                📍 <strong>Location:</strong> No Data |
                <strong>Precipitation:</strong> N/A <br>
                <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
            `;
        }
    });

    colorScale = d3.scaleSequentialLog().domain([0.01, 5]).interpolator(d3.interpolateBlues);
    buildLegend();
}

export async function loadNewPrecData() {
    const year = getCurrentYear();
    const month = getCurrentMonth();

    const cached = getCached('prec', year, month);
    if (cached) {
        currentData = cached;
        paintFrame(cached.data, year, month, cached.units);
        return;
    }

    try {
        const response = await fetch(urlFor('prec', year, month));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const newData = await response.json();
        setCached('prec', year, month, newData);
        currentData = newData;
        paintFrame(newData.data, year, month, newData.units);
    } catch (error) {
        console.error(`Error loading data for ${year}:`, error);
        const canvas = document.getElementById('prec-canvas');
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

export function renderPrecInterpolated(yA, mA, yB, mB, f) {
    const cv = document.getElementById('prec-canvas');
    if (cv && !canvasVisible(cv)) return;

    const a = getCached('prec', yA, mA);
    if (!a) { prefetch('prec', yA, mA); return; }
    const b = getCached('prec', yB, mB);
    if (!b) prefetch('prec', yB, mB);

    currentData = a;
    const label = f < 0.5 ? { y: yA, m: mA } : { y: yB, m: mB };
    paintFrame(a.data, label.y, label.m, a.units, { skipIfHidden: true, b: (b && f > 0) ? b.data : null, f });
}

function paintFrame(values, year, month, units, opts = {}) {
    const canvas = document.getElementById('prec-canvas');
    if (!canvas || !values || values.length === 0) return;
    if (opts.skipIfHidden && !canvasVisible(canvas)) return;

    const ctx = canvas.getContext('2d');
    const ny = values.length;
    const nx = values[0].length;

    // B-frame interpolation 
    const B = opts.b || null;
    const f = opts.f || 0;
    const interp = (a, b) => {
        if (!B) return a;
        const aBad = a === null || isNaN(a);
        const bBad = b === null || isNaN(b);
        if (aBad && bBad) return NaN;
        if (aBad) return b;
        if (bBad) return a;
        return a + (b - a) * f;
    };

    // Interpolated data range for the color scale
    let minPrecip = Infinity, maxPrecip = -Infinity;
    for (let j = 0; j < ny; j++) {
        const aRow = values[j];
        const bRow = B ? B[j] : null;
        for (let i = 0; i < nx; i++) {
            const v = bRow ? interp(aRow[i], bRow[i]) : aRow[i];
            if (v !== null && !isNaN(v)) {
                if (v < minPrecip) minPrecip = v;
                if (v > maxPrecip) maxPrecip = v;
            }
        }
    }

    // Rasterize into the offscreen buffer
    ensureOffscreen(nx, ny);
    const d = offImg.data;
    for (let py = 0; py < ny; py++) {
        const aRow = values[ny - py - 1];
        const bRow = B ? B[ny - py - 1] : null;
        for (let px = 0; px < nx; px++) {
            const value = bRow ? interp(aRow[px], bRow[px]) : aRow[px];
            const o = (py * nx + px) * 4;
            if (value !== null && !isNaN(value)) {
                writePrecRGB(d, o, value, minPrecip, maxPrecip);
            } else {
                d[o] = 240; d[o + 1] = 240; d[o + 2] = 240; d[o + 3] = 255;
            }
        }
    }
    offCtx.putImageData(offImg, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offCanvas, 0, 0, width, height);

    drawAnnotations(ctx, year, month);
    updateLegend(minPrecip, maxPrecip);
}

function drawAnnotations(ctx, year, month) {
    const monthName = MONTH_NAMES[month] || month;
    const titleSize = Math.max(11, Math.min(16, width / 28));
    ctx.font = `500 ${titleSize}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(26,26,24,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Precipitation · ${monthName} ${year}`, width / 2, 20);
}

// Build the legend shell once
function buildLegend() {
    const div = document.getElementById('prec-overall-stats');
    if (!div) return;
    div.className = 'viz-stats';
    div.innerHTML = `<div class="legend">
        <span class="legend-label">Rainfall rate (mm/day)</span>
        <span class="ramp">
            <span id="prec-leg-min">—</span>
            <span class="bar" style="background:linear-gradient(to right,#084594,#fed976,#ffffff)"></span>
            <span id="prec-leg-max">—</span>
        </span>
        <span class="sw">drier → wetter</span>
    </div>`;
}

// Convert precipitation in m/s to mm/day and format for display
const SECONDS_PER_DAY = 86400;
function fmtMmPerDay(v) {
    if (!isFinite(v)) return '—';
    const mm = v * SECONDS_PER_DAY;
    if (mm < 0.05) return '≈0';
    return `${mm.toFixed(mm < 10 ? 1 : 0)}`;
}

function updateLegend(min, max) {
    const lo = document.getElementById('prec-leg-min');
    const hi = document.getElementById('prec-leg-max');
    if (lo) lo.textContent = fmtMmPerDay(min);
    if (hi) hi.textContent = fmtMmPerDay(max);
}

function handleMouseMove(event) {
    if (!currentData) return;
    if ('ontouchstart' in window) return;

    const canvas = document.getElementById('prec-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const precData = currentData.data;
    if (!precData) return;

    const nx = precData[0].length;
    const ny = precData.length;
    const i = Math.floor(mouseX / rect.width * nx);
    const j = Math.floor(mouseY / rect.height * ny);

    if (i >= 0 && i < nx && j >= 0 && j < ny) {
        const precLevel = precData[ny - j - 1][i];
        updateToolTip(event, precLevel);
        updatePointStats(i, j, precLevel);
    }
}

function updateToolTip(event, precLevel) {
    let tooltip = document.querySelector("#prec-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "prec-tooltip";
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';
    if (precLevel !== null && !isNaN(precLevel)) {
        tooltip.innerHTML = `🌧️ rainfall: ${fmtMmPerDay(precLevel)} mm/day`;
    } else {
        tooltip.innerHTML = `🌊 No precipitation / Land`;
    }
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = event.pageY + 'px';
}

function updatePointStats(i, j, precLevel) {
    const pointStatsDiv = document.getElementById('prec-point-stats');
    if (!pointStatsDiv) return;
    const val = (precLevel !== null && !isNaN(precLevel)) ? `${fmtMmPerDay(precLevel)} mm/day` : '≈0 mm/day';
    pointStatsDiv.innerHTML = `
        📍 <strong>Location:</strong> (${i}, ${j}) |
        <strong>Precipitation:</strong> ${val}<br>
        <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
    `;
}

function createColorbar() {
    const colorbarDiv = document.getElementById('prec-colorbar');
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
    svg.append("text").attr("x", 200).attr("y", 65).text("Precipitation →").style("font-size", "11px").style("text-anchor", "middle").style("fill", "#666");
}
