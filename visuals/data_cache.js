// Keeping every loaded frame in memory lets the play animation advance without
// waiting on a network 

export const dataCache = new Map();

const URL_BUILDERS = {
    ice: (year, mm) => `./data/ice_data/sea_ice_${year}_${mm}.json`,
    melt: (year, mm) => `./data/melt_data/ice_melt_${year}_${mm}.json`,
    prec: (year, mm) => `./data/prec_data/prec_${year}_${mm}.json`,
    precAnnual: (year) => `./data/prec_annual_data/prec_annual_${year}.json`,
    hum: (year, mm) => `./data/hum_data/hum_${year}_${mm}.json`,
};

export function cacheKey(type, year, month) {
    return `${type}_${year}_${String(month).padStart(2, '0')}`;
}

export function urlFor(type, year, month) {
    const mm = String(month).padStart(2, '0');
    const builder = URL_BUILDERS[type];
    return builder ? builder(year, mm) : null;
}

export function getCached(type, year, month) {
    return dataCache.get(cacheKey(type, year, month)) ?? null;
}

// Interpolation between two visualizations. Used by the continuous play animation to run smoothly between monthly frames
export function lerpGrid(A, B, f) {
    const ny = A.length;
    const nx = A[0].length;
    const out = new Array(ny);
    for (let j = 0; j < ny; j++) {
        const ar = A[j];
        const br = B[j];
        const row = new Array(nx);
        for (let i = 0; i < nx; i++) {
            const a = ar[i];
            const b = br[i];
            const aBad = a === null || Number.isNaN(a);
            const bBad = b === null || Number.isNaN(b);
            if (aBad && bBad) row[i] = null;
            else if (aBad) row[i] = b;
            else if (bBad) row[i] = a;
            else row[i] = a + (b - a) * f;
        }
        out[j] = row;
    }
    return out;
}

export function setCached(type, year, month, data) {
    dataCache.set(cacheKey(type, year, month), data);
}

// Fetch that populates the cache
const inFlight = new Set();

export async function prefetch(type, year, month) {
    const key = cacheKey(type, year, month);
    if (dataCache.has(key) || inFlight.has(key)) return;

    const url = urlFor(type, year, month);
    if (!url) return;

    inFlight.add(key);
    try {
        const res = await fetch(url);
        if (res.ok) {
            dataCache.set(key, await res.json());
        }
    } catch {
    } finally {
        inFlight.delete(key);
    }
}
