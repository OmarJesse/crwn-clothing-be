import Category from "./Category";
import Product from "./Product";

Category.hasMany(Product, {
  foreignKey: "categoryId",
  as: "products",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

Product.belongsTo(Category, {
  foreignKey: "categoryId",
  as: "category",
});
