// Udupi Property Tracker - Facebook Group Content Script
(function() {
  'use strict';

  const selectedPosts = new Set();
  const trackedPostElements = new Map(); // Use Map to track posts by unique key
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

    let newPostsFound = 0;
    
    for (const selector of postSelectors) {
      document.querySelectorAll(selector).forEach(el => {
        // Skip if already tracked
        if (el.dataset.udupiTracked) return;
        
        // Only add if it looks like a post (has text content)
        const text = getPostText(el);
        if (text && text.length > 20) {
          // Generate a unique key for this post
          const postKey = `post_${trackedPostElements.size}_${Date.now()}`;
          el.dataset.udupiTracked = 'true';
          el.dataset.udupiKey = postKey;
          
          trackedPostElements.set(postKey, el);
          newPostsFound++;
          
          // Add selection overlay
          addPostOverlay(el);
        }
      });
    }

    // Update postsOnPage array from tracked elements
    postsOnPage = Array.from(trackedPostElements.values());
    
    // Update indices for all posts
    postsOnPage.forEach((post, index) => {
      post.dataset.udupiIndex = String(index);
    });
    
    if (newPostsFound > 0) {
      console.log(`[Udupi Tracker] Found ${newPostsFound} new posts. Total: ${postsOnPage.length}`);
    }
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

  // Get image URLs from post
  function getPostImages(postElement) {
    const images = [];
    const seenUrls = new Set();
    
    // Various selectors for Facebook post images
    const imageSelectors = [
      'img[src*="scontent"]',           // Main Facebook CDN images
      'img[src*="fbcdn"]',              // Facebook CDN alternative
      'img[data-src*="scontent"]',      // Lazy-loaded images
      'img[data-src*="fbcdn"]',
      'a[href*="/photo"] img',          // Images in photo links
      'div[data-pagelet*="Photo"] img', // Photo pagelet images
      'img[alt]:not([alt=""])',         // Images with alt text (likely content images)
    ];
    
    for (const selector of imageSelectors) {
      postElement.querySelectorAll(selector).forEach(img => {
        // Get the best quality URL available
        let url = img.src || img.dataset.src || img.getAttribute('data-src');
        
        if (!url) return;
        
        // Skip tiny images (likely icons/emojis), profile pics, and UI elements
        const width = img.naturalWidth || img.width || parseInt(img.getAttribute('width')) || 0;
        const height = img.naturalHeight || img.height || parseInt(img.getAttribute('height')) || 0;
        
        // Skip very small images (likely icons) - but be lenient since dimensions might not be loaded
        if (width > 0 && width < 50 && height > 0 && height < 50) return;
        
        // Skip profile pictures (usually in specific containers or have specific patterns)
        if (url.includes('/p50x50/') || url.includes('/p60x60/') || url.includes('/c0.0.40.40')) return;
        if (img.closest('a[href*="/profile"]') || img.closest('a[aria-label*="profile"]')) return;
        
        // Skip emoji images
        if (img.alt && /^[\u{1F300}-\u{1F9FF}]|^:[\w]+:$/u.test(img.alt)) return;
        
        // Skip reaction images
        if (url.includes('/reaction/') || url.includes('emoji')) return;
        
        // Normalize URL (remove tracking params but keep essential ones)
        try {
          const urlObj = new URL(url);
          // Keep only essential params for image loading
          const essentialParams = ['_nc_cat', '_nc_sid', '_nc_ohc', '_nc_ht', 'oh', 'oe'];
          const newParams = new URLSearchParams();
          essentialParams.forEach(param => {
            if (urlObj.searchParams.has(param)) {
              newParams.set(param, urlObj.searchParams.get(param));
            }
          });
          url = `${urlObj.origin}${urlObj.pathname}?${newParams.toString()}`;
        } catch (e) {
          // If URL parsing fails, use original
        }
        
        // Deduplicate
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          images.push({
            url: url,
            alt: img.alt || null,
            width: width || null,
            height: height || null
          });
        }
      });
    }
    
    // Also check for background images in divs (Facebook sometimes uses these)
    postElement.querySelectorAll('div[style*="background-image"]').forEach(div => {
      const style = div.getAttribute('style');
      const match = style.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
      if (match && match[1]) {
        let url = match[1];
        if ((url.includes('scontent') || url.includes('fbcdn')) && !seenUrls.has(url)) {
          seenUrls.add(url);
          images.push({
            url: url,
            alt: null,
            width: null,
            height: null
          });
        }
      }
    });
    
    return images;
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

  // Auto-scroll to load more posts
  let isScrolling = false;
  
  async function autoScroll(scrollCount = 50, delayMs = 800) {
    if (isScrolling) {
      console.log('[Udupi Tracker] Already scrolling...');
      return { success: false, reason: 'already_scrolling' };
    }
    
    isScrolling = true;
    const startPosts = postsOnPage.length;
    console.log(`[Udupi Tracker] Starting auto-scroll. Current posts: ${startPosts}`);
    
    for (let i = 0; i < scrollCount; i++) {
      // Scroll down
      window.scrollBy(0, window.innerHeight * 0.8);
      
      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      // Scan for new posts
      scanForPosts();
      
      // Log progress every 10 scrolls
      if ((i + 1) % 10 === 0) {
        console.log(`[Udupi Tracker] Scroll ${i + 1}/${scrollCount} - Posts found: ${postsOnPage.length}`);
      }
    }
    
    // Final scan
    scanForPosts();
    isScrolling = false;
    
    const newPosts = postsOnPage.length - startPosts;
    console.log(`[Udupi Tracker] Auto-scroll complete. New posts loaded: ${newPosts}, Total: ${postsOnPage.length}`);
    
    return { 
      success: true, 
      startPosts, 
      endPosts: postsOnPage.length, 
      newPosts 
    };
  }
  
  function getScrollStatus() {
    return isScrolling;
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
          recentCount: recentPosts.length,
          isScrolling: getScrollStatus()
        });
        break;

      case 'autoScroll':
        const scrollCount = message.scrollCount || 50;
        const delay = message.delay || 800;
        autoScroll(scrollCount, delay).then(result => {
          sendResponse(result);
        });
        return true; // Keep channel open for async response

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
            const images = getPostImages(post);
            console.log(`[Udupi Tracker] Post ${index} extracted text:`, text ? text.substring(0, 200) : 'NULL');
            console.log(`[Udupi Tracker] Post ${index} images found:`, images.length);
            images.forEach((img, i) => {
              console.log(`[Udupi Tracker]   Image ${i + 1}:`, img.url.substring(0, 100) + '...', `(${img.width}x${img.height})`);
            });
            if (text) {
              const timestamp = getPostTimestamp(post);
              const author = getAuthorName(post);
              console.log(`[Udupi Tracker] Post ${index} author:`, author, 'timestamp:', timestamp);
              posts.push({
                content: text,
                author_name: author,
                posted_at: timestamp ? timestamp.toISOString() : null,
                external_post_id: `fb_${Date.now()}_${index}`,
                images: images
              });
            }
          }
        });
        console.log(`[Udupi Tracker] Total extracted:`, posts.length, 'posts');
        console.log(`[Udupi Tracker] Total images across all posts:`, posts.reduce((sum, p) => sum + (p.images?.length || 0), 0));
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
          const images = getPostImages(post);
          console.log(`[Udupi Tracker] Recent post ${i} text:`, text ? text.substring(0, 150) : 'NULL');
          console.log(`[Udupi Tracker] Recent post ${i} images:`, images.length);
          images.forEach((img, j) => {
            console.log(`[Udupi Tracker]   Image ${j + 1}:`, img.url.substring(0, 80) + '...');
          });
          if (text) {
            const timestamp = getPostTimestamp(post);
            extractedPosts.push({
              content: text,
              author_name: getAuthorName(post),
              posted_at: timestamp ? timestamp.toISOString() : null,
              external_post_id: `fb_${Date.now()}_${i}`,
              images: images
            });
          }
        });
        
        console.log(`[Udupi Tracker] Extracted ${extractedPosts.length} recent posts with ${extractedPosts.reduce((sum, p) => sum + (p.images?.length || 0), 0)} total images`);
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
