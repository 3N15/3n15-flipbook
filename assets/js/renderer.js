import { mat4, clamp } from '@3n15-flipbook/math';

const SEG_X = 56;
const SEG_Y = 14;
const PAGE_W = 1;
const FOV = (28 * Math.PI) / 180;
const BOOK_TILT = -0.1;
const Z_GAP = 0.0006;
const SHADOW_STRENGTH = 0.32;

const COMMIT_P = 0.3;
const COMMIT_V = 1;
const DRAG_FOLLOW = 32;
const BEND_CURVE = Float32Array.from({ length: SEG_X + 1 }, (_, c) => 1 - Math.cos((Math.PI / 2) * (c / SEG_X)));

export const MOTION = {
	click: 0.62,
	key: 0.42,
	jump: 0.4,
	stagger: 0.07,
	bend: 1.25,
	window: 3,
};

const PAGE_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform mat4 uMvp;
uniform mat3 uNormalMat;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
	vUv = aUv;
	vNormal = uNormalMat * aNormal;
	gl_Position = uMvp * vec4(aPos, 1.0);
}`;

const PAGE_FS = `
precision mediump float;
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec3 uLight;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
	vec3 n = normalize(vNormal);
	vec4 tex;
	if (gl_FrontFacing) {
		tex = texture2D(uFront, vUv);
	} else {
		n = -n;
		tex = texture2D(uBack, vec2(1.0 - vUv.x, vUv.y));
	}
	float diffuse = clamp(0.72 + 0.32 * max(dot(n, uLight), 0.0), 0.0, 1.0);
	float gutter = mix(0.86, 1.0, smoothstep(0.0, 0.07, vUv.x));
	gl_FragColor = vec4(tex.rgb * diffuse * gutter, 1.0);
}`;

const SHADOW_VS = `
attribute vec2 aPos;
uniform mat4 uMvp;
uniform float uSide;
uniform float uPageH;
uniform float uZ;
varying float vU;
void main() {
	vU = aPos.x;
	gl_Position = uMvp * vec4(aPos.x * uSide, (aPos.y - 0.5) * uPageH, uZ, 1.0);
}`;

const SHADOW_FS = `
precision mediump float;
uniform float uOpacity;
uniform float uReach;
varying float vU;
void main() {
	float t = clamp(vU / uReach, 0.0, 1.0);
	float a = (1.0 - t) * (1.0 - t) * (1.0 - t * 0.35);
	gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity);
}`;

function compile(gl, vs, fs) {
	const prog = gl.createProgram();
	for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
		const sh = gl.createShader(type);
		gl.shaderSource(sh, src);
		gl.compileShader(sh);
		if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
			throw new Error(gl.getShaderInfoLog(sh));
		}
		gl.attachShader(prog, sh);
		gl.deleteShader(sh);
	}
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
		throw new Error(gl.getProgramInfoLog(prog));
	}
	const uniforms = new Map();
	const attribs = new Map();
	return {
		prog,
		loc(name) {
			if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(prog, name));
			return uniforms.get(name);
		},
		attr(name) {
			if (!attribs.has(name)) attribs.set(name, gl.getAttribLocation(prog, name));
			return attribs.get(name);
		},
	};
}

class Sheet {
	constructor(index) {
		this.index = index;
		this.p = 0;
		this.v = 0;
		this.target = 0;
		this.mode = 'rest';
		this.from = 0;
		this.v0 = 0;
		this.duration = MOTION.click;
		this.t = 0;
		this.delay = 0;
		this.k = 0;
		this.twist = 0;
		this.twistTarget = 0;
		this.order = 0;
		this.z = 0;
		this.dirty = true;
		this.vbo = null;
	}

	get moving() {
		return this.mode !== 'rest';
	}
}

export class BookRenderer {
	static supported() {
		try {
			const c = document.createElement('canvas');
			return !!(c.getContext('webgl2') || c.getContext('webgl'));
		} catch (e) {
			return false;
		}
	}

	constructor(canvas, opts) {
		this.canvas = canvas;
		this.pages = opts.pages;
		this.bendFactor = typeof opts.bend === 'number' ? opts.bend : 1;
		this.reduceMotion = !!opts.reduceMotion;
		this.framing = opts.frame || { spread: [2.16, 1.22], single: [1.06, 1.14] };
		this.onReady = opts.onReady || (() => {});
		this.onTextureError = opts.onTextureError || (() => {});

		const first = this.pages[0];
		this.pageH = first && first.w && first.h ? first.h / first.w : 1.414;
		this.sheetCount = Math.ceil(this.pages.length / 2);
		this.sheets = Array.from({ length: this.sheetCount }, (_, i) => new Sheet(i));
		this.cur = 0;
		this.orderSeq = 0;

		this.portrait = false;
		this.viewSide = null;
		this.grabbed = null;
		this.camX = PAGE_W / 2;
		this.camTarget = PAGE_W / 2;
		this.camZ = 5;
		this.visible = true;
		this.readyFired = false;
		this.raf = 0;
		this.last = 0;
		this.lost = false;

		this.proj = mat4.create();
		this.view = mat4.create();
		this.model = mat4.rotationX(mat4.create(), BOOK_TILT);
		const m = this.model;
		this.normalMat = new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
		this.mvp = mat4.create();
		this.inv = mat4.create();
		const light = [-1.2, 1.6, 4];
		const len = Math.hypot(...light);
		this.light = new Float32Array(light.map((v) => v / len));

		this.textures = new Map();
		this.shade = { right: 0, left: 0, reachR: 1, reachL: 1 };

		this.frame = this.frame.bind(this);
		this.onLost = (e) => {
			e.preventDefault();
			this.lost = true;
			cancelAnimationFrame(this.raf);
			this.raf = 0;
		};
		this.onRestored = () => {
			this.lost = false;
			this.initGL();
			this.syncTextures();
			this.requestRender();
		};
		canvas.addEventListener('webglcontextlost', this.onLost);
		canvas.addEventListener('webglcontextrestored', this.onRestored);

		this.initGL();
		this.layout(0, null);
	}

	initGL() {
		const attrs = { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' };
		const gl = (this.gl = this.canvas.getContext('webgl2', attrs) || this.canvas.getContext('webgl', attrs));
		if (!gl) throw new Error('WebGL unavailable');
		this.isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
		this.aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
		this.maxAniso = this.aniso ? Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;

		this.pageProg = compile(gl, PAGE_VS, PAGE_FS);
		this.shadowProg = compile(gl, SHADOW_VS, SHADOW_FS);

		const cols = SEG_X + 1;
		const rows = SEG_Y + 1;
		const uv = new Float32Array(cols * rows * 2);
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const i = (r * cols + c) * 2;
				uv[i] = c / SEG_X;
				uv[i + 1] = r / SEG_Y;
			}
		}
		const idx = new Uint16Array(SEG_X * SEG_Y * 6);
		let n = 0;
		for (let r = 0; r < SEG_Y; r++) {
			for (let c = 0; c < SEG_X; c++) {
				const a = r * cols + c;
				const b = a + 1;
				const d = a + cols;
				const e = d + 1;
				idx[n++] = a; idx[n++] = b; idx[n++] = e;
				idx[n++] = a; idx[n++] = e; idx[n++] = d;
			}
		}
		this.uvBuf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
		gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
		this.idxBuf = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
		this.idxCount = idx.length;

		this.shadowBuf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

		this.vertexData = new Float32Array(cols * rows * 6);
		for (const sh of this.sheets) {
			sh.vbo = null;
			sh.dirty = true;
		}

		this.blank = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.blank);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

		this.textures.clear();
		gl.enable(gl.DEPTH_TEST);
		gl.clearColor(0, 0, 0, 0);
	}

	syncTextures() {
		if (this.lost) return;
		const need = new Set();
		const from = Math.max(0, this.cur - MOTION.window - 1);
		const to = Math.min(this.sheetCount - 1, this.cur + MOTION.window);
		for (let s = from; s <= to; s++) {
			need.add(2 * s);
			need.add(2 * s + 1);
		}
		for (const sh of this.sheets) {
			if (sh.moving) {
				need.add(2 * sh.index);
				need.add(2 * sh.index + 1);
			}
		}
		for (const [i, t] of this.textures) {
			if (need.has(i)) continue;
			if (t.tex) this.gl.deleteTexture(t.tex);
			if (t.img) t.img.src = '';
			this.textures.delete(i);
		}
		for (const i of need) {
			if (i < this.pages.length && !this.textures.has(i)) this.loadTexture(i);
		}
		this.checkReady();
	}

	loadTexture(i) {
		const entry = { tex: null, state: 'loading', img: new Image() };
		this.textures.set(i, entry);
		const src = this.pages[i].src;
		try {
			if (new URL(src, location.href).origin !== location.origin) entry.img.crossOrigin = 'anonymous';
		} catch (e) {}
		entry.img.src = src;
		entry.img
			.decode()
			.then(() => {
				if (this.textures.get(i) !== entry || this.lost) return;
				const gl = this.gl;
				const tex = gl.createTexture();
				gl.bindTexture(gl.TEXTURE_2D, tex);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, entry.img);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				if (this.isGL2) {
					gl.generateMipmap(gl.TEXTURE_2D);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
				} else {
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				}
				if (this.maxAniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAniso);
				entry.tex = tex;
				entry.state = 'ready';
				entry.img.src = '';
				entry.img = null;
				this.checkReady();
				this.requestRender();
			})
			.catch(() => {
				if (this.textures.get(i) !== entry) return;
				entry.state = 'error';
				this.onTextureError(i);
				this.checkReady();
			});
	}

	retryTextures() {
		for (const [i, t] of this.textures) {
			if (t.state === 'error') this.textures.delete(i);
		}
		this.syncTextures();
	}

	texFor(i) {
		const t = this.textures.get(i);
		return t && t.tex ? t.tex : this.blank;
	}

	checkReady() {
		if (this.readyFired) return;
		const visible = [2 * this.cur - 1, 2 * this.cur].filter((i) => i >= 0 && i < this.pages.length);
		const done = visible.every((i) => {
			const t = this.textures.get(i);
			return t && t.state !== 'loading';
		});
		if (!done) return;
		this.readyFired = true;
		this.requestRender();
		requestAnimationFrame(() => this.onReady());
	}

	layout(cur, anim) {
		const prev = this.cur;
		this.cur = cur;
		const changed = [];
		for (const sh of this.sheets) {
			if (sh.mode === 'drag') continue;
			const target = sh.index < cur ? 1 : 0;
			if (target !== sh.target || (sh.mode === 'rest' && sh.p !== target)) {
				sh.target = target;
				changed.push(sh);
			}
		}
		changed.sort((a, b) => (cur >= prev ? b.index - a.index : a.index - b.index));
		const max = anim && !this.reduceMotion ? anim.maxAnimated || 1 : 0;
		const count = Math.min(changed.length, max);
		changed.forEach((sh, n) => {
			if (n < count) {
				sh.delay = (count - 1 - n) * (anim.stagger || 0);
				this.animate(sh, anim.duration || MOTION.click, anim.twist || 0);
			} else {
				this.snap(sh);
			}
		});
		this.updateZ();
		this.syncTextures();
		this.requestRender();
	}

	animate(sh, duration, twist) {
		if (!sh.moving) sh.order = ++this.orderSeq;
		const dist = Math.abs(sh.target - sh.p);
		const dir = Math.sign(sh.target - sh.p);
		const vMax = dist > 0 ? (3 * dist) / duration : 0;
		sh.mode = 'tween';
		sh.from = sh.p;
		sh.v0 = dir * Math.min(Math.max(dir * sh.v, -vMax), vMax);
		sh.duration = duration;
		sh.t = 0;
		sh.twistTarget = twist;
		sh.dirty = true;
	}

	snap(sh) {
		sh.mode = 'rest';
		sh.p = sh.target;
		sh.v = 0;
		sh.k = 0;
		sh.twist = 0;
		sh.delay = 0;
		sh.dirty = true;
	}

	grab(clientX, clientY, { left, right }) {
		const pt = this.pick(clientX, clientY);
		if (!pt || Math.abs(pt.y) > this.pageH / 2 || Math.abs(pt.x) > PAGE_W) return null;
		const side = pt.x > 0 ? 1 : -1;
		if ((side > 0 && !right) || (side < 0 && !left)) return null;
		const sh = this.sheets[side > 0 ? this.cur : this.cur - 1];
		if (!sh || sh.moving) return null;
		const reach = Math.max(0.25, Math.abs(pt.x));
		this.grabbed = { sh, side, reach, yn: -pt.y / this.pageH, started: false, target: sh.p, samples: [] };
		return { side, twist: this.grabbed.yn };
	}

	drag(clientX, clientY, time = performance.now()) {
		const g = this.grabbed;
		if (!g) return;
		const pt = this.pick(clientX, clientY);
		if (!pt) return;
		const sh = g.sh;
		if (!g.started) {
			g.started = true;
			sh.mode = 'drag';
			sh.order = ++this.orderSeq;
			sh.delay = 0;
			this.updateZ();
			this.syncTextures();
		}
		g.target = Math.acos(clamp(pt.x / g.reach, -1, 1)) / Math.PI;
		g.samples.push({ p: g.target, x: pt.x, t: time });
		while (g.samples.length > 2 && time - g.samples[0].t > 100) g.samples.shift();
		this.requestRender();
	}

	followDrag(dt) {
		const g = this.grabbed;
		if (!g || !g.started) return;
		const sh = g.sh;
		sh.p += (g.target - sh.p) * (1 - Math.exp(-dt * DRAG_FOLLOW));
		if (Math.abs(g.target - sh.p) < 1e-4) sh.p = g.target;
		const lift = Math.sin(Math.PI * sh.p);
		const progress = g.side > 0 ? sh.p : 1 - sh.p;
		const ease = progress >= 0.12 ? 1 : (progress / 0.12) * (progress / 0.12) * (3 - 2 * (progress / 0.12));
		sh.k = g.side * this.bendFactor * (1.05 * Math.pow(lift, 0.6) + 0.35 * ease * (1 - progress));
		sh.twist = g.yn * 1.3 * ease;
		sh.dirty = true;
	}

	release(clientX, clientY, cancelled) {
		const g = this.grabbed;
		this.grabbed = null;
		if (!g || !g.started) return false;
		if (!cancelled) this.drag(clientX, clientY);
		const a = g.samples[0];
		const b = g.samples[g.samples.length - 1];
		const span = a && b.t - a.t >= 16 ? (b.t - a.t) / 1000 : 0;
		const velocity = span ? (b.p - a.p) / span : 0;
		const swipe = span ? (b.x - a.x) / span : 0;
		const forward = g.side > 0;
		const progress = forward ? g.target : 1 - g.target;
		const v = forward ? -swipe : swipe;
		const commit = !cancelled && v > -COMMIT_V && (progress > COMMIT_P || v > COMMIT_V);

		const sh = g.sh;
		sh.target = commit === forward ? 1 : 0;
		if (this.reduceMotion) {
			this.snap(sh);
		} else {
			sh.v = clamp(velocity, -6, 6);
			this.animate(sh, clamp(0.22 + 0.45 * Math.abs(sh.target - sh.p), 0.22, 0.55), g.yn);
		}
		if (commit) this.cur = forward ? sh.index + 1 : sh.index;
		this.updateZ();
		this.requestRender();
		return commit;
	}

	isAnimating() {
		return this.sheets.some((sh) => sh.moving);
	}

	setView(side) {
		this.viewSide = side;
		this.camTarget = this.cameraX();
		this.requestRender();
	}

	cameraX() {
		const half = PAGE_W / 2;
		if (this.portrait) return this.viewSide === 'left' ? -half : half;
		if (this.cur === 0) return half;
		if (this.cur === this.sheetCount) return -half;
		return 0;
	}

	setVisible(v) {
		this.visible = v;
		if (v) this.requestRender();
	}

	resize(width, height, portrait, fitY = 1, fitX = 1) {
		if (!width || !height) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		this.canvas.width = Math.round(width * dpr);
		this.canvas.height = Math.round(height * dpr);
		this.portrait = portrait;
		const aspect = width / height;
		mat4.perspective(this.proj, FOV, aspect, 0.1, 50);
		const [frameW, frameH] = portrait ? this.framing.single : this.framing.spread;
		const needW = (frameW * PAGE_W) / fitX;
		const needH = (this.pageH * frameH) / fitY;
		const t = Math.tan(FOV / 2);
		this.camZ = Math.max(needH / 2 / t, needW / 2 / t / aspect);
		this.camTarget = this.camX = this.cameraX();
		this.requestRender();
	}

	pick(clientX, clientY) {
		const r = this.canvas.getBoundingClientRect();
		if (!r.width || !r.height) return null;
		const nx = ((clientX - r.left) / r.width) * 2 - 1;
		const ny = -(((clientY - r.top) / r.height) * 2 - 1);
		this.updateMatrices();
		if (!mat4.invert(this.inv, this.mvp)) return null;
		const a = mat4.project(this.inv, nx, ny, -1);
		const b = mat4.project(this.inv, nx, ny, 1);
		const dz = b[2] - a[2];
		if (Math.abs(dz) < 1e-6) return null;
		const t = -a[2] / dz;
		return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
	}

	step(dt) {
		this.followDrag(dt);
		const bend = MOTION.bend * this.bendFactor;
		const follow = 1 - Math.exp(-dt * 20);
		const vRef = 1.5 / MOTION.click;
		let landed = false;

		for (const sh of this.sheets) {
			if (sh.mode !== 'tween') continue;
			if (sh.delay > 0) {
				sh.delay -= dt;
				continue;
			}
			sh.t += dt;
			const T = sh.duration;
			const u = Math.min(1, sh.t / T);
			const u2 = u * u;
			const u3 = u2 * u;
			const d = sh.target - sh.from;
			sh.p = clamp(sh.from + T * sh.v0 * (u3 - 2 * u2 + u) + d * (3 * u2 - 2 * u3), 0, 1);
			sh.v = sh.v0 * (3 * u2 - 4 * u + 1) + (d / T) * (6 * u - 6 * u2);

			const s = Math.sin(Math.PI * sh.p);
			const travel = d ? Math.abs(sh.p - sh.from) / Math.abs(d) : 1;
			const speed = clamp(Math.abs(sh.v) / vRef, 0, 1.4);
			const kTarget = Math.sign(d || sh.v) * bend * speed * Math.pow(s, 0.7) * (1 - 1.6 * travel);
			sh.k += (kTarget - sh.k) * follow;
			sh.twist += (sh.twistTarget * s - sh.twist) * follow;
			sh.dirty = true;

			if (u >= 1) {
				this.snap(sh);
				landed = true;
			}
		}
		if (landed) this.updateZ();

		this.stepShade(dt);

		const dx = this.camTarget - this.camX;
		this.camX = Math.abs(dx) < 0.0005 ? this.camTarget : this.camX + dx * (1 - Math.exp(-dt * 7));
	}

	stepShade(dt) {
		let right = 0;
		let left = 0;
		let reachR = 0;
		let reachL = 0;
		for (const sh of this.sheets) {
			if (!sh.moving || sh.delay > 0) continue;
			const lift = Math.sin(Math.PI * sh.p);
			const spread = Math.abs(Math.cos(Math.PI * sh.p));
			const r = lift * Math.pow(1 - sh.p, 0.6);
			const l = lift * Math.pow(sh.p, 0.6);
			right += r;
			left += l;
			reachR += r * spread;
			reachL += l * spread;
		}
		const follow = 1 - Math.exp(-dt * 14);
		const s = this.shade;
		const target = (sum, weight) => (weight > 0 ? clamp(sum / weight, 0.22, 1) : null);
		const tR = target(reachR, right);
		const tL = target(reachL, left);
		if (tR !== null) s.reachR += (tR - s.reachR) * follow;
		if (tL !== null) s.reachL += (tL - s.reachL) * follow;
		s.right += (Math.min(1, right) - s.right) * follow;
		s.left += (Math.min(1, left) - s.left) * follow;
		if (s.right < 0.002) s.right = 0;
		if (s.left < 0.002) s.left = 0;
	}

	updateZ() {
		const depth = MOTION.window + 1;
		const moving = this.sheets.filter((sh) => sh.moving).sort((a, b) => a.order - b.order);
		for (const sh of this.sheets) {
			if (sh.moving) sh.z = (depth + 1 + moving.indexOf(sh)) * Z_GAP;
			else if (sh.target === 1) sh.z = Math.max(1, depth - (this.cur - 1 - sh.index)) * Z_GAP;
			else sh.z = Math.max(1, depth - (sh.index - this.cur)) * Z_GAP;
			sh.dirty = true;
		}
	}

	deform(sh) {
		const gl = this.gl;
		const cols = SEG_X + 1;
		const rows = SEG_Y + 1;
		const out = this.vertexData;
		const du = PAGE_W / SEG_X;
		const theta = Math.PI * sh.p;
		const H = this.pageH;
		const room = sh.k > 0 ? Math.PI - theta : theta;
		const k = Math.sign(sh.k) * Math.min(Math.abs(sh.k), room / Math.exp(Math.abs(sh.twist) * 0.8));

		for (let r = 0; r < rows; r++) {
			const yn = r / SEG_Y - 0.5;
			const twist = Math.exp(sh.twist * yn * 1.6);
			let x = 0;
			let z = 0;
			for (let c = 0; c < cols; c++) {
				if (c > 0) {
					const a = clamp(theta + k * BEND_CURVE[c] * twist, 0, Math.PI);
					x += Math.cos(a) * du;
					z += Math.sin(a) * du;
				}
				const i = (r * cols + c) * 6;
				out[i] = x;
				out[i + 1] = yn * H;
				out[i + 2] = z + sh.z;
			}
		}

		for (let r = 0; r < rows; r++) {
			const r0 = Math.max(0, r - 1);
			const r1 = Math.min(rows - 1, r + 1);
			for (let c = 0; c < cols; c++) {
				const c0 = Math.max(0, c - 1);
				const c1 = Math.min(cols - 1, c + 1);
				const a = (r * cols + c0) * 6;
				const b = (r * cols + c1) * 6;
				const d = (r0 * cols + c) * 6;
				const e = (r1 * cols + c) * 6;
				const ux = out[b] - out[a];
				const uy = out[b + 1] - out[a + 1];
				const uz = out[b + 2] - out[a + 2];
				const vx = out[e] - out[d];
				const vy = out[e + 1] - out[d + 1];
				const vz = out[e + 2] - out[d + 2];
				const nx = uy * vz - uz * vy;
				const ny = uz * vx - ux * vz;
				const nz = ux * vy - uy * vx;
				const l = Math.hypot(nx, ny, nz) || 1;
				const i = (r * cols + c) * 6;
				out[i + 3] = nx / l;
				out[i + 4] = ny / l;
				out[i + 5] = nz / l;
			}
		}

		if (!sh.vbo) {
			sh.vbo = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, sh.vbo);
			gl.bufferData(gl.ARRAY_BUFFER, out, gl.DYNAMIC_DRAW);
		} else {
			gl.bindBuffer(gl.ARRAY_BUFFER, sh.vbo);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, out);
		}
		sh.dirty = false;
	}

	requestRender() {
		if (!this.raf && !this.lost && !this.destroyed) this.raf = requestAnimationFrame(this.frame);
	}

	updateMatrices() {
		mat4.lookAt(this.view, [this.camX, 0, this.camZ], [this.camX, 0, 0]);
		mat4.multiply(this.mvp, this.proj, this.view);
		mat4.multiply(this.mvp, this.mvp, this.model);
	}

	frame(now) {
		this.raf = 0;
		if (this.lost || this.destroyed) return;
		const dt = this.last ? Math.min(1 / 20, (now - this.last) / 1000) : 1 / 60;
		this.last = now;
		this.step(dt);

		const active = this.isAnimating() || this.shade.right > 0 || this.shade.left > 0 || Math.abs(this.camTarget - this.camX) > 0.0005;
		if (this.visible) this.draw();
		if (active) this.raf = requestAnimationFrame(this.frame);
		else this.last = 0;
	}

	draw() {
		const gl = this.gl;
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		this.updateMatrices();

		const lo = this.cur - MOTION.window - 1;
		const hi = this.cur + MOTION.window;
		const list = this.sheets.filter((sh) => sh.moving || (sh.index >= lo && sh.index <= hi));

		const P = this.pageProg;
		gl.useProgram(P.prog);
		gl.uniformMatrix4fv(P.loc('uMvp'), false, this.mvp);
		gl.uniformMatrix3fv(P.loc('uNormalMat'), false, this.normalMat);
		gl.uniform3fv(P.loc('uLight'), this.light);
		gl.uniform1i(P.loc('uFront'), 0);
		gl.uniform1i(P.loc('uBack'), 1);
		const aPos = P.attr('aPos');
		const aNormal = P.attr('aNormal');
		const aUv = P.attr('aUv');
		gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
		gl.enableVertexAttribArray(aUv);
		gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
		gl.enableVertexAttribArray(aPos);
		gl.enableVertexAttribArray(aNormal);
		gl.disable(gl.BLEND);
		gl.depthMask(true);
		for (const sh of list) {
			if (sh.dirty || !sh.vbo) this.deform(sh);
			gl.bindBuffer(gl.ARRAY_BUFFER, sh.vbo);
			gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
			gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.texFor(2 * sh.index));
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.texFor(2 * sh.index + 1));
			gl.drawElements(gl.TRIANGLES, this.idxCount, gl.UNSIGNED_SHORT, 0);
		}
		gl.disableVertexAttribArray(aNormal);
		gl.disableVertexAttribArray(aUv);

		const shade = this.shade;
		if (!shade.right && !shade.left) return;
		const S = this.shadowProg;
		gl.useProgram(S.prog);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask(false);
		gl.uniformMatrix4fv(S.loc('uMvp'), false, this.mvp);
		gl.uniform1f(S.loc('uPageH'), this.pageH);
		gl.uniform1f(S.loc('uZ'), (MOTION.window + 1.5) * Z_GAP);
		const a = S.attr('aPos');
		gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuf);
		gl.enableVertexAttribArray(a);
		gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
		for (const [side, amount, reach] of [[1, shade.right, shade.reachR], [-1, shade.left, shade.reachL]]) {
			if (!amount) continue;
			gl.uniform1f(S.loc('uSide'), side);
			gl.uniform1f(S.loc('uOpacity'), SHADOW_STRENGTH * amount);
			gl.uniform1f(S.loc('uReach'), reach);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}
		gl.disableVertexAttribArray(a);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
	}

	destroy() {
		this.destroyed = true;
		cancelAnimationFrame(this.raf);
		this.canvas.removeEventListener('webglcontextlost', this.onLost);
		this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
		const gl = this.gl;
		if (gl && !gl.isContextLost()) {
			for (const t of this.textures.values()) if (t.tex) gl.deleteTexture(t.tex);
			for (const sh of this.sheets) if (sh.vbo) gl.deleteBuffer(sh.vbo);
			[this.uvBuf, this.idxBuf, this.shadowBuf].forEach((b) => gl.deleteBuffer(b));
			gl.deleteTexture(this.blank);
			gl.deleteProgram(this.pageProg.prog);
			gl.deleteProgram(this.shadowProg.prog);
			const ext = gl.getExtension('WEBGL_lose_context');
			if (ext) ext.loseContext();
		}
		this.textures.clear();
	}
}
