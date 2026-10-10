// 构建「大富翁」静态版：拉取固定提交的上游源码，打上 third_party/mine-monopoly/static-mode.patch，
// 用 Vite 的 web 模式构建，把产物放到 ./monopoly/（由 Pages 随站点一起发布）。
//
//   npm run build:monopoly                  克隆到临时目录，构建完删除
//   npm run build:monopoly -- --src <dir>   复用一份已有的上游检出（会在里面打补丁，目录必须是干净的）
//
// 上游是 GPL-3.0，见 third_party/mine-monopoly/README.md。
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'third_party/mine-monopoly');
const patch = join(dir, 'static-mode.patch');
const [repo, commit] = readFileSync(join(dir, 'UPSTREAM'), 'utf8').trim().split(/\s+/);
const out = join(root, 'monopoly');
const pnpm = ['--yes', 'pnpm@10.10.0'];

const srcIndex = process.argv.indexOf('--src');
const reuse = srcIndex > 0 ? resolve(process.argv[srcIndex + 1]) : null;
const work = reuse ?? mkdtempSync(join(tmpdir(), 'monopoly-build-'));

// 上游的 env 插件会把构建进程的整个 process.env 写进前端产物（只排除 MYSQL_PASSWORD / TC_KEY），
// 所以：安装、克隆这些步骤只给最小环境；真正跑 vite 的那一步给「裸环境」（只有 VITE_*），连 PATH / HOME 都不带。
const SAFE_ENV = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SHELL', 'USER', 'LOGNAME', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA']
    .filter((k) => process.env[k] !== undefined)
    .map((k) => [k, process.env[k]])
);
const run = (cmd, args, cwd, env = {}, bare = false) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: bare ? env : { ...SAFE_ENV, ...env } });

// 第二道防线：真正的保证是 vite 那一步只有裸环境；这里只是兜底，且只盯真正敏感的两类，
// 否则 CI 里 GITHUB_SERVER_URL=https://github.com 这种恰好出现在依赖代码里的值会误报：
//   1. 名字像凭据的变量（TOKEN / SECRET / PASSWORD / AUTH / SOCK / KEY ...），值长度 >= 8
//   2. 本机绝对路径（HOME、PATH、PWD、RUNNER_TEMP ...），值以 / 开头且长度 >= 12
// MONOPOLY_MAP_ENCRYPT_KEY 本来就是要写进产物的，不算。
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const SENSITIVE_NAME = /TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|SOCK|PRIVATE|SESSION|KEY/i;
function leakCandidates(env) {
  return Object.entries(env).filter(([k, v]) => {
    if (!v || k === 'MONOPOLY_MAP_ENCRYPT_KEY') return false;
    return (SENSITIVE_NAME.test(k) && v.length >= 8) || (v.startsWith('/') && v.length >= 12);
  });
}
function assertNoEnvLeak(outDir, env = process.env) {
  const secrets = leakCandidates(env);
  for (const file of walk(outDir).filter((f) => /\.(js|css|html|json|mjs)$/.test(f))) {
    const text = readFileSync(file, 'utf8');
    for (const [k, v] of secrets) {
      if (text.includes(v)) throw new Error(`构建产物 ${file} 含有环境变量 ${k} 的值，已中止`);
    }
  }
}

// monopoly-maps/ 里的 .fpmap 随站点发布：输出用内容哈希命名（避开中文文件名），清单写进 maps/index.json，
// 游戏里点「选择地图」就会列出它们。排序：正式版在前、带「测试」的在后，各自按版本号新的在前（第一张会被默认选中）。
function bundleMaps() {
  const src = join(root, 'monopoly-maps');
  if (!existsSync(src)) return;
  const version = (name) => (name.match(/v(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number) ?? [0, 0, 0]);
  const files = readdirSync(src).filter((f) => f.endsWith('.fpmap')).sort((a, b) => {
    if (a.includes('测试') !== b.includes('测试')) return a.includes('测试') ? 1 : -1;
    const [va, vb] = [version(a), version(b)];
    for (let i = 0; i < 3; i++) if (va[i] !== vb[i]) return vb[i] - va[i];
    return a.localeCompare(b);
  });
  if (!files.length) return;
  mkdirSync(join(out, 'maps'), { recursive: true });
  const maps = files.map((f) => {
    const data = readFileSync(join(src, f));
    const file = `maps/${createHash('sha256').update(data).digest('hex').slice(0, 12)}.fpmap`;
    writeFileSync(join(out, file), data);
    return { name: f.replace(/\.fpmap$/, ''), file, size: data.length };
  });
  writeFileSync(join(out, 'maps/index.json'), JSON.stringify({ maps }, null, 2));
  console.log(`已内置 ${maps.length} 张地图：${maps.map((m) => m.name).join('、')}`);
}

try {
  if (!reuse) {
    run('git', ['init', '-q'], work);
    run('git', ['fetch', '-q', '--depth', '1', repo, commit], work);
    run('git', ['checkout', '-q', 'FETCH_HEAD'], work);
  }
  run('git', ['apply', patch], work);
  // 构建时只会读到这份配置：静态版不发任何请求，里面的域名、端口都不会被用到。
  // 唯一有用的是 MAP_ENCRYPT_KEY：.mmmap 地图是用它加密的，它必须和导出地图的编辑器所用的密钥一致，
  // 默认是上游 .env.example 里的占位值；自己改过的话用 MONOPOLY_MAP_ENCRYPT_KEY 传进来（16 位 ASCII）。
  // 注意这个密钥会原样写进公开的前端产物（上游就是这么设计的），所以别拿它当秘密。
  let envText = readFileSync(join(work, '.env.example'), 'utf8');
  const mapKey = process.env.MONOPOLY_MAP_ENCRYPT_KEY;
  if (mapKey) {
    if (!/^[\x21-\x7e]{16}$/.test(mapKey)) throw new Error('MONOPOLY_MAP_ENCRYPT_KEY 必须是 16 位可见 ASCII 字符');
    envText = envText.replace(/^MAP_ENCRYPT_KEY=.*$/m, `MAP_ENCRYPT_KEY=${mapKey}`);
  }
  writeFileSync(join(work, '.env'), envText);
  run('npx', [...pnpm, 'install', '--ignore-scripts', '--frozen-lockfile', '--filter', '@mine-monopoly/client...'], work);
  run('npx', [...pnpm, '--filter', '@mine-monopoly/env', 'run', 'build'], work);
  const client = join(work, 'apps/client');
  run(process.execPath, [join(dirname(createRequire(join(client, 'package.json')).resolve('vite/package.json')), 'bin/vite.js'), 'build', '--mode', 'web'], client, {
    VITE_STATIC_MODE: '1',
    VITE_WEB_BASE_PATH: '/monopoly/'
  }, true);

  rmSync(out, { recursive: true, force: true });
  cpSync(join(work, 'apps/client/dist/frontend'), out, { recursive: true });
  assertNoEnvLeak(out);
  bundleMaps();
  // 地图编辑器才用的 Draco 编码器，游戏里没有引用
  rmSync(join(out, 'draco/draco_encoder.js'), { force: true });
  // 上游的「给作者支持」收款码：static-mode.patch 已经把入口去掉，这里再兜底删掉图片，
  // 免得哪次补丁没打全就把作者的微信/支付宝收款码随站点公开出去。
  const imagesDir = join(out, 'images');
  if (existsSync(imagesDir)) {
    for (const file of readdirSync(imagesDir)) {
      if (file.startsWith('reward-qr')) rmSync(join(imagesDir, file), { force: true });
    }
  }
  console.log(`\n大富翁静态版已生成：${out}`);
} catch (error) {
  rmSync(out, { recursive: true, force: true });
  throw error;
} finally {
  if (!reuse) rmSync(work, { recursive: true, force: true });
}
