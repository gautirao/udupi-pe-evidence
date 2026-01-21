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
    // Clone the element to avoid modifying the original
    const clone = postElement.cloneNode(true);
    
    // Remove our injected overlay elements from the clone
    clone.querySelectorAll('.udupi-post-overlay, .udupi-checkbox, .udupi-label').forEach(el => el.remove());
    
    // Try to find the main text content using Facebook-specific selectors
    const textSelectors = [
      '[data-ad-preview="message"]',
      '[data-ad-comet-preview="message"]',
      '.x1iorvi4.x1pi30zi.x1swvt13',
      '.xdj266r.x11i5rnm.xat24cr.x1mh8g0r',
      // More specific Facebook post content selectors
      'div[dir="auto"][style*="webkit-line-clamp"]',
      'div[dir="auto"]:not([role])',
      'span[dir="auto"]:not([role])'
    ];

    for (const selector of textSelectors) {
      const textEl = clone.querySelector(selector);
      if (textEl) {
        const text = textEl.textContent.trim();
        // Skip if it looks like UI text or is too short
        if (text.length > 20 && !isUIText(text)) {
          return text;
        }
      }
    }

    // Fallback: collect all [dir="auto"] text nodes that look like content
    const allDirAuto = clone.querySelectorAll('[dir="auto"]');
    let longestText = '';
    allDirAuto.forEach(el => {
      const text = el.textContent.trim();
      if (text.length > longestText.length && !isUIText(text)) {
        longestText = text;
      }
    });
    
    if (longestText.length > 20) {
      return longestText.substring(0, 5000);
    }

    // Last resort: get cleaned full text
    const fullText = clone.textContent;
    if (fullText && fullText.length > 50) {
      // Clean up the text
      const cleaned = fullText
        .replace(/\s+/g, ' ')
        .replace(/(Like|Comment|Share|Reply|See more|View \d+ more comments?)/gi, '')
        .trim();
      if (cleaned.length > 30 && !isUIText(cleaned)) {
        return cleaned.substring(0, 5000);
      }
    }

    return null;
  }
  
  // Check if text looks like Facebook UI rather than post content
  function isUIText(text) {
    const uiPatterns = [
      /^(Like|Comment|Share|Reply|See more)$/i,
      /^Select for extraction$/i,
      /^\d+\s*(likes?|comments?|shares?)$/i,
      /^(Write a comment|Add a comment)$/i,
      /^(Top comments?|Most relevant|Newest)$/i,
      /^(Public|Friends|Only me)$/i,
      /^\d+[hmdwy]$/i, // Time stamps like "2h", "1d"
    ];
    return uiPatterns.some(pattern => pattern.test(text.trim()));
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

  // Get post timestamp - returns Date object or null
  function getPostTimestamp(postElement) {
    // Try multiple selectors for Facebook's timestamp elements
    const timeSelectors = [
      'abbr[data-utime]',
      'a[href*="/posts/"] span',
      'span[id^="jsc"]',
      'a[role="link"] span[aria-labelledby]',
      '[data-testid="post_timestamp"]',
      'a[href*="?__cft__"] span'
    ];

    for (const selector of timeSelectors) {
      const timeEl = postElement.querySelector(selector);
      if (timeEl) {
        // Check for unix timestamp attribute
        const utime = timeEl.getAttribute('data-utime');
        if (utime) {
          return new Date(parseInt(utime) * 1000);
        }
        
        // Try to parse text-based timestamps
        const text = timeEl.textContent?.trim();
        if (text) {
          const parsed = parseRelativeTime(text);
          if (parsed) return parsed;
        }
      }
    }
    
    return null;
  }

  // Parse Facebook's relative time strings (e.g., "2h", "1d", "Yesterday at 5:00 PM")
  function parseRelativeTime(text) {
    const now = new Date();
    const lower = text.toLowerCase();
    
    // Handle "Just now", "now"
    if (lower.includes('just now') || lower === 'now') {
      return now;
    }
    
    // Handle minutes: "5m", "5 mins", "5 minutes ago"
    const minMatch = lower.match(/(\d+)\s*m(?:in|ins|inutes?)?\s*(?:ago)?/);
    if (minMatch) {
      return new Date(now.getTime() - parseInt(minMatch[1]) * 60 * 1000);
    }
    
    // Handle hours: "2h", "2 hrs", "2 hours ago"
    const hourMatch = lower.match(/(\d+)\s*h(?:r|rs|ours?)?\s*(?:ago)?/);
    if (hourMatch) {
      return new Date(now.getTime() - parseInt(hourMatch[1]) * 60 * 60 * 1000);
    }
    
    // Handle days: "1d", "2 days ago"
    const dayMatch = lower.match(/(\d+)\s*d(?:ay|ays?)?\s*(?:ago)?/);
    if (dayMatch) {
      return new Date(now.getTime() - parseInt(dayMatch[1]) * 24 * 60 * 60 * 1000);
    }
    
    // Handle "Yesterday"
    if (lower.includes('yesterday')) {
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    // Handle weeks: "1w", "2 weeks ago"
    const weekMatch = lower.match(/(\d+)\s*w(?:eek|eeks?)?\s*(?:ago)?/);
    if (weekMatch) {
      return new Date(now.getTime() - parseInt(weekMatch[1]) * 7 * 24 * 60 * 60 * 1000);
    }
    
    return null;
  }

  // Check if a post is within the last N days
  function isWithinDays(postElement, days) {
    const timestamp = getPostTimestamp(postElement);
    if (!timestamp) return false;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return timestamp >= cutoff;
  }

  // Get posts from the last N days
  function getRecentPosts(days) {
    return postsOnPage.filter(post => isWithinDays(post, days));
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
        const recentPosts = getRecentPosts(2);
        sendResponse({
          total: postsOnPage.length,
          selected: selectedPosts.size,
          recentCount: recentPosts.length
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

      case 'selectRecent':
        // Select only posts from the last 2 days
        const days = message.days || 2;
        selectedPosts.clear();
        postsOnPage.forEach((post, index) => {
          const checkbox = post.querySelector('.udupi-post-checkbox');
          if (isWithinDays(post, days)) {
            selectedPosts.add(String(index));
            post.classList.add('udupi-selected');
            if (checkbox) checkbox.checked = true;
          } else {
            post.classList.remove('udupi-selected');
            if (checkbox) checkbox.checked = false;
          }
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
              const timestamp = getPostTimestamp(post);
              posts.push({
                content: text,
                author_name: getAuthorName(post),
                posted_at: timestamp ? timestamp.toISOString() : null,
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

      case 'extractRecent':
        // Extract posts from the last N days directly
        const extractDays = message.days || 2;
        const recentPostsToExtract = getRecentPosts(extractDays);
        const extractedPosts = [];
        
        recentPostsToExtract.forEach((post, i) => {
          const text = getPostText(post);
          if (text) {
            const timestamp = getPostTimestamp(post);
            extractedPosts.push({
              content: text,
              author_name: getAuthorName(post),
              posted_at: timestamp ? timestamp.toISOString() : null,
              external_post_id: `fb_${Date.now()}_${i}`
            });
          }
        });
        
        sendResponse({
          posts: extractedPosts,
          groupName: getGroupName(),
          totalScanned: postsOnPage.length
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
