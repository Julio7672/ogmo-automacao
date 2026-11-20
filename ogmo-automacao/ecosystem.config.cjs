module.exports = {
  apps: [{
    name: 'ogmo-automacao',
    script: './node_modules/tsx/dist/cli.mjs',
    args: 'src/index.ts',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 20,
    time: true
  }]
}
