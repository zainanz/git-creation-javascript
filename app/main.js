const fs = require("fs");
const path = require("path");
const zlib = require("zlib")
const crypto = require("crypto");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.error("Logs from your program will appear here!");

// Uncomment this block to pass the first stage
const command = process.argv[2];

switch (command) {
  case "init":
    createGitDirectory();
    break;
  case "cat-file":
    const hash = process.argv[4];
    catFile(hash);
    break;
  case "hash-object":
    createObject();

    break;
  default:
    throw new Error(`Unknown command ${command}`);
}

function createObject(){
  // Read contents of the file.
  const fileName = process.argv[4];
  const fileContent = fs.readFileSync(fileName);
  // // Get file size; - destructured size 
  const content = `blob ${fileContent.length}\x00${fileContent}`;
  // // Now I will convert the content to sha1 hash - so that we can use it's cryptic name to store data.
  // // following from before first 2 characters directory name - then remaing 38 subdirectory
  const hash = crypto.createHash("sha1").update(content).digest("hex");
  // // now we are gonna create a path (.git/objects/(2characters)/(38characters));
  const directory = path.join(process.cwd(), ".git", "objects");
  const parentHashDirectory = path.join(directory, hash.slice(0,2));
  fs.mkdirSync(parentHashDirectory, { recursive: true });
  const contentFile = path.join(parentHashDirectory, hash.slice(2));
  fs.writeFileSync(contentFile, zlib.deflateSync(content));
  process.stdout.write(hash);
}

function catFile(hash){
  const content = fs.readFileSync(path.join(process.cwd(), ".git", "objects", hash.slice(0, 2), hash.slice(2)));
  const uncompressedData = zlib.unzipSync(content);
  process.stdout.write(uncompressedData.toString().split("\x00")[1]);
}

function createGitDirectory() {
  fs.mkdirSync(path.join(process.cwd(), ".git"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), ".git", "objects"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), ".git", "refs"), { recursive: true });

  fs.writeFileSync(path.join(process.cwd(), ".git", "HEAD"), "ref: refs/heads/main\n");
  console.log("Initialized git directory");
}
