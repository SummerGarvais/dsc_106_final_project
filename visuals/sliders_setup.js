import { loadNewIceData } from './ice_logic.js';
import { loadNewMeltData } from './melt_logic.js';

document.addEventListener('DOMContentLoaded', function () {
    setupYearSlider();
    setupMonthSlider();
});

function setupYearSlider() {
    console.log('Setting up year slider'); // Debugging log
    const slider = document.getElementById('year-slider');
    const yearDisplay = document.getElementById('year-value');

    // Update as you drag
    slider.addEventListener('input', (event) => {
        const yearDisplay = document.getElementById('year-value');
        const currentYear = parseInt(event.target.value); // Get the year slider's current value
        yearDisplay.textContent = currentYear; // update year selection label
        console.log(`Year slider value: ${currentYear}`); // Debugging log
        loadNewIceData(); // update ice map
        loadNewMeltData(); // update melt map
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

function setupMonthSlider() {
    const slider = document.getElementById('month-slider');
    const monthDisplay = document.getElementById('month-value');

    // Update as you drag
    slider.addEventListener('input', (event) => {
        const monthDisplay = document.getElementById('month-value');
        const currentMonth = parseInt(event.target.value); // Get the month slider's current value
        monthDisplay.textContent = currentMonth; // update month selection label
        console.log(`Month slider value: ${currentMonth}`); // Debugging log
        loadNewIceData(); // update ice map
        loadNewMeltData(); // update melt map
    });

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