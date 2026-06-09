import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';

let svg = null;
let data = null;
let timeSeriesDataGlobal = null;
let seaLevelDataGlobal = null;
let xScale = null;
let yScale = null;
let seaLevelYScale = null;

const margin = { top: 24, right: 80, bottom: 56, left: 90 };
let width = 0;
let height = 0;

const container = document.getElementById('volo-container');

document.addEventListener('DOMContentLoaded', async function () {
    await loadData();
    setupScrollAnimation();
    render();

    // Rerender responsively on container resize
    let resizeTimer = null;
    new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => render(), 120);
    }).observe(container);
});

// --- Scroll Animation Setup ---
let animationTriggered = false;
let observer = null;

function animatePathDrawing(svgElement, duration = 1500) {
    if (!svgElement) return;

    svgElement.selectAll(".line, .sea-level-line")
        .each(function () {
            const path = d3.select(this);

            // Force DOM to compute the path
            const length = this.getTotalLength();

            // Make visible first
            path.style("opacity", 1);

            if (length > 0 && isFinite(length)) {
                // Set initial hidden state
                path.attr("stroke-dasharray", `${length} ${length}`)
                    .attr("stroke-dashoffset", length);

                // Animate to visible
                path.transition()
                    .duration(duration)
                    .ease(d3.easeCubicOut)
                    .attr("stroke-dashoffset", 0);
            } else {
                console.warn("Invalid path length, skipping animation");
                // Just show the path without animation
                path.attr("stroke-dasharray", "none");
            }
        });
}

function setupScrollAnimation() {
    // Create intersection observer (modern approach)
    console.log("Setting up IntersectionObserver for volo graph animation");
    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !animationTriggered) {
                animationTriggered = true;
                console.log("Volo graph entered viewport, starting animation");
                if (svg) {
                    animatePathDrawing(svg);
                }

                observer.disconnect();
            }
        });
    }, { threshold: 0.3, rootMargin: '0px 0px -50px 0px' });

    observer.observe(container);
}

// Load once
async function loadData() {
    if (data) return;
    data = await d3.json("./data/volo_data/ocean_volume_data.json");
    const seaLevelRaw = await d3.text("./data/volo_data/global_mean_sea_level_anomalies.csv");

    timeSeriesDataGlobal = Object.entries(data).map(([date, value]) => ({
        date: new Date(date),
        value: parseFloat(value)
    })).sort((a, b) => a.date - b.date);

    seaLevelDataGlobal = parseSeaLevelData(seaLevelRaw).filter(d => d.date <= xScaleDomainEnd(data));
}

function computeDimensions() {
    const cw = Math.max(280, container.clientWidth || 900);
    width = cw - margin.left - margin.right;
    height = Math.max(300, Math.min(440, cw * 0.5)) - margin.top - margin.bottom;
}

function render() {
    if (!data) return;

    computeDimensions();

    // Tear down any previous SVG before rebuilding at the new size
    d3.select(container).selectAll('*').remove();

    svg = d3.select(container)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .style("max-width", "100%")
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    xScale = d3.scaleTime()
        .domain(d3.extent(timeSeriesDataGlobal, d => d.date))
        .range([0, width]);

    yScale = d3.scaleLinear()
        .domain(d3.extent(timeSeriesDataGlobal, d => d.value))
        .range([height, 0]);

    seaLevelYScale = d3.scaleLinear()
        .domain(d3.extent(seaLevelDataGlobal, d => d.value))
        .nice()
        .range([height, 0]);

    // Fewer ticks on narrow screens 
    const xTickCount = width < 420 ? 4 : (width < 640 ? 6 : 9);

    const xAxis = d3.axisBottom(xScale)
        .ticks(xTickCount)
        .tickFormat(d3.timeFormat("%Y-%m"));
    const yAxis = d3.axisLeft(yScale).ticks(6);
    const seaLevelYAxis = d3.axisRight(seaLevelYScale).ticks(6);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(xAxis)
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end");

    svg.append("g").call(yAxis);

    svg.append("g")
        .attr("transform", `translate(${width},0)`)
        .call(seaLevelYAxis)
        .selectAll("text")
        .style("fill", "#c0392b");

    // Axis labels
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + 46)
        .attr("text-anchor", "middle")
        .style("fill", "#9fb0bf")
        .text("Date");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -margin.left + 18)
        .attr("text-anchor", "middle")
        .style("fill", "#9fb0bf")
        .text("Ocean Volume");

    svg.append("text")
        .attr("transform", "rotate(90)")
        .attr("x", height / 2)
        .attr("y", -width - margin.right + 16)
        .attr("text-anchor", "middle")
        .style("fill", "#c0392b")
        .text("Sea Level Change (mm)");

    // Add paths (with visibility set to visible initially)
    svg.append("path")
        .datum(timeSeriesDataGlobal)
        .attr("class", "line")
        .attr("d", d3.line()
            .x(d => xScale(d.date))
            .y(d => yScale(d.value))
        )
        .style("fill", "none")
        .style("stroke", "#3498db")
        .style("stroke-width", 2)
        .style("opacity", 0); // Start hidden for animation

    svg.append("path")
        .datum(seaLevelDataGlobal)
        .attr("class", "sea-level-line")
        .attr("d", d3.line()
            .x(d => xScale(d.date))
            .y(d => seaLevelYScale(d.value))
        )
        .style("fill", "none")
        .style("stroke", "#c0392b")
        .style("stroke-width", 2.5)
        .style("opacity", 0); // Start hidden for animation

    addLegend();

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", -8)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .style("fill", "#e9eef4")
        .text("Ocean Volume Over Time");

    // Current-position marker 
    svg.append("line")
        .attr("class", "current-line")
        .attr("x1", 0).attr("y1", 0)
        .attr("x2", 0).attr("y2", height)
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");

    svg.append("circle")
        .attr("class", "current-point")
        .attr("r", 4)
        .attr("fill", "#ff6b6b");

    // Mouse overlay and hover markers
    const overlay = svg.append("rect")
        .attr("class", "overlay")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all")
        .style("cursor", "crosshair");

    svg.append("line")
        .attr("class", "hover-line")
        .style("pointer-events", "none")
        .attr("x1", 0).attr("x2", 0)
        .attr("y1", 0).attr("y2", height)
        .attr("stroke", "#89CFF0")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5")
        .style("opacity", 0);

    svg.append("circle")
        .attr("class", "hover-point")
        .attr("r", 5)
        .attr("fill", "#89CFF0")
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .style("opacity", 0);

    svg.append("circle")
        .attr("class", "sea-level-hover-point")
        .attr("r", 5)
        .attr("fill", "#c0392b")
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .style("opacity", 0)
        .style("pointer-events", "none");

    overlay.on('mousemove', handleMouseMove);
    overlay.on('mouseleave', () => {
        const tooltip = document.querySelector("#volo-tooltip");
        if (tooltip) tooltip.style.visibility = 'hidden';
        svg.select('.hover-line').style('opacity', 0);
        svg.select('.hover-point').style('opacity', 0);
        svg.select('.sea-level-hover-point').style('opacity', 0);
    });

    if (animationTriggered) {
        animatePathDrawing(svg);
    }

    // Place the current marker at the live slider position
    updateSliderLine();
}

function parseSeaLevelData(rawCsv) {
    const rows = d3.csvParseRows(rawCsv);
    const dataStartIndex = rows.findIndex(row => row[0] === "data") + 2;
    const dataEndIndex = rows.findIndex(row => row[0] === "end_data");

    return rows.slice(dataStartIndex, dataEndIndex)
        .map(row => ({
            date: new Date(`${row[0]}-01`),
            value: parseFloat(row[1])
        }))
        .filter(d => Number.isFinite(d.value) && d.value < 1e19);
}

function xScaleDomainEnd(volumeData) {
    return d3.max(Object.keys(volumeData), date => new Date(date));
}

function addLegend() {
    const legend = svg.append("g")
        .attr("class", "volo-legend")
        .attr("transform", "translate(10, 12)");

    legend.append("line")
        .attr("x1", 0).attr("x2", 24)
        .attr("y1", 0).attr("y2", 0)
        .attr("stroke", "#3498db")
        .attr("stroke-width", 2);

    legend.append("text")
        .attr("x", 32).attr("y", 4)
        .style("font-size", "12px").style("fill", "#9fb0bf")
        .text("Ocean volume");

    legend.append("line")
        .attr("x1", 150).attr("x2", 174)
        .attr("y1", 0).attr("y2", 0)
        .attr("stroke", "#c0392b")
        .attr("stroke-width", 2.5);

    legend.append("text")
        .attr("x", 182).attr("y", 4)
        .style("font-size", "12px").style("fill", "#9fb0bf")
        .text("CMIP6 sea level");
}

function handleMouseMove(event) {
    const [mouseX] = d3.pointer(event);
    const mouseDate = xScale.invert(mouseX);
    const mouseDateStr = d3.timeFormat("%Y-%m")(mouseDate);

    updateToolTip(event, mouseDateStr);
    updateHoverLine(mouseDateStr);
}

function updateHoverLine(mouseDateStr) {
    if (data[mouseDateStr] === undefined) return;

    const x = xScale(new Date(mouseDateStr));
    const y = yScale(data[mouseDateStr]);
    const seaLevelPoint = findSeaLevelPoint(mouseDateStr);

    svg.select('.hover-line')
        .transition().duration(10)
        .attr('x1', x).attr('x2', x)
        .style('opacity', 0.8);

    svg.select('.hover-point')
        .transition().duration(10)
        .attr('cx', x).attr('cy', y)
        .style('opacity', 1);

    if (seaLevelPoint) {
        svg.select('.sea-level-hover-point')
            .transition().duration(10)
            .attr('cx', xScale(seaLevelPoint.date))
            .attr('cy', seaLevelYScale(seaLevelPoint.value))
            .style('opacity', 1);
    }
}

function updateToolTip(event, mouseDateStr) {
    const tooltipX = event.pageX;
    const tooltipY = event.pageY;

    let tooltip = document.querySelector("#volo-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "volo-tooltip";
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';

    const date = d3.timeParse("%Y-%m")(mouseDateStr);
    const humanReadableDate = date ? d3.timeFormat("%B %Y")(date) : mouseDateStr;

    const scaleFactor = 1.3300564e18;
    const factorChange = data[mouseDateStr];
    const relativeChange = scaleFactor * (factorChange - 1);
    const seaLevelPoint = findSeaLevelPoint(mouseDateStr);
    const seaLevelText = seaLevelPoint
        ? `<br>CMIP6 sea level: ${seaLevelPoint.value.toFixed(2)} mm`
        : "";

    tooltip.innerHTML = `${humanReadableDate}: ${data[mouseDateStr]} (${relativeChange.toExponential(3)} m³)${seaLevelText}`;

    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
}

export async function updateSliderLine() {
    if (data === null || svg === null) return;

    const year = getCurrentYear();
    const month = getCurrentMonth();

    const monthStr = String(month).padStart(2, '0');
    const targetDateStr = `${year}-${monthStr}`;
    const targetDate = new Date(targetDateStr);

    const value = data[targetDateStr];
    if (value === undefined) return;

    const x = xScale(targetDate);
    const y = yScale(value);

    // Direct attribute set for snappier slider response
    svg.select('.current-line').attr('x1', x).attr('x2', x);
    svg.select('.current-point').attr('cx', x).attr('cy', y);
}

function findSeaLevelPoint(dateStr) {
    const year = new Date(dateStr).getFullYear();
    return seaLevelDataGlobal?.find(d => d.date.getFullYear() === year);
}
