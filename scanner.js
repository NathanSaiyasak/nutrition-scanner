// scanner.js — opens the rear camera and watches the picture for a barcode.
//
// Android Chrome has a built-in barcode reader (BarcodeDetector). iPhone Safari does not, so we
// fall back to the free "barcode-detector" library in vendor/ (MIT licence), which does the same
// job with ZXing compiled to WebAssembly. Its .wasm file is served from our own site, not a CDN.

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const SCAN_EVERY_MS = 150;

let detectorPromise = null;

function getDetector() {
  if (!detectorPromise) detectorPromise = createDetector();
  return detectorPromise;
}

async function createDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (FORMATS.every((f) => supported.includes(f))) {
        return new window.BarcodeDetector({ formats: FORMATS });
      }
    } catch { /* fall through to the library */ }
  }
  const api = window.BarcodeDetectionAPI;
  if (!api) throw new Error('reader-missing');
  api.prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) =>
        path.endsWith('.wasm') ? new URL(`vendor/${path}`, document.baseURI).href : prefix + path,
    },
    fireImmediately: true, // start downloading the reader now, while the camera opens
  });
  return new api.BarcodeDetector({ formats: FORMATS });
}

/**
 * Start scanning into a <video> element.
 * onResult(barcode) is called once, then the camera stops.
 * onError(kind) is called with: 'insecure' | 'denied' | 'no-camera' | 'in-use' | 'unknown'.
 * ignore: a barcode to skip for the first 2 seconds, so "Scan another" doesn't instantly re-read
 * the product that is still in front of the camera.
 * Returns a stop() function.
 */
export function startScanner(video, { onResult, onError, ignore = null }) {
  const ignoreUntil = Date.now() + 2000;
  let stopped = false;
  let stream = null;
  let timer = null;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  };

  (async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      onError(window.isSecureContext ? 'no-camera' : 'insecure');
      return;
    }

    const detectorReady = getDetector(); // runs while the camera opens

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' }, // the rear camera
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch (err) {
      if (stopped) return;
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') onError('denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') onError('no-camera');
      else if (name === 'NotReadableError' || name === 'AbortError') onError('in-use');
      else onError('unknown');
      return;
    }
    if (stopped) { stop(); return; }

    video.srcObject = stream;
    video.setAttribute('playsinline', ''); // iPhone: play inside the page, not full screen
    video.muted = true;
    try { await video.play(); } catch { /* autoplay hiccup; frames still arrive */ }

    let detector;
    try {
      detector = await detectorReady;
    } catch {
      if (!stopped) { stop(); onError('unknown'); }
      return;
    }

    const tick = async () => {
      if (stopped) return;
      if (video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          const hit = codes.find((c) => /^\d{8,14}$/.test(c.rawValue)
            && !(c.rawValue === ignore && Date.now() < ignoreUntil));
          if (hit && !stopped) {
            stop();
            if (navigator.vibrate) navigator.vibrate(80);
            onResult(hit.rawValue);
            return;
          }
        } catch { /* a bad frame; try the next one */ }
      }
      timer = setTimeout(tick, SCAN_EVERY_MS);
    };
    tick();
  })();

  return stop;
}
