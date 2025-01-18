// ==UserScript==
// @name         Product Filter by Text 2
// @namespace    Website filter
// @version      1.0
// @description  Filter products by specific text in the product tile
// @author       Filip Jerabek
// @match        https://www.alza.cz/*
// @grant        none
// @downloadURL  https://github.com/RouSkiSroup/productFilter/raw/main/script.js
// @updateURL    https://github.com/RouSkiSroup/productFilter/raw/main/script.js
// ==/UserScript==

(function() {
    'use strict';

    let filterText = 'alzadny50'; // Pre-fill the input with "alzadny50"
    let autoScrollMode = 1; // 0 = Disabled, 1 = Top of List, 2 = Latest Product

    // Function to filter products
    function filterProductsByText() {
        const products = document.querySelectorAll('.box.browsingitem.js-box'); // Adjusted the selector to match the product container
        products.forEach(product => {
            const discountCode = product.querySelector('.coupon-block__label--code')?.textContent || '';
            if (discountCode.toUpperCase().includes(filterText.toUpperCase())) {
                product.style.display = '';
            } else {
                product.style.display = 'none';
            }
        });
    }

    // Function to scroll to the top of the product list
    function scrollToProductList() {
        const productList = document.getElementById('ui-id-1');
        if (productList) {
            productList.scrollIntoView({ behavior: 'auto' });
        }
    }

    // Function to scroll to the latest visible product
    function scrollToLatestVisibleProduct() {
        const products = Array.from(document.querySelectorAll('.box.browsingitem.js-box')).filter(product => product.style.display !== 'none');
        const latestVisibleProduct = products[products.length - 1];
        if (latestVisibleProduct) {
            latestVisibleProduct.scrollIntoViewIfNeeded({ behavior: 'auto' });
        }
    }

    // Function to click the "Zobrazit další" button
    function clickLoadMoreButton() {
        const loadMoreButton = document.querySelector('.js-button-more.button-more');
        if (loadMoreButton) {
            loadMoreButton.click();
        }
    }

    // Function to disable auto-loading on scroll, needed to prevent the page from loading more products automatically
    function disableAutoLoadOnScroll() {
        window.addEventListener('scroll', (event) => {
            event.stopPropagation();
            event.preventDefault();
        }, true);
    }

    // Event listener for keydown on the search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.value = 'alzadny50'; // Pre-fill the input with "alzadny50"
    searchInput.placeholder = 'Search for products...';
    searchInput.style.position = 'fixed'; // Make it float
    searchInput.style.top = '10px'; // Adjust as needed
    searchInput.style.left = '10px'; // Adjust as needed
    searchInput.style.zIndex = '1000'; // Ensure it's on top

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            filterText = searchInput.value;
            filterProductsByText();
        }
    });

    // Add event listener for keydown to handle Ctrl and Shift keys
    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey) {
            console.log('Ctrl key is pressed!');
            clickLoadMoreButton();
        }
        if (event.key === 'Shift') {
            autoScrollMode = (autoScrollMode + 1) % 3;
            console.log('Auto-scroll mode:', autoScrollMode);
            updateAutoScrollStatus();
        }
    });

    // Function to update the auto-scroll status field
    function updateAutoScrollStatus() {
        const statusText = autoScrollMode === 0 ? 'Auto Scroll: Disabled' :
                           autoScrollMode === 1 ? 'Auto Scroll: Top of List' :
                           'Auto Scroll: Latest Product';
        autoScrollStatus.textContent = statusText;
    }

    // Create auto-scroll status field
    const autoScrollStatus = document.createElement('div');
    autoScrollStatus.style.position = 'fixed'; // Make it float
    autoScrollStatus.style.top = '130px'; // Adjust as needed
    autoScrollStatus.style.left = '10px'; // Adjust as needed
    autoScrollStatus.style.zIndex = '1000'; // Ensure it's on top
    autoScrollStatus.style.backgroundColor = 'lightgray'; // Background color for better readability
    autoScrollStatus.style.padding = '5px 10px'; // Padding for better readability
    autoScrollStatus.style.borderRadius = '5px'; // Rounded corners
    autoScrollStatus.textContent = 'Auto Scroll: Top of List'; // Initial status
    document.body.insertBefore(autoScrollStatus, document.body.firstChild);

    // Append the search input to the page
    document.body.insertBefore(searchInput, document.body.firstChild);

    // Disable auto-loading on scroll
    disableAutoLoadOnScroll();

    // Manually trigger loading of more products
    const loadMoreButton = document.createElement('button');
    loadMoreButton.textContent = "Load More Products (Ctrl)";
    loadMoreButton.style.position = 'fixed'; // Make it float
    loadMoreButton.style.top = '50px'; // Adjust as needed
    loadMoreButton.style.left = '10px'; // Adjust as needed
    loadMoreButton.style.zIndex = '1000'; // Ensure it's on top

    loadMoreButton.addEventListener('click', clickLoadMoreButton);
    document.body.insertBefore(loadMoreButton, document.body.firstChild);

    // Button to toggle auto-scroll
    const toggleAutoScrollButton = document.createElement('button');
    toggleAutoScrollButton.textContent = "Toggle Auto Scroll (Shift)";
    toggleAutoScrollButton.style.position = 'fixed'; // Make it float
    toggleAutoScrollButton.style.top = '90px'; // Adjust as needed
    toggleAutoScrollButton.style.left = '10px'; // Adjust as needed
    toggleAutoScrollButton.style.zIndex = '1000'; // Ensure it's on top

    toggleAutoScrollButton.addEventListener('click', () => {
        autoScrollMode = (autoScrollMode + 1) % 3;
        console.log('Auto-scroll mode:', autoScrollMode);
        updateAutoScrollStatus();
    });

    document.body.insertBefore(toggleAutoScrollButton, document.body.firstChild);

    // Set an interval to perform actions based on the auto-scroll mode
    setInterval(() => {
        filterProductsByText();
    }, 100); // Check every second

    setInterval(() => {
        if (autoScrollMode === 1) {
            scrollToProductList();
        } else if (autoScrollMode === 2) {
            scrollToLatestVisibleProduct();
        }
    }, 10); // Check every second
})();
