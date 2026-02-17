// ==UserScript==
// @name         Product Filter by Text 2
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Filter products by specific text in the product tile
// @author       Your Name
// @match        https://www.alza.cz/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let filterTexts = []; // Array to store multiple filter texts
    let autoScrollMode = 0; // 0 = Disabled, 1 = Top of List, 2 = Latest Product
    let filteringEnabled = false; // Toggle for filtering functionality
    let multiLoadPages = 5; // Default number of pages to load
    let isMultiLoading = false; // Flag to track if multi-load is in progress
    let currentLoadedPages = 0; // Counter for currently loaded pages

    const commonSearchTerms = ['alzadny50', 'alzadny40', 'alzadny30', 'alzadny25', 'alzadny20', 'alzadny15', 'alzadny10'];

    // Function to initialize the script
    function initializeScript() {
        createCheckboxes();
        createMultiLoadControls();
        updateAndApplyFilter(searchInput.value);
        updateFilteringVisibility();
    }

    // Function to create multi-load controls
    function createMultiLoadControls() {
        const multiLoadContainer = document.createElement('div');
        multiLoadContainer.style.position = 'fixed';
        multiLoadContainer.style.top = '210px'; // Positioned above the checkboxes
        multiLoadContainer.style.left = '10px';
        multiLoadContainer.style.zIndex = '1000';
        multiLoadContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        multiLoadContainer.style.padding = '10px';
        multiLoadContainer.style.borderRadius = '5px';
        multiLoadContainer.style.border = '1px solid #ccc';
        multiLoadContainer.style.width = '250px';
        multiLoadContainer.style.marginBottom = '20px'; // Increased space between this and the checkboxes

        const multiLoadInput = document.createElement('input');
        multiLoadInput.type = 'number';
        multiLoadInput.min = '1';
        multiLoadInput.max = '20';
        multiLoadInput.value = multiLoadPages;
        multiLoadInput.style.width = '50px';
        multiLoadInput.style.marginRight = '5px';
        multiLoadInput.addEventListener('change', (event) => {
            multiLoadPages = parseInt(event.target.value, 10) || 5;
        });

        const multiLoadButton = document.createElement('button');
        multiLoadButton.textContent = 'Load Multiple Pages';
        multiLoadButton.style.marginTop = '5px';
        multiLoadButton.style.width = '100%';
        multiLoadButton.addEventListener('click', loadMultiplePages);

        const multiLoadInputLabel = document.createElement('label');
        multiLoadInputLabel.textContent = 'Number of pages to load: ';
        multiLoadInputLabel.style.display = 'inline-block';
        multiLoadInputLabel.style.marginBottom = '5px';

        const multiLoadStatus = document.createElement('div');
        multiLoadStatus.id = 'multiLoadStatus';
        multiLoadStatus.style.marginTop = '5px';
        multiLoadStatus.style.fontWeight = 'bold';

        multiLoadContainer.appendChild(multiLoadInputLabel);
        multiLoadContainer.appendChild(multiLoadInput);
        multiLoadContainer.appendChild(document.createElement('br'));
        multiLoadContainer.appendChild(multiLoadButton);
        multiLoadContainer.appendChild(multiLoadStatus);

        document.body.insertBefore(multiLoadContainer, document.body.firstChild);
    }

    // Function to load multiple pages
    async function loadMultiplePages() {
        if (isMultiLoading) return;

        isMultiLoading = true;
        currentLoadedPages = 0;
        updateMultiLoadStatus();
        const multiLoadButton = document.querySelector('button');
        multiLoadButton.style.backgroundColor = 'green';

        for (let i = 0; i < multiLoadPages; i++) {
            await new Promise((resolve) => {
                clickLoadMoreButton();
                setTimeout(() => {
                    currentLoadedPages++;
                    updateMultiLoadStatus();
                    resolve();
                }, 2000); // Wait for 2 seconds between loads
            });
        }

        isMultiLoading = false;
        multiLoadButton.style.backgroundColor = '';
        updateMultiLoadStatus();
        filterProductsByText();
    }

    // Function to update multi-load status
    function updateMultiLoadStatus() {
        const statusElement = document.getElementById('multiLoadStatus');
        if (isMultiLoading) {
            statusElement.textContent = `Loading: ${currentLoadedPages}/${multiLoadPages}`;
        } else {
            statusElement.textContent = '';
        }
    }

    // Function to create checkboxes for common search terms
    function createCheckboxes() {
        const checkboxContainer = document.createElement('div');
        checkboxContainer.style.position = 'fixed';
        checkboxContainer.style.top = '320px'; // Increased top position to avoid overlap
        checkboxContainer.style.left = '10px';
        checkboxContainer.style.zIndex = '1000';
        checkboxContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        checkboxContainer.style.padding = '10px';
        checkboxContainer.style.borderRadius = '5px';
        checkboxContainer.style.border = '1px solid #ccc';
        checkboxContainer.style.width = '250px';
        checkboxContainer.style.maxHeight = '300px';
        checkboxContainer.style.overflowY = 'auto';

        commonSearchTerms.forEach(term => {
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.style.marginBottom = '5px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `checkbox-${term}`;
            checkbox.value = term;
            checkbox.addEventListener('change', handleCheckboxChange);

            const label = document.createElement('label');
            label.htmlFor = `checkbox-${term}`;
            label.textContent = term;
            label.style.marginLeft = '5px';

            checkboxWrapper.appendChild(checkbox);
            checkboxWrapper.appendChild(label);
            checkboxContainer.appendChild(checkboxWrapper);
        });

        document.body.insertBefore(checkboxContainer, document.body.firstChild);
    }

    // Function to handle checkbox changes
    function handleCheckboxChange(event) {
        const term = event.target.value;
        const isChecked = event.target.checked;
        let currentTerms = searchInput.value.split(',').map(t => t.trim()).filter(t => t !== '');

        if (isChecked && !currentTerms.includes(term)) {
            currentTerms.push(term);
        } else if (!isChecked) {
            currentTerms = currentTerms.filter(t => t !== term);
        }

        searchInput.value = currentTerms.join(', ');
        updateAndApplyFilter(searchInput.value);
    }

    // Function to update filter texts and apply filtering
    function updateAndApplyFilter(inputValue) {
        filterTexts = inputValue.split(',').map(text => text.trim()).filter(text => text !== '');
        updateCheckboxes();
        filterProductsByText();
    }

    // Function to update checkboxes based on input value
    function updateCheckboxes() {
        commonSearchTerms.forEach(term => {
            const checkbox = document.getElementById(`checkbox-${term}`);
            if (checkbox) {
                checkbox.checked = filterTexts.includes(term);
            }
        });
    }

    // Function to filter products
    function filterProductsByText() {
        if (!filteringEnabled) return; // Skip filtering if disabled

        const products = document.querySelectorAll('.box.browsingitem.js-box');
        products.forEach(product => {
            const discountCode = product.querySelector('.coupon-block__label--code')?.textContent || '';
            const shouldDisplay = filterTexts.some(text => 
                discountCode.toUpperCase().includes(text.toUpperCase())
            );
            product.style.display = shouldDisplay ? '' : 'none';
        });
    }

    // Function to scroll to the top of the product list
    function scrollToProductList() {
        const productList = document.getElementById('ui-id-1');
        if (productList) {
            productList.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // Function to scroll to the latest visible product
    function scrollToLatestVisibleProduct() {
        const products = Array.from(document.querySelectorAll('.box.browsingitem.js-box')).filter(product => product.style.display !== 'none');
        const latestVisibleProduct = products[products.length - 1];
        if (latestVisibleProduct) {
            latestVisibleProduct.scrollIntoViewIfNeeded({ behavior: 'smooth' });
        }
    }

    // Function to click the "Zobrazit další" button and reapply filter
    function clickLoadMoreButton() {
        const loadMoreButton = document.querySelector('.js-button-more.button-more');
        if (loadMoreButton) {
            loadMoreButton.click();
            // Wait for new content to load before reapplying the filter
            setTimeout(() => {
                if (!multiLoadEnabled) {
                    filterProductsByText();
                }
            }, 1000);
        }
    }

    // Function to disable auto-loading on scroll
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
    searchInput.placeholder = 'Enter search terms (comma-separated)';
    searchInput.style.width = '250px'; // Increase width for better visibility
    searchInput.style.position = 'fixed'; // Make it float
    searchInput.style.top = '10px'; // Adjust as needed
    searchInput.style.left = '10px'; // Adjust as needed
    searchInput.style.zIndex = '1000'; // Ensure it's on top

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            updateAndApplyFilter(searchInput.value);
        }
    });

    // Add input event listener to update filtering in real-time
    searchInput.addEventListener('input', () => {
        updateAndApplyFilter(searchInput.value);
    });

    // Create toggle button for filtering
    const toggleFilterButton = document.createElement('button');
    toggleFilterButton.textContent = 'Disable Filtering';
    toggleFilterButton.style.position = 'fixed';
    toggleFilterButton.style.top = '170px';
    toggleFilterButton.style.left = '10px';
    toggleFilterButton.style.zIndex = '1000';
    toggleFilterButton.style.padding = '5px 10px';

    toggleFilterButton.addEventListener('click', () => {
        filteringEnabled = !filteringEnabled;
        toggleFilterButton.textContent = filteringEnabled ? 'Disable Filtering' : 'Enable Filtering';
        updateFilteringVisibility();
    });

    document.body.insertBefore(toggleFilterButton, document.body.firstChild);

    // Create an info text to explain how to use multiple search terms
    const infoText = document.createElement('div');
    infoText.textContent = 'Separate multiple search terms with commas';
    infoText.style.position = 'fixed';
    infoText.style.top = '35px';
    infoText.style.left = '10px';
    infoText.style.zIndex = '1000';
    infoText.style.fontSize = '12px';
    infoText.style.color = '#666';
    document.body.insertBefore(infoText, document.body.firstChild);

    // Function to update visibility of filtering elements
    function updateFilteringVisibility() {
        const displayStyle = filteringEnabled ? 'block' : 'none';
        searchInput.style.display = displayStyle;
        infoText.style.display = displayStyle;
        loadMoreButton.style.display = displayStyle;
        toggleAutoScrollButton.style.display = displayStyle;
        autoScrollStatus.style.display = displayStyle;
        document.querySelector('div[style*="top: 210px"]').style.display = displayStyle; // Hide/show multi-load container
        document.querySelector('div[style*="top: 320px"]').style.display = displayStyle; // Hide/show checkbox container
        if (filteringEnabled) {
            filterProductsByText(); // Re-apply filtering only when enabled
        } else {
            // Show all products when filtering is disabled
            document.querySelectorAll('.box.browsingitem.js-box').forEach(product => {
                product.style.display = '';
            });
        }
    }

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

    // Create a MutationObserver to watch for new products being added
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                filterProductsByText();
            }
        });
    });

    // Start observing the product container for changes
    const productContainer = document.querySelector('#boxes');
    if (productContainer) {
        observer.observe(productContainer, { childList: true, subtree: true });
    }

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
    loadMoreButton.textContent = "Load one product page (Ctrl)";
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
        if (autoScrollMode === 1) {
            scrollToProductList();
        } else if (autoScrollMode === 2) {
            scrollToLatestVisibleProduct();
        }
    }, 1000); // Check every second

    // Initialize the script after a short delay to ensure the page has loaded
    setTimeout(initializeScript, 1000);
})();
