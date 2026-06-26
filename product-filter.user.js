// ==UserScript==
// @name         Product Filter
// @namespace    http://tampermonkey.net/
// @version      2.5.0
// @description  Filter Alza.cz products by minimum coupon/benefit/AlzaPlus+ discount %, with bulk page loading, auto-scroll, and effective coupon price sorting
// @author       Filip J. & Tomi
// @match        https://www.alza.cz/*
// @updateURL    https://raw.githubusercontent.com/RouSkiSroup/productFilter/main/product-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/RouSkiSroup/productFilter/main/product-filter.user.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    // ─── Constants ───────────────────────────────────────────────────────────────
    const CURRENT_VERSION = '2.5.0';
    const RAW_URL = 'https://raw.githubusercontent.com/RouSkiSroup/productFilter/main/product-filter.user.js';
    const STORAGE = {
        minDiscount:   'pf_min_discount',
        filterEnabled: 'pf_filter_enabled',
        pages:         'pf_pages',
        minimized:     'pf_minimized',
        sortMode:      'pf_sort_mode',
    };
    const DISCOUNT_PRESETS = [0, 10, 20, 30, 40, 50];  // 0 = "Any coupon"

    // ─── State ───────────────────────────────────────────────────────────────────
    let minDiscount      = 0;       // minimum coupon discount %; 0 = any coupon
    let autoScrollMode   = 0;       // 0=off, 1=top, 2=latest
    let currentSortMode  = 0;       // 0=off/default, 1=cheapest first, 2=expensive first
    let filteringEnabled = false;
    let multiLoadPages   = 5;
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
            text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;
        }
        #pf-discount-presets {
            display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px;
        }
        .pf-discount-btn {
            flex: 1 1 auto; min-width: 38px;
            padding: 6px 4px; border: 1px solid rgba(255,255,255,0.15);
            border-radius: 6px; background: rgba(255,255,255,0.06);
            color: #94a3b8; font-size: 11px; font-weight: 600; cursor: pointer;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
            white-space: nowrap;
        }
        .pf-discount-btn:hover { background: rgba(255,255,255,0.14); color: #e2e8f0; }
        .pf-discount-btn.selected {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #fff; border-color: transparent;
        }

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
                <label class="pf-label">Minimum coupon discount</label>
                <div id="pf-discount-presets"></div>
            </div>

            <div id="pf-load-section">
                <hr class="pf-divider"/>

                <button class="pf-btn" id="pf-load-one">📄 Load 1 Page &nbsp;<span style="color:#475569;font-weight:400;">(Ctrl)</span></button>
                <button class="pf-btn" id="pf-toggle-scroll">↕ Scroll: Off</button>
                <button class="pf-btn" id="pf-toggle-sort">⚖ Sort: Default</button>

                <hr class="pf-divider"/>

                <div class="pf-multiload-row">
                    <input type="number" id="pf-pages-input" min="0" max="200" title="Pages to load (0 = all)"/>
                    <button class="pf-btn pf-btn-primary" id="pf-load-many" style="flex:1;">Load Multiple Pages</button>
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
    const presetsEl        = document.getElementById('pf-discount-presets');
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

    // ─── Build discount preset buttons ───────────────────────────────────────────
    DISCOUNT_PRESETS.forEach(value => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pf-discount-btn';
        btn.dataset.discount = String(value);
        btn.textContent = value === 0 ? 'Any coupon' : `≥ ${value}%`;
        btn.addEventListener('click', () => {
            minDiscount = value;
            save(STORAGE.minDiscount, minDiscount);
            renderDiscountPresets();
            applyFilter();
            applyPriceSort();
            updateBubble();
        });
        presetsEl.appendChild(btn);
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

        // Return whether the last mouseup was a drag (suppress click)
        handle.addEventListener('click', e => {
            if (didMove) { e.stopImmediatePropagation(); didMove = false; }
        }, true);
    }

    makeDraggable(panel, document.getElementById('pf-drag-handle'));
    makeDraggable(bubble, bubble);

    // ─── Persistence ─────────────────────────────────────────────────────────────
    function save(key, value) { localStorage.setItem(key, value); }

    function loadSavedState() {
        minDiscount = parseInt(localStorage.getItem(STORAGE.minDiscount) || '0', 10);
        if (!DISCOUNT_PRESETS.includes(minDiscount)) minDiscount = 0;
        renderDiscountPresets();

        multiLoadPages = parseInt(localStorage.getItem(STORAGE.pages) || '5', 10);
        if (!Number.isFinite(multiLoadPages) || multiLoadPages < 0) multiLoadPages = 5;
        pagesInput.value = multiLoadPages;
        updateLoadManyLabel();

        filteringEnabled = localStorage.getItem(STORAGE.filterEnabled) === '1';

        currentSortMode = parseInt(localStorage.getItem(STORAGE.sortMode) || '0', 10);

        const minimized = localStorage.getItem(STORAGE.minimized);
        if (minimized === '0') {
            panel.style.display = 'block';
            bubble.style.display = 'none';
        }
    }

    function renderDiscountPresets() {
        document.querySelectorAll('.pf-discount-btn').forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.discount, 10) === minDiscount);
        });
    }

    function updateLoadManyLabel() {
        loadManyBtn.textContent = multiLoadPages === 0 ? 'Load All Pages' : 'Load Multiple Pages';
    }

    // ─── Filter logic ─────────────────────────────────────────────────────────────
    // Parse a Czech-formatted price string ("1 090,-" or "594,-") into a number.
    function parsePrice(text) {
        if (!text) return NaN;
        const digits = text.replace(/[^\d]/g, '');
        return digits ? parseInt(digits, 10) : NaN;
    }

    // Returns the best available discount % for a product card, or null if none.
    // Handles three price box types:
    //   1. Coupon block  (.coupon-block__price vs .js-price-box__primary-price__value)
    //   2. Benefit       (.ads-pb--benefit)
    //   3. AlzaPlus+     (.ads-pb--alza-plus)
    // For types 2 & 3 the discounted price is in .ads-pb__price-value and the
    // original is in .ads-pb__original-price (text like "Bez členství: 576,-").
    function getCouponDiscount(product) {
        // Type 1: classic coupon block
        const couponPrice = parsePrice(product.querySelector('.coupon-block__price')?.textContent);
        const mainPrice   = parsePrice(product.querySelector('.js-price-box__primary-price__value')?.textContent);
        if (isFinite(couponPrice) && isFinite(mainPrice) && mainPrice > 0 && couponPrice < mainPrice) {
            return Math.round((mainPrice - couponPrice) / mainPrice * 100);
        }

        // Type 2 & 3: Benefit / AlzaPlus+ price box
        const priceBox = product.querySelector('.ads-pb--benefit, .ads-pb--alza-plus');
        if (priceBox) {
            const discounted = parsePrice(priceBox.querySelector('.ads-pb__price-value')?.textContent);
            const original   = parsePrice(priceBox.querySelector('.ads-pb__original-price')?.textContent);
            if (isFinite(discounted) && isFinite(original) && original > 0 && discounted < original) {
                return Math.round((original - discounted) / original * 100);
            }
        }

        return null;
    }

    function applyFilter() {
        const products = document.querySelectorAll('.box.browsingitem.js-box');
        const total = products.length;

        if (!filteringEnabled) {
            products.forEach(p => { p.style.display = ''; });
            updateCount(null, total);
            return;
        }

        let shown = 0;
        products.forEach(product => {
            const discount = getCouponDiscount(product);
            const match = discount !== null && discount >= minDiscount;
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
        countEl.textContent = `${shown} / ${total} products shown`;
        countEl.className = shown === 0 ? 'no-results' : 'has-results';
    }

    function updateBubble() {
        const isSortActive = currentSortMode !== 0;
        const active = filteringEnabled || isSortActive;

        bubble.classList.toggle('active', active);
        if (active) {
            const shown = Array.from(document.querySelectorAll('.box.browsingitem.js-box'))
                .filter(p => p.style.display !== 'none').length;
            bubbleBadge.textContent = shown;
        }
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
            // Priority 1: classic coupon block price
            const couponPriceEl = el.querySelector('.coupon-block__price');
            if (couponPriceEl) {
                const val = parsePrice(couponPriceEl.textContent);
                if (!isNaN(val)) return val;
            }
            // Priority 2: Benefit or AlzaPlus+ discounted price
            const priceBox = el.querySelector('.ads-pb--benefit, .ads-pb--alza-plus');
            if (priceBox) {
                const val = parsePrice(priceBox.querySelector('.ads-pb__price-value')?.textContent);
                if (!isNaN(val)) return val;
            }
            // Priority 3: fall back to standard listed price
            const mainPriceEl = el.querySelector('.js-price-box__primary-price__value');
            if (mainPriceEl) {
                const val = parsePrice(mainPriceEl.textContent);
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

    // Only scroll when user has explicitly enabled a scroll mode — use a longer
    // interval so it doesn't fight user interaction.
    setInterval(() => {
        if (autoScrollMode === 1) scrollToProductList();
        else if (autoScrollMode === 2) scrollToLatestVisibleProduct();
    }, 2000);

    // ─── Load logic ───────────────────────────────────────────────────────────────
    const PRODUCT_SELECTOR = '.box.browsingitem.js-box';
    const LOAD_MORE_SELECTOR = '.js-button-more.button-more';
    const WAIT_FOR_PRODUCTS_MS = 5000;

    function clickLoadMoreButton() {
        document.querySelector(LOAD_MORE_SELECTOR)?.click();
    }

    // True when there's no more content to load — either the pager has reached
    // its last page, or the "load more" button is gone from the DOM.
    function isAtLastPage() {
        const btn = document.querySelector(LOAD_MORE_SELECTOR);
        if (!btn || btn.offsetParent === null) return true;
        const pageLinks = document.querySelectorAll('#pagerbottom .pgn');
        if (pageLinks.length === 0) return false;
        const sel = document.querySelector('#pagerbottom .pgn.sel');
        const last = pageLinks[pageLinks.length - 1];
        if (sel && last && sel === last) return true;
        return false;
    }

    // Wait until the product count grows past `previousCount`, or the max
    // timeout elapses. Resolves with the new count either way.
    function waitForMoreProducts(previousCount, maxWaitMs = WAIT_FOR_PRODUCTS_MS) {
        return new Promise(resolve => {
            const target = document.querySelector('#boxes') || document.body;
            const countNow = () => document.querySelectorAll(PRODUCT_SELECTOR).length;
            if (countNow() > previousCount) return resolve(countNow());

            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                observer.disconnect();
                clearTimeout(timer);
                resolve(countNow());
            };
            const observer = new MutationObserver(() => {
                if (countNow() > previousCount) finish();
            });
            observer.observe(target, { childList: true, subtree: true });
            const timer = setTimeout(finish, maxWaitMs);
        });
    }

    async function runMultiLoad() {
        if (isMultiLoading) return;
        isMultiLoading = true;
        stopRequested = false;
        currentLoadedPages = 0;

        const loadAll = multiLoadPages === 0;
        const targetLabel = loadAll ? '∞' : String(multiLoadPages);

        loadManyBtn.disabled = true;
        loadManyBtn.innerHTML = `<span class="pf-spinner"></span>Loading…`;
        stopRow.style.display = 'block';
        loadStatus.textContent = `Loading: 0 / ${targetLabel}`;

        let reachedEnd = false;
        while (!stopRequested && (loadAll || currentLoadedPages < multiLoadPages)) {
            if (isAtLastPage()) { reachedEnd = true; break; }
            const before = document.querySelectorAll(PRODUCT_SELECTOR).length;
            clickLoadMoreButton();
            const after = await waitForMoreProducts(before);
            if (stopRequested) break;
            currentLoadedPages++;
            loadStatus.textContent = `Loading: ${currentLoadedPages} / ${targetLabel}`;
            // If the click produced no new products, the page is exhausted (or stuck).
            if (after === before) { reachedEnd = true; break; }
        }

        isMultiLoading = false;
        loadManyBtn.disabled = false;
        loadManyBtn.textContent = loadAll ? 'Load All Pages' : 'Load Multiple Pages';
        stopRow.style.display = 'none';

        if (stopRequested) {
            loadStatus.textContent = `⏹ Stopped after ${currentLoadedPages} pages`;
        } else if (reachedEnd) {
            loadStatus.textContent = `✓ Loaded ${currentLoadedPages} pages (end reached)`;
        } else {
            loadStatus.textContent = `✓ Loaded ${currentLoadedPages} pages`;
        }
        setTimeout(() => { loadStatus.textContent = ''; }, 3000);

        // Re-apply filter after loading (MutationObserver covers incremental; this covers the final state)
        applyFilter();
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
                if (!isNewerVersion(latest, CURRENT_VERSION)) return;
                const banner = document.getElementById('pf-update-banner');
                if (!banner) return;
                banner.textContent = `⬆ v${latest} available — click to update`;
                banner.style.display = 'block';
                banner.addEventListener('click', () => {
                    window.open(RAW_URL, '_blank', 'noopener');
                    setTimeout(() => {
                        banner.textContent = '↻ Reload the page to apply the update';
                        banner.classList.add('applied');
                    }, 500);
                });
            },
            onerror() {},
        });
    }

    // ─── MutationObserver ─────────────────────────────────────────────────────────
    // Watch #boxes for new product nodes and re-filter. Debounced to avoid
    // hammering querySelectorAll on every minor DOM mutation.
    // Only attach if #boxes exists — observing document.body with subtree:true
    // would fire on every tooltip, image load, etc. and tank performance.
    const observerTarget = document.querySelector('#boxes');
    if (observerTarget) {
        let debounceTimer = null;
        new MutationObserver(() => {
            if (isSorting) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                applyFilter();
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

    pagesInput.addEventListener('change', () => {
        const parsed = parseInt(pagesInput.value, 10);
        multiLoadPages = Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
        pagesInput.value = multiLoadPages;
        save(STORAGE.pages, multiLoadPages);
        updateLoadManyLabel();
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
        applyFilter();
        applyPriceSort();
        updateBubble();
    });

    // Ctrl shortcut — only fires when not typing in an input
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
        applyFilter();
        applyPriceSort();
        updateBubble();
        setTimeout(checkForUpdate, 3000);
    }

    setTimeout(init, 1000);
})();
