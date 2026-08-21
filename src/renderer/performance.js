const button = document.querySelector('#refreshPerformance');
const label = button.querySelector('.label');
const statusText = document.querySelector('#status');

const LONG_PRESS_MS = 260;
const DRAG_THRESHOLD_PX = 5;

let press = null;

function showStatus(message, { error = false, sticky = false } = {}) {
  statusText.textContent = message;
  statusText.classList.toggle('is-error', error);
  statusText.classList.add('is-visible');

  if (!sticky) {
    setTimeout(() => statusText.classList.remove('is-visible'), 5000);
  }
}

function setWorking(isWorking) {
  button.disabled = isWorking;
  button.classList.toggle('is-working', isWorking);
  label.textContent = isWorking ? '작업중' : '실적 갱신';
}

async function refreshPerformance() {
  if (!window.confirm('전역 실적 DB를 갱신할까요?')) return;

  setWorking(true);
  showStatus('진행 중', { sticky: true });

  try {
    const result = await window.scheduleApi.refreshGlobalPerformance();
    showStatus(`${result.rowCount.toLocaleString('ko-KR')}건 완료`);
  } catch (error) {
    console.error(error);
    showStatus(error.message || '갱신 실패', { error: true });
  } finally {
    setWorking(false);
  }
}

async function beginDrag() {
  if (!press || press.dragging) return;
  const [windowX, windowY] = await window.scheduleApi.getWindowPosition();
  const cursor = await window.scheduleApi.getCursorPosition();
  press.dragging = true;
  press.offsetX = cursor.x - windowX;
  press.offsetY = cursor.y - windowY;
  button.classList.add('is-dragging');
  label.textContent = '이동';
}

async function moveWindowToCursor() {
  if (!press?.dragging) return;
  const cursor = await window.scheduleApi.getCursorPosition();
  await window.scheduleApi.setWindowPosition(cursor.x - press.offsetX, cursor.y - press.offsetY);
}

function clearPress() {
  if (press?.timer) clearTimeout(press.timer);
  button.classList.remove('is-dragging');
  if (!button.classList.contains('is-working')) label.textContent = '실적 갱신';
  press = null;
}

button.addEventListener('pointerdown', (event) => {
  if (button.disabled || event.button !== 0) return;
  button.setPointerCapture(event.pointerId);
  press = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    timer: setTimeout(beginDrag, LONG_PRESS_MS)
  };
});

button.addEventListener('pointermove', (event) => {
  if (!press || event.pointerId !== press.pointerId) return;
  const moved = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
  if (!press.dragging && moved >= DRAG_THRESHOLD_PX) beginDrag();
  if (press.dragging) moveWindowToCursor();
});

button.addEventListener('pointerup', (event) => {
  if (!press || event.pointerId !== press.pointerId) return;
  const shouldClick = !press.dragging;
  clearPress();
  if (shouldClick) refreshPerformance();
});

button.addEventListener('pointercancel', clearPress);
