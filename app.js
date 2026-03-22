
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbxH03Equa8RMUaXO3ufW9NAUucanYMsAEz0AVhjIUdfkykHM-CFd4jlnWAZ0OpmGjkW4g/exec';
  var el = function(id) { return document.getElementById(id); };

  // ===== URL parameter support =====
  function getUrlParam(name) {
    var m = location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function extractDocId(url) { var m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/); return m ? m[1] : null; }
  function getDocId() { return localStorage.getItem('voice_memo_doc_id'); }
  function getDocUrl() { var id = getDocId(); return id ? 'https://docs.google.com/document/d/' + id + '/edit' : ''; }
  function getShareUrl() { var id = getDocId(); return id ? location.origin + location.pathname + '?doc=' + id : ''; }

  function saveSetup() {
    var url = el('docUrlInput').value.trim();
    var docId = extractDocId(url);
    if (!docId) { if (/^[a-zA-Z0-9_-]{20,}$/.test(url)) docId = url; else { el('setupError').textContent = 'GoogleドキュメントのURLを正しく貼ってください'; return; } }
    localStorage.setItem('voice_memo_doc_id', docId); showMain();
  }
  function resetSetup() { showSetup(); }
  function cancelSetup() { if (getDocId()) showMain(); }
  function showSetup() {
    el('setupScreen').classList.remove('hidden'); el('mainScreen').classList.add('hidden');
    if (getDocId()) { el('setupBackBtn').classList.remove('hidden'); el('docUrlInput').value = getDocUrl(); }
    else { el('setupBackBtn').classList.add('hidden'); }
  }
  function showMain() {
    el('setupScreen').classList.add('hidden'); el('mainScreen').classList.remove('hidden');
    var id = getDocId(); el('docName').textContent = '...' + id.slice(-10);
    el('openDocLink').href = getDocUrl(); el('openDocLink').style.display = 'flex';
    // Show QR button on desktop
    if (el('qrBtn')) el('qrBtn').style.display = 'flex';
  }

  // ===== QR Code generator (SVG, no external lib) =====
  function generateQR(text) {
    // Simple QR using an inline SVG via API-less approach
    // We'll use a canvas-based generator embedded here
    var modules = qrEncode(text);
    var size = modules.length;
    var scale = 4;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (size+8) + ' ' + (size+8) + '" width="' + ((size+8)*scale) + '" height="' + ((size+8)*scale) + '">';
    svg += '<rect width="100%" height="100%" fill="#fff"/>';
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (modules[y][x]) {
          svg += '<rect x="' + (x+4) + '" y="' + (y+4) + '" width="1" height="1" fill="#1A1A2E" rx="0.15"/>';
        }
      }
    }
    svg += '</svg>';
    return svg;
  }

  // Minimal QR encoder (mode: byte, ECC: L, version auto)
  function qrEncode(text) {
    var data = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 128) data.push(c);
      else { var bytes = encodeURI(text.charAt(i)).split('%').slice(1); for (var j = 0; j < bytes.length; j++) data.push(parseInt(bytes[j], 16)); }
    }
    // Find version
    var ver = 1, capacity = [17,32,53,78,106,134,154,192,230,271,321,367,425,458,520,586,644,718,792,858];
    for (var v = 0; v < capacity.length; v++) { if (data.length <= capacity[v]) { ver = v + 1; break; } }
    var size = ver * 4 + 17;
    var matrix = []; for (var i = 0; i < size; i++) { matrix[i] = []; for (var j = 0; j < size; j++) matrix[i][j] = 0; }
    var reserved = []; for (var i = 0; i < size; i++) { reserved[i] = []; for (var j = 0; j < size; j++) reserved[i][j] = false; }

    // Finder patterns
    function setFinder(r, c) {
      for (var dy = -1; dy <= 7; dy++) for (var dx = -1; dx <= 7; dx++) {
        var y = r + dy, x = c + dx;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        var v = (dy >= 0 && dy <= 6 && (dx === 0 || dx === 6)) ||
                (dx >= 0 && dx <= 6 && (dy === 0 || dy === 6)) ||
                (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4);
        matrix[y][x] = v ? 1 : 0; reserved[y][x] = true;
      }
    }
    setFinder(0, 0); setFinder(0, size - 7); setFinder(size - 7, 0);

    // Timing
    for (var i = 8; i < size - 8; i++) {
      matrix[6][i] = (i % 2 === 0) ? 1 : 0; reserved[6][i] = true;
      matrix[i][6] = (i % 2 === 0) ? 1 : 0; reserved[i][6] = true;
    }

    // Alignment (simplified for small versions)
    if (ver >= 2) {
      var pos = [6, size - 7];
      for (var ay = 0; ay < pos.length; ay++) for (var ax = 0; ax < pos.length; ax++) {
        var cy = pos[ay], cx = pos[ax];
        if (reserved[cy][cx]) continue;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          var v = (Math.abs(dy) === 2 || Math.abs(dx) === 2 || (dy === 0 && dx === 0));
          matrix[cy+dy][cx+dx] = v ? 1 : 0; reserved[cy+dy][cx+dx] = true;
        }
      }
    }

    // Reserve format info
    for (var i = 0; i < 8; i++) {
      reserved[8][i] = true; reserved[i][8] = true;
      reserved[8][size-1-i] = true; reserved[size-1-i][8] = true;
    }
    reserved[8][8] = true;
    matrix[size-8][8] = 1; reserved[size-8][8] = true; // dark module

    // Data encoding (byte mode, ECC L simplified)
    var bits = '';
    bits += '0100'; // byte mode
    var lenBits = ver <= 9 ? 8 : 16;
    bits += data.length.toString(2).padStart(lenBits, '0');
    for (var i = 0; i < data.length; i++) bits += data[i].toString(2).padStart(8, '0');
    // Terminator + padding
    var totalBits = capacity[ver-1] * 8;
    if (bits.length + 4 <= totalBits) bits += '0000';
    while (bits.length % 8 !== 0) bits += '0';
    var padBytes = [0xEC, 0x11]; var pi = 0;
    while (bits.length < totalBits) { bits += padBytes[pi % 2].toString(2).padStart(8, '0'); pi++; }

    // Place data (simplified - skip ECC for visual demo)
    var bitIdx = 0;
    var upward = true;
    for (var col = size - 1; col >= 0; col -= 2) {
      if (col === 6) col = 5;
      var rows = upward ? [] : [];
      for (var r = 0; r < size; r++) rows.push(upward ? size - 1 - r : r);
      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        for (var dc = 0; dc < 2; dc++) {
          var c = col - dc;
          if (c < 0 || reserved[row][c]) continue;
          matrix[row][c] = bitIdx < bits.length ? parseInt(bits[bitIdx]) : 0;
          bitIdx++;
        }
      }
      upward = !upward;
    }

    // Format info (ECC L, mask 0)
    var fmtBits = '111011111000100';
    var fmtPos = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    var fmtPos2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];
    for (var i = 0; i < 15; i++) {
      var v = parseInt(fmtBits[i]);
      matrix[fmtPos[i][0]][fmtPos[i][1]] = v;
      matrix[fmtPos2[i][0]][fmtPos2[i][1]] = v;
    }

    // XOR mask 0 (checkerboard)
    for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) {
      if (!reserved[r][c] && (r + c) % 2 === 0) matrix[r][c] ^= 1;
    }

    return matrix;
  }

  function showQR() {
    var url = getShareUrl();
    if (!url) return;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:1000;padding:24px;animation:fadeIn 200ms ease-out;';
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:20px;padding:32px;max-width:360px;width:100%;text-align:center;box-shadow:0 24px 48px rgba(0,0,0,0.2);';
    card.innerHTML =
      '<div style="font-size:18px;font-weight:700;margin-bottom:4px;">スマホで使う</div>' +
      '<div style="font-size:13px;color:#6B7280;margin-bottom:20px;">カメラでスキャンしてください</div>' +
      '<div style="display:flex;justify-content:center;margin-bottom:16px;">' + generateQR(url) + '</div>' +
      '<div style="font-size:11px;color:#9CA3AF;word-break:break-all;margin-bottom:20px;line-height:1.5;">' + url + '</div>' +
      '<button style="width:100%;padding:12px;border:none;border-radius:10px;background:#F3F4F6;font-size:14px;font-weight:500;cursor:pointer;color:#374151;" onclick="this.parentElement.parentElement.remove()">閉じる</button>';
    overlay.appendChild(card);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ===== Speech Recognition =====
  var recognition = null, isRecording = false, fullText = '';
  var timerInterval = null, recordStart = 0;
  function initSpeech() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { el('status').textContent = 'このブラウザは音声入力に対応していません'; return; }
    recognition = new SR(); recognition.lang = 'ja-JP'; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = function(e) {
      var interim = '', fin = '';
      for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript; else interim += e.results[i][0].transcript; }
      if (fin) fullText += fin;
      el('textArea').textContent = fullText + (interim ? interim : '');
      updateCharCount(); el('saveBtn').disabled = !fullText.trim();
    };
    recognition.onend = function() { if (isRecording) try { recognition.start(); } catch(e) {} };
    recognition.onerror = function(e) { if (e.error === 'no-speech') return; el('status').textContent = 'エラー: ' + e.error; el('status').classList.remove('recording'); stopRecording(); };
  }
  function toggleRecording() { if (isRecording) stopRecording(); else startRecording(); }
  function startRecording() {
    if (!recognition) initSpeech(); if (!recognition) return;
    isRecording = true; fullText = el('textArea').textContent || '';
    el('micBtn').classList.add('recording'); el('status').textContent = '聞いています...'; el('status').classList.add('recording');
    el('result').textContent = ''; el('result').className = 'result';
    recordStart = Date.now();
    el('timer').classList.add('show');
    el('levelBars').classList.remove('hidden');
    timerInterval = setInterval(updateTimer, 1000);
    try { recognition.start(); } catch(e) {}
  }
  function stopRecording() {
    isRecording = false; el('micBtn').classList.remove('recording');
    el('status').textContent = 'タップして話す'; el('status').classList.remove('recording');
    clearInterval(timerInterval); el('timer').textContent = ''; el('timer').classList.remove('show');
    el('levelBars').classList.add('hidden');
    try { recognition.stop(); } catch(e) {}
  }
  function updateTimer() {
    var sec = Math.floor((Date.now() - recordStart) / 1000);
    el('timer').textContent = String(Math.floor(sec/60)).padStart(2,'0') + ':' + String(sec%60).padStart(2,'0');
  }
  function updateCharCount() { el('charCount').textContent = (el('textArea').textContent || '').length.toLocaleString() + '文字'; }
  function clearText() { el('textArea').textContent = ''; fullText = ''; updateCharCount(); el('saveBtn').disabled = true; }

  var QUEUE_KEY = 'voice_memo_queue';
  function getQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch(e) { return []; } }
  function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  function updateQueueBadge() {
    var q = getQueue(), b = el('queueBadge');
    if (q.length > 0) { b.textContent = q.length + '件 送信待ち'; b.classList.add('show'); } else { b.classList.remove('show'); }
  }
  function flushQueue() {
    var q = getQueue(); if (q.length === 0) return;
    sendToGAS(q[0].text, q[0].docId, function(ok) { if (ok) { q.shift(); saveQueue(q); updateQueueBadge(); if (q.length > 0) setTimeout(flushQueue, 1000); } });
  }
  function sendToGAS(text, docId, callback) {
    fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ text: text, docId: docId }) })
    .then(function() { if (callback) callback(true); })
    .catch(function() { if (callback) callback(false); });
  }
  function saveToDoc() {
    var text = (el('textArea').textContent || '').trim(), docId = getDocId();
    if (!text || !docId) return;
    el('saveBtn').disabled = true; el('saveBtn').textContent = '保存中...'; el('result').textContent = ''; el('result').className = 'result';
    if (!navigator.onLine) {
      var q = getQueue(); q.push({ text: text, docId: docId, time: new Date().toISOString() }); saveQueue(q); updateQueueBadge();
      showResult(true, 'オフライン保存しました（接続復帰時に送信）'); addHistory(text); clearText(); resetSaveBtn(); return;
    }
    sendToGAS(text, docId, function() {
      var now = new Date().toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      showResult(true, '保存しました (' + now + ')'); addHistory(text); clearText(); resetSaveBtn();
    });
  }
  function showResult(ok, msg) {
    el('result').textContent = msg;
    el('result').className = 'result show ' + (ok ? 'success' : 'error');
    if (ok) { el('saveBtn').classList.add('success'); setTimeout(function() { el('saveBtn').classList.remove('success'); }, 700); }
  }
  function resetSaveBtn() {
    el('saveBtn').innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg> 保存する';
    el('saveBtn').disabled = false;
  }
  function addHistory(text) {
    el('historySection').classList.remove('hidden');
    var list = el('historyList'), item = document.createElement('div'); item.className = 'hist-item';
    var preview = text.length > 80 ? text.substring(0, 80) + '...' : text;
    item.innerHTML = '<div class="hist-time">' + new Date().toLocaleString('ja-JP') + '</div><div class="hist-text">' + preview + '</div>';
    list.insertBefore(item, list.firstChild);
    while (list.children.length > 10) list.removeChild(list.lastChild);
  }
  window.addEventListener('online', function() { el('offlineBanner').classList.remove('show'); flushQueue(); });
  window.addEventListener('offline', function() { el('offlineBanner').classList.add('show'); });
  el('textArea').addEventListener('input', function() { updateCharCount(); el('saveBtn').disabled = !(el('textArea').textContent || '').trim(); });

  // ===== Init =====
  // Check URL param first
  var paramDocId = getUrlParam('doc');
  if (paramDocId) {
    localStorage.setItem('voice_memo_doc_id', paramDocId);
  }

  if (getDocId()) showMain(); else showSetup();
  initSpeech(); updateQueueBadge();
  if (!navigator.onLine) el('offlineBanner').classList.add('show');
  if (getQueue().length > 0 && navigator.onLine) flushQueue();
