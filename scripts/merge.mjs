import fs from 'fs';
import path from 'path';
import Jimp from 'jimp';

const dir1 = process.argv[2];
const dir2 = process.argv[3];

if (!dir1 || !dir2) {
  console.error('Usage: node scripts/merge.mjs <path/to/dir1> <path/to/dir2>');
  process.exit(1);
}

const resolveDir1 = path.resolve(dir1);
const resolveDir2 = path.resolve(dir2);

const name1 = path.basename(resolveDir1);
const name2 = path.basename(resolveDir2);
const outDir = path.join(path.dirname(resolveDir1), `${name1}+${name2}`);

const img1Path = path.join(resolveDir1, 'spritesheet.png');
const json1Path = path.join(resolveDir1, 'spritesheet.json');
const img2Path = path.join(resolveDir2, 'spritesheet.png');
const json2Path = path.join(resolveDir2, 'spritesheet.json');

if (!fs.existsSync(img1Path) || !fs.existsSync(json1Path)) {
  console.error(`Error: Missing spritesheet.png or spritesheet.json in ${dir1}`);
  process.exit(1);
}
if (!fs.existsSync(img2Path) || !fs.existsSync(json2Path)) {
  console.error(`Error: Missing spritesheet.png or spritesheet.json in ${dir2}`);
  process.exit(1);
}

async function merge() {
  console.log(`Merging ${name1} and ${name2}...`);

  const img1 = await Jimp.read(img1Path);
  const img2 = await Jimp.read(img2Path);

  const json1 = JSON.parse(fs.readFileSync(json1Path, 'utf-8'));
  const json2 = JSON.parse(fs.readFileSync(json2Path, 'utf-8'));

  // Extract frames arrays or objects depending on the JSON format exported
  let frames1 = json1.frames || (json1.textures && json1.textures[0] && json1.textures[0].frames);
  let frames2 = json2.frames || (json2.textures && json2.textures[0] && json2.textures[0].frames);

  if (!frames1 || !frames2) {
    console.error('Unsupported JSON format. Could not find frames array/object.');
    process.exit(1);
  }

  const newFrames = {};

  // Parse frames1
  if (Array.isArray(frames1)) {
    frames1.forEach(f => {
      const key = f.filename;
      const fCopy = { ...f };
      delete fCopy.filename;
      newFrames[key] = fCopy;
    });
  } else {
    Object.assign(newFrames, frames1);
  }

  const w1 = img1.bitmap.width;
  const h1 = img1.bitmap.height;
  const w2 = img2.bitmap.width;
  const h2 = img2.bitmap.height;

  const targetW = Math.max(w1, w2);
  const targetH = h1 + h2;

  // Combine images (append dir2 vertically below dir1)
  const combinedImg = new Jimp(targetW, targetH, 0x00000000);
  combinedImg.composite(img1, 0, 0);
  combinedImg.composite(img2, 0, h1);

  // Parse and offset frames2
  if (Array.isArray(frames2)) {
    frames2.forEach(f => {
      let key = f.filename;
      // Handle key collision by appending name2 if needed, but normally they are distinct
      if (newFrames[key]) key = `${name2}_${key}`; 
      
      const fCopy = { ...f };
      delete fCopy.filename;
      fCopy.frame.y += h1;
      newFrames[key] = fCopy;
    });
  } else {
    for (let [key, val] of Object.entries(frames2)) {
      if (newFrames[key]) key = `${name2}_${key}`; 
      
      const fCopy = JSON.parse(JSON.stringify(val));
      fCopy.frame.y += h1;
      newFrames[key] = fCopy;
    }
  }

  const newJson = { ...json1 };
  newJson.frames = newFrames;
  if (newJson.textures) delete newJson.textures; // Standardize to Phaser's Hash format
  
  if (newJson.meta && newJson.meta.size) {
    newJson.meta.size = { w: targetW, h: targetH };
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  await combinedImg.writeAsync(path.join(outDir, 'spritesheet.png'));
  fs.writeFileSync(path.join(outDir, 'spritesheet.json'), JSON.stringify(newJson, null, 2));

  console.log(`Merged successfully! Output saved to: ${outDir}`);
}

merge().catch(console.error);
