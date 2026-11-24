const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');

const WIN_WIDTH = 320;
const WIN_HEIGHT = 360;
const MARGIN = 24; // 화면 가장자리에서 띄울 여백

let win = null;
let dragTimer = null;
let dragOffset = { x: 0, y: 0 };

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    x: workArea.x + workArea.width - WIN_WIDTH - MARGIN,
    y: workArea.y + workArea.height - WIN_HEIGHT - MARGIN,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenu && win.setMenu(null);
  win.loadFile('index.html');

  win.on('closed', () => {
    win = null;
  });
}

// 커서를 따라 창을 옮긴다. 마우스가 창 밖으로 빠르게 나가도 끊기지 않게
// 렌더러의 mousemove 대신 main에서 커서 좌표를 폴링한다.
function startDrag() {
  if (!win || dragTimer) return;

  const cursor = screen.getCursorScreenPoint();
  const [winX, winY] = win.getPosition();
  dragOffset = { x: cursor.x - winX, y: cursor.y - winY };

  dragTimer = setInterval(() => {
    if (!win) return stopDrag();

    const pt = screen.getCursorScreenPoint();
    const { workArea } = screen.getDisplayNearestPoint(pt);

    let x = pt.x - dragOffset.x;
    let y = pt.y - dragOffset.y;

    // 위젯이 화면 밖으로 완전히 나가지 않게 제한
    x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - WIN_WIDTH);
    y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - WIN_HEIGHT);

    win.setPosition(Math.round(x), Math.round(y));
  }, 16);
}

function stopDrag() {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
}

ipcMain.on('drag:start', startDrag);
ipcMain.on('drag:end', stopDrag);

// 캐릭터/말풍선 위에 있을 때만 클릭을 받고, 투명한 빈 영역은 바탕화면으로 통과시킨다.
// forward:true 라서 무시 상태에서도 mousemove 는 계속 들어온다(다시 켤 수 있음).
ipcMain.on('window:interactive', (_event, interactive) => {
  if (!win) return;
  win.setIgnoreMouseEvents(!interactive, { forward: true });
});

ipcMain.on('menu:show', () => {
  const menu = Menu.buildFromTemplate([
    { label: '종료', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
