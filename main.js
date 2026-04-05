const { app, BrowserWindow } = require('electron');

// 🌟 修正箇所：新しいバージョンの electron-serve に対応する書き方に変更しました
const serve = require('electron-serve');
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