const fs = require("fs")
const fetch = require("node-fetch").default
const crypto = require("crypto")
const ghToken = fs.readFileSync("./gh-token", "utf8")

const sources = process.argv[2] ? [process.argv[2]] : fs.readFileSync(__dirname+"/sources.txt", "utf8").split(/[\r\n]+/g).filter(e => !!e && !e.startsWith("#"))

//console.log(`Processing sources: ${sources.map(e => "\x1b[31m"+e.replace("https://raw.githubusercontent.com/", "")+"\x1b[0m").join(", ")}`)

sources.forEach(async (src, i) => {
    await new Promise(resolve => setTimeout(resolve, i * 100))
    let blacklist = false
    let blacklistReason = null
    if(src.startsWith("!")){
        blacklist = true
        blacklistReason = src.split(" - ").slice(1).join(" - ") || "No reason specified."
        src = src.slice(1).split(" - ")[0]
    }
    console.log(src)
    let parts = src.match(/^https\:\/\/raw\.githubusercontent\.com\/([\w\d-\.]+\/[\w\d-\.]+)\/([\.\w\d-]+)([^\n]+)$/)
    if(!parts)return // didn't match a github link
    const repo = parts[1]
    const branch = parts[2]
    const path = parts[3]
    let apiUrl = `https://api.github.com/repos/${repo}/commits?sha=${branch}&path=${path}`

    fetch(apiUrl, {
        headers: {
            "User-Agent": "Lightcord-Filehashes/1.0",
            Authorization: "token "+ghToken
        }
    })
    .then(async res => {
        if(res.status !== 200)return console.error(`\x1b[31m${apiUrl} returned ${res.status}.\x1b[0m`)
        const commits = await res.json()
        commits.forEach(comm => {
            fetch(`https://raw.githubusercontent.com/${repo}/${comm.sha}${path}`)
            .then(async res => {
                if(res.status !== 200)return console.error(`\x1b[31m${repo}/${comm.sha}${path} returned ${res.status}.\x1b[0m`)
                const body = await res.buffer()
                const hash = crypto.createHash("sha256").update(body).digest("hex")
                const type = src.endsWith(".js") ? "Plugin" : "Theme"
                const options = parseMeta(body.toString("utf8"))
        
                console.log(`\x1b[32m${src.replace("https://raw.githubusercontent.com/", "")}: \x1b[33m${hash}\x1b[0m`)
                if(fs.existsSync(__dirname+"/hashes/"+hash)){
                    const data = JSON.parse(fs.readFileSync(__dirname+"/hashes/"+hash, "utf-8"))
                    if(!!data.suspect !== blacklist){
                        console.log(`Switching ${repo}/${comm.sha}${path} to ${!data.suspect}`)
                    }else return
                }

                if(blacklist){
                    fs.writeFileSync(__dirname+"/hashes/"+hash, JSON.stringify({
                        harm: "Blacklist: "+blacklistReason,
                        name: options.displayName || options.name,
                        suspect: true,
                        type,
                        src: `https://raw.githubusercontent.com/${repo}/${comm.sha}${path}`
                    }, null, "    "))
                }else{
                    if(src.includes("Lightcord/BetterDiscordAddons")){// official
                        fs.writeFileSync(__dirname+"/hashes/"+hash, JSON.stringify({
                            type,
                            name: options.displayName || options.name,
                            official: true,
                            src: `https://raw.githubusercontent.com/${repo}/${comm.sha}${path}`
                        }, null, "    "))
                    }else{
                        fs.writeFileSync(__dirname+"/hashes/"+hash, JSON.stringify({
                            type,
                            name: options.displayName || options.name,
                            src: `https://raw.githubusercontent.com/${repo}/${comm.sha}${path}`
                        }, null, "    "))
                    }
                }
            }).catch(console.error)
        })
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