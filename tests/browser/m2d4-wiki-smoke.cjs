'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = process.cwd();
const HOST = '127.0.0.1';
const TIMEOUT_MS = 30000;

function mimeType(file){
    switch (path.extname(file).toLowerCase()){
        case '.html': return 'text/html; charset=utf-8';
        case '.js': return 'text/javascript; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.ico': return 'image/x-icon';
        case '.png': return 'image/png';
        case '.svg': return 'image/svg+xml';
        case '.woff': return 'font/woff';
        case '.woff2': return 'font/woff2';
        default: return 'application/octet-stream';
    }
}

function startServer(){
    const server = http.createServer((req, res) => {
        const requestUrl = new URL(req.url, `http://${HOST}`);
        let relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
        if (!relative) relative = 'wiki.html';
        const file = path.resolve(ROOT, relative);
        const rootPrefix = `${path.resolve(ROOT)}${path.sep}`;
        if (!file.startsWith(rootPrefix)){
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        fs.readFile(file, (error, data) => {
            if (error){
                res.writeHead(error.code === 'ENOENT' ? 404 : 500);
                res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
                return;
            }
            res.writeHead(200, {
                'Content-Type': mimeType(file),
                'Cache-Control': 'no-store',
            });
            res.end(data);
        });
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, HOST, () => {
            resolve({ server, port: server.address().port });
        });
    });
}

function dumpWikiDom(url, profileDir){
    const chrome = process.env.CHROME_BIN || process.env.GOOGLE_CHROME_BIN || 'google-chrome';
    const args = [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1280,900',
        '--virtual-time-budget=8000',
        `--user-data-dir=${profileDir}`,
        '--dump-dom',
        url,
    ];

    return new Promise((resolve, reject) => {
        const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`Timed out waiting for the wiki browser smoke.\n${stderr}`));
        }, TIMEOUT_MS);

        child.stdout.on('data', chunk => { stdout += chunk.toString(); });
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.once('error', error => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('exit', code => {
            clearTimeout(timeout);
            if (code !== 0){
                reject(new Error(`Headless Chrome exited with code ${code}.\n${stderr}`));
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

async function run(){
    for (const required of ['wiki.html', 'wiki/wiki.js', 'wiki/wiki.css']){
        if (!fs.existsSync(path.join(ROOT, required))){
            throw new Error(`Missing built wiki artifact ${required}. Run npm run build before npm run test:browser.`);
        }
    }

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-m2d4-wiki-'));
    const { server, port } = await startServer();
    try {
        const url = `http://${HOST}:${port}/wiki.html#list-achievements`;
        const { stdout } = await dumpWikiDom(url, profileDir);
        if (!stdout.includes('id="main"') || !stdout.includes('id="filtering"') || !stdout.includes('id="a-trade"')){
            throw new Error('M2D4 wiki browser smoke did not render the achievement page through the authoritative reader facade.');
        }
        console.log('M2D4 wiki browser smoke passed: real Chrome booted the built wiki and rendered the achievement list.');
    }
    finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

run().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
});
