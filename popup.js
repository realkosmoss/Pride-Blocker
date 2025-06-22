document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('whitelist');
  const btn = document.getElementById('addSiteBtn');
  const status = document.getElementById('statusMsg');

  function getCurrentTabDomain(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs.length) return callback(null);
      try {
        const url = new URL(tabs[0].url);
        callback(url.hostname);
      } catch {
        callback(null);
      }
    });
  }

  function loadWhitelist(callback) {
    chrome.storage.local.get('whitelistedSites', data => {
      callback(data.whitelistedSites || []);
    });
  }

  function saveWhitelist(list, callback) {
    chrome.storage.local.set({ whitelistedSites: list }, callback);
  }

  function render() {
    loadWhitelist(list => {
      listEl.innerHTML = '';
      if (list.length === 0) {
        listEl.innerHTML = '<li><em>No whitelisted sites yet.</em></li>';
        return;
      }

      list.forEach(site => {
        const li = document.createElement('li');
        li.textContent = site;
        const btn = document.createElement('button');
        btn.textContent = 'Remove';
        btn.onclick = () => {
          const newList = list.filter(d => d !== site);
          saveWhitelist(newList, render);
        };
        li.appendChild(btn);
        listEl.appendChild(li);
      });
    });
  }

  btn.addEventListener('click', () => {
    getCurrentTabDomain(domain => {
      if (!domain) {
        status.textContent = 'Could not get current domain.';
        status.style.color = 'red';
        return;
      }

      loadWhitelist(list => {
        if (list.includes(domain)) {
          status.textContent = `"${domain}" is already whitelisted.`;
          return;
        }
        list.push(domain);
        saveWhitelist(list, () => {
          status.textContent = `"${domain}" added to whitelist.`;
          status.style.color = 'green';
          render();
        });
      });
    });
  });

  render();
});
