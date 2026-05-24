// Global variables
let currentYear = 1850;
let currentData = null;
let width = 1200;
let height = 800;
let colorScale = null;

// Initialize all viz elements when the page loads
document.addEventListener('DOMContentLoaded', function () {
    initializeSeaIceCanvas();
    setupYearSlider();
    loadRememberedYear();

    setupEasterEgg();
});

function setupEasterEgg() {
    const body = document.querySelector('body');
    body.addEventListener('click', (event) => {
        if (event.target === document.body) {
            body.style.backgroundImage = "url('./assets/rick-roll-rick-ashley.gif')";
        }
    });
}

function initializeSeaIceCanvas() {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'iceCanvas';
    canvas.width = width;
    canvas.height = height;
    canvas.style.cursor = 'crosshair';
    canvas.style.border = '1px solid #ddd';
    canvas.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';

    const vizDiv = document.getElementById('visualization');
    if (vizDiv) {
        vizDiv.innerHTML = '';
        vizDiv.appendChild(canvas);
    }

    // Add hover event listener
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector(".tooltip");
        tooltip.style.visibility = 'hidden';
        console.log("hiding tooltip");

        const pointStatsDiv = document.getElementById('point-stats');
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

function setupYearSlider() {
    const slider = document.getElementById('yearSlider');
    const yearDisplay = document.getElementById('yearValue');

    // Update as you drag
    slider.addEventListener('input', (event) => {
        const year = parseInt(event.target.value);
        yearDisplay.textContent = year; // update year selection label
        loadYear(year); // update map
    });

    slider.setAttribute('list', 'decades');

    const datalist = document.createElement('datalist');
    datalist.id = 'decades';

    const years = [1850, 1860, 1870, 1880, 1890, 1900, 1910, 1920,
        1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000];

    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.label = year;
        datalist.appendChild(option);
    });

    document.body.appendChild(datalist);
}

async function loadYear(year) {
    // Show loading state
    const overallStatsDiv = document.getElementById('overall-stats');
    console.log(overallStatsDiv)
    if (overallStatsDiv) {
        overallStatsDiv.innerHTML = '📡 Loading sea ice data for ' + year + '...';
    }

    try {
        // Fetch the JSON file for this specific year
        const response = await fetch(`./data/sea_ice_${year}.json`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const yearData = await response.json();
        // Update global variable with currently used dataset
        currentData = yearData; 

        // Update the visualization
        updateVisualization(yearData);

        // Update statistics
        updateOverallStats(yearData);

    } catch (error) {
        console.error(`Error loading data for ${year}:`, error);
        if (overallStatsDiv) {
            overallStatsDiv.innerHTML = `❌ Error loading data for ${year}. Make sure sea_ice_${year}.json exists.`;
        }

        // Show error on canvas
        const canvas = document.getElementById('iceCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ff0000';
            ctx.font = '16px Arial';
            ctx.fillText(`Failed to load data for ${year}`, width / 2 - 150, height / 2);
        }
    }
}

// Slider will remember its year between refreshes, so load it in to make all other elements match!
function loadRememberedYear() {
    const slider = document.getElementById('yearSlider');
    const yearDisplay = document.getElementById('yearValue');
    const initialYear = parseInt(slider.value); // Get the slider's current value
    yearDisplay.textContent = initialYear; // Update display to match
    loadYear(initialYear); // Load data for that year
}

// Updates canvas with sea ice data
function updateVisualization(data) {
    const canvas = document.getElementById('iceCanvas');
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
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#2c3e50';
    ctx.fillText(`Sea Ice Thickness (${data.units || 'm'}) - ${data.year}`, 10, 30);

    ctx.font = '12px Arial';
    ctx.fillStyle = '#7f8c8d';
    ctx.fillText('7 thickness levels', 10, 55);

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
    ctx.fillStyle = '#666';
    ctx.font = '9px Arial';
    ctx.fillText('Thinner', miniBarX, miniBarY - 2);
    ctx.fillText('Thicker', miniBarX + miniBarWidth - 30, miniBarY - 2);
}

// Update stats for that year at the bottom of the page
function updateOverallStats(data) {
    const thicknessData = data.data;
    const overallStatsDiv = document.getElementById('overall-stats');
    console.log(overallStatsDiv)

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

        overallStatsDiv.innerHTML = `
            <strong>📊 Statistics for ${data.year}:</strong><br>
            Mean ice thickness: ${mean.toFixed(3)} ${data.units || 'm'} | 
            Max: ${max.toFixed(3)} ${data.units || 'm'} | 
            Min: ${min.toFixed(3)} ${data.units || 'm'}<br>
            Ice-covered area fraction: ${iceCoverage}% (${values.length.toLocaleString()} of ${totalCells.toLocaleString()} cells)
        `;
    } else {
        overallStatsDiv.innerHTML = `📊 No sea ice detected in ${data.year}`;
    }
}

function handleMouseMove(event) {
    if (!currentData) return;

    const canvas = document.getElementById('iceCanvas');
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
    const tooltipX = event.pageX - 16;
    const tooltipY = event.pageY - 16;

    // Create tooltip if one doesn't exist yet
    let tooltip = document.querySelector(".tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
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
    const pointStatsDiv = document.getElementById('point-stats');
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
    const colorbarDiv = document.getElementById('colorbar');
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