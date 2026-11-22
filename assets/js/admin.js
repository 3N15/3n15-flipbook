(function ($, wp, cfg) {
	'use strict';

	const root = document.getElementById('n15fb-admin');
	if (!root || !wp || !wp.apiFetch || !cfg) return;

	const { __, _n, sprintf } = wp.i18n;
	const postId = root.dataset.post;
	const $id = (id) => document.getElementById(id);
	const el = {
		drop: $id('n15fb-drop'),
		pick: $id('n15fb-pick'),
		file: $id('n15fb-file'),
		job: $id('n15fb-job'),
		jobFile: $id('n15fb-job-file'),
		jobStep: $id('n15fb-job-step'),
		jobPct: $id('n15fb-job-pct'),
		jobCount: $id('n15fb-job-count'),
		eta: $id('n15fb-eta'),
		meter: $id('n15fb-meter'),
		meterWrap: $id('n15fb-meter-wrap'),
		cancel: $id('n15fb-cancel'),
		notice: $id('n15fb-notice'),
		summary: $id('n15fb-summary'),
		summaryCount: $id('n15fb-summary-count'),
		summaryMeta: $id('n15fb-summary-meta'),
		tiles: $id('n15fb-tiles'),
	};

	const UPLOAD_CONCURRENCY = 3;
	const MAX_RATIO = 4;
	const MAX_SIDE = 8000;
	const titleInput = $id('title');
	let job = null;
	let published = root.dataset.state === 'done';
	let suggestion = null;

	const icon = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';

	function hideTitlePrompt() {
		const prompt = $id('title-prompt-text');
		if (prompt) prompt.classList.add('screen-reader-text');
	}

	function removeSuggestion() {
		if (suggestion) suggestion.remove();
		suggestion = null;
	}

	function suggestTitle(source) {
		removeSuggestion();
		if (!titleInput) return;
		const text = String(source || '').replace(/\.pdf$/i, '').replace(/[-_\s]+/g, ' ').trim();
		if (!text || text.toLowerCase() === titleInput.value.trim().toLowerCase()) return;

		const box = document.createElement('div');
		box.className = 'n15fb-suggest';
		box.setAttribute('role', 'group');
		box.setAttribute('aria-label', __('Titelvorschlag', '3n15-flipbook'));
		const label = document.createElement('span');
		label.className = 'n15fb-suggest-label';
		label.textContent = __('Titelvorschlag:', '3n15-flipbook');
		const value = document.createElement('span');
		value.className = 'n15fb-suggest-value';
		value.textContent = text;
		const accept = document.createElement('button');
		accept.type = 'button';
		accept.className = 'n15fb-suggest-btn is-accept';
		const replaces = !!titleInput.value.trim();
		accept.setAttribute('aria-label', replaces ? __('Bisherigen Titel durch den Vorschlag ersetzen', '3n15-flipbook') : __('Vorschlag als Titel übernehmen', '3n15-flipbook'));
		accept.title = replaces ? __('Titel ersetzen', '3n15-flipbook') : __('Übernehmen', '3n15-flipbook');
		accept.innerHTML = icon('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
		const dismiss = document.createElement('button');
		dismiss.type = 'button';
		dismiss.className = 'n15fb-suggest-btn is-dismiss';
		dismiss.setAttribute('aria-label', replaces ? __('Bisherigen Titel behalten', '3n15-flipbook') : __('Vorschlag verwerfen', '3n15-flipbook'));
		dismiss.title = replaces ? __('Titel behalten', '3n15-flipbook') : __('Verwerfen', '3n15-flipbook');
		dismiss.innerHTML = icon('<path d="M6 6l12 12M18 6L6 18"/>');
		box.append(label, value, accept, dismiss);

		accept.addEventListener('click', () => acceptSuggestion(box, text));
		dismiss.addEventListener('click', () => {
			removeSuggestion();
			if (!replaces) titleInput.focus();
		});

		const anchor = $id('titlewrap') || titleInput;
		anchor.insertAdjacentElement('afterend', box);
		suggestion = box;
	}

	async function acceptSuggestion(box, text) {
		titleInput.value = text;
		hideTitlePrompt();
		box.classList.add('is-accepted');
		box.replaceChildren();
		const done = document.createElement('span');
		done.className = 'n15fb-suggest-label';
		done.textContent = __('Als Titel übernommen', '3n15-flipbook');
		box.append(done);
		if (published) {
			try {
				await wp.apiFetch({ path: cfg.restBase + '/books/' + postId + '/title', method: 'POST', data: { title: text } });
			} catch (e) {
				showNotice('error', __('Der Titel konnte nicht gespeichert werden. Bitte über „Aktualisieren“ speichern.', '3n15-flipbook'));
			}
		}
		setTimeout(() => { if (suggestion === box) removeSuggestion(); }, 1600);
	}

	if (titleInput) {
		titleInput.addEventListener('input', () => {
			if (suggestion && !suggestion.classList.contains('is-accepted')) removeSuggestion();
		});
	}

	if ($.fn.wpColorPicker) $('.n15fb-color').wpColorPicker();

	const copyBtn = $id('n15fb-copy');
	if (copyBtn) {
		copyBtn.addEventListener('click', async () => {
			const input = $id('n15fb-shortcode');
			const status = $id('n15fb-copy-status');
			input.select();
			try {
				await navigator.clipboard.writeText(input.value);
			} catch (e) {
				document.execCommand('copy');
			}
			copyBtn.classList.remove('is-copied');
			void copyBtn.offsetWidth;
			copyBtn.classList.add('is-copied');
			status.textContent = __('Shortcode kopiert.', '3n15-flipbook');
			clearTimeout(copyBtn._t);
			copyBtn._t = setTimeout(() => { status.textContent = ''; }, 1600);
		});
	}

	function markPublished() {
		const core = (s) => wp.i18n.__(s);
		const select = $id('post_status');
		if (select && !select.querySelector('option[value="publish"]')) select.prepend(new Option(core('Published'), 'publish', true, true));
		if (select) select.value = 'publish';
		['hidden_post_status', 'original_post_status'].forEach((id) => {
			const field = $id(id);
			if (field) field.value = 'publish';
		});
		const display = $id('post-status-display');
		if (display) display.textContent = core('Published');
		const button = $id('publish');
		if (button) {
			button.name = 'save';
			button.value = core('Update');
		}
		const draft = $id('save-action');
		if (draft) draft.hidden = true;
	}

	function setState(state) {
		root.dataset.state = state;
	}

	function showNotice(type, text) {
		el.notice.replaceChildren();
		if (!text) return;
		const div = document.createElement('div');
		div.className = 'notice inline notice-' + type;
		const p = document.createElement('p');
		p.textContent = text;
		div.appendChild(p);
		el.notice.appendChild(div);
	}

	function setProgress(pct) {
		const v = Math.max(0, Math.min(100, pct));
		el.meter.style.transform = 'scaleX(' + v / 100 + ')';
		el.meterWrap.setAttribute('aria-valuenow', String(Math.round(v)));
		el.jobPct.textContent = Math.round(v) + ' %';
	}

	function formatEta(sec) {
		if (!isFinite(sec) || sec <= 0) return '';
		if (sec < 60) return sprintf(__('noch ca. %d s', '3n15-flipbook'), Math.max(1, Math.round(sec)));
		return sprintf(__('noch ca. %d min', '3n15-flipbook'), Math.round(sec / 60));
	}

	function snapshotSummary() {
		return {
			tiles: [...el.tiles.childNodes].map((n) => n.cloneNode(true)),
			ratio: el.tiles.style.getPropertyValue('--n15fb-tile-ratio'),
			count: el.summaryCount.textContent,
			meta: el.summaryMeta.textContent,
			hidden: el.summary.hidden,
		};
	}

	function restoreSummary(s) {
		el.tiles.replaceChildren(...s.tiles);
		el.tiles.style.setProperty('--n15fb-tile-ratio', s.ratio);
		el.summaryCount.textContent = s.count;
		el.summaryMeta.textContent = s.meta;
		el.summary.hidden = s.hidden;
	}

	function prepareTiles(total, ratio) {
		const items = [];
		for (let i = 0; i < total; i++) {
			const li = document.createElement('li');
			li.className = 'is-pending';
			const tile = document.createElement('span');
			tile.className = 'n15fb-tile';
			const label = document.createElement('span');
			label.className = 'n15fb-tile-label';
			label.textContent = i === 0 ? __('Cover', '3n15-flipbook') : String(i + 1);
			li.append(tile, label);
			items.push(li);
		}
		el.tiles.replaceChildren(...items);
		el.tiles.style.setProperty('--n15fb-tile-ratio', ratio);
		el.tiles.scrollTop = 0;
		el.summaryCount.textContent = __('Vorschau', '3n15-flipbook');
		el.summaryMeta.textContent = '';
		el.summary.hidden = false;
	}

	function setTile(i, state, url) {
		const li = el.tiles.children[i];
		if (!li) return;
		li.className = state;
		if (url) {
			const img = new Image();
			img.alt = '';
			img.src = url;
			li.firstChild.replaceChildren(img);
		}
	}

	function keepVisible(i) {
		const li = el.tiles.children[i];
		if (!li) return;
		const view = el.tiles.scrollTop + el.tiles.clientHeight;
		const following = view >= li.offsetTop - li.offsetHeight * 1.5;
		const bottom = li.offsetTop + li.offsetHeight;
		if (following && bottom > view) el.tiles.scrollTop = bottom - el.tiles.clientHeight;
	}

	const api = (path, opts = {}) => wp.apiFetch({ path: cfg.restBase + '/books/' + postId + path, method: 'POST', ...opts });

	async function uploadPage(set, index, page, thumb, signal) {
		const body = new FormData();
		body.append('index', String(index));
		body.append('page', page.blob, 'page.' + page.ext);
		body.append('thumb', thumb.blob, 'thumb.' + thumb.ext);
		for (let attempt = 0; ; attempt++) {
			try {
				return await api('/sets/' + set + '/pages', { body, signal });
			} catch (e) {
				const network = !e || !e.code || e.code === 'fetch_error';
				if (signal.aborted || !network || attempt >= 2) throw e;
				await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
			}
		}
	}

	function uploadMedia(file, onProgress, signal) {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', cfg.restUrl);
			xhr.setRequestHeader('X-WP-Nonce', cfg.nonce);
			xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); });
			xhr.addEventListener('load', () => {
				if (xhr.status < 200 || xhr.status >= 300) { reject(new Error('HTTP ' + xhr.status)); return; }
				try {
					resolve(JSON.parse(xhr.responseText));
				} catch (e) {
					reject(e);
				}
			});
			xhr.addEventListener('error', () => reject(new Error('network')));
			xhr.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
			signal.addEventListener('abort', () => xhr.abort());
			const body = new FormData();
			body.append('file', file, file.name);
			xhr.send(body);
		});
	}

	function toBlob(canvas, quality) {
		return new Promise((resolve, reject) => {
			canvas.toBlob((b) => {
				if (b && b.type === 'image/webp') { resolve({ blob: b, ext: 'webp' }); return; }
				canvas.toBlob((j) => (j ? resolve({ blob: j, ext: 'jpg' }) : reject(new Error('toBlob'))), 'image/jpeg', 0.86);
			}, 'image/webp', quality);
		});
	}

	async function renderPage(doc, n, ratio) {
		const page = await doc.getPage(n);
		const base = page.getViewport({ scale: 1 });
		const canvas = document.createElement('canvas');
		canvas.width = Math.min(cfg.width, Math.floor(MAX_SIDE / ratio));
		canvas.height = Math.min(MAX_SIDE, Math.round(canvas.width * ratio));
		const vp = page.getViewport({ scale: Math.min(canvas.width / base.width, canvas.height / base.height) });
		const ctx = canvas.getContext('2d', { alpha: false });
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		const dx = Math.round((canvas.width - vp.width) / 2);
		const dy = Math.round((canvas.height - vp.height) / 2);
		await page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, dx, dy] }).promise;

		const tc = document.createElement('canvas');
		tc.width = cfg.thumbWidth;
		tc.height = Math.round(canvas.height * (cfg.thumbWidth / canvas.width));
		const tctx = tc.getContext('2d', { alpha: false });
		tctx.imageSmoothingQuality = 'high';
		tctx.drawImage(canvas, 0, 0, tc.width, tc.height);

		const [full, thumb] = await Promise.all([toBlob(canvas, cfg.quality), toBlob(tc, 0.8)]);
		canvas.width = canvas.height = 0;
		tc.width = tc.height = 0;
		page.cleanup();
		return { full, thumb };
	}

	async function run({ file, url, name, pdfId, title }) {
		if (job) return;
		suggestTitle(title || name);
		const ctrl = new AbortController();
		job = { ctrl, set: null, doc: null, error: null, blobs: [] };
		const before = snapshotSummary();
		setState('busy');
		showNotice('', '');
		el.job.hidden = false;
		el.jobFile.textContent = name || 'PDF';
		el.jobCount.textContent = '';
		el.eta.textContent = '';
		setProgress(0);

		try {
			let attachmentId = pdfId || 0;
			let source;
			const base = file ? 12 : 0;

			if (file) {
				el.jobStep.textContent = __('PDF wird hochgeladen …', '3n15-flipbook');
				if (!cfg.maxUpload || file.size <= cfg.maxUpload) {
					try {
						const att = await uploadMedia(file, (f) => {
							setProgress(f * base);
							el.jobStep.textContent = sprintf(__('PDF wird hochgeladen … %d %%', '3n15-flipbook'), Math.round(f * 100));
						}, ctrl.signal);
						attachmentId = att && att.id ? att.id : 0;
					} catch (e) {
						if (ctrl.signal.aborted) throw e;
						attachmentId = 0;
					}
				}
				source = { data: new Uint8Array(await file.arrayBuffer()) };
			} else {
				source = { url };
			}

			el.jobStep.textContent = __('PDF wird geöffnet …', '3n15-flipbook');
			setProgress(base + 1);
			const pdfjs = await import(cfg.pdfjs);
			pdfjs.GlobalWorkerOptions.workerSrc = cfg.worker;
			const task = pdfjs.getDocument({ ...source, isEvalSupported: false });
			ctrl.signal.addEventListener('abort', () => task.destroy());
			const doc = (job.doc = await task.promise);
			const total = doc.numPages;
			if (total > 999) throw new Error(__('Das PDF hat mehr als 999 Seiten.', '3n15-flipbook'));

			const firstView = (await doc.getPage(1)).getViewport({ scale: 1 });
			const ratio = Math.min(MAX_RATIO, Math.max(1 / MAX_RATIO, firstView.height / firstView.width));
			prepareTiles(total, '1 / ' + ratio);
			job.set = (await api('/sets', { signal: ctrl.signal })).set;

			const results = new Array(total);
			const inflight = new Set();
			const t0 = performance.now();
			let done = 0;

			const report = () => {
				setProgress(base + 2 + (done / total) * (96 - base));
				const line = sprintf(__('%1$d von %2$d Seiten fertig', '3n15-flipbook'), done, total);
				el.jobCount.textContent = line;
				const perPage = (performance.now() - t0) / 1000 / Math.max(1, done);
				el.eta.textContent = done ? formatEta(perPage * (total - done)) : '';
			};
			report();

			for (let i = 0; i < total; i++) {
				if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
				el.jobStep.textContent = sprintf(__('Seite %1$d von %2$d wird erzeugt', '3n15-flipbook'), i + 1, total);
				const r = await renderPage(doc, i + 1, ratio);
				const preview = URL.createObjectURL(r.thumb.blob);
				job.blobs.push(preview);
				setTile(i, 'is-uploading', preview);
				keepVisible(i);

				const p = uploadPage(job.set, i, r.full, r.thumb, ctrl.signal).then((res) => {
					results[i] = { w: res.w, h: res.h };
					setTile(i, 'is-done');
					done++;
					report();
				}, (err) => {
					if (!job.error && !ctrl.signal.aborted) {
						job.error = err;
						ctrl.abort();
					}
					throw err;
				});
				inflight.add(p);
				p.finally(() => inflight.delete(p)).catch(() => {});
				if (inflight.size >= UPLOAD_CONCURRENCY) await Promise.race(inflight);
			}
			el.jobStep.textContent = __('Letzte Seiten werden gespeichert …', '3n15-flipbook');
			await Promise.all(inflight);

			el.jobStep.textContent = __('Wird veröffentlicht …', '3n15-flipbook');
			setProgress(99);
			const original = $id('original_post_status');
			const wasNew = !!original && original.value === 'auto-draft';
			const res = await api('/sets/' + job.set + '/commit', {
				signal: ctrl.signal,
				data: { count: total, pdf_id: attachmentId, pdf_name: name || '', title: titleInput ? titleInput.value : '' },
			});

			setProgress(100);
			el.job.hidden = true;
			el.summaryCount.textContent = sprintf(_n('%d Seite', '%d Seiten', res.pages, '3n15-flipbook'), res.pages);
			el.summaryMeta.textContent = (name ? name + ' · ' : '') + results[0].w + ' × ' + results[0].h + ' px';
			const sc = $id('n15fb-shortcode');
			if (sc && res.shortcode) sc.value = res.shortcode;
			published = true;
			if (wasNew && res.status === 'publish') markPublished();
			const idle = el.drop.querySelector('.n15fb-drop-idle');
			if (idle) idle.textContent = __('Neues PDF hierher ziehen', '3n15-flipbook');
			showNotice('success', attachmentId
				? __('Fertig. Das Flipbook ist aktualisiert.', '3n15-flipbook')
				: __('Fertig. Hinweis: Das PDF liegt nicht in der Mediathek, daher gibt es keinen Download-Button.', '3n15-flipbook'));
			setState('done');
		} catch (caught) {
			const e = job.error || caught;
			if (e && e.name === 'PasswordException') e.message = __('Das PDF ist passwortgeschützt. Bitte eine Version ohne Passwort verwenden.', '3n15-flipbook');
			if (e && (e.name === 'InvalidPDFException' || e.name === 'MissingPDFException')) e.message = __('Die Datei ist kein gültiges PDF oder beschädigt.', '3n15-flipbook');
			const aborted = !job.error && (ctrl.signal.aborted || (e && e.name === 'AbortError'));
			el.job.hidden = true;
			if (job.set) api('/sets/' + job.set, { method: 'DELETE' }).catch(() => {});
			job.blobs.forEach((u) => URL.revokeObjectURL(u));
			restoreSummary(before);
			if (suggestion && !suggestion.classList.contains('is-accepted')) removeSuggestion();
			showNotice(aborted ? 'warning' : 'error', aborted
				? __('Abgebrochen. Das veröffentlichte Flipbook wurde nicht verändert.', '3n15-flipbook')
				: sprintf(__('Fehler: %s Das veröffentlichte Flipbook wurde nicht verändert.', '3n15-flipbook'), (e && e.message) || __('Unbekannter Fehler.', '3n15-flipbook')));
			if (!aborted && window.console) console.error('[3N15 Flipbook]', e);
			setState(before.hidden ? 'empty' : 'done');
		} finally {
			if (job.doc) job.doc.destroy();
			job = null;
		}
	}

	el.cancel.addEventListener('click', () => { if (job) job.ctrl.abort(); });

	window.addEventListener('beforeunload', (e) => {
		if (!job) return;
		e.preventDefault();
		e.returnValue = '';
	});

	const isPdf = (type, filename) => type === 'application/pdf' || /\.pdf$/i.test(filename || '');
	const hasFiles = (e) => !!(e.dataTransfer && [...e.dataTransfer.types].includes('Files'));

	function useLocalFile(f) {
		if (!f) return;
		if (!isPdf(f.type, f.name)) {
			showNotice('error', __('Bitte eine PDF-Datei verwenden.', '3n15-flipbook'));
			return;
		}
		run({ file: f, name: f.name });
	}

	el.drop.addEventListener('click', (e) => {
		if (job || e.target.closest('#n15fb-pick')) return;
		el.file.click();
	});
	el.drop.addEventListener('keydown', (e) => {
		if (e.target !== el.drop || (e.key !== 'Enter' && e.key !== ' ')) return;
		e.preventDefault();
		el.file.click();
	});
	el.file.addEventListener('change', () => {
		useLocalFile(el.file.files[0]);
		el.file.value = '';
	});

	el.drop.addEventListener('dragenter', (e) => { if (hasFiles(e)) { e.preventDefault(); el.drop.classList.add('is-over'); } });
	el.drop.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
	el.drop.addEventListener('dragleave', (e) => { if (!el.drop.contains(e.relatedTarget)) el.drop.classList.remove('is-over'); });
	el.drop.addEventListener('drop', (e) => {
		e.preventDefault();
		el.drop.classList.remove('is-over');
		root.classList.remove('is-armed');
		if (!job) useLocalFile(e.dataTransfer.files[0]);
	});

	let depth = 0;
	const outsideModal = (e) => !(e.target instanceof Element && e.target.closest('.media-modal'));
	window.addEventListener('dragenter', (e) => {
		if (!hasFiles(e) || !outsideModal(e)) return;
		depth++;
		if (!job) root.classList.add('is-armed');
	});
	window.addEventListener('dragleave', () => {
		depth = Math.max(0, depth - 1);
		if (!depth) root.classList.remove('is-armed');
	});
	window.addEventListener('dragover', (e) => { if (hasFiles(e) && outsideModal(e)) e.preventDefault(); });
	window.addEventListener('drop', (e) => {
		depth = 0;
		root.classList.remove('is-armed');
		if (hasFiles(e) && outsideModal(e)) e.preventDefault();
	});

	let frame = null;
	el.pick.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (job) return;
		if (!wp.media) { el.file.click(); return; }
		if (!frame) {
			frame = wp.media({
				title: __('PDF für das Flipbook wählen', '3n15-flipbook'),
				library: { type: 'application/pdf' },
				button: { text: __('PDF verwenden', '3n15-flipbook') },
				multiple: false,
			});
			frame.on('select', () => {
				const a = frame.state().get('selection').first().toJSON();
				if (!isPdf(a.mime, a.url)) {
					showNotice('error', __('Bitte eine PDF-Datei wählen.', '3n15-flipbook'));
					return;
				}
				run({ url: a.url, name: a.filename || a.title, pdfId: a.id, title: a.title });
			});
		}
		frame.open();
	});
})(window.jQuery, window.wp, window.N15FB_ADMIN);
