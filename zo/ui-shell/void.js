/**
 * Void UI Component
 *
 * Manages the creative capture interface with negotiation prompts.
 */
(function() {
  'use strict';

  // Constants
  var SILENCE_THRESHOLD_MS = 5000;
  var MIN_THOUGHTS_FOR_OFFER = 3;
  var STORAGE_KEY = 'zoqore_void_session';

  // State
  var sessionId = null;
  var mode = 'genesis';
  var state = 'idle';
  var thoughtCount = 0;
  var silenceTimer = null;
  var readyForReveal = false;

  // DOM Elements
  var container = null;
  var textarea = null;
  var promptEl = null;
  var promptTextEl = null;
  var offerEl = null;
  var countEl = null;
  var micBtn = null;
  var interimPreview = null;

  // Calibrated questions for early silence
  var CALIBRATED_QUESTIONS = [
    'What else is rattling around?',
    "What's on your mind?",
    'What else feels important here?',
    'What would make this clearer?'
  ];

  // Soft offers for when structure is forming
  var SOFT_OFFERS = [
    "I'm seeing some shape here. Want to take a look?",
    'Some themes are emerging. Shall we peek?',
    'Structure is forming. Ready to see it?'
  ];

  // Initialize
  function init() {
    container = document.getElementById('void-container');
    if (!container) return;

    textarea = container.querySelector('.void-textarea');
    promptEl = container.querySelector('.void-prompt');
    promptTextEl = container.querySelector('.void-prompt-text');
    offerEl = container.querySelector('.void-offer');
    countEl = container.querySelector('.void-thought-count');
    micBtn = container.querySelector('.void-mic-btn');
    interimPreview = container.querySelector('.void-interim-preview');

    bindEvents();
    checkSavedSession();
    initSTT();

    window.addEventListener('genesis:event', function(e) {
      if (e.detail && e.detail.type === 'ready_for_reveal') showOffer();
    });

    // ─── Brainstorm Recording Controls ───────────────────────────
    function initBrainstormRecording() {
      var recordBtn = document.getElementById('brainstorm-record-btn');
      var sendBtn = document.getElementById('brainstorm-send-btn');
      var timerEl = document.getElementById('brainstorm-rec-timer');
      var statusEl = document.getElementById('brainstorm-rec-status');
      if (!recordBtn) return;

      var recorder = null;
      var recChunks = [];
      var recBlob = null;
      var recStart = 0;
      var recInterval = null;

      function setStatus(msg, cls) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = 'brainstorm-rec-status' + (cls ? ' ' + cls : '');
      }

      function updateTimer() {
        if (!timerEl) return;
        var sec = Math.floor((Date.now() - recStart) / 1000);
        var m = String(Math.floor(sec / 60)).padStart(2, '0');
        var s = String(sec % 60).padStart(2, '0');
        timerEl.textContent = m + ':' + s;
      }

      function startRecording() {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
          recChunks = [];
          recBlob = null;
          recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
          recorder.ondataavailable = function(e) { if (e.data.size > 0) recChunks.push(e.data); };
          recorder.onstop = function() {
            stream.getTracks().forEach(function(t) { t.stop(); });
            recBlob = new Blob(recChunks, { type: 'audio/webm' });
            if (sendBtn) sendBtn.disabled = false;
            setStatus('Recording complete. Ready to send.', '');
          };
          recorder.start(250);
          recStart = Date.now();
          recordBtn.classList.add('recording');
          recordBtn.querySelector('.brainstorm-rec-label').textContent = 'Stop';
          if (sendBtn) sendBtn.disabled = true;
          setStatus('Recording...', '');
          recInterval = setInterval(updateTimer, 250);
        }).catch(function(err) {
          console.error('[Brainstorm] Mic access denied:', err);
          setStatus('Microphone access denied. Check browser permissions.', 'error');
        });
      }

      function stopRecording() {
        if (recorder && recorder.state === 'recording') {
          recorder.stop();
        }
        clearInterval(recInterval);
        recordBtn.classList.remove('recording');
        recordBtn.querySelector('.brainstorm-rec-label').textContent = 'Record';
      }

      recordBtn.addEventListener('click', function() {
        if (recorder && recorder.state === 'recording') {
          stopRecording();
        } else {
          startRecording();
        }
      });

      if (sendBtn) {
        sendBtn.addEventListener('click', function() {
          if (!recBlob) return;
          var projectId = getProjectId();
          sendBtn.disabled = true;
          sendBtn.classList.add('sending');
          sendBtn.querySelector('.brainstorm-send-label').textContent = 'Sending\u2026';
          setStatus('Uploading and transcribing\u2026', '');

          var fd = new FormData();
          fd.append('audio', recBlob, 'brainstorm-' + Date.now() + '.webm');
          fd.append('projectId', projectId);
          fd.append('target', 'constellation');

          fetch('/api/projects/brainstorm/ingest', { method: 'POST', body: fd })
            .then(function(res) {
              if (!res.ok) throw new Error('Ingest failed (' + res.status + ')');
              return res.json();
            })
            .then(function(data) {
              recBlob = null;
              if (timerEl) timerEl.textContent = '';
              sendBtn.querySelector('.brainstorm-send-label').textContent = 'Send to Mind Map';
              sendBtn.classList.remove('sending');
              setStatus('Sent! Ideas are being woven into your mind map.', 'success');
              setTimeout(function() { setStatus('', ''); }, 4000);
              window.dispatchEvent(new CustomEvent('brainstorm:recording-ingested', {
                detail: { projectId: projectId, data: data }
              }));
            })
            .catch(function(err) {
              console.error('[Brainstorm] Send error:', err);
              sendBtn.querySelector('.brainstorm-send-label').textContent = 'Send to Mind Map';
              sendBtn.classList.remove('sending');
              sendBtn.disabled = false;
              setStatus('Failed to send recording. Try again.', 'error');
            });
        });
      }
    }

    initBrainstormRecording();
  }

  function bindEvents() {
    if (!textarea) return;

    textarea.addEventListener('keydown', handleKeydown);
    textarea.addEventListener('input', handleInput);

    // Mode toggle
    var modeBtns = container.querySelectorAll('.void-mode-btn');
    for (var i = 0; i < modeBtns.length; i++) {
      modeBtns[i].addEventListener('click', handleModeClick);
    }

    // Prompt dismiss
    var dismissBtn = container.querySelector('.void-prompt-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', dismissPrompt);
    }

    // Offer buttons
    var acceptBtn = container.querySelector('.void-offer-accept');
    var declineBtn = container.querySelector('.void-offer-decline');
    if (acceptBtn) acceptBtn.addEventListener('click', acceptReveal);
    if (declineBtn) declineBtn.addEventListener('click', declineOffer);
  }

  function handleModeClick(e) {
    var newMode = e.target.dataset.mode;
    if (newMode) setMode(newMode);
  }

  function handleKeydown(e) {
    // Enter submits, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitThought();
    }
  }

  function handleInput() {
    resetSilenceTimer();
    hidePrompt();
  }

  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);

    silenceTimer = setTimeout(handleSilence, SILENCE_THRESHOLD_MS);
  }

  function handleSilence() {
    if (state !== 'capturing') return;
    if (readyForReveal) return;

    var isEarly = thoughtCount < MIN_THOUGHTS_FOR_OFFER;

    if (isEarly) {
      showPrompt(randomFrom(CALIBRATED_QUESTIONS));
    } else {
      checkCompleteness();
    }

    resetSilenceTimer();
  }

  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function checkCompleteness() {
    if (!sessionId) {
      showPrompt(randomFrom(CALIBRATED_QUESTIONS));
      return;
    }

    fetch('/api/void/session/' + encodeURIComponent(sessionId))
      .then(function(resp) {
        if (!resp.ok) throw new Error('Failed to fetch session');
        return resp.json();
      })
      .then(function(data) {
        if (data.readyForReveal) {
          showOffer();
        } else {
          showPrompt(randomFrom(CALIBRATED_QUESTIONS));
        }
      })
      .catch(function() {
        showPrompt(randomFrom(CALIBRATED_QUESTIONS));
      });
  }

  function submitThought() {
    var content = textarea.value.trim();
    if (!content) return;

    // Ensure session exists
    var promise = sessionId ? Promise.resolve() : startSession();

    promise.then(function() {
      return fetch('/api/void/thought', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, content: content })
      });
    })
    .then(function(resp) {
      if (resp.ok) {
        thoughtCount++;
        updateThoughtCount();
        textarea.value = '';
        hidePrompt();
        resetSilenceTimer();
      }
    })
    .catch(function() {
      // Silently handle errors - UI continues to work offline
    });
  }

  function startSession() {
    var projectId = getProjectId();

    return fetch('/api/void/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: projectId, mode: mode })
    })
    .then(function(resp) {
      if (!resp.ok) throw new Error('Failed to start session');
      return resp.json();
    })
    .then(function(data) {
      sessionId = data.sessionId;
      state = 'capturing';
      saveSession();
    });
  }

  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId: sessionId,
        projectId: getProjectId(),
        mode: mode
      }));
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  function checkSavedSession() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var data = JSON.parse(saved);
        sessionId = data.sessionId;
        mode = data.mode || 'genesis';
        state = 'capturing';
        updateModeUI();
        loadThoughtCount();
      }
    } catch (e) {
      // Ignore
    }
  }

  function loadThoughtCount() {
    if (!sessionId) return;

    fetch('/api/void/session/' + encodeURIComponent(sessionId))
      .then(function(resp) {
        if (!resp.ok) throw new Error('Failed to fetch session');
        return resp.json();
      })
      .then(function(data) {
        thoughtCount = data.thoughtCount || 0;
        updateThoughtCount();
      })
      .catch(function() {
        // Ignore - use local count
      });
  }

  function setMode(newMode) {
    mode = newMode;
    updateModeUI();
    container.dataset.mode = newMode;

    if (sessionId) {
      fetch('/api/void/mode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, mode: mode })
      }).catch(function() {});
    }

    saveSession();
  }

  function updateModeUI() {
    var modeBtns = container.querySelectorAll('.void-mode-btn');
    for (var i = 0; i < modeBtns.length; i++) {
      var btn = modeBtns[i];
      if (btn.dataset.mode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  }

  function showPrompt(text) {
    if (!promptEl || !promptTextEl) return;

    promptTextEl.textContent = text;
    promptEl.classList.add('visible');
  }

  function hidePrompt() {
    if (!promptEl) return;
    promptEl.classList.remove('visible');
  }

  function dismissPrompt() {
    hidePrompt();

    if (sessionId) {
      fetch('/api/void/prompt/dismiss', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId })
      }).catch(function() {});
    }
  }

  function showOffer() {
    if (!offerEl) return;
    readyForReveal = true;
    offerEl.classList.add('visible');
  }

  function hideOffer() {
    if (!offerEl) return;
    offerEl.classList.remove('visible');
  }

  function acceptReveal() {
    hideOffer();
    state = 'revealing';

    fetch('/api/void/accept-reveal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId })
    })
    .then(function() {
      // Trigger reveal transition via custom event
      window.dispatchEvent(new CustomEvent('void:reveal', {
        detail: { sessionId: sessionId }
      }));
    })
    .catch(function() {});
  }

  function declineOffer() {
    hideOffer();
    readyForReveal = false;

    showPrompt('Got it. Keep going.');
    setTimeout(hidePrompt, 3000);

    if (sessionId) {
      fetch('/api/void/decline-offer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId })
      }).catch(function() {});
    }
  }

  function updateThoughtCount() {
    if (countEl) {
      countEl.textContent = thoughtCount + ' thought' + (thoughtCount !== 1 ? 's' : '');
    }
  }

  function getProjectId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('project') || 'default-project';
  }

  // Speech-to-Text Integration
  function initSTT() {
    if (!window.VoidSTT || !VoidSTT.isSupported()) {
      if (micBtn) micBtn.style.display = 'none';
      return;
    }

    VoidSTT.init();
    if (micBtn) micBtn.disabled = false;

    VoidSTT.onTranscript = function(text, isFinal) {
      if (isFinal) {
        textarea.value += (textarea.value ? ' ' : '') + text;
        submitThought();
        hideInterimPreview();
      } else {
        showInterimPreview(text);
      }
    };

    VoidSTT.onError = function(error) {
      if (micBtn) micBtn.classList.add('void-mic-btn--error');
      setTimeout(function() {
        if (micBtn) micBtn.classList.remove('void-mic-btn--error');
      }, 2000);
    };

    VoidSTT.onStateChange = function(isListening) {
      if (micBtn) {
        if (isListening) {
          micBtn.classList.add('void-mic-btn--listening');
        } else {
          micBtn.classList.remove('void-mic-btn--listening');
          hideInterimPreview();
        }
      }
    };

    if (micBtn) {
      micBtn.addEventListener('click', function() {
        VoidSTT.toggle();
      });
    }
  }

  function showInterimPreview(text) {
    if (!interimPreview) return;
    interimPreview.textContent = text;
    interimPreview.classList.add('void-interim-preview--visible');
  }

  function hideInterimPreview() {
    if (!interimPreview) return;
    interimPreview.textContent = '';
    interimPreview.classList.remove('void-interim-preview--visible');
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.ZoVoid = {
    getState: function() {
      return {
        sessionId: sessionId,
        mode: mode,
        state: state,
        thoughtCount: thoughtCount,
        readyForReveal: readyForReveal
      };
    },
    submitThought: submitThought,
    setMode: setMode
  };
})();
