const refreshOpsButton = document.querySelector('#refreshOps');
const refreshLabel = refreshOpsButton.querySelector('.label');
const syncStatus = document.querySelector('#syncStatus');

const LONG_PRESS_MS = 260;
const DRAG_THRESHOLD_PX = 5;

let press = null;

function showSyncStatus(message, { error = false, sticky = false } = {}) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle('is-error', error);
  syncStatus.classList.add('is-visible');

  if (!sticky) {
    setTimeout(() => {
      syncStatus.classList.remove('is-visible');
    }, 5000);
  }
}

function setWorking(isWorking) {
  refreshOpsButton.disabled = isWorking;
  refreshOpsButton.classList.toggle('is-working', isWorking);
  refreshLabel.textContent = isWorking ? '작업중' : '편성운영 갱신';
}


async function refreshFutureOpsVersions() {
  if (!window.confirm('오늘 이후 주차의 편성운영 버전만 갱신할까요?')) {
    return;
  }

  setWorking(true);
  showSyncStatus('진행 중', { sticky: true });

  try {
    const result = await window.scheduleApi.refreshFutureOps();
    showSyncStatus(`${result.count}개 주차 완료`);
  } catch (error) {
    console.error(error);
    showSyncStatus(error.message || '갱신 실패', { error: true });
  } finally {
    setWorking(false);
  }
}

async function beginDrag() {
  if (!press || press.dragging) {
    return;
  }

  const [windowX, windowY] = await window.scheduleApi.getWindowPosition();
  const cursor = await window.scheduleApi.getCursorPosition();
  press.dragging = true;
  press.offsetX = cursor.x - windowX;
  press.offsetY = cursor.y - windowY;
  refreshOpsButton.classList.add('is-dragging');
  refreshLabel.textContent = '이동';
}

async function moveWindowToCursor() {
  if (!press?.dragging) {
    return;
  }

  const cursor = await window.scheduleApi.getCursorPosition();
  await window.scheduleApi.setWindowPosition(cursor.x - press.offsetX, cursor.y - press.offsetY);
}

function clearPress() {
  if (press?.timer) {
    clearTimeout(press.timer);
  }

  refreshOpsButton.classList.remove('is-dragging');
  if (!refreshOpsButton.classList.contains('is-working')) {
    refreshLabel.textContent = '편성운영 갱신';
  }
  press = null;
}

refreshOpsButton.addEventListener('pointerdown', (event) => {
  if (refreshOpsButton.disabled || event.button !== 0) {
    return;
  }

  refreshOpsButton.setPointerCapture(event.pointerId);
  press = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    timer: setTimeout(beginDrag, LONG_PRESS_MS)
  };
});

refreshOpsButton.addEventListener('pointermove', (event) => {
  if (!press || event.pointerId !== press.pointerId) {
    return;
  }

  const moved = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
  if (!press.dragging && moved >= DRAG_THRESHOLD_PX) {
    beginDrag();
  }

  if (press.dragging) {
    moveWindowToCursor();
  }
});

refreshOpsButton.addEventListener('pointerup', (event) => {
  if (!press || event.pointerId !== press.pointerId) {
    return;
  }

  const shouldClick = !press.dragging;
  clearPress();

  if (shouldClick) {
    refreshFutureOpsVersions();
  }
});

refreshOpsButton.addEventListener('pointercancel', clearPress);
