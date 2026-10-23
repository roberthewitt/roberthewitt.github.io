import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const mapSource = new URL('https://roberthewitt.github.io/kingshot-discord-updates/');
const calculatorSource = new URL('https://roberthewitt.github.io/kingshot-bear-troop-calc/');
const calculatorSourceBase = '/kingshot-bear-troop-calc';
const calculatorDestinationBase = '/calculator';
const navigationTag = '<script type="module" src="/assets/tool-navigation.js"></script>';
const calculatorNavigationStyles = `<style data-tool-navigation-integration>
body {
  padding: 0;
}
body > .container {
  margin: 1rem auto;
}
@media (max-width: 640px) {
  body > .container {
    margin: 0.5rem;
  }
}
</style>`;
const writes = new Map();

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchResponse(url) {
  let error;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (caught) {
      error = caught;
      if (attempt < 4) await sleep(attempt * 1000);
    }
  }
  throw new Error(`Unable to fetch ${url}: ${error.message}`);
}

async function fetchBuffer(url) {
  return Buffer.from(await (await fetchResponse(url)).arrayBuffer());
}

async function fetchText(url) {
  return (await fetchResponse(url)).text();
}

function destination(relativePath) {
  const normalized = path.posix.normalize(relativePath).replace(/^(\.\.\/|\/)+/, '');
  if (!normalized || normalized.startsWith('../')) {
    throw new Error(`Unsafe output path: ${relativePath}`);
  }
  return path.join(outputRoot, normalized);
}

async function writeOutput(relativePath, content, source) {
  const normalized = relativePath.replaceAll('\\', '/');
  const existing = writes.get(normalized);
  if (existing) {
    throw new Error(`Output collision at ${normalized}: ${existing} and ${source}`);
  }
  writes.set(normalized, source);
  const target = destination(normalized);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

function localReferences(html) {
  return [...html.matchAll(/\b(?:src|href)=["']([^"'#]+)["']/gi)].map((match) => match[1]);
}

function injectNavigation(html) {
  if (html.includes('/assets/tool-navigation.js')) return html;
  if (!html.includes('</body>')) throw new Error('Cannot inject navigation into HTML without </body>');
  return html.replace('</body>', `  ${navigationTag}\n</body>`);
}

function injectCalculatorNavigation(html) {
  if (!html.includes('</head>')) {
    throw new Error('Cannot inject calculator navigation styles into HTML without </head>');
  }
  return injectNavigation(html.replace('</head>', `${calculatorNavigationStyles}</head>`));
}

async function waitForExpectedMapVersion() {
  const expected = process.env.EXPECTED_MAP_VERSION;
  if (!expected) return;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const dataset = JSON.parse(await fetchText(new URL('players.json', mapSource)));
      if (dataset.version?.label === expected) return;
    } catch {
      // Retry until the source Pages CDN exposes the dispatched version.
    }
    await sleep(30_000);
  }
  throw new Error(`Timed out waiting for map dataset ${expected}`);
}

async function waitForExpectedCalculatorBuild() {
  const expected = process.env.EXPECTED_CALCULATOR_BUILD;
  if (!expected) return;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const html = await fetchText(calculatorSource);
    const buildId = html.match(/buildId[^A-Za-z0-9_-]+([A-Za-z0-9_-]+)/)?.[1];
    if (buildId === expected) return;
    await sleep(30_000);
  }
  throw new Error(`Timed out waiting for calculator build ${expected}`);
}

async function copyLaunchPad() {
  await writeOutput('index.html', await readFile(path.join(root, 'index.html')), 'launch pad');
  await writeOutput(
    'assets/styles.css',
    await readFile(path.join(root, 'assets/styles.css')),
    'launch pad styles',
  );
  await writeOutput(
    'assets/tool-navigation.js',
    await readFile(path.join(root, 'assets/tool-navigation.js')),
    'shared navigation',
  );
  await writeOutput('.nojekyll', '', 'Pages configuration');
}

function sourceArtifactPath(url) {
  const rootPath = mapSource.pathname;
  if (url.origin !== mapSource.origin || !url.pathname.startsWith(rootPath)) {
    throw new Error(`Kingshot artifact references unexpected URL ${url}`);
  }
  return decodeURIComponent(url.pathname.slice(rootPath.length));
}

function missingPlannerArtifact(description) {
  return (error) => {
    throw new Error(
      `Unable to mirror the ${description}: ${error.message}. Publish the KvK planner from ` +
        'roberthewitt/kingshot-discord-updates before deploying this site.',
    );
  };
}

async function mirrorKingshotPages() {
  // The map, bear logger, and KvK planner are entry points of a single Vite
  // build published as one Pages artifact, so they are mirrored together. A
  // missing KvK route means the source deployment predates the planner, not
  // that the planner is optional here.
  const [mapHtmlRaw, bearHtmlRaw, kvkHtmlRaw, players, bearPlayers, kvkPlayers] = await Promise.all([
    fetchText(mapSource),
    fetchText(new URL('bear/', mapSource)),
    fetchText(new URL('kvk/', mapSource)).catch(missingPlannerArtifact('KvK planner')),
    fetchBuffer(new URL('players.json', mapSource)),
    fetchBuffer(new URL('bear-players.json', mapSource)),
    fetchBuffer(new URL('kvk-players.json', mapSource)).catch(missingPlannerArtifact('KvK roster')),
  ]);

  const artifactAssets = new Map();
  for (const [html, pageUrl] of [
    [mapHtmlRaw, mapSource],
    [bearHtmlRaw, new URL('bear/', mapSource)],
    [kvkHtmlRaw, new URL('kvk/', mapSource)],
  ]) {
    for (const reference of localReferences(html)) {
      const url = new URL(reference, pageUrl);
      if (url.origin !== mapSource.origin) continue;
      const artifactPath = sourceArtifactPath(url);
      if (artifactPath.startsWith('assets/')) artifactAssets.set(artifactPath, url);
    }
  }
  if (artifactAssets.size < 6) {
    throw new Error(
      `Expected complete map, bear, and KvK assets, found only ${artifactAssets.size}`,
    );
  }

  const mapHtml = injectNavigation(mapHtmlRaw.replaceAll('./assets/', '../assets/'));
  const bearHtml = injectNavigation(bearHtmlRaw.replace('href="../"', 'href="/map/"'));
  const kvkHtml = injectNavigation(kvkHtmlRaw.replace('href="../"', 'href="/map/"'));
  await writeOutput('map/index.html', mapHtml, 'map HTML');
  await writeOutput('bear/index.html', bearHtml, 'bear HTML');
  await writeOutput('kvk/index.html', kvkHtml, 'KvK HTML');
  await writeOutput('players.json', players, 'map dataset');
  await writeOutput('map/players.json', players, 'map runtime dataset');
  await writeOutput('bear-players.json', bearPlayers, 'bear dataset');
  await writeOutput('kvk-players.json', kvkPlayers, 'KvK dataset');

  await Promise.all(
    [...artifactAssets].map(async ([artifactPath, url]) => {
      await writeOutput(artifactPath, await fetchBuffer(url), `Kingshot asset ${url}`);
    }),
  );

  const mapDataset = JSON.parse(players);
  const bearDataset = JSON.parse(bearPlayers);
  const kvkDataset = JSON.parse(kvkPlayers);
  if (!Array.isArray(mapDataset.players) || mapDataset.players.length === 0) {
    throw new Error('Map dataset contains no players');
  }
  if (!Array.isArray(bearDataset.players) || bearDataset.players.length !== mapDataset.players.length) {
    throw new Error('Map and bear datasets have inconsistent player counts');
  }
  // The planner pool is only the TG7/TG8 subset of the kingdom, so it is
  // deliberately smaller than the roster rather than equal to it.
  if (!Array.isArray(kvkDataset.players) || kvkDataset.players.length === 0) {
    throw new Error('KvK dataset contains no rally candidates');
  }
  if (kvkDataset.players.length > mapDataset.players.length) {
    throw new Error('KvK dataset has more rally candidates than the roster has players');
  }
  console.log(
    `Mirrored map, bear, and KvK: ${mapDataset.players.length} players, ` +
      `${kvkDataset.players.length} rally candidates, ${artifactAssets.size} shared assets`,
  );
}

async function mirrorCalculator() {
  const documents = new Map();
  for (const document of ['index.html', '404.html', 'index.txt']) {
    documents.set(document, await fetchText(new URL(document, calculatorSource)));
  }
  if (!documents.get('index.html').includes('_next/static')) {
    throw new Error('Calculator source contains no Next.js assets');
  }

  const assetPaths = new Set();
  const assetPattern = new RegExp(`${calculatorSourceBase}/(_next/[A-Za-z0-9/._-]+)`, 'g');
  for (const content of documents.values()) {
    for (const match of content.matchAll(assetPattern)) assetPaths.add(match[1]);
  }

  const webpackPath = documents
    .get('index.html')
    .match(/_next\/static\/chunks\/webpack-[A-Za-z0-9]+\.js/)?.[0];
  if (!webpackPath) throw new Error('Calculator webpack runtime was not found');
  const webpack = await fetchText(new URL(webpackPath, calculatorSource));
  const chunkTable = webpack.match(/"static\/chunks\/"\+\w+\+"\."\+\(([^)]*)\)/)?.[1];
  if (!chunkTable) throw new Error('Calculator lazy chunk table was not found');
  for (const match of chunkTable.matchAll(/(\w+):"([0-9a-f]+)"/g)) {
    assetPaths.add(`_next/static/chunks/${match[1]}.${match[2]}.js`);
  }

  const downloaded = new Map();
  await Promise.all(
    [...assetPaths].map(async (assetPath) => {
      downloaded.set(assetPath, await fetchBuffer(new URL(assetPath, calculatorSource)));
    }),
  );

  const rebase = (content) =>
    content.toString().replaceAll(calculatorSourceBase, calculatorDestinationBase);
  for (const [document, content] of documents) {
    const rebased = document.endsWith('.html')
      ? injectCalculatorNavigation(rebase(content))
      : rebase(content);
    await writeOutput(`calculator/${document}`, rebased, `calculator ${document}`);
  }
  for (const [assetPath, content] of downloaded) {
    const isText = /\.(?:css|html|js|json|map|txt)$/.test(assetPath);
    await writeOutput(
      `calculator/${assetPath}`,
      isText ? rebase(content) : content,
      `calculator asset ${assetPath}`,
    );
  }

  console.log(`Mirrored calculator: ${assetPaths.size} assets rebased to ${calculatorDestinationBase}`);
}

function redirectPage(target) {
  const escaped = JSON.stringify(target);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=${target}">
    <link rel="canonical" href="${target}">
    <title>Redirecting…</title>
    <script>location.replace(${escaped} + location.search + location.hash)</script>
  </head>
  <body><p><a href="${target}">Continue</a></p></body>
</html>
`;
}

async function addCompatibilityRedirects() {
  await writeOutput('kingshot/map/index.html', redirectPage('/map/'), 'legacy map redirect');
  await writeOutput(
    'kingshot/troop-calculator/index.html',
    redirectPage('/calculator/'),
    'legacy calculator redirect',
  );
}

async function outputExists(relativePath) {
  try {
    const file = await stat(destination(relativePath));
    return file.isFile() && (relativePath === '.nojekyll' || file.size > 0);
  } catch {
    return false;
  }
}

async function validateOutput() {
  const required = [
    'index.html',
    'assets/styles.css',
    'assets/tool-navigation.js',
    'map/index.html',
    'map/players.json',
    'bear/index.html',
    'bear-players.json',
    'kvk/index.html',
    'kvk-players.json',
    'calculator/index.html',
    'calculator/404.html',
    'kingshot/map/index.html',
    'kingshot/troop-calculator/index.html',
  ];
  for (const requiredPath of required) {
    if (!(await outputExists(requiredPath))) throw new Error(`Missing required output ${requiredPath}`);
  }

  const legacyBases = [
    '/kingshot-discord-updates/',
    '/kingshot-bear-troop-calc',
    '/kingshot/troop-calculator/',
  ];
  for (const [relativePath] of writes) {
    if (!(await outputExists(relativePath))) {
      throw new Error(`Output ${relativePath} is missing or empty`);
    }
    if (!/\.(?:css|html|js|json|map|txt)$/.test(relativePath)) continue;
    const content = await readFile(destination(relativePath), 'utf8');
    if (
      !relativePath.startsWith('kingshot/') &&
      legacyBases.some((legacyBase) => content.includes(legacyBase))
    ) {
      throw new Error(`${relativePath} still references a legacy deployment base`);
    }
    if (!relativePath.endsWith('.html')) continue;
    for (const reference of localReferences(content)) {
      if (/^(?:[a-z]+:|\/\/|#|mailto:|tel:|data:)/i.test(reference)) continue;
      const pageUrl = new URL(`https://example.invalid/${relativePath}`);
      const resolved = new URL(reference, pageUrl);
      let target = decodeURIComponent(resolved.pathname).replace(/^\//, '');
      if (!target) target = 'index.html';
      if (target.endsWith('/')) target += 'index.html';
      if (!(await outputExists(target))) {
        throw new Error(`${relativePath} references missing local file ${resolved.pathname}`);
      }
    }

    if (relativePath.endsWith('.css')) {
      for (const match of content.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
        const reference = match[2];
        if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(reference)) continue;
        const stylesheetUrl = new URL(`https://example.invalid/${relativePath}`);
        const resolved = new URL(reference, stylesheetUrl);
        const target = decodeURIComponent(resolved.pathname).replace(/^\//, '');
        if (!(await outputExists(target))) {
          throw new Error(`${relativePath} references missing local file ${resolved.pathname}`);
        }
      }
    }

    for (const match of content.matchAll(/\/calculator\/(_next\/[A-Za-z0-9/._-]+)/g)) {
      const target = `calculator/${match[1]}`;
      if (!(await outputExists(target))) {
        throw new Error(`${relativePath} references missing calculator asset /${target}`);
      }
    }
  }
  console.log(`Validated ${writes.size} output files with no collisions or missing HTML references`);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await Promise.all([waitForExpectedMapVersion(), waitForExpectedCalculatorBuild()]);
await copyLaunchPad();
await mirrorKingshotPages();
await mirrorCalculator();
await addCompatibilityRedirects();
await validateOutput();
