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
  let dir = process.argv[4];
  if (!dir){
    dir = ".";
  } else {
    fs.mkdirSync(dir, {recursive:true}) 
  }
  // step 2 initialize git

  // init();

  // step 3 - get pack data from the host;
  const {packData, head} = await fetchPackData(url);
  console.log(packData);
  // step 4 - parse and store data
  parseAndStorePackFile(packData);
  // step 5 - write parse data;
}

function parsePackObject(buffer, offset){
 //The Buffer starts with 8 bits 
  // first 4 = types, other 4 = size;
  // 11001010 >> 4 basically ---> Shifts the beginning with 4 0s.. so it becomes 00001100 
  // This way we have isolated the type.
  // Type has 0, 1, 2, 3, 4;
  // 0x07 equates to 00000111 basically 7 2^0, 2^1, 2^2 > 1+2+4 = 7 but that 7 holds no value to us.. whats important is it binary form.
  // 00000111 & 00001100 = 0000100 which is 4;
  // basicaly 1 & 1 = 1; 1&0 = 0 and 0&0 =0; why do we do this? Its the way we extract the type..
  // so 111 will always give us the last 3 digits.. which we need to get the type - then why are we even given 4 digits?
  // 00000[1]11 => Even tho its useless and its actually future proofing.. what if they make more in the future? by for now, its totally useless for us.
  // The 4th bit (the leftmost bit in the nibble) being 1 serves as an indicator that the byte is formatted to contain a valid object type and helps maintain a consistent structure across different types of objects.
  const type = (buffer[offset] >> 4) & 0x07; // Read the type

  // as I stated before lower bits contains size there for according to our dummy data
  //11001010 is added to 00001111 which is basically 0x0F = like 7 F in hex is 15 decimal;
  // therefore it lets us read it upper half equates to 0 bcuz 0x0F only has 4 1s in the lower half and upperhalf has all 0.
  // 11001010 & 00001111 -> 00001010 which is 10 in decimals;
  let size = buffer[offset] & 0x0F; // Read size
}

function parseAndStorePackFile(buffer, dir = "."){
  const header = buffer.slice(0, 8);
  const objectCount = buffer.readUInt32BE(8);
  console.log(objectCount);

  let offset = 8; // Start reading after the header

  for (let i = 0; i < objectCount; i++) {
      const [parsedBytes, obj] = parsePackObject(buffer, offset);
      offset += parsedBytes;
      
      // Store the object in the objects directory
      // storeObject(obj, gitDir);
  }


}

async function fetchPackData(url){
  // const gitUploadPackUrl = `${url}/info/refs?service=git-upload-pack`;
  // const response = await axios.get(gitUploadPackUrl);
  // const lines = response.data.split('\n')
  const lines = [
    '001e# service=git-upload-pack',
    '00000153bea4a79f49ef61240780b957eb393cf60df881a3 HEAD\x00multi_ack thin-pack side-band side-band-64k ofs-delta shallow deepen-since deepen-not deepen-relative no-progress include-tag multi_ack_detailed allow-tip-sha1-in-want allow-reachable-sha1-in-want no-done symref=HEAD:refs/heads/main filter object-format=sha1 agent=git/github-0c410e9f6fc4',
    '003dbea4a79f49ef61240780b957eb393cf60df881a3 refs/heads/main',
    '0000'
  ]
  let packHash = "";
  let headName = ""
  for (const line of lines) {
    if ((line.includes("refs/heads/master") && line.includes("0032")) || (line.includes("refs/heads/main") && line.includes("003d"))) {
        const parts = line.split(" ");
        headName = parts[1].split("/")[2];
        packHash = parts[0].substring(4);
        break;
    }
  }

  const packFileResponse = await axios.post(`${url}/git-upload-pack`, Buffer.from(`0032want ${packHash}\n00000009done\n`), {
    headers: {
        "Content-Type": "application/x-git-upload-pack-request"
    },
    responseType: "arraybuffer"
  });

  return { packData: packFileResponse.data, head: headName }; 
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

/**
function parseAndStorePackFile(buffer, gitDir) {
    const header = buffer.slice(0, 8);
    const objectCount = buffer.readUInt32BE(4); // Read the number of objects
    let offset = 8; // Start reading after the header

    for (let i = 0; i < objectCount; i++) {
        const [parsedBytes, obj] = parsePackObject(buffer, offset);
        offset += parsedBytes;
        
        // Store the object in the objects directory
        storeObject(obj, gitDir);
    }
}

function parsePackObject(buffer, offset) {
    const type = (buffer[offset] >> 4) & 0x07; // Read the type
    let size = buffer[offset] & 0x0F; // Read size
    let sizeOffset = 4;

    while (buffer[offset] >= 128) {
        offset++;
        size += (buffer[offset] & 0x7F) << sizeOffset;
        sizeOffset += 7;
    }

    offset++; // Move past the current byte

    // Read the actual object data
    const data = buffer.slice(offset, offset + size);
    offset += size;

    // For simplicity, we'll treat the type as a string (1: commit, 2: tree, 3: blob)
    const typeString = ["commit", "tree", "blob"][type - 1];

    return [offset, { type: typeString, content: data }];
}

function storeObject({ type, content }, gitDir) {
    const hash = createObjectHash(content);
    const objectDir = path.join(gitDir, ".git", "objects", hash.substring(0, 2));
    const objectFile = path.join(objectDir, hash.substring(2));

    // Create the directory if it doesn't exist
    fs.mkdirSync(objectDir, { recursive: true });
    const compressed = zlib.deflateSync(content);
    
    // Write the compressed object to the file
    fs.writeFileSync(objectFile, compressed);
}

function createObjectHash(content) {
    // This function would generate a SHA-1 hash of the object
    const crypto = require("crypto");
    const hash = crypto.createHash("sha1");
    hash.update(content);
    return hash.digest("hex");
} 

* 
 */