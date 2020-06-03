const fs = require("fs")
const fetch = require("node-fetch").default
const crypto = require("crypto")

const sources = process.argv[2] ? [process.argv[2]] : fs.readFileSync(__dirname+"/sources.txt", "utf8").split(/[\r\n]+/g).filter(e => !!e)

console.log(`Processing sources: ${sources.map(e => "\x1b[31m"+e.replace("https://raw.githubusercontent.com/", "")+"\x1b[0m").join(", ")}`)

sources.forEach(src => {
    fetch(src)
    .then(async res => {
        if(res.status !== 200)return console.error(`\x1b[31m${src} returned ${res.status}.\x1b[0m`)
        const body = await res.buffer()
        const hash = crypto.createHash("sha256").update(body).digest("hex")
        const type = src.endsWith(".js") ? "Plugin" : "Theme"
        const options = parseMeta(body.toString("utf8"))

        console.log(`\x1b[32m${src.replace("https://raw.githubusercontent.com/", "")}: \x1b[33m${hash}\x1b[0m`)
        if(fs.existsSync(__dirname+"/hashes/"+hash))return
        fs.writeFileSync(__dirname+"/hashes/"+hash, JSON.stringify({
            type,
            name: options.displayName || options.name
        }, null, "    "))
    }).catch(console.error)
})


/** Theses functions were taken from the BetterDiscordApp scripts. */
function parseMeta(content){
    const firstLine = content.split("\n")[0];
    const hasOldMeta = firstLine.includes("//META");
    if (hasOldMeta) return parseOldMeta(content);
    const hasNewMeta = firstLine.includes("/**");
    if (hasNewMeta) return parseNewMeta(content);
    throw new Error("META was not found.");
}

function parseOldMeta(content) {
    const meta = content.split("\n")[0];
    const rawMeta = meta.substring(meta.lastIndexOf("//META") + 6, meta.lastIndexOf("*//"));
    if (meta.indexOf("META") < 0) throw new Error("META was not found.");
    const parsed = JSON.parse(rawMeta);
    if (!parsed) throw new Error("META could not be parsed.");
    if (!parsed.name) throw new Error("META missing name data.");
    parsed.format = "json";
    return parsed;
}

const splitRegex = /[^\S\r\n]*?(?:\r\n|\n)[^\S\r\n]*?\*[^\S\r\n]?/;
const escapedAtRegex = /^\\@/;

function parseNewMeta(content) {
    const block = content.split("/**", 2)[1].split("*/", 1)[0];
    const out = {};
    let field = "";
    let accum = "";
    for (const line of block.split(splitRegex)) {
        if (line.length === 0) continue;
        if (line.charAt(0) === "@" && line.charAt(1) !== " ") {
            out[field] = accum;
            const l = line.indexOf(" ");
            field = line.substr(1, l - 1);
            accum = line.substr(l + 1);
        }
        else {
            accum += " " + line.replace("\\n", "\n").replace(escapedAtRegex, "@");
        }
    }
    out[field] = accum.trim();
    delete out[""];
    out.format = "jsdoc";
    return out;
}