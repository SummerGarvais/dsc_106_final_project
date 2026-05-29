import { loadNewIceData } from './ice_logic.js';
import { loadNewMeltData } from './melt_logic.js';
import { updateLine } from './volo_logic.js';

document.addEventListener('DOMContentLoaded', function () {
    setupYearSlider();
    setupMonthSlider();
    setupTooltips();

    setupPlayPauseButton();
    setupLoopButton();

    loadRememberedYear(); // Load the remembered year and month to initialize the display and data
});

function setupYearSlider() {
    console.log('Setting up year slider'); // Debugging log
    const slider = document.getElementById('year-slider');
    const yearDisplay = document.getElementById('year-value');

    // Update as you drag
    slider.addEventListener('input', updateGraphs);

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

function setupMonthSlider() {
    const slider = document.getElementById('month-slider');
    const monthDisplay = document.getElementById('month-value');

    // Update as you drag
    slider.addEventListener('input', updateGraphs);

    slider.setAttribute('list', 'months');

    const datalist = document.createElement('datalist');
    datalist.id = 'months';

    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    months.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.label = month;
        datalist.appendChild(option);
    });

    document.body.appendChild(datalist);
}

function updateGraphs() {
    const year = getCurrentYear();
    const monthName = getCurrentMonth(name = true);

    // Update the display values
    const yearDisplay = document.getElementById('year-value');
    yearDisplay.textContent = year;

    const monthDisplay = document.getElementById('month-value');
    monthDisplay.textContent = monthName;

    // Load new data for the selected year and month
    loadNewIceData();
    loadNewMeltData();
}

export function getCurrentYear() {
    const yearSlider = document.getElementById('year-slider');
    return parseInt(yearSlider.value);
}

export function getCurrentMonth(name = false) {
    const monthsDict = {
        1: 'January',
        2: 'February',
        3: 'March',
        4: 'April',
        5: 'May',
        6: 'June',
        7: 'July',
        8: 'August',
        9: 'September',
        10: 'October',
        11: 'November',
        12: 'December'
    };

    const monthSlider = document.getElementById('month-slider');
    if (name) {
        return monthsDict[parseInt(monthSlider.value)];
    }
    return parseInt(monthSlider.value);
}

function setupTooltips() {
    let iceTooltip = document.getElementById('ice-tooltip');
    let meltTooltip = document.getElementById('melt-tooltip');

    if (!iceTooltip) {
        iceTooltip = document.createElement('div');
        iceTooltip.classList.add("tooltip");
        iceTooltip.id = "ice-tooltip";
        // Put at the front so that its coordinates are relative to the screen rather than whatever container it's in
        document.body.prepend(iceTooltip);
    }
    if (!meltTooltip) {
        meltTooltip = document.createElement('div');
        meltTooltip.classList.add("tooltip");
        meltTooltip.id = "melt-tooltip";
        // Put at the front so that its coordinates are relative to the screen rather than whatever container it's in
        document.body.prepend(meltTooltip);
    }
}

// Slider will remember its year between refreshes, so load it in to make all other elements match!
function loadRememberedYear() {
    const yearDisplay = document.getElementById('year-value');
    const initialYear = getCurrentYear(); // Get the slider's current value
    yearDisplay.textContent = initialYear; // Update display to match

    const monthDisplay = document.getElementById('month-value');
    const initialMonthName = getCurrentMonth(name = true); // Get the slider's current value
    monthDisplay.textContent = initialMonthName; // Update display to match

    updateGraphs();
}

let isPlaying = false;
let isLooping = false;
function setupPlayPauseButton() {
    const playPauseBtn = document.getElementById('play-pause-btn');

    // Animation state
    let animationInterval = null;
    let animationSpeed = 1000; // milliseconds between months (adjust as needed)

    // Function to advance to next month
    function playThroughMonths() {
        let currentMonth = getCurrentMonth();
        let nextMonth = currentMonth + 1;

        if (nextMonth > 12) {
            nextMonth = 1;

            if (!isLooping) {
                const currentYear = getCurrentYear();
                const nextDecade = Math.min(2000, currentYear + 10);
                const yearSlider = document.getElementById('year-slider');
                yearSlider.value = nextDecade;
            }
        }

        const monthSlider = document.getElementById('month-slider');
        monthSlider.value = nextMonth; // This will trigger the 'input' event and call updateGraphs()
        updateGraphs();
    }

    // Animation control functions
    function startAnimation() {
        if (animationInterval) clearInterval(animationInterval);
        isPlaying = true;
        animationInterval = setInterval(playThroughMonths, animationSpeed);
        playPauseBtn.textContent = '⏸ Pause';
        playPauseBtn.classList.add('active');
    }

    function pauseAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
        isPlaying = false;
        playPauseBtn.textContent = '▶ Play';
        playPauseBtn.classList.remove('active');
    }

    function togglePlayPause() {
        if (isPlaying) {
            pauseAnimation();
        } else {
            startAnimation();
        }
    }

    // Event listener
    playPauseBtn.addEventListener('click', togglePlayPause);

    // Stop animation if user manually changes year or month
    const yearSlider = document.getElementById('year-slider');
    yearSlider.addEventListener('click', function () {
        if (isPlaying) {
            pauseAnimation();
        }
    })

    const monthSlider = document.getElementById('month-slider');
    monthSlider.addEventListener('click', function () {
        if (isPlaying) {
            pauseAnimation();
        }
    })
};

function setupLoopButton() {
    const loopBtn = document.getElementById('loop-btn');

    function toggleLoop() {
        if (isLooping) {
            isLooping = false;
            loopBtn.classList.remove('active');
        } else {
            isLooping = true;
            loopBtn.classList.add('active');
        }
    }

    loopBtn.addEventListener('click', toggleLoop);
}