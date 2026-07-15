// 2D Path Tracer
// Renders a 2D scene with path tracing using pixel/block-based rendering

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
    constructor(color, emissive = 0, roughness = 0.5) {
        this.color = color;
        this.emissive = emissive;
        this.roughness = roughness;
    }
}

class Circle {
    constructor(center, radius, material) {
        this.center = center;
        this.radius = radius;
        this.material = material;
    }

    intersect(ray) {
        const oc = ray.origin.sub(this.center);
        const a = ray.direction.dot(ray.direction);
        const b = 2.0 * oc.dot(ray.direction);
        const c = oc.dot(oc) - this.radius * this.radius;
        const discriminant = b * b - 4 * a * c;

        if (discriminant < 0) return null;

        const t = (-b - Math.sqrt(discriminant)) / (2 * a);
        if (t < 0.001) return null;

        const point = ray.at(t);
        const normal = point.sub(this.center).normalize();
        return { t, point, normal, material: this.material };
    }
}

class Rect {
    constructor(min, max, material) {
        this.min = min;
        this.max = max;
        this.material = material;
    }

    intersect(ray) {
        const dx = ray.direction.x;
        const dy = ray.direction.y;
        const ox = ray.origin.x;
        const oy = ray.origin.y;

        const txMin = (this.min.x - ox) / (dx || 0.0001);
        const txMax = (this.max.x - ox) / (dx || 0.0001);
        const tyMin = (this.min.y - oy) / (dy || 0.0001);
        const tyMax = (this.max.y - oy) / (dy || 0.0001);

        const tMin = Math.max(
            Math.min(txMin, txMax),
            Math.min(tyMin, tyMax)
        );
        const tMax = Math.min(
            Math.max(txMin, txMax),
            Math.max(tyMin, tyMax)
        );

        if (tMax < tMin || tMax < 0.001) return null;

        const t = tMin > 0.001 ? tMin : tMax;
        const point = ray.at(t);

        let normal;
        const epsilon = 0.001;
        if (Math.abs(point.x - this.min.x) < epsilon) normal = new Vector2(-1, 0);
        else if (Math.abs(point.x - this.max.x) < epsilon) normal = new Vector2(1, 0);
        else if (Math.abs(point.y - this.min.y) < epsilon) normal = new Vector2(0, -1);
        else normal = new Vector2(0, 1);

        return { t, point, normal, material: this.material };
    }
}

class PathTracer {
    constructor(canvas, blockSize = 4) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.blockSize = blockSize;
        this.width = canvas.width;
        this.height = canvas.height;

        this.scene = [];
        this.pixelSamples = {};
        this.initScene();
    }

    initScene() {
        // Light sources
        this.scene.push(
            new Circle(
                new Vector2(this.width * 0.3, this.height * 0.2),
                25,
                new Material(new Vector2(1, 1, 1), 2.0)
            )
        );

        // Colored spheres
        this.scene.push(
            new Circle(
                new Vector2(this.width * 0.7, this.height * 0.3),
                30,
                new Material(new Vector2(1, 0.2, 0.2), 0, 0.3)
            )
        );

        this.scene.push(
            new Circle(
                new Vector2(this.width * 0.5, this.height * 0.7),
                28,
                new Material(new Vector2(0.2, 1, 0.2), 0, 0.7)
            )
        );

        // Walls
        this.scene.push(
            new Rect(
                new Vector2(0, 0),
                new Vector2(this.width, 10),
                new Material(new Vector2(0.7, 0.7, 0.7), 0, 0.5)
            )
        );

        this.scene.push(
            new Rect(
                new Vector2(0, this.height - 10),
                new Vector2(this.width, this.height),
                new Material(new Vector2(0.7, 0.7, 0.7), 0, 0.5)
            )
        );

        this.scene.push(
            new Rect(
                new Vector2(0, 0),
                new Vector2(10, this.height),
                new Material(new Vector2(0.5, 0.7, 1), 0, 0.5)
            )
        );

        this.scene.push(
            new Rect(
                new Vector2(this.width - 10, 0),
                new Vector2(this.width, this.height),
                new Material(new Vector2(1, 0.7, 0.5), 0, 0.5)
            )
        );
    }

    traceRay(ray, depth, maxBounces) {
        if (depth > maxBounces) {
            return new Vector2(0, 0);
        }

        let closest = null;
        let closestT = Infinity;

        for (const obj of this.scene) {
            const hit = obj.intersect(ray);
            if (hit && hit.t < closestT) {
                closest = hit;
                closestT = hit.t;
            }
        }

        if (!closest) {
            return new Vector2(0.1, 0.1, 0.15);
        }

        const { point, normal, material } = closest;
        const emission = material.color.mul(material.emissive);

        // Add roughness
        const roughDir = Vector2.random().mul(material.roughness);
        const reflectDir = ray.direction.reflect(normal)
            .add(roughDir)
            .normalize();

        const nextRay = new Ray(point, reflectDir);
        const bounce = this.traceRay(nextRay, depth + 1, maxBounces);

        const diffuse = material.color.mul(Math.max(0, reflectDir.dot(normal)));
        const combined = new Vector2(
            bounce.x * diffuse.x + emission.x,
            bounce.y * diffuse.y + emission.y
        );

        return combined;
    }

    samplePixel(x, y, samplesPerPixel, maxBounces) {
        let color = new Vector2(0, 0);

        for (let s = 0; s < samplesPerPixel; s++) {
            const px = x + Math.random();
            const py = y + Math.random();

            const ray = new Ray(
                new Vector2(px, py),
                Vector2.random()
            );

            const sample = this.traceRay(ray, 0, maxBounces);
            color.x += sample.x;
            color.y += sample.y;
        }

        return new Vector2(
            color.x / samplesPerPixel,
            color.y / samplesPerPixel
        );
    }

    renderBlock(blockX, blockY, samplesPerPixel, maxBounces, exposure) {
        const startX = blockX * this.blockSize;
        const startY = blockY * this.blockSize;
        const endX = Math.min(startX + this.blockSize, this.width);
        const endY = Math.min(startY + this.blockSize, this.height);

        const imageData = this.ctx.createImageData(endX - startX, endY - startY);
        const data = imageData.data;

        let dataIdx = 0;
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const key = `${x},${y}`;
                if (!this.pixelSamples[key]) {
                    this.pixelSamples[key] = new Vector2(0, 0);
                }

                const sample = this.samplePixel(x, y, 1, maxBounces);
                this.pixelSamples[key].x += sample.x;
                this.pixelSamples[key].y += sample.y;

                const sampleCount = Math.floor(this.pixelSamples[key].x * this.pixelSamples[key].y) + 1;

                let r = (this.pixelSamples[key].x / sampleCount) * exposure;
                let g = (this.pixelSamples[key].y / sampleCount) * exposure;
                let b = (this.pixelSamples[key].x * 0.5 / sampleCount) * exposure;

                // Tone mapping
                r = Math.pow(r, 1 / 2.2);
                g = Math.pow(g, 1 / 2.2);
                b = Math.pow(b, 1 / 2.2);

                data[dataIdx] = Math.min(255, r * 255);
                data[dataIdx + 1] = Math.min(255, g * 255);
                data[dataIdx + 2] = Math.min(255, b * 255);
                data[dataIdx + 3] = 255;
                dataIdx += 4;
            }
        }

        this.ctx.putImageData(imageData, startX, startY);
    }

    clear() {
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.pixelSamples = {};
    }

    render(samplesPerPixel, maxBounces, exposure) {
        const blocksX = Math.ceil(this.width / this.blockSize);
        const blocksY = Math.ceil(this.height / this.blockSize);

        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                this.renderBlock(bx, by, samplesPerPixel, maxBounces, exposure);
            }
        }
    }
}

// UI and Main Loop
const canvas = document.getElementById('canvas');
const pathTracer = new PathTracer(canvas, 4);

let samplesPerPixel = 32;
let maxBounces = 8;
let exposure = 1.0;
let blockSize = 4;
let isRunning = true;
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

samplesSlider.addEventListener('input', (e) => {
    samplesPerPixel = parseInt(e.target.value);
    document.getElementById('samplesValue').textContent = samplesPerPixel;
});

bouncesSlider.addEventListener('input', (e) => {
    maxBounces = parseInt(e.target.value);
    document.getElementById('bouncesValue').textContent = maxBounces;
});

blockSizeSlider.addEventListener('input', (e) => {
    blockSize = parseInt(e.target.value);
    pathTracer.blockSize = blockSize;
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

function animate() {
    const frameStart = Date.now();

    pathTracer.render(samplesPerPixel, maxBounces, exposure);

    const frameEnd = Date.now();
    const frameTime = frameEnd - frameStart;

    frameCount++;
    if (frameEnd - lastFrameTime >= 1000) {
        const fps = frameCount;
        frameCount = 0;
        lastFrameTime = frameEnd;

        statsDiv.textContent = `Resolution: ${canvas.width}x${canvas.height}\nSamples: ${samplesPerPixel}\nFPS: ${fps}`;
        renderStatsDiv.textContent = `Frame time: ${frameTime}ms\nBlocks rendered: ${Math.ceil(canvas.width / blockSize) * Math.ceil(canvas.height / blockSize)}\nActive samples: ${samplesPerPixel}`;
    }

    requestAnimationFrame(animate);
}

pathTracer.clear();
animate();
