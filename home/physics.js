// physics.js: a tiny 2D "floating objects" engine for the /home page.
// Axis-aligned boxes and circles, zero gravity, bouncy walls, and kinematic
// "held" bodies so a dragged object shoves the others around.
// Works in the browser (window.Physics) and in Node (require) for testing.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Physics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var SUBSTEP = 1 / 120;

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    function setSize(b, o) {
        if (b.shape === 'circle') {
            b.r = o.r;
            b.hw = b.hh = o.r;
            b.mass = Math.PI * o.r * o.r * b.density;
        } else {
            b.hw = o.w / 2;
            b.hh = o.h / 2;
            b.mass = o.w * o.h * b.density;
        }
        b.invMass = 1 / Math.max(b.mass, 1e-6);
    }

    function createBody(o) {
        var b = {
            shape: o.shape === 'circle' ? 'circle' : 'rect',
            x: o.x || 0, y: o.y || 0, vx: 0, vy: 0,
            held: false,
            density: o.density || 1,
            data: o.data || null,
            hw: 0, hh: 0, r: 0, mass: 1, invMass: 1
        };
        setSize(b, o);
        return b;
    }

    // Overlap tests. Each returns {nx, ny, pen} with the normal pointing a -> b.
    function circleRect(c, r) { // normal points from the rect to the circle
        var cx = clamp(c.x, r.x - r.hw, r.x + r.hw);
        var cy = clamp(c.y, r.y - r.hh, r.y + r.hh);
        var dx = c.x - cx, dy = c.y - cy;
        var d2 = dx * dx + dy * dy;
        if (d2 > c.r * c.r) return null;
        if (d2 > 1e-9) {
            var d = Math.sqrt(d2);
            return { nx: dx / d, ny: dy / d, pen: c.r - d };
        }
        // Circle centre is inside the rect: leave through the nearest side.
        var l = c.x - (r.x - r.hw), rt = (r.x + r.hw) - c.x;
        var t = c.y - (r.y - r.hh), bt = (r.y + r.hh) - c.y;
        var m = Math.min(l, rt, t, bt);
        if (m === l) return { nx: -1, ny: 0, pen: c.r + l };
        if (m === rt) return { nx: 1, ny: 0, pen: c.r + rt };
        if (m === t) return { nx: 0, ny: -1, pen: c.r + t };
        return { nx: 0, ny: 1, pen: c.r + bt };
    }

    function contact(a, b) {
        var dx, dy;
        if (a.shape === 'rect' && b.shape === 'rect') {
            dx = b.x - a.x; dy = b.y - a.y;
            var ox = a.hw + b.hw - Math.abs(dx);
            var oy = a.hh + b.hh - Math.abs(dy);
            if (ox <= 0 || oy <= 0) return null;
            if (ox < oy) return { nx: dx < 0 ? -1 : 1, ny: 0, pen: ox };
            return { nx: 0, ny: dy < 0 ? -1 : 1, pen: oy };
        }
        if (a.shape === 'circle' && b.shape === 'circle') {
            dx = b.x - a.x; dy = b.y - a.y;
            var rr = a.r + b.r;
            var d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr) return null;
            var d = Math.sqrt(d2);
            if (d < 1e-6) return { nx: 1, ny: 0, pen: rr };
            return { nx: dx / d, ny: dy / d, pen: rr - d };
        }
        if (a.shape === 'circle') {
            var c1 = circleRect(a, b);
            return c1 ? { nx: -c1.nx, ny: -c1.ny, pen: c1.pen } : null;
        }
        return circleRect(b, a);
    }

    function resolve(world, a, b, k) {
        var ia = a.held ? 0 : a.invMass;
        var ib = b.held ? 0 : b.invMass;
        var sum = ia + ib;
        if (sum === 0) return;

        var pen = Math.max(k.pen - 0.01, 0);
        var corr = pen / sum * 0.85;
        a.x -= k.nx * corr * ia; a.y -= k.ny * corr * ia;
        b.x += k.nx * corr * ib; b.y += k.ny * corr * ib;

        var vn = (b.vx - a.vx) * k.nx + (b.vy - a.vy) * k.ny;
        if (vn < 0) {
            var j = -(1 + world.restitution) * vn / sum;
            a.vx -= j * ia * k.nx; a.vy -= j * ia * k.ny;
            b.vx += j * ib * k.nx; b.vy += j * ib * k.ny;
        }
    }

    function wall(world, b) {
        var e = world.wallRestitution;
        if (b.x - b.hw < 0) { b.x = b.hw; if (!b.held && b.vx < 0) b.vx = -b.vx * e; }
        else if (b.x + b.hw > world.width) { b.x = world.width - b.hw; if (!b.held && b.vx > 0) b.vx = -b.vx * e; }
        if (b.y - b.hh < 0) { b.y = b.hh; if (!b.held && b.vy < 0) b.vy = -b.vy * e; }
        else if (b.y + b.hh > world.height) { b.y = world.height - b.hh; if (!b.held && b.vy > 0) b.vy = -b.vy * e; }
    }

    function collideAll(world) {
        var bs = world.bodies, n = bs.length;
        for (var i = 0; i < n; i++) {
            for (var j = i + 1; j < n; j++) {
                var k = contact(bs[i], bs[j]);
                if (k) resolve(world, bs[i], bs[j], k);
            }
        }
    }

    function sub(world, h) {
        var bs = world.bodies, n = bs.length, i, b;
        for (i = 0; i < n; i++) {
            b = bs[i];
            b.x += b.vx * h;
            b.y += b.vy * h;
            if (!b.held) {
                // Per-body drag (1/s) if the body sets one, else the world default.
                var damp = Math.exp(-(b.damping != null ? b.damping : world.damping) * h);
                b.vx *= damp; b.vy *= damp;
            }
        }

        for (var it = 0; it < 3; it++) {
            collideAll(world);
            for (i = 0; i < n; i++) wall(world, bs[i]);
        }

        for (i = 0; i < n; i++) {
            b = bs[i];
            if (b.held) continue;
            var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            if (sp > world.maxSpeed) {
                var s = world.maxSpeed / sp;
                b.vx *= s; b.vy *= s;
            } else if (world.minSpeed > 0 && sp < world.minSpeed) {
                // Keep things drifting: ease speed back up instead of snapping.
                if (sp < 1e-3) {
                    var a = world.rand() * Math.PI * 2;
                    b.vx = Math.cos(a) * 2; b.vy = Math.sin(a) * 2;
                } else {
                    var g = 1 + 1.5 * h;
                    b.vx *= g; b.vy *= g;
                }
            }
        }
    }

    function createWorld(opts) {
        opts = opts || {};
        var world = {
            width: opts.width || 0,
            height: opts.height || 0,
            bodies: [],
            restitution: opts.restitution != null ? opts.restitution : 0.88,
            wallRestitution: opts.wallRestitution != null ? opts.wallRestitution : 0.92,
            damping: opts.damping != null ? opts.damping : 0.12, // 1/s of air drag
            minSpeed: opts.minSpeed != null ? opts.minSpeed : 0,   // px/s drift floor
            maxSpeed: opts.maxSpeed != null ? opts.maxSpeed : 1400,
            rand: opts.rand || Math.random,
            add: function (b) { world.bodies.push(b); return b; },
            remove: function (b) {
                var i = world.bodies.indexOf(b);
                if (i >= 0) world.bodies.splice(i, 1);
            },
            resize: function (w, h) { world.width = w; world.height = h; },
            step: function (dt) {
                dt = Math.min(dt, 0.1);
                if (dt <= 0) return;
                var n = Math.max(1, Math.ceil(dt / SUBSTEP));
                var h = dt / n;
                for (var s = 0; s < n; s++) sub(world, h);
            },
            // Push overlapping bodies apart without giving them any velocity.
            relax: function (iterations) {
                for (var i = 0; i < iterations; i++) {
                    var saved = world.bodies.map(function (b) { return [b.vx, b.vy]; });
                    collideAll(world);
                    world.bodies.forEach(function (b, idx) {
                        wall(world, b);
                        b.vx = saved[idx][0]; b.vy = saved[idx][1];
                    });
                }
            }
        };
        return world;
    }

    return { createWorld: createWorld, createBody: createBody, setSize: setSize, clamp: clamp };
});
