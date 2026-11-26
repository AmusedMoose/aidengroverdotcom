// home.js: wires the page's elements to the physics engine (physics.js).
// Drag anything, throw it, tap a link to follow it. No scrolling, ever.
(function () {
    'use strict';

    var NAME = 'Aiden Grover';
    var FILL = 0.36; // fraction of the screen the objects may cover before we shrink them

    // Drag: how quickly a letter-sized object loses speed (per second). Every other object's drag
    // scales with its size relative to a letter, so bigger things coast to a stop sooner.
    // Bump this up to make everything settle faster, down to make it glide longer.
    var DRAG = 0.35;
    // Gentle starting drift: each object is given just enough speed to coast about this far (px).
    var DRIFT_MIN = 40, DRIFT_MAX = 90, DRIFT_SPEED_CAP = 70;

    var stage = document.getElementById('stage');
    var hint = document.getElementById('hint');
    if (!stage || !window.Physics) return;

    var P = window.Physics;
    var clamp = P.clamp;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.documentElement.classList.add('physics');

    // Portrait: if /assets/me.jpg is missing, drop the broken <img> and keep the "AG" placeholder.
    var portraitImg = stage.querySelector('.portrait img');
    if (portraitImg) {
        portraitImg.addEventListener('error', function () { portraitImg.remove(); });
        // The request may already have failed before this script ran.
        if (portraitImg.complete && portraitImg.naturalWidth === 0) portraitImg.remove();
    }

    // Deterministic-ish random so the starting scatter is stable between reloads of the same size.
    var seed = 20260;
    function rand() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }

    var world = P.createWorld({ width: 0, height: 0, rand: rand });
    var items = [];      // { el, body, kind, rot, tilt, word }
    var byEl = new Map();

    function addItem(el, kind, extra) {
        var shape = el.dataset.shape === 'circle' ? 'circle' : 'rect';
        var body = P.createBody({ shape: shape, r: 10, w: 10, h: 10, density: parseFloat(el.dataset.density) || 1 });
        world.add(body);
        var it = { el: el, body: body, kind: kind, rot: 0, tilt: 0, word: 0 };
        if (extra) for (var k in extra) it[k] = extra[k];
        items.push(it);
        byEl.set(el, it);
        return it;
    }

    // Letter tiles spelling the name
    var word = 0, li = 0;
    NAME.split('').forEach(function (ch) {
        if (ch === ' ') { word++; return; }
        var tile = document.createElement('span');
        tile.className = 'body tile';
        tile.dataset.c = String(li % 3);
        tile.dataset.density = '1';
        tile.setAttribute('aria-hidden', 'true');
        tile.textContent = ch;
        stage.appendChild(tile);
        addItem(tile, 'letter', { word: word, tilt: (rand() - 0.5) * 0.12 });
        li++;
    });

    stage.querySelectorAll('.body').forEach(function (el) {
        if (byEl.has(el)) return;
        var kind = el.classList.contains('portrait') ? 'portrait' : el.classList.contains('note') ? 'note' : 'pill';
        addItem(el, kind, { tilt: kind === 'note' ? -0.02 : kind === 'pill' ? (rand() - 0.5) * 0.06 : 0 });
    });

    // ---------- sizing ----------

    var W = 0, H = 0, u = 20;

    function syncSizes() {
        items.forEach(function (it) {
            var w = it.el.offsetWidth, h = it.el.offsetHeight;
            if (it.body.shape === 'circle') P.setSize(it.body, { r: Math.max(w, h) / 2 });
            else P.setSize(it.body, { w: w, h: h });
        });
        applyDrag();
    }

    // Drag proportional to size: sqrt(area) of each body, relative to a letter tile.
    function sizeOf(b) { return Math.sqrt(b.mass / b.density); }
    function applyDrag() {
        var ref = 0;
        for (var i = 0; i < items.length; i++) {
            if (items[i].kind === 'letter') { ref = sizeOf(items[i].body); break; }
        }
        if (!ref) return;
        items.forEach(function (it) { it.body.damping = DRAG * sizeOf(it.body) / ref; });
    }

    // Pick a unit size that scales with the screen, then shrink until everything comfortably fits.
    function fit() {
        W = stage.clientWidth;
        H = stage.clientHeight;
        world.resize(W, H);
        u = clamp(Math.min(W, H) * 0.046, 13, 30);
        for (var i = 0; i < 10; i++) {
            stage.style.setProperty('--u', u + 'px');
            var area = 0;
            for (var j = 0; j < items.length; j++) area += items[j].el.offsetWidth * items[j].el.offsetHeight;
            var ratio = area / (W * H);
            if (ratio <= FILL) break;
            u *= Math.sqrt(FILL / ratio) * 0.98;
        }
        syncSizes();
    }

    // ---------- initial arrangement: name spelled out up top, everything else scattered below ----------

    function arrange() {
        fit();
        var letters = items.filter(function (it) { return it.kind === 'letter'; });
        var gap = u * 0.2, spaceGap = u * 0.95;

        function rowWidth(list) {
            return list.reduce(function (s, it) { return s + it.el.offsetWidth; }, 0) + gap * Math.max(0, list.length - 1);
        }
        var w0 = letters.filter(function (l) { return l.word === 0; });
        var w1 = letters.filter(function (l) { return l.word === 1; });
        var rowH = letters[0].el.offsetHeight;
        var oneRow = rowWidth(w0) + spaceGap + rowWidth(w1) <= W * 0.94;

        function placeRow(list, cy, startX) {
            var x = startX;
            list.forEach(function (it) {
                it.body.x = x + it.el.offsetWidth / 2;
                it.body.y = cy;
                x += it.el.offsetWidth + gap;
            });
        }

        var top = Math.max(H * 0.1, 24), bottom;
        if (oneRow) {
            var total = rowWidth(w0) + spaceGap + rowWidth(w1);
            var x0 = (W - total) / 2;
            placeRow(w0, top + rowH / 2, x0);
            placeRow(w1, top + rowH / 2, x0 + rowWidth(w0) + spaceGap);
            bottom = top + rowH;
        } else {
            placeRow(w0, top + rowH / 2, (W - rowWidth(w0)) / 2);
            placeRow(w1, top + rowH * 1.5 + gap, (W - rowWidth(w1)) / 2);
            bottom = top + rowH * 2 + gap;
        }

        // Scatter the rest into the free space under the name (largest first), avoiding overlaps.
        var rest = items.filter(function (it) { return it.kind !== 'letter'; })
            .sort(function (a, b) { return b.el.offsetWidth * b.el.offsetHeight - a.el.offsetWidth * a.el.offsetHeight; });
        var placed = letters.map(function (it) { return it.body; });
        var margin = 10;

        rest.forEach(function (it) {
            var b = it.body, ok = false;
            for (var t = 0; t < 400 && !ok; t++) {
                var x = b.hw + margin + rand() * Math.max(1, W - 2 * (b.hw + margin));
                var y = bottom + margin + b.hh + rand() * Math.max(1, H - bottom - 2 * margin - 28 - 2 * b.hh);
                ok = placed.every(function (o) {
                    return Math.abs(x - o.x) > b.hw + o.hw + margin || Math.abs(y - o.y) > b.hh + o.hh + margin;
                });
                if (ok) { b.x = x; b.y = y; }
            }
            if (!ok) { b.x = rand() * W; b.y = bottom + rand() * (H - bottom); }
            placed.push(b);
        });

        world.relax(80);
        items.forEach(function (it) { it.body.vx = 0; it.body.vy = 0; });
    }

    // ---------- launch: a small random nudge so things start drifting, then drag slows them to a stop ----------

    var launched = false;
    function launch() {
        if (launched) return;
        launched = true;
        if (reduceMotion) return; // stay put unless the person drags things
        items.forEach(function (it) {
            // Math.random (not the seeded rand) so launch directions and speeds differ on every load,
            // while the starting layout above stays the same.
            var a = Math.random() * Math.PI * 2;
            // Speed chosen so every object coasts a similar short distance despite different drag.
            var s = Math.min(DRIFT_SPEED_CAP, it.body.damping * (DRIFT_MIN + Math.random() * (DRIFT_MAX - DRIFT_MIN)));
            it.body.vx = Math.cos(a) * s;
            it.body.vy = Math.sin(a) * s;
        });
    }

    // ---------- rendering ----------

    function render(it, dt) {
        var b = it.body;
        var target = clamp(b.vx / 1800, -0.2, 0.2) + it.tilt;
        it.rot += (target - it.rot) * Math.min(1, dt * 6);
        it.el.style.transform = 'translate3d(' + (b.x - b.hw).toFixed(2) + 'px,' + (b.y - b.hh).toFixed(2) +
            'px,0) rotate(' + it.rot.toFixed(4) + 'rad)';
    }

    var drag = null;
    var raf = 0, last = 0;

    function frame(now) {
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (drag) {
            var b = drag.item.body;
            b.vx = clamp((drag.tx - b.x) * 22, -3000, 3000);
            b.vy = clamp((drag.ty - b.y) * 22, -3000, 3000);
        }
        world.step(dt);
        for (var i = 0; i < items.length; i++) render(items[i], dt);
        raf = requestAnimationFrame(frame);
    }

    function start() {
        if (raf) return;
        last = performance.now();
        raf = requestAnimationFrame(frame);
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; }

    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });

    // ---------- dragging ----------

    var suppressClick = false;

    function stagePoint(e) {
        var r = stage.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    stage.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (drag) return; // one finger at a time
        var el = e.target.closest ? e.target.closest('.body') : null;
        var it = el && byEl.get(el);
        if (!it) return;

        launch();
        var p = stagePoint(e);
        it.body.held = true;
        drag = {
            item: it, id: e.pointerId,
            offX: p.x - it.body.x, offY: p.y - it.body.y,
            tx: it.body.x, ty: it.body.y,
            sx: e.clientX, sy: e.clientY, moved: false,
            samples: [{ t: performance.now(), x: p.x, y: p.y }]
        };
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    });

    stage.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var p = stagePoint(e);
        drag.tx = p.x - drag.offX;
        drag.ty = p.y - drag.offY;
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
            drag.moved = true;
            if (hint) hint.classList.add('hide');
        }
        var now = performance.now();
        drag.samples.push({ t: now, x: p.x, y: p.y });
        while (drag.samples.length > 2 && now - drag.samples[0].t > 110) drag.samples.shift();
    });

    function release(e, cancelled) {
        if (!drag || e.pointerId !== drag.id) return;
        var b = drag.item.body, s = drag.samples;
        b.held = false;
        b.vx = 0; b.vy = 0;
        if (drag.moved && !cancelled && s.length > 1) {
            var a = s[0], z = s[s.length - 1];
            var span = Math.max((z.t - a.t) / 1000, 0.016);
            // Only throw if the pointer was still moving right at release.
            if (performance.now() - z.t < 80) {
                b.vx = clamp((z.x - a.x) / span, -1400, 1400);
                b.vy = clamp((z.y - a.y) / span, -1400, 1400);
            }
        }
        suppressClick = drag.moved;
        drag = null;
        setTimeout(function () { suppressClick = false; }, 60);
    }

    stage.addEventListener('pointerup', function (e) { release(e, false); });
    stage.addEventListener('pointercancel', function (e) { release(e, true); });

    // A drag that happens to start on a link must not follow the link.
    stage.addEventListener('click', function (e) {
        if (suppressClick) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // ---------- resize / rotate ----------

    var resizeTimer = 0;
    function onResize() {
        var ow = W, oh = H;
        fit();
        if (ow > 0 && oh > 0) {
            items.forEach(function (it) {
                it.body.x = it.body.x * (W / ow);
                it.body.y = it.body.y * (H / oh);
            });
        }
        world.relax(40);
    }
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(onResize, 100);
    });

    // ---------- go ----------

    function boot() {
        arrange();
        items.forEach(function (it) { render(it, 1); });
        start();
        launch();
        // The hint also fades on its own, so it never sits under a floating object for long.
        setTimeout(function () { if (hint) hint.classList.add('hide'); }, 9000);
        // Expose a tiny handle for debugging in the console.
        window.__home = { world: world, items: items, launch: launch };
    }

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot);
    else boot();
})();

const glow = document.getElementById('cursor-glow');
if (glow) {
    window.addEventListener('mousemove', (e) => {
        glow.style.left = `${e.clientX}px`;
        glow.style.top = `${e.clientY}px`;
        if (glow.style.opacity !== '1') {
            glow.style.opacity = '1';
        }
    });

    document.addEventListener('mouseleave', () => {
        glow.style.opacity = '0';
    });
}