// Load saved configuration
document.addEventListener('DOMContentLoaded', async () => {
  const config = await chrome.storage.local.get(['apiUrl', 'apiKey', 'activeDistrict']);
  if (config.apiUrl) document.getElementById('apiUrl').value = config.apiUrl;
  if (config.apiKey) document.getElementById('apiKey').value = config.apiKey;
  if (config.activeDistrict) document.getElementById('districtSelect').value = config.activeDistrict;

  // Check if we're on a Facebook group page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isGroupPage = tab.url && tab.url.includes('facebook.com/groups/');
  
  if (!isGroupPage) {
    document.getElementById('notOnGroup').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
  } else {
    document.getElementById('notOnGroup').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    
    // Get current stats from content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStats' });
      if (response) {
        document.getElementById('postsFound').textContent = response.total || 0;
        document.getElementById('recentPosts').textContent = response.recentCount || 0;
        document.getElementById('postsSelected').textContent = response.selected || 0;
        document.getElementById('extractBtn').disabled = response.selected === 0;
        document.getElementById('extractRecentBtn').disabled = response.recentCount === 0;
      }
    } catch (e) {
      console.log('Content script not ready, may need to refresh the page');
    }
  }
});

// Persist active district selection
document.getElementById('districtSelect').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ activeDistrict: e.target.value });
});

// Save configuration
document.getElementById('saveConfig').addEventListener('click', async () => {
  const apiUrl = document.getElementById('apiUrl').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  
  await chrome.storage.local.set({ apiUrl, apiKey });
  showStatus('Configuration saved!', 'success');
});

// Auto-scroll to load more posts
document.getElementById('autoScrollBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const autoScrollBtn = document.getElementById('autoScrollBtn');
  const stopScrollBtn = document.getElementById('stopScrollBtn');
  
  autoScrollBtn.classList.add('hidden');
  stopScrollBtn.classList.remove('hidden');
  showStatus('Auto-scrolling to load more posts...', 'info');
  
  try {
    // Start scroll and poll for updates
    const scrollPromise = chrome.tabs.sendMessage(tab.id, { 
      action: 'autoScroll',
      scrollCount: 50,
      delay: 800
    });
    
    // Poll for progress updates
    const pollInterval = setInterval(async () => {
      try {
        const stats = await chrome.tabs.sendMessage(tab.id, { action: 'getStats' });
        if (stats) {
          document.getElementById('postsFound').textContent = stats.total || 0;
          document.getElementById('recentPosts').textContent = stats.recentCount || 0;
        }
      } catch (e) { /* ignore */ }
    }, 2000);
    
    const result = await scrollPromise;
    clearInterval(pollInterval);
    
    if (result.success) {
      const stoppedText = result.stopped ? ' (stopped)' : '';
      showStatus(`✓ Loaded ${result.newPosts} new posts! Total: ${result.endPosts}${stoppedText}`, 'success');
      // Update stats
      const stats = await chrome.tabs.sendMessage(tab.id, { action: 'getStats' });
      if (stats) {
        document.getElementById('postsFound').textContent = stats.total || 0;
        document.getElementById('recentPosts').textContent = stats.recentCount || 0;
      }
    } else {
      showStatus('Scroll already in progress', 'info');
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
  
  autoScrollBtn.classList.remove('hidden');
  stopScrollBtn.classList.add('hidden');
});

// Stop scrolling button
document.getElementById('stopScrollBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'stopScroll' });
    showStatus('Stopping scroll...', 'info');
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
});

// Select all posts
document.getElementById('selectAllBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.tabs.sendMessage(tab.id, { action: 'selectAll' });
  if (response) {
    document.getElementById('postsSelected').textContent = response.selected;
    document.getElementById('extractBtn').disabled = response.selected === 0;
  }
});

// Smart Select — auto-check only real estate posts with location mentions
document.getElementById('smartSelectBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const smartSelectBtn = document.getElementById('smartSelectBtn');
  const smartResult = document.getElementById('smartResult');

  smartSelectBtn.disabled = true;
  smartResult.textContent = 'Scanning…';

  try {
    const districtKey = document.getElementById('districtSelect').value;
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'smartSelect', districtKey });
    if (response) {
      document.getElementById('postsSelected').textContent = response.selected;
      document.getElementById('extractBtn').disabled = response.selected === 0;
      smartResult.textContent = `Smart Select: ${response.selected} of ${response.totalScanned} posts selected`;
    }
  } catch (error) {
    smartResult.textContent = 'Error: could not scan posts';
    showStatus(`Smart Select error: ${error.message}`, 'error');
  }

  smartSelectBtn.disabled = false;
});

// Extract posts from last 2 days - ONE CLICK SOLUTION
document.getElementById('extractRecentBtn').addEventListener('click', async () => {
  const apiUrl = document.getElementById('apiUrl').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  
  if (!apiUrl || !apiKey) {
    showStatus('Please configure API endpoint and key first', 'error');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  showStatus('Scanning for recent posts...', 'info');
  document.getElementById('extractRecentBtn').disabled = true;

  try {
    // Extract posts from last 2 days directly
    const response = await chrome.tabs.sendMessage(tab.id, { 
      action: 'extractRecent',
      days: 2
    });
    
    if (!response || !response.posts || response.posts.length === 0) {
      showStatus('No posts from the last 2 days found. Try scrolling down to load more posts.', 'error');
      document.getElementById('extractRecentBtn').disabled = false;
      return;
    }

    showStatus(`Found ${response.posts.length} recent posts. Sending in batches...`, 'info');

    // Send posts in batches
    const totalImported = await sendPostsInBatches(
      response.posts,
      apiUrl,
      apiKey,
      tab.url,
      response.groupName,
      showStatus
    );

    showStatus(`✓ ${totalImported} posts imported successfully!`, 'success');
    
    // Update stats
    document.getElementById('postsSelected').textContent = '0';
    
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
  
  document.getElementById('extractRecentBtn').disabled = false;
});

// Batch size for sending posts
const BATCH_SIZE = 50;

// Helper function to send posts in batches
async function sendPostsInBatches(posts, apiUrl, apiKey, sourceUrl, groupName, updateStatus) {
  const totalPosts = posts.length;
  let totalImported = 0;
  let batchNumber = 0;
  const totalBatches = Math.ceil(totalPosts / BATCH_SIZE);
  
  const totalImages = posts.reduce((sum, p) => sum + (p.images?.length || 0), 0);
  console.log(`[Udupi Popup] Starting batch upload: ${totalPosts} posts, ${totalImages} total images, in ${totalBatches} batches`);
  posts.forEach((p, idx) => {
    console.log(`[Udupi Popup]   post[${idx}] images=${p.images?.length || 0} text="${p.content?.substring(0, 60).replace(/\n/g, ' ')}"`);
  });

  for (let i = 0; i < totalPosts; i += BATCH_SIZE) {
    batchNumber++;
    const batch = posts.slice(i, i + BATCH_SIZE);
    const batchImages = batch.reduce((sum, p) => sum + (p.images?.length || 0), 0);

    console.log(`[Udupi Popup] Sending batch ${batchNumber}/${totalBatches}: ${batch.length} posts, ${batchImages} images`);
    updateStatus(`Sending batch ${batchNumber}/${totalBatches} (${i + batch.length}/${totalPosts} posts)...`, 'info');
    
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ingestion-Api-Key': apiKey
      },
      body: JSON.stringify({
        posts: batch,
        source_url: sourceUrl,
        group_name: groupName
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`Batch ${batchNumber} failed: ${errorText}`);
    }

    const result = await apiResponse.json();
    totalImported += result.imported || batch.length;
    console.log(`[Udupi Popup] Batch ${batchNumber} complete: ${result.imported || batch.length} imported`);
  }
  
  return totalImported;
}

// Extract selected posts
document.getElementById('extractBtn').addEventListener('click', async () => {
  const apiUrl = document.getElementById('apiUrl').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  
  if (!apiUrl || !apiKey) {
    showStatus('Please configure API endpoint and key first', 'error');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  showStatus('Extracting posts...', 'info');
  document.getElementById('extractBtn').disabled = true;

  try {
    // Get selected posts from content script
    console.log('[Udupi Popup] Requesting extractSelected from content script...');
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractSelected' });
    console.log('[Udupi Popup] Response from content script:', response);
    console.log('[Udupi Popup] Posts count:', response?.posts?.length);
    
    if (!response || !response.posts || response.posts.length === 0) {
      showStatus('No posts selected', 'error');
      document.getElementById('extractBtn').disabled = false;
      return;
    }

    const totalPosts = response.posts.length;
    console.log(`[Udupi Popup] About to send ${totalPosts} posts to API`);

    // Send posts in batches
    const totalImported = await sendPostsInBatches(
      response.posts,
      apiUrl,
      apiKey,
      tab.url,
      response.groupName,
      showStatus
    );

    showStatus(`✓ ${totalImported} posts sent successfully!`, 'success');
    
    // Clear selection
    await chrome.tabs.sendMessage(tab.id, { action: 'clearSelection' });
    document.getElementById('postsSelected').textContent = '0';
    
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
  
  document.getElementById('extractBtn').disabled = false;
});

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status show ${type}`;
  
  // Auto-hide success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      status.className = 'status';
    }, 5000);
  }
}
