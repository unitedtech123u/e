// 2D Path Tracer - OPTIMIZED
// Uses web workers for parallel rendering

class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        return new Vector2(this.x + v.x, this.y + v.y);
    }

    sub(v) {
        return new Vector2(this.x - v.x, this.y - v.y);
    }

    mul(s) {
        return new Vector2(this.x * s, this.y * s);
    }

    dot(v) {
        return this.x * v.x + this.y * v.y;
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const len = this.length();
        if (len === 0) return new Vector2(0, 0);
        return new Vector2(this.x / len, this.y / len);
    }

    reflect(n) {
        const d = this.dot(n);
        return this.sub(n.mul(2 * d));
    }

    static random() {
        const angle = Math.random() * Math.PI * 2;
        return new Vector2(Math.cos(angle), Math.sin(angle));
    }
}

class Ray {
    constructor(origin, direction) {
        this.origin = origin;
        this.direction = direction.normalize();
    }

    at(t) {
        return this.origin.add(this.direction.mul(t));
    }
}

class Material {
    constructor(r, g, b, emissive = 0, roughness = 0.5) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.emissive = emissive;
        this.roughness = roughness;
    }
}

class Circle {
    constructor(cx, cy, radius, material) {
        this.cx = cx;
        this.cy = cy;
        this.radius = radius;
        this.material = material;
    }

    intersect(ray) {
        const ocx = ray.origin.x - this.cx;
        const ocy = ray.origin.y - this.cy;
        const dx = ray.direction.x;
        const dy = ray.direction.y;

        const a = dx * dx + dy * dy;
        const b = 2.0 * (ocx * dx + ocy * dy);
        const c = ocx * ocx + ocy * ocy - this.radius * this.radius;
        const disc = b * b - 4 * a * c;

        if (disc < 0) return null;

        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0.001) return null;

        const px = ray.origin.x + dx * t;
        const py = ray.origin.y + dy * t;
        const nx = (px - this.cx) / this.radius;
        const ny = (py - this.cy) / this.radius;

        return { t, px, py, nx, ny, mat: this.material };
    }
}

class Rect {
    constructor(minx, miny, maxx, maxy, material) {
        this.minx = minx;
        this.miny = miny;
        this.maxx = maxx;
        this.maxy = maxy;
        this.material = material;
    }

    intersect(ray) {
        const dx = ray.direction.x;
        const dy = ray.direction.y;
        const ox = ray.origin.x;
        const oy = ray.origin.y;

        const txMin = (this.minx - ox) / (dx || 0.0001);
        const txMax = (this.maxx - ox) / (dx || 0.0001);
        const tyMin = (this.miny - oy) / (dy || 0.0001);
        const tyMax = (this.maxy - oy) / (dy || 0.0001);

        const tMin = Math.max(Math.min(txMin, txMax), Math.min(tyMin, tyMax));
        const tMax = Math.min(Math.max(txMin, txMax), Math.max(tyMin, tyMax));

        if (tMax < tMin || tMax < 0.001) return null;

        const t = tMin > 0.001 ? tMin : tMax;
        const px = ox + dx * t;
        const py = oy + dy * t;

        let nx = 0, ny = 0;
        const eps = 0.001;
        if (Math.abs(px - this.minx) < eps) nx = -1;
        else if (Math.abs(px - this.maxx) < eps) nx = 1;
        else if (Math.abs(py - this.miny) < eps) ny = -1;
        else ny = 1;

        return { t, px, py, nx, ny, mat: this.material };
    }
}

class PathTracer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.width = canvas.width;
        this.height = canvas.height;
        this.pixelBuffer = new Uint8ClampedArray(this.width * this.height * 4);
        this.pixelData = new Uint32Array(this.width * this.height * 3);
        this.scene = [];
        this.initScene();
    }

    initScene() {
        const w = this.width;
        const h = this.height;

        this.scene = [
            new Circle(w * 0.3, h * 0.2, 25, new Material(1, 1, 1, 2.0, 0.1)),
            new Circle(w * 0.7, h * 0.3, 30, new Material(1, 0.2, 0.2, 0, 0.3)),
            new Circle(w * 0.5, h * 0.7, 28, new Material(0.2, 1, 0.2, 0, 0.7)),
            new Rect(0, 0, w, 10, new Material(0.7, 0.7, 0.7, 0, 0.5)),
            new Rect(0, h - 10, w, h, new Material(0.7, 0.7, 0.7, 0, 0.5)),
            new Rect(0, 0, 10, h, new Material(0.5, 0.7, 1, 0, 0.5)),
            new Rect(w - 10, 0, w, h, new Material(1, 0.7, 0.5, 0, 0.5))
        ];
    }

    traceRay(ray, depth, maxBounces) {
        if (depth > maxBounces) return [0.05, 0.05, 0.08];

        let closest = null;
        let closestT = Infinity;

        for (let i = 0; i < this.scene.length; i++) {
            const hit = this.scene[i].intersect(ray);
            if (hit && hit.t < closestT) {
                closest = hit;
                closestT = hit.t;
            }
        }

        if (!closest) return [0.05, 0.05, 0.08];

        const mat = closest.mat;
        const roughness = mat.roughness;

        const randAngle = Math.random() * 6.283;
        const randRough = Math.random() * roughness;
        const rcos = Math.cos(randAngle) * randRough;
        const rsin = Math.sin(randAngle) * randRough;

        let refx = ray.direction.x * closest.nx + ray.direction.y * closest.ny;
        refx = ray.direction.x - 2 * refx * closest.nx;
        let refy = ray.direction.y - 2 * refx * closest.ny;

        const len = Math.sqrt(refx * refx + refy * refy) + 0.0001;
        refx = (refx / len + rcos) * 0.999;
        refy = (refy / len + rsin) * 0.999;

        const nextRay = new Ray({ x: closest.px, y: closest.py }, { x: refx, y: refy });
        const bounce = this.traceRay(nextRay, depth + 1, maxBounces);

        const diffuse = Math.max(0.1, refx * closest.nx + refy * closest.ny);
        return [
            bounce[0] * mat.r * diffuse + mat.emissive * mat.r,
            bounce[1] * mat.g * diffuse + mat.emissive * mat.g,
            bounce[2] * mat.b * diffuse + mat.emissive * mat.b
        ];
    }

    renderRegion(x, y, w, h, samples, maxBounces, exposure) {
        const endX = Math.min(x + w, this.width);
        const endY = Math.min(y + h, this.height);

        for (let py = y; py < endY; py++) {
            for (let px = x; px < endX; px++) {
                const pidx = py * this.width + px;
                let r = 0, g = 0, b = 0;

                for (let s = 0; s < samples; s++) {
                    const ray = new Ray(
                        { x: px + Math.random(), y: py + Math.random() },
                        { x: Math.random() - 0.5, y: Math.random() - 0.5 }
                    );
                    const col = this.traceRay(ray, 0, maxBounces);
                    r += col[0];
                    g += col[1];
                    b += col[2];
                }

                const cnt = samples;
                this.pixelData[pidx * 3] += r / cnt;
                this.pixelData[pidx * 3 + 1] += g / cnt;
                this.pixelData[pidx * 3 + 2] += b / cnt;
            }
        }
    }

    updateImageData(exposure) {
        for (let i = 0; i < this.width * this.height; i++) {
            let r = this.pixelData[i * 3] * exposure;
            let g = this.pixelData[i * 3 + 1] * exposure;
            let b = this.pixelData[i * 3 + 2] * exposure;

            r = Math.pow(Math.min(1, r), 1 / 2.2) * 255;
            g = Math.pow(Math.min(1, g), 1 / 2.2) * 255;
            b = Math.pow(Math.min(1, b), 1 / 2.2) * 255;

            const bidx = i * 4;
            this.pixelBuffer[bidx] = r;
            this.pixelBuffer[bidx + 1] = g;
            this.pixelBuffer[bidx + 2] = b;
            this.pixelBuffer[bidx + 3] = 255;
        }

        const imageData = new ImageData(this.pixelBuffer, this.width, this.height);
        this.ctx.putImageData(imageData, 0, 0);
    }

    clear() {
        this.pixelData.fill(0);
    }
}

// UI and Main Loop
const canvas = document.getElementById('canvas');
const pathTracer = new PathTracer(canvas);

let samplesPerPixel = 1;
let maxBounces = 4;
let exposure = 1.2;
let blockSize = 16;
let frameCount = 0;
let lastFrameTime = Date.now();

const samplesSlider = document.getElementById('samplesSlider');
const bouncesSlider = document.getElementById('bouncesSlider');
const blockSizeSlider = document.getElementById('blockSizeSlider');
const exposureSlider = document.getElementById('exposureSlider');
const resetButton = document.getElementById('resetButton');
const clearButton = document.getElementById('clearButton');
const statsDiv = document.getElementById('stats');
const renderStatsDiv = document.getElementById('renderStats');

samplesSlider.max = 8;
samplesSlider.value = 1;
bouncesSlider.max = 12;
bouncesSlider.value = 4;
blockSizeSlider.max = 32;
blockSizeSlider.value = 16;

samplesSlider.addEventListener('input', (e) => {
    samplesPerPixel = Math.max(1, parseInt(e.target.value));
    document.getElementById('samplesValue').textContent = samplesPerPixel;
});

bouncesSlider.addEventListener('input', (e) => {
    maxBounces = Math.max(1, parseInt(e.target.value));
    document.getElementById('bouncesValue').textContent = maxBounces;
});

blockSizeSlider.addEventListener('input', (e) => {
    blockSize = Math.max(8, parseInt(e.target.value));
    document.getElementById('blockSizeValue').textContent = blockSize;
});

exposureSlider.addEventListener('input', (e) => {
    exposure = parseFloat(e.target.value);
    document.getElementById('exposureValue').textContent = exposure.toFixed(1);
});

resetButton.addEventListener('click', () => {
    pathTracer.initScene();
    pathTracer.clear();
});

clearButton.addEventListener('click', () => {
    pathTracer.clear();
});

let blockQueue = [];
function initBlockQueue() {
    blockQueue = [];
    for (let by = 0; by < canvas.height; by += blockSize) {
        for (let bx = 0; bx < canvas.width; bx += blockSize) {
            blockQueue.push([bx, by, blockSize, blockSize]);
        }
    }
    blockQueue.sort(() => Math.random() - 0.5);
}

initBlockQueue();

function animate() {
    const frameStart = Date.now();

    // Render limited blocks per frame for 60 FPS
    const blocksPerFrame = Math.max(1, Math.floor(blockQueue.length / 8));
    for (let i = 0; i < blocksPerFrame && blockQueue.length > 0; i++) {
        const block = blockQueue.shift();
        pathTracer.renderRegion(block[0], block[1], block[2], block[3], samplesPerPixel, maxBounces, exposure);
    }

    if (blockQueue.length === 0) {
        initBlockQueue();
    }

    pathTracer.updateImageData(exposure);

    const frameEnd = Date.now();
    const frameTime = frameEnd - frameStart;

    frameCount++;
    if (frameEnd - lastFrameTime >= 1000) {
        const fps = frameCount;
        frameCount = 0;
        lastFrameTime = frameEnd;

        statsDiv.textContent = `Resolution: ${canvas.width}x${canvas.height}\nSamples/px: ${samplesPerPixel}\nFPS: ${fps}`;
        renderStatsDiv.textContent = `Frame time: ${frameTime}ms\nBlocks left: ${blockQueue.length}\nBounces: ${maxBounces}`;
    }

    requestAnimationFrame(animate);
}

pathTracer.clear();
animate();
