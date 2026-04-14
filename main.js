const { app, BrowserWindow, dialog } = require('electron'); // 🌟 dialog を追加
const serve = require('electron-serve');
const { autoUpdater } = require('electron-updater');

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

    // 🌟 アップデートの状況を画面（ポップアップ）に表示する設定を追加
    autoUpdater.on('update-available', () => {
        dialog.showMessageBox({ title: '通知', message: '💡 新しいアップデートが見つかりました！裏でダウンロードを開始します。' });
    });

    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox({ title: '通知', message: '✨ ダウンロード完了！OKを押すとアプリが終了し、自動的にアップデートが始まります。' }).then(() => {
            // 👇 ここがエラーを防ぐ「おまじない」です！確実にアプリを終了させてから上書きします。
            setImmediate(() => {
                autoUpdater.quitAndInstall();
            });
        });
    });

    autoUpdater.on('error', (err) => {
        dialog.showErrorBox('アップデートエラー発生！', err == null ? "unknown" : (err.stack || err).toString());
    });

    // 起動時にチェック開始
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