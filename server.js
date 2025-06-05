const app = require('./app');
const dotenv = require('dotenv');
const { setupDatabase } = require('./model/setup');

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await setupDatabase();
    

    const server = app.listen(PORT, () => {
      console.log(`Server running on PORT ${PORT} in ${process.env.NODE_ENV} mode`);
    });

    // Handle unhandled promise rejection
    process.on("unhandledRejection", (err) => {
      console.log(`Error: ${err.message}`);
      console.log('Shutting down due to unhandled promise rejection');
      server.close(() => process.exit(1));
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (err) => {
      console.log(`Error: ${err.message}`);
      console.log('Shutting down due to uncaught exception');
      process.exit(1);
    });

  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

startServer();