
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbxH03Equa8RMUaXO3ufW9NAUucanYMsAEz0AVhjIUdfkykHM-CFd4jlnWAZ0OpmGjkW4g/exec';
  var el = function(id) { return document.getElementById(id); };

  function extractDocId(url) { var m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/); return m ? m[1] : null; }
  function getDocId() { return localStorage.getItem('voice_memo_doc_id'); }
  function getDocUrl() { var id = getDocId(); return id ? 'https://docs.google.com/document/d/' + id + '/edit' : ''; }
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
  }

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
    el('result').textContent = ''; recordStart = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
    try { recognition.start(); } catch(e) {}
  }
  function stopRecording() {
    isRecording = false; el('micBtn').classList.remove('recording');
    el('status').textContent = 'タップして話す'; el('status').classList.remove('recording');
    clearInterval(timerInterval); el('timer').textContent = '';
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
  function showResult(ok, msg) { el('result').textContent = msg; el('result').className = 'result ' + (ok ? 'success' : 'error'); }
  function resetSaveBtn() {
    el('saveBtn').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Googleドキュメントに保存';
    el('saveBtn').disabled = false;
  }
  function addHistory(text) {
    el('historySection').classList.remove('hidden');
    var list = el('historyList'), item = document.createElement('div'); item.className = 'history-item';
    var preview = text.length > 80 ? text.substring(0, 80) + '...' : text;
    item.innerHTML = '<div class="history-time">' + new Date().toLocaleString('ja-JP') + '</div><div class="history-text">' + preview + '</div>';
    list.insertBefore(item, list.firstChild);
    while (list.children.length > 10) list.removeChild(list.lastChild);
  }
  window.addEventListener('online', function() { el('offlineBanner').classList.remove('show'); flushQueue(); });
  window.addEventListener('offline', function() { el('offlineBanner').classList.add('show'); });
  el('textArea').addEventListener('input', function() { updateCharCount(); el('saveBtn').disabled = !(el('textArea').textContent || '').trim(); });

  if (getDocId()) showMain(); else showSetup();
  initSpeech(); updateQueueBadge();
  if (!navigator.onLine) el('offlineBanner').classList.add('show');
  if (getQueue().length > 0 && navigator.onLine) flushQueue();
