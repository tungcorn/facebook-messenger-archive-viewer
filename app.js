(function () {
  // ================= STATE & CONFIG =================
  const DEFAULT_ALIASES = {};

  let savedAliases = {};
  try {
    savedAliases = JSON.parse(localStorage.getItem('fb_msg_aliases') || '{}');
  } catch (e) {
    savedAliases = {};
  }
  const aliases = Object.assign({}, DEFAULT_ALIASES, savedAliases);
  let ownerName = localStorage.getItem('fb_msg_owner') || 'You';

  const state = {
    theme: localStorage.getItem('fb_msg_theme') || 'classic',
    darkMode: localStorage.getItem('fb_msg_dark') === 'true',
    selectedCategory: 'all',
    searchConvQuery: '',
    activeConvId: null,
    activeChatData: null,
    windowStart: 0,
    windowEnd: 0,
    chunkSize: 100,
    drawerTab: 'photos',
    searchInChatResults: [],
    searchInChatIndex: -1,
    lightboxIndex: 0,
    lightboxList: [],
    browserFilesMap: null,
    conversations: []
  };

  // ================= DOM ELEMENT REFERENCES =================
  // Cached cleanly at startup
  const DOM = {
    welcomeScreen: document.getElementById('welcomeScreen'),
    browserFolderPicker: document.getElementById('browserFolderPicker'),
    btnOpenSettings: document.getElementById('btnOpenSettings'),
    btnToggleDark: document.getElementById('btnToggleDark'),
    statOwnerName: document.getElementById('statOwnerName'),
    statConvCount: document.getElementById('statConvCount'),
    statMsgCount: document.getElementById('statMsgCount'),
    statPhotoCount: document.getElementById('statPhotoCount'),
    statVideoCount: document.getElementById('statVideoCount'),
    statAudioCount: document.getElementById('statAudioCount'),
    statFileCount: document.getElementById('statFileCount'),
    catCountAll: document.getElementById('catCountAll'),
    catCountInbox: document.getElementById('catCountInbox'),
    catCountE2EE: document.getElementById('catCountE2EE'),
    catCountArchived: document.getElementById('catCountArchived'),
    catCountRequests: document.getElementById('catCountRequests'),
    convSearchInput: document.getElementById('convSearchInput'),
    convListContainer: document.getElementById('convListContainer'),
    filterChips: document.querySelectorAll('.filter-chip'),
    
    // Chat Header
    headerAvatar: document.getElementById('headerAvatar'),
    headerTitle: document.getElementById('headerTitle'),
    headerSubtitle: document.getElementById('headerSubtitle'),
    btnEditAlias: document.getElementById('btnEditAlias'),
    btnOpenSearch: document.getElementById('btnOpenSearch'),
    btnThemeMenu: document.getElementById('btnThemeMenu'),
    themeDropdown: document.getElementById('themeDropdown'),
    btnToggleDrawer: document.getElementById('btnToggleDrawer'),
    
    // In-chat Search
    searchPanel: document.getElementById('searchPanel'),
    inChatSearchInput: document.getElementById('inChatSearchInput'),
    searchCounter: document.getElementById('searchCounter'),
    btnPrevMatch: document.getElementById('btnPrevMatch'),
    btnNextMatch: document.getElementById('btnNextMatch'),
    btnCloseSearch: document.getElementById('btnCloseSearch'),
    
    // Feed & Scroll
    messagesFeed: document.getElementById('messagesFeed'),
    btnScrollBottom: document.getElementById('btnScrollBottom'),
    
    // Right Drawer
    rightDrawer: document.getElementById('rightDrawer'),
    drawerContent: document.getElementById('drawerContent'),
    btnCloseDrawer: document.getElementById('btnCloseDrawer'),
    drawerPhotoCount: document.getElementById('drawerPhotoCount'),
    drawerVideoCount: document.getElementById('drawerVideoCount'),
    drawerAudioCount: document.getElementById('drawerAudioCount'),
    drawerFileCount: document.getElementById('drawerFileCount'),
    drawerTabs: document.querySelectorAll('.drawer-tab'),
    
    // Modals
    renameModal: document.getElementById('renameModal'),
    renameInput: document.getElementById('renameInput'),
    btnCancelRename: document.getElementById('btnCancelRename'),
    btnSaveRename: document.getElementById('btnSaveRename'),
    
    settingsModal: document.getElementById('settingsModal'),
    ownerNameInput: document.getElementById('ownerNameInput'),
    aliasListTable: document.getElementById('aliasListTable'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    
    // Lightbox
    lightboxModal: document.getElementById('lightboxModal'),
    lightboxMediaContainer: document.getElementById('lightboxMediaContainer'),
    lightboxCaption: document.getElementById('lightboxCaption'),
    btnCloseLightbox: document.getElementById('btnCloseLightbox'),
    btnLightboxPrev: document.getElementById('btnLightboxPrev'),
    btnLightboxNext: document.getElementById('btnLightboxNext')
  };

  // ================= THEME SYSTEM =================
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
    document.body.setAttribute('data-color', state.theme);
  }
  applyTheme();

  if (DOM.btnToggleDark) {
    DOM.btnToggleDark.addEventListener('click', () => {
      state.darkMode = !state.darkMode;
      localStorage.setItem('fb_msg_dark', state.darkMode);
      applyTheme();
    });
  }

  if (DOM.btnThemeMenu && DOM.themeDropdown) {
    DOM.btnThemeMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      DOM.themeDropdown.classList.toggle('active');
    });
    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        state.theme = item.getAttribute('data-theme-color');
        localStorage.setItem('fb_msg_theme', state.theme);
        applyTheme();
        DOM.themeDropdown.classList.remove('active');
      });
    });
    document.addEventListener('click', () => DOM.themeDropdown.classList.remove('active'));
  }

  // ================= ALIAS & OWNER MANAGEMENT =================
  function getEffectiveTitle(title, folder) {
    if (folder && aliases[folder]) return aliases[folder];
    if (title && aliases[title]) return aliases[title];
    return title;
  }

  function saveAliases() {
    localStorage.setItem('fb_msg_aliases', JSON.stringify(aliases));
  }

  let currentRenameTarget = null;
  if (DOM.btnEditAlias && DOM.renameModal) {
    DOM.btnEditAlias.addEventListener('click', () => {
      if (!state.activeConvId) return;
      const conv = state.conversations.find(c => c.id === state.activeConvId);
      if (!conv) return;

      currentRenameTarget = conv;
      DOM.renameInput.value = conv.effectiveTitle || conv.title;
      DOM.renameModal.classList.add('active');
      DOM.renameInput.focus();
    });

    DOM.btnCancelRename.addEventListener('click', () => {
      DOM.renameModal.classList.remove('active');
    });

    DOM.btnSaveRename.addEventListener('click', () => {
      const val = DOM.renameInput.value.trim();
      if (val && currentRenameTarget) {
        if (currentRenameTarget.folder) {
          aliases[currentRenameTarget.folder] = val;
        }
        aliases[currentRenameTarget.title] = val;
        saveAliases();
        currentRenameTarget.effectiveTitle = val;

        DOM.headerTitle.innerText = val;
        renderConversationList();
      }
      DOM.renameModal.classList.remove('active');
    });
  }

  if (DOM.btnOpenSettings && DOM.settingsModal) {
    DOM.btnOpenSettings.addEventListener('click', () => {
      DOM.ownerNameInput.value = ownerName;
      renderAliasList();
      DOM.settingsModal.classList.add('active');
    });

    DOM.btnCloseSettings.addEventListener('click', () => {
      DOM.settingsModal.classList.remove('active');
    });

    DOM.btnSaveSettings.addEventListener('click', () => {
      ownerName = DOM.ownerNameInput.value.trim() || 'You';
      localStorage.setItem('fb_msg_owner', ownerName);
      if (DOM.statOwnerName) DOM.statOwnerName.innerText = ownerName;
      DOM.settingsModal.classList.remove('active');
      if (state.activeChatData) {
        renderMessagesFeed(false, true);
      }
    });
  }

  function renderAliasList() {
    if (!DOM.aliasListTable) return;
    let html = '';
    const keys = Object.keys(aliases);
    if (keys.length === 0) {
      html = '<div style="color:var(--text-muted); padding:4px;">No custom aliases set yet.</div>';
    } else {
      keys.forEach(k => {
        html += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid var(--border-color);">
            <span><strong>${escapeHtml(k)}</strong> ➔ ${escapeHtml(aliases[k])}</span>
            <button style="border:none; background:transparent; color:#e0245e; cursor:pointer; font-size:14px;" onclick="window.__removeAlias('${escapeHtml(k)}')">✕</button>
          </div>
        `;
      });
    }
    DOM.aliasListTable.innerHTML = html;
  }

  window.__removeAlias = function (key) {
    delete aliases[key];
    saveAliases();
    renderAliasList();
    renderConversationList();
  };

  // ================= UTILITIES =================
  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatShortDate(timeStr) {
    if (!timeStr) return '';
    const m = timeStr.match(/Tháng\s+(\d+)\s+(\d+),\s+(\d{4})/i);
    if (m) return `${m[2]}/${m[1]}/${m[3].slice(-2)}`;
    return timeStr.slice(0, 10);
  }

  function formatDateHeader(timeStr) {
    if (!timeStr) return '';
    return timeStr.replace(/\d+:\d+(?::\d+)?\s*(?:ch|sa|sáng|chiều|tối)?/i, '').trim();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function senderAlias(name, folder) {
    if (folder && aliases[folder]) return aliases[folder];
    if (aliases[name]) return aliases[name];
    return name;
  }

  // ================= CONVERSATION LIST =================
  function renderConversationList() {
    if (!DOM.convListContainer) return;
    const query = state.searchConvQuery;
    const cat = state.selectedCategory;

    const filtered = state.conversations.filter(c => {
      if (cat !== 'all') {
        if (cat === 'e2ee' && !c.category.includes('e2ee')) return false;
        if (cat !== 'e2ee' && c.category !== cat) return false;
      }
      const displayTitle = (c.effectiveTitle || c.title || '').toLowerCase();
      if (query && !displayTitle.includes(query)) return false;
      return true;
    });

    let html = '';
    filtered.forEach(c => {
      const isActive = (c.id === state.activeConvId) ? 'active' : '';
      const displayTitle = c.effectiveTitle || c.title;
      const initials = getInitials(displayTitle);

      html += `
        <div class="conv-card ${isActive}" data-id="${c.id}">
          <div class="conv-avatar-wrap">
            <div class="conv-avatar">${initials}</div>
            <div class="conv-online-dot"></div>
          </div>
          <div class="conv-body">
            <div class="conv-top-line">
              <div class="conv-title">${escapeHtml(displayTitle)}</div>
              <div class="conv-time">${formatShortDate(c.last_time)}</div>
            </div>
            <div class="conv-bottom-line">
              <div class="conv-preview">${escapeHtml(c.last_message || '...')}</div>
              <div class="conv-msg-count">${(c.total_messages || 0).toLocaleString()} msgs</div>
            </div>
          </div>
        </div>
      `;
    });

    DOM.convListContainer.innerHTML = html;

    document.querySelectorAll('.conv-card').forEach(card => {
      card.addEventListener('click', () => {
        selectConversation(card.getAttribute('data-id'));
      });
    });
  }

  if (DOM.convSearchInput) {
    DOM.convSearchInput.addEventListener('input', () => {
      state.searchConvQuery = DOM.convSearchInput.value.trim().toLowerCase();
      renderConversationList();
    });
  }

  DOM.filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      DOM.filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.selectedCategory = chip.getAttribute('data-category');
      renderConversationList();
    });
  });

  // ================= CONVERSATION SELECTION =================
  window.selectConversation = async function (convId) {
    state.activeConvId = convId;
    renderConversationList();

    const conv = state.conversations.find(c => c.id === convId);
    if (!conv) return;

    const displayTitle = conv.effectiveTitle || conv.title;
    if (DOM.headerAvatar) DOM.headerAvatar.innerText = getInitials(displayTitle);
    if (DOM.headerTitle) DOM.headerTitle.innerText = displayTitle;
    if (DOM.headerSubtitle) DOM.headerSubtitle.innerText = `${(conv.total_messages || 0).toLocaleString()} messages • ${conv.first_time || ''} to ${conv.last_time || ''}`;
    if (DOM.btnEditAlias) DOM.btnEditAlias.style.display = 'block';

    if (DOM.searchPanel) DOM.searchPanel.classList.remove('active');
    state.searchInChatResults = [];

    // Check precompiled data
    if (window.MESSENGER_CHATS && window.MESSENGER_CHATS[convId]) {
      activateChatData(window.MESSENGER_CHATS[convId]);
      return;
    }

    if (!state.browserFilesMap) {
      if (DOM.messagesFeed) {
        DOM.messagesFeed.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">⏳</div>
            <h3>Loading conversation...</h3>
          </div>
        `;
      }
      const script = document.createElement('script');
      script.src = `data/chats/${convId}.js`;
      script.onload = () => {
        if (window.MESSENGER_CHATS && window.MESSENGER_CHATS[convId]) {
          activateChatData(window.MESSENGER_CHATS[convId]);
        }
      };
      script.onerror = () => {
        if (DOM.messagesFeed) {
          DOM.messagesFeed.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">⚠️</div>
              <h3>Could not load conversation data</h3>
              <p>Please make sure data/chats/${convId}.js exists.</p>
            </div>
          `;
        }
      };
      document.head.appendChild(script);
    } else {
      await parseConversationFromBrowserFiles(conv);
    }
  };

  const browserFileUrlCache = new Map();
  function resolveBrowserFileUrl(relPath) {
    if (!state.browserFilesMap || !relPath) return relPath;
    if (browserFileUrlCache.has(relPath)) return browserFileUrlCache.get(relPath);

    const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
    let foundFile = null;

    // Direct suffix match
    for (let [k, file] of state.browserFilesMap.entries()) {
      if (k.endsWith(normalized)) {
        foundFile = file;
        break;
      }
    }
    // Fallback: match by basename
    if (!foundFile) {
      const baseName = normalized.split('/').pop();
      for (let [k, file] of state.browserFilesMap.entries()) {
        if (k.endsWith('/' + baseName) || k === baseName) {
          foundFile = file;
          break;
        }
      }
    }

    if (foundFile) {
      const url = URL.createObjectURL(foundFile);
      browserFileUrlCache.set(relPath, url);
      return url;
    }
    return relPath;
  }

  async function parseConversationFromBrowserFiles(conv) {
    if (DOM.messagesFeed) {
      DOM.messagesFeed.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⏳</div>
          <h3>Parsing conversation in browser...</h3>
        </div>
      `;
    }

    const allMsgs = [];
    let totalPhotos = 0, totalVideos = 0, totalAudios = 0, totalFiles = 0;

    conv.htmlFiles.sort((a, b) => {
      const na = parseInt((a.name.match(/\d+/) || [1])[0]);
      const nb = parseInt((b.name.match(/\d+/) || [1])[0]);
      return nb - na;
    });

    for (let fObj of conv.htmlFiles) {
      const htmlText = await fObj.file.text();
      const clean = htmlText.replace(/<section class="_a6-g"[^>]*>\s*<h2[^>]*>Hiệu ứng từ ngữ<\/h2>[\s\S]*?<\/section>\s*<\/div>\s*<\/section>/gi, '');
      const regex = /<section class="_a6-g"[^>]*>\s*<h2 class="_2ph_ _a6-h _a6-i"[^>]*>(.*?)<\/h2>\s*<div class="_2ph_ _a6-p">([\s\S]*?)<\/div>\s*<footer class="_3-94 _a6-o">\s*<div class="_a72d">(.*?)<\/div>\s*<\/footer>\s*<\/section>/gi;
      let match;
      const fileMsgs = [];
      while ((match = regex.exec(clean)) !== null) {
        fileMsgs.push({ sender: match[1].trim(), body: match[2], timeStr: match[3].trim() });
      }
      fileMsgs.reverse().forEach(m => {
        const tmp = document.createElement('div');
        tmp.innerHTML = m.body;

        const photos = [];
        const stickers = [];
        const videos = [];
        const audios = [];

        tmp.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src') || '';
          if (src.includes('photos/') || src.includes('gifs/')) {
            photos.push(resolveBrowserFileUrl(src));
            totalPhotos++;
          } else if (src.includes('stickers')) {
            stickers.push(resolveBrowserFileUrl(src));
          }
        });

        tmp.querySelectorAll('video').forEach(v => {
          const src = v.getAttribute('src') || '';
          if (src) {
            videos.push(resolveBrowserFileUrl(src));
            totalVideos++;
          }
        });

        tmp.querySelectorAll('audio').forEach(a => {
          const src = a.getAttribute('src') || '';
          if (src) {
            audios.push(resolveBrowserFileUrl(src));
            totalAudios++;
          }
        });

        tmp.querySelectorAll('img, video, audio').forEach(el => el.remove());

        const msgObj = {
          id: allMsgs.length + 1,
          s: senderAlias(m.sender, conv.folder),
          is_me: (m.sender === ownerName) ? 1 : 0,
          t: m.timeStr,
          text: tmp.innerText.trim()
        };
        if (photos.length > 0) msgObj.photos = photos;
        if (stickers.length > 0) msgObj.stickers = stickers;
        if (videos.length > 0) msgObj.videos = videos;
        if (audios.length > 0) msgObj.audios = audios;

        allMsgs.push(msgObj);
      });
    }

    const chatData = {
      id: conv.id,
      title: conv.effectiveTitle || conv.title,
      stats: { total: allMsgs.length, photos: totalPhotos, videos: totalVideos, audios: totalAudios, files: totalFiles },
      messages: allMsgs
    };
    activateChatData(chatData);
  }

  function activateChatData(chatData) {
    state.activeChatData = chatData;
    const msgs = chatData.messages;
    state.windowStart = Math.max(0, msgs.length - 120);
    state.windowEnd = msgs.length;

    if (DOM.drawerPhotoCount) DOM.drawerPhotoCount.innerText = chatData.stats.photos || 0;
    if (DOM.drawerVideoCount) DOM.drawerVideoCount.innerText = chatData.stats.videos || 0;
    if (DOM.drawerAudioCount) DOM.drawerAudioCount.innerText = chatData.stats.audios || 0;
    if (DOM.drawerFileCount) DOM.drawerFileCount.innerText = chatData.stats.files || 0;

    renderMessagesFeed(true);
    renderDrawerContent();
  }

  // ================= MESSAGES FEED =================
  function formatMessageHtml(msg, prevMsg, nextMsg) {
    const isMe = (msg.is_me === 1 || msg.s === ownerName);
    const senderClass = isMe ? 'out' : 'in';

    const isPrevSame = prevMsg && (prevMsg.s === msg.s) && Math.abs((msg.ts || 0) - (prevMsg.ts || 0)) < 180;
    const isNextSame = nextMsg && (nextMsg.s === msg.s) && Math.abs((nextMsg.ts || 0) - (msg.ts || 0)) < 180;

    let groupClass = '';
    if (isPrevSame && isNextSame) groupClass = 'grouped-middle';
    else if (isPrevSame) groupClass = 'grouped-bottom';
    else if (isNextSame) groupClass = 'grouped-top';

    const showAvatar = (!isMe && !isNextSame);
    const showSenderLabel = (!isMe && !isPrevSame);

    let dateHtml = '';
    if (!prevMsg || (prevMsg.t && msg.t && prevMsg.t.slice(0, 10) !== msg.t.slice(0, 10))) {
      dateHtml = `<div class="date-separator">${formatDateHeader(msg.t)}</div>`;
    }

    let bodyInner = '';
    if (msg.text) {
      bodyInner += `<div>${escapeHtml(msg.text).replace(/\n/g, '<br/>')}</div>`;
    }

    if (msg.photos && msg.photos.length > 0) {
      bodyInner += `<div class="msg-photos">`;
      msg.photos.forEach(p => {
        bodyInner += `<img src="${p}" class="chat-photo-thumb" loading="lazy" onclick="window.openLightbox('${p}', '${escapeHtml(msg.t)}', '${escapeHtml(msg.s)}')" onerror="this.style.display='none'" />`;
      });
      bodyInner += `</div>`;
    }

    if (msg.stickers && msg.stickers.length > 0) {
      msg.stickers.forEach(stk => {
        bodyInner += `<div><img src="${stk}" class="chat-sticker-img" loading="lazy" onerror="this.style.display='none'" /></div>`;
      });
    }

    if (msg.videos && msg.videos.length > 0) {
      msg.videos.forEach(v => {
        bodyInner += `<div class="msg-video"><video src="${v}" controls preload="metadata"></video></div>`;
      });
    }

    if (msg.audios && msg.audios.length > 0) {
      msg.audios.forEach(a => {
        bodyInner += `<div class="msg-audio"><audio src="${a}" controls preload="none"></audio></div>`;
      });
    }

    if (msg.files && msg.files.length > 0) {
      msg.files.forEach(f => {
        const fname = f.split('/').pop();
        bodyInner += `<a href="${f}" download class="msg-file-card" target="_blank"><span>📄</span><span class="file-card-name">${escapeHtml(fname)}</span></a>`;
      });
    }

    let reactionHtml = '';
    if (msg.reactions && msg.reactions.length > 0) {
      const r = msg.reactions[0];
      reactionHtml = `<div class="reaction-pill" title="${escapeHtml(r.user || '')} reacted ${r.emoji}">${r.emoji}</div>`;
    }

    const displaySender = senderAlias(msg.s, state.activeChatData ? state.activeChatData.folder : null);

    return `
      ${dateHtml}
      <div class="msg-row ${senderClass} ${groupClass} ${showAvatar ? 'show-avatar' : ''}" id="msg-${msg.id}">
        <div class="msg-avatar">${getInitials(displaySender)}</div>
        <div class="msg-bubble-wrap">
          ${showSenderLabel ? `<div class="msg-sender-label">${escapeHtml(displaySender)}</div>` : ''}
          <div class="msg-bubble">
            ${bodyInner}
            ${reactionHtml}
          </div>
          <div class="time-tooltip">${escapeHtml(msg.t)}</div>
        </div>
      </div>
    `;
  }

  function renderMessagesFeed(scrollToBottom = false, keepScrollPos = false) {
    if (!state.activeChatData || !DOM.messagesFeed) return;
    const msgs = state.activeChatData.messages;

    let prevScrollHeight = DOM.messagesFeed.scrollHeight;
    let prevScrollTop = DOM.messagesFeed.scrollTop;

    let html = '';
    for (let i = state.windowStart; i < state.windowEnd; i++) {
      const prev = (i > 0) ? msgs[i - 1] : null;
      const curr = msgs[i];
      const next = (i < msgs.length - 1) ? msgs[i + 1] : null;
      html += formatMessageHtml(curr, prev, next);
    }
    DOM.messagesFeed.innerHTML = html;

    if (scrollToBottom) {
      DOM.messagesFeed.scrollTop = DOM.messagesFeed.scrollHeight;
    } else if (keepScrollPos) {
      const heightDiff = DOM.messagesFeed.scrollHeight - prevScrollHeight;
      DOM.messagesFeed.scrollTop = prevScrollTop + heightDiff;
    }
  }

  if (DOM.messagesFeed) {
    let isFetching = false;
    DOM.messagesFeed.addEventListener('scroll', () => {
      if (!state.activeChatData) return;
      const total = state.activeChatData.messages.length;

      if (DOM.messagesFeed.scrollHeight - DOM.messagesFeed.scrollTop - DOM.messagesFeed.clientHeight > 350) {
        if (DOM.btnScrollBottom) DOM.btnScrollBottom.classList.add('active');
      } else {
        if (DOM.btnScrollBottom) DOM.btnScrollBottom.classList.remove('active');
      }

      if (DOM.messagesFeed.scrollTop < 120 && state.windowStart > 0 && !isFetching) {
        isFetching = true;
        state.windowStart = Math.max(0, state.windowStart - state.chunkSize);
        renderMessagesFeed(false, true);
        isFetching = false;
      }

      if (DOM.messagesFeed.scrollTop + DOM.messagesFeed.clientHeight > DOM.messagesFeed.scrollHeight - 120 && state.windowEnd < total && !isFetching) {
        isFetching = true;
        state.windowEnd = Math.min(total, state.windowEnd + state.chunkSize);
        renderMessagesFeed(false, false);
        isFetching = false;
      }
    });
  }

  if (DOM.btnScrollBottom) {
    DOM.btnScrollBottom.addEventListener('click', () => {
      if (!state.activeChatData) return;
      const total = state.activeChatData.messages.length;
      state.windowStart = Math.max(0, total - 120);
      state.windowEnd = total;
      renderMessagesFeed(true);
    });
  }

  // ================= IN-CHAT KEYWORD SEARCH =================
  if (DOM.btnOpenSearch && DOM.searchPanel) {
    DOM.btnOpenSearch.addEventListener('click', () => {
      if (!state.activeChatData) return;
      DOM.searchPanel.classList.toggle('active');
      if (DOM.searchPanel.classList.contains('active') && DOM.inChatSearchInput) {
        DOM.inChatSearchInput.focus();
      }
    });

    if (DOM.btnCloseSearch) {
      DOM.btnCloseSearch.addEventListener('click', () => {
        DOM.searchPanel.classList.remove('active');
        state.searchInChatResults = [];
        if (DOM.searchCounter) DOM.searchCounter.innerText = '';
      });
    }

    if (DOM.inChatSearchInput) {
      DOM.inChatSearchInput.addEventListener('input', () => {
        const query = DOM.inChatSearchInput.value.trim().toLowerCase();
        if (!query || !state.activeChatData) {
          state.searchInChatResults = [];
          state.searchInChatIndex = -1;
          if (DOM.searchCounter) DOM.searchCounter.innerText = '';
          return;
        }

        const msgs = state.activeChatData.messages;
        const matches = [];
        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i].text && msgs[i].text.toLowerCase().includes(query)) {
            matches.push(i);
          }
        }

        state.searchInChatResults = matches;
        state.searchInChatIndex = matches.length > 0 ? 0 : -1;
        updateSearchCounter();
        if (matches.length > 0) {
          jumpToMessageIndex(matches[0]);
        }
      });
    }

    function updateSearchCounter() {
      if (!DOM.searchCounter) return;
      if (state.searchInChatResults.length === 0) {
        DOM.searchCounter.innerText = '0 results';
      } else {
        DOM.searchCounter.innerText = `${state.searchInChatIndex + 1} of ${state.searchInChatResults.length}`;
      }
    }

    if (DOM.btnNextMatch) {
      DOM.btnNextMatch.addEventListener('click', () => {
        if (state.searchInChatResults.length === 0) return;
        state.searchInChatIndex = (state.searchInChatIndex + 1) % state.searchInChatResults.length;
        updateSearchCounter();
        jumpToMessageIndex(state.searchInChatResults[state.searchInChatIndex]);
      });
    }

    if (DOM.btnPrevMatch) {
      DOM.btnPrevMatch.addEventListener('click', () => {
        if (state.searchInChatResults.length === 0) return;
        state.searchInChatIndex = (state.searchInChatIndex - 1 + state.searchInChatResults.length) % state.searchInChatResults.length;
        updateSearchCounter();
        jumpToMessageIndex(state.searchInChatResults[state.searchInChatIndex]);
      });
    }
  }

  function jumpToMessageIndex(idx) {
    if (!state.activeChatData) return;
    const msgs = state.activeChatData.messages;
    state.windowStart = Math.max(0, idx - 40);
    state.windowEnd = Math.min(msgs.length, idx + 80);
    renderMessagesFeed(false);

    setTimeout(() => {
      const target = document.getElementById(`msg-${msgs[idx].id}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const bubble = target.querySelector('.msg-bubble');
        if (bubble) {
          bubble.style.outline = '2px solid var(--primary)';
          setTimeout(() => { bubble.style.outline = 'none'; }, 2000);
        }
      }
    }, 50);
  }

  // ================= RIGHT DRAWER =================
  if (DOM.btnToggleDrawer && DOM.rightDrawer) {
    DOM.btnToggleDrawer.addEventListener('click', () => {
      DOM.rightDrawer.classList.toggle('collapsed');
    });
    if (DOM.btnCloseDrawer) {
      DOM.btnCloseDrawer.addEventListener('click', () => {
        DOM.rightDrawer.classList.add('collapsed');
      });
    }

    DOM.drawerTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        DOM.drawerTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.drawerTab = tab.getAttribute('data-drawer-tab');
        renderDrawerContent();
      });
    });
  }

  function renderDrawerContent() {
    if (!state.activeChatData || !DOM.drawerContent) return;
    const tab = state.drawerTab;
    const msgs = state.activeChatData.messages;

    if (tab === 'photos') {
      const photos = [];
      msgs.forEach(m => {
        (m.photos || []).forEach(p => photos.push({ src: p, time: m.t, sender: m.s }));
      });
      if (photos.length === 0) {
        DOM.drawerContent.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">No photos shared in this chat</div>';
        return;
      }
      let html = `<div class="media-grid">`;
      photos.forEach((p, idx) => {
        html += `
          <div class="media-grid-item" onclick="window.openDrawerLightbox(${idx}, 'photos')">
            <img src="${p.src}" loading="lazy" onerror="this.parentElement.style.display='none'" />
          </div>
        `;
      });
      html += `</div>`;
      DOM.drawerContent.innerHTML = html;
    } else if (tab === 'videos') {
      const videos = [];
      msgs.forEach(m => {
        (m.videos || []).forEach(v => videos.push({ src: v, time: m.t, sender: m.s }));
      });
      if (videos.length === 0) {
        DOM.drawerContent.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">No videos shared in this chat</div>';
        return;
      }
      let html = `<div class="media-grid">`;
      videos.forEach((v, idx) => {
        html += `
          <div class="media-grid-item" onclick="window.openDrawerLightbox(${idx}, 'videos')">
            <video src="${v.src}" preload="metadata"></video>
            <div class="badge-video">▶ Video</div>
          </div>
        `;
      });
      html += `</div>`;
      DOM.drawerContent.innerHTML = html;
    } else if (tab === 'audios') {
      const audios = [];
      msgs.forEach(m => {
        (m.audios || []).forEach(a => audios.push({ src: a, time: m.t, sender: m.s }));
      });
      if (audios.length === 0) {
        DOM.drawerContent.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">No voice notes in this chat</div>';
        return;
      }
      let html = '';
      audios.forEach(a => {
        html += `
          <div class="media-list-item">
            <div class="media-list-meta">
              <strong>${escapeHtml(a.sender)}</strong>
              <span>${escapeHtml(a.time)}</span>
            </div>
            <audio src="${a.src}" controls preload="none" style="width:100%;height:32px;"></audio>
          </div>
        `;
      });
      DOM.drawerContent.innerHTML = html;
    } else if (tab === 'files') {
      const files = [];
      msgs.forEach(m => {
        (m.files || []).forEach(f => files.push({ src: f, time: m.t, sender: m.s }));
      });
      if (files.length === 0) {
        DOM.drawerContent.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">No files shared in this chat</div>';
        return;
      }
      let html = '';
      files.forEach(f => {
        const fname = f.src.split('/').pop();
        html += `
          <div class="media-list-item">
            <div class="media-list-meta">
              <span>${escapeHtml(f.sender)}</span>
              <span>${escapeHtml(f.time)}</span>
            </div>
            <a href="${f.src}" download target="_blank" class="media-list-link">📄 ${escapeHtml(fname)}</a>
          </div>
        `;
      });
      DOM.drawerContent.innerHTML = html;
    }
  }

  // ================= LIGHTBOX =================
  window.openLightbox = function (src, time, sender) {
    if (!DOM.lightboxModal || !DOM.lightboxMediaContainer) return;
    DOM.lightboxMediaContainer.innerHTML = `<img src="${src}" />`;
    if (DOM.lightboxCaption) DOM.lightboxCaption.innerHTML = `<strong>${escapeHtml(sender)}</strong> • ${escapeHtml(time)}`;
    state.lightboxList = [{ src, time, sender }];
    state.lightboxIndex = 0;
    DOM.lightboxModal.classList.add('active');
  };

  window.openDrawerLightbox = function (idx, type) {
    if (!DOM.lightboxModal || !DOM.lightboxMediaContainer) return;
    const msgs = state.activeChatData.messages;
    const list = [];
    msgs.forEach(m => {
      (m[type] || []).forEach(src => list.push({ src, time: m.t, sender: m.s, isVideo: (type === 'videos') }));
    });
    state.lightboxList = list;
    state.lightboxIndex = idx;
    updateLightboxView();
    DOM.lightboxModal.classList.add('active');
  };

  function updateLightboxView() {
    const item = state.lightboxList[state.lightboxIndex];
    if (!item || !DOM.lightboxMediaContainer) return;
    if (item.isVideo || item.src.endsWith('.mp4')) {
      DOM.lightboxMediaContainer.innerHTML = `<video src="${item.src}" controls autoplay style="max-width:90vw;max-height:85vh;"></video>`;
    } else {
      DOM.lightboxMediaContainer.innerHTML = `<img src="${item.src}" />`;
    }
    if (DOM.lightboxCaption) {
      DOM.lightboxCaption.innerHTML = `<strong>${escapeHtml(item.sender)}</strong> • ${escapeHtml(item.time)} (${state.lightboxIndex + 1} / ${state.lightboxList.length})`;
    }
  }

  if (DOM.btnCloseLightbox) {
    DOM.btnCloseLightbox.addEventListener('click', () => {
      DOM.lightboxModal.classList.remove('active');
      DOM.lightboxMediaContainer.innerHTML = '';
    });
  }

  if (DOM.btnLightboxNext) {
    DOM.btnLightboxNext.addEventListener('click', () => {
      if (!state.lightboxList.length) return;
      state.lightboxIndex = (state.lightboxIndex + 1) % state.lightboxList.length;
      updateLightboxView();
    });
  }

  if (DOM.btnLightboxPrev) {
    DOM.btnLightboxPrev.addEventListener('click', () => {
      if (!state.lightboxList.length) return;
      state.lightboxIndex = (state.lightboxIndex - 1 + state.lightboxList.length) % state.lightboxList.length;
      updateLightboxView();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!DOM.lightboxModal || !DOM.lightboxModal.classList.contains('active')) return;
    if (e.key === 'Escape') DOM.lightboxModal.classList.remove('active');
    if (e.key === 'ArrowRight' && DOM.btnLightboxNext) DOM.btnLightboxNext.click();
    if (e.key === 'ArrowLeft' && DOM.btnLightboxPrev) DOM.btnLightboxPrev.click();
  });

  // ================= APP BOOTSTRAP =================
  function initAppWithIndex(indexData) {
    if (DOM.welcomeScreen) DOM.welcomeScreen.classList.add('hidden');
    ownerName = indexData.user || ownerName;
    if (DOM.statOwnerName) DOM.statOwnerName.innerText = ownerName;

    state.conversations = indexData.conversations.map(c => {
      c.effectiveTitle = getEffectiveTitle(c.title, c.folder);
      return c;
    });

    if (DOM.statConvCount) DOM.statConvCount.innerText = indexData.stats.total_conversations.toLocaleString();
    if (DOM.statMsgCount) DOM.statMsgCount.innerText = indexData.stats.total_messages.toLocaleString();
    if (DOM.statPhotoCount) DOM.statPhotoCount.innerText = indexData.stats.total_photos.toLocaleString();
    if (DOM.statVideoCount) DOM.statVideoCount.innerText = indexData.stats.total_videos.toLocaleString();
    if (DOM.statAudioCount) DOM.statAudioCount.innerText = indexData.stats.total_audios.toLocaleString();
    if (DOM.statFileCount) DOM.statFileCount.innerText = indexData.stats.total_files.toLocaleString();

    if (DOM.catCountAll) DOM.catCountAll.innerText = state.conversations.length;
    if (DOM.catCountInbox) DOM.catCountInbox.innerText = indexData.categories.inbox || 0;
    if (DOM.catCountE2EE) DOM.catCountE2EE.innerText = indexData.categories.e2ee || 0;
    if (DOM.catCountArchived) DOM.catCountArchived.innerText = indexData.categories.archived || 0;
    if (DOM.catCountRequests) DOM.catCountRequests.innerText = indexData.categories.requests || 0;

    renderConversationList();
    renderWelcomeLanding();
  }

  function renderWelcomeLanding() {
    if (DOM.headerTitle) DOM.headerTitle.innerText = 'Select a conversation';
    if (DOM.headerSubtitle) DOM.headerSubtitle.innerText = `${state.conversations.length} conversations loaded`;
    if (DOM.btnEditAlias) DOM.btnEditAlias.style.display = 'none';

    const topChats = [...state.conversations].sort((a, b) => b.total_messages - a.total_messages).slice(0, 6);

    let chipsHtml = '';
    topChats.forEach(c => {
      chipsHtml += `
        <button onclick="window.selectConversation('${c.id}')" style="background:var(--hover-bg); border:1px solid var(--border-color); border-radius:20px; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:600; color:var(--text-main); display:inline-flex; align-items:center; gap:6px;">
          <span>💬</span>
          <span>${escapeHtml(c.effectiveTitle || c.title)}</span>
          <span style="font-size:11px; color:var(--primary); font-weight:700;">(${(c.total_messages || 0).toLocaleString()} msgs)</span>
        </button>
      `;
    });

    if (DOM.messagesFeed) {
      DOM.messagesFeed.innerHTML = `
        <div class="empty-state" style="padding:40px; text-align:center;">
          <div class="empty-state-icon" style="font-size:54px;">💬</div>
          <h2 style="font-size:22px; margin-top:8px;">Messenger Archive Explorer</h2>
          <p style="color:var(--text-muted); max-width:440px; font-size:14px; margin-top:4px;">
            You have <strong>${state.conversations.length} conversations</strong> in this archive. Click any conversation from the sidebar or choose one below:
          </p>
          <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px; max-width:560px; margin-top:20px;">
            ${chipsHtml}
          </div>
        </div>
      `;
    }
  }

  // ================= BROWSER FOLDER PICKER =================
  if (DOM.browserFolderPicker) {
    DOM.browserFolderPicker.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      if (DOM.welcomeScreen) {
        DOM.welcomeScreen.innerHTML = `
          <div class="welcome-logo">⏳</div>
          <h2>Scanning Facebook Folder...</h2>
          <p style="color:var(--text-muted); margin-top:8px;">Found ${files.length.toLocaleString()} files. Indexing conversations...</p>
        `;
      }

      state.browserFilesMap = new Map();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        state.browserFilesMap.set(f.webkitRelativePath, f);
      }

      const convsMap = new Map();
      for (let [relPath, file] of state.browserFilesMap.entries()) {
        const m = relPath.match(/messages\/(inbox|archived_threads|message_requests|e2ee_cutover|e2ee_cutover_archived)\/([^/]+)\/(message_\d+\.html)$/i);
        if (m) {
          const cat = m[1];
          const folder = m[2];
          const fileName = m[3];
          const convId = `${cat}_${folder}`;

          if (!convsMap.has(convId)) {
            convsMap.set(convId, { id: convId, category: cat, folder: folder, htmlFiles: [] });
          }
          convsMap.get(convId).htmlFiles.push({ name: fileName, file: file });
        }
      }

      const convList = [];
      for (let [convId, obj] of convsMap.entries()) {
        let m1 = obj.htmlFiles.find(h => h.name === 'message_1.html') || obj.htmlFiles[0];
        let title = obj.folder;
        try {
          const text = await m1.file.slice(0, 40000).text();
          const tMatch = text.match(/<title>(.*?)<\/title>/i);
          if (tMatch) title = tMatch[1].trim();
        } catch (err) {}

        convList.push({
          id: convId,
          title: title,
          effectiveTitle: getEffectiveTitle(title, obj.folder),
          category: obj.category,
          folder: obj.folder,
          total_messages: obj.htmlFiles.length * 100,
          last_message: 'Click to load conversation...',
          last_time: '',
          last_ts: 0,
          htmlFiles: obj.htmlFiles
        });
      }

      const syntheticIndex = {
        user: ownerName,
        stats: {
          total_conversations: convList.length,
          total_messages: convList.length * 100,
          total_photos: 0, total_videos: 0, total_audios: 0, total_files: 0
        },
        categories: {
          inbox: convList.filter(c => c.category === 'inbox').length,
          e2ee: convList.filter(c => c.category.includes('e2ee')).length,
          archived: convList.filter(c => c.category === 'archived_threads').length,
          requests: convList.filter(c => c.category === 'message_requests').length
        },
        conversations: convList
      };

      initAppWithIndex(syntheticIndex);
    });
  }

  // Auto-init if precompiled index exists
  if (window.MESSENGER_INDEX) {
    initAppWithIndex(window.MESSENGER_INDEX);
  }
})();
