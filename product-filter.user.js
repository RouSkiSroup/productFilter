// ==UserScript==
// @name         Product Filter
// @namespace    http://tampermonkey.net/
// @version      2.3.1
// @description  Filter Alza.cz products by discount code text, with bulk page loading, auto-scroll, and effective coupon price sorting
// @author       Filip J. & Gemini
// @match        https://www.alza.cz/*
// @updateURL    https://raw.githubusercontent.com/RouSkiSroup/productFilter/main/product-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/RouSkiSroup/productFilter/main/product-filter.user.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    // ─── Constants ───────────────────────────────────────────────────────────────
    const CURRENT_VERSION = '2.3.1';
    const RAW_URL = 'https://raw.githubusercontent.com/RouSkiSroup/productFilter/main/product-filter.user.js';
    const STORAGE = {
        filterTerms:   'pf_filter_terms',
        filterEnabled: 'pf_filter_enabled',
        pages:         'pf_pages',
        delay:         'pf_delay',
        minimized:     'pf_minimized',
        sortMode:      'pf_sort_mode',
    };
    const COMMON_TERMS = ['alzadny50', 'alzadny40', 'alzadny30', 'alzadny25', 'alzadny20', 'alzadny15', 'alzadny10'];

    // ─── State ───────────────────────────────────────────────────────────────────
    let filterTexts      = [];
    let autoScrollMode   = 0;       // 0=off, 1=top, 2=latest
    let currentSortMode  = 0;       // 0=off/default, 1=cheapest first, 2=expensive first
    let filteringEnabled = false;
    let multiLoadPages   = 5;
    let loadDelay        = 2;
    let isMultiLoading   = false;
    let stopRequested    = false;
    let currentLoadedPages = 0;
    let isSorting        = false;

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
            display: none; user-select: none;
        }

        /* ── Draggable header ── */
        #pf-drag-handle {
            padding: 14px 16px 10px;
            cursor: grab; display: flex; align-items: baseline; gap: 8px;
        }
        #pf-drag-handle:active { cursor: grabbing; }
        #pf-panel .pf-header {
            font-weight: 700; font-size: 15px;
            background: linear-gradient(90deg, #a5b4fc, #c4b5fd);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            pointer-events: none;
        }
        #pf-panel .pf-version {
            font-size: 10px; color: #475569; pointer-events: auto;
        }
        .pf-ctrl-btn {
            position: absolute; top: 10px; background: none; border: none;
            color: rgba(255,255,255,0.4); font-size: 15px; cursor: pointer;
            padding: 2px 6px; transition: color 0.15s; z-index: 1;
        }
        .pf-ctrl-btn:hover { color: rgba(255,255,255,0.9); }
        #pf-minimize { right: 8px; }

        /* ── Body ── */
        #pf-body { padding: 0 16px 16px; }

        /* ── Filter toggle ── */
        #pf-toggle-filter {
            width: 100%; padding: 9px; border: none; border-radius: 10px;
            font-size: 13px; font-weight: 700; letter-spacing: 0.4px;
            cursor: pointer; transition: background 0.25s, transform 0.1s;
            margin-bottom: 6px;
            background: linear-gradient(135deg, #dc2626, #b91c1c);
            color: #fff;
        }
        #pf-toggle-filter:hover { transform: translateY(-1px); opacity: 0.92; }
        #pf-toggle-filter.enabled {
            background: linear-gradient(135deg, #16a34a, #22c55e);
        }

        /* ── Count ── */
        #pf-count {
            font-size: 11px; color: #94a3b8; text-align: center;
            margin-bottom: 10px; min-height: 15px; transition: color 0.2s;
        }
        #pf-count.has-results { color: #86efac; }
        #pf-count.no-results  { color: #fca5a5; }

        /* ── Filter section (hidden when filter off) ── */
        #pf-filter-section {
            border-top: 1px solid rgba(255,255,255,0.08);
            padding-top: 10px; margin-bottom: 4px;
        }
        label.pf-label {
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
        #pf-info { font-size: 11px; color: #64748b; margin: 4px 0 8px; }
        #pf-checkboxes {
            max-height: 175px; overflow-y: auto;
            background: rgba(255,255,255,0.04);
            border-radius: 8px; padding: 8px; margin-bottom: 4px;
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

        /* ── Divider ── */
        .pf-divider { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 10px 0; }

        /* ── Buttons ── */
        .pf-btn {
            padding: 7px 8px; border: none; border-radius: 8px;
            background: rgba(255,255,255,0.09); color: #cbd5e1;
            font-size: 11px; font-weight: 600; cursor: pointer;
            transition: background 0.15s, transform 0.1s; letter-spacing: 0.2px;
            white-space: nowrap;
        }
        .pf-btn:hover:not(:disabled) { background: rgba(255,255,255,0.16); transform: translateY(-1px); }
        .pf-btn:active { transform: translateY(0); }
        .pf-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
        .pf-btn-primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; }
        .pf-btn-primary:hover:not(:disabled) { opacity: 0.9; background: linear-gradient(135deg, #6366f1, #8b5cf6); }
        .pf-btn-danger  { background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fff; }
        .pf-btn-danger:hover:not(:disabled) { opacity: 0.9; }
        .pf-btn-active  { background: linear-gradient(135deg, #6366f1, #8b5cf6) !important; color: #fff !important; }

        /* ── Load 1 page ── */
        #pf-load-one { width: 100%; margin-bottom: 6px; }

        /* ── Scroll button ── */
        #pf-toggle-scroll { width: 100%; margin-bottom: 6px; }

        /* ── Sort button ── */
        #pf-toggle-sort { width: 100%; margin-bottom: 6px; }

        /* ── Multi-load row ── */
        .pf-multiload-row {
            display: flex; gap: 6px; align-items: center; margin-bottom: 4px;
        }
        #pf-pages-input {
            width: 52px; padding: 6px 6px;
            background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px; color: #f1f5f9; font-size: 13px;
            outline: none; text-align: center; flex-shrink: 0;
        }
        #pf-pages-input:focus { border-color: #818cf8; }

        /* ── Delay row ── */
        .pf-delay-row { display: flex; align-items: center; gap: 5px; margin-bottom: 8px; }
        .pf-delay-row span { font-size: 11px; color: #64748b; white-space: nowrap; }
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

        /* ── Load status ── */
        #pf-load-status {
            font-size: 11px; color: #a5b4fc;
            min-height: 16px; text-align: center; margin-bottom: 6px;
        }
        #pf-stop-row { display: none; margin-bottom: 4px; }
        #pf-stop { width: 100%; }

        /* ── Update banner ── */
        #pf-update-banner {
            display: none; width: 100%; box-sizing: border-box;
            margin-bottom: 10px; padding: 8px 12px;
            background: linear-gradient(135deg, #92400e, #b45309);
            border: 1px solid #f59e0b;
            border-radius: 10px; cursor: pointer;
            font-size: 12px; font-weight: 700; color: #fef3c7;
            letter-spacing: 0.3px; text-align: center;
            transition: opacity 0.15s, transform 0.1s;
            animation: pf-pulse 2s ease-in-out infinite;
        }
        #pf-update-banner:hover { opacity: 0.9; transform: translateY(-1px); }
        #pf-update-banner.applied {
            background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.15);
            color: #94a3b8; font-weight: 400; animation: none; cursor: default;
        }
        @keyframes pf-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.0); }
            50%       { box-shadow: 0 0 0 4px rgba(245,158,11,0.3); }
        }

        /* ── Spinner ── */
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
        <button class="pf-ctrl-btn" id="pf-minimize" title="Minimise">−</button>

        <div id="pf-drag-handle">
            <span class="pf-header">🔍 Product Filter</span>
            <span class="pf-version">v${CURRENT_VERSION}</span>
        </div>

        <div id="pf-body">
            <button id="pf-update-banner"></button>
            <button id="pf-toggle-filter">● Filtering OFF</button>
            <div id="pf-count"></div>

            <div id="pf-filter-section">
                <label class="pf-label">Filter terms</label>
                <input id="pf-search" type="text" placeholder="alzadny50, alzadny40, …"/>
                <div id="pf-info">Separate terms with commas · updates live</div>
                <div id="pf-checkboxes"></div>
            </div>

            <div id="pf-load-section">
                <hr class="pf-divider"/>

                <button class="pf-btn" id="pf-load-one">📄 Load 1 Page &nbsp;<span style="color:#475569;font-weight:400;">(Ctrl)</span></button>
                <button class="pf-btn" id="pf-toggle-scroll">↕ Scroll: Off</button>
                <button class="pf-btn" id="pf-toggle-sort">⚖ Sort: Default</button>

                <hr class="pf-divider"/>

                <div class="pf-multiload-row">
                    <input type="number" id="pf-pages-input" min="1" max="20" title="Pages to load"/>
                    <button class="pf-btn pf-btn-primary" id="pf-load-many" style="flex:1;">Load Multiple Pages</button>
                </div>

                <div class="pf-delay-row">
                    <span>Delay per page:</span>
                    <button class="pf-delay-btn" data-delay="1">1s</button>
                    <button class="pf-delay-btn" data-delay="2">2s</button>
                    <button class="pf-delay-btn" data-delay="3">3s</button>
                </div>

                <div id="pf-load-status"></div>
                <div id="pf-stop-row">
                    <button class="pf-btn pf-btn-danger" id="pf-stop">⏹ Stop Loading</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // ─── Element refs ─────────────────────────────────────────────────────────────
    const searchInput      = document.getElementById('pf-search');
    const checkboxesEl     = document.getElementById('pf-checkboxes');
    const filterSection    = document.getElementById('pf-filter-section');
    const loadSection      = document.getElementById('pf-load-section');
    const loadStatus       = document.getElementById('pf-load-status');
    const pagesInput       = document.getElementById('pf-pages-input');
    const toggleFilter     = document.getElementById('pf-toggle-filter');
    const loadOneBtn       = document.getElementById('pf-load-one');
    const loadManyBtn      = document.getElementById('pf-load-many');
    const toggleScrollBtn  = document.getElementById('pf-toggle-scroll');
    const toggleSortBtn    = document.getElementById('pf-toggle-sort');
    const stopBtn          = document.getElementById('pf-stop');
    const stopRow          = document.getElementById('pf-stop-row');
    const countEl          = document.getElementById('pf-count');
    const bubbleBadge      = document.getElementById('pf-bubble-badge');

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

    // ─── Draggable panel + bubble ────────────────────────────────────────────────
    function makeDraggable(el, handle) {
        let dragging = false, ox = 0, oy = 0, didMove = false;

        handle.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            dragging = true;
            didMove = false;
            const rect = el.getBoundingClientRect();
            ox = e.clientX - rect.left;
            oy = e.clientY - rect.top;
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            didMove = true;
            const x = e.clientX - ox;
            const y = e.clientY - oy;
            el.style.right  = 'auto';
            el.style.bottom = 'auto';
            el.style.left   = Math.max(0, Math.min(x, window.innerWidth  - el.offsetWidth))  + 'px';
            el.style.top    = Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight)) + 'px';
        });

        document.addEventListener('mouseup', e => {
            if (dragging && didMove) e.stopImmediatePropagation();
            dragging = false;
        });

        handle.addEventListener('click', e => {
            if (didMove) { e.stopImmediatePropagation(); didMove = false; }
        }, true);
    }

    makeDraggable(panel, document.getElementById('pf-drag-handle'));
    makeDraggable(bubble, bubble);

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

        currentSortMode = parseInt(localStorage.getItem(STORAGE.sortMode) || '0', 10);

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
            countEl.textContent = `Enter a term to filter · ${total} loaded`;
            countEl.className = '';
            return;
        }
        countEl.textContent = `${shown} / ${total} products shown`;
        countEl.className = shown === 0 ? 'no-results' : 'has-results';
    }

    function updateBubble() {
        const isFilterActive = filteringEnabled && filterTexts.length > 0;
        const isSortActive = currentSortMode !== 0;
        const active = isFilterActive || isSortActive;

        bubble.classList.toggle('active', active);
        if (active) {
            const shown = Array.from(document.querySelectorAll('.box.browsingitem.js-box'))
                .filter(p => p.style.display !== 'none').length;
            bubbleBadge.textContent = shown;
        }
    }

    function updateAndApplyFilter(value) {
        filterTexts = value.split(',').map(t => t.trim()).filter(t => t !== '');
        updateCheckboxes();
        save(STORAGE.filterTerms, value);
        filterProductsByText();
        applyPriceSort();
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
        if (filteringEnabled) {
            toggleFilter.textContent = '● Filtering ON';
            toggleFilter.classList.add('enabled');
            filterSection.style.display = 'block';
        } else {
            toggleFilter.textContent = '● Filtering OFF';
            toggleFilter.classList.remove('enabled');
            filterSection.style.display = 'none';
        }
    }

    // ─── Sort logic ───────────────────────────────────────────────────────────────
    const SORT_LABELS = ['⚖ Sort: Default', '⚖ Sort: Cheapest First', '⚖ Sort: Expensive First'];

    function updateSortUI() {
        toggleSortBtn.textContent = SORT_LABELS[currentSortMode];
        toggleSortBtn.classList.toggle('pf-btn-active', currentSortMode !== 0);
    }

    function applyPriceSort() {
        if (currentSortMode === 0 || isSorting) return;
        const container = document.getElementById('boxes');
        if (!container) return;

        isSorting = true;
        const products = Array.from(container.querySelectorAll('.box.browsingitem.js-box'));

        const getEffectivePrice = (el) => {
            // Priority 1: Use specific coupon / "Alza Dny" special box price
            const couponPriceEl = el.querySelector('.coupon-block__price');
            if (couponPriceEl) {
                const val = parseFloat(couponPriceEl.textContent.replace(/[^0-9]/g, ''));
                if (!isNaN(val)) return val;
            }
            // Priority 2: Fall back to standard price listed on the page
            const mainPriceEl = el.querySelector('.js-price-box__primary-price__value');
            if (mainPriceEl) {
                const val = parseFloat(mainPriceEl.textContent.replace(/[^0-9]/g, ''));
                if (!isNaN(val)) return val;
            }
            return 0;
        };

        products.sort((a, b) => {
            const priceA = getEffectivePrice(a);
            const priceB = getEffectivePrice(b);
            return currentSortMode === 1 ? priceA - priceB : priceB - priceA;
        });

        // Appending nodes that already exist dynamically updates their DOM positions
        products.forEach(p => container.appendChild(p));

        setTimeout(() => { isSorting = false; }, 50);
    }

    // ─── Scroll logic ─────────────────────────────────────────────────────────────
    const SCROLL_LABELS = ['↕ Scroll: Off', '↕ Scroll: Top of List', '↕ Scroll: Latest Product'];

    function updateScrollUI() {
        toggleScrollBtn.textContent = SCROLL_LABELS[autoScrollMode];
        toggleScrollBtn.classList.toggle('pf-btn-active', autoScrollMode !== 0);
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
    }, 2000);

    // ─── Load logic ───────────────────────────────────────────────────────────────
    function clickLoadMoreButton() {
        document.querySelector('.js-button-more.button-more')?.click();
    }

    async function runMultiLoad() {
        if (isMultiLoading) return;
        isMultiLoading = true;
        stopRequested = false;
        currentLoadedPages = 0;

        loadManyBtn.disabled = true;
        loadManyBtn.innerHTML = `<span class="pf-spinner"></span>Loading…`;
        stopRow.style.display = 'block';
        loadStatus.textContent = `Loading: 0 / ${multiLoadPages}`;

        for (let i = 0; i < multiLoadPages; i++) {
            if (stopRequested) break;
            clickLoadMoreButton();
            await new Promise(resolve => setTimeout(resolve, loadDelay * 1000));
            if (!stopRequested) {
                currentLoadedPages++;
                loadStatus.textContent = `Loading: ${currentLoadedPages} / ${multiLoadPages}`;
            }
        }

        isMultiLoading = false;
        loadManyBtn.disabled = false;
        loadManyBtn.textContent = 'Load Multiple Pages';
        stopRow.style.display = 'none';

        const stopped = currentLoadedPages < multiLoadPages;
        loadStatus.textContent = stopped
            ? `⏹ Stopped after ${currentLoadedPages} pages`
            : `✓ Loaded ${currentLoadedPages} pages`;
        setTimeout(() => { loadStatus.textContent = ''; }, 3000);

        filterProductsByText();
        applyPriceSort();
        updateBubble();
    }

    // ─── Auto-update check ────────────────────────────────────────────────────────
    function isNewerVersion(remote, local) {
        const r = remote.split('.').map(Number);
        const l = local.split('.').map(Number);
        const len = Math.max(r.length, l.length);
        for (let i = 0; i < len; i++) {
            const rv = r[i] ?? 0;
            const lv = l[i] ?? 0;
            if (rv > lv) return true;
            if (rv < lv) return false;
        }
        return false;
    }

    // ─── MutationObserver ─────────────────────────────────────────────────────────
    const observerTarget = document.querySelector('#boxes');
    if (observerTarget) {
        let debounceTimer = null;
        new MutationObserver(() => {
            if (isSorting) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                filterProductsByText();
                applyPriceSort();
                updateBubble();
            }, 200);
        }).observe(observerTarget, { childList: true, subtree: true });
    }

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

    searchInput.addEventListener('input', () => updateAndApplyFilter(searchInput.value));
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
    loadManyBtn.addEventListener('click', runMultiLoad);
    stopBtn.addEventListener('click', () => { stopRequested = true; });

    toggleScrollBtn.addEventListener('click', () => {
        autoScrollMode = (autoScrollMode + 1) % 3;
        updateScrollUI();
    });

    toggleSortBtn.addEventListener('click', () => {
        currentSortMode = (currentSortMode + 1) % 3;
        save(STORAGE.sortMode, currentSortMode);
        updateSortUI();
        applyPriceSort();
    });

    toggleFilter.addEventListener('click', () => {
        filteringEnabled = !filteringEnabled;
        save(STORAGE.filterEnabled, filteringEnabled ? '1' : '0');
        updateFilterToggle();
        filterProductsByText();
        applyPriceSort();
        updateBubble();
    });

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
        updateSortUI();
        updateAndApplyFilter(searchInput.value);
        if (currentSortMode !== 0) applyPriceSort();
    }

    setTimeout(init, 1000);
})();
