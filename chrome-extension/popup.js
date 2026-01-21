// Load saved configuration
document.addEventListener('DOMContentLoaded', async () => {
  const config = await chrome.storage.local.get(['apiUrl', 'apiKey']);
  if (config.apiUrl) document.getElementById('apiUrl').value = config.apiUrl;
  if (config.apiKey) document.getElementById('apiKey').value = config.apiKey;

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

// Save configuration
document.getElementById('saveConfig').addEventListener('click', async () => {
  const apiUrl = document.getElementById('apiUrl').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  
  await chrome.storage.local.set({ apiUrl, apiKey });
  showStatus('Configuration saved!', 'success');
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

    showStatus(`Found ${response.posts.length} recent posts. Sending to server...`, 'info');

    // Send to API
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'apikey': apiKey
      },
      body: JSON.stringify({
        posts: response.posts,
        source_url: tab.url,
        group_name: response.groupName
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`API error: ${errorText}`);
    }

    const result = await apiResponse.json();
    showStatus(`✓ ${result.imported || response.posts.length} posts imported successfully!`, 'success');
    
    // Update stats
    document.getElementById('postsSelected').textContent = '0';
    
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
  
  document.getElementById('extractRecentBtn').disabled = false;
});

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
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractSelected' });
    
    if (!response || !response.posts || response.posts.length === 0) {
      showStatus('No posts selected', 'error');
      document.getElementById('extractBtn').disabled = false;
      return;
    }

    showStatus(`Sending ${response.posts.length} posts to server...`, 'info');

    // Send to API
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'apikey': apiKey
      },
      body: JSON.stringify({
        posts: response.posts,
        source_url: tab.url,
        group_name: response.groupName
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`API error: ${errorText}`);
    }

    const result = await apiResponse.json();
    showStatus(`✓ ${result.imported || response.posts.length} posts sent successfully!`, 'success');
    
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
