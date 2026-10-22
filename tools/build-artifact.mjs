// Gera dist-artifact/rogueracer.html: um arquivo único (JS embutido) para publicar como Artifact.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const jsFile = readdirSync('dist/assets').find((f) => f.endsWith('.js'));
const js = readFileSync(`dist/assets/${jsFile}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/rogueracer.html', `${head.trim()}\n${body.trim()}\n<script>\n${js}\n</script>\n`);
writeFileSync('jogar.html', `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n${head.trim()}\n</head>\n<body>\n${body.trim()}\n<script>\n${js}\n</script>\n</body>\n</html>\n`);
console.log('ok', jsFile);
