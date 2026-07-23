module.exports = {
  apps: [
    {
      name: "antcp-hubon",
      script: "dist/server.cjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,

      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    }
  ]
};
