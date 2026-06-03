// Scroll-driven photoreal Arctic hero

const hero = document.getElementById('hero');
const stage = document.getElementById('hero-stage');
const content = document.getElementById('hero-content');
const image = document.getElementById('hero-image');
const canvas = document.getElementById('hero-rain');

if (hero && stage && content && canvas) {
    const ctx = canvas.getContext('2d');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Depth layers. `move` = pixels travelled per pixel scrolled (near falls fastest).
    const LAYERS = [
        { count: 90, minLen: 5, maxLen: 11, width: 0.8, color: '150,198,235', minA: 0.12, maxA: 0.30, move: 0.5 },
        { count: 80, minLen: 10, maxLen: 18, width: 1.1, color: '190,222,245', minA: 0.22, maxA: 0.45, move: 1.0 },
        { count: 55, minLen: 16, maxLen: 30, width: 1.7, color: '228,242,255', minA: 0.38, maxA: 0.70, move: 1.8 },
    ];

    let drops = [];
    let viewW = 0, viewH = 0;
    let pinDist = 1;
    let lastScrollY = window.scrollY;
    let lastFade = -1;
    let firstFrame = true;

    const rand = (a, b) => a + Math.random() * (b - a);

    function buildDrops() {
        drops = [];
        for (let li = 0; li < LAYERS.length; li++) {
            const L = LAYERS[li];
            for (let i = 0; i < L.count; i++) {
                drops.push({
                    layer: li,
                    x: Math.random() * viewW,
                    y: Math.random() * viewH,
                    len: rand(L.minLen, L.maxLen),
                    drift: rand(0.3, 1.0),
                    alpha: rand(L.minA, L.maxA),
                    vis: Math.random(),
                });
            }
        }
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        viewW = window.innerWidth;
        viewH = window.innerHeight;
        canvas.width = Math.round(viewW * dpr);
        canvas.height = Math.round(viewH * dpr);
        canvas.style.width = viewW + 'px';
        canvas.style.height = viewH + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Read layout once, here, not inside the frame loop
        pinDist = Math.max(1, hero.offsetHeight - viewH);
        buildDrops();
        lastFade = -1;
        firstFrame = true;
    }

    function scrollProgress() { return Math.min(1, Math.max(0, window.scrollY / pinDist)); }
    function smoothstep(e0, e1, x) {
        const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
    }

  
    function updateTitle(progress) {
        const fade = 1 - smoothstep(0.1, 0.6, progress);
        if (Math.abs(fade - lastFade) < 0.002) return;
        lastFade = fade;
        content.style.opacity = String(fade);
        content.style.transform = `translateY(${progress * -4}vh)`;
    }

    function drawRain(progress, dScroll) {
        ctx.clearRect(0, 0, viewW, viewH);
        if (prefersReducedMotion || progress >= 1) return;

        const visibility = smoothstep(0, 0.06, progress) * (1 - smoothstep(0.85, 1, progress));
        if (visibility <= 0.001) return;

        const density = 0.35 + 0.65 * progress;
        ctx.lineCap = 'round';

        for (let i = 0; i < drops.length; i++) {
            const d = drops[i];
            const L = LAYERS[d.layer];

            d.y += dScroll * L.move;
            d.x -= dScroll * L.move * 0.18;
            if (d.y > viewH) d.y -= (viewH + d.len);
            else if (d.y < -d.len) d.y += (viewH + d.len);
            if (d.x < -10) d.x = viewW + 10;
            else if (d.x > viewW + 10) d.x = -10;

            if (d.vis <= density) {
                ctx.strokeStyle = `rgba(${L.color},${d.alpha * visibility})`;
                ctx.lineWidth = L.width;
                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - d.drift * 2, d.y + d.len);
                ctx.stroke();
            }
        }
    }

    function frame() {
        const scrollY = window.scrollY;
        const dScroll = scrollY - lastScrollY;
        const moving = Math.abs(dScroll) > 0.4;

        // Only do work when scrolling (or once after load/resize)
        if (firstFrame || moving) {
            const progress = scrollProgress();
            updateTitle(progress);
            drawRain(progress, firstFrame ? 0 : dScroll);
        }

        lastScrollY = scrollY;
        firstFrame = false;
        requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    if (image && !image.complete) image.addEventListener('load', resize);
    resize();
    requestAnimationFrame(frame);
}
