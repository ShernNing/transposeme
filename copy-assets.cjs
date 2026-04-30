// This script copies dist/ and server/ into each packaged Electron app output folder after packaging.
// Usage: node copy-assets.js

const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "release-build");
const folders = fs
  .readdirSync(buildDir)
  .filter((f) => fs.statSync(path.join(buildDir, f)).isDirectory());

const assets = ["dist", "server"];

folders.forEach((folder) => {
  const target = path.join(buildDir, folder);
  assets.forEach((asset) => {
    const src = path.join(__dirname, asset);
    const dest = path.join(target, asset);
    if (fs.existsSync(src)) {
      // Copy recursively
      fs.cpSync(src, dest, { recursive: true, force: true });
      console.log(`Copied ${asset} to ${dest}`);
    } else {
      console.warn(`Source folder not found: ${src}`);
    }
  });
});

console.log("Asset copy complete.");
