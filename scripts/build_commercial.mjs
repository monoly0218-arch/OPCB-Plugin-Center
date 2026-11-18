import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';

const pluginPath = 'plugins/opcb.results-report/2.0.0-rc.14';
const icon = 'data:image/png;base64,' + (await readFile(pluginPath + '/icon.png')).toString('base64');
const workSyncApi = 'https://staging.paolab.cn/opcb-plugins/work-sync/api/v1';
const options = {
  define: {OPCB_REPORT_ICON: JSON.stringify(icon), OPCB_WORK_SYNC_API: JSON.stringify(workSyncApi)},
  entryPoints: ['src/commercial/plugin.mjs'],
  outfile: pluginPath + '/plugin.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'eof',
  loader: {'.py': 'text', '.css': 'text', '.html': 'text', '.jpg': 'dataurl'}
};

if (process.argv.includes('--check')) {
  const result = await build({...options, write: false});
  for (const file of result.outputFiles) {
    if (await readFile(file.path, 'utf8') !== file.text) throw Error('Stale commercial bundle');
  }
} else {
  await build(options);
}
