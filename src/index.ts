import express from "express";
import sequelize from "./models/sequelize";
import "./models";
import userRoutes from "./routes/userRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import productRoutes from "./routes/productRoutes";
import errorHandler from "./middlewares/errorHandler";
import dotenv from "dotenv";
import cors from "cors";
// import { categories, products } from "./seed-data";

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: process.env.appOrigin, // Replace with your React app's URL
  })
); // Enable CORS for all routes

// Middleware
app.use(express.json());

// Routes
app.use(userRoutes);
app.use(categoryRoutes);
app.use(productRoutes);

// Error handling middleware
app.use(errorHandler);

// Sync Sequelize models and start server
sequelize
  .authenticate()
  .then(() => sequelize.sync({ alter: true })) // Sync models, drop the table if exists
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Unable to connect to the database:", error);
  });

// const queryInterface = sequelize.getQueryInterface();
// queryInterface.bulkInsert("categories", categories);
// queryInterface.bulkInsert("products", products);
