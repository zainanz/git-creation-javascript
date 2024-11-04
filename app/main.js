const fs = require("fs");
const path = require("path");
const zlib = require("zlib")
const crypto = require("crypto");
const axios = require("axios");
// You can use print statements as follows for debugging, they'll be visible when running tests.

// Uncomment this block to pass the first stage
const command = process.argv[2];

switch (command) {
  case "init":
    createGitDirectory();
    break;
  case "cat-file":
    let hash = process.argv[4];
    if(!hash) hash = process.argv[3];
    catFile(hash);
    break;
  case "hash-object":
    createObject();

    break;
  case "ls-tree":
    lsTree();
    break;
  case "write-tree":
    writeTree();
    break;
  case "commit-tree":
    createCommitTree();
    break;
  case "clone":
    clone();
    break;
  default:
    throw new Error(`Unknown command ${command}`);
}

async function clone(){
  // step 1 retrieve data
  const url = process.argv[3];
  console.log(url);
  const dir = process.argv[4];
  if (!dir){
    dir = ".";
  } else {
    fs.mkdirSync(dir, {recursive:true}) 
  }
  // step 2 initialize git

  // init();

  // step 3 - get pack data from the host;
  const {packData, head} = await fetchPackData(url);
  // step 4 - parse and store data
  // step 5 - write parse data;
}

async function fetchPackData(url){
  const gitUploadPackUrl = `${url}/info/refs?service=git-upload-pack`;
  const response = await axios.get(gitUploadPackUrl);
  console.log(response.data);
}


function lsTree() {
  const hash = process.argv[3];
  const objectPath = path.join(".git", "objects", hash.slice(0, 2), hash.slice(2));
  
  const fileData = fs.readFileSync(objectPath);
  const uncompressedData = zlib.inflateSync(fileData);
  const nullIndex = uncompressedData.indexOf(0);
  const header = uncompressedData.subarray(0, nullIndex).toString();
  const content = uncompressedData.subarray(nullIndex + 1);  
  if(!header.startsWith("tree")){
    console.error("Invalid tree");
  }

  let offset = 0;
  const entries = []
  while (offset < content.length){
    const spaceIndex = content.indexOf(0x20, offset);
    const mode = content.subarray(offset, spaceIndex).toString();
    offset = spaceIndex + 1;
    let nameIndex = content.indexOf(0, offset); 
    const name = content.subarray(offset, nameIndex).toString();
    offset = nameIndex + 1;
    const hashBuffer = content.subarray(offset, offset + 20);
    let cur_hash = hashBuffer.toString("hex");
    offset += 20; 
    entries.push({mode, name, hash: cur_hash })
  }

  console.log("\n\n")
  entries.forEach(entry => {
    console.log(`${entry.mode} ${entry.mode === "100644" ? "blob" : "tree"} ${entry.hash}    ${entry.name}`)
  })
}


function createCommitTree(){
  const treeSha = process.argv[3];// current commit
  const parentSha = process.argv[process.argv.indexOf("-p")+1];
  const message = process.argv[process.argv.indexOf("-m")+1];
  const contentBuffer = Buffer.from(`tree ${treeSha}\nauthor zainan Ali <zainanzaher09@gmail.com> ${Date.now()}\ncommiter zainan Ali <zainanzaher09@gmail.com> ${Date.now()}\n\n ${message}`);
  const commitBuffer = Buffer.concat([Buffer.from(`commit ${contentBuffer.length}\x00`), contentBuffer])
  const commitHash = crypto.createHash("sha1").update(commitBuffer).digest("hex");
  try {
    writeBlobFile(commitHash, commitBuffer);
  } catch(er){
    console.error("An Error Occured");
  }
}

function writeBlobFile(hash, data){
  const dir = hash.slice(0,2);
  const fileName = hash.slice(2);
  const dirPath = path.join(process.cwd(),".git", "objects", dir);
  // We will create a directory
  try {
    fs.mkdirSync(dirPath);

  }catch(er){console.error(er)};
  const fileToCreate = path.join(dirPath, fileName);
  const compressedData = zlib.deflateSync(data);
  fs.writeFileSync(fileToCreate, compressedData);
}

function saveBlobFile(cur_path){
  // data formats >> `blob 30\x00{content here}
  const data = `blob ${fs.statSync(cur_path).size}\x00${fs.readFileSync(cur_path)}`
  // sha1 converts it into cryptographic hash object that produces 160-bit (20-byte) hash value.
  // its encoded in hex format - 40 characters
  const hash = crypto.createHash("sha1").update(data).digest("hex");
  writeBlobFile(hash, data);
  return hash;
}

function writeTreePath(current_path) {
  let dirs = fs.readdirSync(current_path);
  dirs = dirs.filter(dir => dir !== ".git" && dir !== "main.js" && dir !== ".codecrafters")
    .map(name => {
      const fullPath = path.join(current_path, name);
      console.log(fullPath)
      const fileProperties = fs.statSync(fullPath);
      if (fileProperties.isDirectory()) {
        const a = ["40000", name, writeTreePath(fullPath)]; // Recursive call
        console.log(a)
        return a
      } else if (fileProperties.isFile()) {
        const a =  ["100644", name, saveBlobFile(fullPath)];
        console.log(a)
        return a
      }
      return ["", "", ""];
    });
  const reduced_dir = dirs.reduce((acc, [mode, name, hash]) => {
    if (hash) {
      const a = Buffer.concat([
        acc,
        Buffer.from(`${mode} ${name}\x00`),
        Buffer.from(hash, "hex")
      ]);
      console.log(a);
      return a
    }
    return acc;
  }, Buffer.alloc(0));
  const entriesCount = dirs.filter(dir => dir[2]).length; // Count valid hashes

  const tree = Buffer.concat([Buffer.from(`tree ${entriesCount}\x00`), reduced_dir]);
  // Directly write the tree without compressing again
  const treeHash = crypto.createHash("sha1").update(tree).digest("hex");
  writeBlobFile(treeHash, tree);
  
  return treeHash;
}



function writeTree(){
  let treeHash = writeTreePath(".");
  console.log(treeHash)
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
  // // we pass the hash and contents of the file to the function which then creates the directory and file.
  writeBlobFile(hash, content);
  process.stdout.write(hash);
}

function catFile(hash){
  const content = fs.readFileSync(path.join(process.cwd(), ".git", "objects", hash.slice(0, 2), hash.slice(2)));
  console.log(content)
  const uncompressedData = zlib.unzipSync(content);
  console.log(uncompressedData);
  process.stdout.write(uncompressedData.toString().split("\x00")[1]);
}

function createGitDirectory() {
  fs.mkdirSync(path.join(process.cwd(), ".git"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), ".git", "objects"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), ".git", "refs"), { recursive: true });

  fs.writeFileSync(path.join(process.cwd(), ".git", "HEAD"), "ref: refs/heads/main\n");
  console.log("Initialized git directory");
}
