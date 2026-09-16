import app from './app.js';
import connectDB from './config/db.config.js';
import env from './config/env.config.js';
import seedAdmin from './seeders/seedAdmin.js';

const startServer = async () => {
  try {
    await connectDB();
    await seedAdmin();
    app.listen(env.PORT, () => {
      console.log(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
};

startServer();
