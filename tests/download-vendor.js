// scripts/download-vendor.js
import fs from 'fs';
import path from 'path';

const VENDOR_DIR = path.resolve('js/vendor');
if (!fs.existsSync(VENDOR_DIR)) {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
}

async function downloadFile(url, destPath) {
  console.log(`Downloading ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
  console.log(`Saved ${destPath} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)`);
  return Buffer.from(arrayBuffer);
}

async function main() {
  // Download Roboto Regular & Bold from official Google Fonts repo
  const fontRegularBuf = await downloadFile(
    'https://raw.githubusercontent.com/googlefonts/roboto/master/src/hinted/Roboto-Regular.ttf',
    path.join(VENDOR_DIR, 'Roboto-Regular.ttf')
  );
  const fontBoldBuf = await downloadFile(
    'https://raw.githubusercontent.com/googlefonts/roboto/master/src/hinted/Roboto-Bold.ttf',
    path.join(VENDOR_DIR, 'Roboto-Bold.ttf')
  );

  const regularBase64 = fontRegularBuf.toString('base64');
  const boldBase64 = fontBoldBuf.toString('base64');

  const fontJsContent = `// Font Roboto hỗ trợ 100% tiếng Việt có dấu cho jsPDF offline
export const ROBOTO_REGULAR_BASE64 = "${regularBase64}";
export const ROBOTO_BOLD_BASE64 = "${boldBase64}";

export function registerVietnameseFont(doc) {
  if (!doc) return;
  try {
    // Đăng ký font Roboto Regular
    doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    // Đăng ký font Roboto Bold
    doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_BASE64);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    // Thiết lập font mặc định
    doc.setFont('Roboto', 'normal');
  } catch (err) {
    console.error('Lỗi đăng ký font tiếng Việt:', err);
  }
}
`;

  fs.writeFileSync(path.join(VENDOR_DIR, 'roboto-font.js'), fontJsContent, 'utf8');
  console.log(`Generated js/vendor/roboto-font.js successfully!`);
}

main().catch(err => {
  console.error('Download error:', err);
  process.exit(1);
});
