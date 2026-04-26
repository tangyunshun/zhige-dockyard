const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '..', 'src', 'app', 'api', 'admin');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 修复换行符问题
  if (content.includes('`r`nimport')) {
    content = content.replace(/`r`nimport/g, '\nimport');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Fixed: ${path.relative(process.cwd(), filePath)}`);
    return true;
  }
  return false;
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  let fixedCount = 0;
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      fixedCount += walkDir(filePath);
    } else if (file.endsWith('.ts')) {
      if (fixFile(filePath)) {
        fixedCount++;
      }
    }
  });
  
  return fixedCount;
}

const fixedCount = walkDir(adminDir);
console.log(`\n✓ Total files fixed: ${fixedCount}`);
