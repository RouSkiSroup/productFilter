// ==UserScript==
// @name         Product Filter
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Filter Alza.cz products by discount code text, with bulk page loading and auto-scroll
// @author       Filip J.
// @match        https://www.alza.cz/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    // ─── Constants ───────────────────────────────────────────────────────────────
    const CURRENT_VERSION = '2.1';
    const RAW_URL = 'https://raw.githubusercontent.com/RouSkiSroup/productFilter/main/script.js';
    const STORAGE = {
        filterTerms:    'pf_filter_terms',
        filterEnabled:  'pf_filter_enabled',
        pages:          'pf_pages',
        delay:          'pf_delay',
        minimized:      'pf_minimized',
    };
    const COMMON_TERMS = ['alzadny50', 'alzadny40', 'alzadny30', 'alzadny25', 'alzadny20', 'alzadny15', 'alzadny10'];

    // ─── State ───────────────────────────────────────────────────────────────────
    let filterTexts     = [];
    let autoScrollMode  = 0;        // 0=off, 1=top, 2=latest
    let filteringEnabled = false;   // restored from localStorage on init
    let multiLoadPages  = 5;
    let loadDelay       = 2;        // seconds between page loads (1 / 2 / 3)
    let isMultiLoading  = false;
    let stopRequested   = false;
    let currentLoadedPages = 0;

    // ─── CSS ─────────────────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        #pf-bubble {
            position: fixed; bottom: 80px; right: 20px; z-index: 99999;
            width: 46px; height: 46px; border-radius: 50%;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #fff; font-size: 20px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; box-shadow: 0 4px 15px rgba(99,102,241,0.5);
            user-select: none; transition: background 0.3s, transform 0.2s, box-shadow 0.3s;
        }
        #pf-bubble:hover { transform: scale(1.1); }
        #pf-bubble.active {
            background: linear-gradient(135deg, #16a34a, #22c55e);
            box-shadow: 0 4px 15px rgba(34,197,94,0.5);
        }
        #pf-bubble-badge {
            position: absolute; top: -4px; right: -4px;
            background: #f59e0b; color: #000;
            font-size: 9px; font-weight: 700; line-height: 1;
            padding: 2px 4px; border-radius: 8px;
            display: none; white-space: nowrap;
        }
        #pf-bubble.active #pf-bubble-badge { display: block; }

        #pf-panel {
            position: fixed; bottom: 80px; right: 20px; z-index: 99999;
            width: 300px; border-radius: 16px;
            background: rgba(15, 15, 30, 0.92);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.12);
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px; color: #e2e8f0;
            padding: 16px;
            display: none;
        }

        #pf-panel .pf-header {
            font-weight: 700; font-size: 15px; margin-bottom: 4px;
            background: linear-gradient(90deg, #a5b4fc, #c4b5fd);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            cursor: default; user-select: none;
        }
        #pf-panel .pf-version {
            font-size: 10px; color: #475569; margin-bottom: 12px;
        }

        .pf-ctrl-btn {
            position: absolute; background: none; border: none;
            color: rgba(255,255,255,0.4); font-size: 15px; cursor: pointer;
            padding: 2px 5px; transition: color 0.15s;
        }
        .pf-ctrl-btn:hover { color: rgba(255,255,255,0.9); }

        #pf-toggle-filter {
            width: 100%; padding: 9px; border: none; border-radius: 10px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #fff; font-size: 13px; font-weight: 600;
            cursor: pointer; transition: background 0.25s, opacity 0.2s, transform 0.1s;
            letter-spacing: 0.3px; margin-bottom: 10px;
        }
        #pf-toggle-filter:hover { opacity: 0.9; transform: translateY(-1px); }
        #pf-toggle-filter.enabled {
            background: linear-gradient(135deg, #16a34a, #22c55e);
        }

        #pf-count {
            font-size: 11px; color: #94a3b8; text-align: center;
            margin-bottom: 8px; min-height: 15px; transition: color 0.2s;
        }
        #pf-count.has-results { color: #86efac; }
        #pf-count.no-results  { color: #fca5a5; }

        #pf-panel label.pf-label {
            display: block; color: #cbd5e1; font-size: 11px;
            text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
        }
        #pf-search {
            width: 100%; box-sizing: border-box;
            background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px; color: #f1f5f9; padding: 7px 10px;
            font-size: 13px; outline: none;
        }
        #pf-search:focus {
            border-color: #818cf8; box-shadow: 0 0 0 2px rgba(99,102,241,0.3);
        }
        #pf-search::placeholder { color: #64748b; }
        #pf-info {
            font-size: 11px; color: #64748b; margin: 5px 0 10px;
        }

        #pf-checkboxes {
            max-height: 180px; overflow-y: auto;
            background: rgba(255,255,255,0.04);
            border-radius: 8px; padding: 8px; margin-bottom: 10px;
            scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent;
        }
        .pf-cb-row {
            display: flex; align-items: center; gap: 7px;
            padding: 3px 4px; border-radius: 5px; cursor: pointer;
            transition: background 0.1s;
        }
        .pf-cb-row:hover { background: rgba(255,255,255,0.07); }
        .pf-cb-row input[type=checkbox] { accent-color: #6366f1; width: 13px; height: 13px; cursor: pointer; }
        .pf-cb-row span { font-size: 12px; color: #e2e8f0; }

        .pf-divider { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 10px 0; }

        .pf-btn-row { display: flex; gap: 6px; margin-bottom: 8px; }
        .pf-btn {
            flex: 1; padding: 7px 6px; border: none; border-radius: 8px;
            background: rgba(255,255,255,0.09); color: #cbd5e1;
            font-size: 11px; font-weight: 600; cursor: pointer;
            transition: background 0.15s, transform 0.1s; letter-spacing: 0.2px;
            text-align: center;
        }
        .pf-btn:hover:not(:disabled) { background: rgba(255,255,255,0.16); transform: translateY(-1px); }
        .pf-btn:active { transform: translateY(0); }
        .pf-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
        .pf-btn-primary {
            background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff;
        }
        .pf-btn-primary:hover:not(:disabled) { opacity: 0.9; }
        .pf-btn-primary:disabled { opacity: 0.35; }
        .pf-btn-danger {
            background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fff;
        }
        .pf-btn-danger:hover:not(:disabled) { opacity: 0.9; }

        #pf-scroll-status {
            font-size: 11px; color: #94a3b8;
            background: rgba(255,255,255,0.06); border-radius: 6px;
            padding: 4px 8px; margin-bottom: 8px; text-align: center;
        }

        .pf-multiload-row {
            display: flex; gap: 6px; align-items: center; margin-bottom: 4px;
        }
        .pf-multiload-row input[type=number] {
            width: 55px; padding: 6px 8px;
            background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px; color: #f1f5f9; font-size: 13px;
            outline: none; text-align: center;
        }
        .pf-multiload-row input[type=number]:focus { border-color: #818cf8; }

        .pf-delay-row {
            display: flex; align-items: center; gap: 6px;
            margin-bottom: 8px;
        }
        .pf-delay-row span {
            font-size: 11px; color: #64748b; white-space: nowrap;
        }
        .pf-delay-btn {
            padding: 3px 8px; border: 1px solid rgba(255,255,255,0.15);
            border-radius: 6px; background: rgba(255,255,255,0.06);
            color: #94a3b8; font-size: 11px; cursor: pointer;
            transition: background 0.15s, color 0.15s;
        }
        .pf-delay-btn:hover { background: rgba(255,255,255,0.14); color: #e2e8f0; }
        .pf-delay-btn.selected {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #fff; border-color: transparent;
        }

        #pf-load-status {
            font-size: 11px; color: #a5b4fc;
            min-height: 16px; text-align: center; margin-bottom: 8px;
        }

        @keyframes pf-spin { to { transform: rotate(360deg); } }
        .pf-spinner {
            display: inline-block; width: 12px; height: 12px;
            border: 2px solid rgba(255,255,255,0.15);
            border-top-color: #a5b4fc; border-radius: 50%;
            animation: pf-spin 0.7s linear infinite;
            vertical-align: middle; margin-right: 5px;
        }
    `;
    document.head.appendChild(style);

    // ─── Build UI ─────────────────────────────────────────────────────────────────
    const bubble = document.createElement('div');
    bubble.id = 'pf-bubble';
    bubble.title = 'Product Filter';
    bubble.innerHTML = '🔍<span id="pf-bubble-badge"></span>';
    document.body.appendChild(bubble);

    const panel = document.createElement('div');
    panel.id = 'pf-panel';
    panel.innerHTML = `
        <button class="pf-ctrl-btn" id="pf-minimize" style="top:12px; right:8px;" title="Minimise">−</button>

        <div class="pf-header">🔍 Product Filter</div>
        <div class="pf-version">v${CURRENT_VERSION}<span id="pf-update-link"></span></div>

        <button id="pf-toggle-filter">Enable Filtering</button>
        <div id="pf-count"></div>

        <label class="pf-label">Filter terms</label>
        <input id="pf-search" type="text" placeholder="alzadny50, alzadny40, …"/>
        <div id="pf-info">Separate terms with commas · updates live</div>

        <div id="pf-checkboxes"></div>

        <hr class="pf-divider"/>

        <div class="pf-btn-row">
            <button class="pf-btn" id="pf-load-one" title="Ctrl+L">📄 Load 1 Page</button>
            <button class="pf-btn" id="pf-toggle-scroll">↕ Scroll: Off</button>
        </div>
        <div id="pf-scroll-status">Click to cycle: Off → Top → Latest</div>

        <hr class="pf-divider"/>

        <div class="pf-multiload-row">
            <input type="number" id="pf-pages-input" min="1" max="20" title="Pages to load"/>
            <button class="pf-btn pf-btn-primary" id="pf-load-many" style="flex:1;">Load Pages</button>
            <button class="pf-btn pf-btn-primary" id="pf-load-filter" style="flex:1;">Load &amp; Filter</button>
        </div>

        <div class="pf-delay-row">
            <span>Delay:</span>
            <button class="pf-delay-btn" data-delay="1">1s</button>
            <button class="pf-delay-btn" data-delay="2">2s</button>
            <button class="pf-delay-btn" data-delay="3">3s</button>
        </div>

        <div id="pf-load-status"></div>
        <div class="pf-btn-row" id="pf-stop-row" style="display:none;">
            <button class="pf-btn pf-btn-danger" id="pf-stop">⏹ Stop Loading</button>
        </div>
    `;
    document.body.appendChild(panel);

    // ─── Element refs ─────────────────────────────────────────────────────────────
    const searchInput     = document.getElementById('pf-search');
    const checkboxesEl    = document.getElementById('pf-checkboxes');
    const scrollStatus    = document.getElementById('pf-scroll-status');
    const loadStatus      = document.getElementById('pf-load-status');
    const pagesInput      = document.getElementById('pf-pages-input');
    const toggleFilter    = document.getElementById('pf-toggle-filter');
    const loadOneBtn      = document.getElementById('pf-load-one');
    const loadManyBtn     = document.getElementById('pf-load-many');
    const loadFilterBtn   = document.getElementById('pf-load-filter');
    const toggleScrollBtn = document.getElementById('pf-toggle-scroll');
    const stopBtn         = document.getElementById('pf-stop');
    const stopRow         = document.getElementById('pf-stop-row');
    const countEl         = document.getElementById('pf-count');
    const bubbleBadge     = document.getElementById('pf-bubble-badge');

    // ─── Build checkboxes ────────────────────────────────────────────────────────
    COMMON_TERMS.forEach(term => {
        const row = document.createElement('label');
        row.className = 'pf-cb-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `pf-cb-${term}`;
        cb.value = term;
        cb.addEventListener('change', handleCheckboxChange);
        const span = document.createElement('span');
        span.textContent = term;
        row.appendChild(cb);
        row.appendChild(span);
        checkboxesEl.appendChild(row);
    });

    // ─── Persistence ─────────────────────────────────────────────────────────────
    function save(key, value) { localStorage.setItem(key, value); }

    function loadSavedState() {
        const savedTerms = localStorage.getItem(STORAGE.filterTerms);
        searchInput.value = savedTerms !== null ? savedTerms : 'alzadny50';

        multiLoadPages = parseInt(localStorage.getItem(STORAGE.pages) || '5', 10);
        pagesInput.value = multiLoadPages;

        loadDelay = parseInt(localStorage.getItem(STORAGE.delay) || '2', 10);
        renderDelayButtons();

        filteringEnabled = localStorage.getItem(STORAGE.filterEnabled) === '1';

        const minimized = localStorage.getItem(STORAGE.minimized);
        if (minimized === '0') {
            panel.style.display = 'block';
            bubble.style.display = 'none';
        }
    }

    function renderDelayButtons() {
        document.querySelectorAll('.pf-delay-btn').forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.delay) === loadDelay);
        });
    }

    // ─── Filter logic ─────────────────────────────────────────────────────────────
    function filterProductsByText() {
        const products = document.querySelectorAll('.box.browsingitem.js-box');
        const total = products.length;

        if (!filteringEnabled) {
            products.forEach(p => { p.style.display = ''; });
            updateCount(null, total);
            return;
        }

        if (filterTexts.length === 0) {
            products.forEach(p => { p.style.display = ''; });
            updateCount('empty', total);
            return;
        }

        let shown = 0;
        products.forEach(product => {
            const code = product.querySelector('.coupon-block__label--code')?.textContent || '';
            const match = filterTexts.some(t => code.toUpperCase().includes(t.toUpperCase()));
            product.style.display = match ? '' : 'none';
            if (match) shown++;
        });
        updateCount(shown, total);
    }

    function updateCount(shown, total) {
        if (!filteringEnabled || shown === null) {
            countEl.textContent = total > 0 ? `${total} products loaded` : '';
            countEl.className = '';
            return;
        }
        if (shown === 'empty') {
            countEl.textContent = `Enter a term to filter · ${total} products loaded`;
            countEl.className = '';
            return;
        }
        countEl.textContent = `${shown} / ${total} products shown`;
        countEl.className = shown === 0 ? 'no-results' : 'has-results';
    }

    function updateBubble() {
        const active = filteringEnabled && filterTexts.length > 0;
        bubble.classList.toggle('active', active);
        if (active) {
            const products = document.querySelectorAll('.box.browsingitem.js-box');
            const shown = Array.from(products).filter(p => p.style.display !== 'none').length;
            bubbleBadge.textContent = shown;
        }
    }

    function updateAndApplyFilter(value) {
        filterTexts = value.split(',').map(t => t.trim()).filter(t => t !== '');
        updateCheckboxes();
        save(STORAGE.filterTerms, value);
        filterProductsByText();
        updateBubble();
    }

    function updateCheckboxes() {
        COMMON_TERMS.forEach(term => {
            const cb = document.getElementById(`pf-cb-${term}`);
            if (cb) cb.checked = filterTexts.includes(term);
        });
    }

    function handleCheckboxChange(event) {
        const term = event.target.value;
        let current = searchInput.value.split(',').map(t => t.trim()).filter(t => t !== '');
        if (event.target.checked && !current.includes(term)) {
            current.push(term);
        } else if (!event.target.checked) {
            current = current.filter(t => t !== term);
        }
        searchInput.value = current.join(', ');
        updateAndApplyFilter(searchInput.value);
    }

    function updateFilterToggle() {
        toggleFilter.textContent = filteringEnabled ? 'Disable Filtering' : 'Enable Filtering';
        toggleFilter.classList.toggle('enabled', filteringEnabled);
    }

    // ─── Scroll logic ─────────────────────────────────────────────────────────────
    const SCROLL_STATES = [
        { label: 'Scroll: Off',    next: '→ Top of List' },
        { label: 'Scroll: Top',    next: '→ Latest Product' },
        { label: 'Scroll: Latest', next: '→ Off' },
    ];

    function updateScrollUI() {
        const state = SCROLL_STATES[autoScrollMode];
        toggleScrollBtn.textContent = `↕ ${state.label}`;
        scrollStatus.textContent = `Click: ${state.next}`;
        toggleScrollBtn.classList.toggle('pf-btn-primary', autoScrollMode !== 0);
    }

    function scrollToProductList() {
        document.getElementById('ui-id-1')?.scrollIntoView({ behavior: 'instant' });
    }

    function scrollToLatestVisibleProduct() {
        const visible = Array.from(document.querySelectorAll('.box.browsingitem.js-box'))
            .filter(p => p.style.display !== 'none');
        visible[visible.length - 1]?.scrollIntoView({ behavior: 'instant' });
    }

    setInterval(() => {
        if (autoScrollMode === 1) scrollToProductList();
        else if (autoScrollMode === 2) scrollToLatestVisibleProduct();
    }, 1000);

    // ─── Load logic ───────────────────────────────────────────────────────────────
    function clickLoadMoreButton() {
        document.querySelector('.js-button-more.button-more')?.click();
    }

    async function runMultiLoad(filterAfter) {
        if (isMultiLoading) return;
        isMultiLoading = true;
        stopRequested = false;
        currentLoadedPages = 0;

        loadManyBtn.disabled = true;
        loadFilterBtn.disabled = true;
        loadManyBtn.innerHTML = `<span class="pf-spinner"></span>Loading…`;
        loadFilterBtn.innerHTML = `<span class="pf-spinner"></span>Loading…`;
        stopRow.style.display = 'flex';
        loadStatus.textContent = `Loading: 0 / ${multiLoadPages}`;

        for (let i = 0; i < multiLoadPages; i++) {
            if (stopRequested) break;
            await new Promise(resolve => {
                clickLoadMoreButton();
                setTimeout(resolve, loadDelay * 1000);
            });
            if (!stopRequested) {
                currentLoadedPages++;
                loadStatus.textContent = `Loading: ${currentLoadedPages} / ${multiLoadPages}`;
            }
        }

        isMultiLoading = false;
        stopRequested = false;
        loadManyBtn.disabled = false;
        loadFilterBtn.disabled = false;
        loadManyBtn.textContent = 'Load Pages';
        loadFilterBtn.textContent = 'Load & Filter';
        stopRow.style.display = 'none';

        const stopped = currentLoadedPages < multiLoadPages;
        loadStatus.textContent = stopped
            ? `⏹ Stopped after ${currentLoadedPages} pages`
            : `✓ Loaded ${currentLoadedPages} pages`;
        setTimeout(() => { loadStatus.textContent = ''; }, 3000);

        if (filterAfter) {
            if (!filteringEnabled) {
                filteringEnabled = true;
                save(STORAGE.filterEnabled, '1');
                updateFilterToggle();
            }
            filterProductsByText();
            updateBubble();
        }
    }

    function disableAutoLoadOnScroll() {
        window.addEventListener('scroll', e => {
            e.stopPropagation();
            e.preventDefault();
        }, true);
    }

    // ─── Auto-update check ────────────────────────────────────────────────────────
    function checkForUpdate() {
        if (typeof GM_xmlhttpRequest === 'undefined') return;
        GM_xmlhttpRequest({
            method: 'GET',
            url: RAW_URL + '?t=' + Date.now(),
            onload(resp) {
                if (resp.status !== 200) return;
                const match = resp.responseText.match(/@version\s+([\d.]+)/);
                if (!match) return;
                const latest = match[1];
                if (latest === CURRENT_VERSION) return;
                const el = document.getElementById('pf-update-link');
                if (!el) return;
                const a = document.createElement('a');
                a.href = RAW_URL;
                a.target = '_blank';
                a.rel = 'noopener';
                a.style.cssText = 'color:#f59e0b; text-decoration:none; font-weight:600;';
                a.textContent = `↑ v${latest} available`;
                a.addEventListener('click', () => {
                    setTimeout(() => {
                        const el2 = document.getElementById('pf-update-link');
                        if (el2) el2.innerHTML = ' · <span style="color:#94a3b8;">↻ Reload to apply</span>';
                    }, 500);
                });
                el.innerHTML = ' · ';
                el.appendChild(a);
            },
            onerror() {},
        });
    }

    // ─── MutationObserver ─────────────────────────────────────────────────────────
    // #13: fall back to document.body if #boxes doesn't exist on this page variant
    const observerTarget = document.querySelector('#boxes') || document.body;
    new MutationObserver(mutations => {
        if (mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0)) {
            filterProductsByText();
            updateBubble();
        }
    }).observe(observerTarget, { childList: true, subtree: true });

    // ─── Event listeners ──────────────────────────────────────────────────────────
    bubble.addEventListener('click', () => {
        panel.style.display = 'block';
        bubble.style.display = 'none';
        save(STORAGE.minimized, '0');
    });

    document.getElementById('pf-minimize').addEventListener('click', () => {
        panel.style.display = 'none';
        bubble.style.display = 'flex';
        save(STORAGE.minimized, '1');
    });

    // #1/#2: enable filtering when terms are typed (auto-enable on first input if disabled)
    searchInput.addEventListener('input', () => {
        if (!filteringEnabled && searchInput.value.trim() !== '') {
            filteringEnabled = true;
            save(STORAGE.filterEnabled, '1');
            updateFilterToggle();
        }
        updateAndApplyFilter(searchInput.value);
    });
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') updateAndApplyFilter(searchInput.value);
    });

    pagesInput.addEventListener('change', () => {
        multiLoadPages = parseInt(pagesInput.value, 10) || 5;
        pagesInput.value = multiLoadPages;
        save(STORAGE.pages, multiLoadPages);
    });

    document.querySelectorAll('.pf-delay-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            loadDelay = parseInt(btn.dataset.delay, 10);
            save(STORAGE.delay, loadDelay);
            renderDelayButtons();
        });
    });

    loadOneBtn.addEventListener('click', clickLoadMoreButton);
    loadManyBtn.addEventListener('click', () => runMultiLoad(false));
    loadFilterBtn.addEventListener('click', () => runMultiLoad(true));
    stopBtn.addEventListener('click', () => { stopRequested = true; });

    // #3: scroll button shows current state and previews next
    toggleScrollBtn.addEventListener('click', () => {
        autoScrollMode = (autoScrollMode + 1) % 3;
        updateScrollUI();
    });

    toggleFilter.addEventListener('click', () => {
        filteringEnabled = !filteringEnabled;
        save(STORAGE.filterEnabled, filteringEnabled ? '1' : '0');
        updateFilterToggle();
        filterProductsByText();
        updateBubble();
    });

    // #4: Ctrl shortcut only fires when not in a text input field; Shift removed
    document.addEventListener('keydown', e => {
        const tag = document.activeElement?.tagName;
        const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
            || document.activeElement?.isContentEditable;
        if (e.key === 'Control' && !isTyping && !e.shiftKey && !e.altKey && !e.metaKey) {
            clickLoadMoreButton();
        }
    });

    // ─── Init ─────────────────────────────────────────────────────────────────────
    function init() {
        loadSavedState();
        updateFilterToggle();
        updateScrollUI();
        updateAndApplyFilter(searchInput.value);
        disableAutoLoadOnScroll();
        setTimeout(checkForUpdate, 3000);
    }

    setTimeout(init, 1000);
})();
