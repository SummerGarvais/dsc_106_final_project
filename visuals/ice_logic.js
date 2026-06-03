import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';
import { getCached, setCached, urlFor, prefetch } from './data_cache.js';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

let currentData = null;
let colorScale = null;

const seaIceContainer = document.getElementById('sea-ice-container');
let width = seaIceContainer.clientWidth;
let height = seaIceContainer.clientHeight;

const backgroundImage = new Image();
backgroundImage.onload = () => initializeSeaIceCanvas();
backgroundImage.onerror = () => {
    console.warn('Background image failed to load, using fallback.');
    initializeSeaIceCanvas();
};
backgroundImage.src = './images/ice-canvas-bg.png';

document.addEventListener('DOMContentLoaded', function () {
    new ResizeObserver(() => {
        const newW = seaIceContainer.clientWidth;
        const newH = seaIceContainer.clientHeight;
        if (newW === width && newH === height) return;
        width = newW;
        height = newH;
        const canvas = document.getElementById('ice-canvas');
        if (canvas) {
            resizeCanvas(canvas);
            if (currentData) paintFrame(currentData.data, getCurrentYear(), getCurrentMonth(), currentData.units);
        }
    }).observe(seaIceContainer);
});

function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initializeSeaIceCanvas() {
    width = seaIceContainer.clientWidth;
    height = seaIceContainer.clientHeight;

    const canvas = document.createElement('canvas');
    canvas.id = 'ice-canvas';

    const vizDiv = document.getElementById('sea-ice-container');
    if (vizDiv) {
        vizDiv.innerHTML = '';
        vizDiv.appendChild(canvas);
    }

    resizeCanvas(canvas);

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector("#ice-tooltip");
        if (tooltip) tooltip.style.visibility = 'hidden';
        const pointStatsDiv = document.getElementById('ice-point-stats');
        if (pointStatsDiv) {
            pointStatsDiv.innerHTML = `
                📍 <strong>Location:</strong> No Data |
                <strong>Ice Thickness:</strong> N/A <br>
                <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
            `;
        }
    });

    colorScale = d3.scaleSequentialLog()
        .domain([0.01, 5])
        .interpolator(d3.interpolateBlues);

    buildLegend();
}

export async function loadNewIceData() {
    const year = getCurrentYear();
    const month = getCurrentMonth();

    const cached = getCached('ice', year, month);
    if (cached) {
        currentData = cached;
        paintFrame(cached.data, year, month, cached.units);
        return;
    }

    try {
        const response = await fetch(urlFor('ice', year, month));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const newData = await response.json();
        setCached('ice', year, month, newData);
        currentData = newData;
        paintFrame(newData.data, year, month, newData.units);
    } catch (error) {
        console.error(`Error loading data for ${year}:`, error);
        const canvas = document.getElementById('ice-canvas');
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

// Continuous-playback entry point
export function renderIceInterpolated(yA, mA, yB, mB, f) {
    const cv = document.getElementById('ice-canvas');
    if (cv && !canvasVisible(cv)) return;

    const a = getCached('ice', yA, mA);
    if (!a) { prefetch('ice', yA, mA); return; }
    const b = getCached('ice', yB, mB);
    if (!b) prefetch('ice', yB, mB);

    currentData = a; 
    const label = f < 0.5 ? { y: yA, m: mA } : { y: yB, m: mB };
    paintFrame(a.data, label.y, label.m, a.units, { skipIfHidden: true, b: (b && f > 0) ? b.data : null, f });
}

// Discrete thickness levels as RGB so we can write straight into ImageData
const ICE_LEVELS = [
    [0.1, [240, 248, 255]], [0.5, [198, 219, 239]], [1.0, [158, 202, 225]],
    [1.5, [107, 174, 214]], [2.0, [66, 146, 198]], [3.0, [33, 113, 181]],
];
const ICE_TOP = [8, 69, 148];
function iceRGB(value) {
    for (let k = 0; k < ICE_LEVELS.length; k++) if (value <= ICE_LEVELS[k][0]) return ICE_LEVELS[k][1];
    return ICE_TOP;
}

const OCEAN = '#0f1d2a';

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

// Single complete, opaque repaint via ImageData blit
function paintFrame(values, year, month, units, opts = {}) {
    const canvas = document.getElementById('ice-canvas');
    if (!canvas || !values || values.length === 0) return;
    // During continuous playback, don't burn time rasterizing maps that aren't on screen
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
            if (value !== null && !isNaN(value) && value > 0) {
                const c = iceRGB(value);
                d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
            } else {
                d[o + 3] = 0; 
            }
        }
    }
    offCtx.putImageData(offImg, 0, 0);

    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offCanvas, 0, 0, width, height);

    drawAnnotations(ctx, year, month);
}

function drawAnnotations(ctx, year, month) {
    const monthName = MONTH_NAMES[month] || month;

    const titleSize = Math.max(11, Math.min(16, width / 28));
    ctx.font = `500 ${titleSize}px system-ui, sans-serif`;
    const titleText = `Sea-Ice Thickness · ${monthName} ${year}`;
    const textWidth = ctx.measureText(titleText).width;
    const padding = 3;
    const boxX = width / 2 - textWidth / 2 - padding;
    const boxY = 8;
    const boxW = textWidth + padding * 2;
    const boxH = titleSize + 6;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillText(titleText, width / 2, boxY + boxH / 2);

    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const labelSize = Math.max(9, Math.min(16, width / 32));
    ctx.font = `${labelSize}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.fillText(`Arctic Circle`, width / 2, (height / 2) - labelSize - 6);
    ctx.fillText(`Antarctica`, width / 2, (height / 2) + labelSize + 6);
}

// Static discrete legend with numeric thickness ranges (built once)
function buildLegend() {
    const div = document.getElementById('ice-overall-stats');
    if (!div) return;
    const levels = [
        ['#f0f8ff', '0–0.1'], ['#c6dbef', '0.1–0.5'], ['#9ecae1', '0.5–1'],
        ['#6baed6', '1–1.5'], ['#4292c6', '1.5–2'], ['#2171b5', '2–3'], ['#084594', '3+'],
    ];
    div.className = 'viz-stats';
    div.innerHTML = `<div class="legend">
        <span class="legend-label">Sea-ice thickness (m)</span>
        <span class="sw"><i style="background:${OCEAN}"></i>no ice (ocean/land)</span>
        ${levels.map(([c, r]) => `<span class="sw"><i style="background:${c}"></i>${r}</span>`).join('')}
    </div>`;
}

function handleMouseMove(event) {
    if (!currentData) return;
    if ('ontouchstart' in window) return;

    const canvas = document.getElementById('ice-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const thicknessData = currentData.data;
    if (!thicknessData) return;

    const nx = thicknessData[0].length;
    const ny = thicknessData.length;
    const i = Math.floor(mouseX / rect.width * nx);
    const j = Math.floor(mouseY / rect.height * ny);

    if (i >= 0 && i < nx && j >= 0 && j < ny) {
        const iceDepth = thicknessData[ny - j - 1][nx - i - 1];
        updateToolTip(event, iceDepth);
        updatePointStats(i, j, iceDepth);
    }
}

function updateToolTip(event, iceDepth) {
    let tooltip = document.querySelector("#ice-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "ice-tooltip";
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';
    if (iceDepth !== null && !isNaN(iceDepth) && iceDepth > 0) {
        tooltip.innerHTML = `❄️ Sea Ice: ${iceDepth.toFixed(3)} ${currentData.units || 'm'}`;
    } else {
        tooltip.innerHTML = `🌊 No Sea Ice / Land`;
    }
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = event.pageY + 'px';
}

function updatePointStats(i, j, iceDepth) {
    const pointStatsDiv = document.getElementById('ice-point-stats');
    if (!pointStatsDiv) return;
    const val = (iceDepth !== null && !isNaN(iceDepth) && iceDepth > 0) ? `${iceDepth.toFixed(3)} ${currentData.units || 'm'}` : '0.000 m';
    pointStatsDiv.innerHTML = `
        📍 <strong>Location:</strong> (${i}, ${j}) |
        <strong>Ice Thickness:</strong> ${val}<br>
        <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
    `;
}

function createColorbar() {
    const colorbarDiv = document.getElementById('ice-colorbar');
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
    svg.append("text").attr("x", 200).attr("y", 65).text("Sea Ice Thickness →").style("font-size", "11px").style("text-anchor", "middle").style("fill", "#666");
}
