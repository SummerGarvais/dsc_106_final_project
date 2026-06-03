const section = document.getElementById('prec-section');
const canvas = document.getElementById('rain-canvas');

// Skip entirely on small screens
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmallScreen = () => window.innerWidth < 700;

if (section && canvas && !prefersReducedMotion) {
    const ctx = canvas.getContext('2d');

    let drops = [];
    let secW = 0;
    let secH = 0;
    let enabled = true;

    function buildDrops() {
        const area = secW * secH;
        const count = Math.min(420, Math.max(140, Math.round(area / 6500)));
        drops = Array.from({ length: count }, () => makeDrop(true));
    }

    function makeDrop(anywhere) {
        return {
            x: Math.random() * secW,
            y: anywhere ? Math.random() * secH : -20,
            len: 8 + Math.random() * 16,
            speed: 6 + Math.random() * 9,
            sway: 0.6 + Math.random() * 0.8,
            alpha: 0.25 + Math.random() * 0.55,
        };
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        secW = section.clientWidth;
        secH = section.offsetHeight;

        if (isSmallScreen()) {
            enabled = false;
            canvas.style.display = 'none';
            return;
        }
        enabled = true;
        canvas.style.display = 'block';

        canvas.width = Math.round(secW * dpr);
        canvas.height = Math.round(secH * dpr);
        canvas.style.width = secW + 'px';
        canvas.style.height = secH + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        buildDrops();
    }

    // 0 as the section enters from the bottom, 1 as it exits the top.
    function scrollProgress() {
        const rect = section.getBoundingClientRect();
        const vh = window.innerHeight;
        const p = (vh - rect.top) / (vh + rect.height);
        return Math.min(1, Math.max(0, p));
    }

    function frame() {
        if (!enabled) {
            requestAnimationFrame(frame);
            return;
        }

        const progress = scrollProgress();

        // Intensity ramps from a light drizzle to steady downpour
        const intensity = 0.2 + 0.8 * progress;
        const visible = Math.round(drops.length * intensity);
        const speedScale = 0.6 + 0.9 * progress;
        const globalAlpha = Math.min(0.35, 0.12 + 0.28 * progress);

        ctx.clearRect(0, 0, secW, secH);
        ctx.lineWidth = 1.1;
        ctx.lineCap = 'round';

        for (let i = 0; i < visible; i++) {
            const d = drops[i];
            ctx.strokeStyle = `rgba(180, 210, 255, ${d.alpha * globalAlpha})`;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - d.sway * 2, d.y + d.len);
            ctx.stroke();

            d.y += d.speed * speedScale;
            d.x -= d.sway * speedScale;

            if (d.y > secH) {
                d.y = -d.len;
                d.x = Math.random() * (secW + 40);
            }
        }

        requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();
    window.addEventListener('load', resize);
    requestAnimationFrame(frame);
}
