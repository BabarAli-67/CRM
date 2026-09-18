import http from 'node:http';
import cron from 'node-cron';
import app from './app.js';
import connectDB from './config/db.config.js';
import env from './config/env.config.js';
import seedAdmin from './seeders/seedAdmin.js';
import runAutoCheckoutSweep from './jobs/autoCheckout.job.js';
import initSocketServer from './sockets/socket.server.js';

const startServer = async () => {
  try {
    await connectDB();
    await seedAdmin();

    const httpServer = http.createServer(app);
    initSocketServer(httpServer);

    httpServer.listen(env.PORT, () => {
      console.log(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);

      cron.schedule('*/30 * * * * *', async () => {
        try {
          await runAutoCheckoutSweep();
        } catch (error) {
          console.error('Auto-checkout sweep failed:', error);
        }
      });
    });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
};

startServer();
