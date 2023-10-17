#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const chokidar = require("chokidar");

const argv = yargs(hideBin(process.argv))
  .option("dir", {
    alias: "d",
    description: "Directory to scan for images",
    demandOption: true,
  })
  .option("out", {
    alias: "o",
    description: "Output file",
    demandOption: true,
  })
  .option("ext", {
    description: "File extensions to match",
    default: "jpg,png,svg,gif",
    type: "string",
  })
  .option("watch", {
    alias: "w",
    type: "boolean",
    description: "Watch for file changes",
    default: false,
  })
  .help().argv;

const targetDirectory = argv.dir;
const outputFile = argv.out;
const extensions = argv.ext.split(",").map((ext) => `.${ext}`);

function getImportName(filePath) {
  const relativePath = path.relative(targetDirectory, filePath);
  const withoutExtension = path.join(
    path.dirname(relativePath),
    path.basename(relativePath, path.extname(relativePath))
  );
  const normalizedPath = withoutExtension.split(path.sep).join("_");

  // 英数字以外の文字を _ に置き換える
  return `${normalizedPath.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
}

function getExportName(filePath) {
  const baseName = getImportName(filePath);
  return `I_${baseName}`;
}

function getImagesFromDirectory(dir) {
  const results = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      results.push(...getImagesFromDirectory(fullPath));
    } else if (extensions.includes(path.extname(fullPath))) {
      results.push(fullPath);
    }
  }
  return results;
}

function generateExports() {
  const images = getImagesFromDirectory(targetDirectory);

  const usedNames = new Set();

  const importStatements = [];
  const exportStatements = [];

  images.forEach((img) => {
    const importName = getImportName(img);
    const exportName = getExportName(img);

    if (usedNames.has(exportName)) {
      throw new Error(
        `Duplicate export name detected: ${exportName} for image ${img}`
      );
    }
    usedNames.add(exportName);

    const relativePathToOutput = path
      .relative(path.dirname(outputFile), img)
      .replace(/\\/g, "/");

    importStatements.push(
      `import ${importName} from "./${relativePathToOutput}";`
    );
    exportStatements.push(`export const ${exportName} = ${importName};`);
  });

  const combinedContent = [...importStatements, ...exportStatements].join("\n");
  fs.writeFileSync(outputFile, combinedContent);
  console.log(`Generated exports in ${outputFile}`);
}

try {
  generateExports(); // 初回実行
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// -w オプションが指定された場合、監視を開始
if (argv.watch) {
  const watcher = chokidar.watch(targetDirectory, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
  });

  const handleFileChange = (filePath) => {
    const ext = path.extname(filePath);
    if (extensions.includes(ext)) {
      try {
        generateExports();
      } catch (err) {
        console.error(err.message);
      }
    }
  };

  watcher
    .on("add", handleFileChange)
    .on("change", handleFileChange)
    .on("unlink", handleFileChange);

  console.log(`Monitoring changes in directory: ${targetDirectory}`);
}
