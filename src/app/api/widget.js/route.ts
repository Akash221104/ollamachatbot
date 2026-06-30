export async function GET() {
  const js = `(function () {
  'use strict';

  if (window.AIChatbot) return; // prevent double init

  let _config = {};
  let _isOpen = false;
  let _isLoading = false;
  let _messages = [];
  let _elements = {};

  // ── Public API ────────────────────────────────────────────
  window.AIChatbot = {
    init: function (options) {
      if (!options.apiKey) { console.error('AIChatbot: apiKey is required'); return; }
      if (!options.userId) { console.error('AIChatbot: userId is required'); return; }

      _config = {
        apiKey:   options.apiKey,
        userId:   String(options.userId),
        userName: options.userName || 'User',
        apiUrl:   options.apiUrl  || '',
        title:    options.title   || 'AI Assistant'
      };

      _injectStyles();
      _buildWidget();
    }
  };

  // ── Styles ────────────────────────────────────────────────
  function _injectStyles() {
    const s = document.createElement('style');
    s.textContent = \`
      #_aichat_btn {
        position: fixed; bottom: 24px; right: 24px; z-index: 999999;
        width: 56px; height: 56px; border-radius: 50%;
        background: #6366f1; border: none; cursor: pointer;
        box-shadow: 0 4px 24px rgba(99,102,241,0.4);
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s;
      }
      #_aichat_btn:hover { transform: scale(1.08); }
      #_aichat_btn svg { width: 26px; height: 26px; fill: white; }

      #_aichat_window {
        position: fixed; bottom: 92px; right: 24px; z-index: 999998;
        width: 380px; height: 560px;
        background: rgba(15,15,25,0.92);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        display: flex; flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px; color: #e2e8f0;
        box-shadow: 0 8px 40px rgba(0,0,0,0.5);
        overflow: hidden;
        transform: scale(0.95) translateY(8px);
        opacity: 0; pointer-events: none;
        transition: all 0.2s ease;
      }
      #_aichat_window._open {
        transform: scale(1) translateY(0);
        opacity: 1; pointer-events: all;
      }

      #_aichat_header {
        padding: 14px 16px;
        background: rgba(99,102,241,0.15);
        border-bottom: 1px solid rgba(255,255,255,0.06);
        display: flex; align-items: center; justify-content: space-between;
      }
      #_aichat_header span { font-weight: 600; font-size: 15px; }
      #_aichat_close {
        background: none; border: none; color: #94a3b8;
        cursor: pointer; font-size: 20px; line-height: 1;
        padding: 0 4px;
      }
      #_aichat_close:hover { color: #e2e8f0; }

      #_aichat_messages {
        flex: 1; overflow-y: auto; padding: 16px;
        display: flex; flex-direction: column; gap: 12px;
        scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
      }

      ._aichat_msg { max-width: 85%; padding: 10px 14px; border-radius: 12px; line-height: 1.5; }
      ._aichat_user { align-self: flex-end; background: #6366f1; color: white; border-radius: 12px 12px 2px 12px; }
      ._aichat_ai { align-self: flex-start; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px 12px 12px 2px; }

      ._aichat_sources {
        margin-top: 6px; font-size: 11px; color: #64748b;
      }
      ._aichat_sources span {
        background: rgba(99,102,241,0.15); color: #818cf8;
        padding: 2px 8px; border-radius: 4px; margin-right: 4px;
        display: inline-block;
      }

      ._aichat_typing { display: flex; gap: 4px; align-items: center; padding: 4px 0; }
      ._aichat_typing span {
        width: 6px; height: 6px; background: #6366f1;
        border-radius: 50%; animation: _aichat_bounce 1s infinite;
      }
      ._aichat_typing span:nth-child(2) { animation-delay: 0.15s; }
      ._aichat_typing span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes _aichat_bounce {
        0%,60%,100% { transform: translateY(0); }
        30% { transform: translateY(-6px); }
      }

      #_aichat_footer {
        padding: 12px; border-top: 1px solid rgba(255,255,255,0.06);
        display: flex; gap: 8px;
      }
      #_aichat_input {
        flex: 1; background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px; color: #e2e8f0;
        padding: 10px 14px; font-size: 14px;
        outline: none; resize: none; font-family: inherit;
      }
      #_aichat_input:focus { border-color: #6366f1; }
      #_aichat_input::placeholder { color: #475569; }
      #_aichat_send {
        background: #6366f1; border: none; color: white;
        border-radius: 8px; padding: 0 16px;
        cursor: pointer; font-size: 18px;
        transition: background 0.2s;
      }
      #_aichat_send:hover { background: #4f46e5; }
      #_aichat_send:disabled { background: #334155; cursor: not-allowed; }

      #_aichat_empty {
        flex: 1; display: flex; align-items: center; justify-content: center;
        text-align: center; color: #475569; padding: 24px;
        flex-direction: column; gap: 8px;
      }
      #_aichat_empty svg { width: 40px; height: 40px; opacity: 0.3; }

      @media (max-width: 440px) {
        #_aichat_window {
          width: 100vw; height: 100vh;
          bottom: 0; right: 0; border-radius: 0;
        }
        #_aichat_btn { bottom: 16px; right: 16px; }
      }
    \`;
    document.head.appendChild(s);
  }

  // ── Build DOM ─────────────────────────────────────────────
  function _buildWidget() {
    // Floating button
    const btn = document.createElement('button');
    btn.id = '_aichat_btn';
    btn.setAttribute('aria-label', 'Open chat');
    btn.innerHTML = \`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>\`;
    btn.onclick = _toggleChat;
    document.body.appendChild(btn);

    // Chat window
    const win = document.createElement('div');
    win.id = '_aichat_window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', _config.title);
    win.innerHTML = \`
      <div id="_aichat_header">
        <span>\${_escHtml(_config.title)}</span>
        <button id="_aichat_close" aria-label="Close chat">&times;</button>
      </div>
      <div id="_aichat_messages">
        <div id="_aichat_empty">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          <p>Ask anything from your assigned knowledge base</p>
        </div>
      </div>
      <div id="_aichat_footer">
        <textarea id="_aichat_input" rows="1" placeholder="Type your message..."></textarea>
        <button id="_aichat_send" aria-label="Send">&#10148;</button>
      </div>
    \`;
    document.body.appendChild(win);

    _elements = {
      win,
      messages: win.querySelector('#_aichat_messages'),
      input:    win.querySelector('#_aichat_input'),
      send:     win.querySelector('#_aichat_send'),
      empty:    win.querySelector('#_aichat_empty')
    };

    win.querySelector('#_aichat_close').onclick = _toggleChat;
    _elements.send.onclick = _handleSend;
    _elements.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _handleSend(); }
    });
  }

  // ── Toggle ────────────────────────────────────────────────
  function _toggleChat() {
    _isOpen = !_isOpen;
    _elements.win.classList.toggle('_open', _isOpen);
    if (_isOpen) setTimeout(() => _elements.input.focus(), 200);
  }

  // ── Send ──────────────────────────────────────────────────
  function _handleSend() {
    const text = _elements.input.value.trim();
    if (!text || _isLoading) return;
    _elements.input.value = '';

    // Hide empty state
    if (_elements.empty) { _elements.empty.style.display = 'none'; }

    // Add user message
    _messages.push({ role: 'user', content: text });
    _renderMessages();
    _sendToApi(text);
  }

  // ── API ───────────────────────────────────────────────────
  async function _sendToApi(message) {
    _isLoading = true;
    _elements.send.disabled = true;

    // Add placeholder AI message
    const aiMsg = { role: 'ai', content: '', sources: [], loading: true };
    _messages.push(aiMsg);
    _renderMessages();

    try {
      const res = await fetch(_config.apiUrl + '/api/widget/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          apiKey:   _config.apiKey,
          userId:   _config.userId,
          userName: _config.userName,
          message:  message
        })
      });

      if (!res.ok) {
        aiMsg.content = 'Something went wrong. Please try again.';
        aiMsg.loading = false;
        _renderMessages();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      aiMsg.loading = false;
      let rawBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rawBuffer += decoder.decode(value, { stream: true });
        const lines = rawBuffer.split('\\n');
        rawBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) {
              aiMsg.content += data.chunk;
              _renderMessages();
            }
            if (data.done) {
              aiMsg.sources = data.sources || [];
              _renderMessages();
            }
          } catch (_) {}
        }
      }

      if (rawBuffer.trim() && rawBuffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(rawBuffer.slice(6));
          if (data.chunk) {
            aiMsg.content += data.chunk;
            _renderMessages();
          }
          if (data.done) {
            aiMsg.sources = data.sources || [];
            _renderMessages();
          }
        } catch (_) {}
      }

    } catch (err) {
      aiMsg.content = 'Connection error. Please check your network.';
      aiMsg.loading = false;
      _renderMessages();
    } finally {
      _isLoading = false;
      _elements.send.disabled = false;
      _elements.input.focus();
    }
  }

  // ── Render ────────────────────────────────────────────────
  function _renderMessages() {
    const container = _elements.messages;
    container.innerHTML = '';

    for (const msg of _messages) {
      const div = document.createElement('div');
      div.className = '_aichat_msg ' + (msg.role === 'user' ? '_aichat_user' : '_aichat_ai');

      if (msg.loading) {
        div.innerHTML = \`<div class="_aichat_typing"><span></span><span></span><span></span></div>\`;
      } else {
        div.innerHTML = _escHtml(msg.content).replace(/\\n/g, '<br>');
        if (msg.sources && msg.sources.length > 0) {
          const src = document.createElement('div');
          src.className = '_aichat_sources';
          src.innerHTML = 'Sources: ' + msg.sources.map(s => \`<span>\${_escHtml(s)}</span>\`).join('');
          div.appendChild(src);
        }
      }
      container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
  }

  // ── Helpers ───────────────────────────────────────────────
  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
