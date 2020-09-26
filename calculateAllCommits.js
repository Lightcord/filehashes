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
    for(let provider of providers){
        let parts = src.match(provider.pattern)
        if(!parts)continue // didn't match pattern
        
        provider.fetchCommits(parts)
        .then(commits => {
            if(commits.length === 0){
                console.error(`\x1b[31mFound ${commits.length} commits for ${src}.\x1b[0m`)
            }else{
                console.log(`\x1b[32mFound ${commits.length} commits for ${src}.\x1b[0m`)
            }
            commits.forEach(comm => {
                const rawURL = provider.getRawURL(src, parts, comm)
                fetch(rawURL)
                .then(async res => {
                    if(res.status !== 200)return console.error(`\x1b[31m${rawURL} returned ${res.status}.\x1b[0m`)
                    const body = await res.buffer()
                    const hash = crypto.createHash("sha256").update(body).digest("hex")
                    const type = src.endsWith(".js") ? "Plugin" : "Theme"
                    const meta = parseMeta(body.toString("utf8"))
            
                    console.log(`\x1b[32m${src.replace(provider.rawURLBase, "")}: \x1b[33m${hash}\x1b[0m`)
                    if(fs.existsSync(__dirname+"/hashes/"+hash)){
                        const data = JSON.parse(fs.readFileSync(__dirname+"/hashes/"+hash, "utf-8"))
                        if(!!data.suspect !== blacklist){
                            console.log(`Switching ${rawURL} to ${!data.suspect} suspect`)
                        }else return
                    }
    
                    if(blacklist){
                        fs.writeFileSync(__dirname+"/hashes/"+hash, JSON.stringify({
                            harm: "Blacklist: "+blacklistReason,
                            name: meta.displayName || meta.name,
                            suspect: true,
                            type,
                            src: rawURL
                        }, null, "    "))
                    }else{
                        if(src.includes("Lightcord/BetterDiscordAddons")){// official
                            fs.writeFileSync(__dirname+"/hashes/"+hash, JSON.stringify({
                                type,
                                name: meta.displayName || meta.name,
                                official: true,
                                src: rawURL
                            }, null, "    "))
                        }else{
                            fs.writeFileSync(__dirname+"/hashes/"+hash, JSON.stringify({
                                type,
                                name: meta.displayName || meta.name,
                                src: rawURL
                            }, null, "    "))
                        }
                    }
                }).catch(console.error)
            })
        }).catch(console.error)
        return
    }
    console.log(`\x1b[31mCouldn't find a provider for ${src}\x1b[0m`)
})

const providers = [
    {
        name: "Github",
        pattern: /^https\:\/\/raw\.githubusercontent\.com\/([\w\d\-\.]+\/[\w\d\-\.]+)\/([\.\w\d-]+)([^\n]+)$/,
        async fetchCommits(parts){
            const repo = parts[1]
            const branch = parts[2]
            const path = parts[3]

            const apiUrl = `https://api.github.com/repos/${repo}/commits?sha=${branch}&path=${path}`
            const res = await fetch(apiUrl, {
                headers: {
                    "User-Agent": "Lightcord-Filehashes/1.0",
                    Authorization: "token "+ghToken
                }
            }).catch(err => err)
            
            if(res.status !== 200 || res instanceof Error)throw new Error(`\x1b[31m${apiUrl} returned ${res && res.message || res.status}.\x1b[0m`)
            const commits = await res.json()

            return commits
        },
        getRawURL(src, parts, commit){
            const repo = parts[1]
            const path = parts[3]
            return `https://raw.githubusercontent.com/${repo}/${commit.sha}${path}`
        },
        rawURLBase: "https://raw.githubusercontent.com/"
    },
    {
        name: "GitLab",
        pattern: /^https:\/\/gitlab\.com\/([\w\d\-\.]+\/[\w\d\-\.]+)\/(\-\/)?raw\/([\.\w\d-]+)([^\n]+)$/,
        async fetchCommits(parts){
            const repo = parts[1]
            const branch = parts[3]
            const path = parts[4]

            const apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}/repository/commits?ref_name=${branch}&all=true`
            console.log(apiUrl)
            const res = await fetch(apiUrl, {
                headers: {
                    "User-Agent": "Lightcord-Filehashes/1.0"
                }
            }).catch(err => err)
            
            if(res.status !== 200 || res instanceof Error)throw new Error(`\x1b[31m${apiUrl} returned ${res && res.message || res.status}.\x1b[0m`)
            const commits = await res.json()

            return commits
        },
        getRawURL(src, parts, commit){
            const repo = parts[1]
            const branch = parts[3]
            const path = parts[4]
            return `https://gitlab.com/${repo}/-/raw/${commit.id}${path}`
        },
        rawURLBase: "https://gitlab.com/"
    }
]


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