const asar = require('@electron/asar');
const path = require('path');

const archivePath = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar');

function check(file, marker) {
  const buf = asar.extractFile(archivePath, file);
  const content = buf.toString('utf8');
  console.log(file, '->', content.includes(marker) ? 'CONTAINS' : 'MISSING', `"${marker}"`);
}

check(path.join('src', 'agent', 'form-filler.js'), 'STOP_WORDS');
check(path.join('src', 'agent', 'linkedin.js'), 'chromeClosedExternally');
check(path.join('src', 'main', 'main.js'), 'ALWAYS start at the login screen');
check(path.join('src', 'main', 'window-focus.js'), 'AttachThreadInput');
check(path.join('src', 'renderer', 'docs', 'index.html'), 'topic-faq');
