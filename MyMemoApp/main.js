const { app, BrowserWindow } = require('electron');
const serve = require('electron-serve');
const { autoUpdater } = require('electron-updater'); // 🌟追加：アップデート機能の読み込み

const serveApp = serve.default || serve;
const loadURL = serveApp({ directory: 'dist' });

function createWindow() {
    const win = new BrowserWindow({
        width: 450,
        height: 800,
        title: "MyMemoApp",
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
        }
    });

    loadURL(win);
}

app.whenReady().then(() => {
    createWindow();

    // 🌟追加：アプリ起動時に倉庫をチェックし、最新版があれば裏でダウンロードして次回起動時に適用する
    autoUpdater.checkForUpdatesAndNotify();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});