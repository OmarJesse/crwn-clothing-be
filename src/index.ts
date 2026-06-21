import express from "express";
import sequelize from "./models/sequelize";
import "./models";
import userRoutes from "./routes/userRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import productRoutes from "./routes/productRoutes";
import insightsRoutes from "./routes/insightsRoutes";
import errorHandler from "./middlewares/errorHandler";
import dotenv from "dotenv";
import cors from "cors";
import { Op } from "sequelize";
import { categories, products } from "./seed-data";
import Category from "./models/Category";
import Product from "./models/Product";

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
app.use(insightsRoutes);

// Error handling middleware
app.use(errorHandler);

const isDemoImageUrl = {
  [Op.or]: [
    { imageUrl: null },
    { imageUrl: { [Op.iLike]: "%picsum.photos/%" } },
    { imageUrl: { [Op.iLike]: "%loremflickr.com/%" } },
    { imageUrl: { [Op.iLike]: "%images.unsplash.com/%" } },
  ],
};

const seedDatabase = async () => {
  await Category.bulkCreate(categories, {
    ignoreDuplicates: true,
  });

  await Product.bulkCreate(products, {
    ignoreDuplicates: true,
  });

  await Promise.all(
    categories.map((category) =>
      Category.update(
        { imageUrl: category.imageUrl },
        {
          where: {
            id: category.id,
            ...isDemoImageUrl,
          },
        }
      )
    )
  );

  await Promise.all(
    products.map((product) =>
      Product.update(
        { imageUrl: product.imageUrl },
        {
          where: {
            id: product.id,
            ...isDemoImageUrl,
          },
        }
      )
    )
  );
};

// Sync Sequelize models and start server
sequelize
  .authenticate()
  .then(() => sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
  .then(() => sequelize.sync({ alter: true }))
  .then(() => seedDatabase())
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Unable to connect to the database:", error);
  });
