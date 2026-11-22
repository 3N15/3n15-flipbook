export const mat4 = {
	create() {
		const m = new Float32Array(16);
		m[0] = m[5] = m[10] = m[15] = 1;
		return m;
	},

	perspective(out, fovY, aspect, near, far) {
		const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
		out.fill(0);
		out[0] = f / aspect;
		out[5] = f;
		out[10] = (far + near) * nf;
		out[11] = -1;
		out[14] = 2 * far * near * nf;
		return out;
	},

	lookAt(out, eye, target) {
		let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
		let l = Math.hypot(zx, zy, zz) || 1;
		zx /= l; zy /= l; zz /= l;

		let xx = zz, xy = 0, xz = -zx;
		l = Math.hypot(xx, xy, xz) || 1;
		xx /= l; xz /= l;

		const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
		out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
		out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
		out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
		out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
		out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
		out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
		out[15] = 1;
		return out;
	},

	rotationX(out, a) {
		const c = Math.cos(a), s = Math.sin(a);
		out.fill(0);
		out[0] = 1; out[5] = c; out[6] = s; out[9] = -s; out[10] = c; out[15] = 1;
		return out;
	},

	multiply(out, a, b) {
		const r = new Float32Array(16);
		for (let c = 0; c < 4; c++) {
			for (let rI = 0; rI < 4; rI++) {
				r[c * 4 + rI] = a[rI] * b[c * 4] + a[4 + rI] * b[c * 4 + 1] + a[8 + rI] * b[c * 4 + 2] + a[12 + rI] * b[c * 4 + 3];
			}
		}
		out.set(r);
		return out;
	},

	invert(out, m) {
		const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
		const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
		const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
		const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
		const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
		const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
		const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
		const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
		let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
		if (!det) return null;
		det = 1 / det;
		out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
		out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
		out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
		out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
		out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
		out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
		out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
		out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
		out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
		out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
		out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
		out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
		out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
		out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
		out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
		out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
		return out;
	},

	project(m, x, y, z) {
		const w = m[3] * x + m[7] * y + m[11] * z + m[15];
		return [
			(m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
			(m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
			(m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
		];
	},
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
