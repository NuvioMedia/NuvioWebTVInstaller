const fs = require('fs');

const mainJsPath = 'src/main.js';
let mainJs = fs.readFileSync(mainJsPath, 'utf8');

if (!mainJs.includes('installer:selectFile')) {
  mainJs = mainJs.replace(
    'ipcMain.handle("installer:getConfig", async () => ({',
    `const { dialog } = require('electron');\nipcMain.handle("installer:selectFile", async () => {\n  const { canceled, filePaths } = await dialog.showOpenDialog({\n    properties: ['openFile'],\n    filters: [\n      { name: 'TV Packages', extensions: ['wgt', 'ipk'] },\n      { name: 'All Files', extensions: ['*'] }\n    ]\n  });\n  if (canceled) return null;\n  return filePaths[0];\n});\n\nipcMain.handle("installer:getConfig", async () => ({`
  );
  fs.writeFileSync(mainJsPath, mainJs);
}
