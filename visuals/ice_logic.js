import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';

// Global variables
let currentData = null;
let colorScale = null;

const seaIceContainer = document.getElementById('sea-ice-container');
let width = seaIceContainer.clientWidth;
let height = seaIceContainer.clientHeight;
console.log(`Sea ice container dimensions: ${width}x${height}`); // Debugging log

// Initialize all viz elements when the page loads
document.addEventListener('DOMContentLoaded', function () {
    initializeSeaIceCanvas();

    new ResizeObserver(() => {
        const newW = seaIceContainer.clientWidth;
        const newH = seaIceContainer.clientHeight;
        if (newW === width && newH === height) return;
        width = newW;
        height = newH;
        const canvas = document.getElementById('ice-canvas');
        if (canvas) {
            canvas.width = width;
            canvas.height = height;
            if (currentData) updateVisualization(currentData);
        }
    }).observe(seaIceContainer);
});

function initializeSeaIceCanvas() {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'ice-canvas';
    canvas.width = width;
    canvas.height = height;
    canvas.style.cursor = 'crosshair';
    canvas.style.border = '1px solid #ddd';
    canvas.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';

    const vizDiv = document.getElementById('sea-ice-container');
    if (vizDiv) {
        vizDiv.innerHTML = '';
        vizDiv.appendChild(canvas);
    }

    // Add hover event listener
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector("#ice-tooltip");
        tooltip.style.visibility = 'hidden';
        console.log("hiding tooltip");

        const pointStatsDiv = document.getElementById('ice-point-stats');
        if (pointStatsDiv) {
            pointStatsDiv.innerHTML = `
                📍 <strong>Location:</strong> No Data | 
                <strong>Ice Thickness:</strong> N/A <br>
                <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
            `;
        }
    });

    // Create color scale
    colorScale = d3.scaleSequentialLog()
        .domain([0.01, 5])
        .interpolator(d3.interpolateBlues);

    // Create colorbar
    createColorbar();
}

export async function loadNewIceData() {
    const currentYear = getCurrentYear();
    const currentMonth = getCurrentMonth();

    try {
        // Fetch the JSON file for this specific year
        const response = await fetch(`./data/ice_data/sea_ice_${currentYear}_${currentMonth.toString().padStart(2, '0')}.json`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const newData = await response.json();
        // Update global variable with currently used dataset
        currentData = newData;

        // Update the visualization
        updateVisualization(newData);

        // Update statistics
        updateOverallStats(newData);

    } catch (error) {
        console.error(`Error loading data for ${currentYear}:`, error);
        if (overallStatsDiv) {
            overallStatsDiv.innerHTML = `❌ Error loading data for ${currentYear}, ${currentMonth}. Make sure sea_ice_${currentYear}_${currentMonth.toString().padStart(2, '0')}.json exists.`;
        }

        // Show error on canvas
        const canvas = document.getElementById('ice-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ff0000';
            ctx.font = '16px Arial';
            ctx.fillText(`Failed to load data for ${currentYear}, ${currentMonth}`, width / 2 - 150, height / 2);
        }
    }
}

// Updates canvas with sea ice data
function updateVisualization(data) {
    const canvas = document.getElementById('ice-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const thicknessData = data.data;

    if (!thicknessData || thicknessData.length === 0) {
        console.error('No data available');
        return;
    }

    const nx = thicknessData[0].length;
    const ny = thicknessData.length;
    const cellWidth = width / nx;
    const cellHeight = height / ny;

    // Clear canvas
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    const minThick = Math.min(thicknessData);
    const maxThick = Math.max(thicknessData);
    // Draw each grid cell
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
            let flipped_x = nx - i - 1;
            let flipped_y = ny - j - 1;
            const value = thicknessData[flipped_y][flipped_x];

            if (value !== null && !isNaN(value) && value > 0) {
                // 7 discrete color levels
                let color;
                if (value <= 0.1) {
                    color = '#f0f8ff';  // Level 1: Very thin ice
                } else if (value <= 0.5) {
                    color = '#c6dbef';  // Level 2: Thin ice
                } else if (value <= 1.0) {
                    color = '#9ecae1';  // Level 3: Moderate ice
                } else if (value <= 1.5) {
                    color = '#6baed6';  // Level 4: Medium ice
                } else if (value <= 2.0) {
                    color = '#4292c6';  // Level 5: Thick ice
                } else if (value <= 3.0) {
                    color = '#2171b5';  // Level 6: Very thick ice
                } else {
                    color = '#084594';  // Level 7: Extremely thick ice
                }

                ctx.fillStyle = color;
                ctx.fillRect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);

                // Subtle grid lines
                ctx.strokeStyle = 'rgba(200,200,200,0.2)';
                ctx.strokeRect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
            } else {
                // Land or no ice
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
            }
        }
    }

    // Add title and annotations
    const currentYear = getCurrentYear();
    const currentMonthName = getCurrentMonth(name = true);

    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(26,26,24,0.75)';

    // Set text alignment to center
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; // Centers vertically
    ctx.fillText(`Sea Ice Thickness · ${currentMonthName} ${currentYear}`, width / 2, 20);

    // Draw mini color bar at bottom right
    const miniBarWidth = 140;
    const miniBarHeight = 12;
    const miniBarX = width - miniBarWidth - 10;
    const miniBarY = height - 25;

    // Define the color segments for mini bar
    const segments = [
        { color: '#f0f8ff', width: miniBarWidth / 7 },  // 0-0.1m
        { color: '#c6dbef', width: miniBarWidth / 7 },  // 0.1-0.5m
        { color: '#9ecae1', width: miniBarWidth / 7 },  // 0.5-1.0m
        { color: '#6baed6', width: miniBarWidth / 7 },  // 1.0-1.5m
        { color: '#4292c6', width: miniBarWidth / 7 },  // 1.5-2.0m
        { color: '#2171b5', width: miniBarWidth / 7 },  // 2.0-3.0m
        { color: '#084594', width: miniBarWidth / 7 }   // 3.0+m
    ];

    for (let i = 0; i < segments.length; i++) {
        ctx.fillStyle = segments[i].color;
        ctx.fillRect(miniBarX + (i * segments[i].width), miniBarY, segments[i].width, miniBarHeight);
    }

    // Border around mini color bar
    ctx.strokeStyle = '#999';
    ctx.strokeRect(miniBarX, miniBarY, miniBarWidth, miniBarHeight);

    // Labels for mini color bar
    ctx.fillStyle = 'rgba(26,26,24,0.55)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('Thinner', miniBarX + 18, miniBarY - 5);
    ctx.fillText('Thicker', miniBarX + miniBarWidth - 18, miniBarY - 5);
}

// Update stats for that year at the bottom of the page
function updateOverallStats(data) {
    const thicknessData = data.data;
    const overallStatsDiv = document.getElementById('ice-overall-stats');

    if (!overallStatsDiv || !thicknessData) return;

    // Flatten the array and filter valid values
    const values = [];
    for (let i = 0; i < thicknessData.length; i++) {
        for (let j = 0; j < thicknessData[i].length; j++) {
            const val = thicknessData[i][j];
            if (val !== null && !isNaN(val) && val > 0) {
                values.push(val);
            }
        }
    }

    if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);

        // Calculate ice coverage percentage
        const totalCells = thicknessData.length * thicknessData[0].length;
        const iceCoverage = (values.length / totalCells * 100).toFixed(1);

        const currentMonthName = getCurrentMonth(name = true);
        const currentYear = getCurrentYear();
        overallStatsDiv.innerHTML = `
            <strong>Statistics for ${currentMonthName} ${currentYear}:</strong><br>
            Mean ice thickness: ${mean.toFixed(3)} ${data.units || 'm'} —
            Max: ${max.toFixed(3)} ${data.units || 'm'} —
            Ice-covered area fraction: ${iceCoverage}%
        `;
    } else {
        overallStatsDiv.innerHTML = `📊 No sea ice detected in ${data.year}`;
    }
}

function handleMouseMove(event) {
    if (!currentData) return;

    const canvas = document.getElementById('ice-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const thicknessData = currentData.data;
    if (!thicknessData) return;

    const nx = thicknessData[0].length;
    const ny = thicknessData.length;

    const i = Math.floor(mouseX / width * nx);
    const j = Math.floor(mouseY / height * ny);

    if (i >= 0 && i < nx && j >= 0 && j < ny) {
        let flipped_x = nx - i - 1;
        let flipped_y = ny - j - 1;
        const iceDepth = thicknessData[flipped_y][flipped_x];

        updateToolTip(event, iceDepth);
        updatePointStats(i, j, iceDepth);
    }
}

function updateToolTip(event, iceDepth) {
    // Create a tooltip-like display right under the cursor
    const tooltipX = event.pageX;
    const tooltipY = event.pageY;

    // Create tooltip if one doesn't exist yet
    let tooltip = document.querySelector("#ice-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "ice-tooltip";
        // Put at the front so that its coordinates are relative to the screen rather than whatever container it's in
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';
    console.log("showing tooltip");

    if (iceDepth !== null && !isNaN(iceDepth) && iceDepth > 0) {
        tooltip.innerHTML = `❄️ Sea Ice: ${iceDepth.toFixed(3)} ${currentData.units || 'm'}`;
    } else {
        tooltip.innerHTML = `🌊 No Sea Ice / Land`;
    }

    // Put tooltip under cursor while on canvas
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
}

function updatePointStats(i, j, iceDepth) {
    // Update point stats at bottom of the document with data of cell being hovered over
    const pointStatsDiv = document.getElementById('ice-point-stats');
    if (!pointStatsDiv) return;

    if (iceDepth !== null && !isNaN(iceDepth) && iceDepth > 0) {
        pointStatsDiv.innerHTML = `
            📍 <strong>Location:</strong> (${i}, ${j}) | 
            <strong>Ice Thickness:</strong> ${iceDepth.toFixed(3)} ${currentData.units || 'm'}<br>
            <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
        `;
    } else {
        pointStatsDiv.innerHTML = `
            📍 <strong>Location:</strong> (${i}, ${j}) | 
            <strong>Ice Thickness:</strong> 0.000 m <br>
            <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
        `;
    }
}

function createColorbar() {
    const colorbarDiv = document.getElementById('ice-colorbar');
    if (!colorbarDiv) return;

    colorbarDiv.innerHTML = '';

    const svg = d3.select("#colorbar")
        .append("svg")
        .attr("width", 400)
        .attr("height", 70)
        .style("display", "block")
        .style("margin", "0 auto");

    // Create gradient
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "iceGradient")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "0%");

    // Add color stops
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#f0f8ff");
    gradient.append("stop").attr("offset", "20%").attr("stop-color", "#c6dbef");
    gradient.append("stop").attr("offset", "40%").attr("stop-color", "#9ecae1");
    gradient.append("stop").attr("offset", "60%").attr("stop-color", "#6baed6");
    gradient.append("stop").attr("offset", "80%").attr("stop-color", "#2171b5");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#084594");

    // Draw colorbar rectangle
    svg.append("rect")
        .attr("width", 300)
        .attr("height", 20)
        .attr("x", 50)
        .attr("y", 10)
        .style("fill", "url(#iceGradient)")
        .style("stroke", "#ddd")
        .style("stroke-width", "1px");

    // Add labels
    svg.append("text")
        .attr("x", 50)
        .attr("y", 45)
        .text("0 m")
        .style("font-size", "12px")
        .style("text-anchor", "middle");

    svg.append("text")
        .attr("x", 200)
        .attr("y", 45)
        .text("1 m")
        .style("font-size", "12px")
        .style("text-anchor", "middle");

    svg.append("text")
        .attr("x", 350)
        .attr("y", 45)
        .text("3+ m")
        .style("font-size", "12px")
        .style("text-anchor", "middle");

    svg.append("text")
        .attr("x", 200)
        .attr("y", 65)
        .text("Sea Ice Thickness →")
        .style("font-size", "11px")
        .style("text-anchor", "middle")
        .style("fill", "#666");
}