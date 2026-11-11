// check-syntax.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function checkJs(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      checkJs(full);
    } else if (item.name.endsWith('.js')) {
      try {
        execSync(`node --check "${full}"`);
        console.log('✓ Syntax OK:', full);
      } catch (err) {
        console.error('✗ SYNTAX ERROR in:', full, err.message);
        process.exit(1);
      }
    }
  }
}

checkJs('js');
checkJs('tests');
console.log('\n🎉 ALL JAVASCRIPT FILES HAVE 100% VALID SYNTAX!');
