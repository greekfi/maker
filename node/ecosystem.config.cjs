// NOTE: bebop and deribit share the same Bebop WebSocket connection.
// Only ONE pricing mode (bebop OR deribit) can run at a time.
// The relay and direct HTTP quote server can run alongside either mode.
//
// To switch pricing modes:
//   pm2 stop deribit && pm2 start bebop
//   pm2 stop bebop && pm2 start deribit

module.exports = {
  apps: [
    {
      name: "bebop",
      script: "dist/bebop.mjs",
      node_args: "--env-file-if-exists=.env",
      autorestart: true,
      autostart: false, // Start manually: pm2 start bebop
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      out_file: "logs/bebop-out.log",
      error_file: "logs/bebop-err.log",
      log_file: "logs/bebop.log",
    },
    {
      name: "deribit",
      script: "dist/deribit.mjs",
      node_args: "--env-file-if-exists=.env",
      autorestart: true,
      autostart: false, // Start manually: pm2 start deribit (legacy single-chain entry)
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      out_file: "logs/deribit-out.log",
      error_file: "logs/deribit-err.log",
      log_file: "logs/deribit.log",
    },
    {
      name: "relay",
      script: "dist/relay.mjs",
      node_args: "--env-file-if-exists=.env",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      out_file: "logs/relay-out.log",
      error_file: "logs/relay-err.log",
      log_file: "logs/relay.log",
    },
    {
      name: "direct",
      script: "dist/direct.mjs",
      node_args: "--env-file-if-exists=.env",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      out_file: "logs/direct-out.log",
      error_file: "logs/direct-err.log",
      log_file: "logs/direct.log",
    },
  ],
};
