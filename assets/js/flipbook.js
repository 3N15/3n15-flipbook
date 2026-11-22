import { BookRenderer, MOTION } from '@3n15-flipbook/renderer';

const PORTRAIT_MAX = 640;
const TAP_SLOP = 6;
const SWIPE_PX = 40;
const SIDE_ROOM = 0.25;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const instances = new Map();

class Flipbook {
	constructor(root, cfg) {
		this.root = root;
		this.cfg = cfg;
		this.i18n = cfg.i18n || {};
		this.pageCount = cfg.pages.length;
		this.sheetCount = Math.ceil(this.pageCount / 2);
		this.maxCur = this.pageCount % 2 === 1 ? this.sheetCount - 1 : this.sheetCount;
		this.cur = 0;
		this.side = 'right';
		this.portrait = false;
		this.gl = null;
		this.drag = null;
		this.ac = new AbortController();

		const q = (s) => root.querySelector(s);
		this.el = {
			stage: q('.n15fb-stage'),
			pages: [...root.querySelectorAll('.n15fb-page')],
			count: q('.n15fb-count'),
			progress: q('.n15fb-progress span'),
			dialog: q('.n15fb-dialog'),
			error: q('.n15fb-error'),
			fullBtn: q('[data-act="fullscreen"]'),
			overviewBtn: q('[data-act="overview"]'),
			backBtns: [...root.querySelectorAll('[data-act="prev"],[data-act="first"]')],
			fwdBtns: [...root.querySelectorAll('[data-act="next"],[data-act="last"]')],
		};

		this.bind();
		this.observe();
		this.update();
		this.fixCountWidth();
		if (document.fonts) document.fonts.ready.then(() => this.fixCountWidth());
	}

	fixCountWidth() {
		const el = this.el.count;
		if (!el) return;
		const tpl = this.i18n.pageOf || '%1$s / %2$s';
		const n = this.pageCount;
		const probe = el.cloneNode(false);
		probe.removeAttribute('aria-live');
		probe.setAttribute('aria-hidden', 'true');
		probe.style.cssText = 'position:absolute;visibility:hidden;min-width:0';
		el.parentNode.appendChild(probe);
		let max = 0;
		for (const label of [String(n), n > 1 ? n - 1 + '–' + n : String(n)]) {
			probe.textContent = this.format(tpl, label, n);
			max = Math.max(max, probe.getBoundingClientRect().width);
		}
		probe.remove();
		el.style.minWidth = Math.ceil(max) + 'px';
	}

	visiblePages() {
		if (this.portrait) return [this.side === 'left' ? 2 * this.cur - 1 : 2 * this.cur];
		return [2 * this.cur - 1, 2 * this.cur].filter((i) => i >= 0 && i < this.pageCount);
	}

	atStart() {
		return this.cur === 0 && (!this.portrait || this.side === 'right');
	}

	atEnd() {
		if (!this.portrait) return this.cur >= this.maxCur;
		return this.side === 'left' ? 2 * this.cur >= this.pageCount : this.cur >= this.maxCur;
	}

	next(duration = MOTION.click, twist = 0.25) {
		if (this.atEnd() || this.drag) return;
		if (this.portrait && this.side === 'left' && 2 * this.cur < this.pageCount) {
			this.side = 'right';
		} else {
			this.cur++;
			this.side = 'left';
			this.animateLayout(duration, twist);
		}
		this.update();
	}

	prev(duration = MOTION.click, twist = 0.25) {
		if (this.atStart() || this.drag) return;
		if (this.portrait && this.side === 'right') {
			this.side = 'left';
		} else {
			this.cur--;
			this.side = 'right';
			this.animateLayout(duration, twist);
		}
		this.update();
	}

	goToPage(i) {
		i = Math.max(0, Math.min(this.pageCount - 1, i));
		const cur = Math.min(this.maxCur, Math.ceil(i / 2));
		const jump = Math.abs(cur - this.cur) > 1;
		this.cur = cur;
		this.side = i % 2 === 1 ? 'left' : 'right';
		if (this.gl) {
			this.gl.layout(cur, { duration: jump ? MOTION.jump : MOTION.click, twist: 0.15, maxAnimated: 4, stagger: MOTION.stagger });
		}
		if (!this.gl || reducedMotion.matches) this.fade();
		this.update();
	}

	animateLayout(duration, twist) {
		if (this.gl) this.gl.layout(this.cur, { duration, twist, maxAnimated: 1 });
		if (!this.gl || reducedMotion.matches) this.fade();
	}

	fade() {
		this.root.classList.remove('is-fading');
		void this.root.offsetWidth;
		this.root.classList.add('is-fading');
	}

	update() {
		const vis = this.visiblePages();
		this.el.pages.forEach((li, i) => {
			li.toggleAttribute('data-show', vis.includes(i));
		});

		const nums = vis.map((i) => i + 1);
		const label = nums.length > 1 ? nums[0] + '–' + nums[1] : String(nums[0] || 1);
		const last = Math.max(...nums, 1);
		if (this.el.count && label !== this.countLabel) this.renderCount(label, last);
		if (this.el.progress) this.el.progress.style.transform = 'scaleX(' + last / this.pageCount + ')';

		const start = this.atStart();
		const end = this.atEnd();
		this.el.backBtns.forEach((b) => this.setDisabled(b, start));
		this.el.fwdBtns.forEach((b) => this.setDisabled(b, end));

		if (this.gl) this.gl.setView(this.side);
	}

	renderCount(label, last) {
		const el = this.el.count;
		const first = this.countLabel === undefined;
		el.dataset.dir = last < (this.countLast || last) ? 'back' : 'forward';
		this.countLabel = label;
		this.countLast = last;
		const [before, after = ''] = (this.i18n.pageOf || '%1$s / %2$s').split('%1$s');
		const value = document.createElement('span');
		value.className = 'n15fb-count-value';
		if (first) value.dataset.static = '';
		value.textContent = label;
		const total = (s) => document.createTextNode(s.replace('%2$s', this.pageCount));
		el.replaceChildren(total(before), value, total(after));
	}

	setDisabled(btn, off) {
		if (off) btn.setAttribute('aria-disabled', 'true');
		else btn.removeAttribute('aria-disabled');
	}

	format(tpl, ...args) {
		return tpl.replace(/%(\d)\$s/g, (_, n) => String(args[n - 1]));
	}

	bind() {
		const opt = { signal: this.ac.signal };
		const { root, el } = this;

		root.addEventListener('click', (e) => {
			const thumb = e.target.closest('.n15fb-thumb');
			if (thumb) {
				this.closeOverview();
				this.goToPage(parseInt(thumb.dataset.page, 10));
				return;
			}
			const btn = e.target.closest('[data-act]');
			if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
			this.touched();
			switch (btn.dataset.act) {
				case 'next': this.next(); break;
				case 'prev': this.prev(); break;
				case 'first': this.goToPage(0); break;
				case 'last': this.goToPage(this.pageCount - 1); break;
				case 'overview': this.openOverview(); break;
				case 'close': this.closeOverview(); break;
				case 'fullscreen': this.toggleFullscreen(); break;
				case 'retry': this.retry(); break;
			}
		}, opt);

		root.addEventListener('keydown', (e) => {
			if (e.altKey || e.ctrlKey || e.metaKey || (el.dialog && el.dialog.open)) return;
			if (e.key === 'Escape' && root.classList.contains('is-pseudo-full')) {
				this.toggleFullscreen();
				return;
			}
			const act = { ArrowRight: 'next', PageDown: 'next', ArrowLeft: 'prev', PageUp: 'prev', Home: 'first', End: 'last' }[e.key];
			if (!act || e.target.closest('input, textarea, select, [contenteditable]')) return;
			e.preventDefault();
			this.touched();
			if (act === 'next') this.next(MOTION.key);
			else if (act === 'prev') this.prev(MOTION.key);
			else if (act === 'first') this.goToPage(0);
			else this.goToPage(this.pageCount - 1);
		}, opt);

		el.stage.addEventListener('pointerdown', (e) => this.pointerDown(e), opt);
		el.stage.addEventListener('pointermove', (e) => this.pointerMove(e), opt);
		el.stage.addEventListener('pointerup', (e) => this.pointerEnd(e, false), opt);
		el.stage.addEventListener('pointercancel', (e) => this.pointerEnd(e, true), opt);
		el.stage.addEventListener('lostpointercapture', (e) => this.pointerEnd(e, true), opt);

		if (el.dialog) {
			el.dialog.addEventListener('click', (e) => {
				if (e.target === el.dialog) this.closeOverview();
			}, opt);
			el.dialog.addEventListener('close', () => {
				if (el.overviewBtn) el.overviewBtn.focus({ preventScroll: true });
			}, opt);
		}

		document.addEventListener('fullscreenchange', () => this.onFullscreenChange(), opt);
		document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange(), opt);
		reducedMotion.addEventListener('change', () => {
			if (this.gl) this.gl.reduceMotion = reducedMotion.matches;
		}, opt);

		this.hintTimer = setTimeout(() => root.classList.add('show-hint'), 1500);

		const bar = root.querySelector('.n15fb-bar');
		if (bar) {
			bar.addEventListener('pointerover', (e) => {
				clearTimeout(this.coolTimer);
				if (!e.target.closest('[data-tip]') || bar.hasAttribute('data-tips-warm')) return;
				clearTimeout(this.warmTimer);
				this.warmTimer = setTimeout(() => bar.setAttribute('data-tips-warm', ''), 450);
			}, opt);
			bar.addEventListener('pointerleave', () => {
				clearTimeout(this.warmTimer);
				this.coolTimer = setTimeout(() => bar.removeAttribute('data-tips-warm'), 300);
			}, opt);
		}

		el.pages.forEach((li) => {
			const img = li.querySelector('img');
			if (!img) return;
			const done = () => img.classList.add('is-loaded');
			if (img.complete) done();
			else {
				img.addEventListener('load', done, { once: true, signal: this.ac.signal });
				img.addEventListener('error', done, { once: true, signal: this.ac.signal });
			}
		});
	}

	observe() {
		this.ro = new ResizeObserver(() => this.resize());
		this.ro.observe(this.root);
		window.addEventListener('resize', () => this.resize(), { signal: this.ac.signal });
		this.io = new IntersectionObserver((entries) => {
			const vis = entries[entries.length - 1].isIntersecting;
			if (vis && !this.gl && !this.glFailed) this.startGL();
			if (this.gl) this.gl.setVisible(vis);
		}, { rootMargin: '400px 0px' });
		this.io.observe(this.root);
	}

	touched() {
		clearTimeout(this.hintTimer);
		this.root.classList.add('is-touched');
	}

	resize() {
		const portrait = this.root.clientWidth < PORTRAIT_MAX;
		if (portrait !== this.portrait) {
			this.portrait = portrait;
			this.side = this.cur === 0 ? 'right' : 'left';
			this.update();
			this.fixCountWidth();
		}
		if (this.gl) {
			const canvas = this.gl.canvas;
			const stage = this.el.stage.getBoundingClientRect();
			const box = this.root.getBoundingClientRect();
			const room = Math.max(0, Math.min(box.left, document.documentElement.clientWidth - box.right));
			const side = Math.floor(Math.min(room, stage.width * SIDE_ROOM));
			canvas.style.left = -side + 'px';
			canvas.style.width = 'calc(100% + ' + 2 * side + 'px)';
			const area = canvas.getBoundingClientRect();
			if (!area.width || !area.height) return;
			this.gl.resize(area.width, area.height, this.portrait, stage.height / area.height, stage.width / area.width);
		}
	}

	startGL() {
		if (!BookRenderer.supported()) {
			this.glFailed = true;
			return;
		}
		const canvas = document.createElement('canvas');
		canvas.className = 'n15fb-canvas';
		canvas.setAttribute('aria-hidden', 'true');
		this.el.stage.prepend(canvas);
		try {
			this.gl = new BookRenderer(canvas, {
				pages: this.cfg.pages,
				bend: typeof this.cfg.curl === 'number' ? this.cfg.curl : 1,
				frame: this.cfg.frame,
				reduceMotion: reducedMotion.matches,
				onReady: () => {
					this.root.dataset.state = 'gl';
				},
				onTextureError: () => {
					if (this.el.error) this.el.error.hidden = false;
				},
			});
		} catch (err) {
			console.error('[3N15 Flipbook]', err);
			canvas.remove();
			this.gl = null;
			this.glFailed = true;
			return;
		}
		this.gl.layout(this.cur, null);
		this.resize();
		this.update();
	}

	retry() {
		if (this.el.error) this.el.error.hidden = true;
		if (this.gl) this.gl.retryTextures();
		this.el.pages.forEach((li) => {
			const img = li.querySelector('img');
			if (img && img.complete && !img.naturalWidth) img.src = img.src;
		});
	}

	pointerDown(e) {
		if (this.drag || !e.isPrimary || e.button > 0 || e.target.closest('button, a')) return;
		this.touched();
		let grab = null;
		if (this.gl && this.root.dataset.state === 'gl') {
			grab = this.gl.grab(e.clientX, e.clientY, {
				left: !this.atStart() && (!this.portrait || this.side === 'left'),
				right: this.cur < this.maxCur && (!this.portrait || this.side === 'right'),
			});
			if (!grab) return;
		}
		this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, grab };
		try {
			this.el.stage.setPointerCapture(e.pointerId);
		} catch (err) {}
	}

	pointerMove(e) {
		const d = this.drag;
		if (!d || e.pointerId !== d.id) return;
		if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > TAP_SLOP) {
			d.moved = true;
			if (d.grab) this.el.stage.classList.add('is-dragging');
		}
		if (!d.grab) return;
		const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
		for (const ev of events.length ? events : [e]) this.gl.drag(ev.clientX, ev.clientY, ev.timeStamp);
	}

	pointerEnd(e, cancelled) {
		const d = this.drag;
		if (!d || e.pointerId !== d.id) return;
		this.drag = null;
		this.el.stage.classList.remove('is-dragging');

		if (d.grab) {
			if (!d.moved) {
				this.gl.release(e.clientX, e.clientY, true);
				if (cancelled) return;
				if (d.grab.side > 0) this.next(MOTION.click, d.grab.twist);
				else this.prev(MOTION.click, d.grab.twist);
				return;
			}
			if (this.gl.release(e.clientX, e.clientY, cancelled)) {
				const forward = d.grab.side > 0;
				this.cur += forward ? 1 : -1;
				this.side = forward ? 'left' : 'right';
				this.gl.layout(this.cur, null);
			}
			this.update();
			return;
		}

		if (cancelled) return;
		const dx = e.clientX - d.x0;
		const dy = e.clientY - d.y0;
		if (d.moved && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
			if (dx < 0) this.next();
			else this.prev();
		} else if (!d.moved) {
			const r = this.el.stage.getBoundingClientRect();
			if (e.clientX - r.left > r.width / 2) this.next();
			else this.prev();
		}
	}

	openOverview() {
		const dlg = this.el.dialog;
		if (!dlg || dlg.open) return;
		const vis = this.visiblePages();
		let current = null;
		dlg.querySelectorAll('.n15fb-thumb').forEach((b) => {
			if (vis.includes(parseInt(b.dataset.page, 10))) {
				b.setAttribute('aria-current', 'page');
				current = current || b;
			} else {
				b.removeAttribute('aria-current');
			}
		});
		dlg.showModal();
		if (!current) return;
		current.focus({ preventScroll: true });
		const li = current.closest('li');
		dlg.scrollTop = Math.max(0, li.offsetTop - (dlg.clientHeight - li.offsetHeight) / 2);
	}

	closeOverview() {
		if (this.el.dialog && this.el.dialog.open) this.el.dialog.close();
	}

	isFullscreen() {
		return (document.fullscreenElement || document.webkitFullscreenElement) === this.root || this.root.classList.contains('is-pseudo-full');
	}

	toggleFullscreen() {
		const r = this.root;
		if (r.classList.contains('is-pseudo-full')) {
			r.classList.remove('is-pseudo-full');
			document.documentElement.classList.remove('n15fb-lock');
			this.onFullscreenChange();
			return;
		}
		if (document.fullscreenElement || document.webkitFullscreenElement) {
			(document.exitFullscreen || document.webkitExitFullscreen).call(document);
			return;
		}
		const req = r.requestFullscreen || r.webkitRequestFullscreen;
		if (req) Promise.resolve(req.call(r)).catch(() => this.pseudoFullscreen());
		else this.pseudoFullscreen();
	}

	pseudoFullscreen() {
		this.root.classList.add('is-pseudo-full');
		document.documentElement.classList.add('n15fb-lock');
		this.root.focus({ preventScroll: true });
		this.onFullscreenChange();
	}

	onFullscreenChange() {
		const on = this.isFullscreen();
		this.root.classList.toggle('is-full', on);
		const span = this.el.fullBtn && this.el.fullBtn.querySelector('.n15fb-label');
		const label = on ? this.i18n.exitFull : this.i18n.fullscreen;
		if (span && label) {
			span.textContent = label;
			this.el.fullBtn.dataset.tip = label;
		}
		requestAnimationFrame(() => this.resize());
	}

	destroy() {
		this.ac.abort();
		[this.hintTimer, this.warmTimer, this.coolTimer].forEach(clearTimeout);
		this.ro.disconnect();
		this.io.disconnect();
		if (this.gl) {
			this.gl.destroy();
			this.gl.canvas.remove();
		}
		this.root.classList.remove('is-pseudo-full', 'is-full', 'is-touched', 'show-hint');
		this.root.dataset.state = 'html';
		document.documentElement.classList.remove('n15fb-lock');
		delete this.root.dataset.n15fbInit;
		instances.delete(this.root);
	}
}

function boot(scope = document) {
	scope.querySelectorAll('.n15fb:not([data-n15fb-init])').forEach((root) => {
		root.dataset.n15fbInit = '';
		let cfg;
		try {
			cfg = JSON.parse(root.querySelector('.n15fb-config').textContent);
		} catch (e) {
			return;
		}
		if (!cfg.pages || !cfg.pages.length) return;
		instances.set(root, new Flipbook(root, cfg));
	});
}

window.N15Flipbook = {
	boot,
	get: (el) => instances.get(el),
	destroy: (el) => {
		const i = instances.get(el);
		if (i) i.destroy();
	},
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
else boot();
