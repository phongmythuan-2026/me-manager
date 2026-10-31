(function() {
  var channel = 'me-manager-backend';
  var parentOrigin = 'https://phongmythuan-2026.github.io';
  var nonce = '';
  var backendWindow = null;
  var backendOrigin = '';
  var backendFrame = null;
  var backendReadyTimeout = null;
  var backendConnectionAttempts = 0;
  var maxBackendConnectionAttempts = 3;
  var requestSequence = 0;
  var pendingRequests = Object.create(null);
  var requestQueue = [];

  function loadBackendBridge() {
    if (backendWindow || backendConnectionAttempts >= maxBackendConnectionAttempts) return;
    backendConnectionAttempts++;
    if (backendReadyTimeout) window.clearTimeout(backendReadyTimeout);
    backendFrame.src = API_CONFIG.GAS_API_URL + '?bridge=1&nonce=' + encodeURIComponent(nonce) +
      '&attempt=' + backendConnectionAttempts;
    backendReadyTimeout = window.setTimeout(function() {
      if (!backendWindow && backendConnectionAttempts < maxBackendConnectionAttempts) loadBackendBridge();
    }, 8000);
  }

  function finishRequest(id, success, value, userObject, handlers) {
    var pending = pendingRequests[id];
    if (!pending) return;
    window.clearTimeout(pending.timeout);
    delete pendingRequests[id];
    if (success) {
      if (handlers.success) handlers.success(value, userObject);
    } else if (handlers.failure) {
      var error = new Error(value && value.message ? value.message : 'Backend request failed.');
      handlers.failure(error, userObject);
    } else {
      console.error('ME Manager backend request failed:', value);
    }
  }

  function sendRequest(method, args, handlers, userObject) {
    var id = String(++requestSequence);
    var message = { channel: channel, type: 'request', nonce: nonce, id: id, method: method, args: args };
    var timeout = window.setTimeout(function() {
      finishRequest(id, false, { message: 'Không thể kết nối đến backend ME Manager.' }, userObject, handlers);
    }, 30000);
    pendingRequests[id] = { timeout: timeout, handlers: handlers, userObject: userObject };
    var request = { id: id, message: message };
    if (backendWindow) {
      backendWindow.postMessage(message, backendOrigin);
    } else {
      requestQueue.push(request);
    }
  }

  function createRunner(handlers, userObject) {
    return new Proxy({}, {
      get: function(_, property) {
        if (property === 'withSuccessHandler') {
          return function(handler) {
            return createRunner({ success: handler, failure: handlers.failure }, userObject);
          };
        }
        if (property === 'withFailureHandler') {
          return function(handler) {
            return createRunner({ success: handlers.success, failure: handler }, userObject);
          };
        }
        if (property === 'withUserObject') {
          return function(value) {
            return createRunner(handlers, value);
          };
        }
        if (typeof property !== 'string' || property.charAt(0) === '_') return undefined;
        return function() {
          sendRequest(property, Array.prototype.slice.call(arguments), handlers, userObject);
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner({}, undefined);

  window.addEventListener('message', function(event) {
    var message = event.data;
    if (!message || message.channel !== channel || message.nonce !== nonce) return;
    if (message.type === 'ready') {
      if (!/^(script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/.test(new URL(event.origin).hostname)) return;
      backendWindow = event.source;
      backendOrigin = event.origin;
      if (backendReadyTimeout) {
        window.clearTimeout(backendReadyTimeout);
        backendReadyTimeout = null;
      }
      requestQueue.splice(0).forEach(function(request) {
        backendWindow.postMessage(request.message, backendOrigin);
      });
      return;
    }
    if (message.type !== 'response') return;
    var pending = pendingRequests[message.id];
    if (pending) finishRequest(message.id, message.success, message.success ? message.result : message.error, pending.userObject, pending.handlers);
  });

  var randomBytes = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(randomBytes);
  else for (var i = 0; i < randomBytes.length; i++) randomBytes[i] = Math.floor(Math.random() * 256);
  nonce = Array.from(randomBytes).map(function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');

  backendFrame = document.createElement('iframe');
  backendFrame.title = 'ME Manager backend connection';
  backendFrame.setAttribute('aria-hidden', 'true');
  backendFrame.tabIndex = -1;
  backendFrame.style.cssText = 'position:fixed;width:2px;height:2px;left:0;top:0;border:0;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(backendFrame);
  loadBackendBridge();
})();
