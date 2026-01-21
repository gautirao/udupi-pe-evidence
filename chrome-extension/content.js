// Udupi Property Tracker - Facebook Group Content Script
(function() {
  'use strict';

  const selectedPosts = new Set();
  let postsOnPage = [];

  // Initialize when DOM is ready
  function init() {
    console.log('[Udupi Tracker] Content script initialized');
    scanForPosts();
    addSelectionUI();
    
    // Re-scan when new posts load (infinite scroll)
    const observer = new MutationObserver(() => {
      setTimeout(scanForPosts, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Scan page for Facebook posts
  function scanForPosts() {
    // Facebook uses various selectors for posts - try multiple approaches
    const postSelectors = [
      '[data-pagelet^="FeedUnit"]',
      '[role="article"]',
      '.x1yztbdb.x1n2onr6.xh8yej3.x1ja2u2z', // Common Facebook post container
      'div[data-ad-preview="message"]'
    ];

    const allPosts = new Set();
    
    for (const selector of postSelectors) {
      document.querySelectorAll(selector).forEach(el => {
        // Only add if it looks like a post (has text content)
        const text = getPostText(el);
        if (text && text.length > 20) {
          allPosts.add(el);
        }
      });
    }

    postsOnPage = Array.from(allPosts);
    console.log(`[Udupi Tracker] Found ${postsOnPage.length} posts`);
    
    // Add selection overlay to each post
    postsOnPage.forEach((post, index) => {
      if (!post.dataset.udupiTracked) {
        post.dataset.udupiTracked = 'true';
        post.dataset.udupiIndex = index;
        addPostOverlay(post);
      }
    });
  }

  // Get text content from a post element
  function getPostText(postElement) {
    // Try to find the main text content
    const textSelectors = [
      '[data-ad-preview="message"]',
      '[data-ad-comet-preview="message"]',
      '.x1iorvi4.x1pi30zi.x1swvt13',
      '.xdj266r.x11i5rnm.xat24cr.x1mh8g0r',
      '[dir="auto"]'
    ];

    for (const selector of textSelectors) {
      const textEl = postElement.querySelector(selector);
      if (textEl && textEl.textContent.trim().length > 20) {
        return textEl.textContent.trim();
      }
    }

    // Fallback: get all text but filter out navigation/UI text
    const text = postElement.textContent;
    if (text && text.length > 50) {
      return text.substring(0, 5000); // Limit to prevent huge payloads
    }

    return null;
  }

  // Get author name from post
  function getAuthorName(postElement) {
    const authorSelectors = [
      'a[role="link"] strong',
      'a[role="link"] span[dir="auto"]',
      'h2 a span',
      'strong'
    ];

    for (const selector of authorSelectors) {
      const el = postElement.querySelector(selector);
      if (el && el.textContent.trim().length > 0 && el.textContent.trim().length < 100) {
        return el.textContent.trim();
      }
    }

    return null;
  }

  // Get post timestamp
  function getPostTimestamp(postElement) {
    const timeEl = postElement.querySelector('a[href*="/posts/"] span, abbr[data-utime], span[id^="jsc"]');
    if (timeEl) {
      return timeEl.getAttribute('data-utime') || timeEl.textContent;
    }
    return null;
  }

  // Add selection overlay to a post
  function addPostOverlay(postElement) {
    const overlay = document.createElement('div');
    overlay.className = 'udupi-post-overlay';
    overlay.innerHTML = `
      <div class="udupi-checkbox">
        <input type="checkbox" class="udupi-post-checkbox">
        <span class="udupi-label">Select for extraction</span>
      </div>
    `;

    const checkbox = overlay.querySelector('.udupi-post-checkbox');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const index = postElement.dataset.udupiIndex;
      if (e.target.checked) {
        selectedPosts.add(index);
        postElement.classList.add('udupi-selected');
      } else {
        selectedPosts.delete(index);
        postElement.classList.remove('udupi-selected');
      }
    });

    // Position the overlay
    postElement.style.position = 'relative';
    postElement.appendChild(overlay);
  }

  // Add global UI elements
  function addSelectionUI() {
    // Floating action button
    const fab = document.createElement('div');
    fab.className = 'udupi-fab';
    fab.innerHTML = `
      <div class="udupi-fab-content">
        <span class="udupi-fab-icon">🏠</span>
        <span class="udupi-fab-text">Udupi Tracker Active</span>
      </div>
    `;
    document.body.appendChild(fab);
  }

  // Get group name from page
  function getGroupName() {
    const groupNameEl = document.querySelector('h1 a, [role="main"] h1');
    return groupNameEl ? groupNameEl.textContent.trim() : 'Unknown Group';
  }

  // Message handler for popup communication
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'getStats':
        sendResponse({
          total: postsOnPage.length,
          selected: selectedPosts.size
        });
        break;

      case 'selectAll':
        postsOnPage.forEach((post, index) => {
          selectedPosts.add(String(index));
          post.classList.add('udupi-selected');
          const checkbox = post.querySelector('.udupi-post-checkbox');
          if (checkbox) checkbox.checked = true;
        });
        sendResponse({ selected: selectedPosts.size });
        break;

      case 'clearSelection':
        postsOnPage.forEach(post => {
          post.classList.remove('udupi-selected');
          const checkbox = post.querySelector('.udupi-post-checkbox');
          if (checkbox) checkbox.checked = false;
        });
        selectedPosts.clear();
        sendResponse({ success: true });
        break;

      case 'extractSelected':
        const posts = [];
        selectedPosts.forEach(index => {
          const post = postsOnPage[parseInt(index)];
          if (post) {
            const text = getPostText(post);
            if (text) {
              posts.push({
                content: text,
                author_name: getAuthorName(post),
                posted_at: getPostTimestamp(post),
                external_post_id: `fb_${Date.now()}_${index}`
              });
            }
          }
        });
        sendResponse({
          posts,
          groupName: getGroupName()
        });
        break;
    }
    return true; // Keep channel open for async response
  });

  // Initialize when page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
